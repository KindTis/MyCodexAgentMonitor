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
  animateUsageValue,
  formatResetCountdown,
  SystemSummary,
} = await server.ssrLoadModule("/src/App.jsx");
const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

test.after(async () => {
  await server.close();
});

const props = {
  runningCount: 2,
  waitingCount: 0,
  sessionCount: 2,
  isLive: true,
  wallClock: new Date(2026, 6, 26, 21, 19, 44).getTime(),
};

test("상단 상태·오늘 사용량·Limit·로컬 시각을 합의된 순서로 표시한다", () => {
  const markup = renderToStaticMarkup(createElement(SystemSummary, {
    ...props,
    usage: {
      todayTokens: 522555500.6,
      todayCostUsd: 369.26156,
      fiveHourUsedPercent: 21.4,
      fiveHourResetsAt: 1785252283,
      oneWeekUsedPercent: 6.2,
      oneWeekResetsAt: 1785684403,
    },
  }));
  const text = markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  assert.match(
    text,
    /2 running 0 waiting 2 sessions \| Tokens 522,555,501 · Cost \$369\.2616 \| 5H 21% · 1W 6% 5H reset 02:03:04 1W reset 07:03:06 \| 21:19:44 .+/,
  );
});

test("Limit 리셋까지 남은 시간을 DD:HH:MM으로 표시한다", () => {
  assert.equal(typeof formatResetCountdown, "function");
  assert.equal(
    formatResetCountdown(1800183899, 1800000000000),
    "02:03:04",
  );
  assert.equal(
    formatResetCountdown(1799999999, 1800000000000),
    "00:00:00",
  );
  assert.equal(formatResetCountdown(null, 1800000000000), "-");
});

test("Limit 그룹은 hover와 키보드 focus용 리셋 툴팁을 제공한다", () => {
  const markup = renderToStaticMarkup(createElement(SystemSummary, {
    ...props,
    wallClock: 1800000000000,
    usage: {
      fiveHourUsedPercent: 21,
      fiveHourResetsAt: 1800183899,
      oneWeekUsedPercent: 6,
      oneWeekResetsAt: null,
    },
  }));
  const text = markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  assert.match(markup, /tabindex="0"/);
  assert.match(markup, /aria-describedby="limit-reset-tooltip"/);
  assert.match(markup, /id="limit-reset-tooltip" role="tooltip"/);
  assert.match(text, /5H reset 02:03:04 1W reset -/);
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
  const text = markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  assert.match(text, /Tokens —/);
  assert.match(text, /Cost —/);
  assert.match(text, /5H —/);
  assert.match(text, /1W —/);
});

test("Paused 상태에서도 전달된 현재 로컬 시각을 표시한다", () => {
  const markup = renderToStaticMarkup(createElement(SystemSummary, {
    ...props,
    isLive: false,
    wallClock: new Date(2026, 6, 26, 21, 19, 45).getTime(),
    usage: {},
  }));

  assert.match(markup, /21:19:45 .+<\/time>/);
});

test("증가하는 사용량은 1.5초 동안 중간값을 거쳐 목표값에 도달한다", () => {
  const values = [];
  const tween = animateUsageValue({
    from: 100,
    to: 150,
    onUpdate: (value) => values.push(value),
  });

  tween.pause(0);
  tween.time(0.75);
  assert.ok(values.at(-1) > 100 && values.at(-1) < 150);
  tween.time(1.5);
  assert.equal(values.at(-1), 150);
  assert.equal(tween.duration(), 1.5);
  tween.kill();
});

test("감소하는 사용량도 1.5초 동안 중간값을 거쳐 목표값에 도달한다", () => {
  const values = [];
  const tween = animateUsageValue({
    from: 150,
    to: 100,
    onUpdate: (value) => values.push(value),
  });

  tween.pause(0);
  tween.time(0.75);
  assert.ok(values.at(-1) < 150 && values.at(-1) > 100);
  tween.time(1.5);
  assert.equal(values.at(-1), 100);
  assert.equal(tween.duration(), 1.5);
  tween.kill();
});

test("숫자와 결측값 사이는 보간하지 않고 즉시 반영한다", () => {
  for (const [from, to] of [[null, 100], [100, null]]) {
    const values = [];
    const tween = animateUsageValue({
      from,
      to,
      onUpdate: (value) => values.push(value),
    });

    assert.equal(tween, null);
    assert.deepEqual(values, [to]);
  }
});

test("reduced-motion에서는 숫자를 즉시 반영한다", () => {
  const values = [];
  const tween = animateUsageValue({
    from: 100,
    to: 150,
    reduceMotion: true,
    onUpdate: (value) => values.push(value),
  });

  assert.equal(tween, null);
  assert.deepEqual(values, [150]);
});

test("상단 Token과 Cost는 초기 하이라이트 없이 전환 요소로 렌더링된다", () => {
  const markup = renderToStaticMarkup(createElement(SystemSummary, {
    ...props,
    usage: {
      todayTokens: 100,
      todayCostUsd: 1,
      fiveHourUsedPercent: 21,
      oneWeekUsedPercent: 6,
    },
  }));

  assert.equal(
    [...markup.matchAll(/class="system-summary-value"/g)].length,
    2,
  );
  assert.doesNotMatch(markup, /system-summary-value--updated/);
});

test("상단 Token과 Cost 영역 전체가 사용량 히스토리 진입 버튼이다", () => {
  const markup = renderToStaticMarkup(createElement(SystemSummary, {
    ...props,
    onOpenUsage() {},
    usage: {
      todayTokens: 100,
      todayCostUsd: 1,
      fiveHourUsedPercent: 21,
      oneWeekUsedPercent: 6,
    },
  }));

  assert.match(
    markup,
    /<button type="button" class="summary-usage-button" aria-label="Open usage history">/,
  );
  assert.equal([...markup.matchAll(/class="summary-stat-label"/g)].length, 2);
  assert.match(markup, /summary-stat-label">Tokens/);
  assert.match(markup, /summary-stat-label">Cost/);
});

test("사용량 진입은 hover와 focus에서 버튼 전체 표면을 강조하고 밑줄을 사용하지 않는다", () => {
  assert.match(
    css,
    /\.summary-usage-button:hover,\s*\.summary-usage-button:focus-visible\s*\{[^}]*border-color:\s*var\(--line-strong\)[^}]*background:\s*var\(--panel-raised\)/s,
  );
  assert.doesNotMatch(
    css,
    /\.summary-usage-button:(?:hover|focus-visible)[^}]*\.summary-stat-label[^{]*\{/s,
  );
  assert.match(
    css,
    /\.summary-usage-button\s*\{[^}]*cursor: pointer/s,
  );
});
