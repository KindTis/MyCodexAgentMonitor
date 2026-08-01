import test from "node:test";
import assert from "node:assert/strict";

import {
  collectUsage,
  parseCcusageDaily,
  parseCodexRateLimits,
  readCcusageDaily,
  USAGE_COLLECTION_INTERVAL_MS,
} from "../monitor/usage.mjs";

const now = new Date(2026, 6, 26, 20, 19, 44);

test("UTC 15시 이후 사용량을 KST 다음날 행에서 읽는다", () => {
  assert.deepEqual(
    parseCcusageDaily({
      daily: [{
        date: "2026-08-02",
        totalTokens: 12,
        costUSD: 0.5,
      }],
    }, new Date("2026-08-01T15:01:00.000Z")),
    { todayTokens: 12, todayCostUsd: 0.5 },
  );
});

test("로컬 오늘 ccusage 행의 토큰과 지원 비용 필드를 읽는다", () => {
  assert.deepEqual(
    parseCcusageDaily({
      daily: [{
        date: "2026-07-26",
        totalTokens: 522555500.6,
        costUSD: 369.26155,
      }],
    }, now),
    { todayTokens: 522555500.6, todayCostUsd: 369.26155 },
  );
  assert.deepEqual(
    parseCcusageDaily({
      data: [{
        date: "2026-07-26",
        totalTokens: 10,
        totalCost: 0.25,
      }],
    }, now),
    { todayTokens: 10, todayCostUsd: 0.25 },
  );
});

test("정상 ccusage JSON에 로컬 오늘 행이 없으면 null을 반환한다", () => {
  assert.deepEqual(
    parseCcusageDaily({
      daily: [{
        date: "2026-07-25",
        totalTokens: 10,
        costUSD: 0.1,
      }],
    }, now),
    { todayTokens: null, todayCostUsd: null },
  );
});

test("존재하는 오늘 행의 잘못된 토큰 또는 비용은 파싱 실패다", () => {
  assert.throws(
    () => parseCcusageDaily({
      daily: [{ date: "2026-07-26", totalTokens: "10", costUSD: 0.1 }],
    }, now),
    /totalTokens/,
  );
  assert.throws(
    () => parseCcusageDaily({
      daily: [{ date: "2026-07-26", totalTokens: 10, costUSD: -1 }],
    }, now),
    /cost/,
  );
});

test("codex의 300분과 10080분 window를 독립적으로 선택한다", () => {
  assert.deepEqual(
    parseCodexRateLimits({
      rateLimitsByLimitId: {
        chatgpt: {
          limitId: "chatgpt",
          primary: { usedPercent: 99, windowDurationMins: 300 },
        },
        codex: {
          limitId: "codex",
          primary: { usedPercent: 21.4, windowDurationMins: 300 },
          secondary: { usedPercent: 106.2, windowDurationMins: 10080 },
        },
      },
    }),
    { fiveHourUsedPercent: 21.4, oneWeekUsedPercent: 106.2 },
  );

  assert.deepEqual(
    parseCodexRateLimits({
      rateLimits: {
        limitId: "codex",
        primary: { usedPercent: -1, windowDurationMins: 300 },
        secondary: { usedPercent: 6, windowDurationMins: 10080 },
      },
    }),
    { fiveHourUsedPercent: null, oneWeekUsedPercent: 6 },
  );
});

test("codex bucket 누락과 지원하지 않는 window는 해당 값을 null로 만든다", () => {
  assert.deepEqual(
    parseCodexRateLimits({ rateLimitsByLimitId: {} }),
    { fiveHourUsedPercent: null, oneWeekUsedPercent: null },
  );
  assert.deepEqual(
    parseCodexRateLimits({
      rateLimits: {
        limitId: "codex",
        primary: { usedPercent: 1, windowDurationMins: 15 },
        secondary: { usedPercent: 6, windowDurationMins: 10080 },
      },
    }),
    { fiveHourUsedPercent: null, oneWeekUsedPercent: 6 },
  );
});

test("전역 ccusage 명령을 고정 인자로 실행한다", async () => {
  let call;
  const result = await readCcusageDaily(now, async (command, args, options) => {
    call = { command, args, options };
    return {
      stdout: JSON.stringify({
        daily: [{
          date: "2026-07-26",
          totalTokens: 12,
          costUSD: 0.5,
        }],
      }),
    };
  });

  assert.deepEqual(result, { todayTokens: 12, todayCostUsd: 0.5 });
  assert.equal(call.command, process.env.ComSpec ?? "cmd.exe");
  assert.deepEqual(call.args, [
    "/d",
    "/s",
    "/c",
    "ccusage codex daily --json --timezone Asia/Seoul",
  ]);
  assert.equal(call.options.timeout, 5000);
  assert.equal(call.options.windowsHide, true);
});

test("두 사용량 원천은 독립 실패하고 이전 값을 보존하지 않는다", async () => {
  const limitsOnly = await collectUsage({
    now: () => now,
    readDaily: async () => {
      throw new Error("bad ccusage");
    },
    readLimits: async () => ({
      rateLimits: {
        limitId: "codex",
        primary: { usedPercent: 21, windowDurationMins: 300 },
        secondary: { usedPercent: 6, windowDurationMins: 10080 },
      },
    }),
  });
  assert.deepEqual(limitsOnly, {
    collectedAt: now.toISOString(),
    todayTokens: null,
    todayCostUsd: null,
    fiveHourUsedPercent: 21,
    oneWeekUsedPercent: 6,
  });

  const dailyOnly = await collectUsage({
    now: () => now,
    readDaily: async () => ({ todayTokens: 12, todayCostUsd: 0.5 }),
    readLimits: async () => {
      throw new Error("app server unavailable");
    },
  });
  assert.deepEqual(dailyOnly, {
    collectedAt: now.toISOString(),
    todayTokens: 12,
    todayCostUsd: 0.5,
    fiveHourUsedPercent: null,
    oneWeekUsedPercent: null,
  });
  assert.equal(USAGE_COLLECTION_INTERVAL_MS, 10000);
});
