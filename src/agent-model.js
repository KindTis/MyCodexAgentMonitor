const STATUS_ALIASES = {
  input: "needs_input",
  approval_required: "needs_input",
  working: "running",
  executing: "running",
  done: "complete",
  completed: "complete",
};

export const SESSION_LEDGER_VISIBLE_ROWS = 5;

const KNOWN_STATUSES = new Set([
  "needs_input",
  "blocked",
  "failed",
  "running",
  "waiting",
  "planning",
  "queued",
  "idle",
  "paused",
  "complete",
  "cancelled",
  "stopped",
]);

const ACTIVE_CHILD_STATUSES = new Set([
  "running",
  "waiting",
  "planning",
  "needs_input",
  "blocked",
]);

const OPERATIONAL_RANK = {
  needs_input: 0,
  blocked: 0,
  failed: 0,
  running: 1,
  waiting: 2,
  planning: 3,
  queued: 3,
  idle: 4,
  paused: 4,
  complete: 5,
  cancelled: 5,
  stopped: 5,
};

export function normalizeStatus(status) {
  const normalized = String(status ?? "").toLowerCase();
  const aliased = STATUS_ALIASES[normalized] ?? normalized;
  return KNOWN_STATUSES.has(aliased) ? aliased : "idle";
}

export function getPlanProgress(plan) {
  const tasks = plan?.tasks ?? [];
  const completed = tasks.filter((task) => task.status === "done").length;

  return {
    completed,
    total: tasks.length,
    activeTask: tasks.find((task) => task.status === "active")?.title ?? null,
  };
}

export function getSessionMetrics(session) {
  const plan = getPlanProgress(session.plan);
  const children = session.children ?? [];

  return {
    skills: session.skills?.length ?? 0,
    tasks: plan.total ? { completed: plan.completed, total: plan.total } : null,
    goalStatus: session.goal?.status ?? null,
    subagents: {
      active: children.filter((child) => ACTIVE_CHILD_STATUSES.has(normalizeStatus(child.status))).length,
      total: children.length,
    },
  };
}

export function getVisibleSessions(sessions) {
  return sessions.filter(
    (session) => Boolean(session.id ?? session.sessionId) && session.parentSessionId == null,
  );
}

function toTime(value) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
}

function durationInSeconds(session) {
  if (Number.isFinite(session.durationSeconds)) return session.durationSeconds;
  if (!/^\d+:\d{2}$/.test(session.duration ?? "")) return null;
  const [minutes, seconds] = session.duration.split(":").map(Number);
  return minutes * 60 + seconds;
}

export function getDisplayedDuration(session, collectedAt, nowMs) {
  const duration = durationInSeconds(session);
  const measuredAt = toTime(collectedAt);
  if (
    duration == null
    || !session.isWorking
    || measuredAt == null
    || !Number.isFinite(nowMs)
  ) return duration;
  return duration + Math.max(0, Math.floor((nowMs - measuredAt) / 1000));
}

function sortValue(session, key) {
  const metrics = getSessionMetrics(session);

  switch (key) {
    case "agent":
      return session.agentNickname ?? "Codex";
    case "session":
      return `${session.session ?? ""} ${session.assignedWork ?? ""}`.trim() || null;
    case "status":
    case "operational":
      return OPERATIONAL_RANK[normalizeStatus(session.status)];
    case "time":
      return durationInSeconds(session);
    case "skills":
      return metrics.skills;
    case "tasks":
      return metrics.tasks ? metrics.tasks.total - metrics.tasks.completed : null;
    case "goal":
      return session.goal ? { active: 0, paused: 1, complete: 2 }[session.goal.status] ?? 3 : null;
    case "subagents":
      return metrics.subagents.active * 1000 + metrics.subagents.total;
    default:
      return null;
  }
}

function compareValues(a, b, direction) {
  const aMissing = a == null || a === "";
  const bMissing = b == null || b === "";
  if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;

  const result =
    typeof a === "string"
      ? a.localeCompare(String(b), undefined, { sensitivity: "base" })
      : a - b;
  return direction === "desc" ? -result : result;
}

export function sortSessions(sessions, { key = "operational", direction = "asc" } = {}) {
  return [...sessions].sort((a, b) => {
    const primary = compareValues(sortValue(a, key), sortValue(b, key), direction);
    if (primary) return primary;

    const activity = compareValues(toTime(a.lastActivityAt), toTime(b.lastActivityAt), "desc");
    if (activity) return activity;

    const started = compareValues(toTime(a.startedAt), toTime(b.startedAt), "desc");
    if (started) return started;

    return String(a.id ?? a.sessionId).localeCompare(String(b.id ?? b.sessionId));
  });
}

export function getRelativeTime(lastActivityAt, now = new Date()) {
  const timestamp = toTime(lastActivityAt);
  if (timestamp == null) return "";

  const seconds = Math.max(0, Math.floor((now.getTime() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export function formatTokenCount(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat("en-US").format(value) : "—";
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function formatUtcTime(value) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? "—" : new Date(time).toISOString().slice(11, 19);
}

const GOAL_STATUS_LABELS = {
  active: "Active",
  paused: "Paused",
  blocked: "Blocked",
  usageLimited: "Usage limited",
  budgetLimited: "Budget limited",
  complete: "Complete",
};

export function formatGoalStatus(status) {
  return GOAL_STATUS_LABELS[status] ?? "—";
}

export function getSnapshotChanges(previous, next) {
  const previousSessions = new Map(
    (previous?.sessions ?? []).map((session) => [session.id, session]),
  );

  return Object.fromEntries((next?.sessions ?? []).map((session) => {
    const before = previousSessions.get(session.id);
    if (!before) {
      return [session.id, {
        tokenKeys: [],
        taskTitles: [],
        childIds: [],
        handoffChildIds: [],
        activityIds: [],
      }];
    }
    const beforeTasks = new Map(
      (before.plan?.tasks ?? []).map((task) => [task.title, task.status]),
    );
    const beforeChildren = new Map(
      (before.children ?? []).map((child) => [child.id, child.status]),
    );
    const beforeActivities = new Set(
      (before.activity ?? []).map((activity) => activity.id),
    );

    return [session.id, {
      tokenKeys: ["root", "children", "total"].filter(
        (key) => before.tokens?.[key] !== session.tokens?.[key],
      ),
      taskTitles: (session.plan?.tasks ?? [])
        .filter((task) => beforeTasks.get(task.title) !== task.status)
        .map((task) => task.title),
      childIds: (session.children ?? [])
        .filter((child) => beforeChildren.get(child.id) !== child.status)
        .map((child) => child.id),
      handoffChildIds: (session.children ?? [])
        .filter((child) => (
          child.status === "complete"
          && beforeChildren.get(child.id) !== "complete"
        ))
        .map((child) => child.id),
      activityIds: (session.activity ?? [])
        .filter((activity) => !beforeActivities.has(activity.id))
        .map((activity) => activity.id),
    }];
  }));
}

export function getRowScrollTop({ rowIndex, rowHeight, viewportHeight, scrollTop }) {
  if (rowIndex < 0) return scrollTop;
  const rowTop = rowIndex * rowHeight;
  const rowBottom = rowTop + rowHeight;
  if (rowTop < scrollTop) return rowTop;
  if (rowBottom > scrollTop + viewportHeight) return rowBottom - viewportHeight;
  return scrollTop;
}
