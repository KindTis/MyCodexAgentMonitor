import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import {
  classifyChildSource,
  discoverChildCandidates,
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
  #childCandidates = new Map();
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
    discoverChildren = discoverChildCandidates,
  }) {
    this.appServer = appServer;
    this.tailer = tailer;
    this.codexHome = codexHome;
    this.now = now;
    this.readRepoMetadata = readRepoMetadata;
    this.discoverChildren = discoverChildren;
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
    const childBoundary = this.#catalogWatermark == null ? 0 : boundary;
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
    const childCandidates = new Map(
      [...this.#childCandidates].map(([id, candidate]) => [id, structuredClone(candidate)]),
    );
    let appServerFailed = false;
    let catalogSucceeded = true;

    this.tailer.beginBatch();
    try {
      let discoveredRoots = [];
      try {
        discoveredRoots = await this.#listCatalog({
          boundary,
          sourceKinds: ROOT_SOURCE_KINDS,
        });
      } catch {
        appServerFailed = true;
        catalogSucceeded = false;
      }
      const discoveredRootIds = new Set(discoveredRoots.map(({ id }) => id));
      const rootIds = new Set([...registeredRoots, ...discoveredRootIds]);

      for (const rootId of rootIds) {
        let root;
        try {
          root = await this.#readThread(rootId);
        } catch {
          appServerFailed = true;
          root = threads.get(rootId) ?? null;
        }
        if (!root) continue;
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
        try {
          goals.set(rootId, await this.#readGoal(rootId));
        } catch {
          appServerFailed = true;
        }
      }

      let discoveredFromJsonl;
      try {
        discoveredFromJsonl = await this.discoverChildren({
          codexHome: this.codexHome,
          parentThreadIds: [...registeredRoots],
          updatedAfterMs: childBoundary * 1000,
        });
      } catch (error) {
        throw new SessionReadFailure({ cause: error });
      }

      for (const rootId of registeredRoots) {
        let discoveredChildren = [];
        try {
          discoveredChildren = await this.#listCatalog({
            boundary: childBoundary,
            sourceKinds: CHILD_SOURCE_KINDS,
            ancestorThreadId: rootId,
          });
        } catch {
          appServerFailed = true;
          catalogSucceeded = false;
        }
        const children = registeredChildren.get(rootId) ?? new Set();
        const candidatesById = new Map(
          [...childCandidates]
            .filter(([, { thread }]) => thread.parentThreadId === rootId),
        );
        for (const childId of children) {
          if (!candidatesById.has(childId) && threads.has(childId)) {
            candidatesById.set(childId, {
              thread: threads.get(childId),
              spawnObserved: false,
            });
          }
        }
        for (const item of discoveredChildren) {
          const current = candidatesById.get(item.id);
          candidatesById.set(item.id, {
            thread: {
              ...current?.thread,
              ...item,
              path: item.path ?? current?.thread.path ?? null,
              parentThreadId: item.parentThreadId ?? current?.thread.parentThreadId ?? rootId,
              source: item.source ?? current?.thread.source ?? "unknown",
            },
            spawnObserved: current?.spawnObserved ?? false,
          });
        }
        for (const item of discoveredFromJsonl.filter(
          ({ parentThreadId }) => parentThreadId === rootId,
        )) {
          const current = candidatesById.get(item.id);
          candidatesById.set(item.id, {
            thread: {
              ...item,
              ...current?.thread,
              path: current?.thread.path ?? item.path,
              parentThreadId: current?.thread.parentThreadId ?? item.parentThreadId,
              source: current?.thread.source ?? item.source,
            },
            spawnObserved: true,
          });
        }

        for (const [childId, candidate] of candidatesById) {
          const sourceKind = classifyChildSource(candidate.thread.source);
          if (sourceKind === "guardian") {
            childCandidates.delete(childId);
            for (const ids of registeredChildren.values()) ids.delete(childId);
            threads.delete(childId);
            observations.delete(childId);
            goals.delete(childId);
            continue;
          }
          childCandidates.set(childId, candidate);
          if (sourceKind === "unknown") {
            children.delete(childId);
            continue;
          }

          let child;
          try {
            child = await this.#readThread(childId);
          } catch {
            appServerFailed = true;
            child = threads.get(childId) ?? null;
          }
          if (!child) {
            if (!candidate.spawnObserved) continue;
            children.add(childId);
            threads.set(childId, candidate.thread);
            observations.set(
              childId,
              createFallbackChildObservation(candidate.thread, nowMs),
            );
            goals.delete(childId);
            continue;
          }
          child = {
            ...candidate.thread,
            ...child,
            path: child.path ?? candidate.thread.path,
            parentThreadId: child.parentThreadId ?? candidate.thread.parentThreadId,
            source: child.source ?? candidate.thread.source,
          };
          const observation = await this.#readObservation(
            observations.get(childId),
            child,
            nowMs,
          );
          children.add(childId);
          threads.set(childId, child);
          observations.set(childId, observation);
          try {
            goals.set(childId, await this.#readGoal(childId));
          } catch {
            appServerFailed = true;
          }
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
        lastSuccessfulAt: appServerFailed
          ? this.#snapshot.lastSuccessfulAt
          : collectedAt,
        connectionStatus: appServerFailed ? "error" : "connected",
        errorCode: appServerFailed ? "APP_SERVER_UNAVAILABLE" : null,
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
      this.#childCandidates = childCandidates;
      if (catalogSucceeded) this.#catalogWatermark = candidateWatermark;
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

function createFallbackChildObservation(thread, nowMs) {
  const startedAt = toIso(thread.createdAt);
  const startedMs = Date.parse(startedAt);
  const status = Number.isFinite(startedMs) && nowMs - startedMs >= IDLE_AFTER_MS
    ? "idle"
    : "running";
  return {
    turnId: null,
    assignedWork: "",
    skills: [],
    plan: null,
    tokens: null,
    status,
    statusBasis: "inferred",
    currentActivity: null,
    lastActivityAt: startedAt,
    lastObservedAt: null,
    startedAt,
    endedAt: null,
    durationSeconds: 0,
    activity: [],
    pendingCalls: {},
    terminalStatus: null,
    terminalStatusBasis: null,
    workingMilliseconds: 0,
    workingSince: null,
    workingPauseCalls: {},
    workingRecordKeys: {},
    sawTaskStarted: false,
    isWorking: false,
  };
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
      const childTokens = childItems.reduce(
        (sum, child) => sum + (Number.isFinite(child.tokens) ? child.tokens : 0),
        0,
      );
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
        statusBasis: observation.statusBasis,
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
    model: observation.model,
    status: observation.status,
    statusBasis: observation.statusBasis,
    isWorking: observation.isWorking,
    currentActivity: cloneOrNull(observation.currentActivity),
    lastActivityAt: observation.lastActivityAt,
    startedAt: observation.startedAt,
    endedAt: observation.endedAt,
    durationSeconds: observation.durationSeconds,
    tokens: Number.isFinite(observation.tokens) ? observation.tokens : null,
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
