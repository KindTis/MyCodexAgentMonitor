# Graph Report - MyCodexAgentMonitor  (2026-07-25)

## Corpus Check
- 20 files · ~678,486 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 142 nodes · 169 edges · 19 communities (17 shown, 2 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- dependencies
- 디자인 QA
- package.json
- App.jsx
- prepare-sites-build.mjs
- getPlanProgress
- Prototype Instructions
- index.js
- AGENTS.md
- App
- vite.config.mjs
- 에이전트 세션 목록 정렬 및 상호작용 스펙
- agent-model.js
- 에이전트 세션 라이브 동작 구현 계획
- agent-model.test.mjs
- normalizeStatus
- app-identity.test.mjs

## God Nodes (most connected - your core abstractions)
1. `에이전트 세션 목록 정렬 및 상호작용 스펙` - 13 edges
2. `normalizeStatus()` - 10 edges
3. `getSessionMetrics()` - 8 edges
4. `App()` - 7 edges
5. `sortSessions()` - 7 edges
6. `getRelativeTime()` - 7 edges
7. `디자인 QA` - 7 edges
8. `scripts` - 6 edges
9. `getPlanProgress()` - 5 edges
10. `sortValue()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `StatusBadge()` --calls--> `normalizeStatus()`  [EXTRACTED]
  src/App.jsx → src/agent-model.js
- `SessionRow()` --calls--> `getSessionMetrics()`  [EXTRACTED]
  src/App.jsx → src/agent-model.js
- `SessionDetail()` --calls--> `getRelativeTime()`  [EXTRACTED]
  src/App.jsx → src/agent-model.js
- `App()` --calls--> `normalizeStatus()`  [EXTRACTED]
  src/App.jsx → src/agent-model.js
- `App()` --calls--> `sortSessions()`  [EXTRACTED]
  src/App.jsx → src/agent-model.js

## Import Cycles
- None detected.

## Communities (19 total, 2 thin omitted)

### Community 0 - "dependencies"
Cohesion: 0.12
Nodes (17): @fontsource-variable/geist, @fontsource-variable/geist-mono, gsap, dependencies, @fontsource-variable/geist, @fontsource-variable/geist-mono, gsap, @phosphor-icons/react (+9 more)

### Community 1 - "디자인 QA"
Cohesion: 0.15
Nodes (8): demoStartedAt, liveStepIcons, liveSteps, sessions, simulationEvents, sortColumns, statusMeta, taskStatusMeta

### Community 2 - "package.json"
Cohesion: 0.18
Nodes (10): name, private, scripts, build, dev, preview, test, test:sites (+2 more)

### Community 3 - "App.jsx"
Cohesion: 0.20
Nodes (9): Findings, 디자인 QA, 브라우저 검증, 비교 대상, 비교 이력, 이번 구현, 이전 구현, 필수 충실도 점검 (+1 more)

### Community 4 - "prepare-sites-build.mjs"
Cohesion: 0.39
Nodes (7): compareValues(), durationInSeconds(), OPERATIONAL_RANK, sortSessions(), sortValue(), STATUS_ALIASES, toTime()

### Community 5 - "getPlanProgress"
Cohesion: 0.20
Nodes (9): Codex 에이전트 상태 스냅샷, Dabom — 자동 메타데이터 구현 계획, MyCodexAgentMonitor — 상태 스냅샷 작성, MyCodexAgentMonitor — 현황판 정보 구조 재검토, TransportFactory — 건물 수평 반전 구현, 세션별 상세, 최근 완료 또는 대기 상태, 해석 시 주의사항 (+1 more)

### Community 6 - "Prototype Instructions"
Cohesion: 0.33
Nodes (5): Global Constraints, Task 1: 정식 앱 아이덴티티 계약, Task 2: 애플리케이션을 저장소 루트로 이동, Task 3: 루트 앱 검증과 브라우저 인계, 정식 애플리케이션 승격 구현 계획

### Community 7 - "index.js"
Cohesion: 0.33
Nodes (5): dist, hosting, index, root, worker

### Community 8 - "AGENTS.md"
Cohesion: 0.50
Nodes (3): Application, graphify, Product Direction

### Community 9 - "App"
Cohesion: 0.40
Nodes (4): Agent Session 대시보드 구현 계획, Task 1: 목록 요약 모델을 실제 세션 구조에 맞춘다, Task 2: 세션 목록과 상세 패널을 시안대로 교체한다, Task 3: 빌드와 브라우저에서 검증한다

### Community 10 - "vite.config.mjs"
Cohesion: 0.47
Nodes (4): applySimulationEvent(), getRowScrollTop(), getVisibleSessions(), App()

### Community 11 - "에이전트 세션 목록 정렬 및 상호작용 스펙"
Cohesion: 0.10
Nodes (20): 10. 접근성, 11. 검증 기준, 12. 제외 범위, 1. 목적, 2. 데이터 범위, 3. 상위 목록 포함 기준, 4.1 상태 우선순위, 4.2 갱신 시 동작 (+12 more)

### Community 12 - "agent-model.js"
Cohesion: 0.40
Nodes (6): getRelativeTime(), KNOWN_STATUSES, normalizeStatus(), ChildAgents(), SessionRow(), StatusBadge()

### Community 13 - "에이전트 세션 라이브 동작 구현 계획"
Cohesion: 0.33
Nodes (5): Task 1: 세션 모델을 테스트 우선으로 확장, Task 2: 목록 정렬과 Live/Paused를 연결, Task 3: 균형형 라이브 활동 표현 추가, Task 4: 검증과 문서 동기화, 에이전트 세션 라이브 동작 구현 계획

### Community 14 - "agent-model.test.mjs"
Cohesion: 0.50
Nodes (4): ACTIVE_CHILD_STATUSES, getPlanProgress(), getSessionMetrics(), SessionDetail()

## Knowledge Gaps
- **78 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+73 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `dependencies` connect `dependencies` to `package.json`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _78 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
- **Should `에이전트 세션 목록 정렬 및 상호작용 스펙` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._