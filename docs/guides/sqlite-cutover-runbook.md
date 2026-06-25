# SQLite 컷오버 런북 (Supabase → 임베디드 SQLite + local 인증)

> 대상: `feat/sqlite-migration` 브랜치. Phase 1~7 완료(프로덕션 무영향, docker 검증 끝).
> 이 문서는 **실제 컷오버**(비가역) 절차다. Phase 8에 해당한다.
> 배경·진행현황: [WBS 계획서](../superpowers/plans/2026-06-22-db-removal-sqlite-migration.md).

## 0. 전제 — 무엇이 바뀌나

- **DB**: Supabase(PostgreSQL) → 컨테이너 내 임베디드 SQLite(`/data/app.db`, Railway Volume 영속).
- **인증**: Supabase OAuth(멀티유저) → Auth.js Credentials **단일 관리자** + JWT 무상태.
- **모델**: 멀티유저 → **단일 사용자/셀프호스트**. RLS·organizations·gallery 등 소멸(범위 외).
- ⚠️ **비가역 지점**: 4단계(supabase 코드 제거, P8.2) 이후 Supabase로 롤백 불가. 그 전(1~3단계)은
  env만 되돌리면 Supabase로 복귀 가능(코드가 아직 양쪽 경로 보유).

## 1. 사용자 선행 작업 (코드 외)

### 1.1 Railway 영속 볼륨 — **절대 선행** (없으면 재배포마다 SQLite 소실)
- Railway 서비스에 **Volume 생성, 마운트 경로 `/data`**.
- 주의: 볼륨이 붙은 서비스는 replica 불가(단일 인스턴스) — 본 앱은 이미 단일 인스턴스 전제라 무해.

### 1.2 관리자 비밀번호 해시 생성
```bash
pnpm admin:hash '원하는관리자비밀번호'
# 출력된 ADMIN_PASSWORD_HASH=... 값을 복사
```

### 1.3 환경변수 (Railway)
| 변수 | 값 | 비고 |
|---|---|---|
| `DB_PROVIDER` | `sqlite` | **컷오버 스위치** |
| `AUTH_PROVIDER` | `local` | **컷오버 스위치** |
| `AUTH_SECRET` | `openssl rand -base64 32` 결과 | JWT 서명 |
| `ADMIN_EMAIL` | 로그인 이메일 | |
| `ADMIN_PASSWORD_HASH` | 1.2 출력값 | 평문 비번 저장 안 함 |
| `ENCRYPTION_KEY` | **기존 값 그대로 유지** | user_api_keys 복호화(데이터 이관 시 필수) |
| (선택) `ADMIN_NAME` | 표시 이름 | 기본 `Admin` |
| (선택) `SQLITE_PATH` | 기본 `/data/app.db` | 보통 미설정 |
| (선택) `ADMIN_USER_ID` | 기본 `00000000-0000-0000-0000-000000000001` | 데이터 이관 시 동일 유지 |

### 1.4 빌드 인자 (클라이언트 인라인 — 빌드 타임 필요)
- `NEXT_PUBLIC_AUTH_PROVIDER=local` — 로그인 페이지가 Credentials 폼을 렌더하도록.
- Railway는 Dockerfile build args를 서비스 변수로 주입하거나 `--build-arg`로 전달.

## 2. (선택) 기존 데이터 이관 — P8.1

**셀프호스트 신규 시작이면 건너뛴다** (부팅 시 카탈로그 49개 + 관리자가 자동 시드되어 바로 사용 가능).

기존 프로젝트/생성코드/저장된 API 키를 보존하려면:
```bash
# Supabase 키가 있는 환경에서(.env.local 또는 railway run)
pnpm cutover:migrate --out ./app.db [--user <보존할_Supabase_user_id>]
```
- 모든 `user_id`는 단일 관리자(`ADMIN_USER_ID`)로 리맵된다. **`--user` 지정 권장**(여러 사용자 병합 시 slug 충돌 가능).
- 산출된 `app.db`를 **Railway 볼륨 `/data/app.db`로 업로드**(예: 임시 디버그 컨테이너에서 복사, 또는 Railway 볼륨 접근 수단).
- 카탈로그 `api_id` FK는 번들 카탈로그가 **프로덕션 id를 보존**하므로 해소된다.
- ⚠️ `user_api_keys.encrypted_key`는 `ENCRYPTION_KEY`로 복호화 — **동일 키를 1.3에 유지**해야 한다.
- 부팅 시드는 멱등이라 이관 파일과 충돌하지 않는다(빈 테이블일 때만 시드).

## 3. 컷오버 스위치 (배포)

1. 1.1~1.4 완료 확인(특히 **볼륨**).
2. (이관 시) 2단계로 `/data/app.db` 준비.
3. Railway 환경변수에 `DB_PROVIDER=sqlite`·`AUTH_PROVIDER=local` 외 1.3 전체 설정.
4. `NEXT_PUBLIC_AUTH_PROVIDER=local` 빌드 인자로 재배포.
5. 부팅 시 `instrumentation`의 `bootstrapSqlite`가 자동 수행: 마이그레이션 → 관리자 시드 → 카탈로그(49)·플래그(7) 시드(모두 멱등).

### 3.1 검증 (배포 직후)
- `GET /api/v1/health` → 200
- `/login` → 이메일/비밀번호 폼 표시 → 관리자 자격증명으로 로그인 → `/dashboard` 진입
- `/api/v1/catalog` → 활성 23개 카탈로그
- 새 서비스 생성 → 게시 → `slug.<도메인>` 서빙
- (이관 시) 기존 프로젝트/키가 대시보드·설정에 보이는지

### 3.2 롤백 (3단계까지만 가능)
- env를 `DB_PROVIDER=supabase`·`AUTH_PROVIDER=supabase`로 되돌리고 재배포 → Supabase 경로 복귀
  (코드가 아직 양쪽 보유). **4단계 이후엔 불가**.

## 4. 컷오버 안정화 후 — supabase 경로 제거 (P8.2, 비가역)

3단계가 수 일간 안정적으로 동작한 뒤 진행한다. **이 시점부터 Supabase 롤백 불가.**
- `@supabase/*`·`pg`·Drizzle-pg 의존 및 경로 제거: `src/lib/supabase/`, Supabase/Drizzle 레포,
  `createServiceClient`/`createClient`, `.rpc()`, `/(auth)/callback`, `assertOwner`(단일 소유자라 자명),
  `DB_PROVIDER`/`AUTH_PROVIDER`의 supabase·postgres·authjs 분기.
- P7.1/P7.4 테스트 정리 동반(supabase/Drizzle 레포 테스트 제거, factory/connection/failover 단순화).
- 문서 전면 갱신(P8.3): `CLAUDE.md`(기술스택 표 Supabase→SQLite·아키텍처), `README`, `docs/reference/env-vars.md`.
- 컷오버 ADR 작성(`docs/decisions/`).

## 5. 운영 — 백업 (P6.3, ✅ 구현됨 2026-06-25)

- **자동 인프로세스 백업**: 부팅 시 `instrumentation.register() → scheduleBackups`(`src/lib/db/sqlite/backup.ts`)가
  주기적으로 `raw.backup()` 온라인 덤프를 `<SQLITE 디렉터리>/backups/app-YYYYMMDD-HHmmss.db`로 남기고,
  `SQLITE_BACKUP_RETENTION`(기본 7)개만 보관(오래된 파일 자동 정리). 외부 의존·비용 없음.
  - 환경변수: `SQLITE_BACKUP_ENABLED`(기본 true)·`SQLITE_BACKUP_INTERVAL_MS`(기본 24h)·`SQLITE_BACKUP_RETENTION`(기본 7)·`SQLITE_BACKUP_DIR`(기본 `/data/backups`). 상세: [env-vars.md](../reference/env-vars.md).
  - **방어 범위**: 논리 손상·잘못된 마이그레이션·실수 삭제. **볼륨 자체 손실**은 Railway 볼륨 스냅샷이 담당.
  - 복구: `cp /data/backups/app-<ts>.db /data/app.db`(서비스 중지 후) 또는 디버그 컨테이너에서 교체.
- (옵션·향후) Litestream으로 WAL→S3 연속 복제(~1s 손실창, S3 의존·비용)로 오프-볼륨 DR 강화.
- 크리티컬 쓰기 내구성은 이미 `synchronous=NORMAL` + 원자적 카운터(`BEGIN IMMEDIATE` 직렬화)로 확보.

## 6. 프로덕션 클린 리셋 (다중 사용자 전환 초기화)

> **목적**: 다중 사용자 전환(2026-06-24) 후 기존 단일 관리자 시드 데이터를 포함한 프로덕션 DB를 깨끗하게 초기화하여 새 회원가입 흐름으로 첫 사용자를 등록한다.
>
> ⚠️ **이 절차는 비가역적이다**. 반드시 백업 후 진행하고, 사전에 사용자에게 다운타임을 안내하라.

### 6.1 사전 백업

```bash
# Railway Volume에서 SQLite 파일 백업 (Railway 셸 또는 디버그 컨테이너에서 실행)
cp /data/app.db /data/app.db.backup-$(date +%Y%m%d-%H%M%S)
```

백업 파일을 로컬로 내려받아 안전한 위치에 보관한다.

### 6.2 사용자 데이터 삭제 (카탈로그·플래그 보존)

```sql
-- Railway 셸 또는 임시 컨테이너에서 SQLite CLI로 실행
-- 삭제 순서: FK 의존 테이블부터 먼저 삭제
DELETE FROM platform_events;
DELETE FROM user_daily_limits;
DELETE FROM user_api_keys;
DELETE FROM generated_codes;
DELETE FROM project_apis;
DELETE FROM projects;
DELETE FROM auth_tokens;
DELETE FROM users;

-- 보존 테이블 (삭제 안 함)
-- api_catalog  → 카탈로그 데이터 유지
-- feature_flags → 피처 플래그 유지
```

> **보존**: `api_catalog`(49행)·`feature_flags`(7행)는 삭제하지 않는다 — 부팅 시드는 빈 테이블일 때만 삽입하므로 재시드가 발생하지 않는다.

### 6.3 재시작 → 첫 회원가입

1. Railway 서비스를 **재배포 또는 재시작**한다.
2. 부팅 시 `bootstrapSqlite`가 마이그레이션만 확인하고 카탈로그/플래그는 이미 있으므로 건너뜀.
3. **`/signup` 페이지로 접속 → 첫 사용자 등록** — 이 계정이 플랫폼 최초 사용자가 된다.
4. 이메일 인증 후 로그인 → 서비스 정상 이용 가능.

### 6.4 주의사항

- ⚠️ **게시된 사이트 다운**: `projects.slug`·`generated_codes` 삭제로 `slug.xzawed.xyz` 형태의 게시 사이트가 모두 다운된다. 리셋 전에 사용자에게 최종 확인한다.
- ⚠️ **Resend 도메인 인증(사용자 작업)**: 이메일 인증·비밀번호 재설정 메일이 실제로 발송되려면 Resend 대시보드에서 `xzawed.xyz` 도메인의 SPF/DKIM 레코드를 DNS에 등록해야 한다. 미설정 시 `RESEND_API_KEY`가 있어도 발송 실패하거나 스팸 처리될 수 있다. `RESEND_API_KEY` 미설정 시에는 콘솔 no-op 폴백이 동작(이메일 미발송).
- ⚠️ **`ENCRYPTION_KEY` 유지**: 사용자가 이후 API 키를 저장하면 이 키로 암호화된다. 키를 분실하면 저장된 API 키를 복호화할 수 없다.

---

## 7. 알려진 잔여 / 주의 (원 §6)

- **P4.3**: 배포 레이트리밋/환불·상태머신은 레포 단위 검증됨. 외부 배포(GitHub/Railway) 통합은 실배포에서 확인.
- **P5.2**: `verification_status` 갱신 cron은 현재 CI→Supabase. sqlite 셀프호스트는 컨테이너 내부 검증으로 전환 필요(시드된 상태가 baseline).
- **단일 인스턴스 전제**: `generationTracker`·`proxyCache`·인메모리 레이트리밋·SQLite 단일 writer 모두 단일 인스턴스 가정. 수평 확장 시 외부 저장소 재이관 필요.
