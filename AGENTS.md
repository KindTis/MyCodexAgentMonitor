## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Application

- The formal application entry is at the repository root: `package.json`, `index.html`, and `src/`.
- Run the local server yourself and open it in the available browser instead of giving the user server-start instructions.
- Build the UI in `src/`.
- Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact.
- Before a Sites handoff, run `npm run build` and `npm run test:sites`. The build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
- When implementing from the selected generated mock, treat it as the source of truth for layout, density, spacing, color, typography, content, and hierarchy.
- Record durable product-specific design decisions in this file.

## Product Direction

- The product name is `My Codex Agent Monitor`; the in-page brand is `Orbital Dispatch`.
- Use the dark operational-control design from `exec-4a03fc65-9b96-4d4a-8cc1-0d9b0e181e13.png`.
- The top list must show agent, session/assigned work, state/current activity, session time, skills, task completion, Goal use, and active/total child agents.
- Identify each root session in the top list by the final folder name of its `cwd` and its current Git branch; do not repeat fixed `Codex` or `Root agent` labels there.
- The selected-session detail must show current work, tokens, skills, Plan Tasks, Goal, child agents, and recent activity.
- Do not show invented progress percentages, Execution Trace, Plan Milestones, or generic KPI cards.
- Show only root sessions in the top list. Show child agents only in the selected-session detail.
- Default order is attention needed, running, waiting, planning, inactive, complete, with recent activity first inside a group.
- Use restrained state motion, Live step, relative activity time, token/task updates, and handoff feedback to convey active work.
- `Live / Paused` controls snapshot application only; it does not stop agent work.
- Session time is the session-wide accumulated root-agent working time. Count reasoning, planning, and tool execution; exclude user/approval waits and child-agent waits. Interpolate between snapshots only while the session is working and the live feed is connected.
- Until the Codex App Server is connected, use deterministic simulated snapshots and label the state `Demo mode`.
- On desktop, place the root-session list on the left and the selected-session detail on the right.
- Size the desktop shell from minimum dimensions and let it grow with the browser. Let the session list consume the ledger's available height and scroll only its overflow; do not reserve a fixed number of rows.
- Lay out desktop session cards in four bands: agent/state, assignment/session time, current activity, and padded metrics. Point the session caret toward the detail panel: right in the desktop master-detail layout and down in the stacked layout.
- Give the three desktop detail columns a 35% / 35% / 30% balance. Split column 1 into Current work 40% / Recent activity 60%, column 2 into Goal 30% / Child agents 70%, and column 3 into Plan Tasks 60% / Applied skills 20% / Token usage 20%.
- Do not make the whole selected-session detail an independent scroll area. Limit internal scrolling to long Plan Tasks, child-agent, and recent-activity lists.
- Show Child Agents in five wrapping columns: agent name, state, session time, tasks, and Goal. Do not use horizontal scrolling or hover-revealed details.
- Open a floating detail dialog when a child-agent row is clicked. Show current work, recent activity, applied skills, tasks, and Goal.
