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
} = await server.ssrLoadModule("/src/App.jsx");

test.after(async () => {
  await server.close();
});

test("연결 상태는 상태별 아이콘과 공통 하이라이트 배지로 표시된다", () => {
  assert.equal(typeof ConnectionState, "function");

  for (const [status, label] of [
    ["connected", "Connected"],
    ["syncing", "Syncing"],
    ["error", "Error"],
  ]) {
    const markup = renderToStaticMarkup(createElement(
      ConnectionState,
      { status },
      "local Codex snapshot",
    ));

    assert.match(
      markup,
      new RegExp(`class="status-badge connection-state connection-state--${status}"`),
    );
    assert.match(markup, /<svg/);
    assert.match(markup, new RegExp(`${label} · local Codex snapshot`));
  }
});

test("좌측 목록은 사용 중인 Skills와 미완료 Tasks를 강조한다", () => {
  assert.equal(typeof SessionRow, "function");

  const renderRow = ({ skills, tasks }) => renderToStaticMarkup(createElement(SessionRow, {
    session: {
      id: "root-a",
      projectName: "MyCodexAgentMonitor",
      gitBranch: "main",
      session: "세션 목록 강조",
      assignedWork: "Skills와 Tasks 상태 표시",
      status: "running",
      startedAt: "2026-07-26T06:00:00Z",
      durationSeconds: 75,
      lastActivityAt: "2026-07-26T06:00:02Z",
      currentActivity: null,
      skills,
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
    skills: ["graphify"],
    tasks: [
      { title: "조사", status: "done" },
      { title: "수정", status: "active" },
    ],
  });
  assert.match(section(activeMarkup, "session-skills", "session-tasks"), /metric-value--accent/);
  assert.match(section(activeMarkup, "session-tasks", "session-goal"), /metric-value--accent/);

  const completeMarkup = renderRow({
    skills: [],
    tasks: [{ title: "수정", status: "done" }],
  });
  assert.doesNotMatch(section(completeMarkup, "session-skills", "session-tasks"), /metric-value--accent/);
  assert.doesNotMatch(section(completeMarkup, "session-tasks", "session-goal"), /metric-value--accent/);
});

test("상세 헤더는 현재 브랜치명과 세션명만 제목으로 표시한다", () => {
  assert.equal(typeof SessionDetail, "function");

  const session = {
    id: "root-a",
    threadId: "root-a",
    parentSessionId: null,
    session: "MyCodexAgentMonitor",
    gitBranch: "feature/session-heading",
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

  assert.match(heading, /<p>feature\/session-heading<\/p>/);
  assert.match(
    heading,
    /<h2 id="session-detail-title" tabindex="-1">MyCodexAgentMonitor<\/h2>/,
  );
  assert.doesNotMatch(heading, /Selected session/);
  assert.doesNotMatch(heading, /<h2>Codex /);
});
