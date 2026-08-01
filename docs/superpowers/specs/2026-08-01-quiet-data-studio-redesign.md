# Quiet Data Studio 시각 재설계 명세

## 1. 목표

`My Codex Agent Monitor`의 정보 구조와 동작을 유지하면서 `Orbital Dispatch` 화면을 선택된 `Quiet Data Studio Refined` 시안에 맞게 재설계한다. 사용자는 장시간 모니터링 중에도 루트 세션, 현재 작업, 상태, Goal, Plan Tasks, Child Agents, Token Usage를 빠르게 구분해 읽을 수 있어야 한다.

시각 기준 이미지는 [`assets/orbital-dispatch-quiet-data-studio.png`](../../../assets/orbital-dispatch-quiet-data-studio.png)이며 원본 크기는 1738×905px이다.

## 2. 범위

포함:

- Geist Sans 중심의 타이포그래피 계층과 Geist Mono의 제한적 사용
- 네이비·슬레이트 표면, 인디고 주조색, 민트·앰버·코랄 상태색
- 설치된 Phosphor Icons를 이용한 일관된 18px 아이콘 체계
- 루트 세션 목록의 네 구획 구조와 선택 상태 개선
- 상세 영역의 35% / 35% / 30% 열 배치
- Current Work 40% / Recent Activity 60%
- Goal 30% / Child Agents 70%
- Plan Tasks 60% / Applied Skills 20% / Token Usage 20%
- 글로벌 활동 보드와 Child Agent 대화상자의 동일 디자인 토큰 적용
- 기존 반응형·키보드·포커스·Live/Paused 동작 유지

제외:

- 서버 API, 스냅샷 모델, 정렬 로직 변경
- 새 페이지, 차트, KPI 카드, 진행률, Execution Trace, Plan Milestones
- 새 의존성 또는 별도 이미지 에셋

## 3. 시각 시스템

- 배경: `#090D15`
- 기본 표면: `#0F1520`
- 상승 표면: `#151D2A`
- 선택 표면: `#1B2740`
- 기본 텍스트: `#F5F7FA`
- 보조 텍스트: `#BEC6D2`
- 메타데이터: `#8D98A8`
- 구분선: `#283344`
- 인디고: `#718BFF`
- 바이올렛: `#9A82F4`
- 실행·완료 민트: `#49D5AD`
- 진행 앰버: `#F2B84B`
- 주의 코랄: `#EF7284`

본문은 14px을 기준으로 하고 선택 세션 제목은 23px, 주요 값과 에이전트 이름은 15~16px을 사용한다. 브랜치, ID, 시각, 도구명, 토큰·비용 값만 Geist Mono를 사용한다. 작은 텍스트는 12px 미만으로 낮추지 않는다.

## 4. 구성과 상태 표현

데스크톱은 왼쪽 루트 세션 목록과 오른쪽 상세 화면의 master-detail 구성을 유지한다. 상세는 세 열로 나누고 카드 중첩 대신 여백과 한 줄 구분선으로 영역을 나눈다.

상태는 색상만으로 구분하지 않는다. 모든 상태에 아이콘, 텍스트 레이블, 형태를 함께 제공한다. 선택 행은 3px 인디고 레일과 절제된 표면 틴트만 사용한다. 현재 Plan Task는 전체 행의 옅은 앰버 표면으로 강조하고 완료 항목의 텍스트 대비를 유지한다.

`Current Work` 단계는 다섯 개 독립 카드가 아니라 하나의 낮은 대비 레일로 보인다. `Recent Activity`는 연결선, 이벤트 아이콘, 시각, 작업명의 정렬로 읽는다. 빈 `Applied Skills`는 큰 일러스트 대신 작은 아이콘과 한 줄 안내만 표시한다.

## 5. 동작과 접근성

기존 데이터 흐름, Live/Paused, 정렬, 세션 선택·해제, Child Agent 대화상자, 포커스 복귀, 업데이트 모션을 변경하지 않는다. `prefers-reduced-motion`에서는 상태·값 애니메이션을 제거한다. 버튼과 행의 `focus-visible` 윤곽은 인디고로 명확하게 표시한다.

## 6. 성공 기준

- 새 시각 계약 테스트가 구현 전 실패하고 구현 후 통과한다.
- 기존 전체 테스트가 통과한다.
- `npm run build`와 `npm run test:sites`가 통과하고 Sites 산출물이 존재한다.
- 1738×905 동일 상태에서 구현 캡처와 기준 이미지를 비교한 `design-qa.md`가 `final result: passed`로 끝난다.
- 글로벌 보드, 작은 화면, Child Agent 대화상자의 기존 기능이 회귀하지 않는다.
