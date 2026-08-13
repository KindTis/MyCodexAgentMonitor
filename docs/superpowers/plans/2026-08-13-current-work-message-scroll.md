# Current Work and Recent Messages Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 루트 상세의 Current work와 Recent messages를 40% / 60%로 고정하고 긴 내용만 각 영역 내부에서 스크롤한다.

**Architecture:** 기존 `current-work-card` 안에 두 개의 고정 비율 영역을 만들고 Current work 본문만 별도 스크롤 컨테이너로 감싼다. 공용 `RecentMessages`와 Child Agent 상세는 변경하지 않고 기존 메시지 목록 스크롤을 재사용한다.

**Tech Stack:** React 19 JSX, CSS Grid/Flexbox, Node.js 내장 테스트 러너

## Global Constraints

- 데스크톱 루트 상세에서 Current work 40% / Recent messages 60%를 유지한다.
- 한 영역의 내용 길이가 다른 영역의 높이를 변경하지 않는다.
- Current work 본문과 Recent messages 목록만 각각 세로 스크롤한다.
- Child Agent 상세와 반응형 열 배치는 변경하지 않는다.
- 새 의존성과 공용 추상화를 추가하지 않는다.

---

### Task 1: 루트 Current work 내부 비율과 스크롤 고정

**Files:**
- Modify: `src/App.jsx:1034-1054`
- Modify: `src/styles.css:1288-1290`
- Test: `tests/layout-contract.test.mjs:79-119`

**Interfaces:**
- Consumes: `RecentMessages({ ownerId, messages, changedMessageIds })`
- Produces: `.current-work-region`, `.current-work-body`, `.current-work-messages` 레이아웃 계약

- [ ] **Step 1: 실패하는 레이아웃 계약 테스트 작성**

```js
test("루트 Current work와 Recent messages는 40/60 비율을 유지하고 각자 내부 스크롤한다", () => {
  assert.match(
    declarations(".current-work-card"),
    /grid-template-rows: minmax\(0, 2fr\) minmax\(0, 3fr\)/,
  );
  assert.match(declarations(".current-work-region"), /min-height: 0/);
  assert.match(declarations(".current-work-region"), /overflow: hidden/);
  assert.match(declarations(".current-work-body"), /overflow-y: auto/);
  assert.match(declarations(".current-work-messages"), /min-height: 0/);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test tests/layout-contract.test.mjs`

Expected: `.current-work-card`의 40/60 행 또는 새 내부 영역 규칙이 없어 FAIL

- [ ] **Step 3: 최소 JSX와 CSS 구현**

```jsx
<article className="detail-card current-work-card">
  <section className="current-work-region current-work-summary">
    <header className="card-header">...</header>
    <div className="current-work-body">...</div>
  </section>
  <section className="current-work-region current-work-messages">
    <RecentMessages ... />
  </section>
</article>
```

```css
.current-work-card {
  display: grid;
  grid-template-rows: minmax(0, 2fr) minmax(0, 3fr);
}

.current-work-region {
  display: flex;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.current-work-body {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
}
```

- [ ] **Step 4: 관련 테스트와 전체 검증 실행**

Run: `node --test tests/layout-contract.test.mjs`

Expected: PASS

Run: `npm.cmd test`

Expected: 전체 PASS

Run: `npm.cmd run build`

Expected: `dist/client/index.html`, `dist/server/index.js`, `dist/.openai/hosting.json` 생성

Run: `npm.cmd run test:sites`

Expected: 전체 PASS

- [ ] **Step 5: 지식 그래프 갱신과 변경 범위 확인**

Run: `graphify update .`

Expected: 변경된 JSX, CSS, 테스트와 문서가 그래프에 반영됨

Run: `git diff --check`

Expected: 출력 없음
