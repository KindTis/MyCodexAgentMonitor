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
