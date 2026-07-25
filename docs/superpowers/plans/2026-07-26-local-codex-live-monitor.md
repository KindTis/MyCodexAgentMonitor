# 로컬 Codex 실시간 현황판 구현 계획

> **에이전트 작업자용:** 필수 하위 스킬로 `superpowers:subagent-driven-development`(권장) 또는 `superpowers:executing-plans`를 사용해 이 계획을 태스크별로 구현한다. 진행 추적에는 체크박스(`- [ ]`)를 사용한다.

**목표:** 동일 Windows PC에서 실행 중인 실제 Codex 루트 세션과 하위 에이전트를 읽기 전용으로 수집해 기존 `Orbital Dispatch` 화면에 3초마다 반영하고, `npm run monitor` 한 번으로 빌드·서버·브라우저 실행을 완료한다.

**구조:** `codex app-server --listen stdio://`의 Thread 카탈로그와 `CODEX_HOME` 세션 JSONL의 관찰 사건을 `threadId`로 합쳐 메모리 기반 `SnapshotStore`를 만든다. 로컬 Node 서버는 `127.0.0.1:4310`에서 정적 빌드와 `/api/snapshot`만 제공하고, React는 최신 스냅샷 적용·선택·정렬·Live/Paused·변경 강조만 관리한다.

**기술 스택:** Node.js ESM 표준 모듈, Codex App Server JSONL/stdio, React 19, Vite 6, Node 내장 테스트 러너, 기존 GSAP·Phosphor Icons·CSS.

## 전역 제약

- 로컬 HTTP 서버는 정확히 `127.0.0.1:4310`에만 바인딩한다.
- 수집 주기는 정확히 3초, 미완료 세션의 Idle 경계는 정확히 10분이다.
- 새 런타임 의존성을 추가하지 않는다.
- App Server에는 `initialize`, `thread/list`, `thread/read`, `thread/goal/get`만 요청한다.
- `CODEX_HOME`과 Codex SQLite·JSONL에는 쓰지 않는다.
- 서버 메모리 목록은 프로세스 수명 동안만 유지하며 등록된 세션을 시간 경과로 제거하지 않는다.
- 서버 시작 전 완료·실패·취소·중단됐거나 10분 이상 갱신되지 않은 세션은 최초 등록하지 않는다.
- 서버 시작 이후 시작·재개된 루트와 하위 Thread는 다음 수집 전에 종료됐더라도 등록한다.
- 상위 목록에는 루트 Thread만 표시하고 하위 Thread는 선택된 부모 상세에만 표시한다.
- 화면은 헤더를 제외한 정확히 5개 데이터 행 높이, 기존 정렬·선택·접근성·상태 모션을 유지한다.
- 진행률, ETA, 내부 추론, 확인되지 않은 상태·스킬을 생성하지 않는다.
- `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, `tests/sites-worker.test.mjs`는 수정하지 않는다.
- Sites 빌드 결과 `dist/client/index.html`, `dist/server/index.js`, `dist/.openai/hosting.json`을 유지한다.
- MVP는 개인이 관리하는 Windows PC의 현재 사용자와 그 사용자가 실행한 로컬 프로세스를 신뢰한다.
- HTTP 서버는 `127.0.0.1`에만 바인딩하고 읽기 전용 스냅샷만 제공하며, LAN·원격 공개와 인증·권한 기능은 지원하지 않는다.
- 현재 작업 경로에는 `.git` 메타데이터가 없다. 아래 커밋 단계는 Git 체크아웃에서 실행할 때 수행하며, 이 환경에서는 각 테스트 통과를 체크포인트로 사용한다.

## 확정된 MVP 신뢰 경계

이 모니터는 개인용·로컬 전용·읽기 전용 도구다. 현재 Windows 사용자와 같은 사용자 권한으로 실행되는 로컬 프로세스를 신뢰하며, 같은 PC의 다른 사용자·프로세스를 적대적 주체로 가정한 격리는 MVP 범위에 포함하지 않는다.

- 서버는 정확히 `127.0.0.1:4310`에만 바인딩한다.
- App Server와 세션 JSONL은 읽기 전용으로 수집한다.
- `/api/snapshot`은 읽기 전용 조회만 제공한다.
- LAN 바인딩, 원격 접속, 외부 공개는 지원하지 않는다.
- 인증·권한·사용자별 접근 제어는 MVP에서 제외한다.

## 확인된 로컬 Codex 계약

구현 시작 시 아래 명령으로 설치된 버전의 계약을 다시 확인한다. 계획 작성 시 확인한 버전은 `codex-cli 0.145.0`이다.

```powershell
codex --version
$schemaDir = Join-Path $env:TEMP "my-codex-monitor-schema"
New-Item -ItemType Directory -Force -Path $schemaDir | Out-Null
codex app-server generate-ts --experimental --out $schemaDir
rg -n "thread/list|thread/read|thread/goal/get" $schemaDir
```

`0.145.0`에서 확인한 필드는 다음과 같다.

- `thread/list`: `cursor`, `limit`, `sortKey: "updated_at"`, `sortDirection: "desc"`, `sourceKinds`, `ancestorThreadId`, `nextCursor`
- `sourceKinds` 생략·빈 배열은 전체가 아니라 대화형 source만 반환한다. 루트 조회는 `cli`, `vscode`, `exec`, `appServer`, `unknown`, 하위 조회는 다섯 `subAgent*` 종류를 명시한다.
- `thread/read`: `{ threadId, includeTurns: true }`
- `Thread`: `id`, `sessionId`, `parentThreadId`, `preview`, `createdAt`, `updatedAt`, `status`, `path`, `cwd`, `agentNickname`, `agentRole`, `name`, `turns`
- `Turn`: `id`, `items`, `status`, `startedAt`, `completedAt`, `durationMs`
- `thread/goal/get`: `{ threadId }` → `{ goal: ThreadGoal | null }`
- `ThreadGoal`: `objective`, `status`, `tokenBudget`, `tokensUsed`, `timeUsedSeconds`, `createdAt`, `updatedAt`
- Goal API와 `Thread.path`를 사용하기 위해 `initialize.params.capabilities.experimentalApi`를 `true`로 보낸다.
- 초기화 완료 알림은 생성된 `ClientNotification` 타입과 같은 `{ method: "initialized" }`이며 `params`를 넣지 않는다.
- 현재 Windows npm 설치에서 `codex`는 PowerShell shim이며 Node의 `spawn("codex", ...)`는 `ENOENT`, `spawn("codex.cmd", ...)`는 `EINVAL`로 실패한다. 고정된 `cmd.exe /d /s /c codex.cmd app-server --listen stdio://` 명령으로만 자식 프로세스를 시작한다.

지원 중인 설치 버전에서 위 메서드나 필드가 사라졌으면 구현을 계속하지 않고 스펙과 계획을 먼저 갱신한다. 생성된 바인딩은 임시 검증 자료이며 프로젝트에 복사하지 않는다.

## 파일 구조

### 새 파일

- `monitor/app-server-client.mjs`: App Server 자식 프로세스, JSONL 요청/응답, 초기화, 읽기 전용 메서드
- `monitor/session-log.mjs`: Codex 홈 해석, JSONL 증분 tail, 현재 Turn 사건 정규화
- `monitor/snapshot-store.mjs`: 최초 등록, 실행 중 등록, Idle·종료·재개 생명주기, Goal·하위 에이전트·토큰 조립
- `monitor/server.mjs`: HTTP 정적/API 서버, 3초 수집 루프, 최대 5초 App Server 재시도, 브라우저·종료 관리
- `tests/app-server-client.test.mjs`: App Server 핸드셰이크·요청 상관관계·프로세스 종료 검증
- `tests/session-log.test.mjs`: Codex 홈·불완전 JSONL·현재 Turn·도구·Plan·스킬 정규화 검증
- `tests/snapshot-store.test.mjs`: 등록 생명주기·상태 우선순위·하위 에이전트·집계·오류 유지 검증
- `tests/monitor-server.test.mjs`: 루프백 HTTP·API·정적 파일·SPA fallback·포트 충돌 검증

### 수정 파일

- `package.json`: `monitor` 스크립트 추가
- `src/agent-model.js`: 데모 전이 제거, 원시 숫자·시각 표시와 스냅샷 변경 비교 추가
- `tests/agent-model.test.mjs`: 실제 스냅샷 wire와 변경 강조 테스트로 교체
- `src/App.jsx`: 정적 세션·시뮬레이션 타이머 제거, `/api/snapshot` 폴링과 실제 연결 상태 연결
- `src/styles.css`: Connected·Syncing·Error 상태의 최소 시각 차이만 추가
- `tests/app-identity.test.mjs`: `Demo mode` 제거, 실제 API와 Codex 딥 링크 사용 검증

## 스냅샷 wire 계약

서버와 클라이언트가 공유할 직렬화 계약은 아래 형태로 고정한다. React 컴포넌트·아이콘·색상·포맷된 숫자는 포함하지 않는다.

```js
{
  collectedAt: "2026-07-26T06:00:03.000Z",
  lastSuccessfulAt: "2026-07-26T06:00:03.000Z",
  connectionStatus: "connected", // syncing | connected | error
  errorCode: null,               // APP_SERVER_UNAVAILABLE | SESSION_READ_FAILED
  sessions: [{
    id: "thread-uuid",
    parentSessionId: null,
    threadId: "thread-uuid",
    session: "Thread title",
    cwd: "C:\\repo",
    assignedWork: "사용자가 요청한 실제 작업",
    status: "running",
    currentActivity: {
      step: "Testing",
      label: "npm test",
      startedAt: "2026-07-26T05:59:58.000Z"
    },
    lastActivityAt: "2026-07-26T06:00:02.000Z",
    startedAt: "2026-07-26T05:45:00.000Z",
    endedAt: null,
    durationSeconds: 903,
    currentWork: {
      turnId: "turn-uuid",
      title: "사용자가 요청한 실제 작업"
    },
    tokens: {
      root: 1200,
      children: 400,
      total: 1600
    },
    skills: ["superpowers:using-superpowers"],
    plan: {
      tasks: [
        { title: "수집기 구현", status: "active" }
      ]
    },
    goal: {
      objective: "실제 목표",
      status: "active",
      tokenBudget: 10000,
      tokensUsed: 1600,
      timeUsedSeconds: 903,
      updatedAt: "2026-07-26T06:00:00.000Z"
    },
    children: [],
    activity: [{
      id: "event-id",
      at: "2026-07-26T06:00:02.000Z",
      kind: "test",
      label: "npm test"
    }]
  }]
}
```

`children` 항목은 다음 필드를 사용한다. 루트 전용 `children`과 집계된 `tokens` 대신 자기 Thread의 원시 토큰 수를 가진다.

```js
{
  id: "child-thread-uuid",
  threadId: "child-thread-uuid",
  parentSessionId: "thread-uuid",
  agentNickname: "reviewer",
  agentRole: "review",
  status: "waiting",
  currentActivity: {
    step: "Waiting",
    label: "wait_agent",
    startedAt: "2026-07-26T06:00:01.000Z"
  },
  lastActivityAt: "2026-07-26T06:00:02.000Z",
  startedAt: "2026-07-26T05:58:00.000Z",
  endedAt: null,
  durationSeconds: 122,
  tokens: 400,
  skills: [],
  plan: null,
  goal: null,
  currentWork: {
    turnId: "child-turn-uuid",
    title: "부모가 위임한 실제 작업"
  }
}
```

---

### Task 1: 버전 계약을 고정하고 읽기 전용 App Server 클라이언트 작성

**파일:**

- 생성: `monitor/app-server-client.mjs`
- 생성: `tests/app-server-client.test.mjs`

**인터페이스:**

- 소비: 로컬 `codex` 실행 파일, stdio JSONL
- 생산: `AppServerClient.start()`, `listThreads(params)`, `readThread(threadId)`, `getGoal(threadId)`, `stop()`
- 생산: `AppServerExitedError`, `AppServerProtocolError`, `AppServerTimeoutError`
- 생명주기: 동일 `AppServerClient` 인스턴스에서 `start → timeout/exit/stop → start` 재호출 가능

- [ ] **Step 1: 설치된 Codex의 프로토콜 계약 확인**

다음 명령을 실행한다.

```powershell
codex --version
$schemaDir = Join-Path $env:TEMP "my-codex-monitor-schema"
New-Item -ItemType Directory -Force -Path $schemaDir | Out-Null
codex app-server generate-ts --experimental --out $schemaDir
Get-Content "$schemaDir\v2\ThreadListParams.ts"
Get-Content "$schemaDir\v2\ThreadReadParams.ts"
Get-Content "$schemaDir\v2\ThreadGoalGetResponse.ts"
```

예상: 앞의 “확인된 로컬 Codex 계약”에 적힌 메서드와 필드가 존재한다.

- [ ] **Step 2: 핸드셰이크와 읽기 메서드를 검증하는 실패 테스트 작성**

`tests/app-server-client.test.mjs`에 `node:stream`의 `PassThrough`와 `node:events`의 `EventEmitter`를 사용한 가짜 자식 프로세스를 만든다. 테스트는 서버 응답을 `stdout`에 밀어 넣고 클라이언트가 `stdin`에 쓴 JSONL을 검사한다.

```js
function createFakeAppServerProcess() {
  const child = new EventEmitter();
  child.pid = 1234;
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {
    child.emit("exit", 0, null);
    return true;
  };

  const sent = [];
  const claimedIds = new Set();
  const sentEvent = new EventEmitter();
  createInterface({ input: child.stdin }).on("line", (line) => {
    sent.push(JSON.parse(line));
    sentEvent.emit("sent");
  });

  async function nextRequest(method) {
    const findNext = () => sent.find((message) => (
      message.id != null &&
      message.method === method &&
      !claimedIds.has(message.id)
    ));
    while (!findNext()) {
      await once(sentEvent, "sent");
    }
    const request = findNext();
    claimedIds.add(request.id);
    return request;
  }

  return {
    child,
    messages: () => sent,
    methods: () => sent.map(({ method }) => method),
    nextRequest,
    reply(request, result) {
      child.stdout.write(JSON.stringify({ id: request.id, result }) + "\n");
    },
    async replyToNext(method, result) {
      this.reply(await nextRequest(method), result);
    }
  };
}

test("초기화 뒤 읽기 전용 메서드만 호출한다", async () => {
  const process = createFakeAppServerProcess();
  const client = new AppServerClient({ spawnProcess: () => process.child });
  const started = client.start();

  await process.replyToNext("initialize", {
    userAgent: "codex-cli/test",
    platformFamily: "windows",
    platformOs: "windows"
  });
  await started;

  const listed = client.listThreads({
    sortKey: "updated_at",
    sortDirection: "desc",
    limit: 100
  });
  await process.replyToNext("thread/list", { data: [], nextCursor: null, backwardsCursor: null });
  assert.deepEqual(await listed, { data: [], nextCursor: null, backwardsCursor: null });

  assert.deepEqual(process.methods(), [
    "initialize",
    "initialized",
    "thread/list"
  ]);
  assert.equal(process.messages()[0].params.capabilities.experimentalApi, true);
});
```

프로세스 종료 시 대기 중 요청이 `AppServerExitedError`로 거절되고, `stderr` 본문이 브라우저용 오류 객체에 포함되지 않는 테스트도 추가한다. `requestTimeoutMs: 10`을 주입해 `initialize`, `thread/list`, `thread/read`, `thread/goal/get` 무응답이 각각 `AppServerTimeoutError`로 거절되고 pending timer가 정리되는지 검증한다. 같은 child에서 `thread/list A timeout → A request 객체에 늦은 응답 → thread/list B request 객체에 정상 응답` 순서로 A가 무시되고 B가 성공하는지 확인한다. 두 가짜 프로세스를 순서대로 반환해 같은 client에서 `start → timeout/exit/stop → start → thread/list 성공`이 가능하고 두 번째 child PID를 사용하며 request id가 재사용되지 않는지 검증한다. 기본 spawn 호출이 `process.env.ComSpec ?? "cmd.exe"`, `["/d", "/s", "/c", "codex.cmd app-server --listen stdio://"]`와 고정 옵션을 받는지 검증한다. `stop()` 테스트에는 `terminateProcessTree`를 주입해 모니터가 생성한 래퍼 PID `1234`만 한 번 전달되는지 확인한다.

- [ ] **Step 3: 테스트를 실행해 실패 확인**

```powershell
node --test tests/app-server-client.test.mjs
```

예상: `ERR_MODULE_NOT_FOUND`로 실패한다.

- [ ] **Step 4: 최소 JSONL 클라이언트 구현**

`monitor/app-server-client.mjs`는 다음 고정 명령과 요청 형태를 사용한다. 명령 문자열은 상수이며 사용자 입력을 결합하지 않고 `shell: true`도 사용하지 않는다.

```js
const APP_SERVER_COMMAND = "codex.cmd app-server --listen stdio://";
export const APP_SERVER_REQUEST_TIMEOUT_MS = 5000;
const ALLOWED_METHODS = new Set(["thread/list", "thread/read", "thread/goal/get"]);

export class AppServerClient {
  async listThreads(params) {
    return this.#request("thread/list", params);
  }

  async readThread(threadId) {
    return this.#request("thread/read", { threadId, includeTurns: true });
  }

  async getGoal(threadId) {
    return this.#request("thread/goal/get", { threadId });
  }
}
```

구현 규칙:

- `spawnProcess(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", APP_SERVER_COMMAND], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true })`를 기본값으로 사용한다.
- `node:readline.createInterface({ input: child.stdout })`로 한 줄당 JSON 객체 하나를 읽는다.
- 증가하는 정수 `id`와 `Map<id, { resolve, reject, timer }>`로 응답을 요청에 연결한다.
- `initialize`와 모든 허용 읽기 요청에 기본 5초 deadline을 적용한다. timeout이면 pending 항목과 timer를 제거하고 `AppServerTimeoutError`로 거절한다.
- 성공 응답, 오류 응답, timeout, 자식 프로세스 종료, `stop()`의 모든 경로에서 해당 pending timer를 정리한다. 이미 제거된 id의 늦은 응답은 무시한다.
- `initialize` 응답을 받은 뒤 `{ method: "initialized" }` 알림을 보낸다.
- `initialize.params.clientInfo`는 `{ name: "my_codex_agent_monitor", title: "My Codex Agent Monitor", version: "0.0.0" }`로 고정한다.
- `#request`는 `ALLOWED_METHODS` 밖의 메서드를 거부한다.
- `{ id, error }` 응답은 `error.code`만 보존한 `AppServerProtocolError`로 거절하고 원문 메시지·data를 화면 wire에 전달하지 않는다.
- JSON 파싱 실패 알림과 알 수 없는 알림은 무시하되 응답 스트림을 닫지 않는다.
- 자식 프로세스 `exit`·`error`에서 모든 대기 요청을 거절하고 내부 프로세스 참조를 비운다.
- `stop()`은 readline을 닫고 자식 프로세스가 살아 있으면 주입 가능한 `terminateProcessTree(child.pid)`를 호출한다.
- 기본 `terminateProcessTree`는 `taskkill.exe /pid <wrapperPid> /t /f`를 실행해 모니터가 직접 생성한 cmd 래퍼와 그 하위 App Server만 종료한다. 프로세스 이름 검색이나 전체 Codex 종료는 사용하지 않는다.
- `start()`는 이전 child·readline·pending이 정리된 경우 같은 인스턴스에 새 child와 readline을 구성한다. request id는 인스턴스 수명 동안 단조 증가하며 재시작에서 1로 되돌리지 않는다.
- stdout·exit·error handler는 자신이 캡처한 child가 현재 child와 같을 때만 인스턴스 상태를 변경한다. 종료된 이전 프로세스의 늦은 응답·exit가 새 프로세스의 pending이나 참조를 건드리지 않는다.

- [ ] **Step 5: 클라이언트 테스트 통과 확인**

```powershell
node --test tests/app-server-client.test.mjs
npm test
```

예상: 핸드셰이크·읽기 전용 메서드·Windows spawn·요청 deadline·pending 정리·프로세스 트리 종료와 기존 테스트가 모두 통과한다.

- [ ] **Step 6: 커밋**

```powershell
git add monitor/app-server-client.mjs tests/app-server-client.test.mjs
git commit -m "feat: add read-only Codex app server client"
```

---

### Task 2: JSONL을 증분 판독하고 현재 Turn 관찰 상태로 축약

**파일:**

- 생성: `monitor/session-log.mjs`
- 생성: `tests/session-log.test.mjs`

**인터페이스:**

- 소비: `Thread.path`, `Thread.turns`, `CODEX_HOME` 또는 `%USERPROFILE%\.codex`
- 생산: `resolveCodexHome(env) -> string`
- 생산: `new JsonlTailer({ codexHome })`
- 생산: `JsonlTailer.beginBatch()`, `commitBatch()`, `discardBatch()`
- 생산: `JsonlTailer.read(filePath) -> Promise<object[]>`
- 생산: `reduceThreadRecords(previous, records, thread, nowMs) -> ThreadObservation`
- 생산: `classifyToolCall(name, input) -> "Reading files" | "Calling tool" | "Editing" | "Testing" | "Waiting"`
- 생산: `SessionPathBoundaryError`, `SessionLogParseError`

- [ ] **Step 1: Codex 홈과 불완전 마지막 줄 테스트 작성**

```js
async function createTempJsonl(contents) {
  const directory = await mkdtemp(path.join(tmpdir(), "codex-monitor-jsonl-"));
  const file = path.join(directory, "session.jsonl");
  await writeFile(file, contents, "utf8");
  return file;
}

test("CODEX_HOME을 우선하고 없으면 USERPROFILE 기본 경로를 사용한다", () => {
  assert.equal(
    resolveCodexHome({ CODEX_HOME: "D:\\codex-home", USERPROFILE: "C:\\Users\\dev" }),
    path.resolve("D:\\codex-home")
  );
  assert.equal(
    resolveCodexHome({ USERPROFILE: "C:\\Users\\dev" }),
    path.resolve("C:\\Users\\dev\\.codex")
  );
});

test("완성되지 않은 JSONL 마지막 줄을 다음 읽기에서 재시도한다", async () => {
  const file = await createTempJsonl(
    '{"timestamp":"2026-07-26T06:00:00Z","type":"event_msg","payload":{"type":"task_started","turn_id":"turn-1","started_at":"2026-07-26T06:00:00Z"}}\n' +
    '{"timestamp":"2026-07-26T06:00:01Z","type":"event_msg"'
  );
  const tailer = new JsonlTailer({ codexHome: path.dirname(file) });

  tailer.beginBatch();
  assert.equal((await tailer.read(file)).length, 1);
  tailer.commitBatch();
  await appendFile(file, ',"payload":{"type":"task_complete","turn_id":"turn-1","completed_at":"2026-07-26T06:00:01Z"}}\n');
  tailer.beginBatch();
  assert.equal((await tailer.read(file))[0].payload.type, "task_complete");
  tailer.commitBatch();
});
```

`codexHome` 밖의 파일을 넘기면 읽지 않고 `SessionPathBoundaryError`로 거절하는 테스트를 추가한다.
줄바꿈으로 끝난 비어 있지 않은 손상 JSON 줄은 `SessionLogParseError`로 거절하고, `discardBatch()` 뒤 파일을 정상 줄로 교체한 새 배치에서 같은 바이트 위치부터 다시 읽는지 검증한다. 오류 객체에는 줄 본문이나 파일 내용을 넣지 않는다.

- [ ] **Step 2: 현재 Turn·Plan·토큰·스킬·활동 축약 실패 테스트 작성**

테스트 입력은 사용자 본문 대신 고정된 짧은 문장만 사용한다.

```js
function event(timestamp, type, extra = {}) {
  return { timestamp, type: "event_msg", payload: { type, ...extra } };
}

function toolCall(timestamp, name, argumentsText) {
  return {
    timestamp,
    type: "response_item",
    payload: {
      type: "function_call",
      id: "item-" + timestamp,
      name,
      arguments: argumentsText,
      call_id: "call-" + timestamp
    }
  };
}

function activeThread(turnId) {
  return {
    id: "thread-1",
    status: { type: "active", activeFlags: [] },
    turns: [{
      id: turnId,
      items: [],
      status: "inProgress",
      error: null,
      startedAt: Date.parse("2026-07-26T06:00:00Z") / 1000,
      completedAt: null,
      durationMs: null
    }]
  };
}

test("이전 Turn의 대기를 버리고 현재 Turn의 관찰 값만 유지한다", () => {
  const records = [
    event("2026-07-26T05:59:00Z", "task_started", { turn_id: "old" }),
    toolCall("2026-07-26T05:59:01Z", "wait_agent", "{}"),
    event("2026-07-26T06:00:00Z", "task_started", { turn_id: "current" }),
    event("2026-07-26T06:00:01Z", "user_message", {
      message: "$superpowers:using-superpowers 현황판을 구현해.\n<environment_context>구조 정보</environment_context>"
    }),
    toolCall("2026-07-26T06:00:02Z", "update_plan", JSON.stringify({
      plan: [
        { step: "수집기 구현", status: "in_progress" },
        { step: "화면 연결", status: "pending" }
      ]
    })),
    event("2026-07-26T06:00:03Z", "token_count", {
      info: { total_token_usage: { total_tokens: 420 } }
    })
  ];

  const result = reduceThreadRecords(null, records, activeThread("current"), Date.parse("2026-07-26T06:00:04Z"));

  assert.equal(result.turnId, "current");
  assert.equal(result.assignedWork, "현황판을 구현해.");
  assert.deepEqual(result.skills, ["superpowers:using-superpowers"]);
  assert.deepEqual(result.plan.tasks, [
    { title: "수집기 구현", status: "active" },
    { title: "화면 연결", status: "queued" }
  ]);
  assert.equal(result.tokens, 420);
  assert.equal(result.status, "planning");
});
```

현재 Turn에서 `function_call`/`custom_tool_call`의 `call_id`를 미완료 호출로 등록하고 `function_call_output`/`custom_tool_call_output`의 같은 `call_id`에서 닫는 테스트를 추가한다. 최소 시나리오는 다음 세 가지다.

- `wait_agent` 호출 → 결과: `waiting`이 해제되어 미완료 Turn의 `running`이 되고 활성 `currentActivity`는 비워진다.
- `update_plan` 호출 → 결과: 마지막 Plan 데이터는 유지하되 `planning`이 해제되어 `running`이 된다.
- `wait_agent` 호출 → 결과 → `task_complete`: 최종 상태는 `complete`이고 종료 시각에서 duration이 멈춘다.

`Thread.status.type === "notLoaded"`인 현재 Turn도 다음 입력 요청 전이를 검증한다.

- `request_user_input` 호출만 존재: `needs_input`
- 같은 `call_id`의 결과 도착: 다른 미해결 입력 요청이 없으면 `running`
- 이전 Turn의 미해결 `request_user_input`: 새 Turn 상태에 영향 없음

질문 arguments와 사용자 응답·도구 결과 본문은 관찰 상태, 최근 활동 label, wire, 오류 객체에 복제하지 않는다.

종료 시간은 `task_complete.completed_at`, `Turn.status: "failed"`, `Turn.status: "interrupted"`에서 각각 멈추는 테스트를 추가한다. 구조화된 현재 Turn 레코드의 `status`가 `cancelled` 또는 `stopped`이면 그 값을 보존한다.

- [ ] **Step 3: 테스트를 실행해 실패 확인**

```powershell
node --test tests/session-log.test.mjs
```

예상: `ERR_MODULE_NOT_FOUND`로 실패한다.

- [ ] **Step 4: 바이트 오프셋 기반 tailer 구현**

```js
export const IDLE_AFTER_MS = 10 * 60 * 1000;

export function resolveCodexHome(env = process.env) {
  if (env.CODEX_HOME) return path.resolve(env.CODEX_HOME);
  if (!env.USERPROFILE) throw new Error("USERPROFILE is required when CODEX_HOME is unset");
  return path.resolve(env.USERPROFILE, ".codex");
}

export class JsonlTailer {
  #offsets = new Map();
  #candidateOffsets = null;

  constructor({ codexHome = resolveCodexHome() } = {}) {
    this.codexHome = path.resolve(codexHome);
  }

  beginBatch() {
    if (this.#candidateOffsets) throw new Error("JSONL batch already active");
    this.#candidateOffsets = new Map(this.#offsets);
  }

  commitBatch() {
    if (!this.#candidateOffsets) throw new Error("JSONL batch is not active");
    this.#offsets = this.#candidateOffsets;
    this.#candidateOffsets = null;
  }

  discardBatch() {
    this.#candidateOffsets = null;
  }

  async read(filePath) {
    if (!this.#candidateOffsets) throw new Error("JSONL batch is not active");
    assertInside(this.codexHome, filePath);
    const offset = this.#candidateOffsets.get(filePath) ?? 0;
    const stat = await fs.stat(filePath);
    const start = stat.size < offset ? 0 : offset;
    const bytes = await readBytes(filePath, start, stat.size - start);
    const lastNewline = bytes.lastIndexOf(0x0a);
    if (lastNewline < 0) return [];
    this.#candidateOffsets.set(filePath, start + lastNewline + 1);
    return bytes
      .subarray(0, lastNewline)
      .toString("utf8")
      .split("\n")
      .flatMap(parseJsonLine);
  }
}
```

한 번에 하나의 수집만 실행한다. `SnapshotStore.#refresh`가 배치를 시작하고 전체 후보 상태를 정상 커밋한 뒤에만 `commitBatch()`를 호출한다. 수집 중 어떤 필수 읽기나 완결 줄 파싱이라도 실패하면 `discardBatch()`를 호출해 모든 후보 오프셋을 버린다. 줄바꿈이 없는 마지막 조각만 다음 수집까지 보류하고, 정상 JSON으로 파싱된 뒤 reducer가 알지 못하는 사건만 무시한다.

내부 helper는 다음처럼 구현한다.

```js
export class SessionPathBoundaryError extends Error {
  constructor() {
    super("Session path is outside CODEX_HOME");
    this.name = "SessionPathBoundaryError";
  }
}

export class SessionLogParseError extends Error {
  constructor() {
    super("Session log contains invalid JSON");
    this.name = "SessionLogParseError";
  }
}

function assertInside(root, candidate) {
  const relative = path.relative(root, path.resolve(candidate));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new SessionPathBoundaryError();
  }
}

async function readBytes(filePath, start, length) {
  if (length <= 0) return Buffer.alloc(0);
  const handle = await fs.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function parseJsonLine(line) {
  if (!line.trim()) return [];
  try {
    return [JSON.parse(line)];
  } catch {
    throw new SessionLogParseError();
  }
}
```

`Thread.path`는 `path.resolve(CODEX_HOME)` 아래에 있을 때만 읽는다. `path`가 `null`인 ephemeral Thread는 App Server Turn만 사용하고 JSONL에서 얻을 수 없는 필드는 빈 값으로 둔다.

- [ ] **Step 5: 사건 축약과 도구 분류 구현**

구조 블록 제거와 Plan 상태 변환은 아래 상수로 고정한다.

```js
const STRUCTURAL_BLOCK = /<(environment_context|skill)\b[^>]*>[\s\S]*?<\/\1>/gi;
const SKILL_REFERENCE = /\$([a-z0-9][\w-]*(?::[\w-]+)?)/gi;
const PLAN_STATUS = {
  completed: "done",
  in_progress: "active",
  pending: "queued"
};
```

도구 분류 순서는 다음과 같다.

```js
export function classifyToolCall(name, input = {}) {
  const leaf = String(name).split(".").at(-1);
  const command = String(input.command ?? "");

  if (leaf === "apply_patch" || leaf === "file_change") return "Editing";
  if (leaf === "request_user_input") return "Waiting";
  if (leaf === "wait" || leaf === "wait_agent") return "Waiting";
  if (/\b(npm(?:\.cmd)? (?:test|run build|run test:sites)|node --test)\b/i.test(command)) return "Testing";
  if (/\b(rg|Get-Content|Get-ChildItem|git status|git log)\b/i.test(command)) return "Reading files";
  return "Calling tool";
}
```

```js
// ponytail: 명령 접두사 분류는 관찰 가능한 최소 휴리스틱이다.
// JSONL에 commandActions가 안정적으로 기록되면 문자열 분류를 그 필드로 교체한다.
```

축약기는 새 `task_started` 또는 최신 `Turn.id` 변경에서 승인·미완료 호출·Plan·활동 상태를 초기화한다. 현재 Turn의 `function_call`/`custom_tool_call`은 `call_id`별 미완료 호출로 등록하고 대응하는 output에서 닫는다. `request_user_input`은 별도 미해결 입력 요청으로 표시해 `Thread.status.type === "notLoaded"`여도 추적한다. `needs_input`은 `Thread.status.activeFlags`의 `waitingOnApproval`/`waitingOnUserInput` 또는 미해결 입력 요청 중 하나라도 있을 때 적용한다. `waiting`, `planning`, 활성 `currentActivity`는 나머지 미완료 호출만 기준으로 계산하며, 완료된 도구는 최근 활동에는 남기되 활성 단계에서는 제거한다. `Thread.status.type === "systemError"`와 `Turn.status === "failed"`는 `failed`, `Turn.status === "interrupted"`는 `stopped`로 정규화한다. 상태 우선순위는 `needs_input`, `failed`, `cancelled/stopped`, `waiting`, `planning`, `complete`, `running`, `idle` 순서로 구현한다. 최근 활동은 도구·파일·Plan·Goal·하위 에이전트 사건만 최신 4개로 제한하고 reasoning 레코드는 버린다.

- [ ] **Step 6: JSONL 테스트와 전체 테스트 통과 확인**

```powershell
node --test tests/session-log.test.mjs
npm test
```

예상: 불완전 마지막 줄 보류, 완결 손상 줄의 배치 폐기·오프셋 재시도, 현재 Turn 격리, `notLoaded` 입력 요청, 호출·결과 상관관계, 대기·계획 해제, 완료 우선 전환을 포함한 모든 테스트가 통과한다.

- [ ] **Step 7: 커밋**

```powershell
git add monitor/session-log.mjs tests/session-log.test.mjs
git commit -m "feat: tail and normalize Codex session logs"
```

---

### Task 3: 세션 등록 생명주기와 스냅샷 조립

**파일:**

- 생성: `monitor/snapshot-store.mjs`
- 생성: `tests/snapshot-store.test.mjs`

**인터페이스:**

- 소비: `AppServerClient`, `JsonlTailer`, `reduceThreadRecords`
- 소비: `new SnapshotStore({ appServer, tailer, codexHome, now })`
- 생산: `SnapshotStore.initialize() -> Promise<Snapshot>`
- 생산: `SnapshotStore.collect() -> Promise<Snapshot>`
- 생산: `SnapshotStore.markError(errorCode) -> Snapshot`
- 생산: `SnapshotStore.snapshot -> Snapshot`

- [ ] **Step 1: 최초 등록과 실행 중 등록 실패 테스트 작성**

고정 시각 `2026-07-26T06:00:00Z`에서 다음 Thread를 제공하는 가짜 App Server를 만든다.

```js
const unix = (value) => Date.parse(value) / 1000;

function thread(id, overrides = {}) {
  return {
    id,
    sessionId: id,
    parentThreadId: null,
    preview: "",
    createdAt: unix("2026-07-26T05:50:00Z"),
    updatedAt: unix("2026-07-26T05:59:00Z"),
    status: { type: "notLoaded" },
    path: `C:\\Users\\dev\\.codex\\sessions\\${id}.jsonl`,
    cwd: "C:\\repo",
    source: "cli",
    agentNickname: null,
    agentRole: null,
    name: null,
    turns: [],
    ...overrides
  };
}

const threads = [
  thread("active-root", { updatedAt: unix("2026-07-26T05:59:30Z"), parentThreadId: null }),
  thread("old-root", { updatedAt: unix("2026-07-26T05:40:00Z"), parentThreadId: null }),
  thread("complete-before-start", { updatedAt: unix("2026-07-26T05:59:00Z"), parentThreadId: null }),
  thread("child-a", {
    updatedAt: unix("2026-07-26T05:59:40Z"),
    parentThreadId: "active-root",
    source: "subAgent"
  })
];

const initialRecords = {
  "active-root": [
    sessionEvent("2026-07-26T05:59:30Z", "task_started", {
      turn_id: "root-turn",
      started_at: "2026-07-26T05:59:30Z"
    })
  ],
  "child-a": [
    sessionEvent("2026-07-26T05:59:40Z", "task_started", {
      turn_id: "child-turn",
      started_at: "2026-07-26T05:59:40Z"
    })
  ],
  "complete-before-start": [
    sessionEvent("2026-07-26T05:58:00Z", "task_started", {
      turn_id: "complete-turn",
      started_at: "2026-07-26T05:58:00Z"
    }),
    sessionEvent("2026-07-26T05:59:00Z", "task_complete", {
      turn_id: "complete-turn",
      completed_at: "2026-07-26T05:59:00Z"
    })
  ]
};
```

JSONL 관찰 결과는 `active-root`와 `child-a`를 미완료, `complete-before-start`를 시작 전 완료로 반환한다.
가짜 카탈로그는 실제 `sourceKinds` 필터를 적용한다. 별도 테스트에서 `source: "exec"`인 최근 미완료 루트가 등록되고 `subAgent*` source는 루트 페이지에서 제외되는지 검증한다.

```js
test("시작 시 최근 미완료 루트만 등록하고 자식은 상세에 둔다", async () => {
  const harness = createStoreHarness({
    threads,
    initialRecords,
    startedAt: "2026-07-26T06:00:00Z"
  });
  const snapshot = await harness.store.initialize();

  assert.deepEqual(snapshot.sessions.map(({ id }) => id), ["active-root"]);
  assert.deepEqual(snapshot.sessions[0].children.map(({ id }) => id), ["child-a"]);
});
```

Store 생성으로 `monitorStartedAt`이 정해진 뒤 첫 `initialize()` 호출 직전에 하네스의 `addThread()`와 `appendRecord()`로 `quick-root`와 그 하위 Thread의 시작·완료를 추가해, 첫 스냅샷에서 둘 다 `Complete`로 등록되는 테스트를 작성한다. 같은 조건을 한 번의 다음 `collect()` 직전에도 검증한다. 반대로 시작 전에 완료된 미등록 루트의 `Thread.updatedAt`이나 Goal·토큰 사건 시각만 모니터 시작 이후로 바뀌면 계속 제외되는지 검증한다.

- [ ] **Step 2: 유지·Idle·재개·종료 상태 실패 테스트 작성**

```js
test("등록된 세션은 오래돼도 남고 새 task_started에서 재개된다", async () => {
  const harness = createStoreHarness({
    threads,
    initialRecords,
    startedAt: "2026-07-26T06:00:00Z"
  });
  await harness.store.initialize();

  harness.setNow("2026-07-26T06:11:00Z");
  let snapshot = await harness.store.collect();
  assert.equal(snapshot.sessions[0].status, "idle");

  harness.appendRecord(
    "active-root",
    sessionEvent("2026-07-26T06:11:01Z", "task_started", {
      turn_id: "turn-2",
      started_at: "2026-07-26T06:11:01Z"
    })
  );
  snapshot = await harness.store.collect();
  assert.equal(snapshot.sessions[0].status, "running");
});
```

테스트 파일의 `createStoreHarness`는 mutable clock, Thread 목록, Thread별 레코드 queue를 감싸고 `SnapshotStore`에는 공개 생성자 계약만 주입한다.

```js
function sessionEvent(timestamp, type, extra = {}) {
  return { timestamp, type: "event_msg", payload: { type, ...extra } };
}

function createStoreHarness({ threads, initialRecords = {}, startedAt }) {
  let nowMs = Date.parse(startedAt);
  let records = new Map(
    Object.entries(initialRecords).map(([threadId, items]) => [
      `C:\\Users\\dev\\.codex\\sessions\\${threadId}.jsonl`,
      [...items]
    ])
  );
  let candidateRecords = null;
  const appServer = createFakeCatalog(threads);
  const tailer = {
    beginBatch() {
      if (candidateRecords) throw new Error("batch already active");
      candidateRecords = new Map(
        [...records].map(([filePath, items]) => [filePath, [...items]])
      );
    },
    read: async (filePath) => {
      if (!candidateRecords) throw new Error("batch is not active");
      const queued = candidateRecords.get(filePath) ?? [];
      candidateRecords.set(filePath, []);
      return queued;
    },
    commitBatch() {
      if (!candidateRecords) throw new Error("batch is not active");
      records = candidateRecords;
      candidateRecords = null;
    },
    discardBatch() {
      candidateRecords = null;
    }
  };
  const store = new SnapshotStore({
    appServer,
    tailer,
    codexHome: "C:\\Users\\dev\\.codex",
    now: () => nowMs
  });

  return {
    store,
    addThread: (thread) => appServer.addThread(thread),
    setNow: (value) => {
      nowMs = Date.parse(value);
    },
    appendRecord: (threadId, record) => {
      const filePath = `C:\\Users\\dev\\.codex\\sessions\\${threadId}.jsonl`;
      records.set(filePath, [...(records.get(filePath) ?? []), record]);
    }
  };
}
```

성공 배치에서는 읽은 queue가 `commitBatch()` 뒤 비워지고, 실패 배치에서는 `discardBatch()` 뒤 같은 사건이 다음 `read()`에 다시 반환되는지 하네스 자체도 검증한다. no-op 배치 메서드로 대체하지 않는다. 동적 발견 테스트는 외부 `threads` 배열을 직접 변경하지 않고 반드시 하네스의 `addThread()`를 사용한다.

`createFakeCatalog(threads)`는 다음 테스트 전용 객체다.

```js
function createFakeCatalog(threads) {
  const catalogThreads = [...threads];

  function isDescendant(item, ancestorId) {
    let parentId = item.parentThreadId;
    while (parentId) {
      if (parentId === ancestorId) return true;
      parentId = catalogThreads.find(({ id }) => id === parentId)?.parentThreadId ?? null;
    }
    return false;
  }

  return {
    addThread(thread) {
      catalogThreads.push(thread);
    },
    async listThreads(params = {}) {
      const sourceFiltered = params.sourceKinds?.length
        ? catalogThreads.filter((item) => params.sourceKinds.includes(item.source))
        : catalogThreads;
      const data = params.ancestorThreadId
        ? sourceFiltered.filter((item) => isDescendant(item, params.ancestorThreadId))
        : sourceFiltered.filter((item) => item.parentThreadId == null);
      const sorted = [...data].sort(
        (a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id)
      );
      const start = Number(params.cursor ?? 0);
      const end = Math.min(start + (params.limit ?? sorted.length), sorted.length);
      return {
        data: sorted.slice(start, end),
        nextCursor: end < sorted.length ? String(end) : null,
        backwardsCursor: null
      };
    },
    async readThread(threadId) {
      return { thread: catalogThreads.find(({ id }) => id === threadId) };
    },
    async getGoal() {
      return { goal: null };
    }
  };
}
```

완료·실패·중단 상태의 `durationSeconds`가 종료 시각에서 멈추고 이후 수집 시 증가하지 않는 테스트를 추가한다.

정상 수집 뒤 한 JSONL `read()`만 실패하게 만들어 해당 주기의 다른 Thread 변경도 커밋되지 않고 `sessions`와 `lastSuccessfulAt`이 그대로인지 검증한다. 다음 `collect()`에서 모든 읽기를 성공시키면 보류된 변경이 반영되고 `connected`로 복구되는지도 같은 테스트에서 확인한다. 가짜 record queue만 사용하지 말고 실제 `JsonlTailer`와 임시 파일 A·B를 사용해 `A 읽기 성공 → B 읽기 실패 → 재수집` 순서에서 A 사건이 다시 읽혀 최종 스냅샷에 반영되는지 검증한다.

하위 Thread도 시작 전 종료 레코드의 `updatedAt`만 바뀐 경우 제외되고, 모니터 시작 이후 `task_started → task_complete`가 한 수집 사이에 기록된 경우 부모 상세에 `Complete`로 등록되는 대조 테스트를 추가한다.

Goal 수집은 다음 세 경우를 구분해 테스트한다.

- 정상 `{ goal: null }`: Goal이 없는 정상 Connected 스냅샷으로 커밋
- 기존 Goal이 표시된 뒤 `getGoal()` 거절·프로토콜 오류·App Server 종료: 후보 전체와 Tailer 배치를 폐기하고 기존 세션·Goal·`lastSuccessfulAt`을 유지한 `APP_SERVER_UNAVAILABLE` Error 발행
- 다음 `getGoal()` 성공: 최신 Goal을 반영하고 Connected로 복구

- [ ] **Step 3: 최초 페이지 경계·후속 discovery watermark·하위 에이전트 실패 테스트 작성**

최초 `initialize()`는 `monitorStartedAt - IDLE_AFTER_MS`까지 페이지를 순회한다. 첫 페이지의 마지막 Thread가 이 경계보다 최신이고 `nextCursor`가 있으면 다음 페이지를 요청하며, 처음 경계보다 오래된 `updatedAt`을 만나면 더 오래된 페이지를 요청하지 않는다고 검증한다. 가짜 카탈로그의 초기 배열을 의도적으로 섞고 최신 Thread를 `addThread()`로 배열 끝에 추가해도 `updatedAt desc`, 동률 `id` 오름차순으로 cursor slicing되어 적격 Thread보다 먼저 오래된 경계를 만나지 않는지도 검증한다.

후속 `collect()`은 10분 경계가 아니라 직전 성공 refresh가 조회를 시작한 epoch 초 `catalogWatermark`까지 페이지를 순회한다. 다음 규칙을 검증한다.

- refresh 시작 시 `candidateWatermark = Math.floor(now() / 1000)`을 잡는다.
- `updatedAt === catalogWatermark`인 항목도 처리하고, 그보다 오래된 항목을 만났을 때만 페이지 순회를 멈춘다.
- 전체 Store·Tailer 배치 성공 시에만 `catalogWatermark = candidateWatermark`를 커밋한다.
- App Server·JSONL·파싱 실패에서는 이전 watermark를 유지한다.
- 최초·후속 모든 루트 페이지 요청은 `ROOT_SOURCE_KINDS`, 하위 페이지 요청은 `CHILD_SOURCE_KINDS`를 전달한다.
- 각 등록 루트의 하위 조회도 같은 최초 경계 또는 커밋된 `catalogWatermark` 경계까지 `nextCursor`를 따라가며, 후속 요청마다 같은 `ancestorThreadId`, `CHILD_SOURCE_KINDS`, 정렬, `limit`과 응답의 `cursor`를 유지한다.

Store 생성 뒤 첫 `initialize()` 호출 직전에 하네스의 `addThread()`와 `appendRecord()`로 `monitorStartedAt` 이후 시작·완료된 루트와 하위 Thread를 추가해 첫 스냅샷에서 둘 다 `Complete`로 등록되는지 검증한다. 또한 가짜 시계를 10분 넘게 전진시키고 수집을 실패시킨 동안 같은 API로 같은 형태의 루트와 하위 Thread를 추가한다. 복구 수집이 이전 watermark까지 되짚어 둘 다 `Complete`로 등록하는지도 검증한다.

하위 Thread는 다음 요청으로 조회한다.

```js
{
  ancestorThreadId: "active-root",
  cursor,
  sortKey: "updated_at",
  sortDirection: "desc",
  limit: 100,
  sourceKinds: CHILD_SOURCE_KINDS
}
```

첫 하위 페이지를 100개로 채우고 두 번째 페이지에 등록 자격이 있는 하위 Thread를 둔다. 두 번째 요청이 첫 응답의 `nextCursor`를 사용하고 같은 `ancestorThreadId`와 `CHILD_SOURCE_KINDS`를 유지하며, 해당 하위가 부모 상세에 등록되고 그 토큰이 `tokens.children`과 `tokens.total`에 한 번만 합산되는지 검증한다.

- [ ] **Step 4: 테스트를 실행해 실패 확인**

```powershell
node --test tests/snapshot-store.test.mjs
```

예상: `ERR_MODULE_NOT_FOUND`로 실패한다.

- [ ] **Step 5: 메모리 registry와 수집 알고리즘 구현**

```js
export const COLLECTION_INTERVAL_MS = 3000;
export const THREAD_PAGE_SIZE = 100;
export const ROOT_SOURCE_KINDS = ["cli", "vscode", "exec", "appServer", "unknown"];
export const CHILD_SOURCE_KINDS = [
  "subAgent",
  "subAgentReview",
  "subAgentCompact",
  "subAgentThreadSpawn",
  "subAgentOther"
];

export class SnapshotStore {
  #registeredRoots = new Set();
  #registeredChildren = new Map();
  #observations = new Map();
  #catalogWatermark = null;
  #snapshot = {
    collectedAt: null,
    lastSuccessfulAt: null,
    connectionStatus: "syncing",
    errorCode: null,
    sessions: []
  };

  constructor({ appServer, tailer, codexHome, now = Date.now }) {
    this.appServer = appServer;
    this.tailer = tailer;
    this.codexHome = codexHome;
    this.now = now;
    this.monitorStartedAt = now();
  }

  get snapshot() {
    return structuredClone(this.#snapshot);
  }

  markError(errorCode) {
    this.#snapshot = {
      ...this.#snapshot,
      collectedAt: new Date(this.now()).toISOString(),
      connectionStatus: "error",
      errorCode
    };
    return this.snapshot;
  }
}
```

`initialize()`과 `collect()`은 같은 `#refresh({ initial })` 경로를 사용한다. `#refresh`는 시작 시 `candidateWatermark = Math.floor(now() / 1000)`을 잡고 `tailer.beginBatch()` 뒤 registry·관찰값·wire를 후보 상태에 조립한다. 필수 `thread/list`·`thread/read`·`thread/goal/get`·JSONL 읽기가 모두 성공했을 때만 인스턴스 상태, `lastSuccessfulAt`, `#catalogWatermark`를 한 번에 교체한 뒤 `tailer.commitBatch()`를 호출한다. 실패하면 후보 상태·후보 watermark와 `tailer.discardBatch()`로 후보 오프셋을 함께 폐기한다. `markError()`는 마지막 정상 `sessions`, registry, 관찰값, `lastSuccessfulAt`, `#catalogWatermark`를 변경하지 않는다.

1. 최초 refresh는 `monitorStartedAt - IDLE_AFTER_MS`, 후속 refresh는 직전 커밋된 `#catalogWatermark`를 포함하는 지점까지 루트 Thread를 `sourceKinds: ROOT_SOURCE_KINDS`, `updated_at desc`로 페이지 순회한다. 각 등록 루트의 하위 Thread도 같은 경계까지 `ancestorThreadId`와 `sourceKinds: CHILD_SOURCE_KINDS`를 유지하며 `nextCursor`를 끝까지 따른다.
2. `thread/read({ includeTurns: true })`와 JSONL 새 레코드를 현재 관찰 상태로 축약한다.
3. 모니터 시작 전에 존재한 미등록 루트는 최초 수집에서 최근 10분 내 미완료인 경우에만 등록한다.
4. 최초·후속 수집 모두 미등록 루트의 `Thread.createdAt`, 최신 Turn의 `startedAt`, 현재 Turn JSONL의 `task_started.started_at` 중 하나가 `monitorStartedAt` 이상이면 최신 상태가 이미 종료여도 새·재개 Thread로 등록한다. `task_started.started_at`이 없으면 해당 레코드의 바깥 `timestamp`를 사용한다.
5. 등록된 미완료 루트는 최근 페이지에 없어도 Idle 판정을 위해 유지한다.
6. 등록된 완료·실패·취소·중단 루트도 메모리에 유지하고, 최근 페이지에서 갱신되면 새 Turn을 읽어 재개한다.
7. 각 등록 루트의 자손도 최초·후속 구분 없이 생성·Turn 시작·`task_started`만 등록 증거로 사용하는 같은 규칙으로 등록하고, 최신 상태가 종료여도 부모의 `children`에 조립한다.
8. `thread/goal/get`의 성공 응답이 명시적으로 `{ goal: null }`일 때만 Goal 없음으로 커밋한다. 요청 거절·프로토콜 오류·프로세스 종료는 상위 수집 경계로 전파해 전체 후보를 폐기하고 `APP_SERVER_UNAVAILABLE` Error 및 App Server 재시작을 시작한다.
9. JSONL 파일 읽기 또는 완결 줄 파싱이 하나라도 실패하면 해당 수집의 후보 변경과 Tailer 후보 오프셋을 모두 폐기하고 마지막 정상 `sessions`를 유지한 `connectionStatus: "error"`, `errorCode: "SESSION_READ_FAILED"` 스냅샷을 발행한다.
10. `Thread.updatedAt`과 그 밖의 사건 시각은 페이지 탐색과 이미 등록된 Thread의 표시 갱신에만 사용하며 미등록 Thread의 등록 자격으로 사용하지 않는다. 10분 경계는 최초 등록 필터와 Idle 판정에만 사용하고 후속 discovery 하한으로 재사용하지 않는다.
11. 다음 전체 수집이 성공하면 이전 성공 조회의 watermark 이후에 누적된 카탈로그와 보류된 JSONL 증분을 한 번에 반영하고 `connectionStatus: "connected"`, `errorCode: null`로 복구한다.

- [ ] **Step 6: wire 변환과 중복 없는 집계 구현**

```js
function buildTokenTotals(rootObservation, childObservations) {
  const root = rootObservation.tokens ?? 0;
  const children = childObservations.reduce((sum, child) => sum + (child.tokens ?? 0), 0);
  return { root, children, total: root + children };
}
```

추가 규칙:

- `session`은 `Thread.name`, 없으면 `Thread.id.slice(0, 8)`이다.
- 루트 Agent 표시는 클라이언트가 `Codex / Root agent`로 고정한다.
- 하위 Agent만 `agentNickname`과 `agentRole`을 사용하고 누락 시 축약 Thread ID와 `Child agent`를 사용한다.
- `assignedWork`와 `currentWork.title`은 구조 블록을 제거한 현재 Turn의 마지막 비어 있지 않은 `user_message`다.
- Goal에는 App Server가 준 원시 숫자와 epoch를 ISO 시각으로 바꾼 값만 넣는다.
- 활동 라벨은 관찰된 도구 이름·파일명·Plan·Goal·하위 에이전트 상태만 사용한다.
- `errorCode`는 고정 enum만 허용하고 예외 메시지·사용자 본문·도구 출력은 넣지 않는다.

- [ ] **Step 7: 스냅샷 테스트와 전체 테스트 통과 확인**

```powershell
node --test tests/snapshot-store.test.mjs
npm test
```

예상: 모든 루트 source 등록, 하위 source 분리와 다중 페이지 순회, 두 번째 하위 페이지의 상세·토큰 집계, 최초 10분 필터, 커밋형 discovery watermark, 10분 이상 장애 중 시작·완료 Thread 복구, 시작 증거 기반 등록, 메타데이터 갱신만 된 과거 Thread 제외, Idle·재개·종료·토큰·Goal 정상 없음/실패/복구와 JSONL 읽기 실패 시 원자적 유지·다음 수집 복구 테스트가 모두 통과한다.

- [ ] **Step 8: 커밋**

```powershell
git add monitor/snapshot-store.mjs tests/snapshot-store.test.mjs
git commit -m "feat: assemble live Codex session snapshots"
```

---

### Task 4: 루프백 HTTP 서버와 단일 명령 실행 경로 연결

**파일:**

- 생성: `monitor/server.mjs`
- 생성: `tests/monitor-server.test.mjs`
- 수정: `package.json:6-13`

**인터페이스:**

- 소비: `SnapshotStore`, `dist/client`
- 소비: `createMonitorServer({ distDir, snapshotProvider }) -> http.Server`
- 생산: `GET /api/snapshot`
- 생산: 정적 파일 및 HTML route의 `dist/client/index.html` fallback
- 생산: `npm run monitor`

- [ ] **Step 1: API·정적 파일·fallback 실패 테스트 작성**

임시 디렉터리에 `index.html`과 `assets/app.js`를 만들고 포트 `0`에서 테스트 서버를 연다.

```js
async function createStaticFixture() {
  const distDir = await mkdtemp(path.join(tmpdir(), "codex-monitor-dist-"));
  await mkdir(path.join(distDir, "assets"));
  await writeFile(path.join(distDir, "index.html"), "<main>monitor</main>", "utf8");
  await writeFile(path.join(distDir, "assets", "app.js"), "export {};", "utf8");
  return distDir;
}

function listen(server, options) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options, resolve);
  });
}

function closeServer(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function startTestServer({ snapshot }) {
  const distDir = await createStaticFixture();
  const server = createMonitorServer({
    distDir,
    snapshotProvider: () => snapshot
  });
  await listen(server, { host: "127.0.0.1", port: 0 });
  const address = server.address();
  return {
    server,
    distDir,
    url: `http://127.0.0.1:${address.port}`
  };
}

test("스냅샷 API는 캐시 없이 정규화 JSON만 반환한다", async (t) => {
  const server = await startTestServer({
    snapshot: {
      collectedAt: "2026-07-26T06:00:00.000Z",
      lastSuccessfulAt: "2026-07-26T06:00:00.000Z",
      connectionStatus: "connected",
      errorCode: null,
      sessions: []
    }
  });
  t.after(async () => {
    await closeServer(server.server);
    await rm(server.distDir, { recursive: true, force: true });
  });
  const response = await fetch(server.url + "/api/snapshot");

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).connectionStatus, "connected");
});
```

`GET /assets/app.js`는 실제 asset, `GET /session/root-a`는 `index.html`, `POST /api/snapshot`은 `405`, 알 수 없는 `/api/*`는 `404`를 반환하는 테스트를 추가한다. listener나 임시 정적 fixture를 만드는 모든 테스트는 생성 직후 하나의 `t.after()`에 비동기 close와 temp 디렉터리 제거를 등록해 assertion 실패에서도 정리한다.

- [ ] **Step 2: 포트 충돌과 종료 실패 테스트 작성**

`127.0.0.1:4310`을 먼저 점유한 뒤 즉시 `t.after()`에 멱등인 `closeServer()` 정리를 등록한다. `listen()`이 `EADDRINUSE`로 거절되고 다른 포트를 선택하지 않는지 검증한다. 점유 listener를 닫은 뒤 같은 포트에 다시 bind할 수 있는지도 확인한다. 종료 함수가 HTTP 서버와 가짜 App Server의 `stop()`을 각각 한 번 호출하는지도 검증한다.

가짜 timer와 같은 client·Store를 사용해 `SESSION_READ_FAILED → Error 유지 → 정확히 3초 후 재수집 → 보류 증분 반영 → Connected`를 검증한다. 최초 정상 스냅샷 전 파일 오류는 `initialize()`를, 이후 파일 오류는 `collect()`을 다시 호출하며 App Server `stop()`/`start()`과 중복 timer는 발생하지 않아야 한다. Store 생성 뒤 첫 `initialize()` 호출 직전에 추가한 시작·완료 루트와 하위 Thread가 첫 스냅샷에서 둘 다 `Complete`가 되는 경로도 검증한다.

App Server 실패 뒤 가짜 시계를 10분 넘게 전진시키고 그 사이 시작·완료된 루트와 하위 Thread를 두 번째 가짜 프로세스 카탈로그에 추가한다. 같은 Store가 실패 전 `catalogWatermark`를 유지해 복구 `collect()`에서 둘 다 `Complete`로 등록하는지 검증한다.

- [ ] **Step 3: 테스트를 실행해 실패 확인**

```powershell
node --test tests/monitor-server.test.mjs
```

예상: `ERR_MODULE_NOT_FOUND`로 실패한다.

- [ ] **Step 4: HTTP 서버와 안전한 정적 파일 제공 구현**

```js
export const HOST = "127.0.0.1";
export const PORT = 4310;

const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".woff2", "font/woff2"]
]);
```

정적 경로는 `decodeURIComponent(url.pathname)` 후 `path.resolve(distDir, "." + pathname)`로 계산하고 `distDir + path.sep` 밖이면 `403`을 반환한다. API 응답과 오류 응답에는 사용자 메시지·파일 내용·자식 프로세스 stderr를 넣지 않는다.

- [ ] **Step 5: 수집·재시작·종료 루프 구현**

```js
const RETRY_DELAYS_MS = [1000, 2000, 4000, 5000];

function nextRetryDelay(attempt) {
  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
}
```

구현 순서:

1. HTTP 포트를 먼저 바인딩한다.
2. `AppServerClient`와 이를 참조하는 `SnapshotStore`를 각각 한 번만 생성한다. `AppServerClient.start()` 뒤 최초 정상 스냅샷 전에는 `SnapshotStore.initialize()`, 이후에는 `SnapshotStore.collect()`을 호출한다.
3. 정상 수집과 JSONL `SESSION_READ_FAILED` 처리가 끝나면 공통 경로에서 정확히 하나의 3초 `setTimeout`을 예약한다. timer가 실행될 때 `lastSuccessfulAt === null`이면 같은 Store의 `initialize()`, 아니면 `collect()`을 호출한다. 겹치는 `setInterval`은 사용하지 않는다.
4. JSONL `SESSION_READ_FAILED`는 후보와 Tailer batch를 폐기하고 마지막 정상 스냅샷을 유지한 Error를 발행하되 같은 child PID를 유지하며 App Server `stop()`/`start()`을 호출하지 않는다.
5. `initialize`·`thread/list`·`thread/read`·`thread/goal/get` timeout, 요청 거절, 프로토콜 오류, App Server 종료 시 후보와 Tailer batch를 폐기하고 마지막 정상 스냅샷을 유지한 `errorCode: "APP_SERVER_UNAVAILABLE"`를 발행한다. 이 경우 3초 수집 timer를 예약하지 않고 기존 래퍼 프로세스 트리를 종료한 뒤 App Server 재시작 백오프로 넘긴다.
6. 1초, 2초, 4초, 이후 최대 5초 간격으로 같은 `AppServerClient`의 `start()`를 다시 호출한다. client 객체와 `SnapshotStore`를 재생성하거나 Store의 `appServer` 참조를 교체하지 않는다.
7. 재시작 성공 뒤 `store.snapshot.lastSuccessfulAt === null`이면 `initialize()`, 아니면 기존 registry·관찰값·Tailer offset·`monitorStartedAt`을 보존한 `collect()`을 호출한다. 성공하면 재시도 횟수를 0으로 되돌리고 `connected`를 발행한 뒤 공통 3초 timer 경로로 돌아간다.
8. `SIGINT`, `SIGTERM`에서 종료 플래그를 먼저 세우고 모든 수집·재시작 timer를 취소한다. 종료 플래그가 설정된 뒤 완료된 성공·오류 경로는 새 timer를 예약하지 않는다. HTTP 서버를 닫은 뒤 `AppServerClient.stop()`의 프로세스 트리 종료 완료를 기다린다.

- [ ] **Step 6: Windows 브라우저 열기와 npm 스크립트 추가**

브라우저는 `--open` 인자가 있을 때만 HTTP listen 이후 연다.

```js
function openBrowser(url) {
  const child = spawn("cmd.exe", ["/d", "/s", "/c", "start", "", url], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
}
```

`package.json`에 정확히 다음 스크립트를 추가한다.

```json
"monitor": "npm run build && node monitor/server.mjs --open"
```

- [ ] **Step 7: 서버와 회귀 테스트 통과 확인**

```powershell
node --test tests/monitor-server.test.mjs
npm test
npm run build
npm run test:sites
```

예상: 최초 정상 스냅샷 전 재시작은 `initialize()`, 이후 재시작은 같은 Store의 `collect()`을 사용한다. 두 번째 child PID로 수집하면서 기존 등록 세션·`monitorStartedAt`·`lastSuccessfulAt`·`catalogWatermark`를 보존하고, 10분 이상 장애 중 시작·완료된 루트와 하위 Thread까지 등록해 Connected로 복구한다. JSONL 오류는 같은 child PID와 정확히 하나의 3초 timer로 복구하고 종료 후 timer가 생기지 않는 테스트를 포함해 모두 통과하며 세 Sites 산출물이 존재한다.

- [ ] **Step 8: 커밋**

```powershell
git add monitor/server.mjs tests/monitor-server.test.mjs package.json
git commit -m "feat: run the monitor on a loopback server"
```

---

### Task 5: 실제 wire의 숫자·시각·변경 강조를 클라이언트 모델에 추가

**파일:**

- 수정: `src/agent-model.js:1-207`
- 수정: `tests/agent-model.test.mjs:1-181`

**인터페이스:**

- 소비: 이전·새 `Snapshot`
- 생산: `formatDuration(seconds)`, `formatTokenCount(tokens)`, `formatGoalStatus(status)`, `formatUtcTime(value)`
- 생산: `getSnapshotChanges(previous, next) -> Record<sessionId, SessionChanges>`

- [ ] **Step 1: 원시 값 포맷과 변경 비교 실패 테스트 작성**

```js
test("서버의 원시 시간과 토큰을 표시 문자열로 바꾼다", () => {
  assert.equal(formatDuration(65), "1:05");
  assert.equal(formatDuration(3605), "1:00:05");
  assert.equal(formatTokenCount(112840), "112,840");
  assert.equal(formatTokenCount(null), "—");
  assert.equal(formatGoalStatus("usageLimited"), "Usage limited");
  assert.equal(formatUtcTime("2026-07-26T06:00:02.000Z"), "06:00:02");
  assert.equal(formatUtcTime(null), "—");
});

test("직전 스냅샷과 달라진 토큰·Plan·하위 에이전트·활동만 표시한다", () => {
  const previousSnapshot = {
    sessions: [{
      id: "root",
      tokens: { root: 100, children: 20, total: 120 },
      plan: { tasks: [{ title: "수집기 구현", status: "active" }] },
      children: [{ id: "child-a", status: "running" }],
      activity: [{ id: "activity-1" }]
    }]
  };
  const nextSnapshot = {
    sessions: [{
      id: "root",
      tokens: { root: 140, children: 30, total: 170 },
      plan: { tasks: [{ title: "수집기 구현", status: "done" }] },
      children: [{ id: "child-a", status: "complete" }],
      activity: [{ id: "activity-2" }, { id: "activity-1" }]
    }]
  };
  const changes = getSnapshotChanges(previousSnapshot, nextSnapshot);

  assert.deepEqual(changes.root.tokenKeys, ["root", "children", "total"]);
  assert.deepEqual(changes.root.taskTitles, ["수집기 구현"]);
  assert.deepEqual(changes.root.childIds, ["child-a"]);
  assert.deepEqual(changes.root.handoffChildIds, ["child-a"]);
  assert.deepEqual(changes.root.activityIds, ["activity-2"]);
});
```

- [ ] **Step 2: 테스트를 실행해 실패 확인**

```powershell
node --test tests/agent-model.test.mjs
```

예상: 새 export가 없어 실패한다.

- [ ] **Step 3: 최소 포맷·diff 함수 구현**

```js
export function formatTokenCount(value) {
  return Number.isFinite(value) ? new Intl.NumberFormat("en-US").format(value) : "—";
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function formatUtcTime(value) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? "—" : new Date(time).toISOString().slice(11, 19);
}

const GOAL_STATUS_LABELS = {
  active: "Active",
  paused: "Paused",
  blocked: "Blocked",
  usageLimited: "Usage limited",
  budgetLimited: "Budget limited",
  complete: "Complete"
};

export function formatGoalStatus(status) {
  return GOAL_STATUS_LABELS[status] ?? "—";
}

export function getSnapshotChanges(previous, next) {
  const previousSessions = new Map(
    (previous?.sessions ?? []).map((session) => [session.id, session])
  );

  return Object.fromEntries((next?.sessions ?? []).map((session) => {
    const before = previousSessions.get(session.id);
    if (!before) {
      return [session.id, {
        tokenKeys: [],
        taskTitles: [],
        childIds: [],
        handoffChildIds: [],
        activityIds: []
      }];
    }
    const beforeTasks = new Map(
      (before?.plan?.tasks ?? []).map((task) => [task.title, task.status])
    );
    const beforeChildren = new Map(
      (before?.children ?? []).map((child) => [child.id, child.status])
    );
    const beforeActivities = new Set(
      (before?.activity ?? []).map((activity) => activity.id)
    );

    return [session.id, {
      tokenKeys: ["root", "children", "total"].filter(
        (key) => before?.tokens?.[key] !== session.tokens?.[key]
      ),
      taskTitles: (session.plan?.tasks ?? [])
        .filter((task) => beforeTasks.get(task.title) !== task.status)
        .map((task) => task.title),
      childIds: (session.children ?? [])
        .filter((child) => beforeChildren.get(child.id) !== child.status)
        .map((child) => child.id),
      handoffChildIds: (session.children ?? [])
        .filter((child) => (
          child.status === "complete" &&
          beforeChildren.get(child.id) !== "complete"
        ))
        .map((child) => child.id),
      activityIds: (session.activity ?? [])
        .filter((activity) => !beforeActivities.has(activity.id))
        .map((activity) => activity.id)
    }];
  }));
}
```

새 스냅샷에 존재하는 세션만 결과에 넣고 입력 객체를 변경하지 않는다. 처음 표시되는 루트는 모든 변경 배열을 비워 초기 로드 애니메이션을 만들지 않는다. 이후 새로 발견되거나 비완료 상태에서 `complete`로 전환된 하위 Thread만 `handoffChildIds`에 넣는다. `App.jsx`가 아직 소비하는 `applySimulationEvent`와 해당 데모 테스트는 이 태스크에서 유지하고 Task 6에서 소비자와 함께 제거한다.

- [ ] **Step 4: 모델 테스트 통과 확인**

```powershell
node --test tests/agent-model.test.mjs
npm test
npm run build
```

예상: 정렬·5행·상대 시각 회귀를 포함한 테스트와 기존 App import를 사용하는 빌드가 모두 통과한다.

- [ ] **Step 5: 커밋**

```powershell
git add src/agent-model.js tests/agent-model.test.mjs
git commit -m "feat: compare and format live snapshots"
```

---

### Task 6: React를 실제 스냅샷 공급자와 연결

**파일:**

- 수정: `src/agent-model.js`
- 수정: `src/App.jsx:1-1200`
- 수정: `src/styles.css:151-162,217-244,445-489,1133-1176`
- 수정: `tests/agent-model.test.mjs`
- 수정: `tests/app-identity.test.mjs:1-19`

**인터페이스:**

- 소비: `GET /api/snapshot`
- 소비: Task 5의 포맷·diff 함수
- 생산: Connected·Syncing·Error 표시, Live/Paused 화면 적용, `codex://threads/{threadId}`

- [ ] **Step 1: 실제 데이터 정체성 실패 테스트 작성**

`tests/app-identity.test.mjs`의 `Demo mode` 기대를 다음 계약으로 바꾼다.

```js
test("실제 로컬 Codex 스냅샷을 사용한다", () => {
  assert.match(appSource, /\/api\/snapshot/);
  assert.match(appSource, /codex:\/\/threads\//);
  assert.match(appSource, /currentActivity\?\.label/);
  assert.match(appSource, /currentWork\?\.turnId/);
  assert.match(appSource, /activity\.id/);
  assert.match(appSource, /handoffChildIds/);
  assert.doesNotMatch(appSource, /Demo mode|simulationEvents|applySimulationEvent/);
  assert.doesNotMatch(appSource, /currentWork\.note|goal\.(?:title|detail|checkpoint)/);
  assert.doesNotMatch(appSource, /session\.current(?:Step|Tool)|child\.(?:currentStep|session|tasks|work)/);
});
```

- [ ] **Step 2: 테스트를 실행해 실패 확인**

```powershell
node --test tests/app-identity.test.mjs
```

예상: 기존 데모 문자열 때문에 실패한다.

- [ ] **Step 3: 데모 fixture와 타이머를 제거하고 3초 폴링 연결**

`sessions`, `simulationEvents`, `demoStartedAt`, `eventIndex`, `showDemoNotice`, `lastAppliedEvent`를 제거한다. 초기 상태는 다음과 같이 둔다.
같은 변경에서 `App.jsx`의 `applySimulationEvent` import·호출, `src/agent-model.js` export, 해당 데모 모델 테스트를 함께 제거한다.

```js
const EMPTY_SNAPSHOT = {
  collectedAt: null,
  lastSuccessfulAt: null,
  connectionStatus: "syncing",
  errorCode: null,
  sessions: []
};
```

`App`은 표시 스냅샷, 최신 수신 스냅샷 ref, 적용 완료 스냅샷 ref, 변경 맵을 분리한다.

```js
const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
const [feedStatus, setFeedStatus] = useState({
  connectionStatus: "syncing",
  lastSuccessfulAt: null
});
const [changes, setChanges] = useState({});
const latestSnapshot = useRef(EMPTY_SNAPSHOT);
const appliedSnapshot = useRef(EMPTY_SNAPSHOT);
const isLiveRef = useRef(true);

const applySnapshot = useCallback((next) => {
  setChanges(getSnapshotChanges(appliedSnapshot.current, next));
  appliedSnapshot.current = next;
  setSnapshot(next);
}, []);
```

폴링 effect는 즉시 한 번 호출한 뒤 3초마다 `fetch("/api/snapshot", { cache: "no-store" })`를 호출한다. 응답이 오면 `latestSnapshot.current`와 `feedStatus`는 Live/Paused와 관계없이 갱신한다. Live일 때만 `getSnapshotChanges(appliedSnapshot.current, next)`를 계산하고 표시 스냅샷을 적용한다. fetch 자체가 실패하면 표시 세션은 유지하고 `feedStatus.connectionStatus`만 `error`로 바꾼다.

- [ ] **Step 4: Live/Paused 전환과 선택 유지 연결**

버튼 handler는 ref와 React state를 같은 tick에서 갱신한다.

```js
const toggleLive = () => {
  setIsLive((current) => {
    const next = !current;
    isLiveRef.current = next;
    if (next) applySnapshot(latestSnapshot.current);
    return next;
  });
};
```

Paused에서는 세션·상대 시각·변경 강조를 고정한다. Live 복귀 시 중간 스냅샷을 재생하지 않고 `latestSnapshot.current` 한 개만 적용한다. 기존 선택 ID가 새 스냅샷에도 있으면 유지하고, 없을 때만 첫 루트로 이동해 기존 안내를 표시한다.

- [ ] **Step 5: 기존 컴포넌트가 실제 wire를 직접 소비하도록 외과적으로 수정**

별도 표시 모델이나 새 컴포넌트 계층을 만들지 않고 현재 컴포넌트에서 다음 대응을 사용한다.

- `visibleSessions` 입력을 `snapshot.sessions`로 바꾼다.
- `AgentMark`는 루트에 `Path/#5ed6c6`, 하위에 `Robot/#8fa9ff`를 클라이언트에서 선택한다.
- 루트 행은 `Codex / Root agent`, 하위 행은 `agentNickname/agentRole` 값을 사용한다.
- 목록·상세의 활동 문구는 `currentActivity?.label`, Live step은 `currentActivity?.step`, 도구명·경과 시간은 `currentActivity?.label/startedAt`을 사용한다. `currentActivity` 객체 자체는 JSX child로 전달하지 않는다.
- duration·tokens·Goal 상태·UTC 사건 시각은 Task 5의 `formatDuration`, `formatTokenCount`, `formatGoalStatus`, `formatUtcTime`을 사용한다. 시작 시각은 `Started ${formatUtcTime(startedAt)}`로 표시한다.
- 현재 작업은 `currentWork?.turnId`와 `currentWork?.title`만 표시하고 기존 `id`, `note` UI는 제거한다.
- Goal은 `objective`, `formatGoalStatus(status)`, `tokensUsed/tokenBudget`, `timeUsedSeconds`만 표시한다. Goal 또는 예산이 없으면 기존 빈 상태와 `—`를 사용한다.
- 최근 활동은 `activity.id`를 React key, `activity.at`을 UTC 시각, `activity.label`을 본문으로 사용한다. `kind`는 데이터 속성이나 class 구분에만 사용하고 새 문구를 생성하지 않는다.
- 하위 행은 `agentNickname ?? threadId.slice(0, 8)`, `agentRole ?? "Child agent"`, `currentActivity?.step/label`, `currentWork?.title`, 포맷된 `tokens`, `getPlanProgress(plan)`, 포맷된 Goal을 사용한다. 선택 inspector도 `currentWork?.title`과 `skills`만 표시한다.
- `SessionDetail`은 없는 `currentWork`, Plan, Goal, skills, children, activity를 안전한 빈 상태로 렌더링한다.
- `lastEvent`/`eventId` 대신 `changes[session.id]`와 `snapshot.collectedAt`을 `SessionRow`, `TaskList`, `ChildAgents`, `SessionDetail`에 전달한다. `tokenKeys`, `taskTitles`, `childIds`, `activityIds`는 각각 토큰 숫자, Plan 행, 상위 목록 하위 수, 최근 활동 행만 한 번 강조한다.
- `ChildAgents`는 `handoffChildIds`에 포함된 `complete` 하위 행에만 기존 `agent-mark--handoff`를 한 번 적용한다. 일반 상태 변경에는 handoff를 적용하지 않는다.
- 변경된 값의 animation key에는 `snapshot.collectedAt`, 최근 활동의 안정 key에는 `activity.id`를 사용한다. 배열 index나 제거된 데모 `eventId`를 key로 사용하지 않는다.
- `Open in Codex` 버튼은 사용자 클릭에서 `window.location.href = "codex://threads/" + session.threadId`를 실행한다.
- footer와 feed label의 `Demo mode`를 Connected·Syncing·Error와 마지막 정상 수집 상대 시각으로 교체한다.
- 목록 높이, 정렬 header button, `aria-sort`, `aria-pressed`, reduced motion CSS는 유지한다.

- [ ] **Step 6: 연결 상태 CSS만 추가**

기존 `live-dot`, `feed-state`, `app-toast`를 재사용하고 아래 상태 modifier만 추가한다.

```css
.connection-state--connected { color: var(--mint); }
.connection-state--syncing { color: var(--amber); }
.connection-state--error { color: var(--red); }
```

세 값은 현재 `src/styles.css`의 기존 `:root` custom property를 그대로 재사용한다.

- [ ] **Step 7: UI 회귀 테스트와 빌드 통과 확인**

```powershell
npm test
npm run build
npm run test:sites
```

예상: `Demo mode`가 소스에서 사라지고 기존 Sites 산출물이 유지된다.
비어 있지 않은 wire에서 current activity 객체 렌더 오류가 없고, 현재 작업·Goal·최근 활동·하위 Thread가 위 필드 계약대로 표시되며 `handoffChildIds`의 완료 전환만 한 번 펄스한다.

- [ ] **Step 8: 커밋**

```powershell
git add src/agent-model.js src/App.jsx src/styles.css tests/agent-model.test.mjs tests/app-identity.test.mjs
git commit -m "feat: connect the dashboard to live snapshots"
```

---

### Task 7: 실제 로컬 세션으로 종단 검증하고 그래프 갱신

**파일:**

- 수정: 구현 결함이 확인된 위 태스크의 파일만 수정
- 갱신: `graphify-out/`의 기존 추적 산출물

**인터페이스:**

- 소비: 실제 `codex-cli`, 실제 로컬 JSONL, 브라우저
- 생산: 재현 가능한 명령 검증과 육안 확인 결과

- [ ] **Step 1: 전체 자동 검증 실행**

```powershell
npm test
npm run build
npm run test:sites
```

예상:

- 모든 Node 테스트 통과
- `dist/client/index.html` 존재
- `dist/server/index.js` 존재
- `dist/.openai/hosting.json` 존재

- [ ] **Step 2: 실제 모니터 실행**

```powershell
npm run monitor
```

예상:

- 브라우저가 `http://127.0.0.1:4310`을 연다.
- 터미널에 포트 변경 없이 `127.0.0.1:4310` 준비 완료가 표시된다.
- 모니터의 직접 자식으로 `cmd.exe /d /s /c codex.cmd app-server --listen stdio://` 래퍼가, 그 하위에 Codex App Server 프로세스가 실행된다.

- [ ] **Step 3: API 계약 확인**

별도 PowerShell에서 다음을 실행한다.

```powershell
$snapshot = Invoke-RestMethod 'http://127.0.0.1:4310/api/snapshot'
$snapshot.connectionStatus
$snapshot.sessions | Select-Object id,parentSessionId,status,lastActivityAt
$snapshot.sessions | ForEach-Object { $_.children | Select-Object id,parentSessionId,status }
```

예상:

- 연결 성공 시 `connected`
- 상위 `sessions`의 `parentSessionId`는 모두 비어 있음
- 하위 Thread는 각 부모의 `children`에만 존재
- 서버 시작 전 오래된 미완료·종료 세션은 없음
- 외부 `notLoaded` Thread의 미해결 `request_user_input`은 `needs_input`

- [ ] **Step 4: 브라우저 상호작용 확인**

다음 순서로 확인한다.

1. 목록 데이터 영역이 정확히 5행 높이이고 초과 세션만 내부 스크롤한다.
2. 기본 순서가 관심 필요, 실행 중, 대기, 계획, 비활성, 완료 순이다.
3. 미해결 `request_user_input`이 있는 외부 루트가 관심 필요 그룹에 표시되고, 결과가 기록되면 현재 Turn의 다음 상태로 내려간다.
4. 컬럼 정렬 후에도 선택 상세가 유지된다.
5. Live에서 약 3초마다 토큰·Plan·활동·하위 에이전트 변화가 함께 반영된다.
6. Paused에서 화면이 고정되고 Live 복귀 시 최신 상태로 한 번에 이동한다.
7. 10분 이상 갱신 없는 등록 세션이 사라지지 않고 Idle로 내려간다.
8. 완료 세션이 남고 새 Turn 시작 시 Running으로 돌아온다.
9. 하위 에이전트는 선택 부모 상세에만 표시된다.
10. `Open in Codex`가 `codex://threads/{threadId}`를 연다.
11. 콘솔에 반복 fetch 오류, React key 경고, 직렬화 오류가 없다.
12. reduced motion 환경에서 반복·행 이동·handoff 애니메이션이 정지한다.

- [ ] **Step 5: App Server 복구와 포트 충돌 확인**

실행 중인 App Server 자식 프로세스만 다음 명령으로 찾아 종료한다.

```powershell
$monitorNode = Get-CimInstance Win32_Process |
  Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'monitor[\\/]server\.mjs' } |
  Select-Object -First 1
$appServerWrapper = Get-CimInstance Win32_Process |
  Where-Object {
    $_.ParentProcessId -eq $monitorNode.ProcessId -and
    $_.Name -eq 'cmd.exe' -and
    $_.CommandLine -match 'codex\.cmd app-server --listen stdio://'
  } |
  Select-Object -First 1
$appServer = Get-CimInstance Win32_Process |
  Where-Object { $_.ParentProcessId -eq $appServerWrapper.ProcessId } |
  Select-Object -First 1
Stop-Process -Id $appServer.ProcessId
```

화면이 마지막 정상 스냅샷을 유지한 채 Error로 바뀌고 최대 5초 간격 재시작 뒤 Connected로 복구되는지 확인한다.
복구 후 위 조회를 다시 실행해 `$appServerWrapper`와 `$appServer`를 새 프로세스 PID로 갱신해 둔다.

다음에는 모니터를 종료하고 별도 PowerShell에서 `4310` 포트를 점유한다.

```powershell
$portGuard = [System.Net.Sockets.TcpListener]::new(
  [System.Net.IPAddress]::Loopback,
  4310
)
$portGuard.Start()
```

다른 터미널에서 `npm run monitor`를 실행해 명확한 `EADDRINUSE` 오류와 비정상 종료를 확인하고, 다른 포트에서 서버가 열리지 않는지 확인한다. 확인 후 포트 점유를 해제한다.

```powershell
$portGuard.Stop()
```

종료 처리 검증을 위해 `npm run monitor`를 다시 실행하고, Step 5의 조회로 새 `$monitorNode`, `$appServerWrapper`, `$appServer` PID를 기록한다.

- [ ] **Step 6: 종료 처리 확인**

모니터 터미널에서 `Ctrl+C`를 누른다.

```powershell
Get-NetTCPConnection -LocalPort 4310 -ErrorAction SilentlyContinue
Get-Process -Id $appServerWrapper.ProcessId,$appServer.ProcessId -ErrorAction SilentlyContinue
```

예상: 모니터가 열었던 4310 listener, 기록해 둔 cmd 래퍼와 그 App Server 프로세스가 남지 않는다. 사용자가 별도로 실행한 다른 Codex 프로세스는 종료하지 않는다.

- [ ] **Step 7: 지식 그래프 갱신**

```powershell
graphify update .
```

예상: `graphify-out/graph.json`과 관련 추적 산출물이 새 `monitor/` 모듈 및 `src/App.jsx` 연결을 반영한다.

- [ ] **Step 8: 최종 커밋**

구현 검증 중 수정이 있었다면 요청과 직접 관련된 파일만 커밋한다.

```powershell
git add monitor src/App.jsx src/agent-model.js src/styles.css tests package.json
git commit -m "fix: complete local Codex monitor verification"
git add -u graphify-out
git commit -m "chore: refresh code graph"
```

첫 번째 커밋에 staged 변경이 없으면 생략한다. 두 번째 커밋은 추적 중인 graphify 산출물이 바뀐 경우에만 실행한다.

## 스펙 커버리지

| 스펙 요구 | 구현 태스크 |
|---|---|
| App Server stdio·읽기 전용·버전 계약 | Task 1 |
| CODEX_HOME·증분 JSONL·불완전 줄 | Task 2 |
| 현재 Turn 상태 우선순위·도구·Plan·스킬 | Task 2 |
| 모든 로컬 루트 source의 최초 등록·생성/새 Turn 증거 기반 실행 중 등록·Idle·완료 유지·재개 | Task 3 |
| 루트/하위 분리·Goal·토큰·최근 활동 | Task 3 |
| 127.0.0.1:4310·API·정적 빌드·재시작·종료 | Task 4 |
| `npm run monitor`·브라우저 자동 실행 | Task 4 |
| 원시 숫자/시각 표시·변경 강조 | Task 5 |
| Live/Paused·선택·정렬·5행·딥 링크·연결 상태 | Task 6 |
| 자동 회귀·실제 로컬 세션·복구·포트 충돌 | Task 7 |
