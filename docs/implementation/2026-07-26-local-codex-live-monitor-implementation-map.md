# 로컬 Codex 실시간 현황판 구현 항목 매핑

기준 계획서: `docs/superpowers/plans/2026-07-26-local-codex-live-monitor.md`

## 구현 항목 매핑표

| 구현 항목 ID | 필수 여부 | 구현 계획서 항목 | 계획서 근거 | 수용 기준 | 구현 대상 | 구현 상태 | 검증 방법 | 검증 결과 | 항목 판정 | 보류 사유 |
|---|---|---|---|---|---|---|---|---|---|---|
| IMP-001 | 필수 | 설치된 Codex 프로토콜 계약 확인 | 확인된 로컬 Codex 계약, Task 1 Step 1 | 설치 버전이 `0.145.0`이고 `thread/list`, `thread/read`, `thread/goal/get`, Thread·Turn·Goal 필드가 계획과 일치한다. | 임시 생성 TypeScript 스키마 | 구현 | `codex --version`; `codex app-server generate-ts --experimental` | 통과 | 미판정 |  |
| IMP-002 | 필수 | 읽기 전용 App Server 핸드셰이크와 요청 | Task 1 Steps 2, 4 | 고정 Windows 명령으로 시작하고 experimental 초기화 뒤 허용된 세 읽기 메서드만 JSONL 요청한다. | `monitor/app-server-client.mjs`; `tests/app-server-client.test.mjs` | 구현 | `node --test tests/app-server-client.test.mjs` | 통과 | 미판정 |  |
| IMP-003 | 필수 | App Server 클라이언트 오류·재시작·종료 생명주기 | Task 1 Steps 2, 4 | 모든 요청에 5초 deadline을 적용하고 늦은 응답을 무시하며 timeout·exit·stop 뒤 같은 인스턴스를 재시작한다. 종료 시 생성한 래퍼 PID 트리만 종료한다. | `monitor/app-server-client.mjs`; `tests/app-server-client.test.mjs` | 구현 | timeout·late response·두 child·process tree 테스트 | 통과 | 미판정 |  |
| IMP-004 | 필수 | Codex 홈과 세션 경로 경계 | Task 2 Steps 1, 4 | `CODEX_HOME` 우선, `USERPROFILE/.codex` fallback을 사용하고 홈 밖 경로를 내용 노출 없이 거절한다. `Thread.path === null`인 ephemeral Thread는 JSONL 읽기를 생략하고 App Server Turn만 축약하며 JSONL 전용 값은 비운다. | `monitor/session-log.mjs`; `monitor/snapshot-store.mjs`; `tests/session-log.test.mjs`; `tests/snapshot-store.test.mjs` | 구현 | 경로 해석·경계 오류·`path: null` Turn-only 테스트 | 통과 | 미판정 |  |
| IMP-005 | 필수 | 트랜잭션형 JSONL 증분 tail | Task 2 Steps 1, 4 | 바이트 오프셋, 불완전 마지막 줄 보류, 손상 완결 줄 오류, batch commit/discard와 재읽기를 지원한다. | `monitor/session-log.mjs`; `tests/session-log.test.mjs` | 구현 | 불완전 줄·손상 줄·truncate·batch 재시도 테스트 | 통과 | 미판정 |  |
| IMP-006 | 필수 | 현재 Turn 상태와 도구 호출 상관관계 | Task 2 Steps 2, 5 | 이전 Turn 상태를 버리고 call/output을 연결하며 입력 대기·실패·중단·대기·계획·완료·실행·Idle 우선순위를 적용한다. | `reduceThreadRecords`; `tests/session-log.test.mjs` | 구현 | 현재 Turn 격리·`notLoaded` 입력·호출 완료·종료 시간 테스트 | 통과 | 미판정 |  |
| IMP-007 | 필수 | 작업·스킬·Plan·토큰·활동 정규화 | Task 2 Steps 2, 5 | 구조 블록을 제거한 사용자 작업, `$skill`, Plan 상태, 총 토큰, 최신 활동 4개와 최소 도구 분류를 만들고 질문·결과·reasoning 본문은 복제하지 않는다. | `monitor/session-log.mjs`; `tests/session-log.test.mjs` | 구현 | reducer·분류·민감 본문 비노출 테스트 | 통과 | 미판정 |  |
| IMP-008 | 필수 | 최초 루트 카탈로그 탐색 | Task 3 Steps 1, 3, 5 | 모든 루트 source를 `updated_at desc`로 페이지 순회하고 시작 전 최근 10분 내 미완료 루트만 최초 등록한다. | `monitor/snapshot-store.mjs`; `tests/snapshot-store.test.mjs` | 구현 | source 필터·페이지 경계·오래된/완료 제외 테스트 | 통과 | 미판정 |  |
| IMP-009 | 필수 | 후속 discovery watermark와 빠른 종료 등록 | Task 3 Steps 1, 3, 5 | 성공 refresh 시작 epoch만 watermark로 커밋하고 장애 기간을 되짚으며 시작 이후 생성·새 Turn·`task_started` 증거가 있으면 수집 전 종료돼도 등록한다. | `SnapshotStore`; `tests/snapshot-store.test.mjs` | 구현 | 동률 경계·실패 유지·10분 장애·quick complete 테스트 | 통과 | 미판정 |  |
| IMP-010 | 필수 | 루트 세션 메모리 생명주기 | Task 3 Steps 2, 5 | 등록 세션을 제거하지 않고 10분 후 Idle, terminal duration 고정, 새 Turn에서 Running 복귀를 지원한다. | `SnapshotStore`; `tests/snapshot-store.test.mjs` | 구현 | Idle·terminal·resume 테스트 | 통과 | 미판정 |  |
| IMP-011 | 필수 | 하위 Thread 탐색·등록·집계 | Task 3 Steps 1, 3, 5, 6 | 모든 `subAgent*` source와 다중 페이지 자손을 부모 상세에만 등록하고 토큰을 중복 없이 한 번 합산한다. | `SnapshotStore`; `tests/snapshot-store.test.mjs` | 구현 | 두 번째 하위 페이지·빠른 종료·부모/토큰 테스트 | 통과 | 미판정 |  |
| IMP-012 | 필수 | Goal·wire 조립과 원자적 수집 | Task 3 Steps 2, 5, 6 | Goal null/성공/실패를 구분하고 모든 필수 읽기가 성공할 때만 registry·관찰·offset·watermark·wire를 커밋한다. 실패 시 마지막 정상 세션과 성공 시각을 유지한다. | `SnapshotStore`; `tests/snapshot-store.test.mjs` | 구현 | Goal 없음/실패/복구·실제 Tailer A/B 재읽기 테스트 | 통과 | 미판정 |  |
| IMP-013 | 필수 | 루프백 HTTP API와 정적 제공 | Task 4 Steps 1, 2, 4 | `127.0.0.1:4310`에만 바인딩하고 GET snapshot no-store, 정적 asset, SPA HTML fallback, API 404/405와 경로 이탈 403을 제공한다. | `monitor/server.mjs`; `tests/monitor-server.test.mjs` | 구현 | API·asset·fallback·method·path·EADDRINUSE 테스트 | 통과 | 미판정 |  |
| IMP-014 | 필수 | 단일 3초 수집 루프와 JSONL 오류 복구 | Task 4 Steps 2, 5 | 겹치지 않는 `setTimeout` 하나로 정확히 3초마다 수집하며 세션 읽기 실패는 같은 child와 Store를 유지해 다음 주기에 복구한다. | `monitor/server.mjs`; `tests/monitor-server.test.mjs` | 구현 | 가짜 timer·초기/후속 collect·중복 timer 테스트 | 통과 | 미판정 |  |
| IMP-015 | 필수 | App Server 백오프 재시작 | Task 4 Steps 2, 5 | App Server 오류에서 1·2·4·최대 5초로 같은 client를 재시작하고 Store·registry·offset·watermark를 보존한다. | `monitor/server.mjs`; `tests/monitor-server.test.mjs` | 구현 | 두 child·장애 중 quick complete·복구 테스트 | 통과 | 미판정 |  |
| IMP-016 | 필수 | 단일 monitor 명령·브라우저·종료 | Task 4 Steps 2, 5, 6 | `npm run monitor`가 build 후 HTTP bind에 성공한 다음 App Server를 시작하고, listen 완료 뒤 `--open`일 때만 브라우저를 연다. SIGINT/SIGTERM에서 timer·HTTP·자신의 App Server 트리만 정리하며 포트 대체는 하지 않는다. | `monitor/server.mjs`; `package.json`; `tests/monitor-server.test.mjs` | 구현 | monitor server 종료·spawn·실제 실행과 점유 포트에서 App Server·브라우저 미호출 및 잔류 래퍼 없음 테스트 | 통과 | 미판정 |  |
| IMP-017 | 필수 | 원시 값 표시 포맷 | Task 5 Steps 1, 3 | duration, token, Goal 상태, UTC 시각을 요구된 표시 문자열로 바꾸고 결측은 `—`로 표시한다. | `src/agent-model.js`; `tests/agent-model.test.mjs` | 구현 | formatter 단위 테스트 | 통과 | 미판정 |  |
| IMP-018 | 필수 | 스냅샷 변경 비교 | Task 5 Steps 1, 3 | 토큰·Task·child·handoff·activity 변경만 안정 ID로 계산하고 첫 루트는 강조하지 않으며 입력을 변경하지 않는다. | `getSnapshotChanges`; `tests/agent-model.test.mjs` | 구현 | 이전/다음 snapshot 비교 테스트 | 통과 | 미판정 |  |
| IMP-019 | 필수 | React 3초 폴링과 Live/Paused 적용 | Task 6 Steps 1~4 | API를 즉시·3초마다 no-store로 폴링하고 최신/적용 snapshot을 분리한다. Paused 중에도 최신 snapshot과 `feedStatus`는 갱신하되 표시 화면은 고정하고, Live 복귀 시 최신 하나만 적용한다. fetch 자체가 실패하면 표시 세션을 유지하고 연결 상태만 Error로 바꾼다. | `src/App.jsx`; `tests/app-identity.test.mjs` | 구현 | identity 테스트와 Paused 중 feed 갱신·fetch 실패 표시 보존·Live 복귀 브라우저 확인 | 자동 검증 통과; Task 7 브라우저 대기 | 미판정 |  |
| IMP-020 | 필수 | 상위 목록 실제 wire 전환과 목록 동작 보존 | Task 6 Steps 4, 5, 7 | 실제 루트 세션만 기존 운영 순서와 열 정렬로 표시한다. 상위 행은 `Codex / Root agent`, `currentActivity.label`, `durationSeconds`, `startedAt`, skills 수, Plan 완료/전체, Goal 상태, active/total child 수를 사용한다. 선택 유지·5행 내부 스크롤·reduced motion을 보존한다. | `SessionRow`; `src/App.jsx`; `src/styles.css`; `src/agent-model.js`; 기존 모델·identity 테스트 | 구현 | 실제 wire 필드 identity/렌더 검사와 회귀 테스트·브라우저 정렬/선택/높이 확인 | 자동 검증 통과; Task 7 브라우저 대기 | 미판정 |  |
| IMP-021 | 필수 | 루트 상세 wire 직접 소비 | Task 6 Step 5 | 현재 작업·활동·duration·tokens·skills·Plan·Goal을 계약 필드로 안전하게 표시하고 없는 영역은 빈 상태로 렌더링한다. | `src/App.jsx`; `src/agent-model.js` | 구현 | identity 테스트·비어 있지 않은 wire 렌더·브라우저 확인 | 자동 검증 통과; Task 7 브라우저 대기 | 미판정 |  |
| IMP-022 | 필수 | 하위 에이전트 상세과 handoff 강조 | Task 6 Step 5 | child wire의 nickname/role/work/tokens/skills/plan/goal을 사용하고 새로 완료된 handoff만 한 번 강조한다. | `ChildAgents`; `SessionDetail`; 모델 diff | 구현 | handoff diff 테스트·브라우저 child 상세 확인 | 자동 검증 통과; Task 7 브라우저 대기 | 미판정 |  |
| IMP-023 | 필수 | 최근 활동 안정 key와 변경 강조 | Task 6 Step 5 | `activity.id`를 key, `activity.at`을 UTC 시각, `activity.label`을 본문으로 쓰고 새 활동만 한 번 강조한다. | `src/App.jsx`; `getSnapshotChanges` | 구현 | identity·diff 테스트·React 경고 확인 | 자동 검증 통과; Task 7 브라우저 대기 | 미판정 |  |
| IMP-024 | 필수 | 연결 상태·딥 링크·실제 데이터 정체성 | Task 6 Steps 1, 5, 6 | Demo fixture를 제거하고 Connected/Syncing/Error와 마지막 정상 수집 시각을 표시하며 클릭 시 `codex://threads/{threadId}`를 연다. | `src/App.jsx`; `src/styles.css`; `tests/app-identity.test.mjs` | 구현 | identity 테스트·브라우저 딥 링크/상태 확인 | 자동 검증 통과; Task 7 브라우저 대기 | 미판정 |  |
| IMP-025 | 필수 | 자동 회귀·Sites·보호 파일 제약 | 전역 제약, Tasks 1~7 검증 단계 | 새 런타임 의존성 없이 전체 테스트와 build/Sites 테스트가 통과하고 세 Sites 산출물이 존재하며 네 보호 파일은 수정되지 않는다. | 전체 변경; `package.json`; 보호 파일 | 미착수 | `npm test`; `npm run build`; `npm run test:sites`; `git diff` | 미검증 | 미판정 |  |
| IMP-026 | 필수 | 실제 모니터와 API 계약 검증 | Task 7 Steps 2, 3 | 실제 App Server/JSONL로 Connected snapshot을 제공하고 상위에는 루트만, 하위에는 올바른 parent ID와 상태를 표시한다. | 실제 `npm run monitor`; `/api/snapshot` | 미착수 | 프로세스·API PowerShell 점검 | 미검증 | 미판정 |  |
| IMP-027 | 필수 | 브라우저 상호작용 종단 검증 | Task 7 Step 4 | 계획의 12개 목록·정렬·Live/Paused·Idle·재개·child·딥 링크·콘솔·reduced motion 항목을 확인한다. | 실제 브라우저 | 미착수 | 계획의 12단계 수동/자동 브라우저 확인 | 미검증 | 미판정 |  |
| IMP-028 | 필수 | 실제 복구·포트 충돌·종료 격리 | Task 7 Steps 5, 6 | App Server만 종료했을 때 Error→Connected로 복구하고 포트 충돌에서 실패하며 Ctrl+C 후 listener와 생성 프로세스만 사라진다. | 실제 Windows 프로세스·서버 | 미착수 | CIM·TCP·process 점검 | 미검증 | 미판정 |  |
| IMP-029 | 필수 | 지식 그래프 갱신 | Task 7 Steps 7, 8 | `graphify update .` 결과가 새 monitor 모듈과 App 연결을 반영하고 추적 산출물만 변경된다. | `graphify-out/` | 미착수 | `graphify update .`; graph query/diff | 미검증 | 미판정 |  |
| IMP-030 | 필수 | 로컬 읽기 전용 신뢰 경계 | 전역 제약, 확정된 MVP 신뢰 경계 | Codex 파일·DB에 쓰지 않고 LAN·원격·인증 기능 없이 고정 loopback read-only snapshot만 제공하며 오류 wire에 stderr·본문·추론을 넣지 않는다. | `monitor/` 전체; API wire | 미착수 | 허용 메서드·bind·경로·wire·diff 검토와 테스트 | 미검증 | 미판정 |  |

## 구현 가정

- 현재 설치된 Codex는 계획 작성 시와 같은 `codex-cli 0.145.0`이며 생성 타입으로 계약 일치를 재확인했다.
- 사용자가 현재 폴더에서 Git 저장소와 작업 브랜치를 만들도록 명시했으므로 별도 worktree는 만들지 않고 `agent/local-codex-live-monitor` 브랜치를 사용한다.
- 계획서의 `superpowers:subagent-driven-development` 권장은 MyLoop 게이트가 금지하므로 `superpowers:executing-plans`로 실행한다.
- 구현 계획서에 필수/선택 구분이 없으므로 모든 항목을 필수로 처리한다.
- 실제 UI는 기존 `App.jsx` 컴포넌트 구조와 CSS를 유지하고 별도 표시 모델 계층을 추가하지 않는다.

## 변경 기준점

- 저장소 루트: `C:\Users\tatis\Repos\MyCodexAgentMonitor`
- 작업 브랜치: `agent/local-codex-live-monitor`
- 시작 커밋: `1de7382084599ecbd6fe435cf47ccf0f752d91ea`
- 초기 staged 경로: 없음
- 초기 unstaged 경로: 없음
- 초기 untracked 경로: 없음
- 이번 루프가 생성하거나 수정한 경로: `docs/implementation/2026-07-26-local-codex-live-monitor-implementation-map.md`, `monitor/app-server-client.mjs`, `monitor/session-log.mjs`, `monitor/snapshot-store.mjs`, `monitor/server.mjs`, `package.json`, `src/App.jsx`, `src/agent-model.js`, `src/styles.css`, `tests/agent-model.test.mjs`, `tests/app-identity.test.mjs`, `tests/app-server-client.test.mjs`, `tests/monitor-server.test.mjs`, `tests/session-log.test.mjs`, `tests/snapshot-store.test.mjs`
- 이번 루프 중 생성한 커밋: `145aa2e feat: add read-only Codex app server client`, `2e42460 feat: tail and normalize Codex session logs`, `19286a8 feat: assemble live Codex session snapshots`, `0c330d4 feat: run the monitor on a loopback server`, `98d6da8 feat: compare and format live snapshots`

## 보류 항목

- 없음.

## 구현 계획서 모순

- 계획서는 작성 당시 `.git` 메타데이터가 없다고 기록했지만, 사용자가 저장소 초기화·기준 커밋·push·작업 브랜치 생성을 명시해 시작 전에 해소했다.
- 계획서가 권장한 하위 에이전트 구현 방식과 MyLoop의 금지 규칙은 `superpowers:executing-plans` 선택으로 해소했다.

## 검증 요약

- `codex --version`: `codex-cli 0.145.0`.
- `codex app-server generate-ts --experimental`: 계획의 필수 메서드와 필드 확인.
- 기준 커밋 전 `npm test`: 16개 통과.
- 기준 커밋 전 `npm run build`: 통과, Sites 산출물 생성.
- 기준 커밋 전 `npm run test:sites`: 4개 통과.
- Task 1 RED: `node --test tests/app-server-client.test.mjs`가 `ERR_MODULE_NOT_FOUND`로 예상 실패.
- Task 1 GREEN: `node --test tests/app-server-client.test.mjs` 8개 통과.
- Task 1 회귀: `npm test` 24개 통과.
- Task 2 RED: `node --test tests/session-log.test.mjs`가 `ERR_MODULE_NOT_FOUND`로 예상 실패.
- Task 2 GREEN: `node --test tests/session-log.test.mjs` 10개 통과.
- Task 2 회귀: `npm test` 34개 통과.
- Task 3 RED: `node --test tests/snapshot-store.test.mjs`가 `ERR_MODULE_NOT_FOUND`로 예상 실패.
- Task 3 GREEN: `node --test tests/snapshot-store.test.mjs` 9개 통과.
- Task 3 회귀: `npm test` 43개 통과.
- Task 4 RED: `node --test tests/monitor-server.test.mjs`가 `ERR_MODULE_NOT_FOUND`로 예상 실패.
- Task 4 GREEN: `node --test tests/monitor-server.test.mjs` 5개 통과.
- Task 4 회귀: `npm test` 48개 통과.
- Task 4 빌드: `npm run build` 통과.
- Task 4 Sites: `npm run test:sites` 4개 통과.
- Task 5 RED: `node --test tests/agent-model.test.mjs`가 새 formatter export 부재로 예상 실패.
- Task 5 GREEN: `node --test tests/agent-model.test.mjs` 14개 통과.
- Task 5 회귀: `npm test` 51개 통과.
- Task 5 빌드: `npm run build` 통과.
- Task 6 RED: `node --test tests/app-identity.test.mjs`가 `/api/snapshot` 부재와 기존 Demo fixture 때문에 예상 실패.
- Task 6 GREEN: `node --test tests/app-identity.test.mjs` 2개 통과.
- Task 6 회귀: `npm test` 51개 통과.
- Task 6 빌드: `npm run build` 통과.
- Task 6 Sites: `npm run test:sites` 4개 통과.

## 남은 리스크

- 실제 로컬 JSONL 사건 형태와 App Server 프로세스 재시작은 단위 테스트뿐 아니라 Task 7 실제 실행으로 확인해야 한다.
- 브라우저 종단 검증 중 `codex://` 딥 링크는 운영체제 프로토콜 등록 상태의 영향을 받을 수 있다.
