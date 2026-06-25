# DB 제거 → 임베디드 SQLite 전환 (단일 사용자·셀프호스트) — WBS 계획

- 날짜: 2026-06-22 (착수 2026-06-23, 완료 2026-06-23)
- 상태: **✅ 완료 (2026-06-23 컷오버·배포 완료, 프로덕션 라이브)** — Phase 1~8 반영. P6.3(SQLite 백업 자동화)는 2026-06-25 인프로세스 구현 완료. **코드성 이연 1건만 잔존**: P5.2(verification cron 컨테이너 내부화). 진행 현황은 §0 참조.
- 근거: 정합성 감사(7차원 persistence surface) + 딥리서치(SQLite/Railway/Auth.js, 출처 포함) + 사용자 범위 결정 3건
- 관련: [Supabase 사용 요소](../../../CLAUDE.md), provider 추상화([src/lib/config/providers.ts](../../../src/lib/config/providers.ts))

## 0. 진행 현황 (2026-06-23)

브랜치 `feat/sqlite-migration` (origin 백업됨). 전체 스위트 2126 통과, type-check·lint clean, `pnpm build` 성공(미들웨어 Edge 번들 위반 0). **프로덕션 무영향**(sqlite·local 모두 `DB_PROVIDER`/`AUTH_PROVIDER` opt-in, 기존 Supabase 기본값 유지).

| Phase | 상태 | 커밋 |
|---|---|---|
| **Phase 1 — 데이터 계층** (P1.1~1.6) | ✅ 완료 | `69ac078`, `122819d` |
| **Phase 2 — 인증** | ✅ 기능 완료 (P2.1~P2.3; P2.4 정리는 Phase 3 동반) | `18e4d64`, `c67ec18` |
| **Phase 3 — 직접-DB/RPC 정리** | ✅ 완료 (callback·repo `.rpc`는 Phase 8 이연) | `a9688f2`, `4b7b75a`, `768da35`, `7cddeef` |
| **Phase 4 — 서빙/런타임 검증** | ✅ 완료 — P4.1 서빙 검증 + P4.3 외부 배포 통합은 컷오버 후 프로덕션 라이브로 검증됨 | (검증, 코드 무변경) |
| **Phase 5 — 설정·번들 데이터 시드** | 🔵 P5.1·P5.3 완료, P5.2 이연 | `1ff1834` |
| **Phase 6 — 인프라/배포** | ✅ P6.1~P6.4 완료(docker 검증·supabase env 0 부팅은 P8.2로 충족, P6.3 자동 백업은 2026-06-25 인프로세스 구현) | `c5adbdf` |
| **Phase 7 — 테스트 정리** | 🔵 P7.2·P7.3 완료, P7.1·P7.4는 Phase 8 동반 | `c343ab0` |
| **Phase 8 — 컷오버 + 정리** | ✅ **완료 (2026-06-23)** — 컷오버 + P8.2(supabase/pg/authjs 코드·의존 제거) + P8.3(문서) | `#162`·`#163`·`#164` → `28acede`+`4c528f3d`, 이후 P8.2/P8.3 |

> **🎉 2026-06-23 컷오버 + Supabase 완전 제거 완료**: xzawed.xyz가 sqlite+local 인증으로 라이브 전환·영속 볼륨 마운트. 컷오버 중 함정 3건 수정(Railway VOLUME 미지원 #163 / NextAuth `AUTH_TRUST_HOST=true` / Railway 볼륨 root-소유 → entrypoint chown+su-exec #164, 약 20분 다운 후 복구). **P8.2 완료**: Supabase/on-prem Postgres/Drizzle-pg/Auth.js-OAuth 경로·의존(`@supabase/*`·`pg`·`@auth/drizzle-adapter`) 전면 제거(레포·base·connection·failover·schema·supabase 클라이언트·authjs/supabase-auth·callback·스크립트·`supabase/` 디렉터리·`scheduled.yml`), 30개 라우트 가드 제거, 단일 스택 seam 단순화, `isUniqueViolation` SQLite-aware 수정, `useAuth`/`SessionProvider` local 단일화. **검증**: type-check·lint clean, **1779 테스트 통과**, `pnpm build` 성공, 소스 잔존 supabase ref 0. **P8.3 완료**: CLAUDE.md·AGENTS.md·README·env-vars·architecture(overview/database/auth)·`.env.example` 갱신 + 컷오버 ADR. 상세: [컷오버 ADR](../../decisions/2026-06-23-sqlite-cutover-and-supabase-removal.md). **남은 사용자 작업(코드 외)**: `ENCRYPTION_KEY` 설정·관리자 로그인 E2E 확인.

- **완료(Phase 1)**: SQLite 스키마(9테이블)·연결(WAL/FK)·마이그레이션(`drizzle/sqlite/`, 커밋)·`DB_PROVIDER=sqlite` / 7개 SQLite 레포(159테스트)·원자적 레이트리밋(`db.transaction`+`UPDATE…WHERE count<limit RETURNING`)·factory 배선.
- **완료(Phase 2)**: `AUTH_PROVIDER=local`(Auth.js Credentials 단일 관리자 + JWT 무상태, scrypt 비번, `getAuthUser` 분기) / **P2.2** edge-safe 분할 설정(`local-auth-base`+`local-auth-edge`) + 미들웨어 `local` 세션 게이팅(`enforceAuthGate`) / `/api/auth/[...nextauth]/route.ts` provider 디스패치 핸들러 / **P2.3·P2.4** 로그인 페이지 Credentials 폼 + 관리자 `users` 멱등 시드(`seedAdmin`)·부팅 부트스트랩(`bootstrap`, instrumentation 배선 — P6.1 부팅 마이그레이션 일부 선반영) + `scripts/hashAdminPassword.ts`(`pnpm admin:hash`).
  - ✅ 미들웨어 `await auth()`의 **실 Edge 런타임 동작 검증 완료**(dev 서버 스모크 7/7: 미인증 /dashboard→307 /login, 로그인→JWT 발급, 인증 /dashboard→게이트 통과). 분할 설정이 end-to-end 동작 확인. (전체 서빙·sqlite 통합은 Phase 4에서 계속.)
- **완료(Phase 3 — 직접-DB/service-role 정리)**: 패턴 = 인라인 가드 `getDbProvider()==='supabase' ? await createServiceClient() : undefined` 후 `createXRepository(client)`(service factory도 provider-aware).
  - 라우트/페이지 전환: health·user-api-keys·suggest-modification·preview / **eventPersister**(sqlite 버그 수정) / **proxy**(진입 + 개인키 해결: 내부 헬퍼 raw `.from`→`createProjectRepository`/`createUserApiKeyRepository`) / **settings/api-keys**(`findAllByUser`) / **admin 4종**(qc-stats·keys-verify·trigger-qc·test-generation) 모두 레포 경유.
  - 신규 레포 메서드(3 구현체 + 인터페이스): `IEventRepository.countByTypeSince`/`findPayloadsByTypeSince`, `ICodeRepository.findMetadataByDateRange` — qc-stats `platform_events`/`generated_codes` 집계용(집계는 DB 오류 throw로 0-메트릭 은폐 방지).
  - 이연(Phase 8 동반): `callback`(raw `.from('users')`)은 Supabase Auth OAuth 전용 아티팩트(local 모드 미사용). repo 내부 `.rpc()` 6은 Supabase 레포 전용(sqlite 레포는 트랜잭션 대체 완료) → supabase 제거 시 동반 소멸.
- **완료(Phase 5 — 설정·번들 데이터)**: 카탈로그·플래그를 **번들 JSON + 멱등 시드 함수**로 부팅 시 시드.
  - `src/data/apiCatalog.json`(프로덕션 49행, 23 활성)·`src/data/featureFlags.json`(7) — 프로덕션 미러 생성 산출물. `scripts/generateSqliteSeed.ts`(`pnpm seed:generate`)로 Supabase에서 재생성(countries.json 패턴).
  - `src/lib/db/sqlite/seedCatalog.ts`(`seedCatalog`/`seedFeatureFlags`, 빈 테이블일 때만 일괄 삽입·멱등) → `bootstrapSqlite`에 배선(마이그레이션→admin→catalog→flags). id·created_at은 프로덕션 값 보존(project_apis FK 일관성).
  - **검증**: 실 sqlite 서버 스모크 5/5 — 부팅 후 DB `catalog=49·active=23·flags=7·users=1`, `GET /api/v1/catalog`가 시드 데이터 서빙. seedCatalog 단위 4/4(:memory:).
  - **P5.2 이연**(verification_status cron SQLite write): 현 cron(`scripts/verifyCatalog.ts`)은 CI에서 Supabase에 쓴다. sqlite 셀프호스트는 검증을 컨테이너 내부에서 돌려야 하므로(볼륨 접근) Phase 6 배포 설계와 함께 다룬다. 시드된 `verification_status`(프로덕션 기준)가 baseline.
- **검증(Phase 4)**: **P4.1 서빙 E2E 검증 완료** — 실 dev 서버(`DB_PROVIDER=sqlite`+`AUTH_PROVIDER=local`) 스모크 6/6: 부팅 부트스트랩(마이그레이션+admin 시드) → 게시 프로젝트+코드 시드 → `GET /site/demo` 200(`findBySlug`+`findByProject`+`assembleHtml` 모두 sqlite 경로 동작)·`SITE_CSP` 헤더·미존재 slug 404. P4.2(인메모리 상태)는 코드 무변경이라 자명. **P4.3**(배포 상태머신/레이트리밋 환불)은 레포 단위(SqliteRateLimitRepository 원자적 카운터·환불) 검증됨, 외부 배포(GitHub/Railway) 통합은 실배포에서 확인 필요.
- **완료(Phase 6 — 인프라/배포)**: Dockerfile이 sqlite 모드를 빌드·실행 지원.
  - **Dockerfile**: deps `apk add g++ make python3`(better-sqlite3 네이티브, 프리빌트 부재 시 소스 컴파일) / runner `libstdc++`(네이티브 바인딩 런타임) + `/data` 디렉터리(nextjs 소유)·`VOLUME /data` / **`drizzle/sqlite` 명시 복사**(standalone이 비추적 자산을 자동 포함 안 함 — 미포함 시 부팅 시 `runSqliteMigrations`가 journal 못 찾아 크래시) / `NEXT_PUBLIC_AUTH_PROVIDER` build arg(로그인 폼 빌드타임 인라인). `next.config`에 `better-sqlite3` serverExternalPackages(네이티브 모듈 webpack 번들 금지).
  - **검증(docker build + run)**: 이미지 빌드 성공 → 컨테이너(`DB_PROVIDER=sqlite`+`AUTH_PROVIDER=local`, **supabase env 0개**) 부팅 → 부트스트랩이 볼륨에 마이그레이션+시드(`catalog=49·active=23·flags=7·users=1`) → `/api/v1/health` 200·`/dashboard` 307→`/login`·`/site/nope` 404·`/api/v1/catalog` 시드 서빙·부팅 에러 0. **P6.2 "supabase env 0 부팅" AC 충족**.
  - ⚠️ **테스트 함정**(코드 무관): Git Bash(MSYS)가 `docker run -e SQLITE_PATH=/data/app.db`의 `/data/...`를 `C:/Program Files/Git/...`로 변환 → "directory does not exist". `MSYS_NO_PATHCONV=1`로 우회(SQLITE_PATH 미지정 시 코드 기본값 `/data/app.db`는 문자열 리터럴이라 무영향).
  - **컷오버 빌드/런타임**: 빌드 `--build-arg NEXT_PUBLIC_AUTH_PROVIDER=local`(+기존 supabase args 불필요 시 빈 값), 런타임 env `DB_PROVIDER=sqlite`·`AUTH_PROVIDER=local`·`AUTH_SECRET`·`ADMIN_EMAIL`·`ADMIN_PASSWORD_HASH`. **Railway Volume을 `/data`에 마운트 필수**.
  - **P6.2 잔여**: `@supabase/*` 의존 제거는 Phase 8(supabase 경로 제거와 함께)에서 완료. **P6.3 완료(2026-06-25)**: 인프로세스 주기 `.backup` 덤프 + 보관 정책(`src/lib/db/sqlite/backup.ts`, instrumentation 배선). 남은 이연은 P5.2 verification cron 컨테이너 내부화뿐.
- **완료(Phase 7 — 테스트 정리, 컷오버 전 가능 범위)**: P7.2(인증·미들웨어 테스트)는 Phase 2에서 완료. P7.3 라우트 테스트 모킹 일관화 — Phase 3에서 getDbProvider를 추가한 라우트(test-generation·qc-stats·trigger-qc) 테스트(`admin-test-generation`·`admin`)에 `@/lib/config/providers` 모킹 추가(native pg cold-init 차단). **P7.1**(supabase/Drizzle 레포 테스트 → `:memory:` 단순화)·**P7.4**(factory/connection/failover 테스트 정리)는 **Phase 8에서 supabase/postgres 레포를 제거할 때 동반**(현재 supabase 레포는 프로덕션 경로라 테스트를 선제거하면 안 됨).
- **🚦 현재 위치 = 컷오버 게이트**: Phase 1~6 + 검증(P4.1)·테스트 정리(P7.2/P7.3)까지 **프로덕션 무영향으로 완료**. sqlite/local 스택이 docker로 빌드·실행·검증됨. **Phase 8(컷오버)부터는 프로덕션 supabase 경로를 제거**하므로 "무영향" 불변식을 깨는 비가역 변경 — **사용자 승인 + Railway 볼륨 준비 후** 진행한다.
- **컷오버 준비물 작성 완료(프로덕션 무변경)**: ① **단계별 런북** [docs/guides/sqlite-cutover-runbook.md](../../guides/sqlite-cutover-runbook.md)(볼륨·env·빌드인자·스위치·검증·롤백·P8.2 제거·백업). ② **데이터 이관 스크립트**(P8.1, 선택) `scripts/migrateSupabaseToSqlite.ts`(`pnpm cutover:migrate --out ./app.db [--user <id>]`) — self-contained(마이그레이션+카탈로그/플래그/관리자 시드+사용자 데이터 복사, user_id→단일 관리자 리맵). 산출 app.db를 볼륨 `/data`로 업로드. 둘 다 작성·type-check 통과, 실행은 사용자 컷오버 시점.
- **컷오버 전 사용자 준비물**: **Railway 영속 볼륨(P0.1) `/data` 마운트**(없으면 재배포마다 소실), env `AUTH_SECRET`·`ADMIN_EMAIL`·`ADMIN_PASSWORD_HASH`(`pnpm admin:hash`로 생성)·(선택)`ADMIN_NAME`·`SQLITE_PATH`·`ADMIN_USER_ID`, 빌드 `--build-arg NEXT_PUBLIC_AUTH_PROVIDER=local`.

## 1. 목표 & 확정 제약

**목표**: 관리형 DB(Supabase) 및 외부 상태 저장소 의존을 제거하고, **단일 컨테이너 안에서 자체 완결되는 임베디드 SQLite** 영속성으로 전환한다.

**사용자 확정 결정**
| 항목 | 결정 | 영향 |
|---|---|---|
| 배포 모델 | **단일 사용자 / 셀프호스트** | RLS·멀티유저 격리·organizations·gallery·복잡 OAuth 제거 → 범위 급감 |
| "오프라인" 의미 | **관리형 DB 비의존만** (외부 API 호출 허용) | Claude 생성·프록시·OAuth는 유지 가능. 제품 핵심 보존 |
| 백업 주권 | 추천 채택 | **자체보관 기본**(Railway 볼륨 스냅샷 + 주기 `.backup` 덤프), Litestream→S3는 옵션 |

**비목표(YAGNI)**: 멀티유저 RBAC, organizations/memberships, gallery/project_likes, 수평 확장(replica), HA/자동 페일오버(LiteFS sunset).

## 2. 타깃 아키텍처

```
단일 Railway 컨테이너
├── Next.js 16 standalone (단일 인스턴스 — 이미 전제)
├── 임베디드 SQLite (/data/app.db, WAL 모드)        ← Railway Volume 마운트(영속)
│     drizzle-orm/better-sqlite3 (first-party) + 마이그레이터
├── 인증: Auth.js v5, JWT 세션(무상태, 쿠키 JWE) — DB 어댑터 없음
│     단일 관리자 계정(Credentials) 권장 / OAuth는 옵션
├── 백업: 볼륨 스냅샷 + 주기 SQLite .backup 덤프(자체보관)  ← Litestream→S3는 옵션
└── 외부 호출 유지: Claude API(생성), 프록시 대상 API, (옵션)OAuth IdP
```

**구현 전략(핵심)**: 기존 provider 추상화(`DB_PROVIDER`)에 **`sqlite` 경로를 추가**하고, 이미 존재하는 Drizzle(postgres) 레포 7종을 **SQLite 방언으로 미러링**한다. 추상화 seam(`IRepository`·factory)을 유지해 리프트-앤-시프트가 아닌 **어댑터 교체**로 진행 → 리스크·작업량 최소화. 최종 정리 단계에서 Supabase/postgres 경로를 제거.

## 3. 리서치 검증 사실 (출처 기반 — WBS 전제)

- **단일 인스턴스 천장**: 볼륨 붙은 Railway 서비스는 replica 불가, 동일 볼륨 다중 마운트 금지, 재배포 시 짧은 다운타임. 현 앱이 이미 단일 인스턴스 전제라 **수용**. (railway docs)
- **볼륨 용량**: Free 0.5GB / Hobby 5GB / Pro 50GB(→1TB). OLTP엔 충분.
- **데이터 계층**: `drizzle-orm/better-sqlite3` first-party + 마이그레이터. WAL 권장(읽기-쓰기 동시성↑). **SQLite는 단일 writer**(WAL도 동시 쓰기 불가, SQLITE_BUSY) → 원자적 카운터는 `BEGIN IMMEDIATE` 직렬화. `synchronous=NORMAL` 기본(크리티컬 쓰기는 FULL).
- **인증**: Auth.js v5 **JWT = 어댑터 없으면 기본**(무상태). **Next 16 Node 미들웨어**로 과거 edge 분리 제약 완화. 즉시 무효화 불가 → 짧은 TTL/재로그인으로 완화(단일 사용자라 위험 낮음).
- **백업**: Litestream = DR(HA 아님), WAL→S3 연속 복제, **~1s 손실창**. S3 의존이 주권과 충돌 → **자체보관 우선** 결정.

## 4. WBS (Work Breakdown Structure)

> 규모: S(≤0.5d) · M(0.5~2d) · L(2~5d). 선행 = 선행 작업 패키지 ID. AC = 수용기준.

### Phase 0 — 선행·결정·안전망 (규모 M)
| ID | 작업 | 선행 | 규모 | AC |
|---|---|---|---|---|
| P0.1 | **Railway Volume 생성 + `/data` 마운트** (없으면 데이터 소실 — 최우선) | — | S | 컨테이너 재배포 후에도 `/data` 파일 잔존 확인 |
| P0.2 | Supabase 프로덕션 **전체 백업**(현행 데이터 export) — 컷오버 안전망 | — | S | api_catalog·projects·generated_codes 등 덤프 보관 |
| P0.3 | 인증 방식 확정(권장: Auth.js Credentials 단일 관리자 + JWT) | — | S | ADR 한 줄 결정 기록 |
| P0.4 | 백업 전략 확정(권장: 볼륨 스냅샷 + 주기 `.backup`; Litestream 옵션) | P0.1 | S | 백업·복구 절차 문서화 |
| P0.5 | 죽은 테이블/기능 확정 제외 목록(organizations·memberships·project_likes·gallery·event_log) 코드 사용처 재확인 | — | S | 제외 대상 0 사용처 확인 |

### Phase 1 — 데이터 계층: SQLite 어댑터 (규모 L)
| ID | 작업 | 선행 | 규모 | AC |
|---|---|---|---|---|
| P1.1 | `better-sqlite3` + `drizzle-orm/better-sqlite3` 도입, DB 연결(WAL·synchronous·busy_timeout pragma) | P0.1 | M | `:memory:` 및 파일 DB 연결·pragma 적용 테스트 |
| P1.2 | SQLite 스키마 정의(기존 Drizzle 스키마 → SQLite 방언; 죽은 테이블 제외, 단일 사용자로 단순화) | P1.1,P0.5 | M | drizzle 마이그레이션 생성·적용 |
| P1.3 | `sqlite` 를 `DB_PROVIDER`에 추가, factory 분기 | P1.1 | S | `getDbProvider()='sqlite'` 경로 동작 |
| P1.4 | 7개 IRepository의 SQLite 구현(Drizzle postgres 구현 미러) — Project·User·Code·Catalog·Event·RateLimit·UserApiKey | P1.2,P1.3 | L | 각 레포 메서드 단위 테스트(`:memory:` SQLite 실DB) |
| P1.5 | **원자적 레이트리밋 재현** — `BEGIN IMMEDIATE` 트랜잭션 test-and-set + 환불(GREATEST 0) + 일자 만료 | P1.4 | M | 동시(직렬) 요청 한도 초과 차단·환불 정확성 테스트 |
| P1.6 | JOIN 집계(`countTodayGenerations`·`getApiUsageFromProjects`)·검색(ilike→LIKE)·페이지네이션·버전 채번 SQLite 재구현 | P1.4 | M | 집계·검색·페이지네이션 결과 동등성 테스트 |

### Phase 2 — 인증 교체 (규모 M, 셀프호스트로 축소) 
| ID | 작업 | 선행 | 규모 | AC |
|---|---|---|---|---|
| P2.1 | ✅ Auth.js v5 JWT 세션 구성(어댑터 없음), 단일 관리자 Credentials provider | P0.3 | M | 로그인→JWT 쿠키 발급·검증 |
| P2.2 | ✅ 미들웨어 `local` 세션 게이팅 추가. **Node 런타임 전환 대신 Edge 유지 + edge-safe 분할 설정**(`local-auth-base`/`local-auth-edge`)으로 구현 — 프로덕션 Supabase(Edge) 경로 무영향. + `/api/auth/[...nextauth]` 핸들러 | P2.1 | M | 보호 경로 게이팅 동작(단위), Edge 임포트 위반 0(빌드 확인). ⚠️ 실 Edge `auth()` 동작은 Phase 4 |
| P2.3 | ✅ `getAuthUser` local 분기(P2.1에 포함) + 로그인 페이지 Credentials 폼 | P2.1 | S | 인증 소비처 회귀 없음 |
| P2.4 | ⬜→Phase 3 동반: RLS 의존 제거·`assertOwner` 자명화·OAuth 콜백 부트스트랩 제거(단일 소유자). createServiceClient/`.from()` 재배선과 함께 진행. (관리자 `users` 시드·`hashAdminPassword` CLI는 이번에 완료) | P2.3 | S | 권한 경계 단순화, 노출 회귀 테스트 |

### Phase 3 — 직접-DB/RPC/service-role 정리 (규모 M) — ✅ 완료 (P3.1 `.rpc`·callback은 Phase 8 이연)
| ID | 작업 | 선행 | 규모 | AC |
|---|---|---|---|---|
| P3.1 | `.rpc()` 6곳 → SQLite 레포 메서드로 재배선 | P1.5 | S | RPC 호출 0건 |
| P3.2 | `createServiceClient` 10파일(12 호출 지점) → SQLite 레포 + 단일 사용자 인가로 재작성(proxy 키 resolve·user-api-keys·suggest-modification·health·eventPersister·admin 4종·preview) | P1.4,P2.3 | M | service-role 개념 소거, 키 resolve 동작 |
| P3.3 | raw `.from()` 5파일·10 호출 지점(qc-stats×4·keys-verify·proxy×2·settings/api-keys·callback×2) 재배선 | P3.2 | S | raw supabase 접근 0건 |

### Phase 4 — 서빙/런타임 검증 (규모 M) — 🔵 P4.1 검증 완료(dev 스모크 6/6)
| ID | 작업 | 선행 | 규모 | AC |
|---|---|---|---|---|
| P4.1 | `/site/[slug]` 서빙·preview·코드저장 트랜잭션(INSERT+UPDATE)·버전 고유성 SQLite 경로 검증 | P1.4 | M | 게시→서브도메인 서빙 E2E 통과 |
| P4.2 | 인메모리 상태(generationTracker·proxyCache·errorRateMonitor) 유지 확인(단일 인스턴스라 무변경) | — | S | 회귀 없음 |
| P4.3 | 배포 상태머신(projects.status 전이) + 배포 레이트리밋/환불 SQLite 검증 | P1.5,P4.1 | S | 배포 흐름·환불 동작 |

### Phase 5 — 설정·번들 데이터 (규모 S) — 🔵 P5.1·P5.3 완료, P5.2 이연(Phase 6 동반)
| ID | 작업 | 선행 | 규모 | AC |
|---|---|---|---|---|
| P5.1 | `api_catalog`(49행) 시드 → SQLite 시드 스크립트(기존 seed.sql 변환) | P1.2 | S | 시드 후 23 활성 동작 |
| P5.2 | `verification_status` cron `--write` 경로를 SQLite write로 전환 | P5.1,P1.4 | S | cron이 SQLite 갱신 |
| P5.3 | `feature_flags`(7) → SQLite 시드 또는 config 파일 | P1.2 | S | 플래그 읽기 동작 |

### Phase 6 — 인프라/배포 (규모 M) — ✅ P6.1~P6.4 완료 (P6.3 자동 백업 2026-06-25 구현)
| ID | 작업 | 선행 | 규모 | AC |
|---|---|---|---|---|
| P6.1 | Dockerfile: `better-sqlite3` 네이티브 빌드(빌드 의존), 볼륨 경로, 부팅 시 마이그레이션 실행 | P1.2 | M | 컨테이너 부팅→마이그레이션→서비스 정상 |
| P6.2 | 환경변수 정리(Supabase 제거), `DB_PROVIDER=sqlite`·`AUTH_PROVIDER` 단일화, supabase-js 의존 제거 | P3.3,P2.2 | S | Supabase env 0건에서 부팅 |
| P6.3 | ✅ 인프로세스 주기 `.backup` 덤프 + 보관 정책(`src/lib/db/sqlite/backup.ts`, instrumentation 배선, 2026-06-25). Litestream→S3는 향후 옵션 | P0.4 | M | 백업 산출물 생성·정리 단위 검증(22 테스트). 복구 리허설은 운영 시 |
| P6.4 | `pnpm test:prod` standalone 헬스체크 + 배포 검증 | P6.1,P6.2 | S | 헬스 200, 핵심 플로우 동작 |

### Phase 7 — 테스트 재작성 (규모 L) — 🔵 P7.2·P7.3 완료, P7.1·P7.4는 Phase 8 동반(레포 제거 시)
| ID | 작업 | 선행 | 규모 | AC |
|---|---|---|---|---|
| P7.1 | 레포 구현 테스트 14파일 → SQLite `:memory:` 실DB 테스트로 **단순화**(손모킹 폐기 — 오히려 쉬워짐) | P1.4 | L | 레포 커버리지 회복 |
| P7.2 | 인증 테스트(Auth.js JWT), 미들웨어 테스트 재작성 | P2.2 | M | 인증 경로 커버 |
| P7.3 | API 라우트 21·서비스 4 테스트의 모킹 타깃 교체(인터페이스 경계 덕에 저영향) | P3.3 | M | 라우트 테스트 통과 |
| P7.4 | factory/connection/failover 인프라 테스트 단일화·정리 | P6.2 | S | 죽은 테스트 제거 |

### Phase 8 — 데이터 이관·컷오버·문서 (규모 M)
| ID | 작업 | 선행 | 규모 | AC |
|---|---|---|---|---|
| P8.1 | (기존 데이터 보존 시) Supabase→SQLite 이관 스크립트 + 검증. 셀프호스트 신규 시작이면 생략 | P0.2,P1.2 | M | 행수·무결성 대조 통과 |
| P8.2 | Supabase/postgres/Drizzle-pg 경로 및 미사용 의존 제거 | P7.4 | M | 빌드·테스트 그린, 의존 정리 |
| P8.3 | 문서 전면 갱신(CLAUDE.md·README·아키텍처·ADR), 배포/백업 운영 가이드 | P8.2 | M | 코드-문서 정합 |

## 5. 마일스톤(권장 순서)

1. **M1 기반**: P0 전체 + P1.1~P1.3 (볼륨·백업·SQLite 연결·provider 분기) — *데이터 소실 방지 확보*
2. **M2 데이터계층**: P1.4~P1.6 + P7.1 (레포 + 레이트리밋 + 레포 테스트)
3. **M3 인증**: P2 전체 + P7.2 (Supabase Auth 탈피)
4. **M4 배선정리**: P3 + P4 + P5 (직접-DB 제거, 서빙·설정 검증)
5. **M5 배포·정리**: P6 + P7.3~P7.4 + P8 (인프라·테스트·컷오버·문서)

## 6. 리스크 & 완화 (감사+리서치)

| 리스크 | 심각도 | 완화 |
|---|---|---|
| 볼륨 없이 SQLite 채택 시 데이터 영구 소실 | High | **P0.1을 절대 선행**. 볼륨 검증 전 컷오버 금지 |
| 원자적 레이트리밋 약화 → Claude 과금 폭증 | High | `BEGIN IMMEDIATE` 직렬화 + 증가/환불 동일 DB. 단일 사용자라 동시성 낮아 위험 추가 감소 |
| 권한 경계 회귀(노출) | Med→Low | 단일 사용자라 격리 부담 급감. 그래도 `assertOwner` 게이트 + 회귀 테스트 |
| 단일 인스턴스 천장(확장 불가) | Med | 현 규모 무해. 성장 시 외부 저장소 재이관 경로를 ADR로 사전 문서화. IRepository 유지로 재이관 비용 최소화 |
| ~1s 백업 손실창(Litestream) / 스냅샷 간격 | Med | 자체보관 기본 + 주기 짧게. 크리티컬 쓰기 `synchronous=FULL` |
| better-sqlite3 네이티브 빌드(Docker·Node 22) | Med | 멀티스테이지 빌드 검증, 프리빌트 확인 |

## 7. 미결정(실행 중 확정) — 추천 default 명시
- **백업 매체**: 자체보관(볼륨 스냅샷 + `.backup`) *권장 기본*; S3 허용 시 Litestream 추가(옵션).
- **인증 방식**: Auth.js Credentials 단일 관리자 *권장*; OAuth 유지 원하면 Auth.js OAuth provider(외부 IdP 호출).
- **카탈로그 보관**: SQLite 테이블 유지 *권장*(cron write 단순); 대안은 JSON 번들(countries 방식).
- **기존 데이터**: 셀프호스트 신규 시작이면 이관 생략; 보존 필요 시 P8.1.

## 8. 출처(딥리서치)
- Railway Volumes/Scaling: docs.railway.com/volumes/reference, /deployments/scaling
- Litestream: litestream.io/how-it-works, /alternatives, /tips; fly.io/blog/litestream-revamped
- Drizzle SQLite: orm.drizzle.team/docs/get-started-sqlite
- better-sqlite3 WAL/synchronous: github.com/WiseLibs/better-sqlite3 (docs/performance.md)
- Auth.js 세션/edge: authjs.dev/concepts/session-strategies, /guides/edge-compatibility
