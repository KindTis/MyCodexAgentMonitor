import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFile } from "node:fs/promises";
import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  server: { middlewareMode: true },
});
const {
  App,
  GlobalActivityBoard,
  SessionDetail,
  SessionRow,
} = await server.ssrLoadModule("/src/App.jsx");
const appSource = await readFile(
  new URL("../src/App.jsx", import.meta.url),
  "utf8",
);

test.after(async () => {
  await server.close();
});

const collectedAt = "2026-07-29T03:05:00Z";
const clock = Date.parse("2026-07-29T03:05:04Z");

function rootSession(id, status, overrides = {}) {
  return {
    id,
    threadId: id,
    parentSessionId: null,
    projectName: "MyCodexAgentMonitor",
    gitBranch: "main",
    session: `Session ${id}`,
    assignedWork: "Implement the activity board",
    status,
    statusBasis: "observed",
    isWorking: status === "running",
    startedAt: "2026-07-29T03:00:00Z",
    lastActivityAt: "2026-07-29T03:04:00Z",
    durationSeconds: 80,
    currentWork: { title: "Build global lanes" },
    currentActivity: {
      label: "Calling tool",
      startedAt: "2026-07-29T03:04:30Z",
    },
    activity: [{
      id: `${id}-latest`,
      label: "Run board tests",
      at: "2026-07-29T03:04:40Z",
    }],
    children: [],
    ...overrides,
  };
}

test("글로벌 보드는 루트 카드를 4개 고정 레인에 한 번씩 렌더링한다", () => {
  const sessions = [
    rootSession("active", "running"),
    rootSession("planning", "planning"),
    rootSession("waiting", "needs_input"),
    rootSession("inactive", "idle"),
    rootSession("failed", "failed"),
    rootSession("complete", "complete"),
  ];
  const markup = renderToStaticMarkup(createElement(GlobalActivityBoard, {
    sessions,
    onSelect() {},
    clock,
    wallClock: clock,
    collectedAt,
    isLive: true,
    isConnected: true,
    changes: Object.fromEntries(sessions.map(({ id }) => [
      id,
      { activityIds: [`${id}-latest`] },
    ])),
  }));

  for (const label of [
    "Active",
    "Waiting",
    "Inactive",
    "Ended",
  ]) {
    assert.match(markup, new RegExp(`>${label}<`));
  }
  assert.equal(markup.match(/data-board-session-id=/g)?.length, sessions.length);
  assert.equal(
    new Set([...markup.matchAll(/data-board-session-id="([^"]+)"/g)]
      .map((match) => match[1])).size,
    sessions.length,
  );
  assert.match(markup, /MyCodexAgentMonitor/);
  assert.match(markup, /Build global lanes/);
  assert.match(markup, /Run board tests/);
  assert.doesNotMatch(markup, />Calling tool</);
  assert.match(markup, /aria-controls="session-detail"/);
  assert.doesNotMatch(markup, /data-board-session-id="[^"]+"[^>]*aria-pressed/);
});

test("글로벌 카드는 세션명과 현재 작업을 별도 항목으로 렌더링한다", () => {
  const session = rootSession("working", "running", {
    session: "Color palette session",
    currentWork: { title: "Review the latest color feedback" },
  });
  const markup = renderToStaticMarkup(createElement(GlobalActivityBoard, {
    sessions: [session],
    onSelect() {},
    clock,
    wallClock: clock,
    collectedAt,
    isLive: true,
    isConnected: true,
    changes: { working: { activityIds: [] } },
  }));

  assert.match(markup, /class="global-card-session">Color palette session<\/span>/);
  assert.match(markup, /class="global-card-work">Review the latest color feedback<\/span>/);
});

test("글로벌 보드는 자식을 부모와 별도 카드로 표시하고 Child 상세를 직접 연다", () => {
  const child = {
    id: "child-a",
    threadId: "child-a",
    parentSessionId: "root-a",
    agentNickname: "navigator",
    model: "gpt-5.6-sol",
    status: "waiting",
    statusBasis: "observed",
    isWorking: false,
    startedAt: "2026-07-29T03:02:00Z",
    lastActivityAt: "2026-07-29T03:04:50Z",
    durationSeconds: 45,
    currentWork: { turnId: "turn-child", title: "Inspect child activity" },
    currentActivity: {
      label: "Reading App.jsx",
      startedAt: "2026-07-29T03:04:45Z",
    },
    activity: [{
      id: "child-latest",
      label: "Read App.jsx",
      at: "2026-07-29T03:04:50Z",
    }],
    skills: [],
    plan: null,
    goal: null,
  };
  const secondChild = {
    ...child,
    id: "child-b",
    threadId: "child-b",
    agentNickname: "reviewer",
    model: "gpt-5.6-terra",
    status: "running",
    isWorking: true,
    lastActivityAt: "2026-07-29T03:04:55Z",
    activity: [{
      id: "child-b-latest",
      label: "Review App.jsx",
      at: "2026-07-29T03:04:55Z",
    }],
  };
  const root = rootSession("root-a", "running", {
    session: "Parent session",
    children: [child, secondChild],
  });
  const render = (selectedChildId = null) => renderToStaticMarkup(
    createElement(GlobalActivityBoard, {
      sessions: [root],
      onSelect() {},
      selectedChildId,
      onSelectChild() {},
      clock,
      wallClock: clock,
      collectedAt,
      isLive: true,
      isConnected: true,
      changes: { "root-a": { activityIds: [] } },
    }),
  );
  const board = render();

  assert.equal(board.match(/data-board-session-id=/g)?.length, 3);
  assert.equal(board.match(/class="global-card-child-tag"/g)?.length, 2);
  assert.equal(board.match(/MyCodexAgentMonitor/g)?.length, 3);
  assert.equal(board.match(/>Parent session<\/span>/g)?.length, 3);
  assert.match(
    board,
    /class="global-card-child-agent"[\s\S]*navigator[\s\S]*gpt-5\.6-sol/,
  );

  const activeLane = board.slice(
    board.indexOf("activity-lane--active"),
    board.indexOf("activity-lane--waiting"),
  );
  assert.ok(
    activeLane.indexOf('data-board-session-id="child-b"')
      < activeLane.indexOf('data-board-session-id="root-a"'),
  );
  assert.match(activeLane, /activity-lane-heading[\s\S]*<span>2<\/span>/);

  const waitingLane = board.slice(
    board.indexOf("activity-lane--waiting"),
    board.indexOf("activity-lane--inactive"),
  );
  assert.match(waitingLane, /data-board-session-id="child-a"/);
  assert.match(waitingLane, /activity-lane-heading[\s\S]*<span>1<\/span>/);

  const childCardStart = board.indexOf('data-board-session-id="child-a"');
  const childCard = board.slice(
    childCardStart,
    board.indexOf("</button>", childCardStart),
  );
  assert.match(childCard, /aria-haspopup="dialog"/);
  assert.match(childCard, /aria-controls="child-agent-dialog"/);
  assert.match(render("child-a"), /id="child-agent-dialog"/);
});

test("루트 세션이 없으면 레인 대신 보드 전체 빈 상태를 표시한다", () => {
  const markup = renderToStaticMarkup(createElement(GlobalActivityBoard, {
    sessions: [],
    onSelect() {},
    clock,
    wallClock: clock,
    collectedAt,
    isLive: false,
    isConnected: true,
    changes: {},
  }));

  assert.match(markup, /Global activity/);
  assert.match(markup, /There are no sessions in the current server snapshot/);
  assert.doesNotMatch(markup, /class="activity-lane"/);
});

test("새 activity가 카드에 표시되는 최신 항목일 때만 이벤트 줄을 강조한다", () => {
  const session = rootSession("working", "running", {
    activity: [
      {
        id: "newest",
        label: "Newest visible event",
        at: "2026-07-29T03:04:40Z",
      },
      {
        id: "new-but-older",
        label: "Older event",
        at: "2026-07-29T03:04:20Z",
      },
    ],
  });
  const render = (activityIds) => renderToStaticMarkup(createElement(
    GlobalActivityBoard,
    {
      sessions: [session],
      onSelect() {},
      clock,
      wallClock: clock,
      collectedAt,
      isLive: true,
      isConnected: true,
      changes: { working: { activityIds } },
    },
  ));

  assert.doesNotMatch(
    render(["new-but-older"]),
    /global-card-activity--updated/,
  );
  assert.match(render(["newest"]), /global-card-activity--updated/);
});

test("초기 App은 첫 세션 자동 선택 코드 없이 글로벌 보드를 렌더링한다", () => {
  const markup = renderToStaticMarkup(createElement(App));

  assert.match(markup, /id="global-activity-title"/);
  assert.doesNotMatch(markup, /id="session-detail"/);
  assert.doesNotMatch(appSource, /setSelectedSessionId\(visibleSessions\[0\]/);
});

test("Paused와 연결 오류에서는 상대 시각만 계속 흐른다", () => {
  const session = rootSession("working", "running");

  for (const mode of [
    { isLive: false, isConnected: true },
    { isLive: true, isConnected: false },
  ]) {
    const render = (wallClock) => ({
      board: renderToStaticMarkup(createElement(GlobalActivityBoard, {
        sessions: [session],
        onSelect() {},
        clock,
        wallClock,
        collectedAt,
        changes: {},
        ...mode,
      })),
      row: renderToStaticMarkup(createElement(SessionRow, {
        session,
        selected: false,
        onSelect() {},
        clock,
        wallClock,
        changes: { childIds: [] },
        collectedAt,
      })),
      detail: renderToStaticMarkup(createElement(SessionDetail, {
        session,
        selectedChildId: null,
        onSelectChild() {},
        onClose() {},
        onOpenCodex() {},
        clock,
        wallClock,
        changes: {
          tokenKeys: [],
          taskTitles: [],
          childIds: [],
          handoffChildIds: [],
          activityIds: [],
        },
        collectedAt,
      })),
    });
    const initial = render(clock);
    const later = render(clock + 60_000);

    assert.match(initial.board, /Last applied 4s ago/);
    assert.match(initial.board, /Run board tests · 24s ago/);
    assert.match(initial.row, /Calling tool · 1m ago/);
    assert.match(initial.detail, /Last update 1m ago/);
    assert.match(initial.detail, />34s<\/time>/);
    assert.match(later.board, /Last applied 1m ago/);
    assert.match(later.board, /Run board tests · 1m ago/);
    assert.match(later.row, /Calling tool · 2m ago/);
    assert.match(later.detail, /Last update 2m ago/);
    assert.match(later.detail, />34s<\/time>/);
    assert.match(initial.board, /1:24 session/);
    assert.match(initial.row, />1:24<\/strong>/);
    assert.match(initial.detail, /1:24 session/);
    assert.match(later.board, /1:24 session/);
    assert.match(later.row, />1:24<\/strong>/);
    assert.match(later.detail, /1:24 session/);
  }
});

test("목록 행과 글로벌 카드는 서로 다른 선택 접근성 계약을 사용한다", () => {
  const session = rootSession("root-a", "running");
  const rowMarkup = renderToStaticMarkup(createElement(SessionRow, {
    session,
    selected: true,
    onSelect() {},
    clock,
    wallClock: clock,
    changes: { childIds: [] },
    collectedAt,
  }));
  const boardMarkup = renderToStaticMarkup(createElement(GlobalActivityBoard, {
    sessions: [session],
    onSelect() {},
    clock,
    wallClock: clock,
    collectedAt,
    isLive: true,
    isConnected: true,
    changes: {},
  }));

  assert.match(rowMarkup, /aria-pressed="true"/);
  assert.match(rowMarkup, /aria-controls="session-detail"/);
  const boardCard = boardMarkup.slice(
    boardMarkup.indexOf("data-board-session-id"),
    boardMarkup.indexOf("</button>"),
  );
  assert.match(boardCard, /aria-label="Open details for Session root-a"/);
  assert.match(boardCard, /aria-controls="session-detail"/);
  assert.doesNotMatch(boardCard, /aria-pressed/);
});

test("상세 제목은 프로그램 포커스를 받고 닫기 버튼을 제공한다", () => {
  const session = rootSession("root-a", "running", {
    plan: { tasks: [] },
    goal: null,
    skills: [],
    tokens: { total: 0, root: 0, children: 0 },
  });
  const markup = renderToStaticMarkup(createElement(SessionDetail, {
    session,
    selectedChildId: null,
    onSelectChild() {},
    onClose() {},
    onOpenCodex() {},
    clock,
    wallClock: clock,
    changes: {
      tokenKeys: [],
      taskTitles: [],
      childIds: [],
      handoffChildIds: [],
      activityIds: [],
    },
    collectedAt,
  }));

  assert.match(markup, /id="session-detail-title" tabindex="-1"/);
  assert.match(markup, /aria-label="Close session details"/);
});
