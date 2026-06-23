# DB 제거 → 임베디드 SQLite 전환 (단일 사용자·셀프호스트) — WBS 계획

- 날짜: 2026-06-22 (착수 2026-06-23)
- 상태: **실행 중** — 승인 완료(현 프로덕션 제자리 전환). 진행 현황은 §0 참조.
- 근거: 정합성 감사(7차원 persistence surface) + 딥리서치(SQLite/Railway/Auth.js, 출처 포함) + 사용자 범위 결정 3건
- 관련: [Supabase 사용 요소](../../../CLAUDE.md), provider 추상화([src/lib/config/providers.ts](../../../src/lib/config/providers.ts))

## 0. 진행 현황 (2026-06-23)

브랜치 `feat/sqlite-migration` (origin 백업됨). 전체 스위트 2119 통과, type-check·lint clean, `pnpm build` 성공(미들웨어 Edge 번들 위반 0). **프로덕션 무영향**(sqlite·local 모두 `DB_PROVIDER`/`AUTH_PROVIDER` opt-in, 기존 Supabase 기본값 유지).

| Phase | 상태 | 커밋 |
|---|---|---|
| **Phase 1 — 데이터 계층** (P1.1~1.6) | ✅ 완료 | `69ac078`, `122819d` |
| **Phase 2 — 인증** | ✅ 기능 완료 (P2.1~P2.3; P2.4 정리는 Phase 3 동반) | `18e4d64` + (이번 커밋) |
| Phase 3~8 | ⬜ 대기 | — |

- **완료(Phase 1)**: SQLite 스키마(9테이블)·연결(WAL/FK)·마이그레이션(`drizzle/sqlite/`, 커밋)·`DB_PROVIDER=sqlite` / 7개 SQLite 레포(159테스트)·원자적 레이트리밋(`db.transaction`+`UPDATE…WHERE count<limit RETURNING`)·factory 배선.
- **완료(Phase 2)**: `AUTH_PROVIDER=local`(Auth.js Credentials 단일 관리자 + JWT 무상태, scrypt 비번, `getAuthUser` 분기) / **P2.2** edge-safe 분할 설정(`local-auth-base`+`local-auth-edge`) + 미들웨어 `local` 세션 게이팅(`enforceAuthGate`) / `/api/auth/[...nextauth]/route.ts` provider 디스패치 핸들러 / **P2.3·P2.4** 로그인 페이지 Credentials 폼 + 관리자 `users` 멱등 시드(`seedAdmin`)·부팅 부트스트랩(`bootstrap`, instrumentation 배선 — P6.1 부팅 마이그레이션 일부 선반영) + `scripts/hashAdminPassword.ts`(`pnpm admin:hash`).
  - ✅ 미들웨어 `await auth()`의 **실 Edge 런타임 동작 검증 완료**(dev 서버 스모크 7/7: 미인증 /dashboard→307 /login, 로그인→JWT 발급, 인증 /dashboard→게이트 통과). 분할 설정이 end-to-end 동작 확인. (전체 서빙·sqlite 통합은 Phase 4에서 계속.)
- **진행 중(Phase 3 — 직접-DB/RPC/service-role 정리)**: 패턴 = 인라인 가드 `getDbProvider()==='supabase' ? await createServiceClient() : undefined` 후 `createXRepository(client)`.
  - ✅ **이미 가드 적용**(감사 과대계산 정정): health·user-api-keys·proxy 진입(L270)·suggest-modification·preview / **eventPersister**(sqlite 버그 수정·패턴 확립) / **proxy 개인키 해결**(내부 헬퍼 raw `.from` → `createProjectRepository`/`createUserApiKeyRepository`, 모든 provider 동작, positive 테스트 추가).
  - ⬜ **남은 실작업**: **admin 4종**(qc-stats: platform_events 집계×4 — 새 event-repo 집계 메서드 필요·keys-verify: api_catalog·test-generation·trigger-qc — 가드 미적용) / **settings/api-keys 페이지**(user_api_keys 직접 조회 → repo).
  - 이연: `callback`(raw `.from('users')`)은 Supabase Auth OAuth 전용 아티팩트(local 모드 미사용) → P2.4/Phase 8에서 제거. `.rpc()` 6은 Supabase 레포 내부(sqlite 레포는 트랜잭션으로 대체 완료) → Phase 8 supabase 제거 시 동반 소멸.
- **컷오버 전 사용자 준비물**: Railway 영속 볼륨(P0.1), env `AUTH_SECRET`·`ADMIN_EMAIL`·`ADMIN_PASSWORD_HASH`(`pnpm admin:hash`로 생성)·(선택)`ADMIN_NAME`·`SQLITE_PATH`·`ADMIN_USER_ID`.

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

### Phase 3 — 직접-DB/RPC/service-role 정리 (규모 M)
| ID | 작업 | 선행 | 규모 | AC |
|---|---|---|---|---|
| P3.1 | `.rpc()` 6곳 → SQLite 레포 메서드로 재배선 | P1.5 | S | RPC 호출 0건 |
| P3.2 | `createServiceClient` 10파일(12 호출 지점) → SQLite 레포 + 단일 사용자 인가로 재작성(proxy 키 resolve·user-api-keys·suggest-modification·health·eventPersister·admin 4종·preview) | P1.4,P2.3 | M | service-role 개념 소거, 키 resolve 동작 |
| P3.3 | raw `.from()` 5파일·10 호출 지점(qc-stats×4·keys-verify·proxy×2·settings/api-keys·callback×2) 재배선 | P3.2 | S | raw supabase 접근 0건 |

### Phase 4 — 서빙/런타임 검증 (규모 M)
| ID | 작업 | 선행 | 규모 | AC |
|---|---|---|---|---|
| P4.1 | `/site/[slug]` 서빙·preview·코드저장 트랜잭션(INSERT+UPDATE)·버전 고유성 SQLite 경로 검증 | P1.4 | M | 게시→서브도메인 서빙 E2E 통과 |
| P4.2 | 인메모리 상태(generationTracker·proxyCache·errorRateMonitor) 유지 확인(단일 인스턴스라 무변경) | — | S | 회귀 없음 |
| P4.3 | 배포 상태머신(projects.status 전이) + 배포 레이트리밋/환불 SQLite 검증 | P1.5,P4.1 | S | 배포 흐름·환불 동작 |

### Phase 5 — 설정·번들 데이터 (규모 S)
| ID | 작업 | 선행 | 규모 | AC |
|---|---|---|---|---|
| P5.1 | `api_catalog`(49행) 시드 → SQLite 시드 스크립트(기존 seed.sql 변환) | P1.2 | S | 시드 후 23 활성 동작 |
| P5.2 | `verification_status` cron `--write` 경로를 SQLite write로 전환 | P5.1,P1.4 | S | cron이 SQLite 갱신 |
| P5.3 | `feature_flags`(7) → SQLite 시드 또는 config 파일 | P1.2 | S | 플래그 읽기 동작 |

### Phase 6 — 인프라/배포 (규모 M)
| ID | 작업 | 선행 | 규모 | AC |
|---|---|---|---|---|
| P6.1 | Dockerfile: `better-sqlite3` 네이티브 빌드(빌드 의존), 볼륨 경로, 부팅 시 마이그레이션 실행 | P1.2 | M | 컨테이너 부팅→마이그레이션→서비스 정상 |
| P6.2 | 환경변수 정리(Supabase 제거), `DB_PROVIDER=sqlite`·`AUTH_PROVIDER` 단일화, supabase-js 의존 제거 | P3.3,P2.2 | S | Supabase env 0건에서 부팅 |
| P6.3 | (옵션) Litestream 사이드카(S3 허용 시) 또는 주기 `.backup` 크론(자체보관) | P0.4 | M | 백업 산출물 생성·복구 리허설 |
| P6.4 | `pnpm test:prod` standalone 헬스체크 + 배포 검증 | P6.1,P6.2 | S | 헬스 200, 핵심 플로우 동작 |

### Phase 7 — 테스트 재작성 (규모 L)
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
