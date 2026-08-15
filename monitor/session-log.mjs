import * as fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

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

export function classifyChildSource(source) {
  if (["subAgent", "subAgentReview", "subAgentCompact", "subAgentThreadSpawn"].includes(source)) {
    return "user";
  }
  if (source === "subAgentOther") return "unknown";
  const subAgent = source?.subAgent ?? source?.subagent;
  if (!subAgent) return "unknown";
  if (subAgent.other === "guardian") return "guardian";
  if (
    subAgent.thread_spawn
    || ["review", "compact", "memory_consolidation"].includes(subAgent)
  ) return "user";
  return "unknown";
}

export async function discoverChildCandidates({
  codexHome,
  parentThreadIds,
  updatedAfterMs = 0,
  knownFiles = null,
}) {
  const parents = new Set(parentThreadIds);
  if (!parents.size) return [];
  const sessionsRoot = path.join(path.resolve(codexHome), "sessions");
  let entries;
  try {
    entries = await fs.readdir(sessionsRoot, { recursive: true, withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const candidates = [];
  const initialScan = knownFiles?.size === 0;
  // ponytail: 최근 파일만 stat하는 O(n) scan이다. 3초 수집이 측정상 느릴 때만 디렉터리 watermark를 추가한다.
  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name) !== ".jsonl") continue;
    const filePath = path.join(entry.parentPath, entry.name);
    const metadata = await fs.stat(filePath);
    if (knownFiles) {
      const previousSize = knownFiles.get(filePath);
      knownFiles.set(filePath, metadata.size);
      const changed = previousSize == null || previousSize !== metadata.size;
      if (initialScan ? metadata.mtimeMs < updatedAfterMs : !changed) continue;
    } else if (metadata.mtimeMs < updatedAfterMs) {
      continue;
    }
    const record = await readFirstJsonRecord(filePath);
    if (record?.type !== "session_meta") continue;

    const payload = record.payload ?? {};
    const spawn = payload.source?.subagent?.thread_spawn
      ?? payload.source?.subAgent?.thread_spawn;
    const parentThreadId = payload.parent_thread_id ?? spawn?.parent_thread_id ?? null;
    if (!parents.has(parentThreadId)) continue;
    const id = payload.id ?? payload.session_id;
    if (!id) continue;
    const createdAt = Date.parse(payload.timestamp ?? record.timestamp) / 1000;

    candidates.push({
      id,
      sessionId: payload.session_id ?? id,
      parentThreadId,
      createdAt: Number.isFinite(createdAt) ? createdAt : metadata.birthtimeMs / 1000,
      updatedAt: metadata.mtimeMs / 1000,
      status: { type: "notLoaded" },
      path: filePath,
      cwd: payload.cwd ?? null,
      source: payload.source ?? "unknown",
      agentNickname: payload.agent_nickname ?? spawn?.agent_nickname ?? null,
      agentRole: payload.agent_role ?? spawn?.agent_role ?? null,
      name: null,
      turns: [],
    });
  }
  return candidates;
}

async function readFirstJsonRecord(filePath) {
  const input = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      const [record] = parseJsonLine(line);
      if (record) return record;
    }
    return null;
  } finally {
    lines.close();
    input.destroy();
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
    ?? previous?.turnId
    ?? latestTurn?.id
    ?? null;
  let observation = previous?.turnId === targetTurnId
    ? structuredClone(previous)
    : createObservation(targetTurnId, latestTurn, previous);
  observation.pendingCalls ??= {};
  observation.activity ??= [];
  observation.messages ??= [];
  observation.skills ??= [];
  observation.workingMilliseconds ??= 0;
  observation.workingSince ??= null;
  observation.workingPauseCalls ??= {};
  observation.workingRecordKeys ??= {};
  observation.statusBasis ??= "inferred";
  observation.lastObservedAt ??= null;
  observation.sawTaskStarted ??= false;
  observation.terminalStatusBasis ??= null;
  if (!previous && records.length === 0 && thread.path == null) {
    observation.workingMilliseconds = getThreadWorkingMilliseconds(thread);
  }

  let activeTurnId = previous?.turnId ?? targetTurnId;
  for (const record of records) {
    const payload = record.payload ?? {};
    applyWorkingRecord(observation, record);
    if (
      record.type === "response_item"
      && (payload.type === "function_call" || payload.type === "custom_tool_call")
    ) {
      const rawInput = payload.arguments ?? payload.input;
      const plan = extractPlanUpdate(
        payload.name ?? payload.tool_name ?? "tool",
        rawInput,
        parseArguments(rawInput),
      );
      if (plan) observation.plan = plan;
    }
    if (
      record.type === "response_item"
      && payload.type === "message"
      && payload.role === "assistant"
    ) {
      const text = (payload.content ?? [])
        .filter(({ type }) => type === "output_text")
        .map(({ text: value }) => value)
        .join("\n")
        .trim();
      if (text) {
        observation.messages.push({
          id: payload.id ?? `message-${record.timestamp}`,
          at: toIso(record.timestamp),
          text,
        });
      }
    }
    if (record.type === "event_msg" && payload.type === "task_started") {
      activeTurnId = payload.turn_id ?? targetTurnId;
      if (activeTurnId !== targetTurnId) continue;
      observation = createObservation(targetTurnId, latestTurn, observation);
      observation.sawTaskStarted = true;
      observation.startedAt = toIso(payload.started_at ?? record.timestamp)
        ?? observation.startedAt;
      touch(observation, record.timestamp ?? payload.started_at);
      continue;
    }
    if (activeTurnId && targetTurnId && activeTurnId !== targetTurnId) continue;

    if (record.type === "turn_context" && typeof payload.model === "string") {
      observation.model = payload.model;
    } else if (record.type === "event_msg") {
      applyEventRecord(observation, record);
    } else if (record.type === "response_item") {
      applyResponseRecord(observation, record);
    }
  }

  const turn = thread.turns?.find(({ id }) => id === targetTurnId) ?? null;
  applyTurnItems(observation, turn);
  applyTurnTerminalState(observation, thread, turn);
  observation.currentActivity = getCurrentActivity(observation.pendingCalls);
  const status = getStatus(observation, thread, turn, nowMs);
  observation.status = status.status;
  observation.statusBasis = status.basis;
  observation.isWorking = getIsWorking(observation);
  syncWorkingClock(observation, nowMs, previous == null);
  observation.activity = observation.activity
    .filter((item, index, items) => items.findIndex(({ id }) => id === item.id) === index)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 10);
  observation.messages = observation.messages
    .filter((item, index, items) => items.findIndex(({ id }) => id === item.id) === index)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 10);
  observation.durationSeconds = getDurationSeconds(observation, nowMs);
  return observation;
}

function createObservation(turnId, turn, previous = null) {
  const startedAt = toIso(turn?.startedAt);
  return {
    turnId,
    assignedWork: "",
    model: null,
    skills: [],
    plan: structuredClone(previous?.plan ?? null),
    messages: structuredClone(previous?.messages ?? []),
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
    terminalStatusBasis: null,
    statusBasis: "inferred",
    lastObservedAt: null,
    sawTaskStarted: false,
    workingMilliseconds: previous?.workingMilliseconds ?? 0,
    workingSince: previous?.workingSince ?? null,
    workingPauseCalls: structuredClone(previous?.workingPauseCalls ?? {}),
    workingRecordKeys: structuredClone(previous?.workingRecordKeys ?? {}),
    isWorking: false,
  };
}

function applyEventRecord(observation, record) {
  const payload = record.payload ?? {};
  if (payload.turn_id && payload.turn_id !== observation.turnId) return;
  const recognized = ["user_message", "token_count", "task_complete"].includes(payload.type)
    || ["failed", "cancelled", "stopped", "interrupted"].includes(payload.status);
  if (!recognized) return;
  touch(observation, record.timestamp);

  if (payload.type === "user_message") {
    applyUserMessage(observation, payload.message);
  } else if (payload.type === "token_count") {
    const tokens = payload.info?.total_token_usage?.total_tokens;
    if (Number.isFinite(tokens)) observation.tokens = tokens;
  } else if (payload.type === "task_complete") {
    observation.terminalStatus = ["failed", "cancelled", "stopped"].includes(payload.status)
      ? payload.status
      : payload.status === "interrupted" ? "stopped" : "complete";
    observation.terminalStatusBasis = "observed";
    observation.endedAt = toIso(payload.completed_at ?? record.timestamp);
  } else if (["failed", "cancelled", "stopped", "interrupted"].includes(payload.status)) {
    observation.terminalStatus = payload.status === "interrupted" ? "stopped" : payload.status;
    observation.terminalStatusBasis = "observed";
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
    applyUserMessage(observation, text);
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
  const assignedWork = message.replace(SKILL_REFERENCE, " ").replace(/\s+/g, " ").trim();
  if (assignedWork) observation.assignedWork = assignedWork;
}

function applyResponseRecord(observation, record) {
  const payload = record.payload ?? {};
  if (payload.type === "function_call" || payload.type === "custom_tool_call") {
    const callId = payload.call_id ?? payload.id;
    const name = payload.name ?? payload.tool_name ?? "tool";
    const rawInput = payload.arguments ?? payload.input;
    const input = parseArguments(rawInput);
    const step = classifyToolCall(name, input);
    const label = getToolLabel(name, input, rawInput);
    observation.pendingCalls[callId] = {
      name,
      step,
      label,
      startedAt: toIso(record.timestamp),
    };
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

function applyWorkingRecord(observation, record) {
  const payload = record.payload ?? {};
  if (record.type === "event_msg") {
    if (payload.type === "task_started") {
      if (!claimWorkingRecord(observation, record)) return;
      observation.workingPauseCalls = {};
      startWorking(observation, payload.started_at ?? record.timestamp);
    } else if (
      payload.type === "task_complete"
      || ["cancelled", "stopped"].includes(payload.status)
    ) {
      if (!claimWorkingRecord(observation, record)) return;
      stopWorking(observation, payload.completed_at ?? record.timestamp);
    }
    return;
  }
  if (record.type !== "response_item") return;

  if (payload.type === "function_call" || payload.type === "custom_tool_call") {
    const name = payload.name ?? payload.tool_name ?? "";
    const leaf = name.split(".").at(-1);
    if (!["request_user_input", "wait_agent"].includes(leaf)) return;
    if (!claimWorkingRecord(observation, record)) return;
    const callId = payload.call_id ?? payload.id;
    observation.workingPauseCalls[callId] = true;
    stopWorking(observation, record.timestamp);
    return;
  }
  if (
    payload.type !== "function_call_output"
    && payload.type !== "custom_tool_call_output"
  ) return;
  if (!observation.workingPauseCalls[payload.call_id]) return;
  if (!claimWorkingRecord(observation, record)) return;

  delete observation.workingPauseCalls[payload.call_id];
  if (!Object.keys(observation.workingPauseCalls).length) {
    startWorking(observation, record.timestamp);
  }
}

// ponytail: Turn·대기 사건 키만 보존한다. 장기 세션에서 메모리가 문제일 때 watermark로 교체한다.
function claimWorkingRecord(observation, record) {
  const payload = record.payload ?? {};
  const identity = payload.call_id ?? payload.id ?? payload.turn_id ?? payload.status ?? "";
  const key = `${record.timestamp}|${record.type}|${payload.type}|${identity}`;
  if (observation.workingRecordKeys[key]) return false;
  observation.workingRecordKeys[key] = true;
  return true;
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

function extractPlanUpdate(name, rawInput, input) {
  const leaf = String(name).split(".").at(-1);
  if (leaf === "update_plan") return normalizePlan(input.plan ?? []);
  if (leaf !== "exec" || typeof rawInput !== "string") return null;

  let latest = null;
  for (const inputSource of findUpdatePlanInputs(rawInput)) {
    const planMatch = inputSource.match(
      /^\s*\{[\s\S]*?(?:"plan"|\bplan)\s*:\s*\[([\s\S]*?)\]\s*,?\s*\}\s*$/,
    );
    if (!planMatch) continue;
    const source = planMatch[1];
    const taskPattern = /\{\s*(?:"step"|step)\s*:\s*("(?:\\.|[^"\\])*")\s*,\s*(?:"status"|status)\s*:\s*"(completed|in_progress|pending)"\s*,?\s*\}/g;
    if (source.replace(taskPattern, "").replace(/[\s,]/g, "")) continue;
    try {
      latest = normalizePlan([...source.matchAll(taskPattern)].map((match) => ({
        step: JSON.parse(match[1]),
        status: match[2],
      })));
    } catch {
      // 불완전한 exec 소스는 기존 Plan을 덮어쓰지 않는다.
    }
  }
  return latest;
}

// ponytail: 실행 없이 문자열·주석·괄호만 구분한다. App Server가 Plan 이력을 주면 제거한다.
function findUpdatePlanInputs(source) {
  const token = "tools.update_plan";
  const inputs = [];
  for (let index = 0; index < source.length;) {
    const skipped = skipJsText(source, index);
    if (skipped !== index) {
      index = skipped;
      continue;
    }
    if (
      source.startsWith(token, index)
      && !/[\w$]/.test(source[index - 1] ?? "")
    ) {
      let open = index + token.length;
      while (/\s/.test(source[open] ?? "")) open += 1;
      const call = source[open] === "(" ? readCallInput(source, open) : null;
      if (call) {
        inputs.push(call.input);
        index = call.end;
        continue;
      }
      index += token.length;
      continue;
    }
    index += 1;
  }
  return inputs;
}

function readCallInput(source, open) {
  let depth = 1;
  for (let index = open + 1; index < source.length;) {
    const skipped = skipJsText(source, index);
    if (skipped !== index) {
      index = skipped;
      continue;
    }
    if (source[index] === "(") depth += 1;
    if (source[index] === ")" && --depth === 0) {
      return { input: source.slice(open + 1, index), end: index + 1 };
    }
    index += 1;
  }
  return null;
}

function skipJsText(source, index) {
  const quote = source[index];
  if (["\"", "'", "`"].includes(quote)) {
    for (let cursor = index + 1; cursor < source.length; cursor += 1) {
      if (source[cursor] === "\\") cursor += 1;
      else if (source[cursor] === quote) return cursor + 1;
    }
    return source.length;
  }
  if (source.startsWith("//", index)) {
    const newline = source.indexOf("\n", index + 2);
    return newline < 0 ? source.length : newline + 1;
  }
  if (source.startsWith("/*", index)) {
    const close = source.indexOf("*/", index + 2);
    return close < 0 ? source.length : close + 2;
  }
  return index;
}

function normalizePlan(tasks) {
  return {
    tasks: tasks.map((task) => ({
      title: task.step,
      status: PLAN_STATUS[task.status] ?? task.status,
    })),
  };
}

function getToolLabel(name, input, rawInput) {
  const leaf = String(name).split(".").at(-1);
  if (leaf === "shell_command") {
    const command = summarizeCommand(input.command);
    return command ? `Run · ${command}` : "Run command";
  }
  if (leaf === "exec") return summarizeExec(rawInput) ?? "Run tool batch";
  if (leaf === "wait") return formatWait("Wait for command", input.yield_time_ms);
  if (leaf === "wait_agent") return formatWait("Wait for child agents", input.timeout_ms);
  if (leaf === "request_user_input") return "Wait for user input";
  if (leaf === "update_plan") {
    const count = Array.isArray(input.plan) ? input.plan.length : 0;
    return count ? `Update plan · ${count} tasks` : "Update plan";
  }
  if (leaf === "apply_patch") return "Edit files";
  return humanizeToolName(leaf);
}

function summarizeExec(source) {
  if (typeof source !== "string") return null;
  // ponytail: exec 표시는 첫 관찰 가능한 도구만 요약한다. 전체 실행 추적이 필요해지면 AST로 교체한다.
  const nested = source.match(/\btools\.([A-Za-z_$][\w$]*)\s*\(/)?.[1];
  if (!nested) return null;
  if (nested === "shell_command") {
    const literal = source.match(/\bcommand\s*:\s*("(?:\\.|[^"\\])*")/)?.[1];
    if (literal) {
      try {
        return `Run · ${summarizeCommand(JSON.parse(literal))}`;
      } catch {
        return "Run command";
      }
    }
    return "Run command";
  }
  if (nested === "update_plan") {
    const count = extractPlanUpdate("exec", source, {})?.tasks.length ?? 0;
    return count ? `Update plan · ${count} tasks` : "Update plan";
  }
  return `Call · ${humanizeToolName(nested)}`;
}

function summarizeCommand(value) {
  let command = String(value ?? "")
    .split(/\r?\n/, 1)[0]
    .replace(/\s+/g, " ")
    .trim();
  command = command.replace(
    /((?:token|password|secret|api[_-]?key|authorization)\s*(?:[:=]\s*|\s+))(?:("(?:\\.|[^"\\])*")|('(?:\\.|[^'\\])*')|[^\s;]+)/gi,
    "$1***",
  );
  const graphifyQuery = command.match(/^graphify\s+query\b/i)?.[0];
  if (graphifyQuery) return graphifyQuery;
  return command.length > 96 ? `${command.slice(0, 95)}…` : command;
}

function formatWait(label, milliseconds) {
  const seconds = Number.isFinite(milliseconds) ? Math.round(milliseconds / 1000) : 0;
  return seconds > 0 ? `${label} · up to ${seconds}s` : label;
}

function humanizeToolName(value) {
  const words = String(value).replace(/_+/g, " ").trim();
  return words ? `${words[0].toUpperCase()}${words.slice(1)}` : "Tool call";
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

function applyTurnTerminalState(observation, thread, turn) {
  if (!turn || turn.id !== observation.turnId) return;
  if (turn.status === "failed") observation.terminalStatus = "failed";
  if (turn.status === "interrupted" && thread.status?.type !== "notLoaded") {
    observation.terminalStatus = "stopped";
  }
  if (["cancelled", "stopped"].includes(turn.status)) {
    observation.terminalStatus = turn.status;
  }
  if (["completed", "complete"].includes(turn.status)) {
    observation.terminalStatus ??= "complete";
  }
  if (observation.terminalStatus) observation.terminalStatusBasis ??= "observed";
  if (observation.terminalStatus && !observation.endedAt) {
    observation.endedAt = toIso(turn.completedAt)
      ?? addDuration(observation.startedAt, turn.durationMs)
      ?? observation.lastActivityAt;
  }
}

function getStatus(observation, thread, turn, nowMs) {
  const calls = Object.values(observation.pendingCalls);
  const hasInputRequest = calls.some(
    ({ name }) => name.split(".").at(-1) === "request_user_input",
  );

  if (observation.terminalStatus) {
    return {
      status: observation.terminalStatus,
      basis: observation.terminalStatusBasis ?? "observed",
    };
  }
  if (hasInputRequest) return { status: "needs_input", basis: "observed" };
  if (canUseAppServerWait(thread, turn, observation)) {
    return { status: "needs_input", basis: "inferred" };
  }
  if (calls.some(({ name }) => ["wait", "wait_agent"].includes(name.split(".").at(-1)))) {
    return { status: "waiting", basis: "observed" };
  }
  if (calls.some(({ name }) => name.split(".").at(-1) === "update_plan")) {
    return { status: "planning", basis: "observed" };
  }
  if (calls.length) return { status: "running", basis: "observed" };

  const lastActivity = Date.parse(observation.lastActivityAt);
  if (!Number.isNaN(lastActivity) && nowMs - lastActivity >= IDLE_AFTER_MS) {
    return { status: "idle", basis: "inferred" };
  }
  if (observation.sawTaskStarted) return { status: "running", basis: "observed" };
  if (thread.status?.type === "systemError") return { status: "failed", basis: "inferred" };
  return { status: "running", basis: "inferred" };
}

function canUseAppServerWait(thread, turn, observation) {
  if (!turn || turn.id !== observation.turnId) return false;
  const flags = thread.status?.activeFlags ?? [];
  if (
    !flags.includes("waitingOnApproval")
    && !flags.includes("waitingOnUserInput")
  ) return false;

  const observedAt = Date.parse(observation.lastObservedAt);
  if (Number.isNaN(observedAt)) return true;
  const appServerUpdatedAt = Number.isFinite(thread.updatedAt)
    ? thread.updatedAt * 1000
    : Number.NaN;
  return Number.isFinite(appServerUpdatedAt) && appServerUpdatedAt >= observedAt;
}

function getDurationSeconds(observation, nowMs) {
  const workingSince = Date.parse(observation.workingSince);
  const activeMilliseconds = Number.isNaN(workingSince)
    ? 0
    : Math.max(0, nowMs - workingSince);
  return Math.floor((observation.workingMilliseconds + activeMilliseconds) / 1000);
}

function getIsWorking(observation) {
  return observation.statusBasis === "observed"
    && ["running", "planning"].includes(observation.status);
}

function syncWorkingClock(observation, nowMs, initial) {
  // ponytail: activeFlags 자체에는 시각이 없어 pending 시작 시각을 쓰고, 없으면 수집 시각을 쓴다.
  if (observation.isWorking) {
    startWorking(
      observation,
      initial
        ? observation.lastActivityAt ?? observation.startedAt ?? nowMs / 1000
        : nowMs / 1000,
    );
    return;
  }
  const stoppedAt = observation.endedAt
    ?? (observation.status === "idle" ? observation.lastActivityAt : null)
    ?? (observation.status === "needs_input" ? observation.currentActivity?.startedAt : null)
    ?? nowMs / 1000;
  stopWorking(observation, stoppedAt);
}

function startWorking(observation, value) {
  if (observation.workingSince || Object.keys(observation.workingPauseCalls).length) return;
  observation.workingSince = toIso(value);
}

function stopWorking(observation, value) {
  const startedAt = Date.parse(observation.workingSince);
  const stoppedAt = Date.parse(toIso(value));
  if (!Number.isNaN(startedAt) && !Number.isNaN(stoppedAt)) {
    observation.workingMilliseconds += Math.max(0, stoppedAt - startedAt);
  }
  observation.workingSince = null;
}

function getThreadWorkingMilliseconds(thread) {
  return (thread.turns ?? []).reduce((total, turn) => {
    const interrupted = turn.status === "interrupted";
    const terminal = ["completed", "complete", "failed", "cancelled", "stopped"].includes(
      turn.status,
    ) || (interrupted && thread.status?.type !== "notLoaded");
    if (!terminal) return total;
    if (Number.isFinite(turn.durationMs)) return total + Math.max(0, turn.durationMs);

    const startedAt = Number.isFinite(turn.startedAt) ? turn.startedAt * 1000 : Number.NaN;
    const completedAt = Number.isFinite(turn.completedAt) ? turn.completedAt * 1000 : Number.NaN;
    return Number.isFinite(startedAt) && Number.isFinite(completedAt)
      ? total + Math.max(0, completedAt - startedAt)
      : total;
  }, 0);
}

function touch(observation, value) {
  const timestamp = toIso(value);
  if (!timestamp) return;
  if (!observation.lastActivityAt || Date.parse(timestamp) >= Date.parse(observation.lastActivityAt)) {
    observation.lastActivityAt = timestamp;
  }
  if (!observation.lastObservedAt || Date.parse(timestamp) >= Date.parse(observation.lastObservedAt)) {
    observation.lastObservedAt = timestamp;
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
