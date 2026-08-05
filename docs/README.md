# 문서 인덱스

> CustomWebService 문서 전체 지도. 에이전트 세션 요약은 루트 [`CLAUDE.md`](../CLAUDE.md), 불변조건은 [`architecture/system-spec.md`](architecture/system-spec.md).
>
> **최종 업데이트:** 2026-08-01 (Phase 0–5 agent-truth cleanup)

---

## 문서 진실 정책 (anti-recurrence)

에이전트·운영자가 거짓 절차를 다시 키우지 않기 위한 규칙.

### 어디에 무엇을 쓰는가

| 층 | 위치 | 시제·성격 |
|----|------|-----------|
| **현재 시제 진실** | 루트 `CLAUDE.md` + `docs/architecture/` · `docs/guides/` · `docs/reference/` · `docs/security/` | “지금 코드가 하는 일”만. 명령·경로·시그니처는 코드로 검증 후 기록 |
| **결정 이력 (ADR)** | `docs/decisions/` | **제자리 보존**. 상단에 상태 한 줄(`Status: Accepted` / `Superseded by …` 등). 절차 런북으로 쓰지 말 것 |
| **절차·마이그레이션 역사** | `docs/archive/` | 파일 머리에 `DOC_STATUS: HISTORICAL \| DO_NOT_EXECUTE`. 에이전트는 **실행하지 않음** |

### 금지

1. **두 번째 아키텍처 트리** — 예: 과거 `.claude/docs/` 식 미러. 갱신 속도가 본문과 어긋나면 **틀린 규칙을 단언하는 문서**가 된다.
2. **규칙서 복제** — 예: 과거 `AGENTS.md`가 `CLAUDE.md`의 긴 복사본이었던 형태. 본편 112회 갱신 동안 복사본 7회 → **이미 죽은 단일 관리자 인증 모델**을 수개월간 단언했다. 지금은 포인터만 남긴다. **내용을 다시 채우지 말 것.**
3. **존재하지 않는 명령** — 어떤 문서의 어떤 명령도 `package.json`의 `scripts` 또는 실제 `scripts/` 파일로 **grep 가능**해야 한다. 삭제된 `pnpm admin:hash` · `catalog:healthcheck` · `keys:verify` · `seed:generate` · `cutover:migrate` · `migrate-encryption-key` 를 다시 “실행 절차”로 넣지 말 것.

### 에이전트 체크리스트 슬롯

| 위치 | 역할 |
|------|------|
| [`.claude/commands/`](../.claude/commands/) | **체크리스트 only** (5개: `add-event`, `new-api-route`, `validate`, `verify-csp`, `verify-serving`). 각 파일 첫 줄이 `CLAUDE.md` + `system-spec` 포인터. 아키텍처 본문을 여기에 쓰지 말 것 — 여기가 썩으면 배포 전 검증이 거짓 통과한다 |

코드 변경 시 영향 문서는 **같은 커밋**에서 갱신. 문서끼리 어긋나면 **코드를 정본**으로 삼고 문서를 고친다.

---

## 폴더 용도

| 폴더 | 내용 |
|------|------|
| [architecture/](architecture/) | 시스템 구조·불변조건 |
| [guides/](guides/) | 개발·배포·QC·운영·테스트 절차 |
| [reference/](reference/) | API·환경변수·에러·커버리지 맵·골든셋 |
| [decisions/](decisions/) | ADR (설계 결정 이력, 상태 라인) |
| [security/](security/) | 인시던트·감사 면제 |
| [superpowers/](superpowers/) | 설계 초안·장기 계획. **현재 상태는 architecture/guides/reference/`CLAUDE.md` 우선** |
| [archive/](archive/) | **역사 문서 (비실행).** 완료된 컷오버·마이그레이션 절차 |

루트 보조:

| 경로 | 내용 |
|------|------|
| [`CLAUDE.md`](../CLAUDE.md) | 에이전트 필수 규칙·스택 요약 (단일 규칙서) |
| [`Agents.md`](../Agents.md) | **포인터 only** — 규칙 본문 금지 |
| [`README.md`](../README.md) | 제품 정문·설치 퀵스타트 |
| [`.env.example`](../.env.example) | 로컬 스타터 env (코드가 읽는 변수만) |
| [`.claude/commands/`](../.claude/commands/) | 슬래시 커맨드 체크리스트 5종 |

---

## architecture/

| 문서 | 목적 |
|------|------|
| [system-spec.md](architecture/system-spec.md) | **불변조건·계약** (깨면 조용히 사고 나는 규칙) |
| [overview.md](architecture/overview.md) | 시스템 전체 구조 |
| [ai-pipeline.md](architecture/ai-pipeline.md) | 3-Stage 생성 + Quality Loop |
| [database.md](architecture/database.md) | SQLite 스키마·시드·접근 계층 |
| [auth.md](architecture/auth.md) | Auth.js Credentials + JWT 현행 스택 |
| [events.md](architecture/events.md) | EventBus·감사 로그 |
| [subdomain.md](architecture/subdomain.md) | 서브도메인 rewrite·게시 경로 |

## guides/

| 문서 | 목적 |
|------|------|
| [development.md](guides/development.md) | 로컬 환경·코딩 컨벤션·무인자 factory |
| [testing.md](guides/testing.md) | 테스트 전략·모킹·실행 명령 (개수/% 스냅샷 없음) |
| [deployment.md](guides/deployment.md) | CI/CD·Railway·도메인·관리자 검증 API |
| [operations.md](guides/operations.md) | 일상 운영·모니터링·백업·장애 대응 |
| [qc-process.md](guides/qc-process.md) | 생성/재생성 QC 8단계 |
| [sqlite-restore-runbook.md](guides/sqlite-restore-runbook.md) | DB 손상·오염 시 백업 복구 |
| [monitoring-sink-setup.md](guides/monitoring-sink-setup.md) | Slack 알림 sink 등록·검증 |

## reference/

| 문서 | 목적 |
|------|------|
| [api-endpoints.md](reference/api-endpoints.md) | `/api/v1/*` 엔드포인트 목록 |
| [env-vars.md](reference/env-vars.md) | 환경변수 전체 |
| [error-codes.md](reference/error-codes.md) | 에러 클래스·코드 |
| [test-coverage-map.md](reference/test-coverage-map.md) | 테스트 커버 범위·공백 |
| [golden-api-set.md](reference/golden-api-set.md) | 검증된 골든셋 API (런타임 admin 검증 경로) |

## security/

| 문서 | 목적 |
|------|------|
| [incident-response.md](security/incident-response.md) | 시크릿 노출·회전 (현존 시크릿만) |
| [audit-waivers.md](security/audit-waivers.md) | `pnpm audit` 면제 근거 |

## superpowers/plans/ (유지)

| 문서 | 목적 |
|------|------|
| [2026-07-31-project-wbs.md](superpowers/plans/2026-07-31-project-wbs.md) | **잔여작업 백로그 진실원** |

> 출하 완료 기능의 구현 일지 plan은 삭제했다. 결정은 아래 ADR·가이드가 진실원.

## archive/ — 역사 문서 (비실행)

> **DOC_STATUS: HISTORICAL · DO_NOT_EXECUTE.** 완료된 컷오버·마이그레이션 절차를 보존한다.
> 에이전트·운영자가 이 경로의 단계를 현재 시스템에서 실행하면 안 된다.
> 현행 진실원: [database.md](architecture/database.md) · [operations.md](guides/operations.md) ·
> [sqlite-restore-runbook.md](guides/sqlite-restore-runbook.md) · [2026-06-23 컷오버 ADR](decisions/2026-06-23-sqlite-cutover-and-supabase-removal.md) ·
> [2026-07-31 WBS](superpowers/plans/2026-07-31-project-wbs.md).

| 문서 | 목적 |
|------|------|
| [guides/sqlite-cutover-runbook.md](archive/guides/sqlite-cutover-runbook.md) | Supabase→SQLite 컷오버 런북 (2026-06-23 완료) |
| [superpowers/plans/2026-06-22-db-removal-sqlite-migration.md](archive/superpowers/plans/2026-06-22-db-removal-sqlite-migration.md) | SQLite 전환 WBS Phase 1–8 (역사) |

## superpowers/specs/

| 문서 | 목적 |
|------|------|
| [2026-04-12-docs-reorganization-design.md](superpowers/specs/2026-04-12-docs-reorganization-design.md) | 문서 체계 재편 설계 |
| [2026-04-12-phase-a2-template-library-design.md](superpowers/specs/2026-04-12-phase-a2-template-library-design.md) | 템플릿 라이브러리 설계 |
| [2026-04-14-two-stage-generation-design.md](superpowers/specs/2026-04-14-two-stage-generation-design.md) | 2단계 생성 설계 (현 3-Stage 확장의 원칙 참고) |
| [2026-04-26-sonarcloud-quality-fix-design.md](superpowers/specs/2026-04-26-sonarcloud-quality-fix-design.md) | SonarCloud 품질 게이트 설계 |
| [2026-04-27-component-test-design.md](superpowers/specs/2026-04-27-component-test-design.md) | 컴포넌트 테스트 도입 설계 |
| [2026-06-22-country-data-api-design.md](superpowers/specs/2026-06-22-country-data-api-design.md) | 자체 호스팅 국가 데이터 API |
| [2026-06-24-public-signup-multi-user-auth-design.md](superpowers/specs/2026-06-24-public-signup-multi-user-auth-design.md) | 공개 회원가입·다중 사용자 인증 설계 |
| [2026-07-28-published-site-proxy-authz-design.md](superpowers/specs/2026-07-28-published-site-proxy-authz-design.md) | 게시 사이트 프록시 인가 설계 |

---

## decisions/ — ADR 카탈로그

(과거 `CLAUDE.md` 문서 참조 테이블에서 이동. 시간순.)

| 문서 | 한 줄 요약 | 언제 읽나 (요약) |
|------|------------|------------------|
| [tech-choices.md](decisions/tech-choices.md) | 핵심 기술 선택 배경 | 이력 — 컷오버·다중사용자 ADR·overview 대체 |
| [db-provider-pattern.md](decisions/db-provider-pattern.md) | Repository 팩토리 패턴 | 이력 — 무인자 SQLite factory는 컷오버 ADR 정본 |
| [organization-code-removal.md](decisions/organization-code-removal.md) | Organization 코드 제거 | 이력 — orgs 도메인 제거됨 |
| [provider-migration.md](decisions/provider-migration.md) | DB/Auth Provider 추상화 (역사 — 컷오버로 single-stack) | 이력 — Provider 이중화 폐기 |
| [2026-04-26-repository-utils-extraction.md](decisions/2026-04-26-repository-utils-extraction.md) | Repository 공통 유틸 추출 | `repositories/utils`·pagination·rowMapper 손댈 때 |
| [2026-04-26-ci-eslint-migration.md](decisions/2026-04-26-ci-eslint-migration.md) | CI ESLint (`next lint` 제거) | `lint` 스크립트·`eslint.config.mjs`·CI Lint 손댈 때 |
| [2026-04-26-coverage-improvement-retrospective.md](decisions/2026-04-26-coverage-improvement-retrospective.md) | 커버리지 개선 회고 (PR #45·#46) | coverage.include·Codecov vs Sonar·모듈 플래그 테스트 |
| [2026-04-26-sonarcloud-security-a11y-coverage.md](decisions/2026-04-26-sonarcloud-security-a11y-coverage.md) | SonarCloud 보안·a11y·커버리지 | DOMPurify ADD_TAGS·validateSecurity·키보드 a11y |
| [2026-04-29-generation-success-rate-improvement.md](decisions/2026-04-29-generation-success-rate-improvement.md) | 생성 성공률 Phase 2 | ClaudeProvider 타임아웃·QL 타임아웃·qc-stats·STAGE3 |
| [2026-04-30-accuracy-gate-and-visibility.md](decisions/2026-04-30-accuracy-gate-and-visibility.md) | 정확도 게이트·가시화 | Stage2 트리거·placeholder·STRICT_ADOPTION·LRUMap |
| [2026-05-01-api-catalog-verification.md](decisions/2026-05-01-api-catalog-verification.md) | 카탈로그 전수 검증 | 이력 — 2026-05-01 검증 스냅샷 |
| [2026-05-01-api-catalog-immediate-usable-cleanup.md](decisions/2026-05-01-api-catalog-immediate-usable-cleanup.md) | 즉시 사용 가능 기준 정리 | `is_active` 기준·즉시사용/지속무료 정책으로 정리할 때 |
| [2026-05-01-developer-key-api-reactivation.md](decisions/2026-05-01-developer-key-api-reactivation.md) | 개발자 키 API 재활성화 | 플랫폼 키 env로 키 의존 API 재활성화·`env_var` 정합 |
| [2026-05-03-production-incident-et-api-migration.md](decisions/2026-05-03-production-incident-et-api-migration.md) | ET 마이그레이션 연쇄 장애 회고 | thinking/ET·QL 타임아웃·browserPool·genStatus 고착 (인시던트) |
| [2026-05-03-quality-loop-restoration-et-timeout.md](decisions/2026-05-03-quality-loop-restoration-et-timeout.md) | Quality Loop·ET 타임아웃 분리 | `QUALITY_LOOP_*` env·ET 전용 타임아웃·STRICT_ADOPTION |
| [2026-05-04-proxy-response-cache.md](decisions/2026-05-04-proxy-response-cache.md) | 프록시 LRU+TTL 캐시 | `proxyCache`·`buildCacheKey`·`cache_ttl_seconds` |
| [2026-05-04-unsplash-attribution-auto-injection.md](decisions/2026-05-04-unsplash-attribution-auto-injection.md) | Unsplash attribution 자동 삽입 | `injectUnsplashAttribution`·Unsplash 프롬프트 귀속 |
| [2026-05-22-playwright-core-nft-browsers-json-fix.md](decisions/2026-05-22-playwright-core-nft-browsers-json-fix.md) | playwright-core browsers.json nft 수정 | Dockerfile `browsers.json` 복사·standalone/nft (7일 500) |
| [2026-05-23-security-audit-findings.md](decisions/2026-05-23-security-audit-findings.md) | 보안 감사 C-1·H-2~H-11 | iframe sandbox·ENV denylist·QL validateAll·CSP connect-src |
| [2026-06-09-test-flaky-timeout-contention-fix.md](decisions/2026-06-09-test-flaky-timeout-contention-fix.md) | Vitest full-suite 플래키 타임아웃 | `testTimeout`/`hookTimeout`·api cold-import 모킹 |
| [2026-06-09-service-health-audit-fixes.md](decisions/2026-06-09-service-health-audit-fixes.md) | 서비스 건강 감사 16건 | `not_found` 폴링·리밋 환불·bypass 로깅·Stage3 userPrompt |
| [2026-06-21-api-catalog-health-monitoring.md](decisions/2026-06-21-api-catalog-health-monitoring.md) | 카탈로그 헬스·키 검증 자동화 | keys-verify·verify-catalog·`looksLikeErrorBody` (2xx+에러본문 인시던트) |
| [2026-06-22-node22-supabase-websocket-fix.md](decisions/2026-06-22-node22-supabase-websocket-fix.md) | Node 22 고정 | `engines.node`·CI·Dockerfile Node 버전 변경 시 |
| [2026-06-22-verification-status-consumption.md](decisions/2026-06-22-verification-status-consumption.md) | verification_status AI 추천 소비 | `suggest-apis` broken 제외·verified 우선·browsing 비가림 |
| [2026-06-22-catalog-registration-and-seed-resync.md](decisions/2026-06-22-catalog-registration-and-seed-resync.md) | Countries 등록·시드 재동기화 | countries 카탈로그·`apiCatalog.json`·ensureCatalog 시드 |
| [2026-06-23-sqlite-cutover-and-supabase-removal.md](decisions/2026-06-23-sqlite-cutover-and-supabase-removal.md) | SQLite 컷오버·Supabase 제거 | Provider 분기 재도입·Supabase/pg 복귀·factory 해체 시 |
| [2026-06-24-public-signup-multi-user-auth.md](decisions/2026-06-24-public-signup-multi-user-auth.md) | 공개 회원가입·다중 사용자 | signup·authorize·auth_tokens·assertEmailVerified·Resend |
| [2026-07-28-better-sqlite3-v13-napi-prebuilds.md](decisions/2026-07-28-better-sqlite3-v13-napi-prebuilds.md) | better-sqlite3 v13 N-API 프리빌트 | `onlyBuiltDependencies` 빈 배열·b-sqlite3 메이저·Docker 빌드툴 |
| [2026-07-28-dependency-security-updates.md](decisions/2026-07-28-dependency-security-updates.md) | 의존성 보안·audit 2단계 | `pnpm audit` 2단계·overrides·ignoreGhsas·Dependabot 일괄 |
| [2026-07-28-published-site-proxy-authz.md](decisions/2026-07-28-published-site-proxy-authz.md) | 게시 사이트 프록시 인가 | `SUBDOMAIN_PASSTHROUGH`·`resolveProxyContext`·site 인가 (H-1) |
| [2026-07-29-medium-audit-findings.md](decisions/2026-07-29-medium-audit-findings.md) | 검수 MEDIUM 항목 | AbortSignal·`charged` 환불·x-real-ip·활성 버킷 eviction 금지 |
| [2026-07-29-durable-generation-lock.md](decisions/2026-07-29-durable-generation-lock.md) | DB generation lock | `generationLock`·`GENERATION_LOCK_*`·tracker 역할 분리 |
| [2026-07-29-proxy-cache-key-identity.md](decisions/2026-07-29-proxy-cache-key-identity.md) | 캐시 키 키-신원 | `buildCacheKey` 4번째 `keyIdentity`·`keyFingerprint` 필수 |
| [2026-07-29-site-proxy-abuse-monitoring.md](decisions/2026-07-29-site-proxy-abuse-monitoring.md) | site 프록시 오남용 지표 | `site-proxy-stats`·프로젝트 한도 로그·SITE_PROXY_* 조정 |
| [2026-07-29-llm-model-upgrade-opus5.md](decisions/2026-07-29-llm-model-upgrade-opus5.md) | Opus 5 상향·thinking 규약 | `AI_MODEL_*`·ALLOWED 목록·thinking disabled/adaptive |
| [2026-07-30-account-delete-and-export.md](decisions/2026-07-30-account-delete-and-export.md) | 계정 삭제·내보내기·유령 세션 | `cascadeDeleteUser`·export·`getAuthUser` DB 행 확인 |
| [2026-07-30-login-rate-limit.md](decisions/2026-07-30-login-rate-limit.md) | 로그인 레이트리밋 | `authorizeWithLoginRateLimit`·로그인 IP/계정 버킷·return null |
| [2026-07-30-monitoring-sink-slack-only.md](decisions/2026-07-30-monitoring-sink-slack-only.md) | Slack-only sink·백업 경보 | `sendSlackAlert`·errorRateMonitor·scheduleBackups 경보 |
| [2026-07-30-suggestion-daily-quota-separation.md](decisions/2026-07-30-suggestion-daily-quota-separation.md) | AI 추천 일일 쿼터 분리 | `suggestion_count`·`MAX_DAILY_SUGGESTIONS`·suggest-* 차감 |
| [2026-08-01-remove-external-deploy-stack.md](decisions/2026-08-01-remove-external-deploy-stack.md) | 외부 deploy export 스택 제거 | deploy 재도입·GITHUB/RAILWAY_TOKEN 사용 검토 시 |
| [2026-08-01-remove-unused-sentry-scaffolding.md](decisions/2026-08-01-remove-unused-sentry-scaffolding.md) | 미사용 Sentry 스캐폴딩 제거 (C4(b)) | Sentry 재도입·withSentryConfig·SENTRY_DSN 검토 시 |
| [2026-08-01-db-provider-boot-gate.md](decisions/2026-08-01-db-provider-boot-gate.md) | `DB_PROVIDER` 부팅 게이트 완화 (C5) | `assertSqliteEnv`·`DB_PROVIDER` 미설정·health≠DB 정상 |

---

## 삭제된 구현 plan (결정 보존 위치)

| 삭제된 plan | 결정·런북 보존 |
|-------------|----------------|
| `2026-06-09-test-flakiness-followups.md` (**삭제됨** — ADR이 "출하 후 삭제"로 예정했던 핸드오프 문서) | [플래키 ADR](decisions/2026-06-09-test-flaky-timeout-contention-fix.md), `CLAUDE.md` 테스트 함정 |
| `2026-06-24-public-signup-multi-user-auth.md` | [ADR](decisions/2026-06-24-public-signup-multi-user-auth.md), [설계](superpowers/specs/2026-06-24-public-signup-multi-user-auth-design.md) |
| `2026-07-28-published-site-proxy-authz.md` | [ADR](decisions/2026-07-28-published-site-proxy-authz.md), [설계](superpowers/specs/2026-07-28-published-site-proxy-authz-design.md) |
| `2026-07-30-account-delete-and-export.md` | [ADR](decisions/2026-07-30-account-delete-and-export.md) |
| `2026-07-30-login-rate-limit.md` | [ADR](decisions/2026-07-30-login-rate-limit.md) |
| `2026-07-30-monitoring-sink-wiring.md` | [ADR](decisions/2026-07-30-monitoring-sink-slack-only.md), [setup](guides/monitoring-sink-setup.md) |
| `2026-07-30-sqlite-restore-runbook.md` | [복구 런북](guides/sqlite-restore-runbook.md) |
