import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CCUSAGE_TIMEOUT_MS = 5000;
const CCUSAGE_CLI_PATH = fileURLToPath(
  new URL("../node_modules/ccusage/src/cli.js", import.meta.url),
);
const USAGE_TIME_ZONE = "Asia/Seoul";
const LOCAL_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: USAGE_TIME_ZONE,
});

export const USAGE_COLLECTION_INTERVAL_MS = 10000;
export const EMPTY_USAGE = {
  collectedAt: null,
  todayTokens: null,
  todayCostUsd: null,
  fiveHourUsedPercent: null,
  fiveHourResetsAt: null,
  oneWeekUsedPercent: null,
  oneWeekResetsAt: null,
};

function getLocalDateKey(now) {
  const parts = Object.fromEntries(
    LOCAL_DATE_FORMAT.formatToParts(now).map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.daily)) return payload.daily;
  if (Array.isArray(payload?.daily?.data)) return payload.daily.data;
  if (Array.isArray(payload?.data)) return payload.data;
  throw new Error("ccusage daily row array is missing");
}

function readNonNegativeFinite(record, field) {
  const value = record?.[field];
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function parseCcusageDaily(payload, now = new Date()) {
  const today = getRows(payload).find(({ date }) => date === getLocalDateKey(now));
  if (!today) return { todayTokens: null, todayCostUsd: null };

  const todayTokens = readNonNegativeFinite(today, "totalTokens");
  if (todayTokens == null) throw new Error("invalid totalTokens");

  const costField = Object.hasOwn(today, "totalCost")
    ? "totalCost"
    : Object.hasOwn(today, "costUSD")
      ? "costUSD"
      : null;
  const todayCostUsd = costField == null
    ? null
    : readNonNegativeFinite(today, costField);
  if (todayCostUsd == null) throw new Error("invalid cost field");

  return { todayTokens, todayCostUsd };
}

function unwrap(payload) {
  return payload?.result && typeof payload.result === "object"
    ? payload.result
    : payload;
}

function findCodexBucket(payload) {
  const record = unwrap(payload);
  if (!record || typeof record !== "object") return null;
  const direct = record.rateLimits;
  if (
    direct
    && typeof direct === "object"
    && (direct.limitId === "codex" || direct.id === "codex")
  ) return direct;
  const byId = record.rateLimitsByLimitId;
  return byId && typeof byId === "object" ? byId.codex ?? null : null;
}

function readWindow(bucket, windowDurationMins) {
  return [bucket?.primary, bucket?.secondary].find(
    (value) => value?.windowDurationMins === windowDurationMins,
  );
}

export function parseCodexRateLimits(payload) {
  const bucket = findCodexBucket(payload);
  const fiveHour = readWindow(bucket, 300);
  const oneWeek = readWindow(bucket, 10080);
  return {
    fiveHourUsedPercent: readNonNegativeFinite(fiveHour, "usedPercent"),
    fiveHourResetsAt: readNonNegativeFinite(fiveHour, "resetsAt"),
    oneWeekUsedPercent: readNonNegativeFinite(oneWeek, "usedPercent"),
    oneWeekResetsAt: readNonNegativeFinite(oneWeek, "resetsAt"),
  };
}

export async function readCcusageDaily(now = new Date(), run = execFileAsync) {
  const { stdout } = await run(
    process.execPath,
    [CCUSAGE_CLI_PATH, "codex", "daily", "--json", "--timezone", USAGE_TIME_ZONE],
    { encoding: "utf8", timeout: CCUSAGE_TIMEOUT_MS, windowsHide: true },
  );
  return parseCcusageDaily(JSON.parse(stdout), now);
}

export async function collectUsage({
  readDaily = readCcusageDaily,
  readLimits,
  now = () => new Date(),
}) {
  const collectedAt = now();
  const [daily, limits] = await Promise.allSettled([
    readDaily(collectedAt),
    readLimits(),
  ]);
  const dailyValue = daily.status === "fulfilled" ? daily.value : null;
  const limitValue = limits.status === "fulfilled"
    ? parseCodexRateLimits(limits.value)
    : null;

  return {
    collectedAt: collectedAt.toISOString(),
    todayTokens: dailyValue?.todayTokens ?? null,
    todayCostUsd: dailyValue?.todayCostUsd ?? null,
    fiveHourUsedPercent: limitValue?.fiveHourUsedPercent ?? null,
    fiveHourResetsAt: limitValue?.fiveHourResetsAt ?? null,
    oneWeekUsedPercent: limitValue?.oneWeekUsedPercent ?? null,
    oneWeekResetsAt: limitValue?.oneWeekResetsAt ?? null,
  };
}
