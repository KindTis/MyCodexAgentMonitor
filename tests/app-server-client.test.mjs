import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";

import {
  AppServerClient,
  AppServerExitedError,
  AppServerProtocolError,
  AppServerTimeoutError,
} from "../monitor/app-server-client.mjs";

function createFakeAppServerProcess(pid = 1234) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();

  const sent = [];
  const claimedIds = new Set();
  const sentEvent = new EventEmitter();
  createInterface({ input: child.stdin }).on("line", (line) => {
    sent.push(JSON.parse(line));
    sentEvent.emit("sent");
  });

  async function nextRequest(method) {
    const findNext = () => sent.find((message) => (
      message.id != null
      && message.method === method
      && !claimedIds.has(message.id)
    ));
    while (!findNext()) {
      await once(sentEvent, "sent");
    }
    const request = findNext();
    claimedIds.add(request.id);
    return request;
  }

  return {
    child,
    messages: () => sent,
    methods: () => sent.map(({ method }) => method),
    nextRequest,
    reply(request, result) {
      child.stdout.write(`${JSON.stringify({ id: request.id, result })}\n`);
    },
    replyError(request, error) {
      child.stdout.write(`${JSON.stringify({ id: request.id, error })}\n`);
    },
    async replyToNext(method, result) {
      this.reply(await nextRequest(method), result);
    },
    exit(code = 0, signal = null) {
      child.emit("exit", code, signal);
    },
  };
}

async function startClient(t, process, options = {}) {
  const client = new AppServerClient({
    spawnProcess: () => process.child,
    terminateProcessTree: async () => {},
    ...options,
  });
  t.after(() => client.stop());
  const started = client.start();
  await process.replyToNext("initialize", {
    userAgent: "codex-cli/test",
    platformFamily: "windows",
    platformOs: "windows",
  });
  await started;
  return client;
}

test("초기화 뒤 네 가지 읽기 전용 메서드만 호출한다", async (t) => {
  const process = createFakeAppServerProcess();
  const client = await startClient(t, process);

  const listed = client.listThreads({
    sortKey: "updated_at",
    sortDirection: "desc",
    limit: 100,
  });
  const listRequest = await process.nextRequest("thread/list");
  process.reply(listRequest, { data: [], nextCursor: null, backwardsCursor: null });
  assert.deepEqual(await listed, { data: [], nextCursor: null, backwardsCursor: null });

  const read = client.readThread("thread-a");
  const readRequest = await process.nextRequest("thread/read");
  assert.deepEqual(readRequest.params, { threadId: "thread-a", includeTurns: true });
  process.reply(readRequest, { thread: { id: "thread-a" } });
  assert.deepEqual(await read, { thread: { id: "thread-a" } });

  const goal = client.getGoal("thread-a");
  const goalRequest = await process.nextRequest("thread/goal/get");
  assert.deepEqual(goalRequest.params, { threadId: "thread-a" });
  process.reply(goalRequest, { goal: null });
  assert.deepEqual(await goal, { goal: null });

  const limits = client.readRateLimits();
  const limitsRequest = await process.nextRequest("account/rateLimits/read");
  assert.deepEqual(limitsRequest.params, {});
  process.reply(limitsRequest, {
    rateLimitsByLimitId: {
      codex: {
        limitId: "codex",
        primary: { usedPercent: 21, windowDurationMins: 300 },
        secondary: { usedPercent: 6, windowDurationMins: 10080 },
      },
    },
  });
  assert.equal((await limits).rateLimitsByLimitId.codex.limitId, "codex");

  assert.deepEqual(process.methods(), [
    "initialize",
    "initialized",
    "thread/list",
    "thread/read",
    "thread/goal/get",
    "account/rateLimits/read",
  ]);
  assert.deepEqual(process.messages()[0].params, {
    clientInfo: {
      name: "my_codex_agent_monitor",
      title: "My Codex Agent Monitor",
      version: "0.0.0",
    },
    capabilities: { experimentalApi: true },
  });
  assert.deepEqual(process.messages()[1], { method: "initialized" });
});

test("프로토콜 오류는 code만 보존하고 서버 본문을 노출하지 않는다", async (t) => {
  const process = createFakeAppServerProcess();
  const client = await startClient(t, process);

  const listed = client.listThreads({});
  process.replyError(await process.nextRequest("thread/list"), {
    code: -32001,
    message: "private server detail",
    data: { body: "private tool output" },
  });

  await assert.rejects(listed, (error) => {
    assert.ok(error instanceof AppServerProtocolError);
    assert.equal(error.code, -32001);
    assert.doesNotMatch(JSON.stringify(error), /private|tool output/);
    return true;
  });
});

test("자식 종료는 대기 요청을 거절하고 stderr를 오류에 복제하지 않는다", async (t) => {
  const process = createFakeAppServerProcess();
  const client = await startClient(t, process);

  const listed = client.listThreads({});
  await process.nextRequest("thread/list");
  process.child.stderr.write("sensitive child stderr");
  process.exit(1);

  await assert.rejects(listed, (error) => {
    assert.ok(error instanceof AppServerExitedError);
    assert.doesNotMatch(JSON.stringify(error), /sensitive|stderr/);
    return true;
  });
});

test("initialize와 모든 읽기 요청에 deadline을 적용한다", async (t) => {
  const process = createFakeAppServerProcess();
  const client = new AppServerClient({
    spawnProcess: () => process.child,
    terminateProcessTree: async () => {},
    requestTimeoutMs: 10,
  });
  t.after(() => client.stop());

  await assert.rejects(client.start(), AppServerTimeoutError);

  const restartedProcess = createFakeAppServerProcess(5678);
  const processes = [restartedProcess];
  const restarted = new AppServerClient({
    spawnProcess: () => processes.shift().child,
    terminateProcessTree: async () => {},
    requestTimeoutMs: 10,
  });
  t.after(() => restarted.stop());
  const started = restarted.start();
  await restartedProcess.replyToNext("initialize", {});
  await started;

  await assert.rejects(restarted.listThreads({}), AppServerTimeoutError);
  await assert.rejects(restarted.readThread("thread-a"), AppServerTimeoutError);
  await assert.rejects(restarted.getGoal("thread-a"), AppServerTimeoutError);
  await assert.rejects(restarted.readRateLimits(), AppServerTimeoutError);
});

test("timeout된 요청의 늦은 응답을 무시하고 다음 응답을 올바르게 연결한다", async (t) => {
  const process = createFakeAppServerProcess();
  const client = await startClient(t, process, { requestTimeoutMs: 15 });

  const first = client.listThreads({ cursor: "A" });
  const firstRequest = await process.nextRequest("thread/list");
  await assert.rejects(first, AppServerTimeoutError);
  process.reply(firstRequest, { data: [{ id: "late" }] });

  const second = client.listThreads({ cursor: "B" });
  const secondRequest = await process.nextRequest("thread/list");
  process.reply(secondRequest, { data: [{ id: "current" }], nextCursor: null });
  assert.deepEqual(await second, { data: [{ id: "current" }], nextCursor: null });
  assert.ok(secondRequest.id > firstRequest.id);
});

test("exit 뒤 같은 client를 새 child로 재시작하고 request id를 재사용하지 않는다", async (t) => {
  const first = createFakeAppServerProcess(1111);
  const second = createFakeAppServerProcess(2222);
  const processes = [first, second];
  const client = new AppServerClient({
    spawnProcess: () => processes.shift().child,
    terminateProcessTree: async () => {},
  });
  t.after(() => client.stop());

  const firstStart = client.start();
  const firstInitialize = await first.nextRequest("initialize");
  first.reply(firstInitialize, {});
  await firstStart;
  first.exit(1);

  const secondStart = client.start();
  const secondInitialize = await second.nextRequest("initialize");
  second.reply(secondInitialize, {});
  await secondStart;

  const listed = client.listThreads({});
  second.reply(await second.nextRequest("thread/list"), { data: [], nextCursor: null });
  assert.deepEqual(await listed, { data: [], nextCursor: null });
  assert.ok(secondInitialize.id > firstInitialize.id);

  first.reply(firstInitialize, { stale: true });
  first.exit(0);
  const goal = client.getGoal("thread-b");
  second.reply(await second.nextRequest("thread/goal/get"), { goal: null });
  assert.deepEqual(await goal, { goal: null });
});

test("stop은 모니터가 만든 래퍼 PID 트리만 한 번 종료한다", async () => {
  const process = createFakeAppServerProcess(4321);
  const terminated = [];
  const client = new AppServerClient({
    spawnProcess: () => process.child,
    terminateProcessTree: async (pid) => terminated.push(pid),
  });
  const started = client.start();
  await process.replyToNext("initialize", {});
  await started;

  await client.stop();
  await client.stop();
  assert.deepEqual(terminated, [4321]);
});

test("기본 spawn 계약은 고정된 Windows app-server 명령을 사용한다", async (t) => {
  const process = createFakeAppServerProcess();
  let call;
  const client = new AppServerClient({
    spawnProcess(command, args, options) {
      call = { command, args, options };
      return process.child;
    },
    terminateProcessTree: async () => {},
  });
  t.after(() => client.stop());

  const started = client.start();
  await process.replyToNext("initialize", {});
  await started;

  assert.deepEqual(call, {
    command: globalThis.process.env.ComSpec ?? "cmd.exe",
    args: ["/d", "/s", "/c", "codex.cmd app-server --listen stdio://"],
    options: {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    },
  });
});
