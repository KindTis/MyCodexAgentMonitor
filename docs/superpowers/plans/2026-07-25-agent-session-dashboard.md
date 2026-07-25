# Agent Session 대시보드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 선택된 Orbital Dispatch 시안을 바탕으로, 세션 목록에서 실행 상태를 판단하고 선택한 세션의 작업·토큰·태스크·Goal·하위 에이전트를 확인할 수 있는 반응형 콘셉트 대시보드를 구현한다.

**Architecture:** 정적 콘셉트 데이터를 `App.jsx`에 두고, 목록 요약에 필요한 계산만 `agent-model.js`의 순수 함수로 유지한다. 세션 선택과 하위 에이전트 상세 열기, Codex 연결 안내는 React 로컬 상태로 처리한다.

**Tech Stack:** React 19, Vite, CSS, Phosphor Icons, Node.js test runner

**제약:** 현재 작업공간은 Git 저장소가 아니므로 커밋 단계는 수행하지 않는다. 실시간 Codex 연동은 범위에서 제외하고 콘셉트 데이터임을 UI에 표시한다.

---

### Task 1: 목록 요약 모델을 실제 세션 구조에 맞춘다

**Files:**
- Modify: `prototype/tests/agent-model.test.mjs`
- Modify: `prototype/src/agent-model.js`

**Step 1: 실패하는 테스트 작성**

`getPlanProgress()`가 완료/전체/현재 태스크만 반환하고, `getSessionMetrics()`가 스킬 수·태스크 요약·Goal 상태·활성 하위 에이전트 수를 계산하는 테스트를 작성한다.

**Step 2: 실패 확인**

Run: `npm.cmd test`

Expected: `getSessionMetrics` 미구현 또는 반환 구조 불일치로 실패.

**Step 3: 최소 구현**

```js
export function getSessionMetrics(session) {
  const plan = getPlanProgress(session.plan);
  const children = session.children ?? [];

  return {
    skills: session.skills?.length ?? 0,
    tasks: plan.total ? { completed: plan.completed, total: plan.total } : null,
    goalStatus: session.goal?.status ?? null,
    subagents: {
      active: children.filter((child) => child.status !== "complete").length,
      total: children.length,
    },
  };
}
```

**Step 4: 테스트 통과 확인**

Run: `npm.cmd test`

Expected: 모든 모델 테스트 통과.

### Task 2: 세션 목록과 상세 패널을 시안대로 교체한다

**Files:**
- Modify: `prototype/src/App.jsx`
- Modify: `prototype/src/styles.css`
- Modify: `prototype/AGENTS.md`

**Step 1: 세션 데이터와 목록 구현**

8개의 서로 다른 상황(실행 중, 하위 에이전트 대기, 사용자 입력 대기, 계획 중, 완료)을 담은 콘셉트 데이터를 구성한다. 목록에는 에이전트, 세션/할당 작업, 상태/현재 활동, 세션 시간, 스킬, 태스크, Goal, 하위 에이전트를 표시한다.

**Step 2: 선택 상세 구현**

선택한 세션의 현재 작업, 토큰 사용량, 사용 스킬, 태스크 목록, Goal 상세, 하위 에이전트 표와 최근 활동을 표시한다. 하위 에이전트 행은 키보드와 포인터로 상세를 열 수 있게 한다.

**Step 3: 반응형 스타일 구현**

1440px에서는 레퍼런스의 조밀한 운영 현황판을 재현하고, 좁은 화면에서는 세션 목록을 가로 스크롤로 보존하며 상세 패널을 세로로 쌓는다. 상태는 색상뿐 아니라 텍스트와 아이콘으로도 구분한다.

**Step 4: 제품 방향 기록**

`prototype/AGENTS.md`의 시각 방향을 선택 시안 기준으로 갱신하고, 콘셉트 데이터와 실시간 연동 제외 범위를 기록한다.

### Task 3: 빌드와 브라우저에서 검증한다

**Files:**
- Create: `prototype/design-qa.md`

**Step 1: 정적 검증**

Run: `npm.cmd test`

Expected: 모든 테스트 통과.

Run: `npm.cmd run build`

Expected: Vite 및 Sites 빌드 완료.

**Step 2: 브라우저 상호작용 검증**

개발 서버를 열고 다음을 확인한다.

- 다른 세션을 선택하면 상세 데이터가 갱신된다.
- 하위 에이전트 행을 선택하면 해당 상세가 열린다.
- `Open in Codex`가 실시간 연동 전임을 알리는 피드백을 표시한다.
- 1440px 및 모바일 폭에서 정보가 잘리거나 겹치지 않는다.
- 브라우저 콘솔 오류가 없다.

**Step 3: 디자인 QA**

레퍼런스와 구현 스크린샷을 비교해 레이아웃, 밀도, 타이포그래피, 색상, 상호작용을 확인하고 `prototype/design-qa.md`에 결과를 기록한다. 차이가 있으면 수정 후 다시 검증하며 마지막 줄을 `final result: passed`로 남긴다.

**Step 4: 지식 그래프 갱신**

Run: `graphify update .`

Expected: 변경된 UI와 모델 관계가 `graphify-out/`에 반영된다.
