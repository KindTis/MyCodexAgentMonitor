import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  appendFile,
  mkdir,
  mkdtemp,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  classifyChildSource,
  classifyToolCall,
  discoverChildCandidates,
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

function execCall(timestamp, input, callId = `exec-${timestamp}`) {
  return {
    timestamp,
    type: "response_item",
    payload: {
      type: "custom_tool_call",
      id: callId,
      call_id: callId,
      name: "exec",
      input,
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

function assistantMessage(timestamp, id, text) {
  return {
    timestamp,
    type: "response_item",
    payload: {
      type: "message",
      id,
      role: "assistant",
      content: [{ type: "output_text", text }],
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

function sessionMeta({
  id,
  parentThreadId,
  timestamp,
  source,
  nickname = null,
  role = null,
}) {
  return {
    timestamp,
    type: "session_meta",
    payload: {
      id,
      session_id: id,
      parent_thread_id: parentThreadId,
      timestamp,
      cwd: "C:\\repo",
      source,
      agent_nickname: nickname,
      agent_role: role,
    },
  };
}

async function createTempRoot(t) {
  const root = await mkdtemp(path.join(tmpdir(), "codex-monitor-jsonl-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("최근 session_meta에서 spawn child를 찾고 guardian과 미분류를 구분한다", async (t) => {
  const root = await createTempRoot(t);
  const day = path.join(root, "sessions", "2026", "07", "26");
  await mkdir(day, { recursive: true });
  const records = [
    sessionMeta({
      id: "user-child",
      parentThreadId: "root",
      timestamp: "2026-07-26T06:00:01Z",
      source: {
        subagent: {
          thread_spawn: {
            parent_thread_id: "root",
            depth: 1,
            agent_path: "/root/reviewer",
            agent_nickname: "Ada",
            agent_role: null,
          },
        },
      },
      nickname: "Ada",
    }),
    sessionMeta({
      id: "guardian",
      parentThreadId: "root",
      timestamp: "2026-07-26T06:00:02Z",
      source: { subagent: { other: "guardian" } },
    }),
    sessionMeta({
      id: "unknown",
      parentThreadId: "root",
      timestamp: "2026-07-26T06:00:03Z",
      source: { subagent: { other: "future-kind" } },
    }),
  ];
  const files = await Promise.all(records.map(async (record) => {
    const file = path.join(day, `${record.payload.id}.jsonl`);
    await writeFile(file, `${JSON.stringify(record)}\n{"private":"not-read"}\n`, "utf8");
    return file;
  }));

  const candidates = await discoverChildCandidates({
    codexHome: root,
    parentThreadIds: ["root"],
    updatedAfterMs: 0,
  });

  assert.deepEqual(
    candidates.map(({ id }) => id).sort(),
    ["guardian", "unknown", "user-child"],
  );
  const user = candidates.find(({ id }) => id === "user-child");
  assert.equal(user.parentThreadId, "root");
  assert.equal(user.agentNickname, "Ada");
  assert.equal(classifyChildSource(user.source), "user");
  assert.equal(classifyChildSource(candidates.find(({ id }) => id === "guardian").source), "guardian");
  assert.equal(classifyChildSource(candidates.find(({ id }) => id === "unknown").source), "unknown");
  assert.equal(classifyChildSource("subAgent"), "user");
  assert.equal(classifyChildSource("subAgentOther"), "unknown");

  const newestMtime = Math.max(...await Promise.all(
    files.map(async (file) => (await stat(file)).mtimeMs),
  ));
  assert.deepEqual(await discoverChildCandidates({
    codexHome: root,
    parentThreadIds: ["root"],
    updatedAfterMs: newestMtime + 1,
  }), []);
});

test("mtime이 고정돼도 파일 크기가 바뀐 root session_meta를 찾는다", async (t) => {
  const root = await createTempRoot(t);
  const day = path.join(root, "sessions", "2026", "07", "26");
  await mkdir(day, { recursive: true });
  const file = path.join(day, "active-root.jsonl");
  await writeFile(file, `${JSON.stringify(sessionMeta({
    id: "active-root",
    parentThreadId: null,
    timestamp: "2026-07-26T05:00:00Z",
    source: "cli",
  }))}\n`, "utf8");
  const staleTime = new Date("2026-07-26T05:00:00Z");
  await utimes(file, staleTime, staleTime);
  const knownFiles = new Map();
  const options = {
    codexHome: root,
    parentThreadIds: [null],
    updatedAfterMs: Date.parse("2026-07-26T06:00:00Z"),
    knownFiles,
  };

  assert.deepEqual(await discoverChildCandidates(options), []);

  await appendFile(file, '{"timestamp":"2026-07-26T06:00:01Z"}\n', "utf8");
  await utimes(file, staleTime, staleTime);

  const candidates = await discoverChildCandidates(options);

  assert.deepEqual(candidates.map(({ id }) => id), ["active-root"]);
});

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

test("현재 Turn의 작업·스킬·토큰과 최신 Plan을 유지한다", () => {
  const records = [
    event("2026-07-26T05:59:00Z", "task_started", { turn_id: "old" }),
    toolCall("2026-07-26T05:59:01Z", "wait_agent", "{}", "old-wait"),
    event("2026-07-26T06:00:00Z", "task_started", {
      turn_id: "current",
      started_at: "2026-07-26T06:00:00Z",
    }),
    {
      timestamp: "2026-07-26T06:00:00.500Z",
      type: "turn_context",
      payload: { turn_id: "current", model: "gpt-5.6-sol" },
    },
    event("2026-07-26T06:00:01Z", "user_message", {
      message: "$superpowers:using-superpowers 현황판을 구현해.\n"
        + "<environment_context>구조 정보</environment_context>",
    }),
    event("2026-07-26T06:00:01.100Z", "user_message", {
      message: "$myloop 마지막 작업을 확인해.",
    }),
    event("2026-07-26T06:00:01.200Z", "user_message", {
      message: "<environment_context>구조 정보만 있음</environment_context>",
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
  assert.equal(result.model, "gpt-5.6-sol");
  assert.equal(result.assignedWork, "마지막 작업을 확인해.");
  assert.deepEqual(result.skills, ["superpowers:using-superpowers", "myloop"]);
  assert.deepEqual(result.plan.tasks, [
    { title: "수집기 구현", status: "active" },
    { title: "화면 연결", status: "queued" },
  ]);
  assert.equal(result.tokens, 420);
  assert.equal(result.status, "planning");
  assert.equal(result.currentActivity.label, "Update plan · 2 tasks");
});

test("새 Turn에서도 마지막 완료 Plan을 다시 수집해 유지한다", () => {
  const records = [
    event("2026-08-01T19:01:00Z", "task_started", { turn_id: "old" }),
    toolCall("2026-08-01T19:01:01Z", "update_plan", JSON.stringify({
      plan: [
        { step: "원인 확인", status: "completed" },
        { step: "회귀 테스트", status: "completed" },
        { step: "수정 적용", status: "completed" },
        { step: "전체 검증", status: "completed" },
      ],
    }), "old-plan"),
    event("2026-08-01T19:02:00Z", "task_complete", { turn_id: "old" }),
    event("2026-08-01T19:03:00Z", "task_started", { turn_id: "current" }),
    event("2026-08-01T19:03:01Z", "user_message", { message: "후속 질문" }),
  ];

  const result = reduceThreadRecords(
    null,
    records,
    activeThread("current"),
    Date.parse("2026-08-01T19:03:02Z"),
  );

  assert.equal(result.turnId, "current");
  assert.equal(result.assignedWork, "후속 질문");
  assert.deepEqual(result.plan, {
    tasks: [
      { title: "원인 확인", status: "done" },
      { title: "회귀 테스트", status: "done" },
      { title: "수정 적용", status: "done" },
      { title: "전체 검증", status: "done" },
    ],
  });
});

test("최근 assistant 메시지 원문을 최신순 10개까지 수집한다", () => {
  const result = reduceThreadRecords(
    null,
    [
      event("2026-08-01T19:01:00Z", "task_started", { turn_id: "old" }),
      assistantMessage("2026-08-01T19:01:01Z", "assistant-1", "제외될 가장 오래된 메시지"),
      assistantMessage("2026-08-01T19:01:02Z", "assistant-2", "두 번째 메시지"),
      event("2026-08-01T19:02:00Z", "task_started", { turn_id: "current" }),
      assistantMessage("2026-08-01T19:02:01Z", "assistant-3", "세 번째 메시지"),
      {
        timestamp: "2026-08-01T19:02:02Z",
        type: "response_item",
        payload: {
          type: "message",
          id: "user-message",
          role: "user",
          content: [{ type: "input_text", text: "표시하면 안 되는 사용자 메시지" }],
        },
      },
      {
        timestamp: "2026-08-01T19:02:03Z",
        type: "response_item",
        payload: { type: "reasoning", id: "reasoning", summary: ["비공개 추론"] },
      },
      {
        timestamp: "2026-08-01T19:02:04Z",
        type: "response_item",
        payload: { type: "agent_message", id: "internal", text: "내부 에이전트 메시지" },
      },
      assistantMessage("2026-08-01T19:02:05Z", "assistant-4", "네 번째\n메시지"),
      assistantMessage("2026-08-01T19:02:06Z", "assistant-5", "다섯 번째 메시지"),
      assistantMessage("2026-08-01T19:02:07Z", "assistant-6", "여섯 번째 메시지"),
      assistantMessage("2026-08-01T19:02:08Z", "assistant-7", "일곱 번째 메시지"),
      assistantMessage("2026-08-01T19:02:09Z", "assistant-8", "여덟 번째 메시지"),
      assistantMessage("2026-08-01T19:02:10Z", "assistant-9", "아홉 번째 메시지"),
      assistantMessage("2026-08-01T19:02:11Z", "assistant-10", "열 번째 메시지"),
      assistantMessage("2026-08-01T19:02:12Z", "assistant-11", "가".repeat(170)),
    ],
    activeThread("current"),
    Date.parse("2026-08-01T19:02:13Z"),
  );

  assert.deepEqual(
    result.messages.map(({ id }) => id),
    [
      "assistant-11",
      "assistant-10",
      "assistant-9",
      "assistant-8",
      "assistant-7",
      "assistant-6",
      "assistant-5",
      "assistant-4",
      "assistant-3",
      "assistant-2",
    ],
  );
  assert.equal(result.messages[0].text, "가".repeat(170));
  assert.equal(result.messages.find(({ id }) => id === "assistant-4").text, "네 번째\n메시지");
  assert.doesNotMatch(JSON.stringify(result.messages), /사용자|비공개|내부 에이전트/);
});

test("Recent Activity를 최신순 10개까지 수집한다", () => {
  const calls = Array.from({ length: 11 }, (_, index) => execCall(
    `2026-08-01T19:02:${String(index + 1).padStart(2, "0")}Z`,
    'const result = await tools.shell_command({ command: "npm.cmd test" }); text(result);',
    `activity-${index + 1}`,
  ));
  const result = reduceThreadRecords(
    null,
    [event("2026-08-01T19:02:00Z", "task_started", { turn_id: "current" }), ...calls],
    activeThread("current"),
    Date.parse("2026-08-01T19:02:12Z"),
  );

  assert.deepEqual(result.activity.map(({ id }) => id), [
    "activity-11", "activity-10", "activity-9", "activity-8", "activity-7",
    "activity-6", "activity-5", "activity-4", "activity-3", "activity-2",
  ]);
});

test("도구 입력을 안전하고 읽을 수 있는 Recent Activity로 요약한다", () => {
  const cases = [
    {
      record: toolCall("2026-08-01T19:02:01Z", "shell_command", JSON.stringify({
        command: "npm.cmd test",
      })),
      expected: "Run · npm.cmd test",
    },
    {
      record: execCall(
        "2026-08-01T19:02:01Z",
        'const r = await tools.shell_command({command:"graphify query \\\"activity flow\\\""}); text(r);',
      ),
      expected: "Run · graphify query",
    },
    {
      record: toolCall("2026-08-01T19:02:01Z", "wait", JSON.stringify({
        cell_id: "cell-1",
        yield_time_ms: 10000,
      })),
      expected: "Wait for command · up to 10s",
    },
    {
      record: toolCall("2026-08-01T19:02:01Z", "wait_agent", JSON.stringify({
        timeout_ms: 30000,
      })),
      expected: "Wait for child agents · up to 30s",
    },
    {
      record: toolCall("2026-08-01T19:02:01Z", "request_user_input", JSON.stringify({
        questions: [],
      })),
      expected: "Wait for user input",
    },
    {
      record: toolCall("2026-08-01T19:02:01Z", "shell_command", JSON.stringify({
        command: '$env:OPENAI_API_KEY="private-value"; npm.cmd test',
      })),
      expected: "Run · $env:OPENAI_API_KEY=***; npm.cmd test",
    },
  ];

  for (const { record, expected } of cases) {
    const result = reduceThreadRecords(
      null,
      [event("2026-08-01T19:02:00Z", "task_started", { turn_id: "current" }), record],
      activeThread("current"),
      Date.parse("2026-08-01T19:02:02Z"),
    );
    assert.equal(result.currentActivity.label, expected);
    assert.doesNotMatch(JSON.stringify(result.activity), /private-value/);
  }
});

test("exec 내부 update_plan의 현재 Plan을 수집한다", () => {
  const records = [
    event("2026-08-01T16:56:29Z", "task_started", { turn_id: "turn-1" }),
    execCall("2026-08-01T18:17:55Z", `const result = await tools.update_plan({
  explanation: "E2E 진행 상태를 갱신합니다.",
  plan: [
    { step: "권위 문서 확인", status: "completed" },
    { step: "fixture 준비", status: "completed" },
    { step: "정상 종단 실행", status: "completed" },
    { step: "제품 독립 검증", status: "completed" },
    { step: "실패 복귀 검증", status: "in_progress" },
    { step: "최종 보고", status: "pending" }
  ]
});
text(result);`, "exec-plan"),
  ];

  const result = reduceThreadRecords(
    null,
    records,
    activeThread("turn-1"),
    Date.parse("2026-08-01T18:17:56Z"),
  );

  assert.deepEqual(result.plan.tasks, [
    { title: "권위 문서 확인", status: "done" },
    { title: "fixture 준비", status: "done" },
    { title: "정상 종단 실행", status: "done" },
    { title: "제품 독립 검증", status: "done" },
    { title: "실패 복귀 검증", status: "active" },
    { title: "최종 보고", status: "queued" },
  ]);
});

test("exec 내부 compact JSON update_plan을 수집한다", () => {
  const result = reduceThreadRecords(
    null,
    [
      event("2026-08-01T19:09:09Z", "task_started", { turn_id: "turn-1" }),
      execCall(
        "2026-08-01T19:09:10Z",
        "const p = await tools.update_plan({\"explanation\":\"진행\",\"plan\":[{\"step\":\"현재 상태 확인\",\"status\":\"completed\"},{\"step\":\"수정 적용\",\"status\":\"in_progress\"}]});",
      ),
    ],
    activeThread("turn-1"),
    Date.parse("2026-08-01T19:09:11Z"),
  );

  assert.deepEqual(result.plan.tasks, [
    { title: "현재 상태 확인", status: "done" },
    { title: "수정 적용", status: "active" },
  ]);
});

test("exec의 주석 안 update_plan은 기존 Plan을 덮어쓰지 않는다", () => {
  const result = reduceThreadRecords(
    null,
    [
      event("2026-08-01T16:56:29Z", "task_started", { turn_id: "turn-1" }),
      toolCall("2026-08-01T16:56:30Z", "update_plan", JSON.stringify({
        plan: [{ step: "실제 작업", status: "in_progress" }],
      })),
      execCall("2026-08-01T16:56:31Z", `/* tools.update_plan({
  plan: [{ step: "주석뿐인 작업", status: "completed" }]
}); */
text("no plan update");`),
    ],
    activeThread("turn-1"),
    Date.parse("2026-08-01T16:56:32Z"),
  );

  assert.deepEqual(result.plan.tasks, [{ title: "실제 작업", status: "active" }]);
});

test("불완전한 호출 뒤의 마지막 정상 update_plan을 수집한다", () => {
  const result = reduceThreadRecords(
    null,
    [
      event("2026-08-01T16:56:29Z", "task_started", { turn_id: "turn-1" }),
      execCall("2026-08-01T16:56:30Z", `tools.update_plan({ plan: [
const latest = await tools.update_plan({
  plan: [{ step: "최신 계획", status: "in_progress" }]
});`),
    ],
    activeThread("turn-1"),
    Date.parse("2026-08-01T16:56:31Z"),
  );

  assert.deepEqual(result.plan.tasks, [{ title: "최신 계획", status: "active" }]);
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
  assert.equal(result.isWorking, true);
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

test("이전 배치의 현재 Turn에 다음 배치 wait_agent를 적용한다", () => {
  const thread = activeThread("turn-1", {
    status: { type: "notLoaded" },
    updatedAt: unix("2026-07-26T06:00:03Z"),
    turn: { status: "interrupted" },
  });
  let observation = reduceThreadRecords(
    null,
    [event("2026-07-26T06:00:00Z", "task_started", { turn_id: "turn-1" })],
    thread,
    Date.parse("2026-07-26T06:00:02Z"),
  );

  observation = reduceThreadRecords(
    observation,
    [toolCall("2026-07-26T06:00:03Z", "wait_agent", "{}", "wait-1")],
    thread,
    Date.parse("2026-07-26T06:00:04Z"),
  );

  assert.equal(observation.turnId, "turn-1");
  assert.equal(observation.currentActivity.label, "Wait for child agents");
  assert.equal(observation.status, "waiting");
  assert.equal(observation.statusBasis, "observed");
  assert.equal(observation.isWorking, false);
  assert.equal(observation.durationSeconds, 3);
});

test("현재 Turn의 App Server 대기는 inferred이고 더 최신 JSONL 활동이 우선한다", () => {
  const waitingThread = activeThread("turn-1", {
    updatedAt: unix("2026-07-26T06:00:01Z"),
    status: { type: "active", activeFlags: ["waitingOnApproval"] },
  });
  const inferred = reduceThreadRecords(
    null,
    [],
    waitingThread,
    Date.parse("2026-07-26T06:00:02Z"),
  );
  assert.equal(inferred.status, "needs_input");
  assert.equal(inferred.statusBasis, "inferred");
  assert.equal(inferred.isWorking, false);
  assert.equal(inferred.durationSeconds, 0);

  const observed = reduceThreadRecords(
    inferred,
    [
      event("2026-07-26T06:00:02Z", "task_started", { turn_id: "turn-1" }),
      toolCall("2026-07-26T06:00:03Z", "shell_command", "{}", "tool-1"),
    ],
    waitingThread,
    Date.parse("2026-07-26T06:00:04Z"),
  );
  assert.equal(observed.status, "running");
  assert.equal(observed.statusBasis, "observed");
  assert.equal(observed.isWorking, true);
});

test("App Server만 제공한 최근 상태는 inferred이고 시간을 누적하지 않는다", () => {
  const result = reduceThreadRecords(
    null,
    [],
    activeThread("turn-1", {
      status: { type: "notLoaded" },
      updatedAt: unix("2026-07-26T06:00:00Z"),
      turn: { status: "interrupted" },
    }),
    Date.parse("2026-07-26T06:00:05Z"),
  );

  assert.equal(result.status, "running");
  assert.equal(result.statusBasis, "inferred");
  assert.equal(result.isWorking, false);
  assert.equal(result.endedAt, null);
  assert.equal(result.durationSeconds, 0);
});

test("현재 Turn의 명시적 종료는 오래된 대기보다 우선한다", () => {
  const result = reduceThreadRecords(
    null,
    [
      event("2026-07-26T06:00:00Z", "task_started", { turn_id: "turn-1" }),
      event("2026-07-26T06:00:05Z", "task_complete", { turn_id: "turn-1" }),
    ],
    activeThread("turn-1", {
      status: { type: "active", activeFlags: ["waitingOnUserInput"] },
    }),
    Date.parse("2026-07-26T06:00:06Z"),
  );

  assert.equal(result.status, "complete");
  assert.equal(result.statusBasis, "observed");
  assert.equal(result.isWorking, false);
  assert.equal(result.durationSeconds, 5);
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
  assert.equal(nextTurn.isWorking, true);
  assert.equal(nextTurn.durationSeconds, 2);
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
  assert.equal(waiting.isWorking, false);

  let resumed = reduceThreadRecords(
    waiting,
    [event("2026-07-26T06:00:20Z", "task_started", { turn_id: "turn-1" })],
    activeThread("turn-1"),
    Date.parse("2026-07-26T06:00:20Z"),
  );
  assert.equal(resumed.isWorking, true);
  assert.equal(resumed.durationSeconds, 0);
  resumed = reduceThreadRecords(
    resumed,
    [],
    activeThread("turn-1"),
    Date.parse("2026-07-26T06:00:25Z"),
  );
  assert.equal(resumed.durationSeconds, 5);

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

test("승인 대기는 pending 도구가 시작된 시각부터 작업 시간에서 제외한다", () => {
  const waiting = reduceThreadRecords(
    null,
    [
      event("2026-07-26T06:00:00Z", "task_started", { turn_id: "turn-1" }),
      toolCall("2026-07-26T06:00:05Z", "shell_command", "{}", "approval-call"),
    ],
    activeThread("turn-1", {
      status: { type: "active", activeFlags: ["waitingOnApproval"] },
      updatedAt: unix("2026-07-26T06:00:10Z"),
    }),
    Date.parse("2026-07-26T06:00:10Z"),
  );

  assert.equal(waiting.status, "needs_input");
  assert.equal(waiting.isWorking, false);
  assert.equal(waiting.durationSeconds, 5);
});

test("notLoaded Thread의 interrupted Turn은 최신 JSONL 활동이 있으면 Running을 유지한다", () => {
  const result = reduceThreadRecords(
    null,
    [
      event("2026-07-26T06:00:00Z", "task_started", { turn_id: "turn-1" }),
      event("2026-07-26T06:00:05Z", "token_count", {
        info: { total_token_usage: { total_tokens: 10 } },
      }),
    ],
    activeThread("turn-1", {
      status: { type: "notLoaded" },
      turn: { status: "interrupted" },
    }),
    Date.parse("2026-07-26T06:00:06Z"),
  );

  assert.equal(result.status, "running");
  assert.equal(result.isWorking, true);
  assert.equal(result.durationSeconds, 6);
  assert.equal(result.endedAt, null);
});

test("모든 Turn의 작업 시간을 누적하고 사용자 입력과 child 대기만 제외한다", () => {
  const result = reduceThreadRecords(
    null,
    [
      event("2026-07-26T06:00:00Z", "task_started", { turn_id: "turn-1" }),
      toolCall("2026-07-26T06:00:02Z", "wait_agent", "{}", "child-wait"),
      toolOutput("2026-07-26T06:00:05Z", "child-wait"),
      event("2026-07-26T06:00:08Z", "task_complete", { turn_id: "turn-1" }),
      event("2026-07-26T06:00:20Z", "task_started", { turn_id: "turn-2" }),
      toolCall("2026-07-26T06:00:22Z", "request_user_input", "{}", "user-wait"),
      toolOutput("2026-07-26T06:00:30Z", "user-wait"),
      toolCall("2026-07-26T06:00:31Z", "wait", "{}", "tool-wait"),
      toolOutput("2026-07-26T06:00:34Z", "tool-wait"),
    ],
    activeThread("turn-2", {
      turn: { startedAt: unix("2026-07-26T06:00:20Z") },
    }),
    Date.parse("2026-07-26T06:00:35Z"),
  );

  assert.equal(result.status, "running");
  assert.equal(result.isWorking, true);
  assert.equal(result.durationSeconds, 12);
});

test("증분 수집에서 새 Turn으로 전환해도 이전 작업 시간을 유지한다", () => {
  let result = reduceThreadRecords(
    null,
    [event("2026-07-26T06:00:00Z", "task_started", { turn_id: "turn-1" })],
    activeThread("turn-1"),
    Date.parse("2026-07-26T06:00:05Z"),
  );
  assert.equal(result.durationSeconds, 5);

  result = reduceThreadRecords(
    result,
    [
      event("2026-07-26T06:00:08Z", "task_complete", { turn_id: "turn-1" }),
      event("2026-07-26T06:00:20Z", "task_started", { turn_id: "turn-2" }),
    ],
    activeThread("turn-2", {
      turn: { startedAt: unix("2026-07-26T06:00:20Z") },
    }),
    Date.parse("2026-07-26T06:00:25Z"),
  );

  assert.equal(result.durationSeconds, 13);
});

test("JSONL을 0부터 다시 읽어도 작업 구간을 중복 합산하지 않는다", () => {
  const records = [
    event("2026-07-26T06:00:00Z", "task_started", { turn_id: "turn-1" }),
    toolCall("2026-07-26T06:00:02Z", "wait_agent", "{}", "child-wait"),
    toolOutput("2026-07-26T06:00:05Z", "child-wait"),
    event("2026-07-26T06:00:08Z", "task_complete", { turn_id: "turn-1" }),
    event("2026-07-26T06:00:20Z", "task_started", { turn_id: "turn-2" }),
  ];
  const thread = activeThread("turn-2", {
    turn: { startedAt: unix("2026-07-26T06:00:20Z") },
  });
  let result = reduceThreadRecords(
    null,
    records,
    thread,
    Date.parse("2026-07-26T06:00:25Z"),
  );
  assert.equal(result.durationSeconds, 10);

  result = reduceThreadRecords(
    result,
    records,
    thread,
    Date.parse("2026-07-26T06:00:25Z"),
  );
  assert.equal(result.durationSeconds, 10);
});

test("task_complete를 보존하고 미지 사건을 무시해 정확히 10분부터 Idle로 내린다", () => {
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
  const records = [
    event("2026-07-26T06:00:00Z", "task_started", { turn_id: "turn-1" }),
    event("2026-07-26T06:09:59.999Z", "unknown_event"),
  ];
  const running = reduceThreadRecords(
    null,
    records,
    activeThread("turn-1"),
    idleStart + IDLE_AFTER_MS - 1,
  );
  assert.equal(running.status, "running");

  const idle = reduceThreadRecords(
    null,
    records,
    activeThread("turn-1"),
    idleStart + IDLE_AFTER_MS,
  );
  assert.equal(idle.status, "idle");
  assert.equal(idle.lastActivityAt, "2026-07-26T06:00:00.000Z");
});
