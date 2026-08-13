# Current Work Copy-Only Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 루트 Current work에서 작업 문자열만 세로 스크롤하고 제목 표시줄·단계 아이콘·구분선·상태 행은 고정한다.

**Architecture:** 기존 `current-work-summary` flex 열은 유지한다. 별도 래퍼를 추가하지 않고 작업 제목 또는 빈 상태 요소에 `current-work-copy`를 부여해 남은 높이와 스크롤을 전담하게 하며, `LiveStep`과 `work-state`는 그 형제로 둔다.

**Tech Stack:** React 19 JSX, CSS Flexbox, Node.js 내장 테스트 러너, Playwright CLI

## Global Constraints

- 데스크톱 루트 상세에서 Current work 40% / Recent messages 60%를 유지한다.
- 작업 문자열만 줄바꿈과 세로 내부 스크롤을 사용한다.
- 제목 표시줄, 단계 아이콘, 구분선, 상태 행은 스크롤하지 않는다.
- 가로 스크롤을 표시하지 않는다.
- Recent messages와 Child Agent 상세는 변경하지 않는다.
- 새 의존성과 공용 추상화를 추가하지 않는다.

---

### Task 1: Current work 문자열 전용 스크롤

**Files:**
- Modify: `src/App.jsx:1035-1052`
- Modify: `src/styles.css:1294-1305`
- Test: `tests/layout-contract.test.mjs:98-125`

**Interfaces:**
- Consumes: `session.currentWork.title`, `LiveStep`, `StatusBadge`
- Produces: `.current-work-copy` 문자열 전용 스크롤 계약

- [ ] **Step 1: 실패하는 레이아웃 계약 테스트 작성**

```js
assert.match(card, /className="current-work-copy"/);
assert.ok(card.indexOf('className="current-work-copy"') < card.indexOf("<LiveStep"));
assert.doesNotMatch(card, /className="current-work-body"/);

const copy = declarations(".current-work-copy");
assert.match(copy, /min-height: 0/);
assert.match(copy, /flex: 1/);
assert.match(copy, /overflow-x: hidden/);
assert.match(copy, /overflow-y: auto/);
assert.match(copy, /overflow-wrap: anywhere/);
```

- [ ] **Step 2: 테스트가 기존 전체 본문 스크롤 구조에서 실패하는지 확인**

Run: `node --test tests/layout-contract.test.mjs`

Expected: `.current-work-copy`가 없고 `.current-work-body`가 남아 있어 FAIL

- [ ] **Step 3: 문자열 요소만 스크롤하도록 최소 구현**

```jsx
{session.currentWork ? (
  <h3 className="current-work-copy">{session.currentWork.title || "No current work"}</h3>
) : (
  <p className="empty-copy current-work-copy">No active Turn was observed.</p>
)}
<LiveStep session={session} clock={clock} collectedAt={collectedAt} />
<div className="work-state">...</div>
```

```css
.current-work-copy {
  min-height: 0;
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  overflow-wrap: anywhere;
}
```

기존 `.current-work-body` 규칙과 JSX 래퍼는 제거한다.

- [ ] **Step 4: 관련 테스트와 원래 브라우저 재현을 검증**

Run: `node --test tests/layout-contract.test.mjs`

Expected: PASS

Playwright 검증:
- 긴 문자열의 `scrollHeight > clientHeight`
- 문자열의 `scrollTop` 변경 전후 제목 표시줄·단계 아이콘·상태 행 좌표가 동일
- 문자열의 `overflow-x`가 `hidden`
- Current work / Recent messages 높이가 40% / 60%

- [ ] **Step 5: 전체 검증과 그래프 갱신**

Run: `node --test --test-concurrency=1 tests/*.test.mjs`

Expected: 전체 PASS

Run: `npm.cmd run build`

Expected: 프로덕션 빌드 성공

Run: `npm.cmd run test:sites`

Expected: 전체 PASS

Run: `graphify update .`

Expected: 변경된 JSX, CSS, 테스트와 문서가 그래프에 반영됨

Run: `git diff --check`

Expected: 출력 없음
