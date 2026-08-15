import { execFile } from "node:child_process";
import { open, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { resolveCodexHome } from "./session-log.mjs";

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
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const THREAD_ID_AT_END = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

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

function getSessionRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.sessions)) return payload.sessions;
  if (Array.isArray(payload?.sessions?.data)) return payload.sessions.data;
  if (Array.isArray(payload?.data)) return payload.data;
  throw new Error("ccusage session row array is missing");
}

function readNonNegativeFinite(record, field) {
  const value = record?.[field];
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function readCost(record) {
  const field = Object.hasOwn(record ?? {}, "totalCost")
    ? "totalCost"
    : Object.hasOwn(record ?? {}, "costUSD")
      ? "costUSD"
      : null;
  const value = field == null ? null : readNonNegativeFinite(record, field);
  if (value == null) throw new Error("invalid cost field");
  return value;
}

function parseDateKey(value, field) {
  if (!DATE_KEY.test(value ?? "")) throw new Error(`invalid ${field} date`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`invalid ${field} date`);
  }
  return value;
}

function shiftDateKey(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateKeys(startDate, endDate) {
  const result = [];
  for (let date = startDate; date <= endDate; date = shiftDateKey(date, 1)) {
    result.push(date);
  }
  return result;
}

function getThreadId(value) {
  const text = String(value ?? "");
  const uuid = text.match(THREAD_ID_AT_END)?.[1];
  if (uuid) return uuid;
  return text.split(/[\\/]/).at(-1)?.replace(/^rollout-/, "") || "unknown";
}

export function parseUsageHistoryRequest(input = {}, now = new Date()) {
  const days = input.days == null || input.days === "" ? 30 : Number(input.days);
  if (![7, 30].includes(days)) throw new Error("invalid days");

  const endDate = parseDateKey(input.end ?? input.endDate ?? getLocalDateKey(now), "end");
  const startDate = shiftDateKey(endDate, 1 - days);
  const selectedDate = parseDateKey(
    input.selected ?? input.selectedDate ?? endDate,
    "selected",
  );
  if (selectedDate < startDate || selectedDate > endDate) {
    throw new Error("selected date is outside the range");
  }
  return { days, startDate, endDate, selectedDate };
}

export function parseCcusageHistoryDaily(payload, request) {
  const rows = new Map();
  for (const row of getRows(payload)) {
    if (row?.date < request.startDate || row?.date > request.endDate) continue;
    const totalTokens = readNonNegativeFinite(row, "totalTokens");
    if (totalTokens == null) throw new Error("invalid totalTokens");
    rows.set(row.date, {
      date: row.date,
      totalTokens,
      costUsd: readCost(row),
    });
  }
  return dateKeys(request.startDate, request.endDate).map(
    (date) => rows.get(date) ?? { date, totalTokens: 0, costUsd: 0 },
  );
}

export function parseCcusageHistorySessions(payload, metadata = new Map()) {
  return getSessionRows(payload).map((row) => {
    const threadId = getThreadId(row?.sessionId);
    const totalTokens = readNonNegativeFinite(row, "totalTokens");
    if (totalTokens == null) throw new Error("invalid totalTokens");
    const details = metadata.get(threadId);
    const projectName = details?.cwd
      ? path.basename(path.resolve(details.cwd)) || "Unknown project"
      : "Unknown project";
    return {
      sessionId: threadId,
      projectName,
      sessionName: details?.sessionName || threadId.slice(0, 8),
      totalTokens,
      costUsd: readCost(row),
    };
  }).sort((a, b) => b.totalTokens - a.totalTokens || a.sessionId.localeCompare(b.sessionId));
}

export function parseCcusageDaily(payload, now = new Date()) {
  const today = getRows(payload).find(({ date }) => date === getLocalDateKey(now));
  if (!today) return { todayTokens: null, todayCostUsd: null };

  const todayTokens = readNonNegativeFinite(today, "totalTokens");
  if (todayTokens == null) throw new Error("invalid totalTokens");

  const todayCostUsd = readCost(today);

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

export async function readUsageHistory(input = {}, {
  run = execFileAsync,
  codexHome = resolveCodexHome(),
  loadSessionMetadata = loadCodexSessionMetadata,
} = {}) {
  const request = parseUsageHistoryRequest(input);
  const options = {
    encoding: "utf8",
    timeout: CCUSAGE_TIMEOUT_MS,
    windowsHide: true,
  };
  const common = ["--json", "--offline", "--timezone", USAGE_TIME_ZONE];
  const [dailyResult, sessionResult] = await Promise.all([
    run(process.execPath, [
      CCUSAGE_CLI_PATH,
      "codex",
      "daily",
      ...common,
      "--since",
      request.startDate,
      "--until",
      request.endDate,
    ], options),
    run(process.execPath, [
      CCUSAGE_CLI_PATH,
      "codex",
      "session",
      ...common,
      "--since",
      request.selectedDate,
      "--until",
      request.selectedDate,
    ], options),
  ]);
  const dailyPayload = JSON.parse(dailyResult.stdout);
  const sessionPayload = JSON.parse(sessionResult.stdout);
  const metadata = await loadSessionMetadata(sessionPayload, codexHome);
  return {
    ...request,
    daily: parseCcusageHistoryDaily(dailyPayload, request),
    sessions: parseCcusageHistorySessions(sessionPayload, metadata),
  };
}

async function loadCodexSessionMetadata(payload, codexHome) {
  const names = parseSessionIndex(
    await readFile(path.join(codexHome, "session_index.jsonl"), "utf8").catch(() => ""),
  );
  return new Map(await Promise.all(getSessionRows(payload).map(async (row) => {
    const threadId = getThreadId(row?.sessionId);
    const cwd = await readSessionCwd(codexHome, row?.sessionId);
    return [threadId, { cwd, sessionName: names.get(threadId) ?? null }];
  })));
}

function parseSessionIndex(source) {
  const names = new Map();
  for (const line of source.split(/\r?\n/)) {
    if (!line) continue;
    try {
      const record = JSON.parse(line);
      if (record.id && record.thread_name) names.set(record.id, record.thread_name);
    } catch {
      // A partially written final line is ignored until the next request.
    }
  }
  return names;
}

async function readSessionCwd(codexHome, sessionId) {
  const root = path.resolve(codexHome, "sessions");
  const relative = `${String(sessionId ?? "").replace(/[\\/]+/g, path.sep)}.jsonl`;
  const filePath = path.resolve(root, relative);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) return null;
  let handle;
  try {
    handle = await open(filePath, "r");
    const buffer = Buffer.alloc(65536);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const line = buffer.toString("utf8", 0, bytesRead).split(/\r?\n/, 1)[0];
    const record = JSON.parse(line);
    return record.type === "session_meta" ? record.payload?.cwd ?? null : null;
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
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
