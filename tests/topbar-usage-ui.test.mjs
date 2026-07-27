import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({
  appType: "custom",
  server: { middlewareMode: true },
});
const { animateUsageValue, SystemSummary } = await server.ssrLoadModule("/src/App.jsx");

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
      oneWeekUsedPercent: 6.2,
    },
  }));
  const text = markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  assert.match(
    text,
    /2 running 0 waiting 2 sessions \| Tokens 522,555,501 · Cost \$369\.2616 \| 5H 21% · 1W 6% \| 21:19:44 .+/,
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
