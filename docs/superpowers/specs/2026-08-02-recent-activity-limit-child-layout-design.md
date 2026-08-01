# Recent Activity 10개 수집과 Child 상세 위치 교환 설계

## 목표

- 루트와 Child Agent의 Recent activity를 최신순 최대 10개까지 수집한다.
- Child Agent 상세에서 Current work 하단에는 Recent activity를, 오른쪽 독립 카드에는 Recent messages를 표시한다.
- 루트 세션 상세의 배치는 변경하지 않는다.

## 데이터 흐름

`reduceThreadRecords`가 activity를 중복 제거하고 최신순으로 정렬한 뒤 10개만 보존한다. 루트와 Child Agent가 같은 observation 경로를 사용하므로 별도 분기나 설정값은 추가하지 않는다.

## Child Agent 상세 배치

첫 번째 행의 왼쪽 Current work 카드에는 기존 작업 정보와 상태 다음에 Recent activity 목록을 둔다. 첫 번째 행의 오른쪽에는 Recent messages 전용 카드를 둔다. Goal, Tasks, Applied skills의 순서와 기존 60/40 행 비율은 유지한다.

Recent messages의 10개 제한, 3줄 표시, 내부 스크롤, 전체 원문 툴팁과 신규 강조 동작은 그대로 유지한다. Recent activity도 기존 상세 라벨, 내부 스크롤과 신규 강조 동작을 유지한다.

## 검증

- 11개 이상의 activity 입력에서 최신 10개만 최신순으로 남는 수집기 테스트
- Child Agent 상세 DOM에서 Current work 내부 Recent activity가 Recent messages 독립 카드보다 먼저 나오는 UI 테스트
- 기존 레이아웃 계약, 전체 테스트, 프로덕션 빌드와 Sites 테스트
- 헤드리스 브라우저에서 두 영역의 실제 위치와 activity 10개 표시 확인
