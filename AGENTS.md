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
- Use the Quiet Data Studio design from `assets/orbital-dispatch-quiet-data-studio.png` as the visual source of truth.
- Use Geist Sans for UI copy, Geist Mono only for times, IDs, code, and numeric readouts, and Phosphor regular icons throughout.
- Use the restrained navy palette (`#090C13`, `#101521`, `#161C29`) with cool white text and indigo, violet, cyan, amber, and coral only for hierarchy and state.
- Modern Dark 상태 팔레트에 녹색·민트 계열을 사용하지 않는다. Running은 인디고, Complete/Planning은 바이올렛, Connected/Live는 시안 블루, Waiting/Syncing은 앰버, Attention/Error는 코랄, inactive 상태는 슬레이트를 사용한다.
- 정보 역할 컬러는 프로젝트명=쿨 화이트, 세션명=소프트 쿨 화이트, 브랜치/현재 작업=보조 슬레이트, 실행 상태=인디고, Skills/Goal=바이올렛, Tasks/Cost=앰버, 시간/Tokens/Recent activity=시안, Attention/사용량 경고=코랄로 구분한다.
- 데스크톱 앱 셸은 상단·콘텐츠·하단을 한 뷰포트 안에 배치하고 문서 스크롤 대신 합의된 내부 목록만 스크롤한다.
- Prefer divider-based regions, one selected-session rail, and flat tinted states; avoid terminal styling, glow effects, decorative gradients, and nested card chrome.
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
- 루트 세션을 선택하지 않았을 때 오른쪽 영역에 Active, Waiting, Inactive, Ended의 4개 글로벌 활동 레인을 표시한다. Planning/Queued는 Active, Needs input/Blocked는 Waiting, Failed는 Ended에 포함하되 각 상태 배지 색상은 유지한다.
- 최초 진입과 선택 세션 소멸 시 다른 세션을 자동 선택하지 않는다. 목록 행 재선택이나 상세 닫기는 글로벌 활동 보드로 돌아간다.
- 글로벌 보드는 데스크톱 4열, 적층·작은 화면 2열, 모바일 1열을 사용하며 데스크톱에서 레인 카드 영역만 내부 스크롤한다.
- 글로벌 카드 이동과 최신 이벤트 강조는 적용된 스냅샷의 실제 변화에만 반응한다.
