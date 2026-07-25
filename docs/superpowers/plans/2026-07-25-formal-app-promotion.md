# 정식 애플리케이션 승격 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `prototype/`의 대시보드를 저장소 루트의 정식 `My Codex Agent Monitor` 애플리케이션으로 승격한다.

**Architecture:** Vite 애플리케이션 구조와 Sites 패키징 구조는 그대로 유지하되 모든 런타임 파일을 저장소 루트로 이동한다. `Orbital Dispatch` 화면 브랜드는 유지하고 프로토타입 표기는 제거하며, 실제 서버 연결 전 시뮬레이션은 `Demo mode`로 정직하게 표시한다.

**Tech Stack:** React 19, Vite 6, Node test runner, GSAP, Phosphor Icons, Sites worker.

## Global Constraints

- 애플리케이션 엔트리는 저장소 루트의 `package.json`, `index.html`, `src/`이다.
- 패키지명은 `my-codex-agent-monitor`이다.
- 화면 브랜드 `Orbital Dispatch`는 유지한다.
- `Concept`, `Prototype`, `Sample feed` 제품 표기는 사용하지 않는다.
- 실제 Codex App Server 연결 전에는 `Demo mode`와 시뮬레이션 스냅샷임을 표시한다.
- 기존 `.openai/hosting.json`, worker, Sites 테스트와 빌드 산출 계약은 유지한다.
- 이 작업 공간은 Git 저장소가 아니므로 커밋 단계는 수행하지 않는다.

---

### Task 1: 정식 앱 아이덴티티 계약

**Files:**
- Create: `prototype/tests/app-identity.test.mjs`
- Modify: `prototype/package.json`
- Modify: `prototype/src/App.jsx`
- Modify: `prototype/src/styles.css`

**Interfaces:**
- Consumes: 현재 `prototype/` 앱 소스와 패키지 메타데이터
- Produces: `my-codex-agent-monitor` 패키지와 `Demo mode` 화면 카피

- [x] **Step 1: 실패 테스트 작성**

`tests/app-identity.test.mjs`에서 패키지명이 `my-codex-agent-monitor`인지, 화면 소스에 `Concept prototype`, `Sample feed`, `prototype-pill`이 없는지 검증한다.

- [x] **Step 2: 실패 확인**

Run: `npm.cmd --prefix prototype test`

Expected: 기존 `prototype` 패키지명과 프로토타입 카피 때문에 FAIL.

- [x] **Step 3: 최소 구현**

패키지명, 상태 변수, 시작 시각 상수, 토스트 클래스와 사용자 카피를 정식 앱/데모 모드 명칭으로 변경한다.

- [x] **Step 4: 통과 확인**

Run: `npm.cmd --prefix prototype test`

Expected: PASS.

### Task 2: 애플리케이션을 저장소 루트로 이동

**Files:**
- Move: `prototype/src/` → `src/`
- Move: `prototype/tests/` → `tests/`
- Move: `prototype/scripts/` → `scripts/`
- Move: `prototype/worker/` → `worker/`
- Move: `prototype/.openai/` → `.openai/`
- Move: `prototype/package.json`, `package-lock.json`, `index.html`, `vite.config.mjs`, `.npmrc` → 저장소 루트
- Move: `prototype/design-qa.md`, QA 이미지 → `docs/design-qa/`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: Task 1의 정식 앱 아이덴티티
- Produces: 저장소 루트에서 실행·테스트·빌드되는 앱

- [x] **Step 1: 실행 중 개발 서버 중지**

5173 포트의 현재 Vite 프로세스를 확인하고 종료한다.

- [x] **Step 2: 경로 검증 후 이동**

원본이 `C:\Users\tatis\Repos\MyCodexAgentMonitor\prototype` 아래이고 대상이 저장소 루트인지 확인한 다음 명시된 파일과 디렉터리만 이동한다.

- [x] **Step 3: 앱 지침 병합**

기존 루트 `AGENTS.md`의 graphify 규칙을 유지하고 앱 실행·시각·Sites 검증 규칙을 추가한다.

- [x] **Step 4: 문서 경로 갱신**

현재 스펙과 구현 계획의 활성 경로를 루트 기준으로 갱신하고 QA 문서의 캡처 경로를 `docs/design-qa/`로 변경한다.

### Task 3: 루트 앱 검증과 브라우저 인계

**Files:**
- Verify: `package.json`
- Verify: `src/App.jsx`
- Verify: `tests/*.test.mjs`
- Verify: `docs/design-qa/design-qa.md`

**Interfaces:**
- Consumes: 저장소 루트 앱
- Produces: 루트에서 실행되는 검증 완료 페이지

- [x] **Step 1: 테스트와 빌드**

Run: `npm.cmd test`

Run: `npm.cmd run test:sites`

Run: `npm.cmd run build`

Expected: 모든 테스트와 빌드 PASS, `dist/client/index.html`, `dist/server/index.js`, `dist/.openai/hosting.json` 생성.

- [x] **Step 2: 개발 서버 재시작**

Run: `npm.cmd run dev -- --host 0.0.0.0 --port 5173`

- [x] **Step 3: 브라우저 검증**

패키지 루트 페이지를 열어 `Concept` 표기가 없고 `Demo mode`가 표시되며 정렬, Live/Paused, 5행 내부 스크롤과 상세 선택이 유지되는지 확인한다.

- [x] **Step 4: 최종 동기화**

Run: `graphify update .`

Expected: 루트 `graphify-out/`이 새 경로를 반영한다.
