# 반응형 좌우형 모니터 Design QA

- Defect evidence: 사용자가 제공한 1586 × 835 화면 캡처
- Desktop implementation: `docs/design-qa/responsive-session-cards-desktop.png`
- Stacked implementation: `docs/design-qa/responsive-session-cards-stacked.png`
- State: 실제 로컬 Codex snapshot, Live, Operational order, 선택된 실행 중 세션

## Full-view evidence

- 1586 × 835에서 문서 높이와 viewport 높이가 모두 835px이므로 강제 페이지 스크롤이 없다.
- 화면 너비 1552px을 사용하며 좌측 434.5px, 우측 1107.5px로 비례 확장된다.
- 우측 상세의 세 열은 1586px viewport에서 386.9px / 331.6px / 386.9px로 계산되어 35% / 30% / 35% 비율을 이룬다.
- 1920 × 1080에서는 화면 너비 1886px, 좌측 528.1px, 우측 1347.9px로 함께 확장된다.
- 상세 패널의 `overflow-y`는 `visible`이고 내부 열 경계가 패널 하단까지 이어진다.

## Session-card evidence

- 카드는 agent/state, assignment/session time, current activity, metrics의 네 구역으로 분리됐다.
- 첫 줄의 고정 `Codex` / `Root agent` 라벨을 세션 `cwd`의 마지막 폴더명 / 현재 Git 브랜치로 교체했다.
- 실제 snapshot에서 `MyCodexAgentMonitor` / `main`, `Dabom` / `main`, `TransportFactory` / `master`를 확인했다.
- 첫 카드에서 project name의 `clientWidth`와 `scrollWidth`가 모두 137px이므로 이름이 잘리지 않는다.
- current activity와 session time의 경계 상자가 겹치지 않는다.
- metrics 구역은 상단 구분선과 7px 상단 padding, 카드 10px 하단 padding을 가진다.
- 카드 높이는 고정값이 아니라 콘텐츠 기반이며 현재 snapshot에서 약 142.8px이다.

## Responsive evidence

- 1100 × 850에서 목록과 상세가 상하로 전환되고 목록 높이는 실제 4행인 180px이다.
- 상하 배치의 session caret은 90도 회전해 아래를 가리킨다.
- 390 × 844에서 문서 전체의 가로 overflow가 없고 상세 패널 전체 스크롤도 생기지 않는다.
- 데스크톱 caret은 오른쪽을 가리키며 선택 카드는 기존 mint 강조선과 배경을 유지한다.

## Required fidelity surfaces

- 기존 Geist/Geist Mono, operational-control 팔레트, 상태색과 Phosphor 아이콘을 유지했다.
- 세션·작업·상태·활동·시간·Skills·Tasks·Goal·Subagents 정보를 모두 유지했다.
- Current work 열은 Current work → Applied skills → Token usage 순서로 읽힌다.
- Sort, Live/Paused, session selection 동작을 변경하지 않았다.
- 브라우저 console error/warning: 없음.

## Findings

- 기존 P1: 4개 세션에도 7행 최소 높이 728px을 강제해 835px viewport에서 문서가 951px로 늘어났다.
- 수정 후: 목록은 패널의 가용 높이를 사용하고 실제 콘텐츠보다 많은 행을 예약하지 않는다.
- P0/P1/P2 시각 문제는 현재 데스크톱 및 상하 배치 캡처에서 추가로 발견되지 않았다.

final result: passed
