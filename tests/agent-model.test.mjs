import test from "node:test";
import assert from "node:assert/strict";

import {
  formatDuration,
  formatGoalStatus,
  formatTokenCount,
  formatUtcTime,
  getPlanProgress,
  getRelativeTime,
  getRowScrollTop,
  getSessionMetrics,
  getSnapshotChanges,
  getVisibleSessions,
  normalizeStatus,
  SESSION_LEDGER_VISIBLE_ROWS,
  sortSessions,
} from "../src/agent-model.js";

test("서버의 원시 시간과 토큰을 표시 문자열로 바꾼다", () => {
  assert.equal(formatDuration(65), "1:05");
  assert.equal(formatDuration(3605), "1:00:05");
  assert.equal(formatDuration(null), "—");
  assert.equal(formatTokenCount(112840), "112,840");
  assert.equal(formatTokenCount(null), "—");
  assert.equal(formatGoalStatus("usageLimited"), "Usage limited");
  assert.equal(formatGoalStatus("unknown"), "—");
  assert.equal(formatUtcTime("2026-07-26T06:00:02.000Z"), "06:00:02");
  assert.equal(formatUtcTime(null), "—");
});

test("직전 snapshot과 달라진 토큰·Plan·child·활동만 표시한다", () => {
  const previousSnapshot = {
    sessions: [{
      id: "root",
      tokens: { root: 100, children: 20, total: 120 },
      plan: { tasks: [{ title: "수집기 구현", status: "active" }] },
      children: [{ id: "child-a", status: "running" }],
      activity: [{ id: "activity-1" }],
    }],
  };
  const nextSnapshot = {
    sessions: [{
      id: "root",
      tokens: { root: 140, children: 30, total: 170 },
      plan: { tasks: [{ title: "수집기 구현", status: "done" }] },
      children: [{ id: "child-a", status: "complete" }],
      activity: [{ id: "activity-2" }, { id: "activity-1" }],
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
    }],
  });
  assert.deepEqual(first.root, {
    tokenKeys: [],
    taskTitles: [],
    childIds: [],
    handoffChildIds: [],
    activityIds: [],
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

test("keeps the session ledger viewport at five visible rows", () => {
  assert.equal(SESSION_LEDGER_VISIBLE_ROWS, 5);
});

test("scrolls only enough to reveal a selected row outside the five-row viewport", () => {
  assert.equal(
    getRowScrollTop({ rowIndex: 5, rowHeight: 45, viewportHeight: 225, scrollTop: 0 }),
    45,
  );
  assert.equal(
    getRowScrollTop({ rowIndex: 4, rowHeight: 45, viewportHeight: 225, scrollTop: 0 }),
    0,
  );
});
