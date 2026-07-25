import * as fs from "node:fs/promises";
import path from "node:path";

export const IDLE_AFTER_MS = 10 * 60 * 1000;

const STRUCTURAL_BLOCK = /<(environment_context|skill)\b[^>]*>[\s\S]*?<\/\1>/gi;
const SKILL_REFERENCE = /\$([a-z0-9][\w-]*(?::[\w-]+)?)/gi;
const PLAN_STATUS = {
  completed: "done",
  in_progress: "active",
  pending: "queued",
};

export class SessionPathBoundaryError extends Error {
  constructor() {
    super("Session path is outside CODEX_HOME");
    this.name = "SessionPathBoundaryError";
  }
}

export class SessionLogParseError extends Error {
  constructor() {
    super("Session log contains invalid JSON");
    this.name = "SessionLogParseError";
  }
}

export function resolveCodexHome(env = process.env) {
  if (env.CODEX_HOME) return path.resolve(env.CODEX_HOME);
  if (!env.USERPROFILE) {
    throw new Error("USERPROFILE is required when CODEX_HOME is unset");
  }
  return path.resolve(env.USERPROFILE, ".codex");
}

export class JsonlTailer {
  #offsets = new Map();
  #candidateOffsets = null;

  constructor({ codexHome = resolveCodexHome() } = {}) {
    this.codexHome = path.resolve(codexHome);
  }

  beginBatch() {
    if (this.#candidateOffsets) throw new Error("JSONL batch already active");
    this.#candidateOffsets = new Map(this.#offsets);
  }

  commitBatch() {
    if (!this.#candidateOffsets) throw new Error("JSONL batch is not active");
    this.#offsets = this.#candidateOffsets;
    this.#candidateOffsets = null;
  }

  discardBatch() {
    this.#candidateOffsets = null;
  }

  async read(filePath) {
    if (!this.#candidateOffsets) throw new Error("JSONL batch is not active");
    const resolvedPath = path.resolve(filePath);
    assertInside(this.codexHome, resolvedPath);

    const offset = this.#candidateOffsets.get(resolvedPath) ?? 0;
    const stat = await fs.stat(resolvedPath);
    const start = stat.size < offset ? 0 : offset;
    const bytes = await readBytes(resolvedPath, start, stat.size - start);
    const lastNewline = bytes.lastIndexOf(0x0a);
    if (lastNewline < 0) return [];

    const records = bytes
      .subarray(0, lastNewline)
      .toString("utf8")
      .split("\n")
      .flatMap(parseJsonLine);
    this.#candidateOffsets.set(resolvedPath, start + lastNewline + 1);
    return records;
  }
}

function assertInside(root, candidate) {
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new SessionPathBoundaryError();
  }
}

async function readBytes(filePath, start, length) {
  if (length <= 0) return Buffer.alloc(0);
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function parseJsonLine(line) {
  if (!line.trim()) return [];
  try {
    return [JSON.parse(line)];
  } catch {
    throw new SessionLogParseError();
  }
}

export function classifyToolCall(name, input = {}) {
  const parsedInput = typeof input === "string" ? parseArguments(input) : input;
  const leaf = String(name).split(".").at(-1);
  const command = String(parsedInput?.command ?? "");

  if (leaf === "apply_patch" || leaf === "file_change") return "Editing";
  if (leaf === "request_user_input") return "Waiting";
  if (leaf === "wait" || leaf === "wait_agent") return "Waiting";
  if (/\b(npm(?:\.cmd)?\s+(?:test|run\s+build|run\s+test:sites)|node\s+--test)\b/i.test(command)) {
    return "Testing";
  }
  if (/\b(rg|Get-Content|Get-ChildItem|git\s+status|git\s+log)\b/i.test(command)) {
    return "Reading files";
  }
  return "Calling tool";
}

// ponytail: 명령 접두사 분류는 관찰 가능한 최소 휴리스틱이다.
// JSONL에 commandActions가 안정적으로 기록되면 문자열 분류를 그 필드로 교체한다.

export function reduceThreadRecords(previous, records, thread, nowMs = Date.now()) {
  const latestTurn = thread.turns?.at(-1) ?? null;
  const lastTaskStart = records.findLast(
    (record) => record.type === "event_msg" && record.payload?.type === "task_started",
  );
  const targetTurnId = lastTaskStart?.payload?.turn_id
    ?? latestTurn?.id
    ?? previous?.turnId
    ?? null;
  let observation = previous?.turnId === targetTurnId
    ? structuredClone(previous)
    : createObservation(targetTurnId, latestTurn);
  observation.pendingCalls ??= {};
  observation.activity ??= [];
  observation.skills ??= [];

  let activeTurnId = previous?.turnId ?? targetTurnId;
  for (const record of records) {
    const payload = record.payload ?? {};

    if (record.type === "event_msg" && payload.type === "task_started") {
      activeTurnId = payload.turn_id ?? targetTurnId;
      if (activeTurnId !== targetTurnId) continue;
      observation = createObservation(targetTurnId, latestTurn);
      observation.startedAt = toIso(payload.started_at ?? record.timestamp)
        ?? observation.startedAt;
      touch(observation, record.timestamp ?? payload.started_at);
      continue;
    }
    if (activeTurnId && targetTurnId && activeTurnId !== targetTurnId) continue;

    if (record.type === "event_msg") {
      applyEventRecord(observation, record);
    } else if (record.type === "response_item") {
      applyResponseRecord(observation, record);
    }
  }

  const turn = thread.turns?.find(({ id }) => id === targetTurnId) ?? latestTurn;
  applyTurnItems(observation, turn);
  applyTurnTerminalState(observation, turn);
  observation.currentActivity = getCurrentActivity(observation.pendingCalls);
  observation.status = getStatus(observation, thread, turn, nowMs);
  observation.activity = observation.activity
    .filter((item, index, items) => items.findIndex(({ id }) => id === item.id) === index)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 4);
  observation.durationSeconds = getDurationSeconds(observation, nowMs, turn);
  return observation;
}

function createObservation(turnId, turn) {
  const startedAt = toIso(turn?.startedAt);
  return {
    turnId,
    assignedWork: "",
    skills: [],
    plan: null,
    tokens: null,
    status: "idle",
    currentActivity: null,
    lastActivityAt: startedAt,
    startedAt,
    endedAt: null,
    durationSeconds: null,
    activity: [],
    pendingCalls: {},
    terminalStatus: null,
  };
}

function applyEventRecord(observation, record) {
  const payload = record.payload ?? {};
  touch(observation, record.timestamp);

  if (payload.type === "user_message") {
    applyUserMessage(observation, payload.message);
  } else if (payload.type === "token_count") {
    const tokens = payload.info?.total_token_usage?.total_tokens;
    if (Number.isFinite(tokens)) observation.tokens = tokens;
  } else if (payload.type === "task_complete") {
    observation.terminalStatus = ["cancelled", "stopped"].includes(payload.status)
      ? payload.status
      : "complete";
    observation.endedAt = toIso(payload.completed_at ?? record.timestamp);
  } else if (["cancelled", "stopped"].includes(payload.status)) {
    observation.terminalStatus = payload.status;
    observation.endedAt = toIso(payload.completed_at ?? record.timestamp);
  }
}

function applyTurnItems(observation, turn) {
  if (!turn) return;
  for (const item of turn.items ?? []) {
    if (item.type !== "userMessage") continue;
    const text = item.content
      .filter(({ type }) => type === "text")
      .map(({ text: value }) => value)
      .join("\n");
    if (!observation.assignedWork) applyUserMessage(observation, text);
    observation.skills = unique([
      ...observation.skills,
      ...item.content.filter(({ type }) => type === "skill").map(({ name }) => name),
    ]);
  }
}

function applyUserMessage(observation, value) {
  const message = String(value ?? "").replace(STRUCTURAL_BLOCK, " ");
  observation.skills = unique([
    ...observation.skills,
    ...[...message.matchAll(SKILL_REFERENCE)].map((match) => match[1]),
  ]);
  observation.assignedWork = message.replace(SKILL_REFERENCE, " ").replace(/\s+/g, " ").trim();
}

function applyResponseRecord(observation, record) {
  const payload = record.payload ?? {};
  if (payload.type === "function_call" || payload.type === "custom_tool_call") {
    const callId = payload.call_id ?? payload.id;
    const name = payload.name ?? payload.tool_name ?? "tool";
    const input = parseArguments(payload.arguments ?? payload.input);
    const step = classifyToolCall(name, input);
    const label = getToolLabel(name, input);
    observation.pendingCalls[callId] = {
      name,
      step,
      label,
      startedAt: toIso(record.timestamp),
    };
    if (name.split(".").at(-1) === "update_plan") {
      observation.plan = {
        tasks: (input.plan ?? []).map((task) => ({
          title: task.step,
          status: PLAN_STATUS[task.status] ?? task.status,
        })),
      };
    }
    observation.activity.push({
      id: payload.id ?? callId,
      at: toIso(record.timestamp),
      kind: activityKind(step),
      label,
    });
    touch(observation, record.timestamp);
  } else if (
    payload.type === "function_call_output"
    || payload.type === "custom_tool_call_output"
  ) {
    delete observation.pendingCalls[payload.call_id];
    touch(observation, record.timestamp);
  }
}

function parseArguments(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function getToolLabel(name, input) {
  const leaf = String(name).split(".").at(-1);
  if (leaf === "shell_command" && typeof input.command === "string") {
    return input.command.split(/\r?\n/, 1)[0].trim() || leaf;
  }
  return leaf;
}

function activityKind(step) {
  return {
    Editing: "edit",
    Testing: "test",
    Waiting: "wait",
    "Reading files": "read",
    "Calling tool": "tool",
  }[step];
}

function getCurrentActivity(pendingCalls) {
  const current = Object.values(pendingCalls).sort(
    (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt),
  )[0];
  return current
    ? { step: current.step, label: current.label, startedAt: current.startedAt }
    : null;
}

function applyTurnTerminalState(observation, turn) {
  if (!turn) return;
  if (turn.status === "failed") observation.terminalStatus = "failed";
  if (turn.status === "interrupted") observation.terminalStatus = "stopped";
  if (["cancelled", "stopped"].includes(turn.status)) {
    observation.terminalStatus = turn.status;
  }
  if (["completed", "complete"].includes(turn.status)) {
    observation.terminalStatus ??= "complete";
  }
  if (observation.terminalStatus && !observation.endedAt) {
    observation.endedAt = toIso(turn.completedAt)
      ?? addDuration(observation.startedAt, turn.durationMs)
      ?? observation.lastActivityAt;
  }
}

function getStatus(observation, thread, turn, nowMs) {
  const flags = thread.status?.activeFlags ?? [];
  const calls = Object.values(observation.pendingCalls);
  const hasInputRequest = calls.some(({ name }) => name.split(".").at(-1) === "request_user_input");

  if (
    flags.includes("waitingOnApproval")
    || flags.includes("waitingOnUserInput")
    || hasInputRequest
  ) return "needs_input";
  if (thread.status?.type === "systemError" || turn?.status === "failed") return "failed";
  if (["cancelled", "stopped"].includes(observation.terminalStatus)) {
    return observation.terminalStatus;
  }
  if (turn?.status === "interrupted") return "stopped";
  if (calls.some(({ name }) => ["wait", "wait_agent"].includes(name.split(".").at(-1)))) {
    return "waiting";
  }
  if (calls.some(({ name }) => name.split(".").at(-1) === "update_plan")) return "planning";
  if (observation.terminalStatus === "complete") return "complete";

  const lastActivity = Date.parse(observation.lastActivityAt);
  if (!Number.isNaN(lastActivity) && nowMs - lastActivity > IDLE_AFTER_MS) return "idle";
  return "running";
}

function getDurationSeconds(observation, nowMs, turn) {
  if (Number.isFinite(turn?.durationMs) && observation.terminalStatus) {
    return Math.max(0, Math.floor(turn.durationMs / 1000));
  }
  const startedAt = Date.parse(observation.startedAt);
  if (Number.isNaN(startedAt)) return null;
  const endedAt = Date.parse(observation.endedAt);
  return Math.max(
    0,
    Math.floor(((Number.isNaN(endedAt) ? nowMs : endedAt) - startedAt) / 1000),
  );
}

function touch(observation, value) {
  const timestamp = toIso(value);
  if (!timestamp) return;
  if (!observation.lastActivityAt || Date.parse(timestamp) >= Date.parse(observation.lastActivityAt)) {
    observation.lastActivityAt = timestamp;
  }
}

function toIso(value) {
  if (value == null) return null;
  const time = typeof value === "number" ? value * 1000 : Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function addDuration(startedAt, durationMs) {
  const start = Date.parse(startedAt);
  if (Number.isNaN(start) || !Number.isFinite(durationMs)) return null;
  return new Date(start + durationMs).toISOString();
}

function unique(values) {
  return [...new Set(values)];
}
