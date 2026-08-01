# 알림 sink 설정 및 검증 (#220)

> **상태**: ✅ **완료(2026-07-31).** 코드 배선(PR #231) → `SLACK_WEBHOOK_URL` 등록 → 합성 경보 도착 확인까지 끝났다.
> 경보는 xzawed 워크스페이스 **`#alerts`** 채널(Slack 앱 `xzawed alerts`)로 간다.
> 배경·결정·실측: [ADR](../decisions/2026-07-30-monitoring-sink-slack-only.md)

sink는 **Slack 하나로 고정**했다. Sentry SaaS는 의도적으로 도입하지 않으며, 미동작 스캐폴딩은 2026-08-01에 제거했다 ([ADR](../decisions/2026-08-01-remove-unused-sentry-scaffolding.md)).

아래 절차는 **webhook을 재발급하거나 채널을 옮길 때** 다시 쓰는 문서다.

> ⚠️ **빈 문자열은 미설정과 같다.** `sendSlackAlert`는 `if (!webhookUrl)`로 판정하므로 키만 있고
> 값이 비면 크래시 없이 조용히 no-op이 된다 — 2026-07-31 이전 프로덕션이 정확히 이 상태였다.
> 점검할 때 **키 존재가 아니라 값 길이**를 확인할 것.

---

## 1. Slack Incoming Webhook URL 발급 (사용자 작업)

1. <https://api.slack.com/apps> → **Create New App** → **From scratch**
2. 앱 이름(예: `xzawed alerts`) + 워크스페이스 선택
3. 좌측 **Features → Incoming Webhooks** → 토글 **On**
4. 하단 **Add New Webhook to Workspace** → **경보를 받을 채널** 선택 → Allow
5. 생성된 URL 복사 — `https://hooks.slack.com/services/T.../B.../xxxxx` 형태

> 채널은 **실제로 보는 곳**으로 잡을 것. 아무도 안 보는 채널의 경보는 sink가 없는 것과 같다.
> 전용 채널(`#alerts` 등)을 새로 만드는 편이 낫다.

## 2. Railway에 등록

| 방법 | 명령 | 비고 |
|---|---|---|
| **대시보드 (권장)** | 서비스 → **Variables** → New Variable | 값이 셸 히스토리·프로세스 목록 어디에도 안 남는다 |
| CLI + stdin | `railway variable set SLACK_WEBHOOK_URL --stdin` | 프롬프트에 붙여넣기. 인자로 안 남는다 |
| CLI 인자 | `railway variable set "SLACK_WEBHOOK_URL=https://..."` | **셸 히스토리에 평문으로 남는다.** 쓰면 이후 정리할 것 |

변수 설정은 **재배포를 자동 트리거**한다. env 단독 변경 재배포는 정상 동작하며(`WAITING` → `SUCCESS`),
`FAILED`면 실제 실패이니 로그를 수집한다 — 판별 기준은 [CLAUDE.md "Railway 배포 상태 판별"](../../CLAUDE.md).

### 주의

- **webhook URL은 시크릿이다.** 가진 사람은 누구나 그 채널에 글을 쓸 수 있다. 커밋·이슈·PR 금지.
- 형식이 `https://hooks.slack.com/services/`로 시작하지 않으면 `sendSlackAlert`가 조용히 실패하고 `logger.warn`만 남는다.
- 유출 시 Slack 앱 화면에서 해당 webhook을 삭제하면 즉시 무효화된다.

## 3. 등록 확인 (값을 보지 않고)

```bash
railway variable list | grep -c SLACK_WEBHOOK_URL      # 키 존재 여부(1이면 등록됨)
railway logs -d <deployment-id> | grep 'SLACK_WEBHOOK_URL 미설정'   # 사라졌으면 적용됨
```

---

## 4. 합성 경보로 실제 도착 확인 — **이게 #220의 완료 조건이다**

설정만 하고 끝내지 않는다. 관리자 엔드포인트를 새로 만들지 않고 **실제 백업 실패 경로를 그대로** 유발한다.

### ⚠️ 먼저 알아야 할 제약 — 재배포하면 복구 경보가 안 온다

`scheduleBackups`의 상태(`healthy`)는 **클로저 로컬**이라 프로세스마다 초기화된다.

| 시나리오 | 전이 | 경보 |
|---|---|---|
| 프로브 env 설정 → 재배포 → 부팅 백업 실패 | `null → fail` | **error 경보 발송** ✅ |
| env 되돌림 → 재배포 → 부팅 백업 성공 | `null → true` | **경보 없음** ❌ (복구가 아니라 첫 성공) |

**즉 env 되돌리기만으로는 복구 경보를 검증할 수 없다.** 아래 A는 실패 경보만, B는 양방향을 검증한다.

### A. 실패 경보만 검증 (간단 — 이것으로 #220 완료 조건 충족)

```bash
# 1) 프로브: 만들 수 없는 백업 경로로 바꾼다 (/etc는 root 소유, 앱은 nextjs로 실행)
railway variable set "SQLITE_BACKUP_DIR=/etc/cws-probe-backups"

# 2) 재배포 완료를 기다린다 (WAITING → BUILDING → SUCCESS)
railway deployment list --json | head -20

# 3) Slack 채널에 아래 형태의 메시지가 도착하는지 확인
```

```
🔴 SQLite 백업 실패
주기 백업이 실패했습니다. 볼륨·디스크·경로를 확인하세요.
• dir: /etc/cws-probe-backups
• error: EACCES: permission denied, mkdir '/etc/cws-probe-backups'
• consecutiveFailures: 1
환경: production | 2026-..-..T..:..:..Z
```

```bash
# 4) 반드시 되돌린다 — 프로브를 남기면 진짜 백업이 계속 실패한다
railway variable delete SQLITE_BACKUP_DIR
railway redeploy    # delete는 재배포를 트리거하지 않는다(실측 quirk) — 수동 재배포 필수

# 5) 원복 확인: 백업이 다시 생기는지
railway ssh "ls -la /data/backups | tail -3"
```

> **`railway variable delete`는 재배포를 트리거하지 않는다.** 삭제한 변수는 다음 배포에서야
> 컨테이너에서 사라지므로 **수동 재배포가 필수**다. 이걸 빠뜨리면 백업이 계속 실패한다.

### B. 실패 + 복구 양방향 검증 (선택 — 한 프로세스 안에서 전이시킨다)

복구 경보까지 보려면 **재배포 없이** 실패→성공을 만들어야 한다. 볼륨 위 디렉터리 권한으로 만든다.

```bash
# 1) 쓰기 불가 부모 디렉터리를 미리 만든다
railway ssh "mkdir -p /data/probe && chmod 500 /data/probe && ls -ld /data/probe"

# 2) 그 아래를 백업 경로로 지정 + 주기를 60초로 단축
railway variable set "SQLITE_BACKUP_DIR=/data/probe/backups"
railway variable set "SQLITE_BACKUP_INTERVAL_MS=60000"
# → 재배포. 부팅 백업이 EACCES로 실패 → 🔴 실패 경보 도착

# 3) 재배포 없이 권한만 푼다 → 다음 tick(≤60초)이 성공
railway ssh "chmod 700 /data/probe"
# → ℹ️ SQLite 백업 복구 경보 도착 (같은 프로세스라 fail→success 전이가 잡힌다)

# 4) 원복
railway variable delete SQLITE_BACKUP_DIR
railway variable delete SQLITE_BACKUP_INTERVAL_MS
railway redeploy
railway ssh "rm -rf /data/probe"
```

복구 경보 형태:

```
ℹ️ SQLite 백업 복구
백업이 정상 복구되었습니다. (연속 실패 1회 후)
• dir: /data/probe/backups
• consecutiveFailures: 1
환경: production | ...
```

> B를 건너뛰어도 무방하다 — 복구 경보는 실패 경보와 **같은 `safeAlert` → `sendSlackAlert` 경로**를 쓰므로,
> 실패 경보가 도착하면 배선 자체는 검증된 것이다. 전이 매트릭스 6종은 단위 테스트가 고정하고 있다.

---

## 5. 2026-07-31 실행 기록

위 절차를 그대로 수행해 **A(실패 경보만)로 완료 조건을 충족**했다.

| 시각(UTC) | 단계 |
|---|---|
| 11:07 | Slack 앱 `xzawed alerts` 생성 · Incoming Webhooks On · `#alerts` 채널 신설 후 웹훅 발급 |
| 11:18 | 웹훅 단독 스모크 테스트 — `HTTP 200 / ok`, 메시지 도착 확인 |
| 11:29 | `SLACK_WEBHOOK_URL` 등록 → 자동 재배포 → 11:34 `SUCCESS` |
| 11:35 | 프로브 `SQLITE_BACKUP_DIR=/etc/cws-probe-backups` 설정 → 재배포 → 11:37:59 `SUCCESS` |
| 11:37:58 | 🔴 **SQLite 백업 실패 경보 `#alerts` 도착** (EACCES, `consecutiveFailures: 1`) |
| 11:38 | 프로브 삭제 → **수동 재배포**(delete는 트리거 안 함) → 11:40:28 `SUCCESS` |
| 11:40 | 백업 정상 재개(`app-20260731-114008.db`), `/etc/cws-probe-backups` 잔재 없음 |

B(복구 경보)는 건너뛰었다. 대신 **복구 경보가 오지 않는다는 것 자체를 확인**했다 — 재배포로
`healthy`가 리셋되어 `null → true`(첫 성공)가 되기 때문이며, 이 문서 4절의 제약 설명과 일치한다.

### 걸린 지점 (다음에 반복하지 말 것)

- **Railway CLI가 약 15분간 전 요청 타임아웃**했다. GraphQL 엔드포인트는 같은 시각 0.18초에 200을 반환했으므로
  API 장애가 아니라 CLI 문제다. 막히면 `backboard.railway.com/graphql/v2`에 직접 `variableUpsert`/
  `deploymentRedeploy`를 호출해 우회할 수 있다(토큰은 `~/.railway/config.json`).
- **Git Bash에서 `/etc/...` 같은 값을 인자로 넘기면 MSYS 경로 변환이 `C:/Program Files/Git/etc/...`로 망가뜨린다.**
  리눅스에서는 상대경로로 해석돼 mkdir이 **성공**하므로 프로브가 조용히 무효가 된다. `MSYS_NO_PATHCONV=1`을 붙일 것.
- **브라우저 자동화로 이 작업을 하면 스냅샷 파일에 webhook URL이 평문으로 남는다.**
  `.playwright-mcp/`를 `.gitignore`에 넣어 둔 이유다(2026-07-31 추가).

---

## 이번 범위 밖 (sink가 살아난 뒤 별도 판단)

- 배포 레이트리밋 환불 실패(`deploy/route.ts`) · 이벤트 persist 실패(`eventPersister.ts`) — 의도적으로 삼키는 best-effort 경로
- 다일 장애 재알림(시간 윈도 리마인더) — 전이 1회로 충분한지 운영 데이터를 보고 판단
- `errorRateMonitor` 임계값(`ERROR_RATE_ALERT_THRESHOLD`, 기본 5회/5분) 조정 — 실경보를 받아 본 뒤에
