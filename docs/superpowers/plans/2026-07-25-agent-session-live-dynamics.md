# 에이전트 세션 라이브 동작 구현 계획

> **For Codex:** `superpowers:executing-plans` 절차로 각 항목을 순서대로 구현하고 검증한다.

**목표:** 관심 필요 우선 정렬과 균형형 라이브 활동 표현을 기존 Orbital Dispatch 프로토타입에 추가한다.

**구조:** 포함·상태 정규화·정렬·샘플 스냅샷 전이는 `agent-model.js`의 순수 함수가 담당한다. React는 선택, 정렬 기준, Live/Paused와 현재 스냅샷만 관리한다. 시각 피드백은 기존 컴포넌트와 CSS를 확장하고 행 위치 전환에만 GSAP를 사용한다.

**기술:** React 19, Vite, Node test runner, GSAP, Phosphor Icons, CSS.

---

### Task 1: 세션 모델을 테스트 우선으로 확장

**파일**
- 수정: `prototype/tests/agent-model.test.mjs`
- 수정: `prototype/src/agent-model.js`

1. 루트 세션 포함, 상태 정규화, 활성 하위 에이전트 수, 운영 우선순위, 정렬 불변성을 검증하는 실패 테스트를 작성한다.
2. `npm test`가 새 테스트에서 실패하는지 확인한다.
3. 테스트를 통과시키는 최소 순수 함수를 구현한다.
4. 결정적 샘플 이벤트가 원본을 변경하지 않고 상태·토큰·태스크·활동·하위 에이전트를 함께 갱신하는 테스트와 구현을 추가한다.
5. `npm test` 통과를 확인한다.

### Task 2: 목록 정렬과 Live/Paused를 연결

**파일**
- 수정: `prototype/src/App.jsx`
- 수정: `prototype/src/styles.css`

1. 샘플 레코드에 루트 관계와 정렬용 시각을 명시한다.
2. 상위 목록을 루트 세션만 포함하는 운영 순서로 렌더링한다.
3. 각 헤더 정렬 버튼, 방향 표시, `Operational order` 복귀를 구현한다.
4. `Live / Paused` 버튼과 결정적 샘플 스냅샷 타이머를 연결한다.
5. 선택 세션이 재정렬되어도 상세 선택이 유지되는지 확인한다.

### Task 3: 균형형 라이브 활동 표현 추가

**파일**
- 수정: `prototype/src/App.jsx`
- 수정: `prototype/src/styles.css`

1. 목록에 상대 활동 시각, 상태별 실행·대기·관심 필요 표현을 추가한다.
2. 선택 상세에 Live step, 도구 경과 시간, 토큰 변화, 태스크 전환, 최근 활동 삽입을 표시한다.
3. 하위 에이전트 행에 현재 단계, 마지막 활동, 실행 링, handoff 상태를 표시한다.
4. GSAP로 변경 행 강조와 위치 이동을 짧게 처리한다.
5. `prefers-reduced-motion`에서 반복·재정렬 모션을 제거한다.

### Task 4: 검증과 문서 동기화

**파일**
- 수정: `prototype/AGENTS.md`
- 수정: `prototype/design-qa.md`

1. `npm test`, `npm run test:sites`, `npm run build`를 실행한다.
2. 브라우저에서 정렬, Live/Paused, 행 선택, 하위 에이전트 상세, 데스크톱·모바일 레이아웃과 콘솔을 확인한다.
3. 기준 이미지와 같은 뷰포트의 구현 캡처를 함께 비교해 P0/P1/P2를 수정한다.
4. `design-qa.md`를 `final result: passed`로 갱신한다.
5. `graphify update .`를 실행해 지식 그래프를 동기화한다.
