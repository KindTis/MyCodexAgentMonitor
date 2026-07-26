import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import {
  IDLE_AFTER_MS,
  reduceThreadRecords,
} from "./session-log.mjs";

const execFileAsync = promisify(execFile);

export const COLLECTION_INTERVAL_MS = 3000;
export const THREAD_PAGE_SIZE = 100;
export const ROOT_SOURCE_KINDS = ["cli", "vscode", "exec", "appServer", "unknown"];
export const CHILD_SOURCE_KINDS = [
  "subAgent",
  "subAgentReview",
  "subAgentCompact",
  "subAgentThreadSpawn",
  "subAgentOther",
];

const TERMINAL_STATUSES = new Set(["complete", "failed", "cancelled", "stopped"]);

class SessionReadFailure extends Error {}

export class SnapshotStore {
  #registeredRoots = new Set();
  #registeredChildren = new Map();
  #observations = new Map();
  #threads = new Map();
  #goals = new Map();
  #catalogWatermark = null;
  #snapshot = {
    collectedAt: null,
    lastSuccessfulAt: null,
    connectionStatus: "syncing",
    errorCode: null,
    sessions: [],
  };

  constructor({
    appServer,
    tailer,
    codexHome,
    now = Date.now,
    readRepoMetadata = getRepoMetadata,
  }) {
    this.appServer = appServer;
    this.tailer = tailer;
    this.codexHome = codexHome;
    this.now = now;
    this.readRepoMetadata = readRepoMetadata;
    this.monitorStartedAt = now();
  }

  get snapshot() {
    return structuredClone(this.#snapshot);
  }

  initialize() {
    return this.#refresh({ initial: true });
  }

  collect() {
    return this.#refresh({ initial: false });
  }

  markError(errorCode) {
    this.#snapshot = {
      ...this.#snapshot,
      collectedAt: new Date(this.now()).toISOString(),
      connectionStatus: "error",
      errorCode,
    };
    return this.snapshot;
  }

  async #refresh({ initial }) {
    const nowMs = this.now();
    const candidateWatermark = Math.floor(nowMs / 1000);
    const boundary = initial || this.#catalogWatermark == null
      ? Math.floor((this.monitorStartedAt - IDLE_AFTER_MS) / 1000)
      : this.#catalogWatermark;
    const registeredRoots = new Set(this.#registeredRoots);
    const registeredChildren = new Map(
      [...this.#registeredChildren].map(([rootId, ids]) => [rootId, new Set(ids)]),
    );
    const observations = new Map(
      [...this.#observations].map(([id, observation]) => [id, structuredClone(observation)]),
    );
    const threads = new Map(
      [...this.#threads].map(([id, item]) => [id, structuredClone(item)]),
    );
    const goals = new Map(
      [...this.#goals].map(([id, goal]) => [id, structuredClone(goal)]),
    );

    this.tailer.beginBatch();
    try {
      const discoveredRoots = await this.#listCatalog({
        boundary,
        sourceKinds: ROOT_SOURCE_KINDS,
      });
      const discoveredRootIds = new Set(discoveredRoots.map(({ id }) => id));
      const rootIds = new Set([...registeredRoots, ...discoveredRootIds]);

      for (const rootId of rootIds) {
        const root = await this.#readThread(rootId);
        const observation = await this.#readObservation(
          observations.get(rootId),
          root,
          nowMs,
        );
        const isRegistered = registeredRoots.has(rootId)
          || this.#canRegister(root, observation, initial);
        if (!isRegistered) continue;

        registeredRoots.add(rootId);
        threads.set(rootId, root);
        observations.set(rootId, observation);
        goals.set(rootId, await this.#readGoal(rootId));
      }

      for (const rootId of registeredRoots) {
        const discoveredChildren = await this.#listCatalog({
          boundary,
          sourceKinds: CHILD_SOURCE_KINDS,
          ancestorThreadId: rootId,
        });
        const children = registeredChildren.get(rootId) ?? new Set();
        const childIds = new Set([
          ...children,
          ...discoveredChildren.map(({ id }) => id),
        ]);

        for (const childId of childIds) {
          const child = await this.#readThread(childId);
          const observation = await this.#readObservation(
            observations.get(childId),
            child,
            nowMs,
          );
          const isRegistered = children.has(childId)
            || this.#canRegister(child, observation, initial);
          if (!isRegistered) continue;

          children.add(childId);
          threads.set(childId, child);
          observations.set(childId, observation);
          goals.set(childId, await this.#readGoal(childId));
        }
        registeredChildren.set(rootId, children);
      }

      const collectedAt = new Date(nowMs).toISOString();
      const cwdList = [...new Set(
        [...registeredRoots]
          .map((rootId) => threads.get(rootId)?.cwd)
          .filter(Boolean),
      )];
      const repoMetadata = new Map(await Promise.all(
        cwdList.map(async (cwd) => [cwd, await this.readRepoMetadata(cwd)]),
      ));
      const snapshot = {
        collectedAt,
        lastSuccessfulAt: collectedAt,
        connectionStatus: "connected",
        errorCode: null,
        sessions: buildSessions({
          registeredRoots,
          registeredChildren,
          observations,
          threads,
          goals,
          repoMetadata,
        }),
      };

      this.#registeredRoots = registeredRoots;
      this.#registeredChildren = registeredChildren;
      this.#observations = observations;
      this.#threads = threads;
      this.#goals = goals;
      this.#catalogWatermark = candidateWatermark;
      this.#snapshot = snapshot;
      this.tailer.commitBatch();
      return this.snapshot;
    } catch (error) {
      this.tailer.discardBatch();
      return this.markError(
        error instanceof SessionReadFailure
          ? "SESSION_READ_FAILED"
          : "APP_SERVER_UNAVAILABLE",
      );
    }
  }

  async #listCatalog({ boundary, sourceKinds, ancestorThreadId }) {
    const found = [];
    let cursor = null;
    let reachedBoundary = false;

    do {
      const response = await this.appServer.listThreads({
        ...(ancestorThreadId ? { ancestorThreadId } : {}),
        cursor,
        sortKey: "updated_at",
        sortDirection: "desc",
        limit: THREAD_PAGE_SIZE,
        sourceKinds,
      });
      for (const item of response.data ?? []) {
        if (item.updatedAt < boundary) {
          reachedBoundary = true;
          break;
        }
        found.push(item);
      }
      cursor = response.nextCursor ?? null;
    } while (cursor && !reachedBoundary);

    return found;
  }

  async #readThread(threadId) {
    const response = await this.appServer.readThread(threadId);
    const thread = response?.thread ?? response;
    if (!thread?.id) throw new Error("Thread read returned no thread");
    return thread;
  }

  async #readGoal(threadId) {
    const response = await this.appServer.getGoal(threadId);
    if (!response || !Object.hasOwn(response, "goal")) {
      throw new Error("Goal read returned no goal field");
    }
    return response.goal;
  }

  async #readObservation(previous, thread, nowMs) {
    try {
      const records = thread.path == null ? [] : await this.tailer.read(thread.path);
      return reduceThreadRecords(previous ?? null, records, thread, nowMs);
    } catch (error) {
      throw new SessionReadFailure({ cause: error });
    }
  }

  #canRegister(thread, observation, initial) {
    const latestTurn = thread.turns?.at(-1);
    const startEvidence = [
      epochSecondsToMs(thread.createdAt),
      epochSecondsToMs(latestTurn?.startedAt),
      Date.parse(observation.startedAt),
    ].filter(Number.isFinite);
    if (startEvidence.some((value) => value >= this.monitorStartedAt)) return true;
    if (!initial) return false;

    return (
      epochSecondsToMs(thread.updatedAt) > this.monitorStartedAt - IDLE_AFTER_MS
      && !TERMINAL_STATUSES.has(observation.status)
    );
  }
}

function buildSessions({
  registeredRoots,
  registeredChildren,
  observations,
  threads,
  goals,
  repoMetadata,
}) {
  return [...registeredRoots]
    .map((rootId) => {
      const childItems = [...(registeredChildren.get(rootId) ?? [])]
        .map((childId) => buildChild(
          threads.get(childId),
          observations.get(childId),
          goals.get(childId),
          rootId,
        ))
        .filter(Boolean)
        .sort(compareLastActivity);
      const root = threads.get(rootId);
      const observation = observations.get(rootId);
      if (!root || !observation) return null;

      const rootTokens = observation.tokens ?? 0;
      const childTokens = childItems.reduce((sum, child) => sum + child.tokens, 0);
      const metadata = repoMetadata.get(root.cwd);
      return {
        id: root.id,
        parentSessionId: null,
        threadId: root.id,
        session: root.name ?? root.id.slice(0, 8),
        cwd: root.cwd,
        projectName: metadata?.projectName ?? "Unknown project",
        gitBranch: metadata?.gitBranch ?? "No Git branch",
        assignedWork: observation.assignedWork,
        status: observation.status,
        isWorking: observation.isWorking,
        currentActivity: cloneOrNull(observation.currentActivity),
        lastActivityAt: observation.lastActivityAt,
        startedAt: observation.startedAt,
        endedAt: observation.endedAt,
        durationSeconds: observation.durationSeconds,
        currentWork: buildCurrentWork(observation),
        tokens: {
          root: rootTokens,
          children: childTokens,
          total: rootTokens + childTokens,
        },
        skills: [...observation.skills],
        plan: cloneOrNull(observation.plan),
        goal: normalizeGoal(goals.get(rootId)),
        children: childItems,
        activity: structuredClone(observation.activity),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (
      (Date.parse(b.lastActivityAt) || 0) - (Date.parse(a.lastActivityAt) || 0)
      || a.id.localeCompare(b.id)
    ));
}

async function getRepoMetadata(cwd) {
  const projectName = path.basename(path.resolve(cwd)) || "Unknown project";
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"],
      { timeout: 2000, windowsHide: true },
    );
    const branch = stdout.trim();
    return {
      projectName,
      gitBranch: branch === "HEAD" ? "Detached HEAD" : branch || "No Git branch",
    };
  } catch {
    return { projectName, gitBranch: "No Git branch" };
  }
}

function buildChild(thread, observation, goal, rootId) {
  if (!thread || !observation) return null;
  return {
    id: thread.id,
    threadId: thread.id,
    parentSessionId: rootId,
    agentNickname: thread.agentNickname,
    agentRole: thread.agentRole,
    status: observation.status,
    isWorking: observation.isWorking,
    currentActivity: cloneOrNull(observation.currentActivity),
    lastActivityAt: observation.lastActivityAt,
    startedAt: observation.startedAt,
    endedAt: observation.endedAt,
    durationSeconds: observation.durationSeconds,
    tokens: observation.tokens ?? 0,
    skills: [...observation.skills],
    plan: cloneOrNull(observation.plan),
    goal: normalizeGoal(goal),
    currentWork: buildCurrentWork(observation),
    activity: structuredClone(observation.activity),
  };
}

function buildCurrentWork(observation) {
  return observation.turnId
    ? { turnId: observation.turnId, title: observation.assignedWork }
    : null;
}

function normalizeGoal(goal) {
  if (!goal) return null;
  return {
    objective: goal.objective,
    status: goal.status,
    tokenBudget: goal.tokenBudget ?? null,
    tokensUsed: goal.tokensUsed,
    timeUsedSeconds: goal.timeUsedSeconds,
    createdAt: toIso(goal.createdAt),
    updatedAt: toIso(goal.updatedAt),
  };
}

function toIso(value) {
  if (value == null) return null;
  const time = typeof value === "number" ? value * 1000 : Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function epochSecondsToMs(value) {
  return Number.isFinite(value) ? value * 1000 : Number.NaN;
}

function compareLastActivity(a, b) {
  return (
    (Date.parse(b.lastActivityAt) || 0) - (Date.parse(a.lastActivityAt) || 0)
    || a.id.localeCompare(b.id)
  );
}

function cloneOrNull(value) {
  return value == null ? null : structuredClone(value);
}
