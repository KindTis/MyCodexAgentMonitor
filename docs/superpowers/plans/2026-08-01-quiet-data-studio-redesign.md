# Quiet Data Studio Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 승인된 Quiet Data Studio 시안으로 Orbital Dispatch의 전체 시각 계층을 교체하되 기존 데이터와 상호작용 계약을 유지한다.

**Architecture:** 기존 `App.jsx`의 상태·데이터 흐름은 유지하고 상세 DOM의 세 열만 제품 계약에 맞게 재배치한다. 설치된 Geist와 Phosphor Icons를 재사용하며 모든 시각 변경은 기존 `styles.css` 토큰과 컴포넌트 선택자에 집중한다.

**Tech Stack:** React 19, Vite 6, Geist Variable, Geist Mono Variable, Phosphor Icons, Node test runner

## Global Constraints

- 새 런타임 의존성을 추가하지 않는다.
- 루트 세션은 목록에만, Child Agent는 선택 상세에만 표시한다.
- 데스크톱 상세 열은 35% / 35% / 30%를 사용한다.
- Current Work / Recent Activity는 40% / 60%를 사용한다.
- Goal / Child Agents는 30% / 70%를 사용한다.
- Plan Tasks / Applied Skills / Token Usage는 60% / 20% / 20%를 사용한다.
- 서버 API, 스냅샷 모델, Live/Paused, 정렬, 선택·포커스 동작을 변경하지 않는다.
- `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, `tests/sites-worker.test.mjs`를 변경하지 않는다.

---

### Task 1: 시각·레이아웃 계약 고정

**Files:**
- Modify: `tests/layout-contract.test.mjs`
- Modify: `tests/session-chrome-ui.test.mjs`

**Interfaces:**
- Consumes: `SessionDetail`, `SessionRow`, `SystemSummary`의 현재 서버 렌더링 마크업
- Produces: 새 상세 열 순서, `Plan Tasks` 명칭, 요약 아이콘과 시각 토큰 계약

- [ ] **Step 1: 실패 테스트 작성**

`layout-contract.test.mjs`에서 상세 순서를 `Current work → Recent activity → Goal → Child agents → Plan Tasks → Applied skills → Token usage`로 요구하고 열 비율을 35/35/30, 40/60, 30/70, 60/20/20으로 고정한다. `session-chrome-ui.test.mjs`에서는 `Plan Tasks`와 상단 요약의 Phosphor SVG 아이콘 렌더링을 확인한다.

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/layout-contract.test.mjs tests/session-chrome-ui.test.mjs`

Expected: 기존 34/33/33 열과 `Tasks` 명칭 때문에 FAIL.

### Task 2: 상세 구성과 아이콘 교체

**Files:**
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: 기존 snapshot, session, plan, goal, child, usage 데이터
- Produces: `detail-column--work`, `detail-column--context`, `detail-column--planning` 세 열과 일관된 Phosphor 아이콘 마크업

- [ ] **Step 1: 최소 JSX 변경**

기존 계산과 이벤트 핸들러는 유지한다. Goal과 Child Agents를 두 번째 열로 묶고 Plan Tasks, Applied Skills, Token Usage를 세 번째 열로 묶는다. 브랜드, 섹션, Live Step, 상단 요약 아이콘을 설치된 Phosphor 컴포넌트로 교체한다.

- [ ] **Step 2: 계약 테스트 통과 확인**

Run: `node --test tests/layout-contract.test.mjs tests/session-chrome-ui.test.mjs`

Expected: PASS.

### Task 3: Quiet Data Studio 스타일 구현

**Files:**
- Modify: `src/styles.css`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: Task 2의 기존 클래스와 세 상세 열 클래스
- Produces: 승인 팔레트, Geist 타이포 계층, 상태색, 선택 레일, 레일형 Live Step, 반응형 스타일

- [ ] **Step 1: 디자인 토큰과 컴포넌트 스타일 교체**

`:root` 토큰을 명세 값으로 교체하고 본문 14px, 메타데이터 최소 12px, 8px 그리드, 10~12px 표면 반경을 적용한다. 카드 중첩과 글로우를 줄이고 상태·선택·빈 상태를 시안에 맞춘다.

- [ ] **Step 2: 반응형 계약 유지**

1180px 이하 적층 목록, 1120px 이하 상세 2열, 760px 이하 1열, 글로벌 보드 6/3/2/1열과 내부 스크롤 규칙을 유지한다.

- [ ] **Step 3: 전체 테스트**

Run: `npm test`

Expected: 모든 테스트 PASS.

### Task 4: 빌드와 시각 검증

**Files:**
- Modify: `design-qa.md`
- Create: `artifacts/quiet-data-studio-implementation.png`

**Interfaces:**
- Consumes: `assets/orbital-dispatch-quiet-data-studio.png`, 로컬 실행 화면
- Produces: 동일 1738×905 상태의 구현 캡처와 통과한 QA 보고서

- [ ] **Step 1: 정적 검증**

Run: `npm run build`

Expected: `dist/client/index.html`, `dist/server/index.js`, `dist/.openai/hosting.json` 생성.

Run: `npm run test:sites`

Expected: PASS.

- [ ] **Step 2: 브라우저 검증**

로컬 서버를 실행하고 1738×905에서 선택 세션 상세, Live 토글, 정렬, 세션 재선택, Child Agent dialog, 콘솔 오류를 확인한다.

- [ ] **Step 3: 디자인 QA 반복**

기준 이미지와 구현 캡처를 같은 비교 입력으로 검사한다. P0/P1/P2를 수정하고 다시 캡처해 `design-qa.md`의 `final result: passed`를 만든다.

- [ ] **Step 4: 그래프 갱신**

Run: `graphify update .`

Expected: 변경된 `src/`와 테스트 관계가 `graphify-out/graph.json`에 반영됨.
