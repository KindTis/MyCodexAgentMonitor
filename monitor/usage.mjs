import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CCUSAGE_TIMEOUT_MS = 5000;
const KST_DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export const USAGE_COLLECTION_INTERVAL_MS = 10000;
export const EMPTY_USAGE = {
  collectedAt: null,
  todayTokens: null,
  todayCostUsd: null,
  fiveHourUsedPercent: null,
  oneWeekUsedPercent: null,
};

function getKstDateKey(now) {
  const parts = Object.fromEntries(
    KST_DATE_FORMAT.formatToParts(now).map(({ type, value }) => [type, value]),
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
  const today = getRows(payload).find(({ date }) => date === getKstDateKey(now));
  if (!today) return { todayTokens: 0, todayCostUsd: 0 };

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
  const window = [bucket?.primary, bucket?.secondary].find(
    (value) => value?.windowDurationMins === windowDurationMins,
  );
  return readNonNegativeFinite(window, "usedPercent");
}

export function parseCodexRateLimits(payload) {
  const bucket = findCodexBucket(payload);
  return {
    fiveHourUsedPercent: readWindow(bucket, 300),
    oneWeekUsedPercent: readWindow(bucket, 10080),
  };
}

export async function readCcusageDaily(now = new Date(), run = execFileAsync) {
  const { stdout } = await run(
    process.env.ComSpec ?? "cmd.exe",
    ["/d", "/s", "/c", "ccusage codex daily --json"],
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
    oneWeekUsedPercent: limitValue?.oneWeekUsedPercent ?? null,
  };
}
