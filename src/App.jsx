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
  Clock,
  Code,
  GitBranch,
  HourglassMedium,
  Path,
  PauseCircle,
  Play,
  Pulse,
  Robot,
  ShieldCheck,
  Sparkle,
  Target,
  TerminalWindow,
  UserFocus,
  WarningCircle,
} from "@phosphor-icons/react";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";

import {
  formatDuration,
  formatGoalStatus,
  formatTokenCount,
  formatUtcTime,
  getPlanProgress,
  getRelativeTime,
  getRowScrollTop,
  getSessionMetrics,
  getSnapshotChanges,
  getVisibleSessions,
  normalizeStatus,
  SESSION_LEDGER_VISIBLE_ROWS,
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
};

function AgentMark({ item, size = 34, active = false, handoff = false }) {
  const child = item.parentSessionId != null;
  const Icon = child ? Robot : Path;

  return (
    <span
      className={`agent-mark ${active ? "agent-mark--active" : ""} ${handoff ? "agent-mark--handoff" : ""}`}
      style={{
        "--agent-color": child ? "#8fa9ff" : "#5ed6c6",
        width: size,
        height: size,
      }}
      aria-hidden="true"
    >
      <Icon size={size * 0.52} weight="regular" />
    </span>
  );
}

function StatusBadge({ status }) {
  const normalizedStatus = normalizeStatus(status);
  const meta = statusMeta[normalizedStatus];
  const Icon = meta.icon;

  return (
    <span className={`status-badge status-badge--${normalizedStatus}`}>
      <Icon size={13} weight={normalizedStatus === "complete" ? "fill" : "bold"} />
      {meta.label}
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

function SessionRow({ session, selected, onSelect, clock, changes, collectedAt }) {
  const metrics = getSessionMetrics(session);
  const status = normalizeStatus(session.status);
  const relativeTime = getRelativeTime(session.lastActivityAt, new Date(clock));
  const attention = ["needs_input", "blocked", "failed"].includes(status);

  return (
    <button
      type="button"
      role="row"
      className={`session-row session-row--${status} ${selected ? "session-row--selected" : ""} ${attention ? "session-row--attention" : ""}`}
      onClick={() => onSelect(session.id)}
      aria-selected={selected}
      aria-controls="session-detail"
      data-session-id={session.id}
    >
      <span role="cell" className="session-agent">
        <AgentMark item={session} />
        <span>
          <strong>Codex</strong>
          <small>Root agent</small>
        </span>
      </span>
      <span role="cell" className="session-assignment">
        <strong>{session.session}</strong>
        <small>{session.assignedWork || "No assigned work"}</small>
      </span>
      <span role="cell" className="session-state">
        <StatusBadge status={session.status} />
        <small>
          {session.currentActivity?.label ?? "No active tool"}
          {relativeTime ? ` · ${relativeTime}` : ""}
        </small>
      </span>
      <span role="cell" className="session-time">
        <strong>{formatDuration(session.durationSeconds)}</strong>
        <small>Started {formatUtcTime(session.startedAt)}</small>
      </span>
      <span role="cell">
        <MetaValue label="Skills">{metrics.skills || "—"}</MetaValue>
      </span>
      <span role="cell">
        <MetaValue label="Tasks">
          {metrics.tasks ? `${metrics.tasks.completed}/${metrics.tasks.total}` : "—"}
        </MetaValue>
      </span>
      <span role="cell">
        <MetaValue label="Goal" accent={metrics.goalStatus === "active"}>
          {formatGoalStatus(session.goal?.status)}
        </MetaValue>
      </span>
      <span role="cell" className="session-subagents">
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
        {selected ? <CaretDown size={16} /> : <CaretRight size={16} />}
      </span>
    </button>
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

function ChildAgents({
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
          <span role="columnheader">Session</span>
          <span role="columnheader">Tokens</span>
          <span role="columnheader">Skills</span>
          <span role="columnheader">Tasks</span>
          <span role="columnheader">Goal</span>
          <span aria-hidden="true" />
        </div>
        {children.map((child) => {
          const isSelected = selectedChildId === child.id;
          const childStatus = normalizeStatus(child.status);
          const relativeTime = getRelativeTime(child.lastActivityAt, new Date(clock));
          const progress = getPlanProgress(child.plan);
          const changed = changes.childIds.includes(child.id);
          const handoff = changes.handoffChildIds.includes(child.id) && childStatus === "complete";

          return (
            <button
              type="button"
              className={`child-row ${isSelected ? "child-row--selected" : ""} ${handoff ? "child-row--handoff" : ""}`}
              role="row"
              key={changed ? `${child.id}-${collectedAt}` : child.id}
              onClick={() => onSelect(isSelected ? null : child.id)}
              aria-expanded={isSelected}
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
                  <small>
                    {child.agentRole ?? "Child agent"}
                    {relativeTime ? ` · ${relativeTime}` : ""}
                  </small>
                </span>
              </span>
              <span role="cell"><StatusBadge status={child.status} /></span>
              <span role="cell" className="child-session">
                <strong>{child.currentWork?.title || "No current work"}</strong>
                <small>{child.currentActivity?.step ?? child.currentActivity?.label ?? "—"}</small>
              </span>
              <span role="cell">{formatTokenCount(child.tokens)}</span>
              <span role="cell">{child.skills?.length || "—"}</span>
              <span role="cell">
                {progress.total ? `${progress.completed}/${progress.total}` : "—"}
              </span>
              <span role="cell">{formatGoalStatus(child.goal?.status)}</span>
              <span role="cell">
                {isSelected ? <CaretDown size={14} /> : <CaretRight size={14} />}
              </span>
            </button>
          );
        })}
      </div>
      {selectedChild && (
        <div className="child-inspector" aria-live="polite">
          <div>
            <small>Current work</small>
            <strong>{selectedChild.currentWork?.title || "No current work"}</strong>
          </div>
          <div>
            <small>Skills in use</small>
            <span>{selectedChild.skills?.join(" · ") || "No skills observed"}</span>
          </div>
        </div>
      )}
    </>
  );
}

const liveStepIcons = {
  "Reading files": BracketsCurly,
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

function SessionDetail({
  session,
  selectedChildId,
  onSelectChild,
  onOpenCodex,
  clock,
  changes,
  collectedAt,
}) {
  const progress = getPlanProgress(session.plan);
  const relativeTime = getRelativeTime(session.lastActivityAt, new Date(clock));
  const changedTokenKeys = changes.tokenKeys;

  return (
    <section className="session-detail" id="session-detail" aria-live="polite">
      <header className="detail-heading">
        <div className="detail-agent">
          <AgentMark item={session} size={42} />
          <div>
            <p>Selected session</p>
            <h2>Codex <span>/</span> {session.session}</h2>
          </div>
        </div>
        <div className="detail-meta">
          <StatusBadge status={session.status} />
          <span>{formatDuration(session.durationSeconds)} session</span>
          <span>Last update {relativeTime || "unavailable"}</span>
          <button type="button" onClick={onOpenCodex}>
            <ArrowSquareOut size={14} />
            Open in Codex
          </button>
        </div>
      </header>

      <div className="detail-grid">
        <div className="detail-column">
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
              <StatusBadge status={session.status} />
              <small>{session.currentActivity?.label ?? "No active tool"}</small>
            </div>
          </article>

          <article className="detail-card">
            <header className="card-header">
              <span><TerminalWindow size={16} /> Token usage</span>
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

          <article className="detail-card">
            <header className="card-header">
              <span><BracketsCurly size={16} /> Applied skills</span>
              <b>{session.skills?.length ?? 0}</b>
            </header>
            {session.skills?.length ? (
              <ul className="skill-chips">
                {session.skills.map((skill) => <li key={skill}>{skill}</li>)}
              </ul>
            ) : (
              <p className="empty-copy">No skills were observed for this Turn.</p>
            )}
          </article>
        </div>

        <div className="detail-column">
          <article className="detail-card task-card">
            <header className="card-header">
              <span><CheckCircle size={16} /> Tasks</span>
              <b>{progress.total ? `${progress.completed}/${progress.total}` : "Not used"}</b>
            </header>
            <TaskList
              plan={session.plan}
              collectedAt={collectedAt}
              changedTasks={changes.taskTitles}
            />
          </article>

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
        </div>

        <div className="detail-column detail-column--wide">
          <article className="detail-card child-card">
            <header className="card-header">
              <span><GitBranch size={16} /> Child agents</span>
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

          <article className="detail-card activity-card">
            <header className="card-header">
              <span><Pulse size={16} /> Recent activity</span>
              <b>UTC</b>
            </header>
            {session.activity?.length ? (
              <ol className="activity-list">
                {session.activity.map((activity) => (
                  <li
                    key={activity.id}
                    data-kind={activity.kind}
                    className={changes.activityIds.includes(activity.id) ? "activity-item--updated" : ""}
                  >
                    <time>{formatUtcTime(activity.at)}</time>
                    <span>{activity.label}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty-copy">No recent tool activity was observed.</p>
            )}
          </article>
        </div>
      </div>
    </section>
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
  const latestSnapshot = useRef(EMPTY_SNAPSHOT);
  const appliedSnapshot = useRef(EMPTY_SNAPSHOT);
  const isLiveRef = useRef(true);
  const ledgerRef = useRef(null);
  const previousRects = useRef(new Map());

  const applySnapshot = useCallback((next) => {
    setChanges(getSnapshotChanges(appliedSnapshot.current, next));
    appliedSnapshot.current = next;
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
        latestSnapshot.current = next;
        setFeedStatus({
          connectionStatus: next.connectionStatus,
          lastSuccessfulAt: next.lastSuccessfulAt,
        });
        if (isLiveRef.current) applySnapshot(next);
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
    if (!isLive) return undefined;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isLive]);

  useEffect(() => {
    if (visibleSessions.some((session) => session.id === selectedSessionId)) return;
    if (selectedSessionId) {
      setSelectionNotice("The selected session is no longer in the current server snapshot.");
    }
    setSelectedSessionId(visibleSessions[0]?.id ?? null);
    setSelectedChildId(null);
  }, [selectedSessionId, visibleSessions]);

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

  const selectSession = (id) => {
    setSelectedSessionId(id);
    setSelectedChildId(null);
  };

  const toggleLive = () => {
    const next = !isLiveRef.current;
    isLiveRef.current = next;
    setIsLive(next);
    if (next) applySnapshot(latestSnapshot.current);
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
  const connectionLabel = {
    connected: "Connected",
    syncing: "Syncing",
    error: "Error",
  }[connectionStatus];
  const feedAge = getRelativeTime(feedStatus.lastSuccessfulAt, new Date());
  const emptyChanges = {
    tokenKeys: [],
    taskTitles: [],
    childIds: [],
    handoffChildIds: [],
    activityIds: [],
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true"><Path size={20} /></span>
          <div>
            <strong>Orbital Dispatch</strong>
            <small>My Codex Agent Monitor</small>
          </div>
        </div>

        <div className="system-summary">
          <span><i className={`live-dot ${isLive ? "" : "live-dot--paused"}`} /> {runningCount} running</span>
          <span>{waitingCount} waiting</span>
          <span>{visibleSessions.length} sessions</span>
          <time>{formatUtcTime(new Date(clock).toISOString())} UTC</time>
        </div>
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
              <button
                type="button"
                className={`operational-sort ${sortState.key === "operational" ? "operational-sort--active" : ""}`}
                onClick={() => setSortState({ key: "operational", direction: "asc" })}
              >
                <ArrowsDownUp size={12} />
                {sortLabel}
              </button>
              <small className={`connection-state--${connectionStatus}`}>
                {connectionLabel} · {feedAge || "waiting for first snapshot"}
              </small>
            </div>
          </header>

          <div className="ledger-scroll">
            <div
              className="session-ledger"
              role="table"
              aria-label="Agent session overview"
              ref={ledgerRef}
            >
              <div className="ledger-header" role="row">
                {sortColumns.map((column) => {
                  const active = sortState.key === column.key;
                  return (
                    <span
                      role="columnheader"
                      key={column.key}
                      aria-sort={active
                        ? sortState.direction === "asc" ? "ascending" : "descending"
                        : "none"}
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
              <div
                className="session-list"
                role="rowgroup"
                style={{ "--visible-session-rows": SESSION_LEDGER_VISIBLE_ROWS }}
              >
                {visibleSessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    selected={session.id === selectedSessionId}
                    onSelect={selectSession}
                    clock={clock}
                    changes={changes[session.id] ?? emptyChanges}
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

        {selectedSession && (
          <SessionDetail
            session={selectedSession}
            selectedChildId={selectedChildId}
            onSelectChild={setSelectedChildId}
            onOpenCodex={() => {
              window.location.href = "codex://threads/" + selectedSession.threadId;
            }}
            clock={clock}
            changes={changes[selectedSession.id] ?? emptyChanges}
            collectedAt={snapshot.collectedAt}
          />
        )}
      </div>

      <footer className="page-footer">
        <span className={`connection-state--${connectionStatus}`}>
          {connectionLabel} · local Codex snapshot
        </span>
        <span>Session event time shown in UTC</span>
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
