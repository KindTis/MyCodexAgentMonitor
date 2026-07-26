# Child agent 상태 스냅샷 신뢰성 개선 설계

## 1. 목적

이 문서는 [로컬 Codex 실시간 현황판 설계](./2026-07-26-local-codex-live-monitor-design.md)의 child agent 수집과 상태 판정 규칙을 보완한다. 두 문서가 충돌하면 child agent 발견, JSONL 증분 처리, 상태 근거와 오류 복구에는 이 문서를 우선 적용한다.

Codex CLI와 Desktop의 실행 방식을 바꾸지 않으면서 `My Codex Agent Monitor`가 child agent의 실제 활동을 가능한 한 정확하게 반영하도록 한다. 사용자는 모니터를 위해 `codex --remote`를 사용하거나 별도 데몬과 연결 설정을 관리하지 않아야 한다.

## 2. 문제와 원인

현재 스냅샷에는 다음 세 문제가 있다.

1. 모니터가 실행한 별도 App Server는 이미 실행 중인 다른 Codex 프로세스의 메모리 상태를 소유하지 않는다. 따라서 `notLoaded`나 `interrupted`는 실제 child agent의 현재 상태와 다를 수 있다.
2. JSONL 증분 배치에 `task_started`가 없으면 이전 배치에서 시작된 현재 Turn을 이어받지 못해, 해당 배치의 대기·도구·활동 이벤트가 현재 상태에서 누락될 수 있다.
3. child agent 발견 경로가 하나뿐이면 App Server의 자손 조회 또는 `thread_spawn` 기록 중 한쪽에만 나타나는 agent를 놓칠 수 있다. 반대로 내부 관리용 `guardian`까지 사용자 child agent로 표시될 수 있다.

별도 App Server의 상태를 실제 Codex 프로세스의 권위 있는 실시간 상태로 간주하는 것으로는 이 문제를 해결할 수 없다.

## 3. 성공 기준

- 기존 Codex CLI와 Desktop 사용법을 변경하지 않는다.
- Turn 시작과 후속 활동이 서로 다른 JSONL 배치에 있어도 이벤트를 누락하지 않는다.
- 별도 App Server의 `notLoaded`와 `interrupted`가 최근 JSONL 활동을 잘못 덮어쓰지 않는다.
- 명시적으로 관찰한 상태와 시간 기반 추정 상태를 구분한다.
- 사용자 작업으로 생성된 child agent를 두 발견 경로에서 합치고 내부 `guardian`은 제외한다.
- 수집 실패 시 읽지 않은 이벤트를 잃지 않고 마지막 정상 스냅샷을 유지한다.

## 4. 범위

포함:

- 기존 App Server 카탈로그와 세션 JSONL을 결합하는 읽기 전용 수집
- JSONL Turn 문맥의 배치 간 유지
- child agent 발견 결과 병합과 중복 제거
- 상태 근거 `observed`와 `inferred`
- 관련 수집기·모델 회귀 테스트

제외:

- `codex --remote` 사용 강제
- 공유 WebSocket App Server 운영
- Codex CLI, Desktop, 사용자 설정 변경
- SQLite 또는 실행 중인 Codex 프로세스 메모리 직접 접근
- 새 데몬, 서비스, 런타임 의존성
- 상태 정확도를 가장한 새로운 진행률이나 ETA

## 5. 검토한 접근

### 5.1 선택: 무설정 하이브리드 수집

현재처럼 App Server는 Thread 식별자, 부모 관계, Turn과 Goal 같은 카탈로그 정보에 사용한다. 실제 진행 상태는 JSONL의 구조화된 생명주기와 활동 이벤트를 우선 사용한다. 두 결과는 기존 `SnapshotStore`에서 합친다.

장점은 Codex 실행 방식을 바꾸지 않고 현재 코드 경로를 고쳐 사용할 수 있다는 점이다. 한계는 다른 프로세스의 권위 있는 메모리 상태를 직접 구독하지 못하므로 일부 상태가 시간 기반 추정으로 남는다는 점이다.

### 5.2 제외: 공유 WebSocket App Server

PoC에서 하나의 `codex app-server --listen ws://...`에 복수 관찰자가 연결하고 같은 Thread 목록을 읽는 것은 가능했다. 그러나 실제 작업 상태까지 공유하려면 Codex CLI도 해당 서버에 `--remote`로 연결해야 한다. Windows에서는 App Server daemon 생명주기도 지원되지 않았다.

기술적으로 가능하지만 사용자가 모니터를 위해 Codex 실행 방식을 바꿔야 하므로 채택하지 않는다.

### 5.3 보류: hooks 이벤트 브리지

App Server보다 직접적인 이벤트를 받을 가능성은 있지만 사용자 설정과 지원 이벤트 검증이 추가로 필요하다. 선택한 방식으로 해결되지 않는 실제 누락이 확인되기 전에는 구현하지 않는다.

## 6. 전체 구조

새 계층은 만들지 않고 기존 구성 요소의 책임을 명확히 한다.

- App Server client: Thread ID, 부모 관계, Turn, Goal과 종료 상태의 보조 증거를 읽는다.
- JSONL tailer와 reducer: 순서가 보존된 생명주기·활동 이벤트와 현재 Turn 문맥을 유지한다.
- `SnapshotStore`: 두 결과를 thread ID로 병합하고 child 목록과 최종 상태를 만든다.
- 클라이언트: 기존 상태 표현을 유지하며 추정 상태에만 작은 인라인 `추정` 표시를 붙인다.

App Server의 `notLoaded`와 `interrupted`는 단독으로 실행 상태를 확정하는 입력이 아니다.

## 7. 데이터 흐름

### 7.1 JSONL 증분 처리

Reducer는 Thread별 현재 Turn ID를 배치 밖에서도 유지한다.

1. `task_started`를 만나면 해당 Turn을 현재 Turn으로 설정하고 이전 Turn의 미해결 상태를 초기화한다.
2. 뒤따르는 레코드는 같은 증분 배치에 `task_started`가 없더라도 저장된 현재 Turn에 적용한다.
3. `task_complete`, 구조화된 실패·취소·중단을 만나면 현재 Turn을 종료한다.
4. 새 `task_started`가 오면 종료 상태의 Thread도 다시 실행 상태로 전환할 수 있다.
5. 알 수 없는 이벤트는 무시하되 뒤의 정상 이벤트 처리를 막지 않는다.

완전한 JSONL 줄로 구성된 배치를 끝까지 처리하고 스냅샷 병합까지 성공한 뒤에만 읽기 위치를 확정한다. 처리 실패 시 이전 위치와 마지막 정상 스냅샷을 유지하고 다음 수집에서 같은 배치를 다시 처리한다. 불완전한 마지막 줄은 기존처럼 다음 수집까지 보류한다.

### 7.2 child agent 발견

등록 후보는 다음 결과의 합집합이다.

- App Server에서 부모 또는 자손 관계로 확인한 Thread
- 부모 세션의 명시적 `thread_spawn` 활동에서 확인한 Thread

후보를 thread ID로 중복 제거한다. `subAgent.other`가 `guardian`인 내부 관리 Thread는 표시하지 않는다. 한 경로에서만 발견된 사용자 child agent도 등록하며, 이후 다른 경로에서 같은 ID가 확인되면 기존 항목을 갱신한다.

## 8. 상태 판정

기존 상태 이름을 유지하고 다음 근거 우선순위를 적용한다.

1. 현재 Turn의 명시적인 완료·실패·취소·중단
2. 해결되지 않은 사용자 입력 또는 승인 요청
3. 활성 `wait_agent` 또는 child agent 결과 대기
4. 계획, 추론, 도구 실행 같은 구조화된 현재 활동
5. 최근 JSONL 활동 시각에 따른 실행 또는 유휴 추정
6. App Server의 보조 정보

이전 Turn의 대기나 승인 상태는 새 Turn에 적용하지 않는다. 명시적 종료 뒤 새 `task_started`가 확인되면 새 Turn 상태가 우선한다.

App Server가 반환한 완료·실패·취소는 reducer가 추적하는 최신 Turn과 ID가 일치할 때 명시적 종료 근거로 사용할 수 있다. `notLoaded`와 `interrupted`처럼 별도 App Server의 소유 여부에 따라 달라지는 값은 이 규칙에 포함하지 않는다.

각 스냅샷 상태에는 다음 필드를 추가한다.

```text
statusBasis: observed | inferred
```

- `observed`: 현재 Turn의 구조화된 생명주기, 대기 또는 활동 이벤트가 직접 근거인 상태
- `inferred`: 최근 활동 시각이나 불완전한 App Server 정보만으로 판정한 상태

`notLoaded` 또는 `interrupted`만 확인된 경우에는 기존의 최근 활동·유휴 시간 규칙으로 상태를 정하고 `inferred`로 표시한다. 이 값만으로 최근 활동 중인 Thread를 중단 상태로 바꾸지 않는다.

세션 시간은 기존 규칙을 유지한다. 명시적 종료 시 멈추며 사용자·승인·child agent 대기 시간은 누적하지 않는다. 추정 상태에서는 확인되지 않은 작업 시간을 새로 만들어 내지 않는다.

## 9. 화면 계약

상태 이름과 child agent 상세 구조는 유지한다. `statusBasis === "inferred"`일 때만 상태 텍스트 옆에 `추정`을 작은 인라인 표시로 제공한다.

별도 오버레이, hover 전용 정보, 새 상세 패널은 추가하지 않는다. `observed`는 추가 표식 없이 현재 상태만 표시한다.

## 10. 오류 처리

- App Server 읽기 실패: JSONL과 마지막 정상 카탈로그로 만들 수 있는 스냅샷을 유지하고 연결 오류를 기록한다.
- JSONL 배치 처리 실패: 읽기 위치를 진행시키지 않고 다음 주기에 재시도한다.
- 개별 알 수 없는 이벤트: 해당 이벤트만 무시한다.
- child 상세 조회 실패: 이미 등록된 child의 마지막 정상 값을 유지한다.
- 모니터 프로세스가 이전 코드로 계속 실행 중인 경우: 배포나 개발 검증 전에 재시작해 현재 코드와 실행 프로세스를 일치시킨다.

오류 복구를 위해 새 영속 저장소나 별도 재시도 큐는 추가하지 않는다.

## 11. 검증

최소 회귀 테스트는 다음 사례를 고정한다.

1. `task_started`가 첫 배치에 있고 `wait_agent`나 도구 활동이 다음 배치에 있어도 현재 Turn 상태가 갱신된다.
2. `notLoaded + interrupted`가 최근 JSONL 실행 활동을 중단 상태로 덮어쓰지 않는다.
3. 명시적 완료·실패·취소·중단이 현재 Turn과 세션 시간을 종료한다.
4. 새 `task_started`가 종료된 Thread를 다시 실행 상태로 전환한다.
5. 자손 조회와 `thread_spawn`에서 찾은 child를 합치고 ID 중복을 제거한다.
6. 내부 `guardian`을 child 목록에서 제외한다.
7. 구조화된 이벤트 상태는 `observed`, 시간 기반 상태는 `inferred`로 반환한다.
8. 배치 처리 실패 후 같은 이벤트가 다음 수집에서 다시 처리된다.

회귀 명령:

```text
npm test
npm run build
npm run test:sites
```

마지막으로 모니터 서버를 현재 코드로 재시작하고 실제 child agent를 실행해 다음을 확인한다.

- 실행·대기·완료 전환이 다음 수집 주기에 반영된다.
- 새로 생성된 child agent가 상세 목록에 한 번만 나타난다.
- 내부 `guardian`이 보이지 않는다.
- 근거가 불완전한 상태에만 `추정`이 표시된다.
- 브라우저 콘솔과 서버 로그에 새 오류가 없다.

## 12. 결정 사항

- Codex CLI와 Desktop의 실행 방식은 변경하지 않는다.
- 공유 App Server 연결은 사용하지 않는다.
- App Server는 카탈로그와 보조 증거, JSONL은 활동과 생명주기의 주된 근거로 사용한다.
- 내부 `guardian`은 사용자 child agent 목록에서 제외한다.
- 불확실성을 숨기지 않고 `statusBasis`로 전달하되 화면에는 필요한 경우에만 `추정`을 표시한다.
- 새로운 설정, 데이터베이스 접근, 서비스와 의존성을 추가하지 않는다.
