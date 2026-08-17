import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  server: { middlewareMode: true },
});
const {
  ConnectionState,
  SessionDetail,
  SessionRow,
  SystemSummary,
} = await server.ssrLoadModule("/src/App.jsx");

test.after(async () => {
  await server.close();
});

test("연결 상태는 상태별 아이콘과 평면 요약 스타일로 표시된다", () => {
  assert.equal(typeof ConnectionState, "function");

  for (const [status, label] of [
    ["connected", "Connected"],
    ["syncing", "Syncing"],
    ["error", "Error"],
  ]) {
    const markup = renderToStaticMarkup(createElement(
      ConnectionState,
      { status },
    ));

    assert.match(
      markup,
      new RegExp(`class="summary-item connection-state connection-state--${status}"`),
    );
    assert.doesNotMatch(markup, /status-badge/);
    assert.match(markup, /<svg/);
    assert.match(markup, new RegExp(`>${label}</span>$`));
    assert.doesNotMatch(markup, /local Codex snapshot| · /);
  }
});

test("좌측 목록은 Skills를 표시하지 않고 미완료 Tasks만 강조한다", () => {
  assert.equal(typeof SessionRow, "function");

  const renderRow = ({ tasks }) => renderToStaticMarkup(createElement(SessionRow, {
    session: {
      id: "root-a",
      projectName: "MyCodexAgentMonitor",
      gitBranch: "main",
      session: "세션 목록 강조",
      assignedWork: "Tasks 상태 표시",
      status: "running",
      startedAt: "2026-07-26T06:00:00Z",
      durationSeconds: 75,
      lastActivityAt: "2026-07-26T06:00:02Z",
      currentActivity: null,
      skills: ["graphify"],
      plan: { tasks },
      goal: null,
      children: [],
    },
    selected: false,
    onSelect() {},
    clock: Date.parse("2026-07-26T06:00:03Z"),
    changes: { childIds: [] },
    collectedAt: "2026-07-26T06:00:03Z",
  }));
  const section = (markup, start, end) => markup.slice(
    markup.indexOf(`class="${start}"`),
    markup.indexOf(`class="${end}"`),
  );

  const activeMarkup = renderRow({
    tasks: [
      { title: "조사", status: "done" },
      { title: "수정", status: "active" },
    ],
  });
  assert.doesNotMatch(activeMarkup, /session-skills|>Skills</);
  assert.match(section(activeMarkup, "session-tasks", "session-goal"), /metric-value--accent/);

  const completeMarkup = renderRow({
    tasks: [{ title: "수정", status: "done" }],
  });
  assert.doesNotMatch(section(completeMarkup, "session-tasks", "session-goal"), /metric-value--accent/);
});

test("상세 헤더는 세션명 아래에 현재 브랜치명과 모델명을 표시한다", () => {
  assert.equal(typeof SessionDetail, "function");

  const session = {
    id: "root-a",
    threadId: "root-a",
    parentSessionId: null,
    session: "MyCodexAgentMonitor",
    gitBranch: "feature/session-heading",
    model: "gpt-5.6-sol",
    status: "waiting",
    isWorking: false,
    lastActivityAt: "2026-07-26T06:00:02Z",
    startedAt: "2026-07-26T06:00:00Z",
    durationSeconds: 75,
    currentWork: null,
    currentActivity: null,
    skills: [],
    plan: { tasks: [] },
    goal: null,
    children: [],
    activity: [],
    tokens: { total: 0, root: 0, children: 0 },
  };
  const markup = renderToStaticMarkup(createElement(SessionDetail, {
    session,
    selectedChildId: null,
    onSelectChild() {},
    onOpenCodex() {},
    clock: Date.parse("2026-07-26T06:00:03Z"),
    changes: {
      tokenKeys: [],
      taskTitles: [],
      childIds: [],
      handoffChildIds: [],
      activityIds: [],
    },
    collectedAt: "2026-07-26T06:00:03Z",
  }));
  const heading = markup.slice(0, markup.indexOf("</header>"));

  assert.match(
    heading,
    /<h2 id="session-detail-title" tabindex="-1">MyCodexAgentMonitor<\/h2><p><span>feature\/session-heading<\/span><span class="detail-model">gpt-5\.6-sol<\/span><\/p>/,
  );
  assert.doesNotMatch(heading, /Selected session/);
  assert.doesNotMatch(heading, /<h2>Codex /);
  assert.ok(
    heading.indexOf("Open in Codex") < heading.indexOf('aria-label="Close session details"'),
  );
  assert.match(markup, /Plan Tasks<\/span>/);
});

test("Current work는 최근 agent 메시지 10개와 새 메시지 강조를 표시한다", () => {
  const session = {
    id: "root-a",
    session: "최근 메시지 표시",
    gitBranch: "main",
    status: "running",
    isWorking: true,
    lastActivityAt: "2026-07-26T06:00:07Z",
    startedAt: "2026-07-26T06:00:00Z",
    durationSeconds: 7,
    currentWork: { turnId: "turn-1", title: "메시지 표시 구현" },
    currentActivity: null,
    messages: Array.from({ length: 10 }, (_, offset) => offset + 1).map((index) => ({
      id: `message-${index}`,
      at: `2026-07-26T06:00:0${index}Z`,
      text: `agent message ${index}`,
    })),
    skills: [],
    plan: null,
    goal: null,
    children: [],
    activity: [],
    tokens: { total: 0, root: 0, children: 0 },
  };
  const markup = renderToStaticMarkup(createElement(SessionDetail, {
    session,
    selectedChildId: null,
    onSelectChild() {},
    onOpenCodex() {},
    clock: Date.parse("2026-07-26T06:00:08Z"),
    changes: {
      tokenKeys: [],
      taskTitles: [],
      childIds: [],
      handoffChildIds: [],
      activityIds: [],
      messageIds: ["message-10"],
    },
    collectedAt: "2026-07-26T06:00:08Z",
  }));

  assert.match(markup, /Recent messages/);
  assert.equal(markup.match(/class="message-item(?: message-item--updated)?"/g)?.length, 10);
  assert.equal(markup.match(/class="message-button"/g)?.length, 10);
  assert.equal(markup.match(/message-item--updated/g)?.length, 1);
  assert.match(markup, /agent message 1/);
  assert.match(markup, /agent message 10/);
});

test("상단 요약은 연결·실행·대기·세션 상태를 구분해 표시한다", () => {
  const markup = renderToStaticMarkup(createElement(SystemSummary, {
    connectionStatus: "connected",
    runningCount: 2,
    waitingCount: 1,
    sessionCount: 4,
    usage: {},
    wallClock: new Date(2026, 7, 1, 12, 0, 0).getTime(),
    isLive: true,
  }));

  assert.equal(markup.match(/class="summary-item/g)?.length, 4);
  assert.equal(markup.match(/<svg/g)?.length, 3);
  assert.match(markup, /Connected/);
  assert.match(markup, /2 running/);
  assert.match(markup, /1 waiting/);
  assert.match(markup, /4 sessions/);
});
