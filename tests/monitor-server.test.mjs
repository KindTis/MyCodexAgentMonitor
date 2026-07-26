import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer as createNodeServer } from "node:net";

import {
  COLLECTION_INTERVAL_MS,
  SnapshotStore,
} from "../monitor/snapshot-store.mjs";
import {
  createMonitorServer,
  HOST,
  PORT,
  startMonitor,
} from "../monitor/server.mjs";

const unix = (value) => Date.parse(value) / 1000;

async function createStaticFixture(t) {
  const distDir = await mkdtemp(path.join(tmpdir(), "codex-monitor-dist-"));
  await mkdir(path.join(distDir, "assets"));
  await writeFile(path.join(distDir, "index.html"), "<main>monitor</main>", "utf8");
  await writeFile(path.join(distDir, "assets", "app.js"), "export {};", "utf8");
  t.after(() => rm(distDir, { recursive: true, force: true }));
  return distDir;
}

function listen(server, options) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options, resolve);
  });
}

function closeServer(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function startTestServer(t, snapshot) {
  const distDir = await createStaticFixture(t);
  const server = createMonitorServer({
    distDir,
    snapshotProvider: () => snapshot,
  });
  await listen(server, { host: HOST, port: 0 });
  t.after(() => closeServer(server));
  const { port } = server.address();
  return { server, url: `http://${HOST}:${port}` };
}

function createTimerHarness() {
  let nextId = 1;
  const timers = new Map();
  return {
    setTimeoutFn(callback, delay) {
      const id = nextId++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeoutFn(id) {
      timers.delete(id);
    },
    scheduled() {
      return [...timers.values()].map(({ delay }) => delay);
    },
    take() {
      const [id, timer] = timers.entries().next().value ?? [];
      if (id == null) return null;
      timers.delete(id);
      return timer;
    },
    async runNext() {
      const timer = this.take();
      assert.ok(timer, "expected a scheduled timer");
      await timer.callback();
    },
  };
}

function createFakeStore(sequence) {
  let current = {
    collectedAt: null,
    lastSuccessfulAt: null,
    connectionStatus: "syncing",
    errorCode: null,
    sessions: [],
  };
  return {
    initializeCalls: 0,
    collectCalls: 0,
    get snapshot() {
      return structuredClone(current);
    },
    async initialize() {
      this.initializeCalls += 1;
      current = structuredClone(sequence.shift());
      return this.snapshot;
    },
    async collect() {
      this.collectCalls += 1;
      current = structuredClone(sequence.shift());
      return this.snapshot;
    },
    markError(errorCode) {
      current = { ...current, connectionStatus: "error", errorCode };
      return this.snapshot;
    },
  };
}

function snapshot({
  connectionStatus = "connected",
  errorCode = null,
  lastSuccessfulAt = "2026-07-26T06:00:00.000Z",
  usage = {
    collectedAt: "2026-07-26T06:00:00.000Z",
    todayTokens: 522555501,
    todayCostUsd: 369.2616,
    fiveHourUsedPercent: 21,
    oneWeekUsedPercent: 6,
  },
} = {}) {
  return {
    collectedAt: "2026-07-26T06:00:00.000Z",
    lastSuccessfulAt,
    connectionStatus,
    errorCode,
    sessions: [],
    usage,
  };
}

const emptyUsage = {
  collectedAt: null,
  todayTokens: null,
  todayCostUsd: null,
  fiveHourUsedPercent: null,
  oneWeekUsedPercent: null,
};

function startMonitorForTest(options) {
  return startMonitor({
    collectUsageFn: async () => structuredClone(emptyUsage),
    setIntervalFn: () => 1,
    clearIntervalFn() {},
    ...options,
  });
}

test("snapshot API와 정적 파일·HTML fallback을 안전하게 제공한다", async (t) => {
  const running = await startTestServer(t, snapshot());

  let response = await fetch(`${running.url}/api/snapshot`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.connectionStatus, "connected");
  assert.deepEqual(body.usage, {
    collectedAt: "2026-07-26T06:00:00.000Z",
    todayTokens: 522555501,
    todayCostUsd: 369.2616,
    fiveHourUsedPercent: 21,
    oneWeekUsedPercent: 6,
  });

  response = await fetch(`${running.url}/assets/app.js`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /javascript/);
  assert.equal(await response.text(), "export {};");

  response = await fetch(`${running.url}/session/root-a`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "<main>monitor</main>");

  response = await fetch(`${running.url}/api/snapshot`, { method: "POST" });
  assert.equal(response.status, 405);
  response = await fetch(`${running.url}/api/unknown`);
  assert.equal(response.status, 404);
  response = await fetch(`${running.url}/%2e%2e%5csecret.txt`);
  assert.equal(response.status, 403);
});

test("점유된 4310 포트에서 App Server나 브라우저를 시작하지 않는다", async (t) => {
  const guard = createNodeServer();
  await listen(guard, { host: HOST, port: PORT });
  t.after(() => closeServer(guard));
  const distDir = await createStaticFixture(t);
  const appServer = {
    starts: 0,
    stops: 0,
    async start() { this.starts += 1; },
    async stop() { this.stops += 1; },
  };
  let browserCalls = 0;

  await assert.rejects(
    startMonitorForTest({
      distDir,
      appServer,
      store: createFakeStore([snapshot()]),
      open: true,
      openBrowserFn: () => { browserCalls += 1; },
    }),
    (error) => error.code === "EADDRINUSE",
  );
  assert.equal(appServer.starts, 0);
  assert.equal(appServer.stops, 0);
  assert.equal(browserCalls, 0);
});

test("사용량을 즉시 수집하고 10초마다 갱신해 세션 상태와 함께 제공한다", async (t) => {
  const distDir = await createStaticFixture(t);
  let interval;
  let intervalCleared = false;
  const usages = [
    {
      collectedAt: "2026-07-26T06:00:00.000Z",
      todayTokens: 12,
      todayCostUsd: 0.5,
      fiveHourUsedPercent: 21,
      oneWeekUsedPercent: 6,
    },
    {
      collectedAt: "2026-07-26T06:00:10.000Z",
      todayTokens: null,
      todayCostUsd: null,
      fiveHourUsedPercent: 22,
      oneWeekUsedPercent: 6,
    },
  ];
  const appServer = {
    async start() {},
    async stop() {},
    async readRateLimits() {
      throw new Error("the injected collector owns this test");
    },
  };
  const runtime = await startMonitor({
    distDir,
    port: 0,
    appServer,
    store: createFakeStore([snapshot()]),
    collectUsageFn: async () => structuredClone(usages.shift()),
    setIntervalFn(callback, delay) {
      interval = { callback, delay };
      return 7;
    },
    clearIntervalFn(id) {
      intervalCleared = id === 7;
    },
  });
  t.after(() => runtime.close());

  assert.equal(interval.delay, 10000);
  let response = await fetch(`${runtime.url}/api/snapshot`);
  let body = await response.json();
  assert.equal(body.connectionStatus, "connected");
  assert.equal(body.usage.todayTokens, 12);

  await interval.callback();
  response = await fetch(`${runtime.url}/api/snapshot`);
  body = await response.json();
  assert.equal(body.connectionStatus, "connected");
  assert.equal(body.usage.todayTokens, null);
  assert.equal(body.usage.fiveHourUsedPercent, 22);

  await runtime.close();
  assert.equal(intervalCleared, true);
});

test("SESSION_READ_FAILED는 같은 child와 정확히 하나의 3초 timer로 복구한다", async (t) => {
  const distDir = await createStaticFixture(t);
  const timers = createTimerHarness();
  const appServer = {
    starts: 0,
    stops: 0,
    async start() { this.starts += 1; },
    async stop() { this.stops += 1; },
  };
  const store = createFakeStore([
    snapshot({
      connectionStatus: "error",
      errorCode: "SESSION_READ_FAILED",
      lastSuccessfulAt: null,
    }),
    snapshot(),
  ]);
  let openedUrl = null;

  const runtime = await startMonitorForTest({
    distDir,
    port: 0,
    appServer,
    store,
    open: true,
    openBrowserFn: (url) => { openedUrl = url; },
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  t.after(() => runtime.close());

  assert.match(openedUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(appServer.starts, 1);
  assert.equal(appServer.stops, 0);
  assert.equal(store.initializeCalls, 1);
  assert.deepEqual(timers.scheduled(), [COLLECTION_INTERVAL_MS]);

  await timers.runNext();
  assert.equal(store.initializeCalls, 2);
  assert.equal(appServer.starts, 1);
  assert.deepEqual(timers.scheduled(), [COLLECTION_INTERVAL_MS]);
});

test("APP_SERVER_UNAVAILABLE은 같은 client를 백오프로 재시작하고 기존 Store를 collect한다", async (t) => {
  const distDir = await createStaticFixture(t);
  const timers = createTimerHarness();
  const appServer = {
    starts: 0,
    stops: 0,
    async start() { this.starts += 1; },
    async stop() { this.stops += 1; },
  };
  const store = createFakeStore([
    snapshot(),
    snapshot({
      connectionStatus: "error",
      errorCode: "APP_SERVER_UNAVAILABLE",
    }),
    snapshot(),
  ]);
  const runtime = await startMonitorForTest({
    distDir,
    port: 0,
    appServer,
    store,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  t.after(() => runtime.close());

  await timers.runNext();
  assert.equal(appServer.stops, 1);
  assert.deepEqual(timers.scheduled(), [1000]);

  await timers.runNext();
  assert.equal(appServer.starts, 2);
  assert.equal(store.initializeCalls, 1);
  assert.equal(store.collectCalls, 2);
  assert.deepEqual(timers.scheduled(), [COLLECTION_INTERVAL_MS]);
});

test("연속 App Server 실패를 1·2·4·5초로 재시도하고 같은 Store로 장기 장애 사건을 복구한다", async (t) => {
  const distDir = await createStaticFixture(t);
  const timers = createTimerHarness();
  let nowMs = Date.parse("2026-07-26T06:00:00Z");
  let failNextList = false;
  const threads = [];
  const records = new Map();
  const successfulChildren = [];
  const appServer = {
    starts: 0,
    stops: 0,
    async start() {
      this.starts += 1;
      if (this.starts >= 2 && this.starts <= 4) throw new Error("start failed");
      successfulChildren.push(this.starts);
    },
    async stop() {
      this.stops += 1;
    },
    async listThreads({ ancestorThreadId }) {
      if (failNextList) {
        failNextList = false;
        throw new Error("app server exited");
      }
      const data = ancestorThreadId
        ? threads.filter(({ parentThreadId }) => parentThreadId === ancestorThreadId)
        : threads.filter(({ parentThreadId }) => parentThreadId == null);
      return { data, nextCursor: null };
    },
    async readThread(threadId) {
      return { thread: structuredClone(threads.find(({ id }) => id === threadId)) };
    },
    async getGoal() {
      return { goal: null };
    },
  };
  const tailer = {
    beginBatch() {},
    async read(filePath) { return structuredClone(records.get(filePath) ?? []); },
    commitBatch() {},
    discardBatch() {},
  };
  const store = new SnapshotStore({
    appServer,
    tailer,
    codexHome: "C:\\Users\\dev\\.codex",
    now: () => nowMs,
  });
  const runtime = await startMonitorForTest({
    distDir,
    port: 0,
    appServer,
    store,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  t.after(() => runtime.close());

  nowMs = Date.parse("2026-07-26T06:11:00Z");
  const rootPath = "C:\\Users\\dev\\.codex\\sessions\\quick-root.jsonl";
  const childPath = "C:\\Users\\dev\\.codex\\sessions\\quick-child.jsonl";
  threads.push(
    {
      id: "quick-root",
      parentThreadId: null,
      createdAt: unix("2026-07-26T06:05:00Z"),
      updatedAt: unix("2026-07-26T06:05:02Z"),
      source: "cli",
      status: { type: "notLoaded" },
      path: rootPath,
      cwd: "C:\\repo",
      name: null,
      turns: [{
        id: "root-turn",
        items: [],
        status: "completed",
        startedAt: unix("2026-07-26T06:05:00Z"),
        completedAt: unix("2026-07-26T06:05:02Z"),
        durationMs: 2000,
      }],
    },
    {
      id: "quick-child",
      parentThreadId: "quick-root",
      createdAt: unix("2026-07-26T06:05:00Z"),
      updatedAt: unix("2026-07-26T06:05:01Z"),
      source: "subAgent",
      status: { type: "notLoaded" },
      path: childPath,
      cwd: "C:\\repo",
      agentNickname: "Verifier",
      agentRole: "Child agent",
      turns: [{
        id: "child-turn",
        items: [],
        status: "completed",
        startedAt: unix("2026-07-26T06:05:00Z"),
        completedAt: unix("2026-07-26T06:05:01Z"),
        durationMs: 1000,
      }],
    },
  );
  records.set(rootPath, [
    { timestamp: "2026-07-26T06:05:00Z", type: "event_msg", payload: { type: "task_started", turn_id: "root-turn" } },
    { timestamp: "2026-07-26T06:05:02Z", type: "event_msg", payload: { type: "task_complete", turn_id: "root-turn" } },
  ]);
  records.set(childPath, [
    { timestamp: "2026-07-26T06:05:00Z", type: "event_msg", payload: { type: "task_started", turn_id: "child-turn" } },
    { timestamp: "2026-07-26T06:05:01Z", type: "event_msg", payload: { type: "task_complete", turn_id: "child-turn" } },
  ]);
  failNextList = true;

  await timers.runNext();
  assert.deepEqual(timers.scheduled(), [1000]);
  await timers.runNext();
  assert.deepEqual(timers.scheduled(), [2000]);
  await timers.runNext();
  assert.deepEqual(timers.scheduled(), [4000]);
  await timers.runNext();
  assert.deepEqual(timers.scheduled(), [5000]);
  await timers.runNext();

  assert.equal(runtime.store, store);
  assert.deepEqual(successfulChildren, [1, 5]);
  assert.equal(appServer.starts, 5);
  assert.equal(store.snapshot.connectionStatus, "connected");
  assert.equal(store.snapshot.sessions[0].status, "complete");
  assert.equal(store.snapshot.sessions[0].children[0].status, "complete");
  assert.deepEqual(timers.scheduled(), [COLLECTION_INTERVAL_MS]);
});

test("종료 뒤 진행 중 수집이 끝나도 새 timer를 예약하지 않는다", async (t) => {
  const distDir = await createStaticFixture(t);
  const timers = createTimerHarness();
  const appServer = {
    stops: 0,
    async start() {},
    async stop() { this.stops += 1; },
  };
  let resolveCollect;
  let current = snapshot({ lastSuccessfulAt: null });
  const store = {
    get snapshot() { return structuredClone(current); },
    async initialize() {
      current = snapshot();
      return current;
    },
    collect() {
      return new Promise((resolve) => {
        resolveCollect = () => resolve(current);
      });
    },
    markError() { return current; },
  };
  const runtime = await startMonitorForTest({
    distDir,
    port: 0,
    appServer,
    store,
    setTimeoutFn: timers.setTimeoutFn,
    clearTimeoutFn: timers.clearTimeoutFn,
  });
  const pending = timers.take().callback();
  await runtime.close();
  resolveCollect();
  await pending;

  assert.deepEqual(timers.scheduled(), []);
  assert.equal(appServer.stops, 1);
});
