# CustomWebService — Claude Code 지침

## 프로젝트 개요

AI 기반 노코드 플랫폼. 무료 API를 선택하고 서비스를 설명하면 AI가 HTML/CSS/JS를 생성하여 서브도메인(`slug.xzawed.xyz`)으로 즉시 게시.

- 서비스 URL: https://xzawed.xyz
- 배포: Railway (단일 인스턴스, Dockerfile, standalone output)
- 프로덕션 운영 중 (실사용자 서비스), 안정화 및 품질 개선 단계

## 기술 스택

| 영역 | 기술 |
|------|------|
| Framework | Next.js 16+ (App Router, TypeScript strict) |
| UI | React 19, Tailwind CSS 4, Lucide React |
| State | Zustand (분리 스토어 + persist middleware) |
| Form | React 로컬 상태(`useState`) + Zod (서버 검증) — React Hook Form 미사용 |
| Database | 임베디드 SQLite (better-sqlite3 + drizzle-orm, WAL · Railway Volume `/data/app.db`) |
| Auth | Auth.js v5 (Credentials + JWT 무상태) — 공개 셀프서비스 회원가입, DB 사용자별 scrypt 인증, 이메일 인증 게이트 |
| AI | Claude API (Anthropic SDK, claude-opus-5 기본, 조건부 Extended Thinking) |
| Testing | Vitest, happy-dom, MSW |
| CI/CD | GitHub Actions → lint → type-check → test → build → deploy |
| Package Manager | pnpm |

## 프로젝트 구조

```
src/
├── app/             # Next.js App Router (pages, layouts, API routes)
│   ├── api/         # /api/v1/* REST endpoints (admin/ 하위 진단 라우트: debug, keys-verify, verify-catalog, catalog-dump, qc-stats, site-proxy-stats, test-generation, trigger-qc)
│   ├── (auth)/      # 인증 관련 페이지
│   ├── (main)/      # 메인 페이지 그룹
│   └── site/        # 서브도메인 서빙 ([slug])
├── components/      # UI 컴포넌트 (builder/, catalog/, dashboard/, layout/, settings/, ui/)
├── hooks/           # 커스텀 React hooks
├── lib/             # 유틸리티
│   ├── ai/          # AI 파이프라인 — generationPipeline(오케스트레이터), stageRunner, generationSaver, qualityLoop, generationTracker(진행률 전용), generationLock(중복 생성 차단 — DB 락)
│   ├── auth/        # 인증 — getAuthUser, local-auth*(Credentials+JWT, edge-safe 분할 base/edge), password(scrypt hashPassword/verifyPassword), tokens(auth_tokens 발급/검증), rateLimit(per-IP 스로틀), verifiedGuard(assertEmailVerified), authorize(assertOwner)
│   ├── cache/       # proxyCache.ts — LRU+TTL 인메모리 캐시 (프록시 응답 서버사이드 캐시)
│   ├── config/      # 환경변수 기반 설정 (features, rateLimit, qc, limits 등)
│   ├── catalog/     # API 카탈로그 — healthCheck.ts(DB기반 라이브 검증 분류), verifyRunner.ts(라이브 검증 오케스트레이터·verification_status 갱신, admin 트리거), keyCheck.ts(플랫폼 키 검증), activeApiCount.ts(활성 개수 동적 카운트 — 랜딩/카탈로그 마케팅 카피, 하드코딩 금지)
│   ├── constants/   # 공용 상수 — cdn.ts (CSP CDN 화이트리스트, buildSiteCsp)
│   ├── countries/   # 자체 호스팅 국가 데이터 API 로직 — transform(mledoze 변환), query(region/search 필터·코드 조회), types
│   ├── db/          # 임베디드 SQLite — sqlite/(connection WAL/FK, schema 11테이블, migrator, bootstrap, seedCatalog, ensureCatalog, backup 주기 .backup 덤프+보관정책, retention 무한증가 테이블 정리), errors(UNIQUE 위반 감지)
│   ├── email/       # 이메일 발송 — emailService(sendVerificationEmail/sendPasswordResetEmail), Resend provider, no-op console fallback(RESEND_API_KEY 미설정 시)
│   ├── deploy/      # 배포 관련
│   ├── events/      # EventBus (pub/sub) + eventPersister (전체 이벤트 자동 DB 기록)
│   ├── generation/  # pollGenerationStatus — 생성 상태 폴링 (builder/page.tsx에서 추출, 주입형·단위 테스트 대상)
│   ├── monitoring/  # slackAlert (Webhook 알림), errorRateMonitor (생성 실패율 임계값 감지)
│   ├── i18n/        # 다국어 — t() 함수, ko.ts (한국어 메시지), types.ts (MessageKey)
│   ├── qc/          # QC 로직 — browserPool, deepQcRunner, qcChecks, renderingQc (index.ts는 renderingQc만 export)
│   ├── services/    # lib 레벨 유틸리티 서비스
│   ├── templates/   # 코드 생성 템플릿 (lib 레벨)
│   └── utils/       # 공통 유틸리티, 에러 클래스
├── middleware.ts     # 서브도메인 라우팅, 보안 헤더 (CSP, HSTS)
├── providers/       # AI Provider (IAiProvider → ClaudeProvider)
├── repositories/    # 데이터 접근 계층 — sqlite/(9 IRepository 구현 — SqliteGenerationLockRepository 추가), interfaces, utils, factory(무인자 SQLite 생성)
├── services/        # 비즈니스 로직 계층
├── stores/          # Zustand 스토어
├── templates/       # 코드 생성 템플릿
├── types/           # TypeScript 타입 정의 — schemas.ts (Zod 공용 스키마), project.ts, api.ts, events.ts 등
├── data/            # 번들 데이터 — countries.json(mledoze), apiCatalog.json(61행)·featureFlags.json(7) — 부팅 시드 소스(프로덕션 미러)
├── __tests__/       # 테스트 파일 (+ 소스 옆 co-located *.test.ts)
└── test/            # 테스트 헬퍼, 설정
```

## 개발 명령어

```bash
pnpm dev              # 개발 서버 (Turbopack)
pnpm build            # 프로덕션 빌드
pnpm lint             # ESLint 검사 (CI 게이트)
pnpm lint:fix         # ESLint 자동 수정
pnpm type-check       # TypeScript 타입 검사 (CI 게이트)
pnpm test             # 전체 테스트 (CI는 test:coverage로 전체 실행)
pnpm test:unit        # 단위 테스트 (lib, providers, services, repositories)
pnpm test:integration # 통합 테스트 (API routes — src/__tests__/api + src/app/api)
pnpm test:coverage    # 커버리지 리포트
pnpm test:e2e         # E2E (Playwright — 실 백엔드 env 필요, CI에서 실행)
```

```bash
# 운영 스크립트
pnpm tsx scripts/generateCountries.ts  # 국가 데이터(src/data/countries.json) 재생성 (준-정적)
```

> `pnpm admin:hash`(단일 관리자 해시 생성)는 다중 사용자 전환(2026-06-24)으로 **제거됨**. 계정 생성은 `/signup` 공개 페이지를 통해 수행한다.

> 카탈로그 키 검증은 배포 런타임 관리자 엔드포인트 `GET /api/v1/admin/keys-verify`로 수행한다.
> (Supabase 의존 CLI 스크립트 `catalog:healthcheck`·`keys:verify`·`seed:generate`·`cutover:migrate`는 SQLite 컷오버로 제거됨.)

> 포맷팅은 ESLint 규칙으로 통합 관리한다. `prettier`는 의존성에 없으며 `format`/`format:check`
> 스크립트는 제거됨(2026-06-09 감사). 포맷은 `pnpm lint`/`lint:fix`로 처리.

## 코딩 컨벤션

- **TypeScript strict mode** — `any` 사용 금지, export 함수에 명시적 반환 타입
- **Path alias**: `@/*` → `src/*`
- **API 라우트**: `/api/v1/*` 패턴 — 인증 + 유효성 검증 → Service 호출
- **아키텍처 레이어**: Route Handler → Service → Repository → SQLite (better-sqlite3, 무인자 factory)
- **AI Provider**: `IAiProvider` 인터페이스 — Provider 전용 로직은 Provider 내부에만
- **이벤트 시스템**: `EventBus` + `EventRepository` (감사 로그)
- **레이트리밋**: 혼합 패턴 — generate/regenerate/deploy는 SQLite 원자적 (better-sqlite3 동기 트랜잭션 `BEGIN` + `UPDATE WHERE count < limit RETURNING`, 단일 writer), proxy는 인메모리 Map (단일 인스턴스 전제)
- **요청 추적**: `X-Correlation-Id` 헤더
- **i18n**: `@/lib/i18n`의 `t()` 함수 사용, 한국어 기본
- **스토어**: 관심사별 분리된 Zustand 스토어 (단일 mega store 금지)
- **에러 처리**: `@/lib/utils/errors`의 커스텀 에러 클래스 사용
- **테스트**: 소스 옆 co-located `*.test.ts` 또는 `src/__tests__/`

## 핵심 설계 결정

- **서브도메인 라우팅**: middleware에서 Host 헤더 감지 → `/site/[slug]` rewrite
- **Standalone output**: Docker/Railway 배포를 위한 Next.js standalone 모드
- **보안 헤더**: middleware에서 CSP, HSTS, X-Frame-Options 설정
- **코드 생성 결과물**: React가 아닌 순수 HTML/CSS/JS (사용자 서비스용)
- **설정 기반 제한**: 환경변수로 생성 한도/버전 수 등 비즈니스 규칙 조절
- **모바일 백그라운드 생성**: SSE + 폴링 이중 구조 — `generationTracker` (서버 메모리, `generating` 30분 / `completed`·`failed` 10분 차등 TTL), 클라이언트 `visibilitychange` 감지 + `/api/v1/generate/status/:projectId` 폴링 fallback
- **AI 성능 최적화**: Prompt Caching (`ephemeral`), 조건부 Extended Thinking (`evaluateComplexityScore()` ≥ `ET_COMPLEXITY_THRESHOLD`(기본 35) 시 `thinking: { type: 'adaptive' }` + `output_config: { effort: 'high' }`), 조건부 Stage 2/3 스킵으로 비용·속도 최적화

## 환경변수 (참고용 — 값 절대 포함 금지)

- `AUTH_SECRET` — Auth.js JWT 세션 서명 키 (필수)
- `AUTH_TRUST_HOST=true` — 커스텀 도메인/프록시 뒤 필수 (없으면 `/api/auth/*` 500)
- `NEXT_PUBLIC_AUTH_PROVIDER=local` — 클라이언트 빌드타임 상수
- `RESEND_API_KEY` — 이메일 발송 Resend API 키 (미설정 시 콘솔 no-op 폴백 — 이메일 실제 미발송)
- `EMAIL_FROM` — 발신자 주소 (예: `noreply@xzawed.xyz`, `RESEND_API_KEY` 설정 시 필수. 빈 문자열 금지 — 발송 실패)
- `APP_URL` — 이메일 링크(인증·재설정)의 공개 base URL (예: `https://xzawed.xyz`). 미설정 시 `NEXT_PUBLIC_ROOT_DOMAIN`→요청 origin 폴백. 프록시 뒤 0.0.0.0 링크 방지 + 호스트 헤더 미신뢰(reset poisoning 차단). 로직: `getBaseUrl`(`src/lib/auth/routeHelpers.ts`)
- `SQLITE_PATH` — SQLite 파일 경로 (기본 `/data/app.db`, Railway Volume 마운트 필수)
- `SQLITE_BACKUP_ENABLED`/`SQLITE_BACKUP_INTERVAL_MS`/`SQLITE_BACKUP_RETENTION`/`SQLITE_BACKUP_DIR` — 자동 SQLite 백업(P6.3). 부팅 시 `scheduleBackups`가 주기 `.backup` 덤프를 `<SQLITE 디렉터리>/backups/`에 남기고 최근 N개만 보관. 기본: enabled=true·24h·7개·`/data/backups`. 로직: `src/lib/db/sqlite/backup.ts` (상세: [env-vars.md](docs/reference/env-vars.md))
- `NEXT_PUBLIC_ROOT_DOMAIN` (서브도메인 가상 호스팅)
- `ANTHROPIC_API_KEY`
- `ADMIN_API_KEY` — 관리자 API 인증 (QC 통계, 수동 QC 트리거)
- `ENABLE_RENDERING_QC` — Playwright 렌더링 QC 활성화 (true/false)
- `ENCRYPTION_KEY` — 사용자 API 키 암호화
- `GITHUB_TOKEN`, `RAILWAY_TOKEN` — 배포용
- `MAX_APIS_PER_PROJECT`, `MAX_DAILY_GENERATIONS` 등 제한 설정
- `AI_MODEL_SUGGESTION` — 추천용 모델 (기본: `claude-haiku-4-5`)
- `AI_MODEL_GENERATION` — 코드 생성 모델 (기본: `claude-opus-5`, Sonnet 폴백: `claude-sonnet-5`)
- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` / `SLACK_WEBHOOK_URL` — 에러·알림 sink. **Slack만 사용**(`errorRateMonitor` 생성 실패율 + `scheduleBackups` 백업 실패/복구 → `sendSlackAlert`). **Sentry는 의도적으로 미도입**(#220). `SLACK_WEBHOOK_URL`이 Railway에 실제로 설정되기 전까지 경보는 여전히 유실된다(`sendSlackAlert` no-op)
- `LOG_LEVEL` — 로그 상세도 (`debug`/`info`/`warn`/`error`, 기본 `info`)
- `ET_COMPLEXITY_THRESHOLD` — Extended Thinking 활성화 임계값 (기본: 35점, `evaluateComplexityScore()` 결과 비교)
- `QUALITY_LOOP_ITERATION_TIMEOUT_MS` — Quality Loop 반복당 타임아웃 (기본: 120000ms = 120초)
- `QUALITY_LOOP_ET_ITERATION_TIMEOUT_MS` — ET 활성화 시 Quality Loop 반복당 타임아웃 (기본: 200000ms = 200초). ET 응답이 최대 150초 소요되므로 일반 타임아웃(`QUALITY_LOOP_ITERATION_TIMEOUT_MS`)과 별도 설정
- `QUALITY_LOOP_MAX_ITERATIONS` — Quality Loop 최대 반복 횟수 (기본: 2회, 상한: 3회)
- `QUALITY_LOOP_STRICT_ADOPTION` — Quality Loop retry 채택 가드 (기본: `true`. `false`로 설정 시 한쪽 점수 향상만으로도 채택하는 기존 OR 로직 복원 — 운영 데이터 비교용 롤백 스위치)
- `PIPELINE_MAX_DURATION_MS` — 파이프라인 총 허용 시간 (기본: 290000ms = 290초). Quality Loop 시작 시 `경과 시간 + iterationTimeout > 이 값`이면 반복을 건너뜀. Railway 300초 한도를 고려한 안전 마진 확보용
- `QC_QUALITY_THRESHOLD`, `QC_MOBILE_THRESHOLD` — Quality Loop 재시도 트리거 점수 임계값 (각 기본: 60)
- `RATE_LIMIT_BYPASS_USER_IDS` — 쉼표 구분 userId 목록. 포함된 계정은 일일 생성 한도 검사 스킵 (관리자/개발자 우회용)
- `GENERATION_LOCK_HEARTBEAT_MS` / `GENERATION_LOCK_STALE_MS` — 생성 락 생존 신호 주기(기본 30초) / 죽은 락 판정 시간(기본 5분). **stale은 heartbeat보다 커야 하며** 아니면 `heartbeat × 2`로 교정하고 경고를 남긴다. 로직: `src/lib/config/generation.ts`
- 전체 환경변수 목록은 [docs/reference/env-vars.md](docs/reference/env-vars.md) 참조

## 문서 참조

| 질문 | 참조 문서 |
|------|-----------|
| 시스템 전체 구조 | [docs/architecture/overview.md](docs/architecture/overview.md) |
| AI 코드 생성 흐름 | [docs/architecture/ai-pipeline.md](docs/architecture/ai-pipeline.md) |
| 코드 생성/재생성 작업 **(필수)** | [docs/guides/qc-process.md](docs/guides/qc-process.md) |
| 테스트 전략·검증 항목 | [docs/guides/testing.md](docs/guides/testing.md) |
| API 엔드포인트 목록 | [docs/reference/api-endpoints.md](docs/reference/api-endpoints.md) |
| 골든셋 API 목록 (검증된 10개, 즉시 사용 가능) | [docs/reference/golden-api-set.md](docs/reference/golden-api-set.md) |
| 개발자 키 제공 방식 API 재활성화 ADR (31개 활성, 2026-05-01) | [docs/decisions/2026-05-01-developer-key-api-reactivation.md](docs/decisions/2026-05-01-developer-key-api-reactivation.md) |
| 보안 인시던트 대응 절차 | [docs/security/incident-response.md](docs/security/incident-response.md) |
| **의존성 감사 면제 목록 (pnpm audit 게이트 waiver)** | [docs/security/audit-waivers.md](docs/security/audit-waivers.md) |
| 의존성 보안 일괄 상향·감사 게이트 2단계화 ADR (2026-07-28) | [docs/decisions/2026-07-28-dependency-security-updates.md](docs/decisions/2026-07-28-dependency-security-updates.md) |
| **게시 사이트 프록시 복구·인가 모델 정비 ADR (C-1·C-2·H-1·H-2, 2026-07-28)** | [docs/decisions/2026-07-28-published-site-proxy-authz.md](docs/decisions/2026-07-28-published-site-proxy-authz.md) |
| 게시 사이트 프록시 설계 spec | [docs/superpowers/specs/2026-07-28-published-site-proxy-authz-design.md](docs/superpowers/specs/2026-07-28-published-site-proxy-authz-design.md) |
| **계정 삭제·데이터 내보내기 ADR (#221, 유령 세션 차단 포함, 2026-07-30)** | [docs/decisions/2026-07-30-account-delete-and-export.md](docs/decisions/2026-07-30-account-delete-and-export.md) |
| **로그인 레이트리밋 ADR (#223, IP+계정 잠금 없는 방식, 2026-07-30)** | [docs/decisions/2026-07-30-login-rate-limit.md](docs/decisions/2026-07-30-login-rate-limit.md) |
| **알림 sink Slack 고정·백업 실패 배선 ADR (#220, 2026-07-30)** | [docs/decisions/2026-07-30-monitoring-sink-slack-only.md](docs/decisions/2026-07-30-monitoring-sink-slack-only.md) |
| **AI 추천 일일 쿼터 분리 ADR (#219, 2026-07-30)** | [docs/decisions/2026-07-30-suggestion-daily-quota-separation.md](docs/decisions/2026-07-30-suggestion-daily-quota-separation.md) |
| 검수 MEDIUM 발견 항목 수정 ADR (M-1·2·3·5·6·7·8, 2026-07-29) | [docs/decisions/2026-07-29-medium-audit-findings.md](docs/decisions/2026-07-29-medium-audit-findings.md) |
| **생성 락을 인메모리 tracker에서 SQLite로 분리 ADR (M-5 근본 해결, 2026-07-29)** | [docs/decisions/2026-07-29-durable-generation-lock.md](docs/decisions/2026-07-29-durable-generation-lock.md) |
| **프록시 캐시 키에 키 신원 추가 ADR (M-4 잔여 해소, 2026-07-29)** | [docs/decisions/2026-07-29-proxy-cache-key-identity.md](docs/decisions/2026-07-29-proxy-cache-key-identity.md) |
| **게시 사이트 프록시 오남용 모니터링 ADR (한도 소진 경고·사용량 지표, 2026-07-29)** | [docs/decisions/2026-07-29-site-proxy-abuse-monitoring.md](docs/decisions/2026-07-29-site-proxy-abuse-monitoring.md) |
| **생성 모델 Opus 4.8 → Opus 5 상향 ADR (thinking 기본값 변경 대응, 2026-07-29)** | [docs/decisions/2026-07-29-llm-model-upgrade-opus5.md](docs/decisions/2026-07-29-llm-model-upgrade-opus5.md) |
| better-sqlite3 v13 N-API 프리빌트 전환·빌드 툴체인 제거 ADR (2026-07-28) | [docs/decisions/2026-07-28-better-sqlite3-v13-napi-prebuilds.md](docs/decisions/2026-07-28-better-sqlite3-v13-napi-prebuilds.md) |
| 환경변수 목록 | [docs/reference/env-vars.md](docs/reference/env-vars.md) |
| 에러 클래스 참조 | [docs/reference/error-codes.md](docs/reference/error-codes.md) |
| 배포/운영 작업 | [docs/guides/deployment.md](docs/guides/deployment.md) |
| **SQLite 컷오버 + Supabase/Postgres/OAuth 제거 ADR (P8.2, 2026-06-23)** | [docs/decisions/2026-06-23-sqlite-cutover-and-supabase-removal.md](docs/decisions/2026-06-23-sqlite-cutover-and-supabase-removal.md) |
| SQLite 전환 WBS 계획 (Phase 1~8) | [docs/superpowers/plans/2026-06-22-db-removal-sqlite-migration.md](docs/superpowers/plans/2026-06-22-db-removal-sqlite-migration.md) |
| SQLite 컷오버 런북 | [docs/guides/sqlite-cutover-runbook.md](docs/guides/sqlite-cutover-runbook.md) |
| **SQLite 복구 런북 (손상·오염 시 백업 되돌리기, #222)** | [docs/guides/sqlite-restore-runbook.md](docs/guides/sqlite-restore-runbook.md) |
| (역사) DB/Auth Provider 추상화 ADR — 컷오버로 single-stack 됨 | [docs/decisions/provider-migration.md](docs/decisions/provider-migration.md) |
| 설계 결정 배경 | [docs/decisions/](docs/decisions/) |
| 2단계 생성 파이프라인 설계 (초기 설계 문서, 현재 3-Stage로 확장됨 — 설계 원칙 참고용) | [docs/superpowers/specs/2026-04-14-two-stage-generation-design.md](docs/superpowers/specs/2026-04-14-two-stage-generation-design.md) |
| Repository 유틸리티 추출 ADR | [docs/decisions/2026-04-26-repository-utils-extraction.md](docs/decisions/2026-04-26-repository-utils-extraction.md) |
| CI ESLint 마이그레이션 ADR | [docs/decisions/2026-04-26-ci-eslint-migration.md](docs/decisions/2026-04-26-ci-eslint-migration.md) |
| 커버리지 개선 회고 (PR #45·#46) | [docs/decisions/2026-04-26-coverage-improvement-retrospective.md](docs/decisions/2026-04-26-coverage-improvement-retrospective.md) |
| 보안·접근성·커버리지 수정 ADR (PR #49·#50) | [docs/decisions/2026-04-26-sonarcloud-security-a11y-coverage.md](docs/decisions/2026-04-26-sonarcloud-security-a11y-coverage.md) |
| 생성 성공률 개선 ADR (Phase 2, PR #58) | [docs/decisions/2026-04-29-generation-success-rate-improvement.md](docs/decisions/2026-04-29-generation-success-rate-improvement.md) |
| 정확도 게이트 회귀 방지·가시화·개선 통합 ADR | [docs/decisions/2026-04-30-accuracy-gate-and-visibility.md](docs/decisions/2026-04-30-accuracy-gate-and-visibility.md) |
| API 카탈로그 전수 검증 ADR (62개, 2026-05-01) | [docs/decisions/2026-05-01-api-catalog-verification.md](docs/decisions/2026-05-01-api-catalog-verification.md) |
| API 카탈로그 즉시 사용 가능 기준 정리 ADR (23개 활성, 2026-05-01) | [docs/decisions/2026-05-01-api-catalog-immediate-usable-cleanup.md](docs/decisions/2026-05-01-api-catalog-immediate-usable-cleanup.md) |
| 프로덕션 인시던트 회고 ADR — ET API 마이그레이션 및 연쇄 장애 (2026-05-03) | [docs/decisions/2026-05-03-production-incident-et-api-migration.md](docs/decisions/2026-05-03-production-incident-et-api-migration.md) |
| Quality Loop 재활성화 및 ET 타임아웃 분리 ADR (PR #99, 2026-05-03) | [docs/decisions/2026-05-03-quality-loop-restoration-et-timeout.md](docs/decisions/2026-05-03-quality-loop-restoration-et-timeout.md) |
| 프록시 응답 캐시 구현 ADR (PR #101, 2026-05-04) | [docs/decisions/2026-05-04-proxy-response-cache.md](docs/decisions/2026-05-04-proxy-response-cache.md) |
| Unsplash Attribution 자동 삽입 ADR (PR #102, 2026-05-04) | [docs/decisions/2026-05-04-unsplash-attribution-auto-injection.md](docs/decisions/2026-05-04-unsplash-attribution-auto-injection.md) |
| playwright-core browsers.json nft 추적 실패 수정 ADR (PR #125, 2026-05-22) | [docs/decisions/2026-05-22-playwright-core-nft-browsers-json-fix.md](docs/decisions/2026-05-22-playwright-core-nft-browsers-json-fix.md) |
| 보안 감사 발견 항목 수정 ADR (C-1·H-2~H-11, PR #129·#131, 2026-05-23) | [docs/decisions/2026-05-23-security-audit-findings.md](docs/decisions/2026-05-23-security-audit-findings.md) |
| Vitest full-suite 플래키 타임아웃 해소 ADR (config/providers mock + testTimeout, 2026-06-09) | [docs/decisions/2026-06-09-test-flaky-timeout-contention-fix.md](docs/decisions/2026-06-09-test-flaky-timeout-contention-fix.md) |
| 테스트 플래키 타임아웃 잔여·후속 작업 핸드오프 (항목 1·2·3·4·6 완료, 5는 상시 모니터링, 2026-06-09) | [docs/superpowers/plans/2026-06-09-test-flakiness-followups.md](docs/superpowers/plans/2026-06-09-test-flakiness-followups.md) |
| 서비스 종합 건강 감사 및 발견 16건 수정 ADR (2026-06-09) | [docs/decisions/2026-06-09-service-health-audit-fixes.md](docs/decisions/2026-06-09-service-health-audit-fixes.md) |
| API 카탈로그 동작 검증 & 헬스 모니터링 자동화 ADR (REST Countries 폐기·DB 기반 헬스체크, 2026-06-21) | [docs/decisions/2026-06-21-api-catalog-health-monitoring.md](docs/decisions/2026-06-21-api-catalog-health-monitoring.md) |
| Node 22 전면 상향 ADR (supabase-js 2.108 eager WebSocket 가드 대응·#154 오탐 근본 원인, 2026-06-22) | [docs/decisions/2026-06-22-node22-supabase-websocket-fix.md](docs/decisions/2026-06-22-node22-supabase-websocket-fix.md) |
| verification_status 신선도·AI 추천 소비 ADR (B-2, cron --write + broken 제외·verified 우선, 2026-06-22) | [docs/decisions/2026-06-22-verification-status-consumption.md](docs/decisions/2026-06-22-verification-status-consumption.md) |
| 카탈로그 등록(B-3 완료)·seed.sql 전면 재동기화(B-5) ADR (Countries 등록·프로덕션 미러, 2026-06-22) | [docs/decisions/2026-06-22-catalog-registration-and-seed-resync.md](docs/decisions/2026-06-22-catalog-registration-and-seed-resync.md) |
| **공개 회원가입 + 다중 사용자 인증 ADR (단일 관리자 → DB 사용자 + 이메일 인증, 2026-06-24)** | [docs/decisions/2026-06-24-public-signup-multi-user-auth.md](docs/decisions/2026-06-24-public-signup-multi-user-auth.md) |
| 공개 회원가입 다중 사용자 인증 설계 | [docs/superpowers/specs/2026-06-24-public-signup-multi-user-auth-design.md](docs/superpowers/specs/2026-06-24-public-signup-multi-user-auth-design.md) |

- [README.md](README.md) — 프로젝트 전체 개요
- [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md) — PR 템플릿
- [.scamanager/](.scamanager/) — pre-push 자동 코드리뷰 훅 (`install-hook.sh`로 설치)

## 배포 품질 원칙 (필수)

이 서비스는 다수 사용자가 이용 중입니다. 배포 품질 = 서비스 신뢰도.

### CSP / 보안 헤더 변경 시
- `src/middleware.ts`, `src/app/site/[slug]/route.ts`, `src/app/api/v1/preview/[projectId]/route.ts` 3개 파일을 반드시 동시에 확인 (전체 경로 기준 — 이름만으로는 못 찾음)
- CSP 헤더가 2중 적용되는 경로가 없는지 검증 (HTTP 표준: CSP 2개면 둘 다 적용)
- 프롬프트가 사용하는 CDN이 CSP에서 허용되는지 확인

### 서빙 파이프라인 변경 시
- 미리보기, 게시(직접), 게시(서브도메인) 3가지 경로 모두 추적
- assembleHtml() 변경 시 CSS/JS 누락 여부 확인
- "A에서는 되지만 B에서는 안 된다" 같은 경로별 차이가 없어야 함
- **서브도메인 rewrite 예외**: `src/middleware.ts`의 `SUBDOMAIN_PASSTHROUGH_PREFIXES`에 있는 경로만 `/site/{slug}` rewrite를 건너뛴다. 게시 사이트의 생성 JS가 상대경로 `/api/v1/proxy`로 호출하므로 이 예외가 없으면 API 데이터가 전부 404가 된다(미리보기는 apex라 정상 동작해 드러나지 않음 — 2026-07-28 실측 발견). 새 경로 추가 시 최소 노출 원칙 유지
- **프록시 인가는 `resolveProxyContext()` 단일 진입점**: site(익명·Host 바인딩)/app(세션·소유권 강제) 판정이 이 한 곳에 있다. 라우트에 인가 분기를 새로 만들지 말 것 — 판단이 흩어져 개인 키 해석부가 소유권을 확인하지 않던 것이 H-1이었다. 소유권은 `assertOwner` 재사용, Host로 프로젝트가 확정되면 클라이언트 `projectId`는 무시. 배경: [ADR](docs/decisions/2026-07-28-published-site-proxy-authz.md)

- **프록시 캐시 키에는 반드시 키 신원을 넣는다**: `buildCacheKey(apiId, proxyPath, params, keyIdentity)`의 4번째 인자는 **필수**다(선택으로 두면 잊었을 때 조용히 교차 테넌트 유출이 돌아온다). `keyIdentity`는 실제로 주입된 키의 `keyFingerprint()`(sha256 앞 16자)이고 주입이 없으면 `NO_KEY_IDENTITY`(`'none'`). 익명 site 모드가 **오너의 개인 키로 업스트림을 호출**하므로 키가 다르면 캐시 항목도 달라야 한다. 원문을 넣지 말 것 — 캐시 키는 로그·디버깅에서 보일 수 있다. 플랫폼 키도 지문을 쓰며(동작 동일 + 키 교체 시 자동 무효화), 응답 본문은 여전히 메모리에 평문이므로 민감 데이터 API에 `cacheTtlSeconds`를 부여할 때는 별도 검토 필요. 배경: [ADR](docs/decisions/2026-07-29-proxy-cache-key-identity.md)

### 코드 수정 후
- 수정한 함수/파일을 호출하는 모든 경로를 나열하고 각각 검증
- 단일 파일만 보고 끝내지 않고 cross-cutting concern(미들웨어, 공통 함수) 영향 확인

### railway.toml `startCommand` 금지 (비root 실행 유지)
- Railway는 **Dockerfile 배포에서 `startCommand`로 이미지의 `ENTRYPOINT`를 덮어쓴다**([공식 문서](https://docs.railway.com/deployments/start-command): *"the start command overrides the image's ENTRYPOINT in exec form"*)
- `startCommand`를 지정하면 `Dockerfile`의 `/docker-entrypoint.sh`(→ `chown /data` + `su-exec nextjs:nodejs`)가 실행되지 않아 **컨테이너가 root로 뜬다**. Dockerfile에 `USER` 지시자가 없는 이유는 마운트 볼륨 쓰기 크래시 때문(의도적)
- 기동 명령을 바꿔야 하면 `startCommand`가 아니라 `docker-entrypoint.sh`의 `exec su-exec ...` 줄을 고칠 것
- 2026-07-10 수정 이력: `startCommand = "node server.js"` 제거로 비root 실행 복원

### 클라이언트 IP 도출 규칙 (레이트리밋)
- `x-forwarded-for`는 **최우측** 항목만 신뢰한다. 최좌측은 클라이언트가 위조할 수 있어 per-IP 리밋이 무력화된다
- 단일 출처: `getClientIp()`(`src/lib/auth/rateLimit.ts`) — `adminAuth.verifyAdminKey()`와 동일 규칙. 새 리밋을 추가할 때 XFF를 직접 파싱하지 말 것
- **`x-real-ip`는 신뢰하지 않는다**(2026-07-29). 신뢰 경계가 붙였다는 보장이 없어 클라이언트가 위조·회전할 수 있고, 폴백을 두면 XFF 없는 경로에서 per-IP 한도가 무력화된다. 식별 불가 시 `'unknown'` 단일 버킷으로 fail-closed

### 인메모리 레이트리밋 구현 규칙
- **LRU eviction으로 활성 윈도를 버리지 말 것**. 용량 초과 시 살아 있는 카운터가 evict되면 다음 요청이 `count:1`로 시작해 한도가 우회된다(동시 사용자가 많을수록 심해짐 — 2026-07-29 수정)
- 올바른 패턴: 만료 버킷만 정리하고, 정리 후에도 자리가 없으면 **새 키를 거부(차단)**한다. 우회보다 과차단이 안전하다. 구현 참고: `src/lib/proxy/siteRateLimit.ts`, `checkProxyRateLimit`(`proxy/route.ts`), `src/lib/auth/rateLimit.ts`
- **읽기 전용 검사(`isLimited`)는 없는 키라도 cap이 가득이면 `true`를 반환할 것**(fail-closed). 아니면 키를 회전시켜 "첫 실패는 항상 공짜"를 무한히 얻는다
- `src/lib/auth/rateLimit.ts`는 signup·forgot·resend·login이 **Map 하나를 공유**한다. `MAX_AUTH_RATE_LIMIT_BUCKETS`(기본 10000) 소진 시 signup·forgot이 과차단될 수 있으며 이는 의도된 fail-closed다

### 로그인 스로틀 (`authorizeWithLoginRateLimit`)
- **계정 버킷은 조회된 사용자가 아니라 "제출된 이메일"로 키를 잡는다.** 미존재/존재가 같은 동작을 해야 계정 존재 여부가 새지 않는다
- **실패만 세고, 성공하면 이메일 키만 지운다**(IP 키는 유지 — 공유 NAT에서 한 명의 성공이 전체 예산을 리셋하면 약해진다)
- **한도 초과 시 `return null`.** 일반 `Error`를 던지면 Auth.js가 `CallbackRouteError`로 감싸 클라이언트에 `error=Configuration`으로 보인다(서버 버그처럼 보임). 향후 UX 코드를 붙이더라도 IP/계정·존재 여부에 따라 코드를 달리하면 오라클이 되므로 **항상 같은 코드**여야 한다
- 한도 검사는 **DB 조회·scrypt 이전에** 한다
- **`authorize`의 `request`는 `@auth/core`가 재구성한 것**이다(`new Request(url, { headers, method, body })`). 헤더가 빠지면 `getClientIp`가 조용히 `'unknown'`으로 붕괴해 per-IP 한도가 사실상 사라진다 — `local-auth-config.test.ts`의 XFF 회귀 테스트가 이 결합을 고정한다. 배경: [ADR](docs/decisions/2026-07-30-login-rate-limit.md)

### site 프록시 한도는 관측하면서 조정한다
- 프로젝트 전역 한도(`SITE_PROXY_PROJECT_LIMIT_PER_MIN`, 기본 120)가 **분산 IP로도 우회되지 않는 실질 상한**이다. 도달하면 `logger.warn('Site proxy project limit reached')`가 **버킷당 윈도 1회** 남는다(봇이 두드릴 때 로그가 폭발하므로 매 요청 로깅 금지)
- 사용량은 `GET /api/v1/admin/site-proxy-stats`(ADMIN_API_KEY)로 본다. `blockedByIp`(방문자 과속 — 정상일 수 있음)와 `blockedByProject`(**0이 아니면 오남용 또는 한도 부족**)를 반드시 구분해 해석할 것. 집계는 인메모리라 재시작 시 초기화된다
- 기본값 20/120은 실사용 데이터 없이 정한 값이다. **조정 판단 기준표가 [ADR](docs/decisions/2026-07-29-site-proxy-abuse-monitoring.md)에 고정**되어 있으니 임의로 바꾸지 말고 지표를 근거로 바꿀 것
- Slack 승격·Origin 바인딩은 **의도적으로 보류**했다(경보 임계를 정할 트래픽이 없고, Origin 헤더는 위조 가능해 단독 경계가 못 된다). 지표가 쌓인 뒤 판단한다

### AI 호출 타임아웃 규칙
- **타임아웃은 `Promise.race`만으로 끝내지 말고 `AbortSignal`을 함께 넘길 것**. race는 즉시 종료돼도 업스트림 호출은 SDK 타임아웃(최대 ~270초)까지 살아 있어, 다음 반복이 겹치면 **Opus/ET 토큰 비용이 이중 청구**된다. `AiPrompt.abortSignal` → `ClaudeProvider`의 `{ signal }`로 이미 배선되어 있다
- race에서 지는 쪽의 거부는 아무도 관측하지 않으므로 생성 Promise에 no-op `.catch()`를 미리 붙여 `unhandledRejection`을 막을 것 (`qualityLoop.ts` 참고)

### 백그라운드 스케줄러에 경보를 붙일 때 (백업·보존 등)
- **순서를 못박는다: `logger.error`(동기) → 상태 전이(동기) → 경보(`void Promise.resolve(alertFn(...)).catch(...)`).** 알림 실패가 스케줄러를 죽이면 **알림 없는 상태보다 엄격히 나쁘다**
- **`sendSlackAlert`에 비-reject 보장이 없다.** 내부 try/catch가 있지만 `try` 이전 경로·주입된 `alertFn`·향후 수정이 전부 위험이다. `scheduleBackups`의 `tick()`은 `void runFn(...).then(onOk, onErr)` 형태라 **핸들러가 던지거나 async 핸들러가 reject하면 `unhandledRejection`**이 된다 → `onReject` 안에서 `await alertFn`을 하지 말고 별도 voided promise로 분리할 것
- `errorRateMonitor`가 `await sendSlackAlert`를 해도 되는 이유는 `EventBus.emit`이 핸들러를 `.catch`로 감싸기 때문이다. **스케줄러에는 그 래퍼가 없다** — EventBus 소비자 코드를 그대로 복사하면 안 된다
- **매 주기 경보 금지 — 상태 전이만.** `null/true→fail` 1회(error), `fail→success` 1회(info 복구), 연속 실패는 억제. 최초 실행 실패도 경보한다(선행 성공을 기다리면 그게 조용한 죽음이다). 복구 경보를 빼면 억제가 정보를 삼킨다
- 상태는 **클로저 로컬**로 둘 것(모듈 레벨 플래그 금지) — 인스턴스 독립이라 테스트가 `vi.resetModules()`를 안 써도 된다. 배경: [ADR](docs/decisions/2026-07-30-monitoring-sink-slack-only.md)

### 의존성 감사 게이트 (`pnpm audit`)
- CI는 2단계로 실행한다: ① `pnpm audit --prod --audit-level=high`(**프로덕션 트리 하드 게이트**), ② `pnpm audit --audit-level=high`(전체 트리, 검토된 면제 적용)
- **감사는 트리 전체를 평가한다** — Dependabot이 패키지 하나만 올린 PR은 다른 취약점이 남아 있으면 무조건 실패한다. 보안 알림이 여러 건 쌓였으면 개별 PR을 하나씩 머지하려 하지 말고 **한 브랜치로 통합 상향**할 것 (2026-07-28: PR 4건이 전부 이 데드락으로 막혀 있었음)
- 면제는 `package.json`의 `pnpm.auditConfig.ignoreGhsas`에 등록하고 **근거는 반드시 [docs/security/audit-waivers.md](docs/security/audit-waivers.md)에 기록**한다(JSON에 주석 불가). 등록 기준: ① 상위 최신 버전에도 픽스 없음 ② 프로덕션 번들 미포함 ③ 공격자 통제 입력 아님 — 셋 다 충족 시에만
- **전이 의존성 오버라이드는 스코프를 좁힐 것**: `"brace-expansion@^5": "^5.0.8"`처럼 버전 범위를 명시한다. 전역 오버라이드는 메이저가 다른 소비자를 런타임에 깨뜨린다(v5 CJS는 named export라 `minimatch@3`의 `require(...)(pattern)` 호출이 깨짐 — 실증됨)
- `sharp`는 `next`의 optionalDependency(`^0.34.5`)라 상위 상향으로 패치 버전에 도달하지 못한다 → `pnpm.overrides`로 상향. 변경 시 **Alpine musl 프리빌트(`@img/sharp-linuxmusl-x64`) 존재 여부와 lockfile 등재를 반드시 확인**(Dockerfile이 `node:22-alpine`)

### 생성물의 Alpine.js 이중 init 금지
- Alpine은 마운트 시 `x-data` 객체의 **`init()`을 자동 호출**한다. 같은 요소에 `x-init="init()"`을 쓰면 **두 번 실행**되어 같은 API 요청이 동시에 두 번 나간다 — 업스트림 리밋이 빡빡한 API(예: OpenTDB 1req/5초)에서 두 번째가 429가 되고 사용자에게 오류 화면이 보인다(2026-07-29 프로덕션 실측)
- 2중 방어: ① `promptBuilder.ts`의 Alpine 절에 ❌/✅ 예시와 함께 명시 금지 ② `detectAlpineDoubleInit()`(`codeValidator.ts`)가 정적 검출해 `validateFunctionality` **경고**로 올린다. 보안 문제가 아니므로 `errors`가 아니라 `warnings` — 게시를 막지 않는다
- 검출 규칙은 **JS 본문을 보지 않는다**. `x-init`이 `init`이라는 이름의 메서드를 부르면 정의돼 있으면 이중 실행, 없으면 ReferenceError라 어느 쪽이든 버그이기 때문. 단어 경계를 쓰므로 `initialize()`·`initChart()`·`myInit()`은 잡지 않는다
- **프롬프트에 `x-init` 예시를 추가할 때 로더 이름을 `init`으로 짓지 말 것.** 원인은 프롬프트가 나쁜 예시를 준 게 아니라(당시 프롬프트엔 없었다) 모델이 로더를 자연스럽게 `init`으로 명명한 것이었다 — 좋은 예시만으로는 못 막고 명시 금지가 필요하다. 배경: [#204](https://github.com/xzawed/CustomWebService/issues/204)

### QC 프로세스 (생성/재생성 공통)
- **상세 절차**: [docs/guides/qc-process.md](docs/guides/qc-process.md) 참조 (8단계 표준 프로세스)
- **파이프라인 설계**: [docs/architecture/ai-pipeline.md](docs/architecture/ai-pipeline.md) 참조 (3단계 Stage + Quality Loop)
- QC 관련 로직 수정 시 `generationPipeline.ts` 중심으로 수정하면 generate/regenerate 양쪽에 동시 반영됨
- QC·저장은 최종 단계 결과에만 적용; 중간 산출물은 DB 저장 안 함

### Edge Runtime 호환성 (middleware.ts 수정 시 필수)
- `middleware.ts`는 Next.js Edge runtime에서 실행됨 — Node.js 전용 모듈(`net`, `fs`, `node:crypto`, `better-sqlite3` 등) 사용 불가
- 인증 게이팅은 **edge-safe 분할 설정** `@/lib/auth/local-auth-edge`(node:crypto 미의존)를 **동적 import**로만 로드한다 — `local-auth-config`(scrypt) 정적 import 금지
- 임포트 추가 시 체인 전체를 역추적: `middleware` → `A` → `B` → ... → Node-only 모듈 패턴 탐지
- 수정 후 `pnpm test:prod` 로 로컬 standalone 서버에서 헬스체크 통과 여부 확인

### 배포 태그 규칙
- Railway 배포 성공 확인 후: `git tag deploy/YYYY-MM-DD-HHmm && git push origin --tags`
- 배포 롤백이 필요할 때 태그 목록(`git tag -l 'deploy/*'`)으로 이전 커밋 빠르게 식별

### Railway 배포 상태 판별 (FAILED를 오해하지 말 것)
- **Wait for CI 활성.** 신규 커밋 배포는 그 커밋의 CI 실행이 끝날 때까지 `WAITING`에 머문다(실측 ~2.5분) → `INITIALIZING` → `BUILDING` → `SUCCESS`
- **env 단독 변경 재배포는 정상 동작한다.** CI 실행은 *커밋*에 붙어 있어, 같은 커밋 재배포는 **이미 green인 그 실행을 재사용**한다. 2026-07-29 실증(프로브 변수 set → 같은 커밋 patch 재배포 → `WAITING` → `SUCCESS`), 2026-06-30에도 동일. **"env 바꾸면 FAILED가 정상"은 오해다** — 그렇게 알고 넘기면 진짜 실패를 놓친다
- `railway variables --json`의 배포 메타에서 `patchId`가 있으면 **env/설정 변경으로 트리거된 재배포**, 없으면 커밋 배포다. `imageDigest`가 없으면 이미지 생성 전(=빌드 도달 전/중) 실패다

| 상황 | 해석 |
|------|------|
| 신규 커밋 · `WAITING` 지속 | 정상 — CI 완료 대기 중 |
| env 단독 변경 · 같은 커밋 · `SUCCESS` | 정상(실증) |
| env 단독 변경 · 같은 커밋 · `FAILED` | **실제 실패 — 조사 필요.** 로그를 즉시 수집 |
| 신규 커밋 · `BUILDING`/`DEPLOYING` 중 `FAILED` | 실제 배포 실패 |
| 서비스 health 죽음 | 실제 장애 — 즉시 롤백 검토 |

- **FAILED를 보면 로그를 즉시 수집할 것.** 후속 배포로 대체되면 사라진다(2026-07-28 건이 그래서 원인 미상으로 남았다)
  ```bash
  railway deployment list --json   # 실패 배포 id 확보
  railway logs -b <deployment-id>  # 빌드 로그
  railway logs -d <deployment-id>  # 배포 로그
  ```
- 실측 quirk: `railway variable set`은 재배포를 트리거하지만 **`railway variable delete`는 트리거하지 않는다**(삭제한 변수는 다음 배포에서야 컨테이너에서 사라진다)
- 배경·실증 기록: [#201](https://github.com/xzawed/CustomWebService/issues/201)

## 개발 워크플로우

- **브랜치 전략**: 모든 변경은 main에서 파생된 단기 브랜치에서 작업 후 PR → main 병합.
- **브랜치 네이밍**: `feat/`, `fix/`, `refactor/`, `chore/`, `docs/`, `test/`, `ci/` 접두사 사용
- **"커밋 푸쉬 PR"** = main 파생 브랜치 커밋 → push → PR 생성 → main 병합
- **새 작업 단위**: 이전 PR이 머지되었거나 종료된 상태라면 기존 PR을 재사용하지 않고 새 브랜치와 새 PR을 생성한다.
- 대규모 변경 시 Phase 단위로 나누어 각 Phase를 하나의 커밋으로 묶는 것을 선호
- **PR 병합 타이밍**: 여러 커밋이 예정된 작업은 모든 커밋이 완료된 후에 병합한다. 중간에 병합하면 cherry-pick 등 복구 작업이 필요해짐

## 커밋 메시지 규칙

한국어 커밋 메시지 사용. prefix 패턴: `feat:`, `fix:`, `refactor:`, `ci:`, `docs:`, `test:`, `chore:`
- 코드 변경과 관련 문서 변경은 동일 커밋에 포함 (코드-문서 동기화 보장)

## 타입 주의사항

- `IAiProvider.tokensUsed` — `{ input: number; output: number }` 구조 (`inputTokens`/`outputTokens` 아님)
- **Anthropic 모델 ID 주의**: 날짜 suffix 없이 사용 — `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-sonnet-5`, `claude-opus-4-6`, `claude-opus-4-7`, `claude-opus-4-8`, `claude-opus-5`. 날짜 포함 ID(예: `claude-haiku-4-5-20251001`)는 허용목록에 없어 기본값으로 폴백된다
- **Opus 5에서 `thinking` 생략은 "사고 안 함"이 아니다**: Opus 4.8은 생략 = 사고 없음이었지만 **Opus 5는 생략 시 adaptive가 기본으로 켜진다**(2026-07-29 실측 — 생략 시 응답 블록이 `[thinking,text]`, `disabled`면 `[text]`). 생략하면 `max_tokens`(48000)를 thinking과 생성물이 나눠 써 **코드가 잘리고** 비용·지연이 는다. `ClaudeProvider`는 ET 비활성 경로에서 **`thinking: { type: 'disabled' }`를 명시**한다 — 지우지 말 것
- **`thinking: disabled`에 `effort`를 함께 보내지 말 것**: Opus 5는 `disabled` + `effort: xhigh|max`를 **400으로 거부**한다(실측). 기본 effort(high)에서만 허용되므로 끌 때는 `output_config`를 아예 보내지 않는다. 테스트가 두 규약을 모두 고정한다
- **모델 상향 시 구세대 ID를 허용목록에서 지우지 말 것**: 목록에 없는 env 값은 조용히 기본값으로 폴백하므로, 지우면 **env를 되돌리는 롤백이 무시된다**. 배경: [ADR](docs/decisions/2026-07-29-llm-model-upgrade-opus5.md)
- **모델 허용목록은 조용히 폴백한다**: `AI_MODEL_*` env가 `ALLOWED_CLAUDE_MODELS`(`AiProviderFactory.ts`)에 없으면 `logger.warn` 한 줄만 남기고 `TASK_DEFAULTS`로 폴백한다. 즉 **Railway env에 새 모델을 넣는 것만으로는 적용되지 않으며** 허용목록도 함께 고쳐야 한다. (2026-07-10: env가 `claude-opus-4-8`인데 허용목록에 없어 `opus-4-7`로 폴백 중이던 것을 발견·수정) **모델 변경 후에는 `GET /api/v1/admin/debug`의 `models.<task>.fellBack`이 `false`인지 확인할 것** — env 값만으로는 적용 여부를 알 수 없다.
- `AiProviderFactory.ts` 모델 ID 수정 시 `.test.ts`도 반드시 동시에 업데이트 (CI 파손 방지)
- **JSON 필드명 이중성**: `parseEndpoints()`(`@/repositories/utils/endpointParser`, `SqliteCatalogRepository`가 사용) 같은 JSON 매퍼는 snake_case(`example_call`)와 camelCase(`exampleCall`) 둘 다 처리 필요 — 시드 JSON 직접 삽입 vs 코드 경로 차이
- **Playwright 병렬 체크 주의**: 단일 `page` 인스턴스에서 `Promise.allSettled` 사용 시 viewport를 변경하는 체크는 반드시 다른 체크 완료 후 순차 실행 (`renderingQc.ts` 참고)
- **playwright-core executablePath 주의**: `playwright-core`는 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 환경변수를 자동으로 읽지 않음. `const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH; chromium.launch({ ...(executablePath && { executablePath }) })` 형태로 명시적 전달 필요 (미설정 시 executablePath를 전달하지 않아 playwright-core 기본 탐색 로직이 유지됨). `playwright`(풀 패키지)와 달리 `playwright-core`는 브라우저 다운로드·자동 경로 탐색을 수행하지 않음 (`browserPool.ts` 참고)
- **slug 충돌 처리**: `assignUniqueSlug()` in `projectService.ts` — base → base-2 → … → base-10 → timestamp fallback; UNIQUE 위반 시 1회 재시도. SQLite UNIQUE 위반은 `isUniqueViolation()`(`@/lib/db/errors`)가 `SQLITE_CONSTRAINT_UNIQUE`/`SQLITE_CONSTRAINT_PRIMARYKEY`/"UNIQUE constraint failed" 메시지로 감지(레거시 23505도 폴백 인식)
- **프로젝트 삭제는 앱 레벨 캐스케이드다 (FK는 `ON DELETE no action`)**: `projects`를 참조하는 3개 테이블(`project_apis`·`generated_codes`·`platform_events`)이 전부 `no action`이고 연결은 `foreign_keys = ON`이라, 자식을 정리하지 않고 `DELETE`하면 **FK 위반으로 500**이 난다(2026-07-29까지 모든 프로젝트 삭제가 이 상태였다). `SqliteProjectRepository.delete()`가 단일 트랜잭션으로 처리한다 — **`platform_events`는 지우지 않고 `project_id`만 NULL로 분리**(감사 로그는 프로젝트보다 오래 살아야 한다), `generated_codes`·`project_apis`·`generation_locks`는 삭제, `projects`는 마지막. **`projects`를 참조하는 테이블을 새로 추가하면 이 트랜잭션에도 넣을 것**
- **`getAuthUser`는 DB 행 존재를 확인한다 — 이 조회를 제거하지 말 것**: JWT가 무상태라 사용자 행이 사라져도 토큰은 만료까지 살아 있다. 조회가 없으면 삭제된 계정의 토큰이 **유령 세션**이 된다(`GET /projects` → 200 + `[]`, 쓰기 → FK 500, `assertEmailVerified`가 401이어야 할 것을 403으로 오인). **라우트 테스트가 `getAuthUser`를 통째로 모킹하므로 단위 테스트로는 절대 안 잡힌다.** DB 오류는 fail-closed(null) — 인증 경계에서는 레이트리밋의 fail-open과 반대다. middleware(Edge)에는 두지 않는다(`local-auth-edge`만 동적 import). 배경: [ADR](docs/decisions/2026-07-30-account-delete-and-export.md)
- **계정 삭제는 `cascadeDeleteUser`(`src/lib/auth/deleteAccountCascade.ts`) 단일 동기 트랜잭션이다**: `SqliteProjectRepository.delete()`를 루프 호출하면 각 호출이 별도 트랜잭션이라 중간 실패 시 반쯤 지워진 계정이 남는다. `SqliteUserRepository.delete()`는 단독으로 쓰지 말 것. **`users`를 참조하는 테이블을 새로 추가하면 이 캐스케이드에도 넣을 것**
- **`USER_DELETED` payload는 `deletedUserId`를 쓴다** — `PROJECT_DELETED`와 정확히 같은 함정(바로 아래)
- **계정 삭제 시 `platform_events`는 보존하되 payload를 익명화한다**: PII 키 denylist + 주체 값(이메일·이름) 동등 스크럽 + `userId → [deleted]`. **`slug`도 denylist에 있다** — 사용자가 지은 서브도메인이라 실명이 들어갈 수 있고 값 동등 비교로는 부분 포함을 못 잡는다. `projectId`·점수·duration은 유지(감사 신호). 순수 denylist는 새 이벤트 타입이 이메일을 담으면 조용히 새고, 순수 allowlist는 감사 가치를 파괴하므로 **셋을 겹친다**
- **`PROJECT_DELETED` payload만 `deletedProjectId`를 쓴다**: `SqliteEventRepository.persist()`가 `payload.projectId`를 `platform_events.project_id` 컬럼에 자동 대입하는데, 삭제 직후 발행되는 이 이벤트는 그러면 FK 위반으로 **조용히 유실**된다(persist가 best-effort라 경고만 남는다). 키 이름을 달리해 자동 추출을 피하고 id는 payload에 보존한다. **다른 이벤트의 `projectId`와 통일하려고 되돌리지 말 것**
- **generationTracker는 진행률 전용 — 중복 생성 게이트로 쓰지 말 것**: `src/lib/ai/generationTracker.ts`의 `generationTracker`는 모듈 레벨 싱글톤이고 TTL 차등(`generating` 30분, `completed`/`failed` 10분)이라 **엔트리가 사라지면 락도 사라진다**. 여기에 게이트를 두면 같은 projectId로 두 번째 파이프라인이 시작돼 Opus/ET 토큰이 이중 청구되고 같은 version으로 UNIQUE 위반이 난다. `isGenerating()`은 그래서 제거됐고 `generationTracker.test.ts`가 부재를 단언한다. 중복 차단은 **`@/lib/ai/generationLock`(DB `generation_locks`)** 담당: 라우트가 `acquireGenerationLock`으로 획득(실패 시 409), `runGenerationPipeline`이 heartbeat를 돌리고 `finally`에서 **중지 → 해제 순서로** 정리한다. 크래시 시 `GENERATION_LOCK_STALE_MS`(기본 5분) 후 자동 탈취. 배경: [ADR](docs/decisions/2026-07-29-durable-generation-lock.md)
- **생성 상태 폴링 추출**: `builder/page.tsx`의 SSE 폴백 폴링은 `src/lib/generation/pollGenerationStatus.ts`로 추출됨(주입형 `fetchFn`·`delay`·콜백, 단위 테스트 대상). `page.tsx`는 thin 래퍼. 상태 처리: `generating`→진행률 갱신, `completed`+result→완료, **`failed`→즉시 terminal 실패**(이전엔 maxAttempts까지 재시도하던 quirk를 교차검증 후 개선), `not_found`→프로젝트 미존재 메시지, 그 외(`unknown`)→연결 복구 실패 메시지. 테스트는 DI-delay(즉시 resolve)로 결정적 검증, 기본 `setTimeout` 경로만 `vi.useFakeTimers()`+`runAllTimersAsync()`로 커버
- **모듈 레벨 상태가 있는 파일 테스트**: `let registered = false` 같은 모듈 레벨 플래그가 있는 파일은 테스트 간 상태 누출이 발생한다. `vi.resetModules()` + 매 테스트마다 `await import(...)` 동적 임포트로 격리한다 (`eventPersister.ts` 참고)
- **api 라우트 테스트 — providers/supabase 모킹 더 이상 불필요**: SQLite 컷오버(P8.2) 후 `@/lib/db/failover`·`@/lib/db/connection`(→pg/drizzle-pg native cold-init)이 제거됐고, 상수만 반환하던 `@/lib/config/providers`도 2026-07-10 죽은 코드 정리로 **삭제됨**. 과거 cold-init 차단용 `vi.mock('@/lib/config/providers', ...)`·`vi.mock('@/lib/supabase/server', ...)`는 전부 제거됨(잔존 시 존재하지 않는 모듈 모킹). `vitest.config.ts`의 `testTimeout`/`hookTimeout` 15000ms 상향은 경합 마진으로 유지 — 배경: [docs/decisions/2026-06-09-test-flaky-timeout-contention-fix.md](docs/decisions/2026-06-09-test-flaky-timeout-contention-fix.md)
- **happy-dom iframe 로드 노이즈 차단**: `vitest.config.ts`의 `environmentOptions.happyDOM.settings.navigation.disableChildFrameNavigation = true`로 iframe `src` 실제 로드를 막아 `DOMException NetworkError` 로그 flood를 차단함. v20에서 `disableIframePageLoading`은 deprecated이므로 사용 금지. `disableFallbackToSetURL`(기본 false) 보존으로 `iframe.src` 속성은 그대로 반영되어 단언에는 무영향
- **MSW `onUnhandledRequest:'error'`**: `src/test/setup.ts`가 미처리 요청을 즉시 실패시킴(향후 자동 fetch 컴포넌트 테스트의 무성 hang 예방). 새 컴포넌트가 fetch하는 엔드포인트는 `src/test/mocks/handlers.ts`에 핸들러를 반드시 추가할 것 (현재 Anthropic·`*/api/v1/preview/:id`·`*/api/v1/generate/status/:projectId` 커버). **caveat**: MSW `'error'`는 비동기 전파상 테스트를 항상 빨갛게 만들지는 않으므로(MSW #946/#943) 전체 통과가 "미처리 요청 부재"의 충분 증거는 아님
- **SonarCloud vs Codecov 지표 불일치**: Codecov/Vitest는 `vitest.config.ts`의 `coverage.include` 범위(`src/lib/**`, `src/services/**`, `src/providers/**`, `src/repositories/**`, `src/components/**`, `src/types/**`, `src/hooks/**` + **선별된 app 라우트 화이트리스트**)만 측정. SonarCloud는 `sonar.sources=src` 전체를 측정한다. 두 숫자는 구조적으로 차이가 나며 단순 설정 오류로 단정하지 않는다.
- **`coverage.include`에 없는 파일을 수정하면 CI가 빨개진다 (2026-07-10 실증)**: lcov에 데이터가 없는 파일의 변경 라인은 SonarCloud `new_coverage`와 `codecov/patch`에서 **0%로 계산**된다(파일이 무시되는 게 아니다). 라우트를 수정하면서 테스트를 붙였다면 `vitest.config.ts`의 `coverage.include`에도 **반드시 추가**할 것. 단위 테스트 대상이 아닌 파일(`src/instrumentation.ts` 등)은 `sonar-project.properties`의 `sonar.coverage.exclusions`와 `codecov.yml`의 `ignore`에 **양쪽 다** 등록해야 한다(한쪽만 하면 다른 쪽이 실패).
- **temperature deprecated (Claude 4.x)**: Claude 4.x 모델(`claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-opus-4-7`)은 `temperature` 파라미터를 지원하지 않음. ClaudeProvider에서 완전히 제거됨 (Extended Thinking 포함). `IAiPrompt.temperature` 필드는 legacy 호환용으로 유지하나 실제 API 호출에 사용하지 않음
- **인메모리 rate limit 한계**: proxy의 Map 기반 리밋은 서버 재시작 시 초기화됨 (분당 카운터라 보안 영향 낮음). Railway 단일 인스턴스 전제 — 멀티 인스턴스 전환 시 Redis 등 외부 저장소 필요 (generationTracker와 동일 제약)
- **이 서비스의 WAL은 캐시가 아니라 데이터 본체다 (복구 시 치명)**: 장기 실행 프로세스가 거의 체크포인트하지 않아 **`/data/app.db`는 4096B·테이블 0개**이고 실데이터는 전부 `app.db-wal`(1.3MB)에 있다(2026-07-30 프로덕션 실측). ① **WAL만 지우면 DB 전체가 사라진다.** ② **백업본으로 app.db만 덮어쓰고 WAL을 남기면 그 WAL이 복구본 위로 재생되어 복구가 조용히 무효화되고 `integrity_check`는 여전히 `ok`를 반환한다**(실측). app.db 교체와 WAL/SHM 제거는 **반드시 한 세트**로 한다. 복구 성공 판정은 `integrity_check`가 아니라 **행 수 대조**다. 절차: [복구 런북](docs/guides/sqlite-restore-runbook.md)
- **SQLite 자동 백업 (P6.3, 인프로세스)**: `src/lib/db/sqlite/backup.ts`의 `scheduleBackups`가 `instrumentation.register()`에서 배선되어 주기적으로 `raw.backup()` 온라인 덤프를 `<SQLITE 디렉터리>/backups/app-YYYYMMDD-HHmmss.db`로 남기고 보관 정책(`SQLITE_BACKUP_RETENTION`, 기본 7)에 따라 오래된 파일을 정리한다. 타이머는 `.unref()`되어 종료를 막지 않고, `':memory:'`/비활성(`SQLITE_BACKUP_ENABLED=false`) 시 건너뛴다. **단일 인스턴스·동일 볼륨 전제** — 논리 손상·잘못된 마이그레이션·실수 삭제 방어용이며, 볼륨 자체 손실 대비(오프-볼륨 DR)는 Railway 볼륨 스냅샷 또는 Litestream→S3(옵션·비용) 담당. `selectBackupsToPrune`은 `app-<timestamp>.db` 패턴만 후보로 삼아 라이브 DB·WAL/SHM은 절대 삭제하지 않음
- **DB 보존 정책 (무한 증가 테이블)**: `src/lib/db/sqlite/retention.ts`의 `scheduleRetention`이 `instrumentation.register()`에서 백업 스케줄러와 나란히 배선된다(주기 기본 24h, `.unref()`, `':memory:'`·`DB_RETENTION_ENABLED=false` 시 스킵). `generated_codes`만 `pruneOldVersions()`로 정리되고 `platform_events`(모든 도메인 이벤트)·`auth_tokens`·`user_daily_limits`는 삭제 경로가 없어 단조 증가하던 것을 해소. **되돌릴 수 없는 삭제이므로 안전장치 필수**: ① `auth_tokens`는 만료(`expires_at`)됐거나 사용된(`consumed_at`) 토큰만 삭제 — **유효한 미사용 토큰은 절대 삭제 금지**(인증·재설정 링크가 조용히 죽음), ② `user_daily_limits.usage_date`는 로컬 `YYYY-MM-DD`라 cutoff도 `localDateCutoff`(로컬 기준)를 써야 함(UTC로 자르면 타임존에 따라 오늘 카운터 삭제), ③ 세 DELETE는 단일 트랜잭션, ④ `0`·음수·비정수 env는 기본값 폴백(전체 삭제 사고 방지)
- **배포/생성 레이트리밋 환불 (SQLite)**: 배포·생성 실패 시 `SqliteRateLimitRepository`가 일일 카운터를 in-process로 환불한다(`GREATEST(count-1, 0)`, 동기 트랜잭션). 과거 Supabase PG 함수(`decrement_daily_deploy`/`decrement_daily_generation`, migration 007/021)와 동일 보상 의미를 SQLite 레포 메서드로 재현 — `.rpc()` 호출 없음
- **생성 상태 폴링 `not_found` 처리**: `/api/v1/generate/status`는 프로젝트 미존재·권한 없음 시 `status: 'not_found'`를 반환한다. `pollGenerationStatus`의 `GenerationStatusData.status` union에 `'not_found'`가 포함되어야 하며(누락 시 'unknown'으로 오처리되어 잘못된 사용자 메시지 표시), 전용 핸들러로 "프로젝트를 찾을 수 없습니다" 메시지를 낸다
- **카운터 컬럼 ADD COLUMN은 `DEFAULT 0` 필수**: `user_daily_limits`처럼 `WHERE count < limit` test-and-set을 쓰는 테이블에 새 카운터를 ALTER로 추가할 때 `DEFAULT`가 없으면 **기존 행이 NULL**이 되고 `NULL < limit`는 참이 아니라 UPDATE가 0행 → `allowed=false`. 사용자에게는 "한도 초과"로 보여 버그로 인지되지 않고, `MAX(0, NULL-1)`도 NULL이라 자가 복구도 안 된다. 기존 `deploy_count`는 CREATE TABLE부터 있던 컬럼이라 이 경로를 겪은 적이 없으니 **"deploy를 그대로 따라 했다"가 안전 근거가 되지 않는다**. 회귀 테스트는 `SqliteRateLimitRepository.test.ts`의 migrated-row 케이스 참조. 배경: [ADR](docs/decisions/2026-07-30-suggestion-daily-quota-separation.md)
- **AI 추천은 생성과 별도 쿼터**: `suggest-*` 4개 라우트는 `suggestion_count`/`MAX_DAILY_SUGGESTIONS`(기본 30, pro 150)를 **공유**한다(라우트별 30이 아님). 차감은 **검증·소유권 확인 이후**, 환불은 `charged===true`이고 throw된 경우만(soft success는 이미 토큰을 썼으므로 환불 안 함). 추천 라우트는 전부 `createForTask('suggestion')`(Haiku)를 쓸 것 — `AiProviderFactory.create()`는 ClaudeProvider 기본 모델(Sonnet 5)로 조용히 3배 단가를 태운다
- **레이트리밋 우회 로깅**: `RATE_LIMIT_BYPASS_USER_IDS` 우회 적용 시 `logger.info('Rate limit bypass applied', ...)` 감사 로그를 남긴다(무로깅 우회는 운영 사각지대)
- **카탈로그 헬스 모니터링 (cron 제거됨)**: Supabase 의존 CI cron(`scheduled.yml`)과 `verifyCatalog.ts`는 SQLite 컷오버로 제거됨. 분류 로직 `src/lib/catalog/healthCheck.ts`는 단위 테스트 대상으로 잔존. 헬스 모니터링은 배포 서비스의 HTTP 엔드포인트(`qc-monitor.yml`, `/api/v1/admin/qc-stats`·`/api/v1/health`)와 관리자 `keys-verify`로 대체. **P5.2 완료(2026-06-25)**: verification_status 라이브 갱신은 관리자 트리거 엔드포인트 **`POST /api/v1/admin/verify-catalog`**(ADMIN_API_KEY 보호, 로직 `src/lib/catalog/verifyRunner.ts`)로 구현 — 활성 API GET 엔드포인트를 실제 호출해 분류 후 `working/degraded→verified`·`broken→broken`만, 현재 값과 다를 때만 DB 갱신(key_gated/unknown은 보존). 자동 스케줄러 대신 관리자 트리거를 택해 일시 장애로 인한 broken 플래핑·무인 outbound를 회피(설계 결정). 배경: [docs/decisions/2026-06-21-api-catalog-health-monitoring.md](docs/decisions/2026-06-21-api-catalog-health-monitoring.md)
- **verification_status 소비 (B-2)**: 시드된 `verification_status`(`src/data/apiCatalog.json`, 프로덕션 미러)가 baseline. **소비**: AI 추천(`POST /api/v1/suggest-apis`)이 `verificationStatus==='broken'` API를 후보에서 제외하고 `verified`에는 `[검증됨]` 배지로 우선 선택을 유도한다(broken ID는 candidate 기반 validId로 이중 차단). **카탈로그 브라우징(`search()`)은 broken을 숨기지 않는다** — '가용 유지' 정책(예: picsum 일시 장애). `SqliteCatalogRepository`는 `verification_status`를 매핑한다(컷오버로 사라진 Drizzle-pg 누락 버그는 무관)
- **REST Countries 폐기(2026-06-21) → 자체 호스팅 대체(2026-06-22, B-3)**: v3.1 전 엔드포인트가 deprecated(HTTP 200 + deprecation 본문, legacy.json 301)라 `is_active=false`. 대체로 **mledoze/countries(ODbL) 큐레이티드 서브셋**을 `src/data/countries.json`에 번들하고 `GET /api/v1/countries`(목록, `?region=`/`?search=`)·`/api/v1/countries/[code]`(cca2/cca3 단건)로 자체 서빙(키리스·CORS·`max-age=86400`). 생성 사이트가 프록시 없이 직접 fetch(사이트 CSP `connect-src https:`가 허용). 데이터 갱신은 `pnpm tsx scripts/generateCountries.ts`로 재생성(준-정적). 라우트는 thin, 로직은 `src/lib/countries/`(transform·query, 100% 커버). **카탈로그 등록 완료(2026-06-22)**: 프로덕션 `api_catalog`에 `Countries (Self-hosted)` row(verified·active) 추가 + REST Countries `successor_id` 연결. 코드 조회는 `{code}` 플레이스홀더 대신 **`/api/v1/countries/KR` 구체 예시로 등록**(헬스체크가 `{code}`→`'test'`로 채워 `/countries/test` 404 오탐을 내는 것 회피). 설계: [docs/superpowers/specs/2026-06-22-country-data-api-design.md](docs/superpowers/specs/2026-06-22-country-data-api-design.md), 등록 ADR: [docs/decisions/2026-06-22-catalog-registration-and-seed-resync.md](docs/decisions/2026-06-22-catalog-registration-and-seed-resync.md)
- **번들 시드 데이터 (`src/data/apiCatalog.json`·`featureFlags.json`)**: 프로덕션 `api_catalog`(61행/36활성, 2026-06-24 무료 API 12종 추가·Dog/Picsum 복원)·`feature_flags`(7)를 미러링한 **번들 산출물**. 부팅 시 `seedCatalog`/`seedFeatureFlags`(`bootstrapSqlite`)가 빈 테이블일 때만 멱등 삽입(id·created_at 보존 → `project_apis` FK 일관성). `supabase/seed.sql`(PG 덤프)은 SQLite 컷오버로 제거됨. 데이터 갱신은 JSON을 직접 편집하거나 신규 추출 스크립트로 재생성
- **카탈로그 신규/정정 멱등 반영 (`ensureCatalog.ts`)**: `seedCatalog`는 빈 테이블일 때만 동작하므로, 이미 시드된 프로덕션 DB에 JSON 신규 항목을 반영하려면 `ensureCatalogEntries`(`bootstrapSqlite`가 `seedCatalog` 다음 호출)가 필요. ① JSON에 있으나 DB에 없는(id 기준) 항목만 삽입(기존 행 보존), ② 라이브 동작하나 broken/비활성으로 잘못 기록된 키리스 API(Dog API·Lorem Picsum)를 `is_active=true`·`verification_status=verified`로 정정(이미 올바르면 미갱신). 멱등.
- **플랫폼 키 검증 = 배포 런타임 전용**: 키 의존 API의 env 키(`API_KEY_*`) 유효성은 배포 컨텍스트에서만 검증 가능 — 관리자 진단 엔드포인트 **`GET /api/v1/admin/keys-verify`**(ADMIN_API_KEY 보호, 로직 `src/lib/catalog/keyCheck.ts`)를 배포 환경에서 호출한다(CLI `pnpm keys:verify`는 컷오버로 제거). **키-게이팅 현황(2026-06-25 기준)**: 카탈로그 61행 중 **활성 36 / 비활성 25**(비활성 = 키 의존 `api_key` 24개 + REST Countries broken 1). 키 의존 API의 env 변수들은 이름만 있고 값이 빈 상태라 24개가 `is_active=false`. **활성 36개는 전부 키 불필요**(활성 중 `api_key`는 NASA 1건뿐이며 `default_key=DEMO_KEY`). 재활성화하려면 Railway env에 실제 키 값 입력 후 `is_active=true` 복원 + `keys-verify` 재검증. 카탈로그 `auth_config.env_var` 이름이 실제 Railway 변수명과 일치해야 함(불일치 시 401). (2026-06-21 시점엔 7개 비활성/활성 23이었으나 2026-06-24 무료·키리스 API 12종 추가로 활성 36이 됨.)
- **프록시 키 prefix 적용(2026-06-25 수정 완료)**: `auth_config`의 `prefix`/`header_prefix`(카카오 `KakaoAK `, Unsplash `Client-ID `)를 프록시 `resolveApiKey`가 키 주입 시 적용한다(`prefix ?? header_prefix`, header·query 양쪽 분기). **env/사용자 API 키는 raw 값으로 저장**하면 되며, 값에 이미 prefix가 포함된 경우 `startsWith` 가드로 이중 적용을 방지한다. 검증은 `keys-verify`의 `needsPrefixFix`. (이전엔 raw 값만 주입해 env에 prefix를 수동 포함해야 동작하던 잠재 버그였음 — 관련 API가 전부 비활성이라 프로덕션 영향은 없었음.)
- **`pnpm.onlyBuiltDependencies`는 빈 배열을 유지한다 (키 삭제 금지)**: better-sqlite3 v13은 N-API 프리빌트를 패키지에 동봉하므로 빌드 스크립트가 필요 없다. 그런데 `binding.gyp`가 함께 배포되어 **npm/pnpm이 암묵적으로 `node-gyp rebuild`를 실행**한다 — 허용하면 Windows에서 `pnpm install`이 Visual Studio 탐색 실패로 깨지고 Linux에선 불필요한 소스 컴파일이 돈다. **키를 지우면 안 되는 이유**: pnpm 9는 키 부재 시 모든 스크립트를 실행하고(pnpm 10은 기본 차단), CI·Dockerfile이 `pnpm@9`를 쓴다. 빈 배열이 두 버전 모두에서 "아무것도 빌드 안 함"을 보장하는 유일한 표기다. Dockerfile에서 `g++/make/python3`를 제거한 것도 이 전제에 의존한다. 배경: [docs/decisions/2026-07-28-better-sqlite3-v13-napi-prebuilds.md](docs/decisions/2026-07-28-better-sqlite3-v13-napi-prebuilds.md)
- **Node 22 고정 (engines/Dockerfile/워크플로)**: `package.json engines.node: ">=22"`, `node:22-alpine`, CI `node-version: 22`로 고정. 원래 사유였던 `@supabase/supabase-js` eager WebSocket 가드는 supabase-js 제거(P8.2)로 소멸했으나, **Node 22 핀은 유지**한다(다운그레이드 불필요). better-sqlite3는 프리빌트로 설치되며 musl alpine에서 프리빌트 부재 시 `g++/make/python3`로 소스 컴파일(Dockerfile deps 스테이지). 역사: [docs/decisions/2026-06-22-node22-supabase-websocket-fix.md](docs/decisions/2026-06-22-node22-supabase-websocket-fix.md)

## 검수 후속 작업 (2026-07-28 전체 검수) — **전건 종료(2026-07-29)**

전체 검수 13건 중 11건은 PR #195·#196으로 해소했고, 남겨 두었던 5건도 2026-07-29에 모두 종료했다.
아래는 이력이며, 새 후속 작업은 `gh issue list --label audit-followup` 으로 확인한다.

| Issue | 내용 | 성격 |
|-------|------|------|
| ~~[#197](https://github.com/xzawed/CustomWebService/issues/197)~~ | C-1·C-2 실환경 검증 | **완료(2026-07-29)** — [ADR 검증 절](docs/decisions/2026-07-28-published-site-proxy-authz.md) |
| ~~[#198](https://github.com/xzawed/CustomWebService/issues/198)~~ | M-5 generationTracker durable lock | **완료(2026-07-29)** — [ADR](docs/decisions/2026-07-29-durable-generation-lock.md) |
| ~~[#199](https://github.com/xzawed/CustomWebService/issues/199)~~ | M-4 잔여 — 캐시 키에 키 신원 추가 | **완료(2026-07-29)** — [ADR](docs/decisions/2026-07-29-proxy-cache-key-identity.md) |
| ~~[#200](https://github.com/xzawed/CustomWebService/issues/200)~~ | site 프록시 오남용 모니터링 | **완료(2026-07-29)** — [ADR](docs/decisions/2026-07-29-site-proxy-abuse-monitoring.md) · 기본값 재조정은 데이터 확보 후 |
| ~~[#201](https://github.com/xzawed/CustomWebService/issues/201)~~ | Railway env 단독 변경 시 재배포 FAILED | **가설 반증(2026-07-29)** — env 재배포는 정상. 판별 기준은 위 "Railway 배포 상태 판별" |

검수 중 파생된 신규 이슈: [#204](https://github.com/xzawed/CustomWebService/issues/204) — 생성 사이트가 동일 API 요청을 동시 2회 발사(#197 실환경 검증 중 발견).

배경: [게시 사이트 프록시 ADR](docs/decisions/2026-07-28-published-site-proxy-authz.md) ·
[MEDIUM 항목 ADR](docs/decisions/2026-07-29-medium-audit-findings.md)

## 다음 작업 대기열 (2026-07-30 기준)

각 항목의 **착수 계획서는 main에 병합되어 있다**(PR #225~#228, 2026-07-30). 계획 브랜치는 병합과 함께 삭제됐으므로
**착수 시 새 브랜치를 만든다** — 계획서를 읽고 그 위에서 구현하면 된다.

계획서의 ⚠️ 표시는 **착수 전 사용자 판단이 필요한 지점**이다 — 그 결정 없이 구현하면 방향이 갈린다.
아래 표의 마지막 열이 그 요약이며, 착수할 때 **먼저 물어볼 것**.

| Issue | 착수 계획서 | 착수 전 결정 필요 |
|-------|------------|------------------|
| [#220](https://github.com/xzawed/CustomWebService/issues/220) 활성 에러·알림 sink 부재 | [ADR](docs/decisions/2026-07-30-monitoring-sink-slack-only.md) · [계획서](docs/superpowers/plans/2026-07-30-monitoring-sink-wiring.md) | **결정 완료(2026-07-30)** — Slack 고정·Sentry 미도입, 2026-04-27 결정 뒤집음. 코드 배선 완료. **남은 것은 `SLACK_WEBHOOK_URL` 값 등록 + 합성 경보 도착 확인** |
| [#221](https://github.com/xzawed/CustomWebService/issues/221) 계정 삭제·데이터 내보내기 부재 | [account-delete-and-export](docs/superpowers/plans/2026-07-30-account-delete-and-export.md) | `platform_events` payload 개인정보 처리 · 게시 사이트 연쇄 · 재가입 허용 |
| [#222](https://github.com/xzawed/CustomWebService/issues/222) SQLite 복구 런북 부재 | [sqlite-restore-runbook](docs/superpowers/plans/2026-07-30-sqlite-restore-runbook.md) | 프로덕션 리허설 여부(다운타임 발생) |
| [#223](https://github.com/xzawed/CustomWebService/issues/223) 로그인 레이트리밋 부재 | [login-rate-limit](docs/superpowers/plans/2026-07-30-login-rate-limit.md) | IP 단위 / 계정 단위 / 둘 다 (계정 단위는 잠금 DoS 위험) |
| [#216](https://github.com/xzawed/CustomWebService/issues/216) 데이터 확보 후 재검토 3건 | — | 트리거 조건 충족 전까지 착수 안 함 (계획서를 미리 만들면 코드가 움직이는 동안 썩는다) |

## 세션 시작 체크리스트 (필수)

작업 세션을 시작할 때 아래 두 가지를 반드시 먼저 확인한다.

1. **Railway 배포 상태** — `railway deployment list --json` (최신 배포 status·커밋 확인)
2. **SonarCloud 품질 상태** — 아래 우선순위로 확인:
   - **(기본)** SonarQube MCP 도구로 `xzawed_CustomWebService` 프로젝트 이슈·품질 게이트 조회
   - **(차선 — MCP 미로드 시)** SonarCloud REST API로 대체 (`SONARCLOUD_TOKEN` 환경변수 또는 `~/.sonar-token` 파일에서 읽기):
     ```bash
     # 토큰 설정: echo "토큰값" > ~/.sonar-token && chmod 600 ~/.sonar-token
     # 또는: export SONARCLOUD_TOKEN=토큰값
     SONAR_TOKEN="${SONARCLOUD_TOKEN:-$(cat ~/.sonar-token 2>/dev/null)}"
     # 품질 게이트
     curl -s -u "$SONAR_TOKEN:" \
       "https://sonarcloud.io/api/qualitygates/project_status?projectKey=xzawed_CustomWebService"
     # 신규 이슈
     curl -s -u "$SONAR_TOKEN:" \
       "https://sonarcloud.io/api/issues/search?projectKeys=xzawed_CustomWebService&resolved=false&ps=5"
     ```

이상 징후(배포 실패, 품질 게이트 FAILED, 신규 버그/취약점)가 있을 때만 사용자에게 보고한다. 정상이면 별도 보고 없이 작업을 진행한다.

## Claude 도움 요청 원칙

업무 수행 중 다음 상황이 발생하면 Claude는 **즉시 사용자에게 도움을 요청**합니다:

- **막힌 경우**: 로그 미접근, 외부 시스템 확인 필요, 재현 불가한 환경 차이
- **판단이 필요한 경우**: 트레이드오프가 있어 방향 결정이 필요할 때
- **확인이 필요한 경우**: Railway·GitHub 등 외부 시스템 실제 상태를 알아야 할 때
- **리스크가 불확실한 경우**: 영향 범위 파악이 어렵고 되돌리기 어려운 변경

기다리거나 혼자 해결을 시도하기보다 **빠르게 물어보는 것**이 원칙입니다.

## Claude 자율 관리 권한

Claude는 이 프로젝트에서 컨텍스트 업무를 정확하고 효율적으로 수행하기 위해 다음 항목을 **사용자 승인 없이 자율적으로 생성·수정·삭제**할 수 있습니다:

- **스킬(Skills)**: `~/.claude/` 하위 커스텀 스킬 파일
- **에이전트(Agents)**: 서브에이전트 디스패치 프롬프트 및 설정
- **훅(Hooks)**: 이벤트 기반 셸 훅 (`PreToolUse`, `PostToolUse`, `Stop` 등)
- **메모리(Memory)**: `~/.claude/projects/.../memory/` 하위 기억 파일 및 인덱스
- **CLAUDE.md**: 이 파일 자체 — 규칙 추가·수정·삭제
- **MCP 설정**: 프로젝트 로컬 MCP 서버 설정

단, 다음은 사용자 명시적 승인 후에만 변경합니다:
- 전역(`~/.claude/settings.json`) 권한 모드 변경
- 외부 서비스(Railway, GitHub) 영향 설정
- 소스 코드 및 프로덕션 배포에 직접 영향을 주는 변경

## 문서 관리 원칙

Claude는 프로젝트 문서의 파일명·위치·내용을 정확하고 이해하기 쉽게 관리합니다.

**디렉터리 용도:**
- `docs/architecture/` — 시스템 구조 설명
- `docs/guides/` — 작업 절차 가이드
- `docs/reference/` — API·환경변수 등 참조 자료
- `docs/decisions/` — 설계 결정 배경 (ADR)
- `docs/superpowers/specs/` — 기능 설계 문서 (`YYYY-MM-DD-<topic>-design.md`)
- `docs/superpowers/plans/` — 구현 계획 (`YYYY-MM-DD-<topic>.md`)

**규칙:**
- 새 문서 추가·수정·삭제 시 이 파일의 "문서 참조" 테이블도 함께 업데이트
- 코드 변경 시 영향받는 문서도 동일 커밋에서 갱신 (코드-문서 drift 방지)
