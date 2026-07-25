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

import {
  classifyToolCall,
  IDLE_AFTER_MS,
  JsonlTailer,
  reduceThreadRecords,
  resolveCodexHome,
  SessionLogParseError,
  SessionPathBoundaryError,
} from "../monitor/session-log.mjs";

const unix = (value) => Date.parse(value) / 1000;

function event(timestamp, type, extra = {}) {
  return { timestamp, type: "event_msg", payload: { type, ...extra } };
}

function toolCall(timestamp, name, argumentsText = "{}", callId = `call-${timestamp}`) {
  return {
    timestamp,
    type: "response_item",
    payload: {
      type: "function_call",
      id: `item-${timestamp}`,
      name,
      arguments: argumentsText,
      call_id: callId,
    },
  };
}

function toolOutput(timestamp, callId, output = "ok") {
  return {
    timestamp,
    type: "response_item",
    payload: {
      type: "function_call_output",
      call_id: callId,
      output,
    },
  };
}

function activeThread(turnId, overrides = {}) {
  return {
    id: "thread-1",
    status: { type: "active", activeFlags: [] },
    turns: [{
      id: turnId,
      items: [],
      status: "inProgress",
      error: null,
      startedAt: unix("2026-07-26T06:00:00Z"),
      completedAt: null,
      durationMs: null,
      ...overrides.turn,
    }],
    ...overrides,
  };
}

async function createTempRoot(t) {
  const root = await mkdtemp(path.join(tmpdir(), "codex-monitor-jsonl-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("CODEX_HOME을 우선하고 없으면 USERPROFILE 기본 경로를 사용한다", () => {
  assert.equal(
    resolveCodexHome({ CODEX_HOME: "D:\\codex-home", USERPROFILE: "C:\\Users\\dev" }),
    path.resolve("D:\\codex-home"),
  );
  assert.equal(
    resolveCodexHome({ USERPROFILE: "C:\\Users\\dev" }),
    path.resolve("C:\\Users\\dev\\.codex"),
  );
  assert.throws(() => resolveCodexHome({}), /USERPROFILE/);
});

test("완성되지 않은 JSONL 마지막 줄을 다음 읽기에서 재시도한다", async (t) => {
  const root = await createTempRoot(t);
  const file = path.join(root, "session.jsonl");
  await writeFile(
    file,
    '{"timestamp":"2026-07-26T06:00:00Z","type":"event_msg","payload":{"type":"task_started"}}\n'
      + '{"timestamp":"2026-07-26T06:00:01Z","type":"event_msg"',
    "utf8",
  );
  const tailer = new JsonlTailer({ codexHome: root });

  tailer.beginBatch();
  assert.equal((await tailer.read(file)).length, 1);
  tailer.commitBatch();
  await appendFile(file, ',"payload":{"type":"task_complete"}}\n');
  tailer.beginBatch();
  assert.equal((await tailer.read(file))[0].payload.type, "task_complete");
  tailer.commitBatch();
});

test("Codex 홈 밖 파일은 읽지 않고 경로 내용을 오류에 노출하지 않는다", async (t) => {
  const root = await createTempRoot(t);
  const outside = await mkdtemp(path.join(tmpdir(), "codex-monitor-outside-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const file = path.join(outside, "secret-session.jsonl");
  await writeFile(file, "{}\n", "utf8");
  const tailer = new JsonlTailer({ codexHome: root });

  tailer.beginBatch();
  await assert.rejects(tailer.read(file), (error) => {
    assert.ok(error instanceof SessionPathBoundaryError);
    assert.doesNotMatch(JSON.stringify(error), /secret-session|outside/);
    return true;
  });
  tailer.discardBatch();
});

test("손상된 완결 줄을 폐기하면 같은 바이트 위치에서 다시 읽는다", async (t) => {
  const root = await createTempRoot(t);
  const file = path.join(root, "session.jsonl");
  const tailer = new JsonlTailer({ codexHome: root });
  await writeFile(file, '{"private":"broken"\n', "utf8");

  tailer.beginBatch();
  await assert.rejects(tailer.read(file), (error) => {
    assert.ok(error instanceof SessionLogParseError);
    assert.doesNotMatch(JSON.stringify(error), /private|broken/);
    return true;
  });
  tailer.discardBatch();

  await writeFile(file, '{"type":"valid"}\n', "utf8");
  tailer.beginBatch();
  assert.deepEqual(await tailer.read(file), [{ type: "valid" }]);
  tailer.commitBatch();

  await writeFile(file, '{"x":1}\n', "utf8");
  tailer.beginBatch();
  assert.deepEqual(await tailer.read(file), [{ x: 1 }]);
  tailer.commitBatch();
});

test("도구 호출을 관찰 가능한 최소 실행 단계로 분류한다", () => {
  assert.equal(classifyToolCall("apply_patch"), "Editing");
  assert.equal(classifyToolCall("request_user_input"), "Waiting");
  assert.equal(classifyToolCall("wait_agent"), "Waiting");
  assert.equal(classifyToolCall("shell_command", { command: "npm.cmd test" }), "Testing");
  assert.equal(classifyToolCall("shell_command", { command: "Get-Content src/App.jsx" }), "Reading files");
  assert.equal(classifyToolCall("browser_snapshot"), "Calling tool");
});

test("이전 Turn을 버리고 현재 Turn의 작업·스킬·Plan·토큰만 유지한다", () => {
  const records = [
    event("2026-07-26T05:59:00Z", "task_started", { turn_id: "old" }),
    toolCall("2026-07-26T05:59:01Z", "wait_agent", "{}", "old-wait"),
    event("2026-07-26T06:00:00Z", "task_started", {
      turn_id: "current",
      started_at: "2026-07-26T06:00:00Z",
    }),
    event("2026-07-26T06:00:01Z", "user_message", {
      message: "$superpowers:using-superpowers 현황판을 구현해.\n"
        + "<environment_context>구조 정보</environment_context>",
    }),
    toolCall("2026-07-26T06:00:02Z", "update_plan", JSON.stringify({
      plan: [
        { step: "수집기 구현", status: "in_progress" },
        { step: "화면 연결", status: "pending" },
      ],
    }), "current-plan"),
    event("2026-07-26T06:00:03Z", "token_count", {
      info: { total_token_usage: { total_tokens: 420 } },
    }),
  ];

  const result = reduceThreadRecords(
    null,
    records,
    activeThread("current"),
    Date.parse("2026-07-26T06:00:04Z"),
  );

  assert.equal(result.turnId, "current");
  assert.equal(result.assignedWork, "현황판을 구현해.");
  assert.deepEqual(result.skills, ["superpowers:using-superpowers"]);
  assert.deepEqual(result.plan.tasks, [
    { title: "수집기 구현", status: "active" },
    { title: "화면 연결", status: "queued" },
  ]);
  assert.equal(result.tokens, 420);
  assert.equal(result.status, "planning");
  assert.equal(result.currentActivity.label, "update_plan");
});

test("도구 결과가 오면 Waiting과 Planning을 해제하고 Plan은 유지한다", () => {
  const thread = activeThread("turn-1");
  const started = event("2026-07-26T06:00:00Z", "task_started", { turn_id: "turn-1" });
  let result = reduceThreadRecords(
    null,
    [started, toolCall("2026-07-26T06:00:01Z", "wait_agent", "{}", "wait-1")],
    thread,
    Date.parse("2026-07-26T06:00:02Z"),
  );
  assert.equal(result.status, "waiting");

  result = reduceThreadRecords(
    result,
    [toolOutput("2026-07-26T06:00:03Z", "wait-1")],
    thread,
    Date.parse("2026-07-26T06:00:04Z"),
  );
  assert.equal(result.status, "running");
  assert.equal(result.currentActivity, null);

  result = reduceThreadRecords(
    result,
    [toolCall("2026-07-26T06:00:05Z", "update_plan", JSON.stringify({
      plan: [{ step: "검증", status: "in_progress" }],
    }), "plan-1")],
    thread,
    Date.parse("2026-07-26T06:00:06Z"),
  );
  assert.equal(result.status, "planning");
  result = reduceThreadRecords(
    result,
    [toolOutput("2026-07-26T06:00:07Z", "plan-1")],
    thread,
    Date.parse("2026-07-26T06:00:08Z"),
  );
  assert.equal(result.status, "running");
  assert.deepEqual(result.plan.tasks, [{ title: "검증", status: "active" }]);
});

test("미해결 사용자 입력만 needs_input이고 질문·응답 본문은 보존하지 않는다", () => {
  const thread = activeThread("turn-1", { status: { type: "notLoaded" } });
  let result = reduceThreadRecords(
    null,
    [
      event("2026-07-26T06:00:00Z", "task_started", { turn_id: "turn-1" }),
      toolCall(
        "2026-07-26T06:00:01Z",
        "request_user_input",
        '{"questions":[{"question":"private question"}]}',
        "input-1",
      ),
    ],
    thread,
    Date.parse("2026-07-26T06:00:02Z"),
  );
  assert.equal(result.status, "needs_input");
  assert.doesNotMatch(JSON.stringify(result), /private question/);

  result = reduceThreadRecords(
    result,
    [toolOutput("2026-07-26T06:00:03Z", "input-1", "private answer")],
    thread,
    Date.parse("2026-07-26T06:00:04Z"),
  );
  assert.equal(result.status, "running");
  assert.doesNotMatch(JSON.stringify(result), /private answer/);

  const nextTurn = reduceThreadRecords(
    null,
    [
      event("2026-07-26T05:59:00Z", "task_started", { turn_id: "old" }),
      toolCall("2026-07-26T05:59:01Z", "request_user_input", "{}", "old-input"),
      event("2026-07-26T06:00:00Z", "task_started", { turn_id: "new" }),
    ],
    activeThread("new", { status: { type: "notLoaded" } }),
    Date.parse("2026-07-26T06:00:01Z"),
  );
  assert.equal(nextTurn.status, "running");
});

test("activeFlags와 terminal Turn 상태를 우선하고 종료 시각에서 duration을 멈춘다", () => {
  const waiting = reduceThreadRecords(
    null,
    [],
    activeThread("turn-1", {
      status: { type: "active", activeFlags: ["waitingOnApproval"] },
    }),
    Date.parse("2026-07-26T06:00:10Z"),
  );
  assert.equal(waiting.status, "needs_input");

  const failed = reduceThreadRecords(
    null,
    [],
    activeThread("turn-1", {
      turn: {
        status: "failed",
        completedAt: unix("2026-07-26T06:00:10Z"),
      },
    }),
    Date.parse("2026-07-26T07:00:00Z"),
  );
  assert.equal(failed.status, "failed");
  assert.equal(failed.durationSeconds, 10);

  const interrupted = reduceThreadRecords(
    null,
    [],
    activeThread("turn-1", {
      turn: {
        status: "interrupted",
        completedAt: unix("2026-07-26T06:00:05Z"),
      },
    }),
    Date.parse("2026-07-26T07:00:00Z"),
  );
  assert.equal(interrupted.status, "stopped");
  assert.equal(interrupted.durationSeconds, 5);
});

test("task_complete의 종료 상태를 보존하고 오래된 미완료 Turn은 Idle로 내린다", () => {
  const complete = reduceThreadRecords(
    null,
    [
      event("2026-07-26T06:00:00Z", "task_started", { turn_id: "turn-1" }),
      event("2026-07-26T06:00:06Z", "task_complete", {
        turn_id: "turn-1",
        completed_at: "2026-07-26T06:00:06Z",
        status: "cancelled",
      }),
    ],
    activeThread("turn-1"),
    Date.parse("2026-07-26T07:00:00Z"),
  );
  assert.equal(complete.status, "cancelled");
  assert.equal(complete.durationSeconds, 6);

  const idleStart = Date.parse("2026-07-26T06:00:00Z");
  const idle = reduceThreadRecords(
    null,
    [event("2026-07-26T06:00:00Z", "task_started", { turn_id: "turn-1" })],
    activeThread("turn-1"),
    idleStart + IDLE_AFTER_MS + 1,
  );
  assert.equal(idle.status, "idle");
});
