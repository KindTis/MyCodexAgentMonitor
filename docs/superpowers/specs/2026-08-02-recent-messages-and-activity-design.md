# 최근 메시지와 활동 상세화 설계

## 목표

선택한 루트 세션에서 최근 agent 메시지를 더 많이 탐색하고 원문을 확인할 수 있게 한다. Recent Activity는 내부 도구명 대신 사용자가 이해할 수 있는 안전한 작업 요약을 표시한다.

## 범위

- 사용자에게 표시된 assistant 메시지 원문을 세션별 최신 10개까지 보존한다.
- 사용자 입력, 추론, 도구 출력, 내부 agent 메시지는 계속 제외한다.
- Current work의 Recent messages 목록은 기존 3줄 clamp를 유지하고 남는 항목은 목록 내부에서 세로 스크롤한다.
- 각 메시지 행은 키보드로 접근 가능한 버튼이다.
- 메시지를 누르면 클릭 좌표 가까이에 전체 원문과 시각을 표시하는 비모달 popover를 연다.
- popover가 열린 뒤 상자 내부를 포함한 아무 곳이나 클릭하거나 `Esc`를 누르면 닫는다.
- Recent Activity는 원시 인자나 결과 대신 도구 입력에서 추출한 한 줄 요약을 표시한다.

## 데이터 흐름

`session-log.mjs`가 `response_item.message`의 `assistant/output_text` 원문과 줄바꿈을 유지하고 최신 10개로 제한한다. 기존 `snapshot-store.mjs` 전달 구조는 그대로 사용한다. 목록의 3줄 축약은 CSS만 담당하므로 popover는 같은 `text`에서 전체 원문을 표시한다.

활동 라벨은 현재 `getToolLabel` 경계에서 만든다. 별도 이벤트 모델은 추가하지 않는다.

- `shell_command`: `Run · npm test`처럼 첫 명령을 제한된 길이로 요약한다.
- `exec`: 감싼 `tools.<name>` 호출을 찾아 `Run · graphify query`, `Update plan · 4 tasks`처럼 표시한다.
- `wait_agent`: `Wait for child agents · up to 30s`처럼 대기 대상과 제한 시간을 표시한다.
- `request_user_input`: `Wait for user input`으로 표시한다.
- 그 밖의 도구: snake_case 도구명을 읽을 수 있는 문장으로 바꾼다.

명령 요약은 한 줄·제한 길이로 자르고 토큰, 비밀번호, 키, 시크릿 형태의 값은 마스킹한다. 도구 결과 본문은 표시하지 않는다.

## 화면과 상호작용

Recent messages의 카드 구조와 시안 색상은 유지한다. 항목은 행 전체가 클릭 가능한 평면 버튼이며 hover와 focus-visible만 기존 선 색으로 구분한다. Floating 글상자는 배경 차단 없이 클릭한 마우스 좌표에서 12px 떨어진 곳에 표시한다. 화면 가장자리에서는 viewport 안쪽으로 위치를 보정하고, 키보드로 연 경우 선택한 행 가까이에 둔다. 너비는 최대 420px, 높이는 최대 320px로 제한하며 긴 원문만 내부 스크롤한다. 기존 Child Agent 상세의 색, 테두리, 글꼴을 재사용하고 원문은 `white-space: pre-wrap`으로 표시한다. 새 장식, 애니메이션, 중첩 카드는 추가하지 않는다.

## 검증

- 11개 assistant 메시지에서 최신 10개 원문과 줄바꿈이 보존되는 reducer 테스트
- user/reasoning/tool/internal 메시지가 제외되는 기존 회귀 테스트
- `exec`, `wait_agent`, `request_user_input`, `shell_command`의 안전한 상세 라벨 테스트
- Recent messages 10개와 클릭 가능한 행을 확인하는 SSR 테스트
- 헤드리스 브라우저에서 목록 내부 스크롤, 3줄 clamp, 마우스 인접 popover의 전체 원문과 viewport 경계 보정, 다음 클릭과 `Esc` 닫기, 콘솔 오류 0건 확인
- 전체 테스트, 프로덕션 빌드, Sites 테스트 실행
