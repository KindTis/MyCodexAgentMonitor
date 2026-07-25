# 디자인 QA

## 비교 대상

- 시각 기준: `C:\Users\tatis\.codex\generated_images\019f98b1-8c68-7b52-9df5-ee78f7df4713\exec-4a03fc65-9b96-4d4a-8cc1-0d9b0e181e13.png`
- 구현 캡처: `C:\Users\tatis\Repos\MyCodexAgentMonitor\docs\design-qa\formal-page-1440x1024.png`
- 전체 비교: `C:\Users\tatis\Repos\MyCodexAgentMonitor\docs\design-qa\formal-page-comparison.png`
- 상세 집중 비교: `C:\Users\tatis\Repos\MyCodexAgentMonitor\docs\design-qa\qa-comparison-detail.png`
- 모바일 캡처: `C:\Users\tatis\Repos\MyCodexAgentMonitor\docs\design-qa\qa-mobile-five-rows.png`
- 뷰포트: 데스크톱 1440 × 1024 CSS px, 모바일 390 × 844 CSS px
- 픽셀/밀도 정규화: 기준 1487 × 1058 px를 구현 캡처 1425 × 1013 px에 맞춰 정규화했다. 모바일 전체 페이지 캡처는 375 × 2016 px이다.
- 상태: `Planner / dashboard-redesign` 선택, `Operational order`, `Demo mode`, Live `Calling tool` 단계

## Findings

- 최종 비교에서 조치가 필요한 P0/P1/P2 차이는 없다.
- 기준의 조밀한 세션 원장, 선택 행, 3열 상세, 토큰·태스크·Goal·하위 에이전트 계층과 어두운 관제형 팔레트가 유지됐다.
- 상위 목록이 8행에서 6행으로 줄어든 것은 확정된 “루트 세션만 표시” 규칙에 따른 의도적 차이다. 하위 세션은 선택 상세에서만 보인다.
- 정렬 버튼, `Live / Paused`, 상대 활동 시각과 Live step은 기존 밀도를 유지한다.
- 상위 목록은 헤더를 제외하고 정확히 5행(225px)으로 고정되며, 초과 행은 내부 스크롤된다. 상세 시작 위치는 세션 수와 관계없이 유지된다.
- `Concept` 배지와 프로토타입 카피를 제거해 정식 애플리케이션 헤더로 단순화했으며, 시뮬레이션 여부는 운영 제어 옆의 `Demo mode`와 푸터에서만 명확하게 알린다.

## 필수 충실도 점검

- 폰트와 타이포그래피: Geist/Geist Mono의 조밀한 운영 UI를 유지한다. 목록 주·보조 텍스트, 상태, 숫자, 상세 제목과 Live step이 구분되며 긴 문자열은 말줄임 또는 상세 영역 줄바꿈으로 처리된다.
- 간격과 레이아웃: 5행 고정 목록과 3열 상세가 1440 × 1024 첫 화면에 함께 들어온다. 모바일 상세는 1열로 전환되고 상위 원장은 내부 가로·세로 스크롤을 유지한다.
- 색상과 토큰: 광물성 검정 배경, 청록 실행/선택, 호박색 대기, 붉은 관심 필요 상태가 기준 팔레트 안에서 일관된다.
- 이미지와 에셋: 사진·일러스트가 없는 운영 UI이며 모든 아이콘은 Phosphor 아이콘을 사용한다. 임의 SVG나 대체 이미지가 없다.
- 카피와 콘텐츠: 루트 세션, Plan Task, Goal, 사용자 입력 대기, 하위 에이전트와 `Demo mode` 시뮬레이션 범위가 화면에서 구분된다.
- 상태와 접근성: 정렬 헤더는 버튼과 `aria-sort`, Live 제어는 `aria-pressed`, 선택 행은 `aria-selected`를 제공한다. 반복 모션은 `prefers-reduced-motion`에서 비활성화된다.

## 비교 이력

### 이전 구현

- 별도 소개 영역과 높은 목록 행으로 상세가 밀리던 P1을 제거했다.
- 상세 카드의 과도한 분절과 `Open in Codex` 위치 불일치 P2를 제거했다.

### 이번 구현

- 전체 비교: `formal-page-comparison.png`
- 상세 집중 비교: `qa-comparison-detail.png`
- 관심 필요 우선 정렬 때문에 행 순서가 달라지고 Live step이 추가됐지만, 기준의 비율·경계·밀도·시각 계층은 유지됐다.
- 정식 앱 승격으로 `Concept` 배지만 제거했으며 브랜드, 목록, 상세의 비율에는 변화가 없다.
- 새 기능으로 인한 P0/P1/P2 시각 회귀는 발견되지 않았다.

## 브라우저 검증

- 기본 운영 순서에서 `needs_input`이 먼저, 실행 중·대기·비활성·완료가 뒤따름.
- 문서 제목은 `Orbital Dispatch — My Codex Agent Monitor`, 화면에는 `Concept`, `Prototype`, `Sample feed`가 없고 `Demo mode`가 표시됨.
- `Open in Codex` 선택 시 `Demo mode is using a simulated Codex App Server snapshot.` 안내가 표시됨.
- Agent 오름차순 정렬 후에도 `dashboard-redesign` 선택이 유지됨.
- `Operational order` 선택 시 관심 필요 우선 순서로 복귀함.
- 데이터 행 영역의 표시 높이 225px, 전체 행 높이 270px로 측정돼 정확히 5행만 노출되고 6번째 행은 내부 스크롤됨.
- Agent 정렬로 선택된 Planner가 6번째로 이동하면 목록 `scrollTop`이 45px로 조정돼 선택 행이 자동 노출됨.
- `Paused`에서 샘플 시각과 스냅샷이 4.5초 동안 고정되고, `Live` 복귀 후 이벤트가 다시 반영됨.
- 결정적 이벤트 후 Planner의 태스크가 `4/7`, 하위 에이전트가 `1/3`, Builder가 완료 handoff 상태로 함께 갱신됨.
- 하위 Builder 선택 시 현재 작업과 사용 스킬 상세가 열림.
- 모바일에서도 목록 높이는 225px이며 Live/정렬 제어가 보이고 문서 전체 가로 오버플로 없이 상세가 1열로 전환됨.
- 브라우저 콘솔 오류 및 경고 없음.

## 후속 P3

- 실제 Codex App Server 연결 시 샘플 이벤트 배열만 실제 스냅샷 구독으로 교체한다.

final result: passed
