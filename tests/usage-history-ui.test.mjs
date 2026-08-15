import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  optimizeDeps: { noDiscovery: true },
  server: { hmr: false, middlewareMode: true },
});
const {
  applyLiveUsageToHistory,
  getAnchoredUsageTooltipPosition,
  getUsageTooltipPosition,
  UsageHistoryPanel,
} = await server.ssrLoadModule("/src/UsageHistory.jsx");
const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test.after(async () => {
  await server.close();
});

const data = {
  days: 7,
  startDate: "2026-08-09",
  endDate: "2026-08-15",
  selectedDate: "2026-08-12",
  daily: [
    { date: "2026-08-09", totalTokens: 100, costUsd: 0.3 },
    { date: "2026-08-10", totalTokens: 200, costUsd: 0.7 },
    { date: "2026-08-11", totalTokens: 150, costUsd: 0.5 },
    { date: "2026-08-12", totalTokens: 420, costUsd: 1.4 },
    { date: "2026-08-13", totalTokens: 260, costUsd: 0.9 },
    { date: "2026-08-14", totalTokens: 180, costUsd: 0.6 },
    { date: "2026-08-15", totalTokens: 300, costUsd: 1.1 },
  ],
  sessions: [
    {
      sessionId: "root-b",
      projectName: "MyCodexAgentMonitor",
      sessionName: "Usage history",
      totalTokens: 200,
      costUsd: 0.5,
    },
    {
      sessionId: "root-a",
      projectName: "ProjectGR",
      sessionName: "Card combat polish",
      totalTokens: 1420,
      costUsd: 2.73,
    },
  ],
};

function renderHistory(overrides = {}) {
  return renderToStaticMarkup(createElement(UsageHistoryPanel, {
    data,
    days: 7,
    nextDisabled: true,
    onClose() {},
    onDaysChange() {},
    onMovePeriod() {},
    onSelectDate() {},
    ...overrides,
  }));
}

test("히스토리는 7D/30D와 Prev/Next 및 공통 X 닫기를 제공한다", () => {
  const markup = renderHistory();

  assert.match(markup, /aria-label="Close usage history"/);
  assert.doesNotMatch(markup, />Agent Sessions<\/button>/);
  assert.match(markup, /aria-pressed="true">7D<\/button>/);
  assert.match(markup, /aria-pressed="false">30D<\/button>/);
  assert.match(markup, /aria-label="Previous period"/);
  assert.match(markup, /aria-label="Next period" disabled=""/);
  assert.match(markup, /Aug 9 — Aug 15/);
});

test("그래프는 좌측 Cost와 우측 Tokens 이중축, 캡슐 막대와 선만 표시한다", () => {
  const markup = renderHistory();

  assert.match(markup, /Cost · left/);
  assert.match(markup, /Tokens · right/);
  assert.match(markup, />COST<\/text>/);
  assert.match(markup, />TOKENS<\/text>/);
  assert.match(markup, /class="usage-token-bar usage-token-bar--selected"/);
  assert.match(markup, /class="usage-cost-line"/);
  assert.doesNotMatch(markup, /usage-cost-area/);
  assert.match(markup, /<svg class="usage-chart-svg"[^>]*role="group"/);
  assert.doesNotMatch(markup, /<svg class="usage-chart-svg"[^>]*role="img"/);
  assert.match(markup, /class="usage-chart-day usage-chart-day--selected" role="button" tabindex="0" aria-label="Aug 12: Cost \$1\.4000, Tokens 420" aria-pressed="true"/);
  assert.match(css, /\.usage-chart-day:focus-visible \.usage-chart-hit\s*\{/);
});

test("선택하지 않은 날짜도 hover와 focus용 Cost·Tokens 툴팁을 가진다", () => {
  const markup = renderHistory();

  assert.equal([...markup.matchAll(/class="usage-chart-tooltip/g)].length, data.daily.length);
  assert.match(markup, /aria-label="Aug 10: Cost \$0\.7000, Tokens 200"/);
  assert.match(markup, /class="usage-chart-tooltip" aria-hidden="true"><rect[^>]*><\/rect><text[^>]*>Aug 10<\/text><text[^>]*>Cost \$0\.7000<\/text><text[^>]*>Tokens 200<\/text>/);
  assert.match(
    css,
    /\.usage-chart-svg \.usage-chart-day:hover \.usage-chart-tooltip,\s*\.usage-chart-svg \.usage-chart-day:focus-visible \.usage-chart-tooltip\s*\{[^}]*opacity:\s*1/s,
  );
});

test("툴팁은 포인터를 따라가고 차트 우하단에서는 안쪽으로 배치된다", () => {
  assert.equal(typeof getUsageTooltipPosition, "function");
  assert.deepEqual(getUsageTooltipPosition(300, 100), { x: 312, y: 112 });
  assert.deepEqual(getUsageTooltipPosition(1020, 226), { x: 896, y: 165 });
});

test("포인터가 없으면 툴팁은 Token 막대 상단을 기준으로 배치된다", () => {
  assert.equal(typeof getAnchoredUsageTooltipPosition, "function");
  assert.deepEqual(getAnchoredUsageTooltipPosition(200, 220), { x: 144, y: 163 });
  assert.deepEqual(getAnchoredUsageTooltipPosition(80, 30), { x: 80, y: 38 });
  assert.deepEqual(getAnchoredUsageTooltipPosition(1020, 100), { x: 908, y: 43 });
});

test("차트는 브라우저 기본 title 툴팁 없이 접근 가능한 이름을 유지한다", () => {
  const markup = renderHistory();

  assert.doesNotMatch(markup, /<title/);
  assert.match(markup, /<svg class="usage-chart-svg"[^>]*aria-label="Daily token and cost usage"/);
  assert.match(markup, /aria-describedby="usage-chart-description"/);
});

test("Live 사용량은 현재 기간의 오늘 daily 값만 갱신한다", () => {
  assert.equal(typeof applyLiveUsageToHistory, "function");
  const updated = applyLiveUsageToHistory(data, "2026-08-15", {
    todayTokens: 999,
    todayCostUsd: 4.2,
  });

  assert.deepEqual(updated.daily.at(-1), {
    date: "2026-08-15",
    totalTokens: 999,
    costUsd: 4.2,
  });
  assert.equal(updated.daily[0], data.daily[0]);
  assert.equal(data.daily.at(-1).totalTokens, 300);

  const pastPeriod = { ...data, endDate: "2026-08-14", daily: data.daily.slice(0, -1) };
  assert.equal(
    applyLiveUsageToHistory(pastPeriod, "2026-08-15", {
      todayTokens: 999,
      todayCostUsd: 4.2,
    }),
    pastPeriod,
  );
});

test("소액 비용도 Cost 축에서 서로 다른 값으로 읽힌다", () => {
  const markup = renderHistory({ data: {
    ...data,
    daily: data.daily.map((day, index) => ({ ...day, costUsd: index * 0.0025 })),
  } });

  assert.match(markup, /\$0\.0050/);
});

test("선택일 세션은 Token 사용량순과 상대 막대로 표시한다", () => {
  const markup = renderHistory();

  assert.ok(markup.indexOf("ProjectGR") < markup.indexOf("MyCodexAgentMonitor"));
  assert.match(markup, /Card combat polish/);
  assert.match(markup, /1,420/);
  assert.match(markup, /\$2\.7300/);
  assert.match(markup, /style="--usage-ratio:100%"/);
});

test("히스토리 패널은 로딩·오류·빈 세션 상태를 같은 영역에서 표시한다", () => {
  assert.match(renderHistory({ data: null, loading: true }), /Loading usage history/);
  assert.match(renderHistory({ data: null, error: "Usage history unavailable" }), /Usage history unavailable/);
  const failedUpdate = renderHistory({ error: "Usage history unavailable" });
  assert.match(failedUpdate, /Usage history unavailable/);
  assert.doesNotMatch(failedUpdate, /Daily token and cost usage/);
  assert.match(renderHistory({ data: { ...data, sessions: [] } }), /No sessions used tokens on this day/);
});

test("히스토리 화면은 데스크톱 셸 안에서 자체 패널과 목록 스크롤을 사용한다", () => {
  assert.doesNotMatch(css, /\.page-content--usage\s*\{/);
  assert.match(css, /\.usage-history-focus\s*\{[^}]*height:\s*100%/s);
  assert.match(css, /\.usage-history\s*\{[^}]*overflow: hidden/s);
  assert.match(css, /\.usage-session-list\s*\{[^}]*overflow-y: auto/s);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.usage-history-header\s*\{[^}]*flex-direction: column/s);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.usage-history-actions\s*\{[^}]*flex-wrap: wrap/s);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.usage-session-meter\s*\{[^}]*display: none/s);
});
