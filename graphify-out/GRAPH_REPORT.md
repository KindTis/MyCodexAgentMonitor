# Graph Report - topbar-usage-summary  (2026-07-26)

## Corpus Check
- 39 files · ~708,259 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 415 nodes · 615 edges · 28 communities (24 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `818bf380`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

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
- 로컬 Codex 실시간 현황판 구현 항목 매핑
- README.md
- Global Constraints
- 상단 Codex 사용량 요약 및 상세 화면 배치 설계
- usage.mjs
- 상단 Codex 사용량 요약 및 상세 배치 구현 항목 매핑
- child-agents-ui.test.mjs
- topbar-usage-ui.test.mjs

## God Nodes (most connected - your core abstractions)
1. `reduceThreadRecords()` - 18 edges
2. `AppServerClient` - 16 edges
3. `로컬 Codex 실시간 현황판 설계` - 16 edges
4. `SnapshotStore` - 15 edges
5. `에이전트 세션 목록 정렬 및 상호작용 스펙` - 13 edges
6. `normalizeStatus()` - 11 edges
7. `상단 Codex 사용량 요약 및 상세 화면 배치 설계` - 10 edges
8. `JsonlTailer` - 9 edges
9. `toIso()` - 9 edges
10. `getDisplayedDuration()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `startMonitorForTest()` --calls--> `startMonitor()`  [EXTRACTED]
  tests/monitor-server.test.mjs → monitor/server.mjs
- `startTestServer()` --calls--> `createMonitorServer()`  [EXTRACTED]
  tests/monitor-server.test.mjs → monitor/server.mjs
- `StatusBadge()` --calls--> `normalizeStatus()`  [EXTRACTED]
  src/App.jsx → src/agent-model.js
- `startMonitor()` --calls--> `resolveCodexHome()`  [EXTRACTED]
  monitor/server.mjs → monitor/session-log.mjs
- `SessionRow()` --calls--> `formatDuration()`  [EXTRACTED]
  src/App.jsx → src/agent-model.js

## Import Cycles
- None detected.

## Communities (28 total, 4 thin omitted)

### Community 0 - "dependencies"
Cohesion: 0.07
Nodes (28): @fontsource-variable/geist, @fontsource-variable/geist-mono, gsap, dependencies, @fontsource-variable/geist, @fontsource-variable/geist-mono, gsap, @phosphor-icons/react (+20 more)

### Community 1 - "디자인 QA"
Cohesion: 0.12
Nodes (39): ACTIVE_CHILD_STATUSES, compareValues(), durationInSeconds(), formatCostUsd(), formatDuration(), formatGoalStatus(), formatKstTime(), formatPercent() (+31 more)

### Community 2 - "package.json"
Cohesion: 0.09
Nodes (20): JsonlTailer, buildChild(), buildCurrentWork(), buildSessions(), CHILD_SOURCE_KINDS, cloneOrNull(), compareLastActivity(), epochSecondsToMs() (+12 more)

### Community 3 - "App.jsx"
Cohesion: 0.20
Nodes (9): Findings, 디자인 QA, 브라우저 검증, 비교 대상, 비교 이력, 이번 구현, 이전 구현, 필수 충실도 점검 (+1 more)

### Community 4 - "prepare-sites-build.mjs"
Cohesion: 0.10
Nodes (33): activityKind(), addDuration(), applyEventRecord(), applyResponseRecord(), applyTurnItems(), applyTurnTerminalState(), applyUserMessage(), applyWorkingRecord() (+25 more)

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
Cohesion: 0.07
Nodes (27): 10. 연결 상태와 오류 처리, 11. 실행 편의, 12. 보안과 데이터 경계, 13.1 수집기, 13.2 wire 변환, 13.3 화면, 13.4 회귀 검증, 13. 검증 (+19 more)

### Community 11 - "에이전트 세션 목록 정렬 및 상호작용 스펙"
Cohesion: 0.10
Nodes (20): 10. 접근성, 11. 검증 기준, 12. 제외 범위, 1. 목적, 2. 데이터 범위, 3. 상위 목록 포함 기준, 4.1 상태 우선순위, 4.2 갱신 시 동작 (+12 more)

### Community 12 - "agent-model.js"
Cohesion: 0.12
Nodes (6): ALLOWED_METHODS, AppServerClient, AppServerExitedError, AppServerProtocolError, AppServerTimeoutError, startClient()

### Community 13 - "에이전트 세션 라이브 동작 구현 계획"
Cohesion: 0.33
Nodes (5): Task 1: 세션 모델을 테스트 우선으로 확장, Task 2: 목록 정렬과 Live/Paused를 연결, Task 3: 균형형 라이브 활동 표현 추가, Task 4: 검증과 문서 동기화, 에이전트 세션 라이브 동작 구현 계획

### Community 14 - "agent-model.test.mjs"
Cohesion: 0.07
Nodes (19): CONTENT_TYPES, createMonitorServer(), EMPTY_SNAPSHOT, listen(), readFile(), RETRY_DELAYS_MS, runCli(), sendFile() (+11 more)

### Community 15 - "normalizeStatus"
Cohesion: 0.12
Nodes (16): Task 1: 버전 계약을 고정하고 읽기 전용 App Server 클라이언트 작성, Task 2: JSONL을 증분 판독하고 현재 Turn 관찰 상태로 축약, Task 3: 세션 등록 생명주기와 스냅샷 조립, Task 4: 루프백 HTTP 서버와 단일 명령 실행 경로 연결, Task 5: 실제 wire의 숫자·시각·변경 강조를 클라이언트 모델에 추가, Task 6: React를 실제 스냅샷 공급자와 연결, Task 7: 실제 로컬 세션으로 종단 검증하고 그래프 갱신, 로컬 Codex 실시간 현황판 구현 계획 (+8 more)

### Community 19 - "로컬 Codex 실시간 현황판 구현 항목 매핑"
Cohesion: 0.20
Nodes (9): 검증 요약, 검증관 보완 라운드, 구현 가정, 구현 계획서 모순, 구현 항목 매핑표, 남은 리스크, 로컬 Codex 실시간 현황판 구현 항목 매핑, 변경 기준점 (+1 more)

### Community 21 - "Global Constraints"
Cohesion: 0.33
Nodes (5): Global Constraints, Task 1: 상태 축약과 누적 작업 시간, Task 2: 클라이언트 시간 보간, Task 3: 종단 검증과 그래프 갱신, 세션 누적 작업 시간 구현 계획

### Community 22 - "상단 Codex 사용량 요약 및 상세 화면 배치 설계"
Cohesion: 0.09
Nodes (20): Global Constraints, Task 1: 기존 App Server 연결에 Rate Limit 읽기 추가, Task 2: 사용량 파서와 독립 수집 함수, Task 3: 10초 스케줄과 Snapshot API 병합, Task 4: 표시 포맷과 상단 사용량 요약, Task 5: 선택 세션 상세의 열·행 비율 재배치, Task 6: 전체 회귀, 실제 로컬 데이터, 반응형 검증, 상단 Codex 사용량 요약 및 상세 배치 구현 계획 (+12 more)

### Community 23 - "usage.mjs"
Cohesion: 0.24
Nodes (14): collectUsage(), EMPTY_USAGE, execFileAsync, findCodexBucket(), getKstDateKey(), getRows(), KST_DATE_FORMAT, parseCcusageDaily() (+6 more)

### Community 24 - "상단 Codex 사용량 요약 및 상세 배치 구현 항목 매핑"
Cohesion: 0.22
Nodes (8): 검증 요약, 구현 가정, 구현 계획서 모순, 구현 항목 매핑표, 남은 리스크, 변경 기준점, 보류 항목, 상단 Codex 사용량 요약 및 상세 배치 구현 항목 매핑

## Knowledge Gaps
- **159 isolated node(s):** `RETRY_DELAYS_MS`, `EMPTY_SNAPSHOT`, `PLAN_STATUS`, `SessionReadFailure`, `execFileAsync` (+154 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AppServerClient` connect `agent-model.js` to `agent-model.test.mjs`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Why does `SnapshotStore` connect `package.json` to `agent-model.test.mjs`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Why does `로컬 Codex 실시간 현황판 설계` connect `vite.config.mjs` to `상단 Codex 사용량 요약 및 상세 화면 배치 설계`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **What connects `RETRY_DELAYS_MS`, `EMPTY_SNAPSHOT`, `PLAN_STATUS` to the rest of the system?**
  _159 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Should `디자인 QA` be split into smaller, more focused modules?**
  _Cohesion score 0.12025901942645699 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08961593172119488 - nodes in this community are weakly interconnected._