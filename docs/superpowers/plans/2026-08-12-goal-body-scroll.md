# Goal 본문 내부 스크롤 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 긴 Goal 문자열을 카드 내부에서 스크롤하고 인접한 Recent activity와 Child agents 영역의 크기를 유지한다.

**Architecture:** 루트 세션 Goal 카드의 헤더 아래 기존 콘텐츠만 `goal-card-body`로 감싼다. 바깥 카드와 CSS Grid 행 크기는 유지하고, 새 본문 요소만 flex 자식이자 세로 스크롤 컨테이너로 만든다.

**Tech Stack:** React 19 JSX, CSS Grid/Flexbox, Node.js 내장 테스트 러너

## Global Constraints

- 데스크톱 상세 2열의 Goal 25% / Recent activity 40% / Child agents 35% 비율을 유지한다.
- Goal 제목과 상태는 고정하고 목표 내용·토큰·사용 시간만 세로 스크롤한다.
- Child Agent 상세 대화상자의 기존 스크롤 동작은 변경하지 않는다.
- 새 의존성, 컴포넌트, 공통 추상화를 추가하지 않는다.
- 문서는 UTF-8 BOM 없이 유지한다.

---

### Task 1: 루트 Goal 본문 스크롤 경계

**Files:**
- Modify: `tests/layout-contract.test.mjs`
- Modify: `src/App.jsx:1057-1076`
- Modify: `src/styles.css:1280-1285, 1347-1360, 1602-1609`

**Interfaces:**
- Consumes: `session.goal.objective`, `session.goal.tokensUsed`, `session.goal.tokenBudget`, `session.goal.timeUsedSeconds`
- Produces: 루트 Goal 카드 내부의 `.goal-card-body` 스크롤 컨테이너

- [ ] **Step 1: 실패하는 레이아웃 계약 테스트 작성**

`tests/layout-contract.test.mjs`에 다음 테스트를 추가한다. 이 테스트가 잡는 회귀는 Goal 본문 래퍼 또는 스크롤 속성이 제거되어 긴 내용이 잘리거나 Grid 행을 침범하는 경우다.

```js
test("루트 Goal은 카드 크기를 유지하고 본문만 내부 스크롤한다", () => {
  const detail = app.slice(
    app.indexOf("function SessionDetail"),
    app.indexOf("export function App"),
  );
  const goalStart = detail.indexOf('className={`detail-card goal-card');
  const goalEnd = detail.indexOf("</article>", goalStart);
  const goal = detail.slice(goalStart, goalEnd);

  assert.ok(goalStart >= 0, "missing root Goal card");
  assert.ok(goal.indexOf('className="card-header"') < goal.indexOf('className="goal-card-body"'));

  const body = declarations(".goal-card-body");
  assert.match(body, /min-height: 0/);
  assert.match(body, /flex: 1/);
  assert.match(body, /overflow-y: auto/);
  assert.match(declarations(".detail-card"), /overflow: hidden/);
  assert.match(
    declarations(".detail-column--context"),
    /grid-template-rows: minmax\(0, 25fr\) minmax\(0, 40fr\) minmax\(0, 35fr\)/,
  );
});
```

- [ ] **Step 2: 테스트가 올바른 이유로 실패하는지 확인**

Run: `node --test tests/layout-contract.test.mjs`

Expected: FAIL. `.goal-card-body`가 아직 없다는 메시지가 출력되어야 한다.

- [ ] **Step 3: 최소 JSX와 CSS 구현**

`src/App.jsx`에서 루트 세션에 Goal이 있을 때만 기존 콘텐츠를 감싼다.

```jsx
{session.goal ? (
  <div className="goal-card-body">
    <h3>{session.goal.objective}</h3>
    <p>
      Tokens {formatTokenCount(session.goal.tokensUsed)}
      {" / "}
      {formatTokenCount(session.goal.tokenBudget)}
    </p>
    <small>Time used · {formatDuration(session.goal.timeUsedSeconds)}</small>
  </div>
) : (
  <p className="empty-copy">This session is not operating under a Goal.</p>
)}
```

`src/styles.css`에 본문 스크롤을 추가하고, 중첩 후에도 기존 문단과 시간 스타일을 유지한다.

```css
.detail-card > p,
.goal-card-body > p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.goal-card-body {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-color: var(--line-strong) transparent;
  scrollbar-width: thin;
}

.goal-card > small,
.goal-card-body > small {
  display: block;
  margin-top: 12px;
  padding-top: 9px;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font: 11px/1.35 "Geist Mono Variable", monospace;
}
```

- [ ] **Step 4: 집중 테스트 통과 확인**

Run: `node --test tests/layout-contract.test.mjs`

Expected: 모든 레이아웃 계약 테스트 PASS.

- [ ] **Step 5: 전체 회귀 검증**

Run: `npm test`

Expected: 모든 단위 테스트 PASS.

Run: `npm run build`

Expected: Exit code 0이며 `dist/client/index.html`, `dist/server/index.js`, `dist/.openai/hosting.json` 생성.

Run: `npm run test:sites`

Expected: 모든 Sites 테스트 PASS.

- [ ] **Step 6: 지식 그래프 갱신**

Run: `graphify update .`

Expected: 변경된 `src/App.jsx`, `src/styles.css`, `tests/layout-contract.test.mjs`가 그래프에 반영되고 명령이 Exit code 0으로 끝난다.

- [ ] **Step 7: 구현 커밋**

```bash
git add src/App.jsx src/styles.css tests/layout-contract.test.mjs graphify-out
git commit -m "fix: scroll long goal content"
```
