import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  server: { middlewareMode: true },
});
const { ChildAgents } = await server.ssrLoadModule("/src/App.jsx");

test.after(async () => {
  await server.close();
});

const child = {
  id: "child-a",
  threadId: "child-a",
  parentSessionId: "root",
  agentNickname: "navigator",
  agentRole: "research",
  model: "gpt-5.6-sol",
  status: "running",
  statusBasis: "observed",
  isWorking: true,
  lastActivityAt: "2026-07-26T06:00:02Z",
  startedAt: "2026-07-26T06:00:00Z",
  durationSeconds: 75,
  currentWork: { turnId: "turn-a", title: "Inspect child rendering" },
  currentActivity: { label: "Reading App.jsx", step: "Reading files" },
  messages: Array.from({ length: 10 }, (_, index) => ({
    id: `child-message-${index + 1}`,
    at: `2026-07-26T06:00:${String(index + 1).padStart(2, "0")}Z`,
    text: `child agent message ${index + 1}`,
  })),
  skills: ["frontend-design"],
  plan: { tasks: [{ title: "Wrap child rows", status: "active" }] },
  goal: {
    objective: "Remove horizontal scrolling",
    status: "active",
    tokenBudget: 1000,
    tokensUsed: 100,
    timeUsedSeconds: 75,
  },
  activity: [{
    id: "activity-a",
    at: "2026-07-26T06:00:01Z",
    kind: "read",
    label: "Run · npm.cmd test",
  }],
};

const props = {
  children: [child],
  clock: Date.parse("2026-07-26T06:00:03Z"),
  changes: {
    childIds: [],
    handoffChildIds: [],
    childChanges: {
      "child-a": {
        activityIds: ["activity-a"],
        messageIds: ["child-message-10"],
      },
    },
  },
  collectedAt: "2026-07-26T06:00:03Z",
  onSelect() {},
};

test("Child Agents 목록은 필요한 다섯 열만 표시한다", () => {
  const markup = renderToStaticMarkup(createElement(ChildAgents, {
    ...props,
    selectedChildId: null,
  }));

  assert.equal(markup.match(/role="columnheader"/g)?.length, 5);
  for (const label of ["Agent", "State", "Session time", "Tasks", "Goal"]) {
    assert.match(markup, new RegExp(`>${label}<`));
  }
  assert.match(markup, />1:15</);
  assert.doesNotMatch(markup, />Tokens</);
  assert.doesNotMatch(markup, />Skills</);
});

test("추정 상태에만 작은 인라인 근거를 표시한다", () => {
  const observed = renderToStaticMarkup(createElement(ChildAgents, {
    ...props,
    children: [{ ...child, statusBasis: "observed" }],
    selectedChildId: null,
  }));
  const inferred = renderToStaticMarkup(createElement(ChildAgents, {
    ...props,
    children: [{ ...child, statusBasis: "inferred" }],
    selectedChildId: null,
  }));

  assert.doesNotMatch(observed, />추정</);
  assert.match(inferred, /class="status-basis">추정</);
});

test("선택한 Child Agent의 합의된 상세 정보를 dialog에 표시한다", () => {
  const markup = renderToStaticMarkup(createElement(ChildAgents, {
    ...props,
    selectedChildId: child.id,
  }));

  assert.match(markup, /<dialog/);
  assert.equal(markup.match(/gpt-5\.6-sol/g)?.length, 2);
  assert.match(markup, />Local</);
  for (const content of [
    "Current work",
    "Inspect child rendering",
    "Recent messages",
    "Recent activity",
    "Run · npm.cmd test",
    "Applied skills",
    "frontend-design",
    "Tasks",
    "Wrap child rows",
    "Goal",
    "Remove horizontal scrolling",
  ]) {
    assert.match(markup, new RegExp(content));
  }
  assert.equal(markup.match(/class="message-button"/g)?.length, 10);
  assert.equal(markup.match(/message-item--updated/g)?.length, 1);
  assert.equal(markup.match(/activity-item--updated/g)?.length, 1);
  const currentWork = markup.indexOf('class="detail-card child-dialog-current"');
  const recentActivity = markup.indexOf("Recent activity", currentWork);
  const messageCard = markup.indexOf('class="detail-card child-dialog-messages"');
  const recentMessages = markup.indexOf("Recent messages", messageCard);
  assert.ok(currentWork >= 0 && recentActivity > currentWork);
  assert.ok(messageCard > recentActivity && recentMessages > messageCard);
});
