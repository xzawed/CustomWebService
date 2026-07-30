# 알림 sink 설정 및 검증 (#220)

> **상태**: 코드 배선 완료(PR #231). **`SLACK_WEBHOOK_URL` 등록과 도착 확인만 남았다.**
> 배경·결정: [ADR](../decisions/2026-07-30-monitoring-sink-slack-only.md)

sink는 **Slack 하나로 고정**했다. Sentry는 의도적으로 도입하지 않는다(env·config는 되돌릴 수 있게 보존).

현재 `SLACK_WEBHOOK_URL`이 비어 있어 `sendSlackAlert`는 `logger.warn` 한 줄만 남기고 반환한다 —
**경보 경로는 살아 있으나 아무 곳에도 도착하지 않는다.**

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

## 5. 완료 후 갱신할 것

- [ ] [#220](https://github.com/xzawed/CustomWebService/issues/220) 종료
- [ ] [CLAUDE.md](../../CLAUDE.md)의 `SENTRY_DSN`/`SLACK_WEBHOOK_URL` 항목에서 "설정 전까지 유실" 문구 갱신
- [ ] [env-vars.md](../reference/env-vars.md) 모니터링 절의 ⚠️ 경고 갱신
- [ ] [ADR](../decisions/2026-07-30-monitoring-sink-slack-only.md)의 "아직 완료되지 않은 것" 절에 도착 확인 결과 기록

---

## 이번 범위 밖 (sink가 살아난 뒤 별도 판단)

- 배포 레이트리밋 환불 실패(`deploy/route.ts`) · 이벤트 persist 실패(`eventPersister.ts`) — 의도적으로 삼키는 best-effort 경로
- 다일 장애 재알림(시간 윈도 리마인더) — 전이 1회로 충분한지 운영 데이터를 보고 판단
- `errorRateMonitor` 임계값(`ERROR_RATE_ALERT_THRESHOLD`, 기본 5회/5분) 조정 — 실경보를 받아 본 뒤에
