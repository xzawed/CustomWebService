# 에러·알림 sink 연결 및 백업 실패 배선 (#220)

- 작성: 2026-07-30
- 상태: 계획 (착수 전)
- 이슈: [#220](https://github.com/xzawed/CustomWebService/issues/220)

> 이 문서는 **다음 작업 세션의 착수점**이다. 구현은 포함하지 않는다.

## 목표

**sink 하나를 연결하고, 경보가 실제로 도착하는 것을 확인한다.** 모니터링 재설계가 아니다.

## 현재 상태 (실측 2026-07-29)

`SENTRY_DSN`·`NEXT_PUBLIC_SENTRY_DSN` 미등록, `SLACK_WEBHOOK_URL` 빈 값.
→ `sendSlackAlert`는 `logger.warn` 한 줄 남기고 반환(`slackAlert.ts:20-24`), Sentry는 `enabled:false`로 부팅.
→ **`errorRateMonitor`의 생성 실패율 경보가 아무 곳에도 안 간다.**

## 작업 순서

### 1. sink 선택 및 등록 — 사용자 판단 필요 ⚠️

Slack webhook과 Sentry DSN은 **서로 다른 층**을 덮는다. 하나만으로도 지금보다 낫다.

| | 덮는 범위 | 필요한 것 |
|---|---|---|
| Slack | `errorRateMonitor`가 판단한 **도메인 이벤트**(생성 실패율) — 이미 코드 배선 완료 | Slack 워크스페이스 incoming webhook URL |
| Sentry | 라우트 미처리 예외, 클라이언트 런타임 에러 | Sentry 프로젝트 + DSN |

**Slack 우선 권장** — 코드 경로가 이미 존재하고 검증 대상 경보(실패율·백업)가 둘 다 도메인 이벤트라 즉시 도착 확인이 가능하다. Sentry는 미처리 예외까지 잡지만 프로젝트 생성이 선행돼야 한다.

Railway env 등록은 사용자가 값을 제공해야 진행 가능하다. **값을 절대 커밋하지 않는다.**

### 2. 백업 실패를 sink로 배선

`src/lib/db/sqlite/backup.ts:126-131` — 현재 `logger`만 남긴다.
단일 인스턴스 + 볼륨 위 SQLite에서 백업이 조용히 죽으면 **복구가 필요한 순간에야** 알게 된다.
이슈에서 "가장 아프다"고 판단한 항목.

- `sendSlackAlert` 호출 추가. 백업 스케줄러는 `.unref()` 타이머이므로 **알림 실패가 스케줄러를 죽이지 않게** 할 것
- 매 주기 실패 시 알림 폭주 방지 — 연속 실패 시 1회만 보내는 억제(`siteRateLimit.ts`의 `warned` 플래그 패턴 참고)

### 3. 합성 경보로 도착 확인 (완료 조건의 핵심)

**설정만 하고 끝내지 않는다.** 관리자 엔드포인트 또는 일시적 임계값 하향으로 경보를 한 번 실제로 발생시켜 도착을 확인한다.

### 4. 최소 경보 집합 정의

최소한 **생성 실패율 + 백업 실패** 둘. 나머지는 이번 범위 밖.

### 5. 문서 갱신

`CLAUDE.md`·`docs/reference/env-vars.md`의 "셋 다 미설정이면 활성 sink 없음" 경고를 실제 상태에 맞게 갱신.

## 이번 범위 밖 (이슈에 기록만)

배포 레이트리밋 환불 실패(`deploy/route.ts:80-82`)·이벤트 persist 실패(`eventPersister.ts:15-24`)는
의도적으로 삼키는 best-effort 경로다. sink가 생긴 뒤 별도로 판단한다.

## 완료 판정

- [ ] Railway에 sink env 최소 1개 등록
- [ ] 합성 경보 1회 도착 확인 (스크린샷 또는 로그)
- [ ] 백업 실패 → sink 배선 + 억제 로직 + 테스트
- [ ] CLAUDE.md·env-vars.md 경고 문구 갱신

## ✅ 결정 완료 (2026-07-30) — 이 계획서는 이력이 되었다

착수 전 확인이 필요했던 두 지점이 모두 해소됐다. 사용자 결정:

> **"에러는 알려야 합니다. 현행유지로 가야합니다."**

| 쟁점 | 결정 |
|---|---|
| 2026-04-27 "SLACK_WEBHOOK_URL·errorRateMonitor 사용 안 함"을 뒤집는가 | **뒤집는다** — 알림은 필요하다 |
| Slack / Sentry | **Slack 고정, Sentry 미도입** (= 현행 경로 유지, 재설계 안 함) |

근거와 설계는 [ADR](../../decisions/2026-07-30-monitoring-sink-slack-only.md)에 기록했다.
**코드 배선(백업 실패 → sink, 상태 전이 경보)은 완료**했고, 남은 것은 운영 작업뿐이다:

- [ ] `SLACK_WEBHOOK_URL`을 Railway에 등록 (값 제공 필요)
- [ ] 합성 경보 1회 도착 확인

배경: [#220 코멘트](https://github.com/xzawed/CustomWebService/issues/220#issuecomment-5120693118)
