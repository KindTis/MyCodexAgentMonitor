import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  server: { middlewareMode: true },
});
const { ConnectionState, SessionDetail } = await server.ssrLoadModule("/src/App.jsx");

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
  assert.match(heading, /<h2>MyCodexAgentMonitor<\/h2>/);
  assert.doesNotMatch(heading, /Selected session/);
  assert.doesNotMatch(heading, /<h2>Codex /);
});
