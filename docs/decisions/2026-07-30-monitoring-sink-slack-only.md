# 알림 sink를 Slack으로 고정하고 백업 실패를 배선 (#220)

- 날짜: 2026-07-30
- 상태: 채택
- 관련: [#220](https://github.com/xzawed/CustomWebService/issues/220), PR #231
- **선행 결정을 뒤집음**: 2026-04-27 "SLACK_WEBHOOK_URL·errorRateMonitor 사용 안 함"

## 배경

프로덕션에 활성 에러·알림 sink가 없었다(실측 2026-07-29).

```
SENTRY_DSN             = (미등록)
NEXT_PUBLIC_SENTRY_DSN = (미등록)
SLACK_WEBHOOK_URL      = (빈 값)
```

코드 경로는 멀쩡했다 — `errorRateMonitor`가 5분 윈도우 내 `CODE_GENERATION_FAILED` 임계 초과를
감지해 `sendSlackAlert`를 호출한다. 다만 webhook 미설정이면 `sendSlackAlert`가 `logger.warn` 한 줄
남기고 반환하고(`slackAlert.ts:22-25`), Sentry는 DSN 없으면 `enabled: false`로 부팅한다.
**결과적으로 생성 실패율 경보가 아무 곳에도 전달되지 않았다.**

## 선행 결정을 뒤집는 근거

2026-04-27에 **"SLACK_WEBHOOK_URL / errorRateMonitor 사용 안 함"**으로 결정한 이력이 있다.
근거는 기록돼 있지 않고 ADR도 없다(같은 시기 "ENCRYPTION_KEY 회전 보류", "Cloudflare 도입 안 함"과
함께 한 줄로만 남아 있다).

**뒤집는 이유**: 그 사이 서비스 성격이 바뀌었다. 2026-06-24 공개 셀프서비스 회원가입 전환으로
다수 실사용자가 쓰는 서비스가 됐고, 단일 인스턴스 + 볼륨 위 임베디드 SQLite라 조용한 실패의
대가가 커졌다. 알림이 필요 없다는 판단의 전제가 사라졌다.

> 사용자 결정(2026-07-30): **"에러는 알려야 합니다. 현행유지로 가야합니다."**

이 두 문장이 이 ADR의 두 축이다 — **알림은 필요하다**(2026-04-27 뒤집기), **그러나 모니터링을
재설계하지 않는다**(현행 경로 그대로).

## 결정

### 1. sink는 Slack 하나로 고정한다. Sentry는 도입하지 않는다.

| | 덮는 범위 | 채택 |
|---|---|---|
| Slack (`sendSlackAlert`) | `errorRateMonitor`가 판단한 도메인 이벤트 + 백업 실패 | **채택** |
| Sentry | 라우트 미처리 예외, 클라이언트 런타임 에러 | 미도입 |

Slack을 고른 이유는 **코드 경로가 이미 존재**한다는 것이다. 필요한 경보(생성 실패율·백업 실패)가
둘 다 도메인 이벤트라 새 SDK·프로젝트 생성 없이 env 하나로 살아난다. Sentry는 더 넓은 층을
덮지만 도입 비용이 있고, "현행유지" 방침에서 벗어난다.

Sentry 관련 env와 config 파일은 코드에 남겨 둔다 — 지우면 나중에 도입할 때 다시 만들어야 하고,
미설정 시 `enabled: false`로 조용히 비활성이라 해가 없다. **되돌릴 수 있는 결정으로 남긴다.**

### 2. 백업 실패를 sink로 배선한다 (이번 PR의 유일한 코드 변경)

이슈에서 "가장 아프다"고 판단한 항목이다. `scheduleBackups`의 `tick()`이 실패를
`logger.error`로만 남기고 있었다(`backup.ts:129`). 단일 인스턴스 + 볼륨 위 SQLite에서
백업이 조용히 죽으면 **복구가 필요한 순간에야** 알게 된다.

**상태 전이 경보**로 설계했다(매 주기 경보가 아니다):

| 전이 | 경보 | level |
|---|---|---|
| `null → fail` (최초 실행 실패) | **발송** | error |
| `true → false` (성공 후 실패) | **발송** | error |
| `false → false` (연속 실패) | 억제 | — |
| `false → true` (복구) | **발송** | info |
| `true → true` | 없음 | — |
| `null → true` (최초 성공) | 없음 | — |

- **최초 실행 실패도 경보한다** — 선행 성공이 없다고 기다리면 그게 바로 조용한 죽음이다.
- **복구도 경보한다** — 억제 이후 운영자에게 해결됐다는 신호가 없으면 억제가 정보를 삼킨다.
- `SQLITE_BACKUP_INTERVAL_MS`가 설정 가능하므로, 짧은 주기에서 매 틱 경보는 폭주가 된다.

### 3. 경보가 스케줄러를 깨뜨릴 수 없게 한다 (이 변경의 핵심 안전 속성)

**알림 실패가 백업 스케줄러를 죽이면 알림 없는 지금보다 엄격히 나쁘다.** 순서를 못박는다:

```
1) logger.error  ─ 동기, 최우선. 경보 여부와 무관하게 반드시 남는다
2) 상태 전이     ─ 동기. 경보 발사 전에 갱신해야 완료 순서가 겹쳐도 이중 경보가 안 난다
3) safeAlert     ─ void Promise.resolve(alertFn(...)).catch(...)
```

`sendSlackAlert`는 내부적으로 try/catch하지만 **비-reject 보장이 없다** — `try` 이전에서 던지는
경로, 주입된 `alertFn`, 향후 수정이 전부 위험이다. `tick()`은 `void runFn(...).then(onOk, onErr)`
형태라 **핸들러가 던지거나 async 핸들러가 reject하면 `unhandledRejection`이 된다**
(`EventBus.emit`은 핸들러를 `.catch`로 감싸므로 `errorRateMonitor`가 `await sendSlackAlert`를
안전하게 할 수 있지만, 백업에는 그 래퍼가 없다).

따라서 **`onReject` 안에서 `await alertFn`을 하지 않는다.** 경보는 별도 voided promise로 분리한다.

상태는 **클로저 로컬**이다(모듈 레벨 플래그 없음). 인스턴스가 독립적이라 테스트가
`vi.resetModules()`를 쓸 필요가 없다(`eventPersister.ts`가 모듈 레벨 `let registered` 때문에
동적 import로 격리해야 하는 것과 대비된다). `alertFn`은 `ScheduleDeps`로 주입한다.

### 4. 경보 payload에 넣지 않는 것

넣는 것: `dir`(`config.dir`), `error`(message만, `.slice(0, 200)`), `consecutiveFailures`.

넣지 않는 것: 스택 트레이스, env 값, `SQLITE_PATH`(`dir`과 중복), 원본 `err` 객체.
better-sqlite3 백업 오류는 대체로 EACCES·디스크 풀·경로라 시크릿 유출 위험은 낮지만
표면을 좁게 유지한다.

## 아직 완료되지 않은 것 (#220은 열려 있다)

**이 PR은 코드 배선까지다.** `SLACK_WEBHOOK_URL`이 Railway에 실제로 설정되기 전까지
sink는 비활성이고 경보는 여전히 유실된다. 남은 완료 조건:

- [ ] `SLACK_WEBHOOK_URL`을 Railway에 등록 (webhook URL 값이 필요 — 사용자 제공 대기)
- [ ] **합성 경보를 한 번 발생시켜 실제 도착 확인** — 설정만 하고 끝내지 않는다

값을 넣지 않은 상태로 배포해도 안전하다 — `sendSlackAlert`가 no-op이라 동작 변화가 없고,
로그에는 `SLACK_WEBHOOK_URL 미설정` 경고가 남아 미설정 사실이 드러난다.

## 이번 범위에서 의도적으로 제외

- **`errorRateMonitor` 무변경** — 이미 `sendSlackAlert`를 호출한다. 현행유지.
- 배포 레이트리밋 환불 실패(`deploy/route.ts:80-82`) · 이벤트 persist 실패(`eventPersister.ts:15-24`) —
  의도적으로 삼키는 best-effort 경로다. sink가 실제로 살아난 뒤 별도 판단한다.
- **다일 장애 재알림(시간 윈도 기반 리마인더) 미도입** — 전이 1회로 충분한지는 운영 데이터를 보고 판단한다.
- **틱 중첩** — `intervalMs`가 백업 소요보다 짧으면 완료 순서가 전이를 뒤섞을 수 있다.
  기본 24시간에서는 비현실적이므로 기록만 남긴다(기존 제약이며 이 변경이 만든 것이 아니다).
