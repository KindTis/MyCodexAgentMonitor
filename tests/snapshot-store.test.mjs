import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  appendFile,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";

import { JsonlTailer } from "../monitor/session-log.mjs";
import {
  CHILD_SOURCE_KINDS,
  ROOT_SOURCE_KINDS,
  SnapshotStore,
  THREAD_PAGE_SIZE,
} from "../monitor/snapshot-store.mjs";

const unix = (value) => Date.parse(value) / 1000;

function sessionEvent(timestamp, type, extra = {}) {
  return { timestamp, type: "event_msg", payload: { type, ...extra } };
}

function thread(id, overrides = {}) {
  const turnId = overrides.turnId ?? `${id}-turn`;
  return {
    id,
    sessionId: id,
    parentThreadId: null,
    preview: "",
    createdAt: unix("2026-07-26T05:50:00Z"),
    updatedAt: unix("2026-07-26T05:59:00Z"),
    status: { type: "notLoaded" },
    path: `C:\\Users\\dev\\.codex\\sessions\\${id}.jsonl`,
    cwd: "C:\\repo",
    source: "cli",
    agentNickname: null,
    agentRole: null,
    name: null,
    turns: [{
      id: turnId,
      items: [],
      status: "inProgress",
      startedAt: unix("2026-07-26T05:59:00Z"),
      completedAt: null,
      durationMs: null,
    }],
    ...overrides,
  };
}

function createFakeCatalog(initialThreads = []) {
  const threads = [...initialThreads];
  const goals = new Map();
  const failingReads = new Set();
  const listCalls = [];
  const readCalls = [];
  let failList = false;
  let failGoal = false;

  function isDescendant(item, ancestorId) {
    let parentId = item.parentThreadId;
    while (parentId) {
      if (parentId === ancestorId) return true;
      parentId = threads.find(({ id }) => id === parentId)?.parentThreadId ?? null;
    }
    return false;
  }

  return {
    listCalls,
    readCalls,
    addThread(item) {
      threads.push(item);
    },
    updateThread(id, patch) {
      Object.assign(threads.find((item) => item.id === id), patch);
    },
    setGoal(id, goal) {
      goals.set(id, goal);
    },
    setFailList(value) {
      failList = value;
    },
    setFailRead(id, value = true) {
      if (value) failingReads.add(id);
      else failingReads.delete(id);
    },
    setFailGoal(value) {
      failGoal = value;
    },
    async listThreads(params = {}) {
      listCalls.push(structuredClone(params));
      if (failList) throw new Error("catalog unavailable");
      const sourceFiltered = params.sourceKinds?.length
        ? threads.filter((item) => params.sourceKinds.includes(item.source))
        : threads;
      const data = params.ancestorThreadId
        ? sourceFiltered.filter((item) => isDescendant(item, params.ancestorThreadId))
        : sourceFiltered.filter((item) => item.parentThreadId == null);
      const sorted = [...data].sort(
        (a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id),
      );
      const start = Number(params.cursor ?? 0);
      const end = Math.min(start + (params.limit ?? sorted.length), sorted.length);
      return {
        data: sorted.slice(start, end),
        nextCursor: end < sorted.length ? String(end) : null,
        backwardsCursor: null,
      };
    },
    async readThread(threadId) {
      readCalls.push(threadId);
      if (failingReads.has(threadId)) throw new Error("thread unavailable");
      return { thread: structuredClone(threads.find(({ id }) => id === threadId)) };
    },
    async getGoal(threadId) {
      if (failGoal) throw new Error("goal unavailable");
      return { goal: structuredClone(goals.get(threadId) ?? null) };
    },
  };
}

function createStoreHarness({
  threads,
  initialRecords = {},
  startedAt,
  discoveredChildren = [],
  discoverChildren = async () => structuredClone(discoveredChildren),
  readRepoMetadata = async (cwd) => ({
    projectName: path.win32.basename(cwd),
    gitBranch: "main",
  }),
}) {
  let nowMs = Date.parse(startedAt);
  let records = new Map(
    Object.entries(initialRecords).map(([threadId, items]) => [
      `C:\\Users\\dev\\.codex\\sessions\\${threadId}.jsonl`,
      [...items],
    ]),
  );
  let candidateRecords = null;
  const failingPaths = new Set();
  const appServer = createFakeCatalog(threads);
  const tailer = {
    beginBatch() {
      if (candidateRecords) throw new Error("batch already active");
      candidateRecords = new Map(
        [...records].map(([filePath, items]) => [filePath, [...items]]),
      );
    },
    async read(filePath) {
      if (!candidateRecords) throw new Error("batch is not active");
      if (failingPaths.has(filePath)) throw new Error("session read failed");
      const queued = candidateRecords.get(filePath) ?? [];
      candidateRecords.set(filePath, []);
      return queued;
    },
    commitBatch() {
      if (!candidateRecords) throw new Error("batch is not active");
      records = candidateRecords;
      candidateRecords = null;
    },
    discardBatch() {
      candidateRecords = null;
    },
  };
  const store = new SnapshotStore({
    appServer,
    tailer,
    codexHome: "C:\\Users\\dev\\.codex",
    now: () => nowMs,
    readRepoMetadata,
    discoverChildren,
  });

  return {
    appServer,
    store,
    addThread(item) {
      appServer.addThread(item);
    },
    updateThread(id, patch) {
      appServer.updateThread(id, patch);
    },
    setNow(value) {
      nowMs = Date.parse(value);
    },
    appendRecord(threadId, record) {
      const filePath = `C:\\Users\\dev\\.codex\\sessions\\${threadId}.jsonl`;
      records.set(filePath, [...(records.get(filePath) ?? []), record]);
    },
    failRead(threadId, value = true) {
      const filePath = `C:\\Users\\dev\\.codex\\sessions\\${threadId}.jsonl`;
      if (value) failingPaths.add(filePath);
      else failingPaths.delete(filePath);
    },
  };
}

test("catalog와 thread_spawn child를 합치고 fallback만 inferred로 표시한다", async () => {
  const root = thread("root", { updatedAt: unix("2026-07-26T06:00:00Z") });
  const duplicate = thread("duplicate", {
    parentThreadId: "root",
    source: "subAgentThreadSpawn",
    createdAt: unix("2026-07-26T06:00:01Z"),
    updatedAt: unix("2026-07-26T06:00:02Z"),
    agentNickname: "Catalog child",
  });
  const candidate = (id, source, createdAt = "2026-07-26T06:00:01Z") => thread(id, {
    parentThreadId: "root",
    source,
    createdAt: unix(createdAt),
    updatedAt: unix(createdAt),
    path: `C:\\Users\\dev\\.codex\\sessions\\${id}.jsonl`,
    turns: [],
  });
  const harness = createStoreHarness({
    threads: [root, duplicate],
    startedAt: "2026-07-26T06:00:00Z",
    initialRecords: {
      root: [sessionEvent("2026-07-26T06:00:00Z", "task_started", {
        turn_id: "root-turn",
      })],
      duplicate: [sessionEvent("2026-07-26T06:00:01Z", "task_started", {
        turn_id: "duplicate-turn",
      }), {
        timestamp: "2026-07-26T06:00:01.500Z",
        type: "turn_context",
        payload: { turn_id: "duplicate-turn", model: "gpt-5.6-sol" },
      }],
    },
    discoveredChildren: [
      candidate("duplicate", {
        subagent: { thread_spawn: { parent_thread_id: "root" } },
      }),
      candidate("spawn-only", {
        subagent: { thread_spawn: { parent_thread_id: "root" } },
      }),
      candidate("guardian", { subagent: { other: "guardian" } }),
      candidate("unknown", { subagent: { other: "future-kind" } }),
    ],
  });

  const snapshot = await harness.store.initialize();
  const children = snapshot.sessions[0].children;
  assert.deepEqual(children.map(({ id }) => id).sort(), ["duplicate", "spawn-only"]);
  assert.equal(children.filter(({ id }) => id === "duplicate").length, 1);
  assert.equal(children.find(({ id }) => id === "duplicate").model, "gpt-5.6-sol");
  const fallback = children.find(({ id }) => id === "spawn-only");
  assert.equal(fallback.agentNickname, null);
  assert.equal(fallback.currentWork, null);
  assert.equal(fallback.currentActivity, null);
  assert.deepEqual(fallback.activity, []);
  assert.deepEqual(fallback.skills, []);
  assert.equal(fallback.plan, null);
  assert.equal(fallback.goal, null);
  assert.equal(fallback.status, "running");
  assert.equal(fallback.statusBasis, "inferred");
  assert.equal(fallback.isWorking, false);
  assert.equal(fallback.tokens, null);
});

test("JSONL-only child를 같은 ID의 상세 정보로 갱신한다", async () => {
  const spawnSource = {
    subagent: { thread_spawn: { parent_thread_id: "root" } },
  };
  const spawnOnly = thread("spawn-only", {
    parentThreadId: "root",
    source: spawnSource,
    createdAt: unix("2026-07-26T06:00:01Z"),
    updatedAt: unix("2026-07-26T06:00:01Z"),
    turns: [],
  });
  const harness = createStoreHarness({
    threads: [thread("root")],
    startedAt: "2026-07-26T06:00:00Z",
    initialRecords: {
      root: [sessionEvent("2026-07-26T06:00:00Z", "task_started", {
        turn_id: "root-turn",
      })],
    },
    discoveredChildren: [spawnOnly],
  });
  let snapshot = await harness.store.initialize();
  assert.equal(snapshot.sessions[0].children[0].statusBasis, "inferred");

  harness.addThread(thread("spawn-only", {
    parentThreadId: "root",
    source: "subAgentThreadSpawn",
    createdAt: unix("2026-07-26T06:00:01Z"),
    updatedAt: unix("2026-07-26T06:00:03Z"),
    agentNickname: "Recovered",
  }));
  harness.appendRecord("spawn-only", sessionEvent(
    "2026-07-26T06:00:03Z",
    "task_started",
    { turn_id: "spawn-only-turn" },
  ));
  snapshot = await harness.store.collect();
  assert.equal(snapshot.sessions[0].children[0].agentNickname, "Recovered");
  assert.equal(snapshot.sessions[0].children[0].statusBasis, "observed");
});

test("모니터 재시작 뒤에도 등록된 root의 이전 child를 복구한다", async () => {
  const oldJsonlChild = thread("old-jsonl-child", {
    parentThreadId: "root",
    source: {
      subagent: { thread_spawn: { parent_thread_id: "root" } },
    },
    createdAt: unix("2026-07-26T05:40:00Z"),
    updatedAt: unix("2026-07-26T05:41:00Z"),
    turns: [],
  });
  const harness = createStoreHarness({
    threads: [
      thread("root", { updatedAt: unix("2026-07-26T05:59:30Z") }),
      thread("old-catalog-child", {
        parentThreadId: "root",
        source: "subAgentThreadSpawn",
        createdAt: unix("2026-07-26T05:40:00Z"),
        updatedAt: unix("2026-07-26T05:41:00Z"),
      }),
    ],
    startedAt: "2026-07-26T06:00:00Z",
    initialRecords: {
      root: [sessionEvent("2026-07-26T05:59:30Z", "task_started", {
        turn_id: "root-turn",
      })],
    },
    discoverChildren: async ({ updatedAfterMs }) => (
      updatedAfterMs <= oldJsonlChild.updatedAt * 1000
        ? [structuredClone(oldJsonlChild)]
        : []
    ),
  });

  const snapshot = await harness.store.initialize();

  assert.deepEqual(
    snapshot.sessions[0].children.map(({ id }) => id).sort(),
    ["old-catalog-child", "old-jsonl-child"],
  );
});

test("App Server 장애 중 cached catalog와 새 JSONL 상태를 적용한다", async () => {
  const harness = createStoreHarness({
    threads: [thread("root")],
    startedAt: "2026-07-26T06:00:00Z",
    initialRecords: {
      root: [
        sessionEvent("2026-07-26T06:00:00Z", "task_started", {
          turn_id: "root-turn",
        }),
      ],
    },
  });
  const initial = await harness.store.initialize();
  harness.appendRecord("root", sessionEvent("2026-07-26T06:00:02Z", "token_count", {
    info: { total_token_usage: { total_tokens: 42 } },
  }));
  harness.appServer.setFailList(true);
  harness.appServer.setFailRead("root");

  const errorSnapshot = await harness.store.collect();
  assert.equal(errorSnapshot.connectionStatus, "error");
  assert.equal(errorSnapshot.errorCode, "APP_SERVER_UNAVAILABLE");
  assert.equal(errorSnapshot.lastSuccessfulAt, initial.lastSuccessfulAt);
  assert.equal(errorSnapshot.sessions[0].tokens.root, 42);

  harness.appServer.setFailList(false);
  harness.appServer.setFailRead("root", false);
  const recovered = await harness.store.collect();
  assert.equal(recovered.connectionStatus, "connected");
  assert.equal(recovered.sessions[0].tokens.root, 42);
});

test("root session에 cwd의 project name과 현재 git branch를 노출한다", async () => {
  const metadataCalls = [];
  const harness = createStoreHarness({
    threads: [thread("active-root", {
      cwd: "C:\\Users\\dev\\Repos\\AgentMonitor",
      updatedAt: unix("2026-07-26T05:59:30Z"),
    })],
    startedAt: "2026-07-26T06:00:00Z",
    initialRecords: {
      "active-root": [sessionEvent("2026-07-26T05:59:30Z", "task_started", {
        turn_id: "active-root-turn",
      })],
    },
    readRepoMetadata: async (cwd) => {
      metadataCalls.push(cwd);
      return {
        projectName: "AgentMonitor",
        gitBranch: "feature/session-labels",
      };
    },
  });

  const snapshot = await harness.store.initialize();

  assert.equal(snapshot.sessions[0].projectName, "AgentMonitor");
  assert.equal(snapshot.sessions[0].gitBranch, "feature/session-labels");
  assert.deepEqual(metadataCalls, ["C:\\Users\\dev\\Repos\\AgentMonitor"]);
});

test("시작 시 최근 미완료 루트 source만 등록하고 child는 부모 상세에 둔다", async () => {
  const threads = [
    thread("active-root", { updatedAt: unix("2026-07-26T05:59:30Z") }),
    thread("exec-root", {
      source: "exec",
      updatedAt: unix("2026-07-26T05:59:20Z"),
    }),
    thread("old-root", { updatedAt: unix("2026-07-26T05:40:00Z") }),
    thread("boundary-root", { updatedAt: unix("2026-07-26T05:50:00Z") }),
    thread("complete-before-start", { updatedAt: unix("2026-07-26T05:59:00Z") }),
    thread("child-a", {
      parentThreadId: "active-root",
      source: "subAgent",
      updatedAt: unix("2026-07-26T05:59:40Z"),
    }),
  ];
  const harness = createStoreHarness({
    threads,
    startedAt: "2026-07-26T06:00:00Z",
    initialRecords: {
      "active-root": [sessionEvent("2026-07-26T05:59:30Z", "task_started", {
        turn_id: "active-root-turn",
      })],
      "exec-root": [sessionEvent("2026-07-26T05:59:20Z", "task_started", {
        turn_id: "exec-root-turn",
      })],
      "boundary-root": [sessionEvent("2026-07-26T05:59:00Z", "task_started", {
        turn_id: "boundary-root-turn",
      })],
      "complete-before-start": [
        sessionEvent("2026-07-26T05:58:00Z", "task_started", {
          turn_id: "complete-before-start-turn",
        }),
        sessionEvent("2026-07-26T05:59:00Z", "task_complete", {
          turn_id: "complete-before-start-turn",
        }),
      ],
      "child-a": [
        sessionEvent("2026-07-26T05:59:40Z", "task_started", {
          turn_id: "child-a-turn",
        }),
        {
          timestamp: "2026-07-26T05:59:41Z",
          type: "response_item",
          payload: {
            type: "function_call",
            name: "read_file",
            arguments: '{"path":"src/App.jsx"}',
            call_id: "child-read",
          },
        },
      ],
    },
  });

  const snapshot = await harness.store.initialize();
  assert.deepEqual(
    new Set(snapshot.sessions.map(({ id }) => id)),
    new Set(["active-root", "exec-root"]),
  );
  const activeRoot = snapshot.sessions.find(({ id }) => id === "active-root");
  assert.equal(activeRoot.isWorking, true);
  assert.equal(activeRoot.children[0].isWorking, true);
  assert.deepEqual(activeRoot.children[0].activity.map(({ id }) => id), ["child-read"]);
  assert.deepEqual(activeRoot.children.map(({ id }) => id), [
    "child-a",
  ]);
  assert.ok(harness.appServer.listCalls.some(
    ({ sourceKinds }) => JSON.stringify(sourceKinds) === JSON.stringify(ROOT_SOURCE_KINDS),
  ));
  assert.ok(harness.appServer.listCalls.some(
    ({ sourceKinds }) => JSON.stringify(sourceKinds) === JSON.stringify(CHILD_SOURCE_KINDS),
  ));
  assert.ok(harness.appServer.readCalls.includes("boundary-root"));
});

test("Store 생성 뒤 수집 전에 시작·완료된 root와 child도 등록한다", async () => {
  const harness = createStoreHarness({
    threads: [],
    startedAt: "2026-07-26T06:00:00Z",
  });
  harness.addThread(thread("quick-root", {
    createdAt: unix("2026-07-26T06:00:01Z"),
    updatedAt: unix("2026-07-26T06:00:02Z"),
    turns: [{
      id: "quick-turn",
      items: [],
      status: "completed",
      startedAt: unix("2026-07-26T06:00:01Z"),
      completedAt: unix("2026-07-26T06:00:02Z"),
      durationMs: 1000,
    }],
  }));
  harness.addThread(thread("quick-child", {
    parentThreadId: "quick-root",
    source: "subAgentThreadSpawn",
    createdAt: unix("2026-07-26T06:00:01Z"),
    updatedAt: unix("2026-07-26T06:00:02Z"),
    turns: [{
      id: "quick-child-turn",
      items: [],
      status: "completed",
      startedAt: unix("2026-07-26T06:00:01Z"),
      completedAt: unix("2026-07-26T06:00:02Z"),
      durationMs: 1000,
    }],
  }));
  harness.appendRecord("quick-root", sessionEvent("2026-07-26T06:00:01Z", "task_started", {
    turn_id: "quick-turn",
  }));
  harness.appendRecord("quick-root", sessionEvent("2026-07-26T06:00:02Z", "task_complete", {
    turn_id: "quick-turn",
  }));
  harness.appendRecord("quick-child", sessionEvent("2026-07-26T06:00:01Z", "task_started", {
    turn_id: "quick-child-turn",
  }));
  harness.appendRecord("quick-child", sessionEvent("2026-07-26T06:00:02Z", "task_complete", {
    turn_id: "quick-child-turn",
  }));

  const snapshot = await harness.store.initialize();
  assert.equal(snapshot.sessions[0].status, "complete");
  assert.equal(snapshot.sessions[0].isWorking, false);
  assert.equal(snapshot.sessions[0].children[0].status, "complete");
  assert.equal(snapshot.sessions[0].children[0].isWorking, false);
});

test("등록된 session은 Idle 뒤에도 남고 새 Turn에서 재개되며 terminal duration은 멈춘다", async () => {
  const root = thread("active-root", {
    updatedAt: unix("2026-07-26T05:59:30Z"),
    turns: [{
      id: "turn-1",
      items: [],
      status: "inProgress",
      startedAt: unix("2026-07-26T05:59:30Z"),
      completedAt: null,
      durationMs: null,
    }],
  });
  const harness = createStoreHarness({
    threads: [root],
    startedAt: "2026-07-26T06:00:00Z",
    initialRecords: {
      "active-root": [sessionEvent("2026-07-26T05:59:30Z", "task_started", {
        turn_id: "turn-1",
      })],
    },
  });
  await harness.store.initialize();

  harness.setNow("2026-07-26T06:11:00Z");
  let snapshot = await harness.store.collect();
  assert.equal(snapshot.sessions[0].status, "idle");

  harness.updateThread("active-root", {
    updatedAt: unix("2026-07-26T06:11:01Z"),
    turns: [{
      id: "turn-2",
      items: [],
      status: "inProgress",
      startedAt: unix("2026-07-26T06:11:01Z"),
      completedAt: null,
      durationMs: null,
    }],
  });
  harness.appendRecord("active-root", sessionEvent("2026-07-26T06:11:01Z", "task_started", {
    turn_id: "turn-2",
  }));
  snapshot = await harness.store.collect();
  assert.equal(snapshot.sessions[0].status, "running");

  harness.updateThread("active-root", {
    updatedAt: unix("2026-07-26T06:11:06Z"),
    turns: [{
      id: "turn-2",
      items: [],
      status: "completed",
      startedAt: unix("2026-07-26T06:11:01Z"),
      completedAt: unix("2026-07-26T06:11:06Z"),
      durationMs: 5000,
    }],
  });
  harness.appendRecord("active-root", sessionEvent("2026-07-26T06:11:06Z", "task_complete", {
    turn_id: "turn-2",
    completed_at: "2026-07-26T06:11:06Z",
  }));
  snapshot = await harness.store.collect();
  assert.equal(snapshot.sessions[0].durationSeconds, 5);
  harness.setNow("2026-07-26T07:00:00Z");
  snapshot = await harness.store.collect();
  assert.equal(snapshot.sessions[0].durationSeconds, 5);
});

test("path가 null인 ephemeral Thread는 App Server Turn만으로 조립한다", async () => {
  const ephemeral = thread("ephemeral", {
    path: null,
    createdAt: unix("2026-07-26T06:00:01Z"),
    updatedAt: unix("2026-07-26T06:00:02Z"),
    turns: [{
      id: "ephemeral-turn",
      status: "inProgress",
      startedAt: unix("2026-07-26T06:00:01Z"),
      completedAt: null,
      durationMs: null,
      items: [{
        type: "userMessage",
        id: "message-1",
        clientId: null,
        content: [
          { type: "skill", name: "frontend-design", path: "skill.md" },
          { type: "text", text: "Ephemeral 작업", text_elements: [] },
        ],
      }],
    }],
  });
  const harness = createStoreHarness({
    threads: [ephemeral],
    startedAt: "2026-07-26T06:00:00Z",
  });

  const snapshot = await harness.store.initialize();
  assert.equal(snapshot.sessions[0].assignedWork, "Ephemeral 작업");
  assert.deepEqual(snapshot.sessions[0].skills, ["frontend-design"]);
  assert.equal(snapshot.sessions[0].tokens.root, 0);
});

test("한 session read 실패는 전체 후보와 queue를 폐기하고 다음 수집에서 함께 복구한다", async () => {
  const roots = [
    thread("root-a", { updatedAt: unix("2026-07-26T05:59:30Z") }),
    thread("root-b", { updatedAt: unix("2026-07-26T05:59:20Z") }),
  ];
  const harness = createStoreHarness({
    threads: roots,
    startedAt: "2026-07-26T06:00:00Z",
    initialRecords: {
      "root-a": [sessionEvent("2026-07-26T05:59:30Z", "task_started", {
        turn_id: "root-a-turn",
      })],
      "root-b": [sessionEvent("2026-07-26T05:59:20Z", "task_started", {
        turn_id: "root-b-turn",
      })],
    },
  });
  const initial = await harness.store.initialize();
  harness.appendRecord("root-a", sessionEvent("2026-07-26T06:00:01Z", "token_count", {
    info: { total_token_usage: { total_tokens: 10 } },
  }));
  harness.failRead("root-b");

  let snapshot = await harness.store.collect();
  assert.equal(snapshot.connectionStatus, "error");
  assert.equal(snapshot.errorCode, "SESSION_READ_FAILED");
  assert.deepEqual(snapshot.sessions, initial.sessions);
  assert.equal(snapshot.lastSuccessfulAt, initial.lastSuccessfulAt);

  harness.failRead("root-b", false);
  snapshot = await harness.store.collect();
  assert.equal(snapshot.connectionStatus, "connected");
  assert.equal(snapshot.sessions.find(({ id }) => id === "root-a").tokens.root, 10);
});

test("실제 JsonlTailer도 A 성공 뒤 B 파싱 실패에서 A 사건을 다시 읽는다", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "snapshot-store-real-tailer-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const fileA = path.join(root, "a.jsonl");
  const fileB = path.join(root, "b.jsonl");
  const initialA = `${JSON.stringify(sessionEvent("2026-07-26T05:59:30Z", "task_started", {
    turn_id: "a-turn",
  }))}\n`;
  const initialB = `${JSON.stringify(sessionEvent("2026-07-26T05:59:20Z", "task_started", {
    turn_id: "b-turn",
  }))}\n`;
  await writeFile(fileA, initialA, "utf8");
  await writeFile(fileB, initialB, "utf8");
  const catalog = createFakeCatalog([
    thread("a", {
      path: fileA,
      turnId: "a-turn",
      updatedAt: unix("2026-07-26T05:59:30Z"),
    }),
    thread("b", {
      path: fileB,
      turnId: "b-turn",
      updatedAt: unix("2026-07-26T05:59:20Z"),
    }),
  ]);
  const store = new SnapshotStore({
    appServer: catalog,
    tailer: new JsonlTailer({ codexHome: root }),
    codexHome: root,
    now: () => Date.parse("2026-07-26T06:00:00Z"),
  });
  await store.initialize();
  await appendFile(fileA, `${JSON.stringify(sessionEvent("2026-07-26T06:00:01Z", "token_count", {
    info: { total_token_usage: { total_tokens: 11 } },
  }))}\n`);
  await appendFile(fileB, '{"broken":\n');

  let snapshot = await store.collect();
  assert.equal(snapshot.errorCode, "SESSION_READ_FAILED");
  await writeFile(
    fileB,
    `${initialB}${JSON.stringify(sessionEvent("2026-07-26T06:00:01Z", "token_count", {
      info: { total_token_usage: { total_tokens: 22 } },
    }))}\n`,
    "utf8",
  );
  snapshot = await store.collect();
  assert.equal(snapshot.sessions.find(({ id }) => id === "a").tokens.root, 11);
  assert.equal(snapshot.sessions.find(({ id }) => id === "b").tokens.root, 22);
});

test("Goal 실패는 마지막 정상 snapshot을 유지하고 다음 성공에서 복구한다", async () => {
  const root = thread("goal-root", { updatedAt: unix("2026-07-26T05:59:30Z") });
  const harness = createStoreHarness({
    threads: [root],
    startedAt: "2026-07-26T06:00:00Z",
    initialRecords: {
      "goal-root": [sessionEvent("2026-07-26T05:59:30Z", "task_started", {
        turn_id: "goal-root-turn",
      })],
    },
  });
  harness.appServer.setGoal("goal-root", {
    objective: "첫 목표",
    status: "active",
    tokenBudget: 100,
    tokensUsed: 10,
    timeUsedSeconds: 30,
    createdAt: unix("2026-07-26T05:59:00Z"),
    updatedAt: unix("2026-07-26T05:59:30Z"),
  });
  const initial = await harness.store.initialize();

  harness.appServer.setGoal("goal-root", {
    objective: "새 목표",
    status: "active",
    tokenBudget: 200,
    tokensUsed: 20,
    timeUsedSeconds: 60,
    createdAt: unix("2026-07-26T05:59:00Z"),
    updatedAt: unix("2026-07-26T06:00:10Z"),
  });
  harness.appServer.setFailGoal(true);
  let snapshot = await harness.store.collect();
  assert.equal(snapshot.errorCode, "APP_SERVER_UNAVAILABLE");
  assert.equal(snapshot.sessions[0].goal.objective, "첫 목표");
  assert.equal(snapshot.lastSuccessfulAt, initial.lastSuccessfulAt);

  harness.appServer.setFailGoal(false);
  snapshot = await harness.store.collect();
  assert.equal(snapshot.connectionStatus, "connected");
  assert.equal(snapshot.sessions[0].goal.objective, "새 목표");
});

test("watermark를 실패에서 전진시키지 않아 긴 장애 중 시작·완료 session을 복구한다", async () => {
  const harness = createStoreHarness({
    threads: [thread("base", { updatedAt: unix("2026-07-26T05:59:30Z") })],
    startedAt: "2026-07-26T06:00:00Z",
    initialRecords: {
      base: [sessionEvent("2026-07-26T05:59:30Z", "task_started", {
        turn_id: "base-turn",
      })],
    },
  });
  await harness.store.initialize();
  harness.setNow("2026-07-26T06:20:00Z");
  harness.addThread(thread("during-outage", {
    createdAt: unix("2026-07-26T06:10:00Z"),
    updatedAt: unix("2026-07-26T06:10:01Z"),
    turns: [{
      id: "outage-turn",
      items: [],
      status: "completed",
      startedAt: unix("2026-07-26T06:10:00Z"),
      completedAt: unix("2026-07-26T06:10:01Z"),
      durationMs: 1000,
    }],
  }));
  harness.appendRecord("during-outage", sessionEvent("2026-07-26T06:10:00Z", "task_started", {
    turn_id: "outage-turn",
  }));
  harness.appendRecord("during-outage", sessionEvent("2026-07-26T06:10:01Z", "task_complete", {
    turn_id: "outage-turn",
  }));
  harness.appServer.setFailList(true);
  assert.equal((await harness.store.collect()).errorCode, "APP_SERVER_UNAVAILABLE");

  harness.setNow("2026-07-26T06:21:00Z");
  harness.appServer.setFailList(false);
  const snapshot = await harness.store.collect();
  assert.equal(snapshot.sessions.find(({ id }) => id === "during-outage").status, "complete");
});

test("두 번째 child 페이지까지 등록하고 토큰을 한 번만 합산한다", async () => {
  const root = thread("root", { updatedAt: unix("2026-07-26T05:59:59Z") });
  const children = Array.from({ length: THREAD_PAGE_SIZE + 1 }, (_, index) => thread(
    `child-${String(index).padStart(3, "0")}`,
    {
      parentThreadId: "root",
      source: CHILD_SOURCE_KINDS[index % (CHILD_SOURCE_KINDS.length - 1)],
      updatedAt: unix("2026-07-26T05:59:50Z"),
    },
  ));
  const records = {
    root: [
      sessionEvent("2026-07-26T05:59:59Z", "task_started", { turn_id: "root-turn" }),
      sessionEvent("2026-07-26T05:59:59Z", "token_count", {
        info: { total_token_usage: { total_tokens: 5 } },
      }),
    ],
  };
  for (const child of children) {
    records[child.id] = [
      sessionEvent("2026-07-26T05:59:50Z", "task_started", {
        turn_id: `${child.id}-turn`,
      }),
      sessionEvent("2026-07-26T05:59:51Z", "token_count", {
        info: { total_token_usage: { total_tokens: 1 } },
      }),
    ];
  }
  const harness = createStoreHarness({
    threads: [root, ...children],
    initialRecords: records,
    startedAt: "2026-07-26T06:00:00Z",
  });

  const snapshot = await harness.store.initialize();
  assert.equal(snapshot.sessions[0].children.length, THREAD_PAGE_SIZE + 1);
  assert.deepEqual(snapshot.sessions[0].tokens, {
    root: 5,
    children: THREAD_PAGE_SIZE + 1,
    total: THREAD_PAGE_SIZE + 6,
  });
  const childCalls = harness.appServer.listCalls.filter(
    ({ ancestorThreadId }) => ancestorThreadId === "root",
  );
  assert.equal(childCalls[1].cursor, String(THREAD_PAGE_SIZE));
  assert.deepEqual(childCalls[1].sourceKinds, CHILD_SOURCE_KINDS);
});
