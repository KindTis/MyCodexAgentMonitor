# 세션 누적 작업 시간 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 세션 전체의 루트 에이전트 작업 시간을 누적하고, 연결된 Live 화면에서 스냅샷 사이 시간을 매초 보간한다.

**Architecture:** JSONL reducer가 Turn 경계를 넘어 작업 구간을 누적하고 `durationSeconds`와 `isWorking`을 스냅샷에 제공한다. 클라이언트는 서버의 확정 누적값에 `collectedAt` 이후 경과시간을 더하되, Live 연결 상태에서 `isWorking`일 때만 보간한다.

**Tech Stack:** Node.js ESM, React 19, `node:test`

## Global Constraints

- 새 런타임 의존성을 추가하지 않는다.
- 추론·계획·도구 실행은 작업 시간에 포함한다.
- 사용자 입력·승인·하위 에이전트 대기는 작업 시간에서 제외한다.
- `Live / Paused`는 스냅샷 적용과 시간 보간만 제어하며 에이전트 작업을 중지하지 않는다.
- App Server의 `notLoaded` Thread에 있는 `interrupted` Turn은 구조화된 종료 증거 없이 `Stopped`로 확정하지 않는다.

---

### Task 1: 상태 축약과 누적 작업 시간

**Files:**
- Modify: `monitor/session-log.mjs`
- Test: `tests/session-log.test.mjs`

**Interfaces:**
- Consumes: `reduceThreadRecords(previous, records, thread, nowMs)`
- Produces: 기존 observation에 누적 `durationSeconds`와 현재 작업 여부 `isWorking`

- [x] **Step 1: 실패 테스트 작성**

`notLoaded + interrupted` 상태에서 최신 JSONL 활동이 계속되면 `running`과 `isWorking: true`를 유지하는 테스트를 추가한다. 여러 Turn 사이의 사용자 입력·하위 에이전트 대기 구간을 제외한 누적 시간이 정확한지 테스트한다.

- [x] **Step 2: RED 확인**

Run: `node --test tests/session-log.test.mjs`

Expected: 진행 중 Turn이 `stopped`로 반환되고 누적 작업 시간 기대값이 달라 실패한다.

- [x] **Step 3: 최소 구현**

JSONL의 `task_started`/종료 사건과 `request_user_input`/`wait_agent` 호출·결과로 작업 구간을 열고 닫는다. App Server Thread가 `notLoaded`이면 구조화된 JSONL 종료 증거 없는 `interrupted` 값을 무시한다.

- [x] **Step 4: GREEN 확인**

Run: `node --test tests/session-log.test.mjs`

Expected: 모든 session-log 테스트 통과.

### Task 2: 클라이언트 시간 보간

**Files:**
- Modify: `src/agent-model.js`
- Modify: `src/App.jsx`
- Test: `tests/agent-model.test.mjs`

**Interfaces:**
- Consumes: `session.durationSeconds`, `session.isWorking`, snapshot `collectedAt`, UI `clock`
- Produces: `getDisplayedDuration(session, collectedAt, nowMs)`

- [x] **Step 1: 실패 테스트 작성**

작업 중인 세션은 `collectedAt` 이후 시간을 더하고, 대기·종료 상태에서는 확정값을 유지하는 테스트를 추가한다. Paused·연결 오류에서는 UI clock을 멈춰 확정값을 유지한다.

- [x] **Step 2: RED 확인**

Run: `node --test tests/agent-model.test.mjs`

Expected: `getDisplayedDuration` export가 없어 실패한다.

- [x] **Step 3: 최소 구현**

모델 helper를 추가하고 목록과 상세의 Session time 두 곳에서 사용한다. `isLive && connectionStatus === "connected"`일 때만 보간한다.

- [x] **Step 4: GREEN 확인**

Run: `node --test tests/agent-model.test.mjs`

Expected: 모든 agent-model 테스트 통과.

### Task 3: 종단 검증과 그래프 갱신

**Files:**
- Modify: `graphify-out/`

**Interfaces:**
- Consumes: 구현 및 테스트 결과
- Produces: 최신 지식 그래프와 배포 가능한 빌드

- [x] **Step 1: 전체 테스트**

Run: `npm.cmd test`

Expected: 실패 0개.

- [x] **Step 2: 빌드와 Sites 검사**

Run: `npm.cmd run build`

Expected: `dist/client/index.html`, `dist/server/index.js`, `dist/.openai/hosting.json` 생성.

Run: `npm.cmd run test:sites`

Expected: 실패 0개.

- [x] **Step 3: 그래프 갱신**

Run: `graphify update .`

Expected: 변경된 코드와 문서가 `graphify-out/graph.json`에 반영됨.
