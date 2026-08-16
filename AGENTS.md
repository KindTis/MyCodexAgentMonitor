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
- 데스크톱 상세 3열은 35% / 35% / 30%를 유지한다. 1열은 Current work 전체, 2열은 Goal 25% / Recent activity 40% / Child agents 35%, 3열은 Plan Tasks 60% / Applied skills 20% / Token usage 20%로 배치한다.
- 루트 상세의 Current work 카드 내부는 Current work 40% / Recent messages 60% 비율을 유지한다. Current work에서는 제목 표시줄, 단계 아이콘, 구분선, 상태 행을 고정하고 작업 문자열만 줄바꿈과 세로 내부 스크롤을 적용한다. Recent messages는 목록만 내부 스크롤하며 두 영역은 서로의 높이를 변경하지 않는다.
- 루트와 Child Agent의 Current work에는 사용자에게 표시된 최근 agent 메시지 원문을 최신순 10개까지 항목당 최대 3줄로 표시하고 목록만 내부 스크롤한다. 행을 누르면 마우스 가까이에 전체 원문을 표시하며 다음 클릭이나 `Esc`로 닫는다. 실제 새 메시지만 기존 activity 강조 효과를 적용하고 사용자 입력·추론·도구 출력·내부 agent 메시지는 제외한다.
- 루트와 Child Agent의 Recent activity는 `exec`, `wait` 같은 내부 도구명 대신 안전하게 요약한 명령·대기 대상·작업 수를 표시하고 비밀값은 노출하지 않는다. 실제 새 activity만 강조한다.
- Do not make the whole selected-session detail an independent scroll area. Limit internal scrolling to long Plan Tasks, child-agent, recent-message, and recent-activity lists.
- Show Child Agents in five wrapping columns: agent name, state, session time, tasks, and Goal. Do not use horizontal scrolling or hover-revealed details.
- Open a floating detail dialog when a child-agent row is clicked. Keep Recent activity under Current work in the left half of the first row and show Recent messages as the right-half card; keep applied skills, tasks, and Goal in the second row.
- 루트 세션을 선택하지 않았을 때 오른쪽 영역에 Active, Waiting, Inactive, Ended의 4개 글로벌 활동 레인을 표시한다. Planning/Queued는 Active, Needs input/Blocked는 Waiting, Failed는 Ended에 포함하되 각 상태 배지 색상은 유지한다.
- Global Activity에는 루트와 자식 에이전트를 각각 별도 카드로 표시한다. 자식 카드는 부모의 프로젝트명·브랜치명·세션명을 사용하고 클릭 시 기존 Child Agent 상세 다이얼로그를 바로 연다. Child 태그는 Complete와 구분되는 시안을 사용한다. 카드 마지막 줄은 세션 시간을 좌측에 두고, 루트는 모델명, 자식은 `닉네임 / 모델명`을 우측 한 줄로 표시한다. 좌측 루트 목록의 오른쪽 열은 상태 태그, 모델명, 세션 경과 시간, Started 시각 순서로 우측 정렬한다.
- 최초 진입과 선택 세션 소멸 시 다른 세션을 자동 선택하지 않는다. 목록 행 재선택이나 상세 닫기는 글로벌 활동 보드로 돌아간다.
- 글로벌 보드는 데스크톱 4열, 적층·작은 화면 2열, 모바일 1열을 사용하며 데스크톱에서 레인 카드 영역만 내부 스크롤한다.
- 글로벌 카드 이동과 최신 이벤트 강조는 적용된 스냅샷의 실제 변화에만 반응한다.
- 상단 `Tokens · Cost` 묶음 전체를 사용량 히스토리 진입점으로 사용한다. hover/focus 시 라벨 밑줄 대신 묶음 전체에 공통 패널 배경과 외곽선을 표시하며, 복귀 시 기존 세션 화면 상태와 진입점 포커스를 복원한다.
- 사용량 히스토리는 좌측 루트 세션 목록을 유지한 채 세션 상세와 같은 우측 영역에 표시하고 공통 `X` 버튼으로 닫는다. 세션 상세와 히스토리의 `X`는 헤더 동작 영역 최우측에 둔다. 최초 날짜 그룹은 7D이며 같은 앱 실행 중에는 마지막으로 선택한 7D/30D 그룹을 닫기·재진입 후에도 유지한다. 이전·다음 기간 탐색을 제공한다. 그래프는 좌측 Cost 축의 앰버 선·노드와 우측 Tokens 축의 시안 캡슐 막대만 사용하며 Cost 영역 채우기는 사용하지 않는다. 모든 날짜는 hover/focus 시 Cost와 Tokens 툴팁을 표시하되 선택일은 변경하지 않는다. 포인터 hover 중에는 툴팁이 포인터를 따라가며 차트 경계 안에 유지하고, 포인터가 없을 때는 Token 막대 상단을 기준으로 배치한다. 브라우저 기본 SVG `title` 툴팁은 사용하지 않는다. Live 스냅샷의 오늘 Tokens/Cost는 상단 사용량과 오늘 차트·합계에 함께 반영하고, 오늘이 선택된 동안 세션 목록만 백그라운드 갱신한다.
- 선택일 세션 목록은 Token 내림차순으로 프로젝트명, 세션명, 상대 사용량, Tokens, Cost를 표시한다. Live 갱신에서는 유지된 Cost·Tokens를 기존 값에서 새 값으로, 날짜·기간 변경과 새 세션에서는 0에서 최종값으로 기존 하이라이트와 함께 카운트한다. 선택 툴팁도 같은 규칙을 사용하되 hover 미리보기 툴팁은 애니메이션하지 않는다.
