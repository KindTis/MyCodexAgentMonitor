# 서브 에이전트 최근 메시지와 활동 설계

## 목표

서브 에이전트 상세의 Current work 아래에 루트 세션 상세와 동일한 Recent messages를 표시한다. Recent activity도 루트와 같은 상세 라벨과 신규 항목 강조를 사용한다. 기존 Child Agent dialog의 배치와 나머지 카드 구성은 바꾸지 않는다.

## 데이터 흐름

- `buildChild()`가 수집된 `observation.messages` 원문을 child snapshot의 `messages`로 복제한다.
- 메시지 수집 규칙은 기존 루트와 같다. 사용자에게 표시된 assistant 메시지만 최신순 10개까지 유지하고 사용자 입력·추론·도구 출력·내부 agent 메시지는 제외한다.
- `getSnapshotChanges()`는 이전 root snapshot의 child를 ID로 찾아 child별 `activityIds`와 `messageIds`를 계산한다.
- 첫 snapshot과 새로 발견된 child의 기존 항목은 강조하지 않는다. 이전 snapshot에도 있던 child에서 새로 추가된 activity와 message만 강조한다.
- Child Agent dialog는 선택된 child의 변경 ID만 받는다. 해당 child가 변경 정보에 없으면 빈 배열을 사용한다.

## UI 구조와 상호작용

- 루트 상세에 있는 메시지 목록과 floating 글상자를 `RecentMessages` 공용 컴포넌트로 추출해 루트와 child가 같은 구현을 사용한다.
- 컴포넌트 입력은 owner ID, `messages`, `changedMessageIds`뿐이다. 데이터가 없으면 기존 빈 상태 문구를 표시한다.
- Child Agent Current work의 상태 행 아래에 `Recent messages` 헤더와 메시지 목록을 둔다.
- 목록은 최신순 최대 10개를 내부 스크롤하며 항목당 최대 3줄을 표시한다.
- 메시지 행을 누르면 마우스 가까이에 전체 원문과 시각을 표시한다. 화면 가장자리에서는 viewport 안으로 보정하고 다음 pointer 입력이나 `Esc`로 닫는다. 키보드 입력은 선택 행 가까이에 표시한다.
- 새 메시지는 기존 `message-item--updated`, 새 activity는 기존 `activity-item--updated` 효과를 그대로 사용한다. 새 색상·동작·애니메이션은 추가하지 않는다.
- 각 popover ID에는 owner ID를 포함해 루트와 child dialog가 동시에 DOM에 있어도 중복되지 않게 한다.

## Recent activity

- child activity는 이미 공용 session log 수집기를 거치므로 `Run · <명령>`, `Wait for child agents`, `Update plan · N tasks` 같은 상세 라벨과 비밀값 마스킹을 그대로 사용한다.
- Child Agent dialog의 activity 행에는 선택 child의 신규 `activityIds`를 적용한다.
- 활동의 최대 개수, 정렬, 빈 상태 문구는 기존 동작을 유지한다.

## 범위와 오류 처리

- Child Agent dialog의 Goal, Tasks, Applied skills, 크기와 카드 순서는 변경하지 않는다.
- child에 `messages`, activity 변경 정보가 없으면 빈 배열로 처리한다.
- 기존 루트 메시지 동작은 공용 컴포넌트 추출 전후에 동일해야 한다.
- 메시지는 React 텍스트로 렌더링하며 HTML로 해석하지 않는다.

## 검증

- snapshot store 테스트: child snapshot에 최근 메시지 원문이 포함된다.
- agent model 테스트: 기존 child의 신규 activity/message ID만 감지하고 첫 snapshot과 새 child는 강조하지 않는다.
- SSR UI 테스트: Child Agent Current work 아래에 메시지 10개, 클릭 가능한 행, 새 메시지와 activity 강조가 표시된다.
- 회귀 테스트: 루트 상세의 메시지 10개, 3줄 제한과 강조가 유지된다.
- 헤드리스 브라우저: Child Agent dialog에서 목록 내부 스크롤, 전체 원문 글상자, viewport 보정, pointer와 `Esc` 닫기, 콘솔 오류 0건을 확인한다.
- 전체 테스트, 프로덕션 빌드, Sites 테스트와 `git diff --check`를 실행한다.
