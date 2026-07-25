import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  Compass,
  GitBranch,
  HourglassMedium,
  MagnifyingGlass,
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
  applySimulationEvent,
  getPlanProgress,
  getRelativeTime,
  getRowScrollTop,
  getSessionMetrics,
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
const demoStartedAt = Date.parse("2026-07-25T14:37:00Z");

const sessions = [
  {
    id: "dashboard-redesign",
    name: "Planner",
    role: "Root agent",
    icon: Path,
    color: "#5ed6c6",
    session: "dashboard-redesign",
    assignedWork: "Redesign agent session dashboard",
    status: "waiting",
    currentActivity: "Waiting for 2 child agents",
    currentStep: "Waiting",
    lastActivityAt: "2026-07-25T14:36:45Z",
    startedAt: "2026-07-25T14:13:02Z",
    duration: "24:15",
    started: "Started 14:13:02",
    currentWork: {
      id: "TURN-7E42",
      title: "Consolidate child-agent findings into the selected concept",
      note: "The root turn is paused until the implementation and QA branches report back.",
    },
    tokens: { total: "112,840", root: "46,210", children: "66,630" },
    skills: [
      "superpowers:brainstorming",
      "product-design:image-to-code",
      "frontend-design",
      "superpowers:using-superpowers",
    ],
    plan: {
      title: "Agent monitor concept",
      tasks: [
        { title: "Define list-level decision data", status: "done" },
        { title: "Model realistic session states", status: "done" },
        { title: "Select the visual direction", status: "done" },
        { title: "Build the responsive session ledger", status: "active" },
        { title: "Verify child-agent disclosure", status: "waiting" },
        { title: "Run visual QA", status: "queued" },
        { title: "Prepare concept handoff", status: "queued" },
      ],
    },
    goal: {
      status: "active",
      label: "Active",
      title: "Make every active Codex session understandable at a glance",
      detail:
        "Keep list-level decisions scannable while preserving the full execution context one level deeper.",
      checkpoint: "Last checkpoint · information architecture approved at 14:28",
    },
    children: [
      {
        id: "researcher",
        name: "Researcher",
        icon: MagnifyingGlass,
        color: "#7ad7c8",
        status: "complete",
        session: "09:42",
        tokens: "18.4k",
        skills: ["product-design:get-context", "graphify"],
        tasks: { completed: 3, total: 3 },
        goal: null,
        currentStep: "Returned result",
        lastActivityAt: "2026-07-25T14:31:09Z",
        work: "Audited the existing monitor and mapped the real Codex work shapes.",
      },
      {
        id: "builder",
        name: "Builder",
        icon: Code,
        color: "#e9a85c",
        status: "running",
        session: "14:06",
        tokens: "38.8k",
        skills: ["frontend-design", "image-to-code", "test-driven-development"],
        tasks: { completed: 2, total: 5 },
        goal: { label: "Active" },
        currentStep: "Editing",
        lastActivityAt: "2026-07-25T14:36:45Z",
        work: "Implementing the selected ledger and session detail layout.",
      },
      {
        id: "reviewer",
        name: "Reviewer",
        icon: ShieldCheck,
        color: "#8fa9ff",
        status: "waiting",
        session: "06:18",
        tokens: "9.4k",
        skills: ["product-design:design-qa", "verification-before-completion"],
        tasks: { completed: 1, total: 3 },
        goal: null,
        currentStep: "Waiting",
        lastActivityAt: "2026-07-25T14:33:58Z",
        work: "Waiting for the implementation preview before visual comparison.",
      },
    ],
    activity: [
      { time: "14:36:45", text: "Builder updated the responsive session ledger." },
      { time: "14:33:58", text: "Reviewer entered a waiting state." },
      { time: "14:31:09", text: "Researcher completed the workflow audit." },
    ],
  },
  {
    id: "event-stream",
    name: "Builder",
    role: "Root agent",
    icon: Code,
    color: "#e9a85c",
    session: "event-stream",
    assignedWork: "Normalize live Codex events",
    status: "running",
    currentActivity: "Parsing tool and turn events",
    currentStep: "Calling tool",
    currentTool: { name: "read event stream", startedAt: "2026-07-25T14:36:52Z" },
    lastActivityAt: "2026-07-25T14:36:12Z",
    startedAt: "2026-07-25T14:18:35Z",
    duration: "18:42",
    started: "Started 14:18:35",
    currentWork: {
      id: "TURN-81A9",
      title: "Map raw event payloads to session state",
      note: "Processing a single request with no delegated work.",
    },
    tokens: { total: "34,920", root: "34,920", children: "—" },
    skills: ["diagnose", "test-driven-development"],
    plan: {
      title: "Event normalization",
      tasks: [
        { title: "Capture sample events", status: "done" },
        { title: "Normalize state transitions", status: "active" },
        { title: "Verify replay ordering", status: "queued" },
      ],
    },
    goal: null,
    children: [],
    activity: [
      { time: "14:36:12", text: "Read tool-call completion event." },
      { time: "14:35:48", text: "Normalized running → waiting transition." },
    ],
  },
  {
    id: "cli-research",
    parentSessionId: "dashboard-redesign",
    name: "Researcher",
    role: "Subagent",
    icon: MagnifyingGlass,
    color: "#72d2c2",
    session: "cli-research",
    assignedWork: "Inspect Codex session metadata",
    status: "complete",
    currentActivity: "Findings returned to parent",
    currentStep: "Returned result",
    lastActivityAt: "2026-07-25T14:31:09Z",
    startedAt: "2026-07-25T14:21:27Z",
    duration: "09:42",
    started: "Completed 14:31:09",
    currentWork: {
      id: "CHILD-0F31",
      title: "Identify which runtime signals are observable",
      note: "Delegated research task completed and handed back to Planner.",
    },
    tokens: { total: "18,430", root: "18,430", children: "—" },
    skills: ["graphify", "product-design:get-context"],
    plan: null,
    goal: null,
    children: [],
    activity: [
      { time: "14:31:09", text: "Sent findings to parent session." },
      { time: "14:29:22", text: "Finished metadata source inventory." },
    ],
  },
  {
    id: "design-qa",
    parentSessionId: "dashboard-redesign",
    name: "Reviewer",
    role: "Subagent",
    icon: ShieldCheck,
    color: "#8fa9ff",
    session: "design-qa",
    assignedWork: "Review selected dashboard concept",
    status: "planning",
    currentActivity: "Preparing comparison checklist",
    currentStep: "Reading files",
    lastActivityAt: "2026-07-25T14:34:03Z",
    startedAt: "2026-07-25T14:30:59Z",
    duration: "06:18",
    started: "Started 14:30:59",
    currentWork: {
      id: "CHILD-62C0",
      title: "Plan reference-to-preview visual QA",
      note: "This branch has a Plan Task but does not use a Goal.",
    },
    tokens: { total: "9,410", root: "9,410", children: "—" },
    skills: ["product-design:design-qa", "verification-before-completion"],
    plan: {
      title: "Visual verification",
      tasks: [
        { title: "Define comparison viewport", status: "done" },
        { title: "Capture implemented preview", status: "waiting" },
        { title: "Record final QA result", status: "queued" },
      ],
    },
    goal: null,
    children: [],
    activity: [
      { time: "14:34:03", text: "Prepared the desktop reference checklist." },
      { time: "14:32:46", text: "Waiting for a stable preview URL." },
    ],
  },
  {
    id: "api-auth",
    name: "Operator",
    role: "Root agent",
    icon: TerminalWindow,
    color: "#f2bc65",
    session: "api-auth",
    assignedWork: "Connect a protected event source",
    status: "needs_input",
    currentActivity: "Waiting for API key approval",
    currentStep: "Waiting",
    lastActivityAt: "2026-07-25T14:19:31Z",
    startedAt: "2026-07-25T14:05:50Z",
    duration: "31:07",
    started: "Started 14:05:50",
    currentWork: {
      id: "TURN-F5B8",
      title: "Resume the event-source connection after user approval",
      note: "The session cannot continue without a user-controlled credential.",
    },
    tokens: { total: "21,680", root: "21,680", children: "—" },
    skills: ["openai-platform-api-key"],
    plan: null,
    goal: {
      status: "paused",
      label: "Paused",
      title: "Connect the monitor to a protected event stream",
      detail: "Progress is intentionally paused at the credential boundary.",
      checkpoint: "Blocked on user action · API key approval requested at 14:19",
    },
    children: [],
    activity: [
      { time: "14:19:31", text: "Requested secure API key setup." },
      { time: "14:19:12", text: "Stopped before the credential boundary." },
    ],
  },
  {
    id: "session-docs",
    name: "Documenter",
    role: "Root agent",
    icon: BracketsCurly,
    color: "#a6b7c7",
    session: "session-docs",
    assignedWork: "Document the session state contract",
    status: "complete",
    currentActivity: "Specification written",
    currentStep: "Complete",
    lastActivityAt: "2026-07-25T14:24:08Z",
    startedAt: "2026-07-25T14:11:13Z",
    duration: "12:55",
    started: "Completed 14:24:08",
    currentWork: {
      id: "TURN-A682",
      title: "Write a concise session-state reference",
      note: "A single-request documentation task completed without a plan or goal.",
    },
    tokens: { total: "12,140", root: "12,140", children: "—" },
    skills: ["documents"],
    plan: null,
    goal: null,
    children: [],
    activity: [
      { time: "14:24:08", text: "Saved the final session-state reference." },
      { time: "14:22:51", text: "Verified terminology against the event model." },
    ],
  },
  {
    id: "architecture",
    name: "Architect",
    role: "Root agent",
    icon: Compass,
    color: "#c58cf0",
    session: "architecture",
    assignedWork: "Define monitor module boundaries",
    status: "running",
    currentActivity: "Working toward active Goal",
    currentStep: "Editing",
    lastActivityAt: "2026-07-25T14:35:04Z",
    startedAt: "2026-07-25T13:55:54Z",
    duration: "42:03",
    started: "Started 13:55:54",
    currentWork: {
      id: "TURN-C440",
      title: "Align the event model with the dashboard boundary",
      note: "Goal-driven work with no explicit Plan Task list.",
    },
    tokens: { total: "58,070", root: "44,930", children: "13,140" },
    skills: ["codebase-design", "domain-modeling"],
    plan: null,
    goal: {
      status: "active",
      label: "Active",
      title: "Keep runtime ingestion independent from presentation concerns",
      detail: "The dashboard should consume stable session summaries, not raw provider events.",
      checkpoint: "Last checkpoint · domain vocabulary stabilized at 14:26",
    },
    children: [
      {
        id: "domain-model",
        name: "Modeler",
        icon: GitBranch,
        color: "#c58cf0",
        status: "complete",
        session: "11:26",
        tokens: "13.1k",
        skills: ["domain-modeling"],
        tasks: null,
        goal: null,
        currentStep: "Returned result",
        lastActivityAt: "2026-07-25T14:26:37Z",
        work: "Defined Session, Turn, Work Unit, Plan Task and Goal boundaries.",
      },
    ],
    activity: [
      { time: "14:35:04", text: "Separated session summary from raw events." },
      { time: "14:26:37", text: "Accepted the domain model handoff." },
    ],
  },
  {
    id: "nightly-audit",
    name: "Auditor",
    role: "Scheduled agent",
    icon: WarningCircle,
    color: "#748598",
    session: "nightly-audit",
    assignedWork: "Check stale session cleanup",
    status: "idle",
    currentActivity: "Scheduled for 02:00 UTC",
    currentStep: "Waiting",
    lastActivityAt: "2026-07-25T02:04:12Z",
    duration: "—",
    started: "Next run in 11h 23m",
    currentWork: {
      id: "SCHEDULE-0200",
      title: "Run the nightly stale-session audit",
      note: "Scheduled work exists, but no turn is currently executing.",
    },
    tokens: { total: "—", root: "—", children: "—" },
    skills: ["diagnose"],
    plan: {
      title: "Nightly audit",
      tasks: [
        { title: "Scan stale sessions", status: "queued" },
        { title: "Report cleanup candidates", status: "queued" },
      ],
    },
    goal: null,
    children: [],
    activity: [
      { time: "02:04:12", text: "Previous audit finished with no stale sessions." },
    ],
  },
];

const simulationEvents = [
  {
    id: "sample-01",
    sessionId: "dashboard-redesign",
    occurredAt: "2026-07-25T14:37:04Z",
    patch: {
      status: "running",
      currentActivity: "Reviewing the builder update",
      currentStep: "Reading files",
      currentTool: null,
    },
    tokens: { total: "113,020", root: "46,260", children: "66,760" },
    activity: { time: "14:37:04", text: "Opened the builder handoff for review." },
  },
  {
    id: "sample-02",
    sessionId: "dashboard-redesign",
    occurredAt: "2026-07-25T14:37:08Z",
    patch: {
      currentActivity: "Inspecting the rendered dashboard",
      currentStep: "Calling tool",
      currentTool: { name: "browser.snapshot", startedAt: "2026-07-25T14:37:08Z" },
    },
    tokens: { total: "113,390", root: "46,510", children: "66,880" },
    activity: { time: "14:37:08", text: "Called browser.snapshot on the dashboard." },
  },
  {
    id: "sample-03",
    sessionId: "dashboard-redesign",
    occurredAt: "2026-07-25T14:37:12Z",
    patch: {
      currentActivity: "Integrating the responsive session ledger",
      currentStep: "Editing",
      currentTool: null,
    },
    tokens: { total: "114,040", root: "46,920", children: "67,120" },
    tasks: [
      { title: "Build the responsive session ledger", status: "done" },
      { title: "Verify child-agent disclosure", status: "active" },
    ],
    child: {
      id: "builder",
      currentStep: "Editing",
      lastActivityAt: "2026-07-25T14:37:12Z",
      work: "Finishing the selected ledger and live state presentation.",
    },
    activity: { time: "14:37:12", text: "Merged the responsive ledger update." },
  },
  {
    id: "sample-04",
    sessionId: "dashboard-redesign",
    occurredAt: "2026-07-25T14:37:16Z",
    patch: {
      currentActivity: "Running interaction checks",
      currentStep: "Testing",
      currentTool: { name: "npm test", startedAt: "2026-07-25T14:37:16Z" },
    },
    tokens: { total: "114,760", root: "47,390", children: "67,370" },
    child: {
      id: "reviewer",
      status: "running",
      currentStep: "Testing",
      lastActivityAt: "2026-07-25T14:37:16Z",
      work: "Comparing the live dashboard with the approved reference.",
    },
    activity: { time: "14:37:16", text: "Started the interaction and visual QA checks." },
  },
  {
    id: "sample-05",
    sessionId: "dashboard-redesign",
    occurredAt: "2026-07-25T14:37:20Z",
    patch: {
      status: "waiting",
      currentActivity: "Waiting for the final reviewer result",
      currentStep: "Waiting",
      currentTool: null,
    },
    tokens: { total: "115,120", root: "47,550", children: "67,570" },
    child: {
      id: "builder",
      status: "complete",
      currentStep: "Returned result",
      lastActivityAt: "2026-07-25T14:37:20Z",
      handoff: true,
      work: "Returned the completed implementation to the root session.",
    },
    activity: { time: "14:37:20", text: "Builder returned the completed implementation." },
  },
];

function AgentMark({ item, size = 34, active = false, handoff = false }) {
  const Icon = item.icon ?? Robot;

  return (
    <span
      className={`agent-mark ${active ? "agent-mark--active" : ""} ${handoff ? "agent-mark--handoff" : ""}`}
      style={{ "--agent-color": item.color, width: size, height: size }}
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

function SessionRow({ session, selected, onSelect, clock }) {
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
          <strong>{session.name}</strong>
          <small>{session.role}</small>
        </span>
      </span>
      <span role="cell" className="session-assignment">
        <strong>{session.session}</strong>
        <small>{session.assignedWork}</small>
      </span>
      <span role="cell" className="session-state">
        <StatusBadge status={session.status} />
        <small>{session.currentActivity}{relativeTime ? ` · ${relativeTime}` : ""}</small>
      </span>
      <span role="cell" className="session-time">
        <strong>{session.duration}</strong>
        <small>{session.started}</small>
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
          {session.goal?.label ?? "—"}
        </MetaValue>
      </span>
      <span role="cell" className="session-subagents">
        <MetaValue
          label="Subagents"
          accent={metrics.subagents.active > 0}
          updated={Boolean(session.lastEvent?.childId)}
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

function TaskList({ plan, eventId, changedTasks = [] }) {
  if (!plan) {
    return <p className="empty-copy">This session has no Plan Task list.</p>;
  }

  return (
    <ol className="task-list">
      {plan.tasks.map((task) => {
        const meta = taskStatusMeta[task.status];
        const Icon = meta.icon;
        const changed = changedTasks.includes(task.title);

        return (
          <li
            key={changed ? `${task.title}-${eventId}` : task.title}
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

function ChildAgents({ children, selectedChildId, onSelect, clock }) {
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

          return (
            <button
              type="button"
              className={`child-row ${isSelected ? "child-row--selected" : ""} ${child.handoff ? "child-row--handoff" : ""}`}
              role="row"
              key={child.id}
              onClick={() => onSelect(isSelected ? null : child.id)}
              aria-expanded={isSelected}
            >
              <span role="cell" className="child-agent">
                <AgentMark
                  item={child}
                  size={26}
                  active={childStatus === "running"}
                  handoff={child.handoff}
                />
                <span>
                  <strong>{child.name}</strong>
                  <small>{child.currentStep ?? "Waiting"}{relativeTime ? ` · ${relativeTime}` : ""}</small>
                </span>
              </span>
              <span role="cell"><StatusBadge status={child.status} /></span>
              <span role="cell">{child.session}</span>
              <span role="cell">{child.tokens}</span>
              <span role="cell">{child.skills.length}</span>
              <span role="cell">
                {child.tasks ? `${child.tasks.completed}/${child.tasks.total}` : "—"}
              </span>
              <span role="cell">{child.goal?.label ?? "—"}</span>
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
            <strong>{selectedChild.work}</strong>
          </div>
          <div>
            <small>Skills in use</small>
            <span>{selectedChild.skills.join(" · ")}</span>
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

function LiveStep({ session, clock }) {
  const toolStartedAt = Date.parse(session.currentTool?.startedAt);
  const toolElapsed = Number.isNaN(toolStartedAt)
    ? null
    : Math.max(0, Math.floor((clock - toolStartedAt) / 1000));

  return (
    <div className="live-step">
      <ol aria-label={`Current execution step: ${session.currentStep ?? "Unavailable"}`}>
        {liveSteps.map((step) => {
          const Icon = liveStepIcons[step];
          const active = session.currentStep === step;

          return (
            <li key={step} className={active ? "live-step--active" : ""} aria-current={active ? "step" : undefined}>
              <Icon size={13} weight={active ? "bold" : "regular"} />
              <span>{step}</span>
            </li>
          );
        })}
      </ol>
      {session.currentTool && (
        <div className="live-tool" key={`${session.eventId}-${session.currentTool.name}`}>
          <TerminalWindow size={13} />
          <code>{session.currentTool.name}</code>
          <time>{toolElapsed}s</time>
        </div>
      )}
    </div>
  );
}

function SessionDetail({ session, selectedChildId, onSelectChild, onOpenCodex, clock }) {
  const progress = getPlanProgress(session.plan);
  const relativeTime = getRelativeTime(session.lastActivityAt, new Date(clock));
  const changedTokenKeys = session.lastEvent?.tokenKeys ?? [];

  return (
    <section className="session-detail" id="session-detail" aria-live="polite">
      <header className="detail-heading">
        <div className="detail-agent">
          <AgentMark item={session} size={42} />
          <div>
            <p>Selected session</p>
            <h2>{session.name} <span>/</span> {session.session}</h2>
          </div>
        </div>
        <div className="detail-meta">
          <StatusBadge status={session.status} />
          <span>{session.duration} session</span>
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
              <code>{session.currentWork.id}</code>
            </header>
            <h3>{session.currentWork.title}</h3>
            <p>{session.currentWork.note}</p>
            <LiveStep session={session} clock={clock} />
            <div className="work-state">
              <StatusBadge status={session.status} />
              <small>{session.currentActivity}</small>
            </div>
          </article>

          <article className="detail-card">
            <header className="card-header">
              <span><TerminalWindow size={16} /> Token usage</span>
            </header>
            <dl className="token-list">
              <div>
                <dt>Total</dt>
                <dd
                  key={`total-${session.eventId}`}
                  className={changedTokenKeys.includes("total") ? "value-updated" : ""}
                >
                  {session.tokens.total}
                </dd>
              </div>
              <div>
                <dt>Root agent</dt>
                <dd
                  key={`root-${session.eventId}`}
                  className={changedTokenKeys.includes("root") ? "value-updated" : ""}
                >
                  {session.tokens.root}
                </dd>
              </div>
              <div>
                <dt>Child agents</dt>
                <dd
                  key={`children-${session.eventId}`}
                  className={changedTokenKeys.includes("children") ? "value-updated" : ""}
                >
                  {session.tokens.children}
                </dd>
              </div>
            </dl>
          </article>

          <article className="detail-card">
            <header className="card-header">
              <span><BracketsCurly size={16} /> Applied skills</span>
              <b>{session.skills.length}</b>
            </header>
            <ul className="skill-chips">
              {session.skills.map((skill) => <li key={skill}>{skill}</li>)}
            </ul>
          </article>
        </div>

        <div className="detail-column">
          <article className="detail-card task-card">
            <header className="card-header">
              <span><CheckCircle size={16} /> Tasks</span>
              <b>{progress.total ? `${progress.completed}/${progress.total}` : "Not used"}</b>
            </header>
            {session.plan && <h3>{session.plan.title}</h3>}
            <TaskList
              plan={session.plan}
              eventId={session.eventId}
              changedTasks={session.lastEvent?.taskTitles}
            />
          </article>

          <article className={`detail-card goal-card ${session.goal ? "" : "goal-card--empty"}`}>
            <header className="card-header">
              <span><Target size={16} /> Goal</span>
              <b>{session.goal?.label ?? "Not used"}</b>
            </header>
            {session.goal ? (
              <>
                <h3>{session.goal.title}</h3>
                <p>{session.goal.detail}</p>
                <small>{session.goal.checkpoint}</small>
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
              <b>{session.children.length}</b>
            </header>
            <ChildAgents
              children={session.children}
              selectedChildId={selectedChildId}
              onSelect={onSelectChild}
              clock={clock}
            />
          </article>

          <article className="detail-card activity-card">
            <header className="card-header">
              <span><Pulse size={16} /> Recent activity</span>
              <b>UTC</b>
            </header>
            <ol className="activity-list">
              {session.activity.map((event, index) => (
                <li
                  key={index === 0 && session.lastEvent?.activity
                    ? `${session.eventId}-${event.time}-${event.text}`
                    : `${event.time}-${event.text}`}
                  className={index === 0 && session.lastEvent?.activity ? "activity-item--updated" : ""}
                >
                  <time>{event.time}</time>
                  <span>{event.text}</span>
                </li>
              ))}
            </ol>
          </article>
        </div>
      </div>
    </section>
  );
}

export function App() {
  const [snapshot, setSnapshot] = useState(sessions);
  const [selectedSessionId, setSelectedSessionId] = useState(sessions[0].id);
  const [selectedChildId, setSelectedChildId] = useState(null);
  const [showDemoNotice, setShowDemoNotice] = useState(false);
  const [selectionNotice, setSelectionNotice] = useState("");
  const [sortState, setSortState] = useState({ key: "operational", direction: "asc" });
  const [isLive, setIsLive] = useState(true);
  const [eventIndex, setEventIndex] = useState(0);
  const [clock, setClock] = useState(demoStartedAt);
  const [lastAppliedEvent, setLastAppliedEvent] = useState(null);
  const ledgerRef = useRef(null);
  const previousRects = useRef(new Map());

  const visibleSessions = useMemo(
    () => sortSessions(getVisibleSessions(snapshot), sortState),
    [snapshot, sortState],
  );
  const selectedSession = snapshot.find((session) => session.id === selectedSessionId);

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
    if (!isLive) return undefined;
    const timer = window.setInterval(() => setClock((value) => value + 1000), 1000);
    return () => window.clearInterval(timer);
  }, [isLive]);

  useEffect(() => {
    if (!isLive || eventIndex >= simulationEvents.length) return undefined;

    const timer = window.setTimeout(() => {
      const event = simulationEvents[eventIndex];
      setSnapshot((current) => applySimulationEvent(current, event));
      setLastAppliedEvent({ id: event.id, sessionId: event.sessionId });
      setEventIndex((index) => index + 1);
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [eventIndex, isLive]);

  useEffect(() => {
    if (visibleSessions.some((session) => session.id === selectedSessionId)) return;
    setSelectedSessionId(visibleSessions[0]?.id ?? null);
    setSelectedChildId(null);
    setSelectionNotice("The selected session is no longer in the current server snapshot.");
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
          gsap.fromTo(row, { y: offset }, { y: 0, duration: 0.38, ease: "power2.out", clearProps: "transform" });
        }
      });

      const changedRow = lastAppliedEvent
        ? ledgerRef.current?.querySelector(`[data-session-id="${lastAppliedEvent.sessionId}"]`)
        : null;
      if (changedRow) {
        gsap.fromTo(
          changedRow,
          { backgroundColor: "rgba(94, 214, 198, 0.16)" },
          { backgroundColor: "transparent", duration: 1.1, ease: "power2.out", clearProps: "backgroundColor" },
        );
      }
    }

    previousRects.current = nextRects;
  }, [lastAppliedEvent, visibleSessions]);

  const selectSession = (id) => {
    setSelectedSessionId(id);
    setSelectedChildId(null);
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
          <time>Sat, Jul 25 · {new Date(clock).toISOString().slice(11, 16)} UTC</time>
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
                onClick={() => setIsLive((value) => !value)}
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
              <small>
                Demo mode · {eventIndex >= simulationEvents.length ? "caught up" : "snapshot updating"}
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
            onOpenCodex={() => setShowDemoNotice(true)}
            clock={clock}
          />
        )}
      </div>

      <footer className="page-footer">
        <span>Demo mode · simulated Codex App Server snapshot</span>
        <span>Session event time shown in UTC</span>
      </footer>

      {showDemoNotice && (
        <button
          type="button"
          className="app-toast"
          onClick={() => setShowDemoNotice(false)}
          aria-live="polite"
        >
          <span>Demo mode is using a simulated Codex App Server snapshot.</span>
          <small>Dismiss</small>
        </button>
      )}
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
