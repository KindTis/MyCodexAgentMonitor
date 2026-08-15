import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import {
  collectUsage,
  parseCcusageHistoryDaily,
  parseCcusageHistorySessions,
  parseCcusageDaily,
  parseCodexRateLimits,
  parseUsageHistoryRequest,
  readCcusageDaily,
  readUsageHistory,
  USAGE_COLLECTION_INTERVAL_MS,
} from "../monitor/usage.mjs";

const now = new Date(2026, 6, 26, 20, 19, 44);
const ccusageCliPath = fileURLToPath(
  new URL("../node_modules/ccusage/src/cli.js", import.meta.url),
);

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
          primary: {
            usedPercent: 21.4,
            windowDurationMins: 300,
            resetsAt: 1785771600,
          },
          secondary: {
            usedPercent: 106.2,
            windowDurationMins: 10080,
            resetsAt: 1786203600,
          },
        },
      },
    }),
    {
      fiveHourUsedPercent: 21.4,
      fiveHourResetsAt: 1785771600,
      oneWeekUsedPercent: 106.2,
      oneWeekResetsAt: 1786203600,
    },
  );

  assert.deepEqual(
    parseCodexRateLimits({
      rateLimits: {
        limitId: "codex",
        primary: {
          usedPercent: -1,
          windowDurationMins: 300,
          resetsAt: 1785771600,
        },
        secondary: {
          usedPercent: 6,
          windowDurationMins: 10080,
          resetsAt: -1,
        },
      },
    }),
    {
      fiveHourUsedPercent: null,
      fiveHourResetsAt: 1785771600,
      oneWeekUsedPercent: 6,
      oneWeekResetsAt: null,
    },
  );
});

test("codex bucket 누락과 지원하지 않는 window는 해당 값을 null로 만든다", () => {
  assert.deepEqual(
    parseCodexRateLimits({ rateLimitsByLimitId: {} }),
    {
      fiveHourUsedPercent: null,
      fiveHourResetsAt: null,
      oneWeekUsedPercent: null,
      oneWeekResetsAt: null,
    },
  );
  assert.deepEqual(
    parseCodexRateLimits({
      rateLimits: {
        limitId: "codex",
        primary: {
          usedPercent: 1,
          windowDurationMins: 15,
          resetsAt: 1785771600,
        },
        secondary: { usedPercent: 6, windowDurationMins: 10080 },
      },
    }),
    {
      fiveHourUsedPercent: null,
      fiveHourResetsAt: null,
      oneWeekUsedPercent: 6,
      oneWeekResetsAt: null,
    },
  );
});

test("프로젝트 로컬 ccusage CLI를 KST 고정 인자로 실행한다", async () => {
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
  assert.equal(call.command, process.execPath);
  assert.deepEqual(call.args, [
    ccusageCliPath,
    "codex",
    "daily",
    "--json",
    "--timezone",
    "Asia/Seoul",
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
        primary: {
          usedPercent: 21,
          windowDurationMins: 300,
          resetsAt: 1785771600,
        },
        secondary: {
          usedPercent: 6,
          windowDurationMins: 10080,
          resetsAt: 1786203600,
        },
      },
    }),
  });
  assert.deepEqual(limitsOnly, {
    collectedAt: now.toISOString(),
    todayTokens: null,
    todayCostUsd: null,
    fiveHourUsedPercent: 21,
    fiveHourResetsAt: 1785771600,
    oneWeekUsedPercent: 6,
    oneWeekResetsAt: 1786203600,
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
    fiveHourResetsAt: null,
    oneWeekUsedPercent: null,
    oneWeekResetsAt: null,
  });
  assert.equal(USAGE_COLLECTION_INTERVAL_MS, 10000);
});

test("7D와 30D 히스토리 요청만 KST 날짜 범위로 정규화한다", () => {
  assert.deepEqual(
    parseUsageHistoryRequest({
      days: "7",
      end: "2026-08-15",
      selected: "2026-08-12",
    }),
    {
      days: 7,
      startDate: "2026-08-09",
      endDate: "2026-08-15",
      selectedDate: "2026-08-12",
    },
  );
  assert.deepEqual(
    parseUsageHistoryRequest({}, new Date("2026-08-15T01:00:00.000Z")),
    {
      days: 30,
      startDate: "2026-07-17",
      endDate: "2026-08-15",
      selectedDate: "2026-08-15",
    },
  );

  assert.throws(() => parseUsageHistoryRequest({ days: "14" }), /days/);
  assert.throws(
    () => parseUsageHistoryRequest({ days: "7", end: "2026-02-30" }),
    /end/,
  );
  assert.throws(
    () => parseUsageHistoryRequest({
      days: "7",
      end: "2026-08-15",
      selected: "2026-08-08",
    }),
    /selected/,
  );
});

test("일별 히스토리는 누락 날짜를 0으로 채우고 두 비용 필드를 지원한다", () => {
  const request = parseUsageHistoryRequest({ days: "7", end: "2026-08-15" });
  assert.deepEqual(
    parseCcusageHistoryDaily({
      daily: [
        { date: "2026-08-09", totalTokens: 10, costUSD: 0.25 },
        { date: "2026-08-12", totalTokens: 30, totalCost: 0.75 },
        { date: "2026-08-15", totalTokens: 20, costUSD: 0.5 },
      ],
    }, request),
    [
      { date: "2026-08-09", totalTokens: 10, costUsd: 0.25 },
      { date: "2026-08-10", totalTokens: 0, costUsd: 0 },
      { date: "2026-08-11", totalTokens: 0, costUsd: 0 },
      { date: "2026-08-12", totalTokens: 30, costUsd: 0.75 },
      { date: "2026-08-13", totalTokens: 0, costUsd: 0 },
      { date: "2026-08-14", totalTokens: 0, costUsd: 0 },
      { date: "2026-08-15", totalTokens: 20, costUsd: 0.5 },
    ],
  );
});

test("선택일 세션은 프로젝트·세션명을 결합해 Token 내림차순으로 정렬한다", () => {
  const metadata = new Map([
    ["root-a", { cwd: "C:\\Repos\\ProjectGR", sessionName: "Card combat polish" }],
    ["root-b", { cwd: "C:\\Repos\\MyCodexAgentMonitor", sessionName: "Usage history" }],
  ]);

  assert.deepEqual(
    parseCcusageHistorySessions({
      sessions: [
        {
          sessionId: "2026/08/15/rollout-root-b",
          totalTokens: 200,
          costUSD: 0.5,
        },
        {
          sessionId: "2026/08/15/rollout-root-a",
          totalTokens: 1420,
          costUSD: 2.73,
        },
      ],
    }, metadata),
    [
      {
        sessionId: "root-a",
        projectName: "ProjectGR",
        sessionName: "Card combat polish",
        totalTokens: 1420,
        costUsd: 2.73,
      },
      {
        sessionId: "root-b",
        projectName: "MyCodexAgentMonitor",
        sessionName: "Usage history",
        totalTokens: 200,
        costUsd: 0.5,
      },
    ],
  );
});

test("히스토리는 기간 일별과 선택일 세션을 KST 고정 인자로 함께 조회한다", async () => {
  const calls = [];
  const result = await readUsageHistory({
    days: "7",
    end: "2026-08-15",
    selected: "2026-08-12",
  }, {
    run: async (command, args, options) => {
      calls.push({ command, args, options });
      return args[2] === "daily"
        ? { stdout: JSON.stringify({ daily: [
          { date: "2026-08-12", totalTokens: 30, costUSD: 0.75 },
        ] }) }
        : { stdout: JSON.stringify({ sessions: [
          { sessionId: "2026/08/12/rollout-root-a", totalTokens: 30, costUSD: 0.75 },
        ] }) };
    },
    loadSessionMetadata: async () => new Map([
      ["root-a", { cwd: "C:\\Repos\\ProjectGR", sessionName: "Card combat polish" }],
    ]),
  });

  assert.equal(result.daily.length, 7);
  assert.equal(result.sessions[0].sessionName, "Card combat polish");
  assert.deepEqual(calls.map(({ args }) => args.slice(1)), [
    [
      "codex", "daily", "--json", "--offline", "--timezone", "Asia/Seoul",
      "--since", "2026-08-09", "--until", "2026-08-15",
    ],
    [
      "codex", "session", "--json", "--offline", "--timezone", "Asia/Seoul",
      "--since", "2026-08-12", "--until", "2026-08-12",
    ],
  ]);
  assert.ok(calls.every(({ command }) => command === process.execPath));
  assert.ok(calls.every(({ options }) => options.windowsHide === true));
});
