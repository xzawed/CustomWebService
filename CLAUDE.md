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
| Form | React Hook Form + Zod |
| Database | Supabase (PostgreSQL + Row Level Security) |
| Auth | Supabase Auth (Google, GitHub OAuth) |
| AI | Claude API (Anthropic SDK, claude-opus-4-7 기본, 조건부 Extended Thinking) |
| Testing | Vitest, happy-dom, MSW |
| CI/CD | GitHub Actions → lint → type-check → test → build → deploy |
| Package Manager | pnpm |

## 프로젝트 구조

```
src/
├── app/             # Next.js App Router (pages, layouts, API routes)
│   ├── api/         # /api/v1/* REST endpoints
│   ├── (auth)/      # 인증 관련 페이지
│   ├── (main)/      # 메인 페이지 그룹
│   └── site/        # 서브도메인 서빙 ([slug])
├── components/      # UI 컴포넌트 (builder/, catalog/, dashboard/, gallery/, layout/, settings/, ui/)
├── hooks/           # 커스텀 React hooks
├── lib/             # 유틸리티
│   ├── ai/          # AI 파이프라인 — generationPipeline(오케스트레이터), stageRunner, generationSaver, qualityLoop, generationTracker
│   ├── cache/       # proxyCache.ts — LRU+TTL 인메모리 캐시 (프록시 응답 서버사이드 캐시)
│   ├── config/      # 환경변수 기반 설정
│   ├── deploy/      # 배포 관련
│   ├── events/      # EventBus (pub/sub) + eventPersister (전체 이벤트 자동 DB 기록)
│   ├── generation/  # pollGenerationStatus — 생성 상태 폴링 (builder/page.tsx에서 추출, 주입형·단위 테스트 대상)
│   ├── monitoring/  # slackAlert (Webhook 알림), errorRateMonitor (생성 실패율 임계값 감지)
│   ├── i18n/        # 다국어 — t() 함수, ko.ts (한국어 메시지), types.ts (MessageKey)
│   ├── qc/          # QC 로직 — browserPool, deepQcRunner, featureSmokeTest, qcChecks, renderingQc
│   ├── supabase/    # Supabase 클라이언트
│   └── utils/       # 공통 유틸리티, 에러 클래스
├── middleware.ts     # 서브도메인 라우팅, 보안 헤더 (CSP, HSTS)
├── providers/       # AI Provider (IAiProvider → ClaudeProvider)
├── repositories/    # 데이터 접근 계층 (BaseRepository 패턴)
├── services/        # 비즈니스 로직 계층
├── stores/          # Zustand 스토어
├── templates/       # 코드 생성 템플릿
├── types/           # TypeScript 타입 정의 — schemas.ts (Zod 공용 스키마), project.ts, api.ts, events.ts 등
├── __tests__/       # 테스트 파일 (+ 소스 옆 co-located *.test.ts)
└── test/            # 테스트 헬퍼, 설정
```

## 개발 명령어

```bash
pnpm dev              # 개발 서버 (Turbopack)
pnpm build            # 프로덕션 빌드
pnpm lint             # ESLint 검사
pnpm lint:fix         # ESLint 자동 수정
pnpm type-check       # TypeScript 타입 검사
pnpm format           # Prettier 포맷팅
pnpm format:check     # 포맷 검사
pnpm test             # 전체 테스트
pnpm test:unit        # 단위 테스트 (lib, providers)
pnpm test:integration # 통합 테스트 (API routes)
pnpm test:coverage    # 커버리지 리포트
```

## 코딩 컨벤션

- **TypeScript strict mode** — `any` 사용 금지, export 함수에 명시적 반환 타입
- **Path alias**: `@/*` → `src/*`
- **API 라우트**: `/api/v1/*` 패턴 — 인증 + 유효성 검증 → Service 호출
- **아키텍처 레이어**: Route Handler → Service → Repository → Supabase
- **AI Provider**: `IAiProvider` 인터페이스 — Provider 전용 로직은 Provider 내부에만
- **이벤트 시스템**: `EventBus` + `EventRepository` (감사 로그)
- **레이트리밋**: 혼합 패턴 — generate/regenerate/deploy는 PostgreSQL 원자적 (`UPDATE WHERE count < limit RETURNING`), proxy는 인메모리 Map (단일 인스턴스 전제)
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

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_ROOT_DOMAIN` (서브도메인 가상 호스팅)
- `ANTHROPIC_API_KEY`
- `ADMIN_API_KEY` — 관리자 API 인증 (QC 통계, 수동 QC 트리거)
- `ENABLE_RENDERING_QC` — Playwright 렌더링 QC 활성화 (true/false)
- `ENCRYPTION_KEY` — 사용자 API 키 암호화
- `GITHUB_TOKEN`, `RAILWAY_TOKEN` — 배포용
- `MAX_APIS_PER_PROJECT`, `MAX_DAILY_GENERATIONS` 등 제한 설정
- `AI_MODEL_SUGGESTION` — 추천용 모델 (기본: `claude-haiku-4-5`)
- `AI_MODEL_GENERATION` — 코드 생성 모델 (기본: `claude-opus-4-7`, Sonnet 폴백: `claude-sonnet-4-6`)
- `ET_COMPLEXITY_THRESHOLD` — Extended Thinking 활성화 임계값 (기본: 35점, `evaluateComplexityScore()` 결과 비교)
- `QUALITY_LOOP_ITERATION_TIMEOUT_MS` — Quality Loop 반복당 타임아웃 (기본: 120000ms = 120초)
- `QUALITY_LOOP_ET_ITERATION_TIMEOUT_MS` — ET 활성화 시 Quality Loop 반복당 타임아웃 (기본: 200000ms = 200초). ET 응답이 최대 150초 소요되므로 일반 타임아웃(`QUALITY_LOOP_ITERATION_TIMEOUT_MS`)과 별도 설정
- `QUALITY_LOOP_MAX_ITERATIONS` — Quality Loop 최대 반복 횟수 (기본: 2회, 상한: 3회)
- `QUALITY_LOOP_STRICT_ADOPTION` — Quality Loop retry 채택 가드 (기본: `true`. `false`로 설정 시 한쪽 점수 향상만으로도 채택하는 기존 OR 로직 복원 — 운영 데이터 비교용 롤백 스위치)
- `PIPELINE_MAX_DURATION_MS` — 파이프라인 총 허용 시간 (기본: 290000ms = 290초). Quality Loop 시작 시 `경과 시간 + iterationTimeout > 이 값`이면 반복을 건너뜀. Railway 300초 한도를 고려한 안전 마진 확보용
- `QC_QUALITY_THRESHOLD`, `QC_MOBILE_THRESHOLD` — Quality Loop 재시도 트리거 점수 임계값 (각 기본: 60)
- `RATE_LIMIT_BYPASS_USER_IDS` — 쉼표 구분 userId 목록. 포함된 계정은 일일 생성 한도 검사 스킵 (관리자/개발자 우회용)
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
| 환경변수 목록 | [docs/reference/env-vars.md](docs/reference/env-vars.md) |
| 에러 클래스 참조 | [docs/reference/error-codes.md](docs/reference/error-codes.md) |
| 배포/운영 작업 | [docs/guides/deployment.md](docs/guides/deployment.md) |
| DB/Auth Provider 전환 | [docs/decisions/provider-migration.md](docs/decisions/provider-migration.md) |
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

- [README.md](README.md) — 프로젝트 전체 개요
- [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md) — PR 템플릿
- [.scamanager/](.scamanager/) — pre-push 자동 코드리뷰 훅 (`install-hook.sh`로 설치)

## 배포 품질 원칙 (필수)

이 서비스는 다수 사용자가 이용 중입니다. 배포 품질 = 서비스 신뢰도.

### CSP / 보안 헤더 변경 시
- `middleware.ts`, `site/[slug]/route.ts`, `preview/[projectId]/route.ts` 3개 파일을 반드시 동시에 확인
- CSP 헤더가 2중 적용되는 경로가 없는지 검증 (HTTP 표준: CSP 2개면 둘 다 적용)
- 프롬프트가 사용하는 CDN이 CSP에서 허용되는지 확인

### 서빙 파이프라인 변경 시
- 미리보기, 게시(직접), 게시(서브도메인) 3가지 경로 모두 추적
- assembleHtml() 변경 시 CSS/JS 누락 여부 확인
- "A에서는 되지만 B에서는 안 된다" 같은 경로별 차이가 없어야 함

### 코드 수정 후
- 수정한 함수/파일을 호출하는 모든 경로를 나열하고 각각 검증
- 단일 파일만 보고 끝내지 않고 cross-cutting concern(미들웨어, 공통 함수) 영향 확인

### QC 프로세스 (생성/재생성 공통)
- **상세 절차**: [docs/guides/qc-process.md](docs/guides/qc-process.md) 참조 (8단계 표준 프로세스)
- **파이프라인 설계**: [docs/architecture/ai-pipeline.md](docs/architecture/ai-pipeline.md) 참조 (3단계 Stage + Quality Loop)
- QC 관련 로직 수정 시 `generationPipeline.ts` 중심으로 수정하면 generate/regenerate 양쪽에 동시 반영됨
- QC·저장은 최종 단계 결과에만 적용; 중간 산출물은 DB 저장 안 함

### Edge Runtime 호환성 (middleware.ts / proxy.ts 수정 시 필수)
- `middleware.ts`는 Next.js Edge runtime에서 실행됨 — Node.js 전용 모듈 사용 불가
- 직접·간접 임포트 체인에 `pg`, `net`, `fs`, `crypto`, `drizzle-orm/node-postgres` 등이 포함되면 런타임 크래시 발생
- 임포트 추가 시 체인 전체를 역추적: `middleware` → `A` → `B` → ... → `pg` 패턴 탐지
- 환경변수는 `process.env.VAR`로 직접 읽고, Node.js 런타임용 함수(`getDbProvider`, `getAuthProvider` 등)는 import하지 않는다
- 수정 후 `pnpm test:prod` 로 로컬 standalone 서버에서 헬스체크 통과 여부 확인

### 배포 태그 규칙
- Railway 배포 성공 확인 후: `git tag deploy/YYYY-MM-DD-HHmm && git push origin --tags`
- 배포 롤백이 필요할 때 태그 목록(`git tag -l 'deploy/*'`)으로 이전 커밋 빠르게 식별

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
- **Anthropic 모델 ID 주의**: 4.x 모델은 날짜 suffix 없이 사용 — `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-opus-4-7`. 날짜 포함 ID(예: `claude-haiku-4-5-20251001`)는 404 반환 확인됨
- `AiProviderFactory.ts` 모델 ID 수정 시 `.test.ts`도 반드시 동시에 업데이트 (CI 파손 방지)
- **JSONB 필드명 이중성**: `catalogRepository.parseEndpoints()` 같은 JSONB 매퍼는 snake_case(`example_call`)와 camelCase(`exampleCall`) 둘 다 처리 필요 — DB 직접 삽입 vs 코드 경로 차이
- **Playwright 병렬 체크 주의**: 단일 `page` 인스턴스에서 `Promise.allSettled` 사용 시 viewport를 변경하는 체크는 반드시 다른 체크 완료 후 순차 실행 (`renderingQc.ts` 참고)
- **playwright-core executablePath 주의**: `playwright-core`는 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 환경변수를 자동으로 읽지 않음. `const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH; chromium.launch({ ...(executablePath && { executablePath }) })` 형태로 명시적 전달 필요 (미설정 시 executablePath를 전달하지 않아 playwright-core 기본 탐색 로직이 유지됨). `playwright`(풀 패키지)와 달리 `playwright-core`는 브라우저 다운로드·자동 경로 탐색을 수행하지 않음 (`browserPool.ts` 참고)
- **slug 충돌 처리**: `assignUniqueSlug()` in `projectService.ts` — base → base-2 → … → base-10 → timestamp fallback; 23505 unique 위반 시 1회 재시도
- **generationTracker 단일 인스턴스**: `src/lib/ai/generationTracker.ts`의 `generationTracker`는 모듈 레벨 싱글톤. TTL 차등: `generating` 30분, `completed`/`failed` 10분. Railway 단일 인스턴스 환경에서만 동작 — 멀티 인스턴스 배포 시 Redis 등 외부 저장소로 교체 필요
- **생성 상태 폴링 추출**: `builder/page.tsx`의 SSE 폴백 폴링은 `src/lib/generation/pollGenerationStatus.ts`로 추출됨(주입형 `fetchFn`·`delay`·콜백, 단위 테스트 대상). `page.tsx`는 thin 래퍼. **보존된 quirk**: `status:'failed'`는 즉시 실패시키지 않고 `throw` → catch에서 마지막 시도일 때만 `failGeneration` → 'failed'가 지속되면 `maxAttempts`(120)까지 재시도 후 실패. 추출 시 동작 변경 없이 보존했으며 개선은 별도 사안. 테스트는 DI-delay(즉시 resolve)로 결정적 검증, 기본 `setTimeout` 경로만 `vi.useFakeTimers()`+`runAllTimersAsync()`로 커버
- **모듈 레벨 상태가 있는 파일 테스트**: `let registered = false` 같은 모듈 레벨 플래그가 있는 파일은 테스트 간 상태 누출이 발생한다. `vi.resetModules()` + 매 테스트마다 `await import(...)` 동적 임포트로 격리한다 (`eventPersister.ts` 참고)
- **api 라우트 테스트는 `@/lib/config/providers`를 반드시 모킹**: 라우트는 line-1에서 `getDbProvider`를 import하는데, 이 체인이 `@/lib/db/failover`(→ `pg`)·`@/lib/db/connection`(→ drizzle-orm/node-postgres)의 네이티브+CJS cold 초기화를 끌어온다. `vi.resetModules()` + 인-테스트 `await import('@/app/.../route')` 패턴에서 첫 테스트가 이 비용을 지불하며, 병렬 full-suite 경합 시 기본 5000ms를 넘겨 간헐 타임아웃을 유발한다. `vi.mock('@/lib/config/providers', () => ({ getDbProvider: vi.fn().mockReturnValue('supabase') }))`로 차단한다 (현재 api 라우트 테스트 16/16 모두 이 패턴 적용 — `health.test.ts`는 `@/lib/db/failover`·`@/repositories/factory`까지 함께 모킹해야 native 그래프가 완전 차단된다). `vitest.config.ts`의 `testTimeout`/`hookTimeout`는 경합 마진을 위해 15000ms로 상향됨 — 상세: [docs/decisions/2026-06-09-test-flaky-timeout-contention-fix.md](docs/decisions/2026-06-09-test-flaky-timeout-contention-fix.md)
- **happy-dom iframe 로드 노이즈 차단**: `vitest.config.ts`의 `environmentOptions.happyDOM.settings.navigation.disableChildFrameNavigation = true`로 iframe `src` 실제 로드를 막아 `DOMException NetworkError` 로그 flood를 차단함. v20에서 `disableIframePageLoading`은 deprecated이므로 사용 금지. `disableFallbackToSetURL`(기본 false) 보존으로 `iframe.src` 속성은 그대로 반영되어 단언에는 무영향
- **MSW `onUnhandledRequest:'error'`**: `src/test/setup.ts`가 미처리 요청을 즉시 실패시킴(향후 자동 fetch 컴포넌트 테스트의 무성 hang 예방). 새 컴포넌트가 fetch하는 엔드포인트는 `src/test/mocks/handlers.ts`에 핸들러를 반드시 추가할 것 (현재 Anthropic·`*/api/v1/preview/:id`·`*/api/v1/generate/status/:projectId` 커버). **caveat**: MSW `'error'`는 비동기 전파상 테스트를 항상 빨갛게 만들지는 않으므로(MSW #946/#943) 전체 통과가 "미처리 요청 부재"의 충분 증거는 아님
- **SonarCloud vs Codecov 지표 불일치**: Codecov/Vitest는 `vitest.config.ts`의 `coverage.include` 범위(`src/lib/**`, `src/services/**`, `src/providers/**`, `src/repositories/**`, `src/components/**`)를 측정. SonarCloud는 전체 TypeScript를 더 넓게 측정할 수 있어 두 숫자는 구조적으로 차이가 날 수 있으며, 단순 설정 오류로 단정하지 않는다.
- **temperature deprecated (Claude 4.x)**: Claude 4.x 모델(`claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-opus-4-7`)은 `temperature` 파라미터를 지원하지 않음. ClaudeProvider에서 완전히 제거됨 (Extended Thinking 포함). `IAiPrompt.temperature` 필드는 legacy 호환용으로 유지하나 실제 API 호출에 사용하지 않음
- **인메모리 rate limit 한계**: proxy의 Map 기반 리밋은 서버 재시작 시 초기화됨 (분당 카운터라 보안 영향 낮음). Railway 단일 인스턴스 전제 — 멀티 인스턴스 전환 시 Redis 등 외부 저장소 필요 (generationTracker와 동일 제약)

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
- **확인이 필요한 경우**: Railway·Supabase·GitHub 등 외부 시스템 실제 상태를 알아야 할 때
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
- 외부 서비스(Railway, GitHub, Supabase) 영향 설정
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
