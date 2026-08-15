# Quiet Data Studio 디자인 QA

## 비교 증거

- 레퍼런스: `assets/orbital-dispatch-quiet-data-studio.png` (1738×905)
- 구현 캡처: `artifacts/quiet-data-studio-implementation.png` (1738×905)
- 동일 입력 비교: `artifacts/quiet-data-studio-comparison.png`
- 모바일 캡처: `artifacts/quiet-data-studio-mobile.png`

## 1차 비교

| 심각도 | 영역 | 발견 내용 | 조치 |
| --- | --- | --- | --- |
| P1 | 반응형 | 760px 이하에서도 1180px용 8열 목록과 `min-width: 1160px`가 유지되어 내부 가로 스크롤이 발생했다. | 760px 이하에서 4단 세션 카드 레이아웃을 복원하고 가로 스크롤을 제거했다. 회귀 테스트를 추가했다. |

## 2차 비교 결과

- P0/P1/P2 미해결 항목 없음.
- Geist Sans/Mono 역할, Phosphor 아이콘, 네이비 표면과 인디고·민트 상태색, 단일 선택 레일, 구분선 중심 카드 구조가 레퍼런스 의도와 일치한다.
- 데스크톱 상세는 35/35/30 열과 40/60, 30/70, 60/20/20 행 비율을 유지한다.
- 레퍼런스보다 넓은 좌측 목록은 프로젝트의 명시된 25% 마스터 패널 계약을 따른다.
- Goal, Plan Tasks, Child Agents의 빈 영역은 실제 선택 세션 데이터가 비어 있기 때문이며 임의 데이터나 진행률을 만들지 않았다.

## 반응형·동작·접근성

- 1120px 경계: 문서/본문 가로 오버플로 없음, 상세 2열, Plan Tasks 열 전체 폭.
- 455px 모바일: 문서 및 세션 목록 가로 오버플로 없음, 세션 4단 카드와 상세 1열.
- 브라우저에서 세션 선택, 상세 닫기 후 글로벌 보드 복귀, Live/Paused 스냅샷 제어를 확인했다.
- 버튼의 키보드 포커스 표시, 의미 있는 접근성 이름, reduced-motion 규칙을 유지했다.

# 사용량 히스토리 디자인 QA

## 비교 기준

- 기준안: `C:/Users/tatis/Repos/MyCodexAgentMonitor/.superpowers/brainstorm/234-1786781291/content/ribbon-field-v3-line-only.html`
- 구현 화면: `http://127.0.0.1:4311/`
- 비교 환경: 동일 Edge 세션, 1695 × 820 뷰포트, 30D와 선택일이 표시된 상태

## 확인 결과

- 공통 네이비 셸, 외곽선, 반경, 간격, Geist/Phosphor 규격을 유지했다.
- 시안 캡슐형 Token 막대와 우측 축, 앰버 Cost 선·노드와 좌측 축을 기준안과 동일한 정보 역할로 배치했다.
- Cost 영역 채우기와 장식용 글로우는 없다.
- 선택일 레인과 Token 내림차순 세션 목록이 실제 `ccusage` 데이터로 표시된다.
- 좌측 `Agent Sessions` 목록을 유지하고 히스토리를 세션 상세와 같은 우측 영역에 배치했으며, 공통 `X` 버튼으로 닫는다.
- 기준안과의 의도된 차이는 승인된 상단바 유지와 30일 실제 데이터 밀도뿐이다.

## 동작 확인

- 상단 `Tokens · Cost` hover/focus 시 묶음 전체에 공통 패널 배경과 외곽선이 표시되고 라벨 밑줄은 없다.
- 7D는 7개 날짜를 표시하고 이전 기간 이동 후 Next가 활성화된다.
- 날짜 선택 시 요약과 세션 목록이 선택일 기준으로 갱신된다.
- 다른 날짜 hover 시 해당 Cost와 Tokens 툴팁만 표시되며 선택일과 세션 목록은 유지된다.
- `X`로 닫으면 기존 글로벌 또는 세션 상세로 돌아가고 상단 진입 버튼으로 포커스가 복귀한다. 재진입 기본값은 30D다.
