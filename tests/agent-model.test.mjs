import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVITY_LANES,
  formatCostUsd,
  formatDuration,
  formatGoalStatus,
  formatLocalClock,
  formatLocalTime,
  formatPercent,
  formatTokenCount,
  getDisplayedDuration,
  getActivityBoardLanes,
  getLatestSessionActivity,
  getPlanProgress,
  getRelativeTime,
  getRowScrollTop,
  getSessionMetrics,
  getSnapshotChanges,
  getVisibleSessions,
  normalizeStatus,
  sortSessions,
} from "../src/agent-model.js";

test("서버의 원시 시간과 토큰을 표시 문자열로 바꾼다", () => {
  assert.equal(formatDuration(65), "1:05");
  assert.equal(formatDuration(3605), "1:00:05");
  assert.equal(formatDuration(null), "—");
  assert.equal(formatTokenCount(112840), "112,840");
  assert.equal(formatTokenCount(522555500.6), "522,555,501");
  assert.equal(formatTokenCount(null), "—");
  assert.equal(formatCostUsd(369.26156), "$369.2616");
  assert.equal(formatCostUsd(null), "—");
  assert.equal(formatPercent(21.4), "21%");
  assert.equal(formatPercent(106.2), "106%");
  assert.equal(formatPercent(-1), "—");
  const localDate = new Date(2026, 6, 26, 21, 19, 44);
  assert.match(formatLocalClock(localDate), /^21:19:44 .+$/);
  assert.equal(formatLocalClock(null), "—");
  assert.equal(formatGoalStatus("usageLimited"), "Usage limited");
  assert.equal(formatGoalStatus("unknown"), "—");
  assert.equal(formatLocalTime(localDate), "21:19:44");
  assert.equal(formatLocalTime(null), "—");
});

test("연결된 Live 작업 시간만 snapshot 사이 경과 시간을 보간한다", () => {
  const session = { durationSeconds: 12, isWorking: true };
  const collectedAt = "2026-07-26T06:00:00Z";
  const nowMs = Date.parse("2026-07-26T06:00:02.900Z");

  assert.equal(getDisplayedDuration(session, collectedAt, nowMs), 14);
  assert.equal(
    getDisplayedDuration({ ...session, isWorking: false }, collectedAt, nowMs),
    12,
  );
  assert.equal(
    getDisplayedDuration(
      { ...session, statusBasis: "inferred" },
      collectedAt,
      nowMs,
    ),
    12,
  );
});

test("직전 snapshot과 달라진 토큰·Plan·child·활동·메시지만 표시한다", () => {
  const previousSnapshot = {
    sessions: [{
      id: "root",
      tokens: { root: 100, children: 20, total: 120 },
      plan: { tasks: [{ title: "수집기 구현", status: "active" }] },
      children: [{
        id: "child-a",
        status: "running",
        activity: [{ id: "child-activity-1" }],
        messages: [{ id: "child-message-1" }],
      }],
      activity: [{ id: "activity-1" }],
      messages: [{ id: "message-1" }],
    }],
  };
  const nextSnapshot = {
    sessions: [{
      id: "root",
      tokens: { root: 140, children: 30, total: 170 },
      plan: { tasks: [{ title: "수집기 구현", status: "done" }] },
      children: [{
        id: "child-a",
        status: "complete",
        activity: [{ id: "child-activity-2" }, { id: "child-activity-1" }],
        messages: [{ id: "child-message-2" }, { id: "child-message-1" }],
      }],
      activity: [{ id: "activity-2" }, { id: "activity-1" }],
      messages: [{ id: "message-2" }, { id: "message-1" }],
    }],
  };
  const previousBefore = structuredClone(previousSnapshot);
  const nextBefore = structuredClone(nextSnapshot);
  const changes = getSnapshotChanges(previousSnapshot, nextSnapshot);

  assert.deepEqual(changes.root.tokenKeys, ["root", "children", "total"]);
  assert.deepEqual(changes.root.taskTitles, ["수집기 구현"]);
  assert.deepEqual(changes.root.childIds, ["child-a"]);
  assert.deepEqual(changes.root.handoffChildIds, ["child-a"]);
  assert.deepEqual(changes.root.activityIds, ["activity-2"]);
  assert.deepEqual(changes.root.messageIds, ["message-2"]);
  assert.deepEqual(changes.root.childChanges, {
    "child-a": {
      activityIds: ["child-activity-2"],
      messageIds: ["child-message-2"],
    },
  });
  assert.deepEqual(previousSnapshot, previousBefore);
  assert.deepEqual(nextSnapshot, nextBefore);
});

test("첫 root는 강조하지 않고 새로 발견된 complete child만 handoff한다", () => {
  const first = getSnapshotChanges(null, {
    sessions: [{
      id: "root",
      tokens: { root: 1, children: 0, total: 1 },
      plan: null,
      children: [],
      activity: [{ id: "first" }],
      messages: [{ id: "first-message" }],
    }],
  });
  assert.deepEqual(first.root, {
    tokenKeys: [],
    taskTitles: [],
    childIds: [],
    handoffChildIds: [],
    activityIds: [],
    messageIds: [],
    childChanges: {},
  });

  const changes = getSnapshotChanges(
    { sessions: [{ id: "root", children: [], activity: [] }] },
    {
      sessions: [{
        id: "root",
        children: [{ id: "new-complete", status: "complete" }],
        activity: [],
      }],
    },
  );
  assert.deepEqual(changes.root.handoffChildIds, ["new-complete"]);
  assert.deepEqual(changes.root.childChanges, {});
});

test("getPlanProgress reports completed tasks and the active task", () => {
  const result = getPlanProgress({
    tasks: [
      { title: "Map task dependencies", status: "done" },
      { title: "Build live event stream", status: "active" },
      { title: "Check session parser", status: "queued" },
      { title: "Publish monitor", status: "done" },
    ],
  });

  assert.deepEqual(result, {
    completed: 2,
    total: 4,
    activeTask: "Build live event stream",
  });
});

test("getSessionMetrics summarizes optional session capabilities", () => {
  assert.deepEqual(
    getSessionMetrics({
      skills: ["frontend-design", "playwright"],
      plan: {
        tasks: [
          { title: "Build ledger", status: "done" },
          { title: "Verify interactions", status: "active" },
        ],
      },
      goal: { status: "active" },
      children: [
        { status: "running" },
        { status: "waiting" },
        { status: "complete" },
      ],
    }),
    {
      skills: 2,
      tasks: { completed: 1, total: 2 },
      goalStatus: "active",
      subagents: { active: 2, total: 3 },
    },
  );
});

test("getSessionMetrics keeps absent tasks and goal visibly absent", () => {
  assert.deepEqual(getSessionMetrics({}), {
    skills: 0,
    tasks: null,
    goalStatus: null,
    subagents: { active: 0, total: 0 },
  });
});

test("normalizes server aliases and keeps only addressable root sessions", () => {
  assert.equal(normalizeStatus("approval_required"), "needs_input");
  assert.equal(normalizeStatus("executing"), "running");
  assert.equal(normalizeStatus("unexpected"), "idle");

  assert.deepEqual(
    getVisibleSessions([
      { id: "root-a" },
      { sessionId: "root-b", parentSessionId: null },
      { id: "child", parentSessionId: "root-a" },
      { assignedWork: "missing identifier" },
    ]).map((session) => session.id ?? session.sessionId),
    ["root-a", "root-b"],
  );
});

test("counts only operationally active child agents", () => {
  assert.deepEqual(
    getSessionMetrics({
      children: [
        { status: "running" },
        { status: "approval_required" },
        { status: "queued" },
        { status: "failed" },
        { status: "complete" },
      ],
    }).subagents,
    { active: 2, total: 5 },
  );
});

test("operational sorting puts attention first and uses recent activity as a tie-breaker", () => {
  const input = [
    { id: "complete", status: "complete", lastActivityAt: "2026-07-25T14:30:00Z" },
    { id: "running-old", status: "running", lastActivityAt: "2026-07-25T14:31:00Z" },
    { id: "attention", status: "input", lastActivityAt: "2026-07-25T14:29:00Z" },
    { id: "running-new", status: "executing", lastActivityAt: "2026-07-25T14:35:00Z" },
  ];

  assert.deepEqual(
    sortSessions(input).map((session) => session.id),
    ["attention", "running-new", "running-old", "complete"],
  );
  assert.deepEqual(input.map((session) => session.id), [
    "complete",
    "running-old",
    "attention",
    "running-new",
  ]);
});

test("column sorting keeps missing values last in both directions", () => {
  const input = [
    { id: "none", name: "No plan" },
    { id: "few", name: "Few", plan: { tasks: [{ status: "active" }] } },
    {
      id: "many",
      name: "Many",
      plan: { tasks: [{ status: "done" }, { status: "active" }, { status: "queued" }] },
    },
  ];

  assert.deepEqual(
    sortSessions(input, { key: "tasks", direction: "desc" }).map((session) => session.id),
    ["many", "few", "none"],
  );
  assert.deepEqual(
    sortSessions(input, { key: "tasks", direction: "asc" }).map((session) => session.id),
    ["few", "many", "none"],
  );
});

test("formats relative snapshot age without inventing precision", () => {
  const now = new Date("2026-07-25T14:37:00Z");

  assert.equal(getRelativeTime("2026-07-25T14:36:48Z", now), "12s ago");
  assert.equal(getRelativeTime("2026-07-25T14:32:00Z", now), "5m ago");
  assert.equal(getRelativeTime(null, now), "");
});

test("scrolls only enough to reveal a selected row in the rendered viewport", () => {
  assert.equal(
    getRowScrollTop({ rowIndex: 5, rowHeight: 130, viewportHeight: 650, scrollTop: 0 }),
    130,
  );
  assert.equal(
    getRowScrollTop({ rowIndex: 4, rowHeight: 130, viewportHeight: 650, scrollTop: 0 }),
    0,
  );
  assert.equal(
    getRowScrollTop({ rowIndex: 7, rowHeight: 45, viewportHeight: 270, scrollTop: 45 }),
    90,
  );
});

test("모든 화면 상태를 고정된 4개 글로벌 레인에 정확히 한 번 배치한다", () => {
  const sessions = [
    ["needs", "needs_input"],
    ["blocked", "blocked"],
    ["failed", "failed"],
    ["running", "running"],
    ["waiting", "waiting"],
    ["planning", "planning"],
    ["queued", "queued"],
    ["idle", "idle"],
    ["paused", "paused"],
    ["complete", "complete"],
    ["cancelled", "cancelled"],
    ["stopped", "stopped"],
    ["unknown", "new-server-state"],
  ].map(([id, status]) => ({ id, status }));

  const lanes = getActivityBoardLanes(sessions);

  assert.deepEqual(
    ACTIVITY_LANES.map(({ id, label }) => [id, label]),
    [
      ["active", "Active"],
      ["waiting", "Waiting"],
      ["inactive", "Inactive"],
      ["ended", "Ended"],
    ],
  );
  assert.deepEqual(
    Object.fromEntries(lanes.map(({ id, sessions: items }) => [
      id,
      items.map((session) => session.id),
    ])),
    {
      active: ["running", "planning", "queued"],
      waiting: ["blocked", "needs", "waiting"],
      inactive: ["idle", "paused", "unknown"],
      ended: ["failed", "cancelled", "complete", "stopped"],
    },
  );
  assert.equal(
    lanes.flatMap(({ sessions: items }) => items).length,
    sessions.length,
  );
});

test("글로벌 레인은 최근 활동, 시작 시각, ID 순으로 안정 정렬한다", () => {
  const sessions = [
    {
      id: "missing",
      status: "running",
      startedAt: "2026-07-29T01:00:00Z",
    },
    {
      id: "later-start",
      status: "running",
      lastActivityAt: "2026-07-29T02:00:00Z",
      startedAt: "2026-07-29T01:30:00Z",
    },
    {
      id: "a-id",
      status: "running",
      lastActivityAt: "2026-07-29T02:00:00Z",
      startedAt: "2026-07-29T01:00:00Z",
    },
    {
      id: "b-id",
      status: "running",
      lastActivityAt: "2026-07-29T02:00:00Z",
      startedAt: "2026-07-29T01:00:00Z",
    },
    {
      id: "latest",
      status: "running",
      lastActivityAt: "2026-07-29T03:00:00Z",
    },
  ];

  const active = getActivityBoardLanes(sessions)
    .find(({ id }) => id === "active")
    .sessions;

  assert.deepEqual(
    active.map(({ id }) => id),
    ["latest", "later-start", "a-id", "b-id", "missing"],
  );
  assert.deepEqual(
    sessions.map(({ id }) => id),
    ["missing", "later-start", "a-id", "b-id", "latest"],
  );
});

test("카드는 activity의 최신 시각을 우선하고 항목이 없을 때만 currentActivity를 사용한다", () => {
  const activities = [
    { id: "older", label: "Reading files", at: "2026-07-29T03:00:00Z" },
    { id: "newest", label: "Running tests", at: "2026-07-29T03:02:00Z" },
  ];

  assert.deepEqual(
    getLatestSessionActivity({
      activity: activities,
      currentActivity: {
        label: "Calling tool",
        startedAt: "2026-07-29T03:03:00Z",
      },
    }),
    activities[1],
  );
  assert.deepEqual(
    getLatestSessionActivity({
      activity: [],
      currentActivity: {
        label: "Calling tool",
        startedAt: "2026-07-29T03:03:00Z",
      },
    }),
    {
      id: null,
      label: "Calling tool",
      at: "2026-07-29T03:03:00Z",
    },
  );
  assert.equal(getLatestSessionActivity({ activity: [] }), null);
  assert.deepEqual(activities.map(({ id }) => id), ["older", "newest"]);
});
