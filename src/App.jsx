import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import gsap from "gsap";
import {
  ArrowSquareOut,
  ArrowsDownUp,
  BracketsCurly,
  CaretUp,
  CaretDown,
  CaretRight,
  Check,
  CheckCircle,
  CircleNotch,
  ClipboardText,
  Clock,
  ClockCounterClockwise,
  Code,
  Coins,
  FolderOpen,
  GearSix,
  GitBranch,
  HourglassMedium,
  Path,
  PauseCircle,
  Planet,
  Play,
  Pulse,
  Robot,
  ShieldCheck,
  Sparkle,
  Target,
  TerminalWindow,
  UserFocus,
  UsersThree,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";

import {
  formatCostUsd,
  formatDuration,
  formatGoalStatus,
  formatLocalClock,
  formatLocalTime,
  formatPercent,
  formatTokenCount,
  getActivityBoardLanes,
  getDisplayedDuration,
  getLatestSessionActivity,
  getPlanProgress,
  getRelativeTime,
  getRowScrollTop,
  getSessionMetrics,
  getSnapshotChanges,
  getVisibleSessions,
  normalizeStatus,
  sortSessions,
} from "./agent-model.js";

const statusMeta = {
  running: { label: "Running", icon: CircleNotch },
  waiting: { label: "Waiting", icon: HourglassMedium },
  planning: { label: "Planning", icon: Sparkle },
  queued: { label: "Queued", icon: Clock },
  needs_input: { label: "Needs input", icon: UserFocus },
  blocked: { label: "Blocked", icon: WarningCircle },
  failed: { label: "Failed", icon: WarningCircle },
  complete: { label: "Complete", icon: CheckCircle },
  idle: { label: "Idle", icon: PauseCircle },
  paused: { label: "Paused", icon: PauseCircle },
  cancelled: { label: "Cancelled", icon: PauseCircle },
  stopped: { label: "Stopped", icon: PauseCircle },
};

const taskStatusMeta = {
  done: { label: "Done", icon: Check },
  active: { label: "In progress", icon: Play },
  waiting: { label: "Waiting", icon: HourglassMedium },
  queued: { label: "Queued", icon: Clock },
};

const connectionStatusMeta = {
  connected: { label: "Connected", icon: CheckCircle },
  syncing: { label: "Syncing", icon: CircleNotch },
  error: { label: "Error", icon: WarningCircle },
};

const sortColumns = [
  { key: "agent", label: "Agent", direction: "asc" },
  { key: "session", label: "Session & assigned work", direction: "asc" },
  { key: "status", label: "Status & current activity", direction: "asc" },
  { key: "time", label: "Session time", direction: "desc" },
  { key: "skills", label: "Skills", direction: "desc" },
  { key: "tasks", label: "Tasks", direction: "desc" },
  { key: "goal", label: "Goal", direction: "asc" },
  { key: "subagents", label: "Subagents", direction: "desc" },
];

const liveSteps = ["Reading files", "Calling tool", "Editing", "Testing", "Waiting"];

const EMPTY_SNAPSHOT = {
  collectedAt: null,
  lastSuccessfulAt: null,
  connectionStatus: "syncing",
  errorCode: null,
  sessions: [],
  usage: {
    collectedAt: null,
    todayTokens: null,
    todayCostUsd: null,
    fiveHourUsedPercent: null,
    oneWeekUsedPercent: null,
  },
};

const EMPTY_CHANGES = {
  tokenKeys: [],
  taskTitles: [],
  childIds: [],
  handoffChildIds: [],
  activityIds: [],
};

function AgentMark({ item, size = 34, active = false, handoff = false }) {
  const child = item.parentSessionId != null;
  const Icon = child ? Robot : Path;

  return (
    <span
      className={`agent-mark ${active ? "agent-mark--active" : ""} ${handoff ? "agent-mark--handoff" : ""}`}
      style={{
        "--agent-color": child ? "#a78bfa" : "#718bff",
        width: size,
        height: size,
      }}
      aria-hidden="true"
    >
      <Icon size={size * 0.52} weight="regular" />
    </span>
  );
}

function StatusBadge({ status, statusBasis }) {
  const normalizedStatus = normalizeStatus(status);
  const meta = statusMeta[normalizedStatus];
  const Icon = meta.icon;

  return (
    <span className={`status-badge status-badge--${normalizedStatus}`}>
      <Icon size={13} weight={normalizedStatus === "complete" ? "fill" : "bold"} />
      {meta.label}
      {statusBasis === "inferred" && <small className="status-basis">추정</small>}
    </span>
  );
}

export function ConnectionState({ status, children }) {
  const meta = connectionStatusMeta[status] ?? connectionStatusMeta.error;
  const Icon = meta.icon;

  return (
    <span className={`status-badge connection-state connection-state--${status}`}>
      <Icon size={13} weight={status === "connected" ? "fill" : "bold"} />
      {meta.label} · {children}
    </span>
  );
}

function MetaValue({ label, children, accent = false, updated = false }) {
  return (
    <span
      className={`metric-value ${accent ? "metric-value--accent" : ""} ${updated ? "metric-value--updated" : ""}`}
    >
      <small>{label}</small>
      <strong>{children}</strong>
    </span>
  );
}

export function SessionRow({
  session,
  selected,
  onSelect,
  clock,
  wallClock = clock,
  changes,
  collectedAt,
}) {
  const metrics = getSessionMetrics(session);
  const status = normalizeStatus(session.status);
  const relativeTime = getRelativeTime(
    session.lastActivityAt,
    new Date(wallClock),
  );
  const duration = getDisplayedDuration(session, collectedAt, clock);
  const attention = ["needs_input", "blocked", "failed"].includes(status);

  return (
    <button
      type="button"
      className={`session-row session-row--${status} ${selected ? "session-row--selected" : ""} ${attention ? "session-row--attention" : ""}`}
      onClick={() => onSelect(session.id, "list")}
      aria-pressed={selected}
      aria-controls="session-detail"
      data-session-id={session.id}
    >
      <span className="session-agent">
        <AgentMark item={session} size={28} />
        <span>
          <strong>{session.projectName ?? "Unknown project"}</strong>
          <small>{session.gitBranch ?? "No Git branch"}</small>
        </span>
      </span>
      <span className="session-assignment">
        <strong>{session.session}</strong>
        <small>{session.assignedWork || "No assigned work"}</small>
      </span>
      <span className="session-state">
        <StatusBadge status={session.status} statusBasis={session.statusBasis} />
        <small className="session-activity">
          {session.currentActivity?.label ?? "No active tool"}
          {relativeTime ? ` · ${relativeTime}` : ""}
        </small>
      </span>
      <span className="session-time">
        <strong>{formatDuration(duration)}</strong>
        <small>Started {formatLocalTime(session.startedAt)}</small>
      </span>
      <span className="session-skills">
        <MetaValue label="Skills" accent={metrics.skills > 0}>
          {metrics.skills || "—"}
        </MetaValue>
      </span>
      <span className="session-tasks">
        <MetaValue
          label="Tasks"
          accent={Boolean(metrics.tasks && metrics.tasks.completed < metrics.tasks.total)}
        >
          {metrics.tasks ? `${metrics.tasks.completed}/${metrics.tasks.total}` : "—"}
        </MetaValue>
      </span>
      <span className="session-goal">
        <MetaValue label="Goal" accent={metrics.goalStatus === "active"}>
          {formatGoalStatus(session.goal?.status)}
        </MetaValue>
      </span>
      <span className="session-subagents">
        <MetaValue
          key={changes.childIds.length ? `children-${collectedAt}` : "children"}
          label="Subagents"
          accent={metrics.subagents.active > 0}
          updated={changes.childIds.length > 0}
        >
          {metrics.subagents.total
            ? `${metrics.subagents.active}/${metrics.subagents.total}`
            : "0"}
        </MetaValue>
        <CaretRight className="session-direction" size={16} aria-hidden="true" />
      </span>
    </button>
  );
}

function GlobalSessionCard({
  session,
  onSelect,
  clock,
  wallClock,
  collectedAt,
  connectedWorking,
  changes,
}) {
  const latestActivity = getLatestSessionActivity(session);
  const latestActivityChanged = Boolean(
    latestActivity?.id
    && changes.activityIds.includes(latestActivity.id),
  );
  const duration = getDisplayedDuration(session, collectedAt, clock);
  const relativeTime = getRelativeTime(
    latestActivity?.at,
    new Date(wallClock),
  );
  const workTitle = session.currentWork?.title
    || session.assignedWork
    || "No assigned work";
  const accessibleSessionName = session.session
    || session.projectName
    || session.id;
  const activelyWorking = Boolean(
    connectedWorking
    && session.isWorking
    && session.statusBasis !== "inferred",
  );

  return (
    <button
      type="button"
      className="global-session-card"
      data-board-session-id={session.id}
      aria-label={`Open details for ${accessibleSessionName}`}
      aria-controls="session-detail"
      onClick={() => onSelect(session.id, "board")}
    >
      <span className="global-card-identity">
        <strong>{session.projectName ?? "Unknown project"}</strong>
        <small><GitBranch size={11} /> {session.gitBranch ?? "No Git branch"}</small>
      </span>
      <StatusBadge status={session.status} statusBasis={session.statusBasis} />
      <span className="global-card-session">
        {session.session || "Untitled session"}
      </span>
      <span className="global-card-work">{workTitle}</span>
      <span
        key={latestActivityChanged
          ? `${latestActivity.id}-${collectedAt}`
          : latestActivity?.id ?? "no-activity"}
        className={`global-card-activity ${latestActivityChanged
          ? "global-card-activity--updated"
          : ""}`}
      >
        {latestActivity?.label ?? "No active tool"}
        {relativeTime ? ` · ${relativeTime}` : ""}
      </span>
      <span className="global-card-time">
        <i
          className={activelyWorking
            ? "global-card-dot global-card-dot--working"
            : "global-card-dot"}
          aria-hidden="true"
        />
        {formatDuration(duration)} session
      </span>
    </button>
  );
}

export function GlobalActivityBoard({
  sessions,
  onSelect,
  clock,
  wallClock,
  collectedAt,
  isLive,
  isConnected,
  changes,
}) {
  const lanes = useMemo(
    () => getActivityBoardLanes(sessions),
    [sessions],
  );
  const boardRef = useRef(null);
  const previousCardRects = useRef(new Map());
  const previousCardPositions = useRef(new Map());

  const captureCardRects = useCallback(() => {
    const cards = [
      ...(boardRef.current?.querySelectorAll("[data-board-session-id]") ?? []),
    ];
    previousCardRects.current = new Map(cards.map((card) => [
      card.dataset.boardSessionId,
      card.getBoundingClientRect(),
    ]));
  }, []);

  useEffect(() => {
    const scrollOptions = { capture: true, passive: true };
    window.addEventListener("resize", captureCardRects);
    document.addEventListener("scroll", captureCardRects, scrollOptions);
    return () => {
      window.removeEventListener("resize", captureCardRects);
      document.removeEventListener("scroll", captureCardRects, true);
    };
  }, [captureCardRects]);

  useLayoutEffect(() => {
    const cards = [
      ...(boardRef.current?.querySelectorAll("[data-board-session-id]") ?? []),
    ];
    const nextRects = new Map(cards.map((card) => [
      card.dataset.boardSessionId,
      card.getBoundingClientRect(),
    ]));
    const nextPositions = new Map(lanes.flatMap((lane) => (
      lane.sessions.map((session, index) => [
        session.id,
        `${lane.id}:${index}`,
      ])
    )));
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const cleanups = [];

    if (!reduceMotion) {
      cards.forEach((card) => {
        const sessionId = card.dataset.boardSessionId;
        if (
          previousCardPositions.current.get(sessionId)
          === nextPositions.get(sessionId)
        ) return;

        const previous = previousCardRects.current.get(sessionId);
        const next = nextRects.get(sessionId);
        const x = previous && next ? previous.left - next.left : 0;
        const y = previous && next ? previous.top - next.top : 0;
        if (!x && !y) return;

        const ghost = document.createElement("div");
        ghost.className = `${card.className} global-session-card--motion`;
        ghost.setAttribute("aria-hidden", "true");
        ghost.innerHTML = card.innerHTML;
        Object.assign(ghost.style, {
          left: `${previous.left}px`,
          top: `${previous.top}px`,
          width: `${previous.width}px`,
          height: `${previous.height}px`,
        });
        document.body.append(ghost);
        gsap.set(card, { opacity: 0 });

        let cleaned = false;
        const cleanup = () => {
          if (cleaned) return;
          cleaned = true;
          gsap.set(card, { clearProps: "opacity" });
          ghost.remove();
        };
        const tween = gsap.to(ghost, {
          left: next.left,
          top: next.top,
          width: next.width,
          height: next.height,
          duration: 0.38,
          ease: "power2.out",
          onComplete: cleanup,
        });
        cleanups.push(() => {
          tween.kill();
          cleanup();
        });
      });
    }

    previousCardRects.current = nextRects;
    previousCardPositions.current = nextPositions;
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [collectedAt, lanes]);

  const snapshotAge = getRelativeTime(collectedAt, new Date(wallClock));
  const connectedWorking = isLive && isConnected && Boolean(collectedAt);

  return (
    <section
      ref={boardRef}
      className="global-board"
      aria-labelledby="global-activity-title"
    >
      <header className="global-board-heading">
        <h2 id="global-activity-title" tabIndex={-1}>Global activity</h2>
        <div className="global-board-meta">
          <span className={isLive ? "global-board-mode--live" : undefined}>
            {isLive ? "Live" : "Paused"}
          </span>
          <time>Last applied {snapshotAge || "unavailable"}</time>
        </div>
      </header>

      {sessions.length ? (
        <div className="global-lanes">
          {lanes.map((lane) => (
            <section
              className={`activity-lane activity-lane--${lane.id}`}
              key={lane.id}
              aria-labelledby={`activity-lane-${lane.id}`}
            >
              <header className="activity-lane-heading">
                <h3 id={`activity-lane-${lane.id}`}>{lane.label}</h3>
                <span>{lane.sessions.length}</span>
              </header>
              <div className="activity-lane-cards">
                {lane.sessions.map((session) => (
                  <GlobalSessionCard
                    key={session.id}
                    session={session}
                    onSelect={onSelect}
                    clock={clock}
                    wallClock={wallClock}
                    collectedAt={collectedAt}
                    connectedWorking={connectedWorking}
                    changes={changes[session.id] ?? EMPTY_CHANGES}
                  />
                ))}
                {!lane.sessions.length && (
                  <p className="activity-lane-empty">No sessions</p>
                )}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="global-board-empty">
          There are no sessions in the current server snapshot.
        </p>
      )}
    </section>
  );
}

function TaskList({ plan, collectedAt, changedTasks = [] }) {
  if (!plan?.tasks?.length) {
    return <p className="empty-copy">This session has no Plan Task list.</p>;
  }

  return (
    <ol className="task-list">
      {plan.tasks.map((task) => {
        const meta = taskStatusMeta[task.status] ?? taskStatusMeta.queued;
        const Icon = meta.icon;
        const changed = changedTasks.includes(task.title);

        return (
          <li
            key={changed ? `${task.title}-${collectedAt}` : task.title}
            className={`task-item task-item--${task.status} ${changed ? "task-item--updated" : ""}`}
          >
            <span className="task-icon">
              <Icon size={13} weight={task.status === "done" ? "bold" : "fill"} />
            </span>
            <span>
              <strong>{task.title}</strong>
              <small>{meta.label}</small>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ChildAgentDialog({ child, onClose, collectedAt, clock }) {
  const dialogRef = useRef(null);
  const progress = getPlanProgress(child.plan);
  const duration = getDisplayedDuration(child, collectedAt, clock);

  useEffect(() => {
    if (!dialogRef.current?.open) dialogRef.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      id="child-agent-dialog"
      className="child-agent-dialog"
      aria-labelledby="child-agent-dialog-title"
      onClose={onClose}
      onClick={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left
          || event.clientX > bounds.right
          || event.clientY < bounds.top
          || event.clientY > bounds.bottom
        ) {
          event.currentTarget.close();
        }
      }}
    >
      <header className="child-dialog-heading">
        <div className="detail-agent">
          <AgentMark item={child} size={36} active={normalizeStatus(child.status) === "running"} />
          <div>
            <p>{child.model ?? "Model unavailable"}</p>
            <h3 id="child-agent-dialog-title">
              {child.agentNickname ?? child.threadId.slice(0, 8)}
            </h3>
          </div>
        </div>
        <div className="child-dialog-meta">
          <StatusBadge status={child.status} statusBasis={child.statusBasis} />
          <span>{formatDuration(duration)} session</span>
          <button
            type="button"
            aria-label="Close child agent details"
            onClick={() => dialogRef.current?.close()}
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="child-dialog-grid">
        <article className="detail-card child-dialog-current">
          <header className="card-header">
            <span><Pulse size={16} /> Current work</span>
            <code>{child.currentWork?.turnId ?? "No active turn"}</code>
          </header>
          {child.currentWork ? (
            <h3>{child.currentWork.title || "No current work"}</h3>
          ) : (
            <p className="empty-copy">No active Turn was observed.</p>
          )}
          <div className="work-state">
            <StatusBadge status={child.status} statusBasis={child.statusBasis} />
            <small>{child.currentActivity?.label ?? "No active tool"}</small>
          </div>
        </article>

        <article className="detail-card activity-card">
          <header className="card-header">
            <span><Pulse size={16} /> Recent activity</span>
            <b>Local</b>
          </header>
          {child.activity?.length ? (
            <ol className="activity-list">
              {child.activity.map((activity) => (
                <li key={activity.id} data-kind={activity.kind}>
                  <time>{formatLocalTime(activity.at)}</time>
                  <TerminalWindow className="activity-event-icon" size={14} />
                  <span>{activity.label}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-copy">No recent tool activity was observed.</p>
          )}
        </article>

        <article className={`detail-card goal-card ${child.goal ? "" : "goal-card--empty"}`}>
          <header className="card-header">
            <span><Target size={16} /> Goal</span>
            <b>{child.goal ? formatGoalStatus(child.goal.status) : "Not used"}</b>
          </header>
          {child.goal ? (
            <>
              <h3>{child.goal.objective}</h3>
              <p>
                Tokens {formatTokenCount(child.goal.tokensUsed)}
                {" / "}
                {formatTokenCount(child.goal.tokenBudget)}
              </p>
              <small>Time used · {formatDuration(child.goal.timeUsedSeconds)}</small>
            </>
          ) : (
            <p className="empty-copy">This agent is not operating under a Goal.</p>
          )}
        </article>

        <article className="detail-card task-card">
          <header className="card-header">
            <span><CheckCircle size={16} /> Tasks</span>
            <b>{progress.total ? `${progress.completed}/${progress.total}` : "Not used"}</b>
          </header>
          <TaskList plan={child.plan} collectedAt={collectedAt} />
        </article>

        <article className="detail-card">
          <header className="card-header">
            <span><BracketsCurly size={16} /> Applied skills</span>
            <b>{child.skills?.length ?? 0}</b>
          </header>
          {child.skills?.length ? (
            <ul className="skill-chips">
              {child.skills.map((skill) => <li key={skill}>{skill}</li>)}
            </ul>
          ) : (
            <p className="empty-copy">No skills were observed for this Turn.</p>
          )}
        </article>
      </div>
    </dialog>
  );
}

export function ChildAgents({
  children,
  selectedChildId,
  onSelect,
  clock,
  changes,
  collectedAt,
}) {
  if (!children.length) {
    return <p className="empty-copy">No subagents were created for this session.</p>;
  }

  const selectedChild = children.find((child) => child.id === selectedChildId);

  return (
    <>
      <div className="child-table" role="table" aria-label="Child agents">
        <div className="child-header" role="row">
          <span role="columnheader">Agent</span>
          <span role="columnheader">State</span>
          <span role="columnheader">Session time</span>
          <span role="columnheader">Tasks</span>
          <span role="columnheader">Goal</span>
        </div>
        {children.map((child) => {
          const isSelected = selectedChildId === child.id;
          const childStatus = normalizeStatus(child.status);
          const progress = getPlanProgress(child.plan);
          const duration = getDisplayedDuration(child, collectedAt, clock);
          const changed = changes.childIds.includes(child.id);
          const handoff = changes.handoffChildIds.includes(child.id) && childStatus === "complete";

          return (
            <div
              className={`child-row ${isSelected ? "child-row--selected" : ""} ${handoff ? "child-row--handoff" : ""}`}
              role="row"
              key={changed ? `${child.id}-${collectedAt}` : child.id}
            >
              <span role="cell" className="child-agent">
                <AgentMark
                  item={child}
                  size={26}
                  active={childStatus === "running"}
                  handoff={handoff}
                />
                <span>
                  <strong>{child.agentNickname ?? child.threadId.slice(0, 8)}</strong>
                  <small>{child.model ?? "Model unavailable"}</small>
                </span>
              </span>
              <span role="cell">
                <StatusBadge status={child.status} statusBasis={child.statusBasis} />
              </span>
              <span role="cell">{formatDuration(duration)}</span>
              <span role="cell">
                {progress.total ? `${progress.completed}/${progress.total}` : "—"}
              </span>
              <span role="cell">{formatGoalStatus(child.goal?.status)}</span>
              <button
                type="button"
                className="child-row-action"
                aria-label={`Open details for ${child.agentNickname ?? child.threadId.slice(0, 8)}`}
                aria-haspopup="dialog"
                aria-controls="child-agent-dialog"
                onClick={() => onSelect(child.id)}
              />
            </div>
          );
        })}
      </div>
      {selectedChild && (
        <ChildAgentDialog
          child={selectedChild}
          onClose={() => onSelect(null)}
          collectedAt={collectedAt}
          clock={clock}
        />
      )}
    </>
  );
}

const liveStepIcons = {
  "Reading files": FolderOpen,
  "Calling tool": TerminalWindow,
  Editing: Code,
  Testing: ShieldCheck,
  Waiting: HourglassMedium,
};

function LiveStep({ session, clock, collectedAt }) {
  const activity = session.currentActivity;
  const toolStartedAt = Date.parse(activity?.startedAt);
  const toolElapsed = Number.isNaN(toolStartedAt)
    ? null
    : Math.max(0, Math.floor((clock - toolStartedAt) / 1000));

  return (
    <div className="live-step">
      <ol aria-label={`Current execution step: ${activity?.step ?? "Unavailable"}`}>
        {liveSteps.map((step) => {
          const Icon = liveStepIcons[step];
          const active = activity?.step === step;

          return (
            <li key={step} className={active ? "live-step--active" : ""} aria-current={active ? "step" : undefined}>
              <Icon size={13} weight={active ? "bold" : "regular"} />
              <span>{step}</span>
            </li>
          );
        })}
      </ol>
      {activity && (
        <div className="live-tool" key={`${collectedAt}-${activity.label}`}>
          <TerminalWindow size={13} />
          <code>{activity.label}</code>
          <time>{toolElapsed == null ? "—" : `${toolElapsed}s`}</time>
        </div>
      )}
    </div>
  );
}

export function SessionDetail({
  session,
  selectedChildId,
  onSelectChild,
  onClose,
  onOpenCodex,
  clock,
  wallClock = clock,
  changes,
  collectedAt,
}) {
  const progress = getPlanProgress(session.plan);
  const relativeTime = getRelativeTime(
    session.lastActivityAt,
    new Date(wallClock),
  );
  const duration = getDisplayedDuration(session, collectedAt, clock);
  const changedTokenKeys = changes.tokenKeys;

  return (
    <section className="session-detail" id="session-detail" aria-live="polite">
      <header className="detail-heading">
        <div className="detail-agent">
          <AgentMark item={session} size={42} />
          <div>
            <p>{session.gitBranch}</p>
            <h2 id="session-detail-title" tabIndex={-1}>{session.session}</h2>
          </div>
        </div>
        <div className="detail-meta">
          <StatusBadge status={session.status} statusBasis={session.statusBasis} />
          <span>{formatDuration(duration)} session</span>
          <span>Last update {relativeTime || "unavailable"}</span>
          <button
            type="button"
            className="detail-close"
            aria-label="Close session details"
            onClick={onClose}
          >
            <X size={14} />
          </button>
          <button type="button" onClick={onOpenCodex}>
            <ArrowSquareOut size={14} />
            Open in Codex
          </button>
        </div>
      </header>

      <div className="detail-grid">
        <div className="detail-column detail-column--work">
          <article className="detail-card current-work-card">
            <header className="card-header">
              <span><Pulse size={16} /> Current work</span>
              <code>{session.currentWork?.turnId ?? "No active turn"}</code>
            </header>
            {session.currentWork ? (
              <h3>{session.currentWork.title || "No current work"}</h3>
            ) : (
              <p className="empty-copy">No active Turn was observed.</p>
            )}
            <LiveStep session={session} clock={clock} collectedAt={collectedAt} />
            <div className="work-state">
              <StatusBadge status={session.status} statusBasis={session.statusBasis} />
              <small>{session.currentActivity?.label ?? "No active tool"}</small>
            </div>
          </article>

          <article className="detail-card activity-card">
            <header className="card-header">
              <span><ClockCounterClockwise size={16} /> Recent activity</span>
              <b>Local</b>
            </header>
            {session.activity?.length ? (
              <ol className="activity-list">
                {session.activity.map((activity) => (
                  <li
                    key={activity.id}
                    data-kind={activity.kind}
                    className={changes.activityIds.includes(activity.id) ? "activity-item--updated" : ""}
                  >
                    <time>{formatLocalTime(activity.at)}</time>
                    <TerminalWindow className="activity-event-icon" size={14} />
                    <span>{activity.label}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty-copy">No recent tool activity was observed.</p>
            )}
          </article>
        </div>

        <div className="detail-column detail-column--context">
          <article className={`detail-card goal-card ${session.goal ? "" : "goal-card--empty"}`}>
            <header className="card-header">
              <span><Target size={16} /> Goal</span>
              <b>{session.goal ? formatGoalStatus(session.goal.status) : "Not used"}</b>
            </header>
            {session.goal ? (
              <>
                <h3>{session.goal.objective}</h3>
                <p>
                  Tokens {formatTokenCount(session.goal.tokensUsed)}
                  {" / "}
                  {formatTokenCount(session.goal.tokenBudget)}
                </p>
                <small>Time used · {formatDuration(session.goal.timeUsedSeconds)}</small>
              </>
            ) : (
              <p className="empty-copy">This session is not operating under a Goal.</p>
            )}
          </article>

          <article className="detail-card child-card">
            <header className="card-header">
              <span><UsersThree size={16} /> Child agents</span>
              <b>{session.children?.length ?? 0}</b>
            </header>
            <ChildAgents
              children={session.children ?? []}
              selectedChildId={selectedChildId}
              onSelect={onSelectChild}
              clock={clock}
              changes={changes}
              collectedAt={collectedAt}
            />
          </article>
        </div>

        <div className="detail-column detail-column--planning">
          <article className="detail-card task-card">
            <header className="card-header">
              <span><ClipboardText size={16} /> Plan Tasks</span>
              <b>{progress.total ? `${progress.completed}/${progress.total}` : "Not used"}</b>
            </header>
            <TaskList
              plan={session.plan}
              collectedAt={collectedAt}
              changedTasks={changes.taskTitles}
            />
          </article>

          <article className="detail-card skills-card">
            <header className="card-header">
              <span><GearSix size={16} /> Applied skills</span>
              <b>{session.skills?.length ?? 0}</b>
            </header>
            {session.skills?.length ? (
              <ul className="skill-chips">
                {session.skills.map((skill) => <li key={skill}>{skill}</li>)}
              </ul>
            ) : (
              <p className="empty-copy empty-copy--compact">No skills were observed for this Turn.</p>
            )}
          </article>

          <article className="detail-card token-card">
            <header className="card-header">
              <span><Coins size={16} /> Token usage</span>
            </header>
            <dl className="token-list">
              {["total", "root", "children"].map((key) => (
                <div key={key}>
                  <dt>{key === "total" ? "Total" : key === "root" ? "Root agent" : "Child agents"}</dt>
                  <dd
                    key={changedTokenKeys.includes(key) ? `${key}-${collectedAt}` : key}
                    className={changedTokenKeys.includes(key) ? "value-updated" : ""}
                  >
                    {formatTokenCount(session.tokens?.[key])}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        </div>
      </div>
    </section>
  );
}

export function animateUsageValue({
  from,
  to,
  reduceMotion = false,
  onUpdate,
}) {
  const canAnimate = (
    Number.isFinite(from)
    && from >= 0
    && Number.isFinite(to)
    && to >= 0
    && !reduceMotion
  );

  if (!canAnimate) {
    onUpdate(to);
    return null;
  }

  const frame = { value: from };
  return gsap.to(frame, {
    value: to,
    duration: 1.5,
    ease: "power2.out",
    onUpdate: () => onUpdate(frame.value),
    onComplete: () => onUpdate(to),
  });
}

function AnimatedUsageValue({ value, format }) {
  const [displayedValue, setDisplayedValue] = useState(value);
  const displayedValueRef = useRef(value);
  const targetRef = useRef(value);
  const [highlightKey, setHighlightKey] = useState(0);

  useEffect(() => {
    if (Object.is(targetRef.current, value)) return undefined;

    targetRef.current = value;
    setHighlightKey((key) => key + 1);

    const tween = animateUsageValue({
      from: displayedValueRef.current,
      to: value,
      reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      onUpdate: (nextValue) => {
        displayedValueRef.current = nextValue;
        setDisplayedValue(nextValue);
      },
    });

    return tween ? () => tween.kill() : undefined;
  }, [value]);

  return (
    <span
      key={highlightKey}
      className={highlightKey
        ? "system-summary-value system-summary-value--updated"
        : "system-summary-value"}
      aria-label={format(value)}
    >
      {format(displayedValue)}
    </span>
  );
}

export function SystemSummary({
  runningCount,
  waitingCount,
  sessionCount,
  usage,
  wallClock,
  isLive,
}) {
  return (
    <div className="system-summary">
      <span className="summary-item summary-item--running">
        <i className={`live-dot ${isLive ? "" : "live-dot--paused"}`} />
        {runningCount} running
      </span>
      <span className="summary-item summary-item--waiting">
        <Clock size={14} />
        {waitingCount} waiting
      </span>
      <span className="summary-item summary-item--sessions">
        <UsersThree size={14} />
        {sessionCount} sessions
      </span>
      <span className="summary-group summary-group--daily">
        | <span className="summary-stat summary-stat--tokens">
          Tokens{" "}
          <AnimatedUsageValue
            value={usage?.todayTokens}
            format={formatTokenCount}
          />
        </span>
        {" · "}
        <span className="summary-stat summary-stat--cost">
          Cost{" "}
          <AnimatedUsageValue
            value={usage?.todayCostUsd}
            format={formatCostUsd}
          />
        </span>
      </span>
      <span className="summary-group summary-group--limits">
        | <span className="summary-stat summary-stat--five-hour">
          5H {formatPercent(usage?.fiveHourUsedPercent)}
        </span>
        {" · "}
        <span className="summary-stat summary-stat--one-week">
          1W {formatPercent(usage?.oneWeekUsedPercent)}
        </span>
      </span>
      <time className="summary-clock">| {formatLocalClock(wallClock)}</time>
    </div>
  );
}

export function App() {
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [feedStatus, setFeedStatus] = useState({
    connectionStatus: "syncing",
    lastSuccessfulAt: null,
  });
  const [changes, setChanges] = useState({});
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [selectionNotice, setSelectionNotice] = useState("");
  const [sortState, setSortState] = useState({ key: "operational", direction: "asc" });
  const [isLive, setIsLive] = useState(true);
  const [clock, setClock] = useState(Date.now());
  const [wallClock, setWallClock] = useState(Date.now());
  const latestSnapshot = useRef(EMPTY_SNAPSHOT);
  const appliedSnapshot = useRef(EMPTY_SNAPSHOT);
  const isLiveRef = useRef(true);
  const ledgerRef = useRef(null);
  const previousRects = useRef(new Map());
  const selectedSessionIdRef = useRef(null);
  const selectionOrigin = useRef(null);
  const pendingFocus = useRef(null);

  const commitSessionSelection = useCallback((id) => {
    selectedSessionIdRef.current = id;
    setSelectedSessionId(id);
    setSelectedChildId(null);
  }, []);

  const applySnapshot = useCallback((next) => {
    setChanges(getSnapshotChanges(appliedSnapshot.current, next));
    appliedSnapshot.current = next;

    const selectedId = selectedSessionIdRef.current;
    const selectedStillExists = !selectedId || getVisibleSessions(next.sessions)
      .some((session) => session.id === selectedId);

    if (!selectedStillExists) {
      const active = document.activeElement;
      const activeListRow = active?.closest?.("[data-session-id]");
      const focusWillDisappear = (
        document.querySelector("#session-detail")?.contains(active)
        || activeListRow?.dataset.sessionId === selectedId
      );
      if (focusWillDisappear) {
        pendingFocus.current = { kind: "board-title" };
      }
    }

    setSnapshot(next);
    setClock(Date.now());
  }, []);

  const visibleSessions = useMemo(
    () => sortSessions(getVisibleSessions(snapshot.sessions), sortState),
    [snapshot.sessions, sortState],
  );
  const selectedSession = snapshot.sessions.find(
    (session) => session.id === selectedSessionId,
  );

  const runningCount = useMemo(
    () => visibleSessions.filter((session) => normalizeStatus(session.status) === "running").length,
    [visibleSessions],
  );
  const waitingCount = useMemo(
    () => visibleSessions.filter((session) => (
      ["waiting", "needs_input", "blocked"].includes(normalizeStatus(session.status))
    )).length,
    [visibleSessions],
  );

  useEffect(() => {
    let cancelled = false;
    let timer;

    const poll = async () => {
      try {
        const response = await fetch("/api/snapshot", { cache: "no-store" });
        if (!response.ok) throw new Error("Snapshot request failed");
        const next = await response.json();
        if (cancelled) return;
        setFeedStatus({
          connectionStatus: next.connectionStatus,
          lastSuccessfulAt: next.lastSuccessfulAt,
        });
        if (next.connectionStatus !== "error") {
          latestSnapshot.current = next;
          if (isLiveRef.current) applySnapshot(next);
        }
      } catch {
        if (!cancelled) {
          setFeedStatus((current) => ({ ...current, connectionStatus: "error" }));
        }
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, 3000);
      }
    };

    poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [applySnapshot]);

  useEffect(() => {
    if (!isLive || feedStatus.connectionStatus !== "connected") return undefined;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [feedStatus.connectionStatus, isLive]);

  useEffect(() => {
    const timer = window.setInterval(() => setWallClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (
      !selectedSessionId
      || visibleSessions.some((session) => session.id === selectedSessionId)
    ) return;

    setSelectionNotice(
      "The selected session is no longer in the current server snapshot.",
    );
    commitSessionSelection(null);
  }, [commitSessionSelection, selectedSessionId, visibleSessions]);

  useEffect(() => {
    const list = ledgerRef.current?.querySelector(".session-list");
    const row = list?.querySelector("[data-session-id]");
    if (!list || !row) return;

    list.scrollTop = getRowScrollTop({
      rowIndex: visibleSessions.findIndex((session) => session.id === selectedSessionId),
      rowHeight: row.offsetHeight,
      viewportHeight: list.clientHeight,
      scrollTop: list.scrollTop,
    });
  }, [selectedSessionId, visibleSessions]);

  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;

    let element = null;
    if (target.kind === "detail") {
      element = document.getElementById("session-detail-title");
    } else if (target.kind === "board-title") {
      element = document.getElementById("global-activity-title");
    } else {
      const selector = target.kind === "board"
        ? "[data-board-session-id]"
        : "[data-session-id]";
      const dataKey = target.kind === "board"
        ? "boardSessionId"
        : "sessionId";
      element = [...document.querySelectorAll(selector)]
        .find((candidate) => candidate.dataset[dataKey] === target.sessionId);
      element ??= document.getElementById("global-activity-title");
    }

    if (element) {
      pendingFocus.current = null;
      element.focus();
    }
  }, [selectedSession, visibleSessions]);

  useLayoutEffect(() => {
    const rows = [...(ledgerRef.current?.querySelectorAll("[data-session-id]") ?? [])];
    const nextRects = new Map(rows.map((row) => [row.dataset.sessionId, row.getBoundingClientRect()]));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!reduceMotion) {
      rows.forEach((row) => {
        const previous = previousRects.current.get(row.dataset.sessionId);
        const next = nextRects.get(row.dataset.sessionId);
        const offset = previous && next ? previous.top - next.top : 0;
        if (offset) {
          gsap.fromTo(row, { y: offset }, {
            y: 0,
            duration: 0.38,
            ease: "power2.out",
            clearProps: "transform",
          });
        }
      });

      const changedSessionId = visibleSessions.find((session) => (
        Object.values(changes[session.id] ?? {}).some((items) => items.length)
      ))?.id;
      const changedRow = changedSessionId
        ? ledgerRef.current?.querySelector(`[data-session-id="${changedSessionId}"]`)
        : null;
      if (changedRow) {
        gsap.fromTo(
          changedRow,
          { backgroundColor: "rgba(94, 214, 198, 0.16)" },
          {
            backgroundColor: "transparent",
            duration: 1.1,
            ease: "power2.out",
            clearProps: "backgroundColor",
          },
        );
      }
    }

    previousRects.current = nextRects;
  }, [changes, snapshot.collectedAt, visibleSessions]);

  const selectSession = (id, source = "list") => {
    if (source === "list" && id === selectedSessionId) {
      commitSessionSelection(null);
      return;
    }

    selectionOrigin.current = { kind: source, sessionId: id };
    if (source === "board") pendingFocus.current = { kind: "detail" };
    commitSessionSelection(id);
  };

  const closeSession = () => {
    pendingFocus.current = selectionOrigin.current ?? { kind: "board-title" };
    commitSessionSelection(null);
  };

  const toggleLive = () => {
    const next = !isLiveRef.current;
    isLiveRef.current = next;
    setIsLive(next);
    if (next && feedStatus.connectionStatus === "connected") {
      applySnapshot(latestSnapshot.current);
    }
  };

  const updateSort = (column) => {
    setSortState((current) => (
      current.key === column.key
        ? { key: column.key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key: column.key, direction: column.direction }
    ));
  };

  const sortLabel = sortState.key === "operational"
    ? "Operational order"
    : `${sortColumns.find((column) => column.key === sortState.key)?.label} · ${sortState.direction}`;
  const connectionStatus = ["connected", "syncing", "error"].includes(
    feedStatus.connectionStatus,
  )
    ? feedStatus.connectionStatus
    : "error";
  const feedAge = getRelativeTime(feedStatus.lastSuccessfulAt, new Date());
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><Planet size={20} /></span>
          <div>
            <strong>Orbital Dispatch</strong>
            <small>My Codex Agent Monitor</small>
          </div>
        </div>

        <SystemSummary
          runningCount={runningCount}
          waitingCount={waitingCount}
          sessionCount={visibleSessions.length}
          usage={snapshot.usage}
          wallClock={wallClock}
          isLive={isLive}
        />
      </header>

      <div className="page-content">
        <section className="ledger-section" aria-labelledby="sessions-title">
          <header className="section-heading">
            <div>
              <h1 id="sessions-title">Agent Sessions</h1>
              <span>{visibleSessions.length} visible</span>
            </div>
            <div className="feed-state">
              <button
                type="button"
                className={`live-toggle ${isLive ? "live-toggle--active" : ""}`}
                onClick={toggleLive}
                aria-pressed={isLive}
              >
                {isLive ? <Pulse size={12} /> : <PauseCircle size={12} />}
                {isLive ? "Live" : "Paused"}
              </button>
              <label className="sort-control">
                <ArrowsDownUp size={12} />
                <span className="visually-hidden">Sort sessions</span>
                <select
                  value={sortState.key}
                  onChange={(event) => {
                    const key = event.target.value;
                    if (key === "operational") {
                      setSortState({ key: "operational", direction: "asc" });
                    } else {
                      updateSort(sortColumns.find((column) => column.key === key));
                    }
                  }}
                >
                  <option value="operational">Operational order</option>
                  {sortColumns.map((column) => (
                    <option value={column.key} key={column.key}>{column.label}</option>
                  ))}
                </select>
              </label>
              {sortState.key !== "operational" && (
                <button
                  type="button"
                  className="sort-direction"
                  onClick={() => updateSort(
                    sortColumns.find((column) => column.key === sortState.key),
                  )}
                  aria-label={`Reverse ${sortLabel}`}
                  title={sortLabel}
                >
                  {sortState.direction === "asc"
                    ? <CaretUp size={12} />
                    : <CaretDown size={12} />}
                </button>
              )}
            </div>
          </header>

          <div className="ledger-scroll">
            <div
              className="session-ledger"
              aria-label="Agent session overview"
              ref={ledgerRef}
            >
              <div className="ledger-header">
                {sortColumns.map((column) => {
                  const active = sortState.key === column.key;
                  return (
                    <span
                      key={column.key}
                    >
                      <button type="button" onClick={() => updateSort(column)}>
                        {column.label}
                        {active
                          ? sortState.direction === "asc"
                            ? <CaretUp size={10} />
                            : <CaretDown size={10} />
                          : <ArrowsDownUp size={9} />}
                      </button>
                    </span>
                  );
                })}
              </div>
              <div className="session-list">
                {visibleSessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    selected={session.id === selectedSessionId}
                    onSelect={selectSession}
                    clock={clock}
                    wallClock={wallClock}
                    changes={changes[session.id] ?? EMPTY_CHANGES}
                    collectedAt={snapshot.collectedAt}
                  />
                ))}
                {!visibleSessions.length && (
                  <p className="ledger-empty">There are no sessions in the current server snapshot.</p>
                )}
              </div>
            </div>
          </div>
        </section>

        {selectedSession ? (
          <SessionDetail
            session={selectedSession}
            selectedChildId={selectedChildId}
            onSelectChild={setSelectedChildId}
            onClose={closeSession}
            onOpenCodex={() => {
              window.location.href = "codex://threads/" + selectedSession.threadId;
            }}
            clock={clock}
            wallClock={wallClock}
            changes={changes[selectedSession.id] ?? EMPTY_CHANGES}
            collectedAt={snapshot.collectedAt}
          />
        ) : (
          <GlobalActivityBoard
            sessions={visibleSessions}
            onSelect={selectSession}
            clock={clock}
            wallClock={wallClock}
            collectedAt={snapshot.collectedAt}
            isLive={isLive}
            isConnected={connectionStatus === "connected"}
            changes={changes}
          />
        )}
      </div>

      <footer className="page-footer">
        <ConnectionState status={connectionStatus}>
          {feedAge || "waiting for first snapshot"}
        </ConnectionState>
        <span>Session event time shown in local time</span>
      </footer>

      {selectionNotice && (
        <button
          type="button"
          className="app-toast app-toast--notice"
          onClick={() => setSelectionNotice("")}
          aria-live="polite"
        >
          <span>{selectionNotice}</span>
          <small>Dismiss</small>
        </button>
      )}
    </main>
  );
}
