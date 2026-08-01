# 운영 가이드

> **최종 업데이트:** 2026-08-02  
> **대상:** 프로덕션(https://xzawed.xyz)을 **오늘** 점검·대응해야 하는 운영자  
> **스택:** Railway 단일 인스턴스 · 임베디드 SQLite(`/data/app.db`) · Auth.js 로컬 인증 · Slack 경보

배포·CI·Dockerfile·도메인 연결은 [deployment.md](deployment.md)에 있다.  
불변조건·계약은 [system-spec.md](../architecture/system-spec.md), 환경변수 전체는 [env-vars.md](../reference/env-vars.md),  
엔드포인트 스키마는 [api-endpoints.md](../reference/api-endpoints.md)를 본다. **이 문서는 중복하지 않고 링크한다.**

---

## 0. 전제 (읽기 전)

| 전제 | 의미 |
|------|------|
| **Supabase 없음** | 2026-06-23 SQLite 컷오버로 DB·Auth·Dashboard 전부 제거. Supabase 절차는 무시한다. |
| **Sentry 미도입·스캐폴딩 제거** | 알림 sink는 **Slack 하나**(`#alerts`). Sentry 대시보드·DSN을 찾지 말 것. |
| **단일 인스턴스** | 인메모리 레이트리밋·진행률·site 프록시 집계는 프로세스 재시작 시 초기화된다. |
| **자격 증명** | `ADMIN_API_KEY`, Railway 로그인, Anthropic/GitHub 콘솔 접근은 **운영자 소관**. 이 문서는 값을 다루하지 않는다. |

---

## 1. 일상 운영 — 오늘 무엇을 볼까

### 1.1 빠른 순서 (증상 없을 때)

1. 공개 헬스: `GET /api/v1/health` → `{"status":"ok",...}`  
2. 관리자 진단: `GET /api/v1/admin/debug` → `models.*.fellBack === false`, `email.configured`/`fromSet`  
3. 생성 품질 추이: `GET /api/v1/admin/qc-stats` (기본 최근 7일)  
4. (트래픽 있을 때) `GET /api/v1/admin/site-proxy-stats` → `blockedByProject` 해석  
5. Railway 최신 배포 상태: `railway deployment list --json` — 판별표는 [§4](#4-장애-대응)

이상 징후(배포 실패, `fellBack: true`, 이메일 미설정, 생성 실패 급증, 백업 경보)가 있을 때만 깊게 판다. 정상이면 여기까지.

### 1.2 관리자 API 공통

모든 `/api/v1/admin/*` 는 `Authorization: Bearer <ADMIN_API_KEY>` 가 필요하다.  
키 미설정·불일치 → 403. 상세 스키마·에러 코드: [api-endpoints.md — 관리자](../reference/api-endpoints.md).

```bash
# 예: 프로덕션 진단 (키는 셸 히스토리에 남기지 않도록 주의)
curl -sS -H "Authorization: Bearer $ADMIN_API_KEY" \
  "https://xzawed.xyz/api/v1/admin/debug"
```

| 메서드 · 경로 | 답하는 질문 | 언제 쓰는가 |
|---------------|-------------|-------------|
| **GET** `/api/v1/admin/debug` | Node/플랫폼, **실제 적용 AI 모델**(`models.<task>.env` / `resolved` / **`fellBack`**), **이메일 설정 여부**(`email.configured` · `fromSet` · `fromDomain` — 값 자체는 비노출), standalone 필수 모듈 로드(`playwright-core`, `@anthropic-ai/sdk`, `better-sqlite3`, `drizzle-orm`) | **첫 진단.** 모델 env 변경 직후, 생성 500, 신규 가입자가 생성·배포 403일 때(`RESEND_API_KEY` 없으면 인증 메일이 no-op → `assertEmailVerified`가 막음) |
| **GET** `/api/v1/admin/qc-stats?days=7` | 기간 내 생성 수·실패 수·실성공률, 구조/모바일/렌더링 QC 평균, Stage 스킵·Quality Loop 지표, 흔한 QC 실패 항목 | 생성 품질·실패율 추이. Slack 생성 실패 경보 후 원인 파악 |
| **GET** `/api/v1/admin/site-proxy-stats?limit=50` | 게시 사이트(익명) 프록시 프로젝트별 허용/차단. **`blockedByIp` vs `blockedByProject` 구분** | 429 민원, 한도 조정 근거 수집. 인메모리 → **재시작 시 0**. `trackedProjects: 0`이면 아직 집계 트래픽 없음([#216](https://github.com/xzawed/CustomWebService/issues/216) 트리거 미충족 — **임의로 한도 바꾸지 말 것**) |
| **GET** `/api/v1/admin/keys-verify` | 활성·플랫폼 키 의존 API의 env 키를 **배포 런타임에서** 실호출 검증(키 값 비노출) | 키 의존 API 재활성화 직후, 401 의심. **로컬/`railway run`은 sealed env 미주입** — 배포 환경에서만 유효 |
| **POST** `/api/v1/admin/verify-catalog` | 활성 API GET을 라이브 호출해 `verification_status` 갱신(`working/degraded→verified`, `broken→broken`, 변경 시에만 쓰기; `key_gated`/`unknown` 보존) | 카탈로그 이상 의심·시드 반영 후. **스케줄 없음 — 관리자 수동 트리거**(플래핑·무인 outbound 방지) |
| **GET** `/api/v1/admin/catalog-dump` | 프로덕션 `api_catalog` 전체(활성·비활성) 안전 투영 + `summary.active`/`inactive` | “카탈로그가 몇 개?” **하드코딩 숫자를 믿지 말고 이 응답으로 확인**. 시드 JSON diff용 |
| **POST** `/api/v1/admin/trigger-qc` | 특정 `projectId`에 Fast+Deep QC 재실행 | QC 디버깅. `ENABLE_RENDERING_QC` 꺼져 있으면 400 |
| **POST** `/api/v1/admin/test-generation` | 관리자 소유의 일회 생성 파이프라인 스모크(비용 발생) | 로드/통합 점검. 본문 스키마·비용 주의 — [api-endpoints.md](../reference/api-endpoints.md) |

### 1.3 공개 헬스

| 호출 | 응답 | 용도 |
|------|------|------|
| `GET /api/v1/health` | `{ "status": "ok", "timestamp": "..." }` | 가동 여부·외부 업타임 모니터. **인프라 상세 없음** |
| `GET /api/v1/health?detailed=true` + `Authorization: Bearer <ADMIN_API_KEY>` | `status`: `healthy` / `degraded` / `unhealthy`, `checks`(database·ai·deploy), `usage` | DB ping·오늘 생성 수·AI/배포 설정 여부. 인증 실패 시 **공개 응답으로 폴백**(상세 존재 비노출). 관리자 키 IP 한도 초과 시 `429` + `status: "rate_limited"` — **공개 ok로 오인하지 말 것** |

> Supabase 일시정지 방지용 헬스체크 서술은 **폐기**. SQLite는 프로젝트 pause가 없다.

### 1.4 카탈로그 개수

- **“활성 N개” 고정 문구를 문서/대시보드에 박지 않는다.** 진실원은 DB(`api_catalog.is_active`)이며 랜딩 카피도 `getActiveApiCount()`로 읽는다.
- 운영 확인: `GET /api/v1/admin/catalog-dump` → `data.summary`.
- 번들 시드 [`src/data/apiCatalog.json`](../../src/data/apiCatalog.json) 기준(이 문서 작성 시 로컬 검증): **총 61 · 활성 36 · 비활성 25**. 프로덕션은 배포·ensureCatalog·수동 변경으로 달라질 수 있다.
- `supabase/seed.sql` **삭제됨**. 시드는 부팅 시 빈 테이블일 때만 JSON 삽입 + `ensureCatalogEntries` 멱등 반영. 절차 세부는 컷오버 ADR·[역사 런북](../archive/guides/sqlite-cutover-runbook.md).

---

## 2. 모니터링·경보

### 2.1 Slack sink (활성)

| 항목 | 내용 |
|------|------|
| 채널 | xzawed 워크스페이스 **`#alerts`** (앱 `xzawed alerts`) |
| env | `SLACK_WEBHOOK_URL` — **키 존재가 아니라 값 길이**. 빈 문자열 = 미설정 = 조용한 no-op |
| Sentry | **의도적 미도입·코드 제거(2026-08-01)**. `SENTRY_*`를 코드가 읽지 않음. 2026-08-02 점검: 프로덕션 Railway에 `SENTRY_*` 변수는 **애초에 없었음**(삭제 할 일 없음) |
| 설정·재발급·합성 경보 | **[monitoring-sink-setup.md](monitoring-sink-setup.md)** (2026-07-31 실경보 검증 완료) |

### 2.2 경보 생산자 (코드에 배선된 것만)

| 생산자 | 조건 | 동작 |
|--------|------|------|
| `errorRateMonitor` (`src/lib/monitoring/errorRateMonitor.ts`) | 5분 윈도우 내 `CODE_GENERATION_FAILED` ≥ `ERROR_RATE_ALERT_THRESHOLD`(기본 **5**) | Slack error 1회/윈도(`alerted` 플래그). 인메모리·단일 인스턴스 |
| `scheduleBackups` (`src/lib/db/sqlite/backup.ts`) | 백업 **상태 전이**만: 첫 실패 또는 성공→실패 → error, 실패→성공 → info 복구 | 연속 실패 중 재알림 없음. 알림 실패는 스케줄러를 죽이지 않음(void+catch) |

임계값 조정·다일 리마인더·site 프록시 Slack 승격은 **실경보·트래픽 데이터 후** 판단한다. 근거 없이 바꾸지 말 것 — [project WBS F그룹](../superpowers/plans/2026-07-31-project-wbs.md).

### 2.3 경보 외 관측

| 수단 | 용도 | 소유·주기 |
|------|------|-----------|
| Railway 로그 / Observability | 런타임 에러·배포 로그 | 인시던트 시 또는 배포 직후 — **고정 주간 의식 없음** |
| Anthropic Console | 토큰·크레딧·429 | 생성 장애·비용 의심 시 운영자가 콘솔 확인 |
| GitHub Actions | CI 실패 → 배포 대기 | 푸시 이벤트 기반 |
| `#alerts` | 생성 실패율·백업 실패/복구 | 이벤트 기반(§2.2) |

외부 업타임 모니터(UptimeRobot 등)를 쓰는 경우 공개 `/api/v1/health`를 가리키면 된다. **이 저장소에 강제 연동·필수 주기는 없다.**

---

## 3. 백업·보존

구현: [`backup.ts`](../../src/lib/db/sqlite/backup.ts), [`retention.ts`](../../src/lib/db/sqlite/retention.ts).  
env: [env-vars.md — SQLite 백업·DB 보존](../reference/env-vars.md).  
**복구 절차는 여기에 쓰지 않는다** → [sqlite-restore-runbook.md](sqlite-restore-runbook.md).

### 3.1 자동 백업

| 항목 | 기본값 | 비고 |
|------|--------|------|
| 활성 | `SQLITE_BACKUP_ENABLED` ≠ `false` | |
| 주기 | `SQLITE_BACKUP_INTERVAL_MS` = **24h** | 부팅 시 **즉시 1회** + interval. 배포마다 새 백업이 생기는 이유 |
| 보관 개수 | `SQLITE_BACKUP_RETENTION` = **7** | `app-YYYYMMDD-HHmmss.db` 패턴만 삭제 후보 — 라이브 DB·WAL/SHM 절대 비대상 |
| 경로 | `SQLITE_BACKUP_DIR` 또는 `<SQLITE 디렉터리>/backups` | 프로덕션 전형: `/data/backups/` · 라이브 DB `/data/app.db` |
| 방식 | better-sqlite3 `.backup()` | WAL 중에도 자기완결 스냅샷. 단일 인스턴스·**동일 볼륨** 전제. 볼륨 손실까지 막는 계층이 아님(§3.4) |
| 경보 | §2.2 | 실패/복구 전이만 |

#### Railway 볼륨 지표 주의 (2026-08-02 실측)

Railway 대시보드의 볼륨 `currentSizeMB ≈ 1064`는 **할당/과금 회계 값**이지 사용 바이트가 아니다.
같은 시점 컨테이너 안 `du -sh /data`는 **약 4.7MB**였다. 대시보드 숫자만 보고 디스크 위기로
오인하지 말 것 — 실제 사용량은 컨테이너에서 `du`/`ls`로 본다.

#### 프로덕션 `/data` 레이아웃 (2026-08-02 점검, 참고)

| 항목 | 상태 |
|------|------|
| `app.db` · `app.db-shm` · `app.db-wal` | 라이브 세트. 크기 비율은 시점마다 다름([런북](sqlite-restore-runbook.md) — **크기는 건강 지표 아님**) |
| `backups/` | **정확히 7개** — 보존 정책(`SQLITE_BACKUP_RETENTION=7`) 정상 동작 확인. 자동 백업 루프 산출물은 깨끗함(`.db-wal`/`.db-shm` 잔재 없음) |
| `incident-20260731-101945/` | 2026-07-31 리허설 **전** 스냅샷(~1.5MB). **사용자 데이터의 옛 사본** — 보관 방침을 정할 것(오프-볼륨으로 옮긴 뒤 삭제 권장). 긴급은 아님 |
| `lost+found/` | 파일시스템 잔재. 앱 비사용 |

> **운영자/에이전트가 백업을 `readonly: true`로 열어 검증할 때** `.db-wal`/`.db-shm`이 백업 디렉터리에
> 생길 수 있다 — prune 패턴에 안 걸려 누수된다. 검증 후 `rm -f /data/backups/*.db-wal /data/backups/*.db-shm`
> ([런북](sqlite-restore-runbook.md)). 자동 백업 루프 자체는 프로덕션 `backups/`가 깨끗한 것으로 확인됐다.

### 3.2 DB 보존(정리)

| 테이블 | 기본 보존 | 삭제 조건 |
|--------|-----------|-----------|
| `platform_events` | `EVENT_RETENTION_DAYS` = **90** | `created_at` 이 cutoff 이전 |
| `auth_tokens` | `AUTH_TOKEN_RETENTION_DAYS` = **7** | **`expires_at` 지남 또는 `consumed_at` 있음** + cutoff. **유효한 미사용 토큰은 절대 삭제하지 않음**(인증·재설정 링크 보호) |
| `user_daily_limits` | `DAILY_LIMIT_RETENTION_DAYS` = **30** | `usage_date` &lt; **로컬** 날짜 cutoff(UTC로 자르면 오늘 카운터 삭제 위험) |

- 주기: `DB_RETENTION_INTERVAL_MS` 기본 24h, 부팅 시 1회. `DB_RETENTION_ENABLED=false` 시 스킵.
- 세 DELETE는 **단일 동기 트랜잭션**. `0`/음수/비정수 env → 기본값 폴백(전체 삭제 사고 방지).
- `generated_codes` 버전 정리는 이 스케줄러가 아니라 코드 저장 경로의 `pruneOldVersions()` 담당.

### 3.3 복구가 필요할 때

1. [sqlite-restore-runbook.md](sqlite-restore-runbook.md)만 따른다.  
2. **WAL 모드 불변조건** — 커밋 데이터는 체크포인트 전까지 `-wal`에만 있을 수 있다. `app.db`만 덮고 옛 WAL을 남기면 복구가 조용히 무효화되고 `integrity_check`는 여전히 `ok`일 수 있다. **main 교체 + WAL/SHM 제거는 한 세트.** 파일 크기는 건강 지표가 아니다(런북).  
3. 성공 판정은 integrity·파일 크기가 아니라 **행 수 대조**.

### 3.4 DR 계층

**결정(2026-08-01): 비용이 드는 신규 완화·기능은 구현 대상에서 제외한다.**  
Railway 볼륨 백업·관리형 오브젝트 스토리지·Litestream→S3 같은 **유료 DR은 잔여 작업이 아니다.**  
(기존 제품 운영비 — Anthropic API·Railway 호스팅·Resend — 와는 별개다. 그걸 “제외”로 읽지 말 것.)

| 계층 | 상태 | 무엇을 막는가 | 비고 |
|------|------|---------------|------|
| **1. On-volume `.backup()` 덤프** | ✅ **자동·운영 중** | 논리 손상·잘못된 마이그레이션·실수 삭제 | `/data/backups` — **같은 볼륨**. 부팅 1회 + 주기, 보관 7. 프로덕션 복구 리허설로 검증됨([restore runbook](sqlite-restore-runbook.md)) |
| **2. 관리자 로컬 다운로드** | ✅ **유일한 무료 오프-볼륨 경로** | 볼륨 손실 — **사람이 실제로 당겨 둔 경우만** | `GET /api/v1/admin/backup/latest` + `ADMIN_API_KEY`. 자동화·강제 스케줄 **없음**. 전체 DB 유출 경로 — 감사 로그 + Slack info |
| **3. 유료 DR** (Railway 볼륨 백업 · 관리형 오브젝트 스토리지 · Litestream→S3) | ❌ **제외(2026-08-01)** | (채택하지 않음) | **하지 않기로 결론.** 오너 액션 대기가 아니다. 구현·권장·백로그 잔여 작업으로 취급하지 말 것 |
| **4. `SQLITE_OFFSITE_BACKUP_URL` 시임** | ✅ 코드 있음 · 기본 no-op | 오너가 **이미** 가진 HTTPS PUT 수신기로 덤프를 보낼 때 | 미설정 = `NoopOffsiteSink`. **프로젝트가 수신기를 제공·권장하지 않는다.** “무료 티어” 오브젝트 스토리지를 제로비용 계획으로 소개하지 말 것. GitHub 레포는 덤프 매체로 **부적합**(전체 사용자 행·scrypt 해시·암호화 API 키) |

**수용한 잔여 위험:** 볼륨이 사라지고 오프라인 사본(계층 2로 사람이 빼 둔 파일 등)이 없으면 **복구 절차는 없다** — 빈 bootstrap만 가능하다. 그 위험을 수용한다.

관측: `GET /api/v1/admin/debug`의 `offsiteBackup: { configured, lastResult, lastAt }` — **URL은 노출하지 않는다**(토큰 가능). 오프사이트 실패는 로컬 백업 실패 경보와 별개이며, 로컬 성공을 실패로 뒤집지 않는다.

로컬 덤프 당기기 예(선택 습관 — 구현 과제가 아님):

```bash
curl -fsS -H "Authorization: Bearer $ADMIN_API_KEY" \
  -o "app-latest.db" \
  "https://xzawed.xyz/api/v1/admin/backup/latest"
```

---

## 4. 장애 대응

### 4.1 Railway 배포 상태 해석

Wait for CI가 활성이다. 신규 커밋은 CI 완료까지 `WAITING`에 머무를 수 있다.  
**env 단독 변경 재배포가 항상 FAILED인 것은 아니다**(실증: 정상 `SUCCESS` 가능). `FAILED`면 **실제 실패로 보고 로그를 먼저 챙긴다** — 후속 배포로 대체되면 로그가 사라진다.

| 상황 | 해석 |
|------|------|
| 신규 커밋 · `WAITING` 지속 | 정상 — CI 완료 대기 |
| env 단독 변경 · 같은 커밋 · `SUCCESS` | 정상 |
| env 단독 변경 · 같은 커밋 · `FAILED` | **조사** — 로그 즉시 수집 |
| 신규 커밋 · `BUILDING`/`DEPLOYING` 중 `FAILED` | 실제 배포 실패 |
| 서비스 health 죽음 | 장애 — 롤백 검토 |

상세·quirks: 프로젝트 지침 [CLAUDE.md — Railway 배포 상태 판별](../../Claude.md).  
`railway variables` 메타의 `patchId` 유무로 env 변경 재배포 vs 커밋 배포를 구분할 수 있다.

### 4.2 실패 배포 로그 수집 (대체되기 전)

```bash
railway deployment list --json          # 실패 deployment id
railway logs -b <deployment-id>         # 빌드
railway logs -d <deployment-id>         # 런타임/배포
```

서비스가 여러 개 있는 프로젝트에서는 `--service CustomWebService`를 명시한다([복구 런북](sqlite-restore-runbook.md)과 동일).

### 4.3 롤백

1. **배포 태그**로 이전 정상 커밋 식별:  
   `git tag -l 'deploy/*'`  
   성공 배포 후 관례: `git tag deploy/YYYY-MM-DD-HHmm && git push origin --tags`  
2. 해당 커밋으로 재배포(Railway 대시보드 Rollback 또는 태그 커밋 재배포).  
3. env/`railway.toml`/`startCommand` 함정: Dockerfile `ENTRYPOINT`를 덮어쓰면 비root·`/data` chown 경로가 깨질 수 있다 — [Claude.md 배포 품질 원칙](../../Claude.md).

### 4.4 증상별 초동 (현재 스택 기준)

| 증상 | 초동 |
|------|------|
| 사이트 전체 다운 | §4.1 배포 상태 → 로그 → 공개 health → 필요 시 롤백 |
| 생성 실패 급증 / Slack 생성 경보 | `admin/debug`(모델·모듈) → `qc-stats` → Anthropic 상태/크레딧 → Railway 로그. 임계·윈도는 §2.2 |
| 신규 가입 후 생성·배포 403 | `admin/debug`의 `email.configured`/`fromSet`. Resend 미설정이면 인증 메일 no-op |
| 서브도메인 404 | DNS `*` CNAME, Railway `*.xzawed.xyz`, `NEXT_PUBLIC_ROOT_DOMAIN` — [deployment.md](deployment.md) |
| 게시 사이트 API만 404(미리보기는 정상) | middleware `SUBDOMAIN_PASSTHROUGH_PREFIXES`에 `/api/v1/proxy` 등 예외 여부 — 시스템 명세·Claude 배포 품질 |
| DB 손상·오염 의심 | **[sqlite-restore-runbook.md](sqlite-restore-runbook.md)**. “Supabase Restore” 없음 |
| 카탈로그가 비정상적으로 적음 | `catalog-dump`의 `summary`. seed.sql 실행 지시 **금지(파일 없음)**. 필요 시 시드 JSON·ensureCatalog·`verify-catalog` |
| site 프록시 429 | `site-proxy-stats`에서 IP vs 프로젝트 한도 구분. 한도 변경은 ADR 기준표 + 데이터 있을 때만 |

보안 인시던트 절차: [incident-response.md](../security/incident-response.md).

---

## 5. 정기 점검 vs 트리거 기반

**존재하지 않는 “매주 월요일 의식”을 만들지 않는다.** 아래만 구분한다.

### 5.1 자동(코드/플랫폼이 돌림)

| 무엇 | 주기·트리거 | 비고 |
|------|-------------|------|
| SQLite 백업 | 부팅 1회 + 기본 24h | §3.1 |
| DB 보존 prune | 부팅 1회 + 기본 24h | §3.2 |
| 생성 실패율 Slack | 5분 윈도 임계 | §2.2 |
| 백업 실패/복구 Slack | 상태 전이 | §2.2 |
| CI → (main) 배포 | 푸시 | [deployment.md](deployment.md) |
| Wait for CI | 신규 커밋 배포 전 | §4.1 |

### 5.2 수동·트리거 (스케줄 없음 · 운영자 판단)

| 무엇 | 트리거 예 |
|------|-----------|
| `admin/debug` · health detailed | 세션 시작, 배포 직후, 장애 신고 |
| `qc-stats` | 품질 의심, 생성 경보 후 |
| `site-proxy-stats` | 429·오남용 의심. `trackedProjects:0`이면 데이터 없음 — **한도 재조정 착수 금지**([#216](https://github.com/xzawed/CustomWebService/issues/216)) |
| `keys-verify` | 키 활성화·교체 후 |
| `verify-catalog` | 카탈로그 이상·대규모 시드 변경 후(자동 cron 없음) |
| `catalog-dump` | 시드 동기화 diff, 활성 개수 확인 |
| Anthropic/Railway 사용량 | 비용·한도 의심 시 각 콘솔(운영자 계정) |
| 배포 태그 부착 | 배포 **성공 확인 후** (관례) |
| Slack webhook 재발급 | 유출·채널 이전 — [monitoring-sink-setup.md](monitoring-sink-setup.md) |
| SQLite 복구 리허설 | 인시던트 전 연습 시 런북 |

### 5.3 비용·외부 한도 (요약을 넘기지 않음)

한도 숫자는 플랜·시점에 따라 바뀌므로 **대시보드 실측이 진실원**이다. 이 문서에 Trial $5·Supabase 500MB·Sentry 이벤트 같은 **폐기 수치를 다시 적지 않는다.**

| 의존성 | 운영자가 볼 곳 | 비고 |
|--------|----------------|------|
| Railway | Dashboard Usage / 크레딧 | 호스팅·볼륨. 크레딧 소진 시 서비스 중단 가능 |
| Anthropic | Console Usage | 생성 불능·429. 앱 일일 생성 한도는 env(`MAX_DAILY_GENERATIONS` 등) — [env-vars.md](../reference/env-vars.md) |
| GitHub Actions | Billing / Actions | CI 분 |
| Resend | 대시보드 | 인증·재설정 메일. 미설정 시 no-op([§1.2 debug.email](#12-관리자-api-공통)) |
| SQLite 디스크 | 볼륨 `/data` | 보존 정책이 무한 증가를 완화. 용량 위기는 복구 런북·볼륨 확장 판단 |

배포 파이프라인·무료 티어 표의 일부 구문([deployment.md §7](deployment.md))은 아직 컷오버 이전 잔재가 있을 수 있다. **운영 판단은 이 문서와 실측 콘솔을 우선**한다.

---

## 6. 관련 문서

| 문서 | 역할 |
|------|------|
| [deployment.md](deployment.md) | CI/CD, Railway 배포, 도메인, Playwright QC 이미지 |
| [monitoring-sink-setup.md](monitoring-sink-setup.md) | Slack webhook 등록·합성 경보 |
| [sqlite-restore-runbook.md](sqlite-restore-runbook.md) | DB 손상 시 백업 복구 |
| [sqlite-cutover-runbook.md](../archive/guides/sqlite-cutover-runbook.md) | (역사·비실행) PG→SQLite 컷오버 |
| [env-vars.md](../reference/env-vars.md) | 환경변수 전체 |
| [api-endpoints.md](../reference/api-endpoints.md) | 헬스·관리자 API 스키마 |
| [system-spec.md](../architecture/system-spec.md) | 깨면 사고 나는 불변조건 |
| [incident-response.md](../security/incident-response.md) | 보안 인시던트 |
| [2026-07-31-project-wbs.md](../superpowers/plans/2026-07-31-project-wbs.md) | 잔여 작업·관측 대기 항목 |
| [Claude.md](../../Claude.md) | 프로젝트 헌법(배포 품질·Railway 판별·운영 함정) |
