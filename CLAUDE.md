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
├── components/      # UI 컴포넌트 (auth/, builder/, catalog/, dashboard/, layout/, settings/, ui/)
├── hooks/           # 커스텀 React hooks
├── lib/             # 유틸리티
│   ├── ai/          # AI 파이프라인 — generationPipeline(오케스트레이터), stageRunner, generationSaver, qualityLoop, generationTracker(진행률 전용), generationLock(중복 생성 차단 — DB 락)
│   ├── auth/        # 인증 — getAuthUser, local-auth*(Credentials+JWT, edge-safe 분할 base/edge), password(scrypt hashPassword/verifyPassword), tokens(auth_tokens 발급/검증), rateLimit(per-IP 스로틀), verifiedGuard(assertEmailVerified), authorize(assertOwner)
│   ├── cache/       # proxyCache.ts — LRU+TTL 인메모리 캐시 (프록시 응답 서버사이드 캐시)
│   ├── config/      # 환경변수 기반 설정 (features, generation, rateLimit, qc 등)
│   ├── catalog/     # API 카탈로그 — healthCheck.ts(DB기반 라이브 검증 분류), verifyRunner.ts(라이브 검증 오케스트레이터·verification_status 갱신, admin 트리거), keyCheck.ts(플랫폼 키 검증), activeApiCount.ts(활성 개수 동적 카운트 — 랜딩/카탈로그 마케팅 카피, 하드코딩 금지)
│   ├── constants/   # 공용 상수 — cdn.ts (CSP CDN 화이트리스트, buildSiteCsp)
│   ├── countries/   # 자체 호스팅 국가 데이터 API 로직 — transform(mledoze 변환), query(region/search 필터·코드 조회), types
│   ├── db/          # 임베디드 SQLite — sqlite/(connection WAL/FK + runSqliteMigrations, schema 11테이블, bootstrap, seedCatalog, ensureCatalog, backup 주기 .backup 덤프+보관정책, retention 무한증가 테이블 정리), errors(UNIQUE 위반 감지)
│   ├── proxy/       # 게시/앱 프록시 인가 — resolveProxyContext(site·app 단일 진입점), siteRateLimit(익명 게시 사이트 IP·프로젝트 한도)
│   ├── email/       # 이메일 발송 — emailService(sendVerificationEmail/sendPasswordResetEmail), Resend provider, no-op console fallback(RESEND_API_KEY 미설정 시)
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
- **레이트리밋**: 혼합 패턴 — generate/regenerate/suggestion은 SQLite 원자적 (better-sqlite3 동기 트랜잭션 `BEGIN` + `UPDATE WHERE count < limit RETURNING`, 단일 writer), proxy는 인메모리 Map (단일 인스턴스 전제). 외부 deploy 일일 한도는 2026-08-01 제거
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
- `GITHUB_TOKEN` / `GITHUB_ORG` / `RAILWAY_TOKEN` — **removed/unused** (외부 사용자 서비스 export 스택 제거, 2026-08-01). Railway에 남아 있으면 삭제 가능. [ADR](docs/decisions/2026-08-01-remove-external-deploy-stack.md)
- `MAX_APIS_PER_PROJECT`, `MAX_DAILY_GENERATIONS` 등 제한 설정
- `AI_MODEL_SUGGESTION` — 추천용 모델 (기본: `claude-haiku-4-5`)
- `AI_MODEL_GENERATION` — 코드 생성 모델 (기본: `claude-opus-5`, Sonnet 폴백: `claude-sonnet-5`)
- `SLACK_WEBHOOK_URL` — 에러·알림 sink. **Slack만 사용**(`errorRateMonitor` 생성 실패율 + `scheduleBackups` 백업 실패/복구 → `sendSlackAlert`). **Sentry SaaS는 의도적으로 미도입·스캐폴딩 제거**(#220 · C4(a)/(b)). `SLACK_WEBHOOK_URL`은 **2026-07-31에 등록·실경보 도착까지 검증 완료** — 경보는 xzawed 워크스페이스 `#alerts` 채널로 간다. **빈 문자열은 미설정과 같다**(`if (!webhookUrl)` no-op) — 점검 시 키 존재가 아니라 **값 길이**를 볼 것. 절차·실측: [monitoring-sink-setup.md](docs/guides/monitoring-sink-setup.md)
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

에이전트가 매 세션 열 네비게이션 맵. **전체 목록·ADR 카탈로그는 [docs/README.md](docs/README.md).**

| 질문 | 참조 문서 |
|------|-----------|
| **불변조건·계약 (깨면 조용히 사고 나는 것들)** | [docs/architecture/system-spec.md](docs/architecture/system-spec.md) |
| **테스트 커버 범위·공백** | [docs/reference/test-coverage-map.md](docs/reference/test-coverage-map.md) |
| **잔여작업 전체 지도 (백로그 진실원)** | [docs/superpowers/plans/2026-07-31-project-wbs.md](docs/superpowers/plans/2026-07-31-project-wbs.md) |
| AI 코드 생성 흐름 | [docs/architecture/ai-pipeline.md](docs/architecture/ai-pipeline.md) |
| 코드 생성/재생성 QC **(필수)** | [docs/guides/qc-process.md](docs/guides/qc-process.md) |
| 환경변수 목록 | [docs/reference/env-vars.md](docs/reference/env-vars.md) |
| API 엔드포인트 | [docs/reference/api-endpoints.md](docs/reference/api-endpoints.md) |
| 일상 운영·모니터링·백업 | [docs/guides/operations.md](docs/guides/operations.md) |
| SQLite 복구 런북 | [docs/guides/sqlite-restore-runbook.md](docs/guides/sqlite-restore-runbook.md) |
| 에러 코드 | [docs/reference/error-codes.md](docs/reference/error-codes.md) |
| 개발 환경·팩토리 규칙 | [docs/guides/development.md](docs/guides/development.md) |
| 설계 결정(ADR) 전체 | [docs/decisions/](docs/decisions/) · 목록은 [docs/README.md](docs/README.md) |
| 문서 인덱스 | [docs/README.md](docs/README.md) |

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

## 타입·에이전트 주의사항

> **불변조건의 본문**은 [system-spec.md](docs/architecture/system-spec.md)에 있다. 아래는 (1) system-spec 한 줄 리마인더 또는 (2) 에이전트/테스트/CI 전용 함정이다. 조용히 깨지는 규칙을 여기서 지우지 말 것 — 없으면 system-spec으로 옮긴 뒤 포인터만 남겨라.

### system-spec 포인터 (전문은 그쪽)

- **Opus 5 `thinking` / 허용목록 폴백 / 구세대 ID 유지** — system-spec §3.4·§3.5 · [ADR](docs/decisions/2026-07-29-llm-model-upgrade-opus5.md)
- **JSON snake_case·camelCase 이중 처리** — system-spec §5.5 (`parseEndpoints` 등)
- **slug 유일성(앱 관리)·프로젝트/계정 삭제 캐스케이드·삭제 이벤트 payload 키(`deletedProjectId`/`deletedUserId`)·감사 로그 익명화** — system-spec §2·§5.2
- **`getAuthUser` DB 행 확인(유령 세션 차단)** — system-spec §1.2 · [ADR](docs/decisions/2026-07-30-account-delete-and-export.md)
- **`generationTracker`는 진행률 전용 · 중복 차단은 `generationLock`** — system-spec §3.1 · [ADR](docs/decisions/2026-07-29-durable-generation-lock.md)
- **생성 status `not_found` 통일** — system-spec §1.7 (클라 union 누락 시 잘못된 UX — 아래 폴링 절 참고)
- **WAL=데이터 본체 · 보존 정책(미사용 토큰 삭제 금지) · 카운터 `DEFAULT 0` · 쿼터 `charged===true` 환불** — system-spec §4.5–4.7·§5.1 · [복구 런북](docs/guides/sqlite-restore-runbook.md)

### 에이전트·테스트·CI 함정 (항상 로드)

- `IAiProvider.tokensUsed` — `{ input: number; output: number }` 구조 (`inputTokens`/`outputTokens` 아님)
- **Anthropic 모델 ID**: 날짜 suffix 없이 사용 — `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-sonnet-5`, `claude-opus-4-6`, `claude-opus-4-7`, `claude-opus-4-8`, `claude-opus-5`. 날짜 포함 ID는 허용목록에 없어 기본값으로 폴백된다
- `AiProviderFactory.ts` 모델 ID 수정 시 **`.test.ts`도 반드시 동시 업데이트** (CI 파손 방지)
- **Playwright 병렬 체크**: 단일 `page`에서 `Promise.allSettled` 사용 시 viewport를 바꾸는 체크는 다른 체크 완료 후 순차 실행 (`renderingQc.ts`)
- **playwright-core executablePath**: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`를 자동 읽지 않음 — `chromium.launch({ ...(executablePath && { executablePath }) })`로 명시 전달 (`browserPool.ts`). 풀 패키지 `playwright`와 다름
- **생성 상태 폴링**: `builder/page.tsx` SSE 폴백은 `src/lib/generation/pollGenerationStatus.ts`(주입형 `fetchFn`·`delay`). 상태: `generating`→진행률, `completed`+result→완료, **`failed`→즉시 terminal 실패**, `not_found`→미존재 메시지, 그 외→연결 복구 실패. 테스트는 DI-delay로 결정적 검증, 기본 `setTimeout`만 `vi.useFakeTimers()`+`runAllTimersAsync()`
- **모듈 레벨 플래그 테스트**: `let registered = false` 류는 `vi.resetModules()` + 매 테스트 `await import(...)` 격리 (`eventPersister.ts`)
- **api 라우트 테스트**: `@/lib/config/providers`·`@/lib/supabase/server` 모킹 **불필요**(모듈 삭제됨). 잔존 시 미존재 모듈 모킹. `vitest.config.ts` `testTimeout`/`hookTimeout` 15000ms는 경합 마진으로 유지 — [ADR](docs/decisions/2026-06-09-test-flaky-timeout-contention-fix.md)
- **happy-dom iframe**: `environmentOptions.happyDOM.settings.navigation.disableChildFrameNavigation = true`. v20 `disableIframePageLoading` deprecated. `disableFallbackToSetURL` 기본 false 유지(iframe.src 단언용)
- **MSW `onUnhandledRequest:'error'`**: 새 fetch 엔드포인트는 `src/test/mocks/handlers.ts`에 핸들러 필수. **caveat**: MSW `'error'`가 비동기 전파상 테스트를 항상 빨갛게 만들지는 않음(MSW #946/#943) — 전체 통과 ≠ 미처리 요청 부재
- **SonarCloud vs Codecov**: Codecov/Vitest는 `coverage.include` 화이트리스트만, SonarCloud는 `sonar.sources=src` 전체 — 숫자 불일치를 설정 오류로 단정하지 말 것
- **`coverage.include` 누락 시 CI 빨갱 (2026-07-10 실증)**: lcov에 없는 파일의 변경 라인은 `new_coverage`/`codecov/patch`에서 **0%**. 라우트 테스트 추가 시 `vitest.config.ts` `coverage.include`에도 추가. 비테스트 파일은 `sonar.coverage.exclusions`와 `codecov.yml` `ignore` **양쪽**
- **`temperature`**: Claude 4.x에서 미지원·Provider에서 제거. `IAiPrompt.temperature`는 legacy 필드만 유지(API 미전달)
- **인메모리 rate limit**: 재시작 시 초기화, Railway 단일 인스턴스 전제. 멀티 인스턴스 시 Redis 등 필요 (generationTracker와 동일)
- **레이트리밋 환불**: 생성·추천 실패 시 SQLite in-process (`GREATEST(count-1,0)`). 외부 deploy 한도 메서드는 2026-08-01 제거(`deploy_count` 컬럼만 스키마 유지·불활성)
- **레이트리밋 우회 로깅**: `RATE_LIMIT_BYPASS_USER_IDS` 적용 시 `logger.info('Rate limit bypass applied', ...)` 필수(무로깅 우회 금지)
- **추천 라우트 모델**: `suggest-*`는 전부 `createForTask('suggestion')`(Haiku). `AiProviderFactory.create()` 기본(Sonnet 5)을 쓰면 조용히 3배 단가
- **백업 스케줄러 부작용**: 백업을 `readonly: true`로 열면 `.db-shm`/`.db-wal`이 백업 dir에 생기고 prune 패턴에 안 걸림 → 검증 후 `rm -f /data/backups/*.db-wal /data/backups/*.db-shm`. 오프사이트·계층: [operations.md](docs/guides/operations.md)
- **프록시 키 prefix**: `auth_config.prefix`/`header_prefix`를 `resolveApiKey`가 주입 시 적용(`startsWith` 이중 적용 가드). env/유저 키는 raw 저장. 검증: `keys-verify`의 `needsPrefixFix`
- **`pnpm.onlyBuiltDependencies`는 빈 배열 유지 (키 삭제 금지)**: better-sqlite3 v13 N-API 프리빌트인데 `binding.gyp` 때문에 암묵 rebuild. 키 부재 시 pnpm 9는 모든 스크립트 실행. CI·Dockerfile이 `pnpm@9`. 배경: [ADR](docs/decisions/2026-07-28-better-sqlite3-v13-napi-prebuilds.md)
- **Node 22 고정**: `engines.node: ">=22"`, `node:22-alpine`, CI `node-version: 22`. 다운그레이드 금지. [ADR](docs/decisions/2026-06-22-node22-supabase-websocket-fix.md)

### 카탈로그·시드 (상세는 아키텍처/ADR)

- **헬스·키 검증**: CLI `catalog:healthcheck`/`keys:verify` 제거. 현행 `GET /api/v1/admin/keys-verify`, `POST /api/v1/admin/verify-catalog`. 분류 로직 `healthCheck.ts` 잔존. [ADR](docs/decisions/2026-06-21-api-catalog-health-monitoring.md)
- **`verification_status` 소비**: AI 추천은 `broken` 제외·`verified` 우선, 브라우징 `search()`는 broken 숨기지 않음. [ADR](docs/decisions/2026-06-22-verification-status-consumption.md)
- **국가 데이터**: REST Countries 폐기 → `src/data/countries.json` + `/api/v1/countries`. 재생성 `pnpm tsx scripts/generateCountries.ts`. [설계](docs/superpowers/specs/2026-06-22-country-data-api-design.md) · [등록 ADR](docs/decisions/2026-06-22-catalog-registration-and-seed-resync.md)
- **시드**: `src/data/apiCatalog.json`·`featureFlags.json` → `seedCatalog`/`seedFeatureFlags`(빈 테이블만) + `ensureCatalogEntries`(신규 삽입·키리스 오분류 정정). 절차: [database.md](docs/architecture/database.md) §부팅

## 백로그

잔여 작업·열린 판단은 **[WBS](docs/superpowers/plans/2026-07-31-project-wbs.md)가 진실원**이다. [#216](https://github.com/xzawed/CustomWebService/issues/216)(데이터 확보 후 재검토 3건)은 트리거 미충족이면 **착수하지 않는다**.

### 상시 결정 — 비용이 드는 것은 구현 대상이 아니다 (2026-08-01)

**돈이 드는 신규 완화·기능은 제안하지도, 잔여 작업으로 남기지도 않는다.** "오너 액션 대기"가 아니라
**하지 않기로 한 것**으로 표기한다. 해당: 유료 DR(Railway 볼륨 백업·관리형 오브젝트 스토리지·Litestream→S3),
Sentry SaaS 도입.

**세 가지를 혼동하지 말 것** — 뭉뚱그리면 또 다른 거짓말이 된다:

| 구분 | 예 | 취급 |
|---|---|---|
| 신규 유료 완화 | Railway 볼륨 백업 · S3 · Sentry | ❌ **제외** |
| 기존 제품 운영비 | Anthropic API · Railway 호스팅 · Resend | 정상 운영 — 제외 대상 아님 |
| **무료** 가입·심사 | NASA 등록 키 · data.go.kr · Unsplash Production | 오너 ops로 **살아 있다** |

**수용한 잔여 위험**: 볼륨이 사라지고 오프라인 사본이 없으면 **복구 절차가 없다**.
유일한 무료 오프-볼륨 경로는 `GET /api/v1/admin/backup/latest`를 사람이 실제로 당기는 것뿐이며,
자동화·강제 스케줄은 없다. 계층·근거: [operations.md §3.4](docs/guides/operations.md)

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
- 새 문서 추가·수정·삭제 시 [docs/README.md](docs/README.md) 인덱스를 갱신하고, 에이전트 필수 문서면 이 파일의 "문서 참조"에도 반영
- 코드 변경 시 영향받는 문서도 동일 커밋에서 갱신 (코드-문서 drift 방지)
- 불변조건 변경은 [system-spec.md](docs/architecture/system-spec.md)를 같은 커밋에서 갱신
