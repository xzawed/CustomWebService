# ADR: SQLite 프로덕션 컷오버 + Supabase/Postgres/OAuth 코드 완전 제거 (P8.2)

- 날짜: 2026-06-23
- 상태: 채택 (구현 완료, `feat/sqlite-migration` 브랜치)
- 관련: [DB 제거 → SQLite 전환 WBS(역사)](../archive/superpowers/plans/2026-06-22-db-removal-sqlite-migration.md) §0 / Phase 8, [컷오버 런북(역사)](../archive/guides/sqlite-cutover-runbook.md)
- 선행 ADR: [Provider 전환](provider-migration.md), [Node 22 상향](2026-06-22-node22-supabase-websocket-fix.md)

## 맥락

2026-06-23 프로덕션(xzawed.xyz)이 **임베디드 SQLite + Auth.js(local, Credentials 단일 관리자 + JWT)** 스택으로
라이브 컷오버됐다(영속 볼륨 `/data` 마운트). 컷오버 직후까지 코드베이스는 **3-way provider 추상화**(DB:
`supabase`/`postgres`/`sqlite`, Auth: `supabase`/`authjs`/`local`)를 유지해 env 스위치(`DB_PROVIDER`/`AUTH_PROVIDER`)만
되돌리면 Supabase로 롤백할 수 있었다.

본 ADR은 그 **롤백 경로(Supabase·on-prem Postgres·OAuth)를 코드에서 영구 제거**(WBS P8.2)한 결정과 범위를 기록한다.
단일 사용자·셀프호스트 모델에서 두 번째 DB/인증 백엔드를 유지하는 것은 순수 부채이며, 추상화 seam(`IRepository`·factory)을
보존하므로 향후 외부 저장소 재이관이 필요하면 어댑터를 다시 추가하는 비용은 작다.

## 결정

**`sqlite`(DB) + `local`(Auth)을 유일한 스택으로 고정하고, 그 외 모든 provider 경로·의존성을 제거한다.**

### 제거된 코드 (삭제)
- **레포지토리**: Supabase 7종(`projectRepository`·`userRepository`·`codeRepository`·`catalogRepository`·
  `eventRepository`·`supabaseRateLimitRepository`·`supabaseUserApiKeyRepository`) + `base/BaseRepository`(Supabase 전용 추상)
  + Drizzle-pg 7종(`repositories/drizzle/*`) + `utils/supabaseErrors`(PGRST116 매퍼). SQLite 7종만 잔존.
- **DB 계층**: `lib/db/connection.ts`(node-postgres 풀)·`lib/db/failover.ts`(postgres↔supabase 서킷브레이커)·
  `lib/db/schema.ts`(pg-core 스키마, Auth.js accounts/sessions 테이블 포함). `lib/db/sqlite/*`만 잔존.
- **Supabase 클라이언트**: `lib/supabase/{server,client,middleware}.ts` 전부.
- **인증**: `lib/auth/{supabase-auth,authjs-auth,authjs-config}.ts` + `(auth)/callback/route.ts`(Supabase OAuth 콜백).
  `local-auth*`·`adminCredentials`·`authorize`만 잔존.
- **스크립트**: `verifyPlatformKeys`·`verifyCatalog`·`generateSqliteSeed`·`migrateSupabaseToSqlite`·`migrate-encryption-key`
  (모두 `@supabase/supabase-js` 의존, 컷오버 1회성/Supabase 소스 의존이라 폐기).
- **인프라**: `supabase/`(CLI 마이그레이션 001~021·seed.sql — 시드는 `src/data/*.json`에 번들됨), `drizzle.config.ts`(pg),
  `.github/workflows/scheduled.yml`(Supabase 카탈로그 헬스체크 cron).

### 단순화된 코드 (편집)
- **`lib/config/providers.ts`**: `getDbProvider()`→`'sqlite'` 상수, `getAuthProvider()`→`'local'`(AUTH_SECRET만 검증). 타입 단일화.
- **레포/서비스 factory**: 3-way 분기·`SupabaseClient` 인자 제거 → 무인자 SQLite 생성.
- **라우트/페이지 30개**: `const x = getDbProvider()==='supabase' ? await createClient()/createServiceClient() : undefined`
  가드 전수 제거 → factory 무인자 호출. (API 26 + (main) 페이지 4 + `site/[slug]`)
- **`middleware.ts`**: Supabase 세션 갱신 분기·`updateSession` import 제거, `enforceAuthGate`를 local 전용으로,
  CSP에서 Supabase URL(`*.supabase.co`·`connect-src` ws) 제거.
- **`lib/auth/index.ts`·`[...nextauth]/route.ts`**: local 단일 경로.
- **`hooks/useAuth.ts`**: Supabase 브라우저 클라이언트 경로 삭제 → **next-auth `useSession` 단일 경로**로 재작성,
  세션을 `authStore`에 동기화(헤더 사용자 표시). **`app/layout.tsx`는 `<SessionProvider>`를 항상 마운트**(과거엔 authjs일 때만).
- **`(auth)/login/page.tsx`**: OAuth 버튼/핸들러·`isLocal` 분기 삭제 → Credentials 폼 단일.
- **`lib/events/eventPersister.ts`·`lib/catalog/activeApiCount.ts`**: Supabase 가드/인라인 클라이언트 제거 → factory 경유.
- **`lib/ai/generationSaver.ts`**: Drizzle 트랜잭션(postgres) 분기 삭제 → SQLite 경로(`codeRepo.create` + `updateStatus`
  보상 롤백) 단일. (컷오버 후 프로덕션이 이미 사용하던 경로.)
- **`instrumentation.ts`**: SQLite 부트스트랩을 무조건 실행(유일 DB).

### 부수 correctness 수정
- **`lib/db/errors.ts` `isUniqueViolation`**: Postgres `23505`만 감지하던 것을 **better-sqlite3
  `SQLITE_CONSTRAINT_UNIQUE`/`SQLITE_CONSTRAINT_PRIMARYKEY` + "UNIQUE constraint failed" 메시지**까지 인식하도록 확장
  (`23505`는 무해한 레거시 폴백 유지). sqlite 단독 환경에서 게시 slug 충돌 재시도가 동작하지 않던 잠재 버그 해소.

### 의존성 제거 (package.json)
`@auth/drizzle-adapter`·`@supabase/ssr`·`@supabase/supabase-js`·`pg`·`@types/pg` 삭제(총 10패키지). `better-sqlite3`·
`drizzle-orm`(sqlite)·`drizzle-kit`·`next-auth` 유지. 스크립트 `catalog:healthcheck(:write)`·`keys:verify`·
`seed:generate`·`cutover:migrate` 삭제, `admin:hash` 유지.

## 결과

- **롤백 불변식 종료**: env 스위치로 Supabase 복귀가 불가능해졌다(코드/의존성 부재). 이후 롤백은 git revert + 재배포.
- Edge 미들웨어가 더 이상 node-only 그래프(pg) 위험을 안지 않는다(`failover`/`connection` 제거).
- 카탈로그 헬스 모니터링 CI cron(`scheduled.yml`)은 제거됨 — 업스트림 검증이 Supabase 카탈로그 읽기에 의존했기 때문.
  대안은 배포 서비스의 관리자 엔드포인트(`/api/v1/admin/debug`·`qc-stats`)와 `qc-monitor.yml`(HTTP) 기반 모니터링.
- 플랫폼 키 검증은 배포 런타임 관리자 엔드포인트 `GET /api/v1/admin/keys-verify`로 유지(CLI `keys:verify` 폐기).

## 검증
- `pnpm type-check`·`pnpm lint`·`pnpm test`(전체) green, `pnpm build` 성공.
- 소스(`src/**` 비-테스트)에 Supabase/pg/failover/Drizzle-pg 잔존 참조 0 (grep 확인).

## 후속 / 비범위
- (사용자) `ENCRYPTION_KEY` 미설정 — 개인 API 키 암호화 등록에 필요(부팅·로그인엔 불필요).
- (사용자) 관리자 로그인 E2E 확인.
- `scripts/*.sql`(backfillGoldenSet·2026-06-21 ops)은 Supabase 대상 1회성 SQL — inert라 보존(빌드 무관). 필요 시 별도 정리. → **2026-08-03(C7) 삭제 완료.**
- 백업 크론(WBS P6.3)·verification cron 컨테이너 내부화(P5.2)는 여전히 이연.
