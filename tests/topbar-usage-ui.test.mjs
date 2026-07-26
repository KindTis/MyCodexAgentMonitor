import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  server: { middlewareMode: true },
});
const { SystemSummary } = await server.ssrLoadModule("/src/App.jsx");

test.after(async () => {
  await server.close();
});

const props = {
  runningCount: 2,
  waitingCount: 0,
  sessionCount: 2,
  isLive: true,
  wallClock: Date.parse("2026-07-26T12:19:44.000Z"),
};

test("상단 상태·오늘 사용량·Limit·KST 시각을 합의된 순서로 표시한다", () => {
  const markup = renderToStaticMarkup(createElement(SystemSummary, {
    ...props,
    usage: {
      todayTokens: 522555500.6,
      todayCostUsd: 369.26156,
      fiveHourUsedPercent: 21.4,
      oneWeekUsedPercent: 6.2,
    },
  }));
  const text = markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  assert.match(
    text,
    /2 running 0 waiting 2 sessions \| Tokens 522,555,501 · Cost \$369\.2616 \| 5H 21% · 1W 6% \| 21:19:44 KST/,
  );
});

test("조회 전 또는 실패한 사용량은 각 자리에 em dash를 표시한다", () => {
  const markup = renderToStaticMarkup(createElement(SystemSummary, {
    ...props,
    usage: {
      todayTokens: null,
      todayCostUsd: null,
      fiveHourUsedPercent: null,
      oneWeekUsedPercent: null,
    },
  }));

  assert.match(markup, /Tokens —/);
  assert.match(markup, /Cost —/);
  assert.match(markup, /5H —/);
  assert.match(markup, /1W —/);
});

test("Paused 상태에서도 전달된 현재 KST 시각을 표시한다", () => {
  const markup = renderToStaticMarkup(createElement(SystemSummary, {
    ...props,
    isLive: false,
    wallClock: Date.parse("2026-07-26T12:19:45.000Z"),
    usage: {},
  }));

  assert.match(markup, /21:19:45 KST/);
});
