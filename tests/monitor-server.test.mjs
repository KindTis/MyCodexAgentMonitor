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
} from "../monitor/snapshot-store.mjs";
import {
  createMonitorServer,
  HOST,
  PORT,
  startMonitor,
} from "../monitor/server.mjs";

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
} = {}) {
  return {
    collectedAt: "2026-07-26T06:00:00.000Z",
    lastSuccessfulAt,
    connectionStatus,
    errorCode,
    sessions: [],
  };
}

test("snapshot API와 정적 파일·HTML fallback을 안전하게 제공한다", async (t) => {
  const running = await startTestServer(t, snapshot());

  let response = await fetch(`${running.url}/api/snapshot`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).connectionStatus, "connected");

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
    startMonitor({
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

  const runtime = await startMonitor({
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
  const runtime = await startMonitor({
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
  const runtime = await startMonitor({
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
