# 문서 인덱스

> CustomWebService 문서 전체 지도. 에이전트 세션 요약은 루트 [`CLAUDE.md`](../CLAUDE.md), 불변조건은 [`architecture/system-spec.md`](architecture/system-spec.md).
>
> **최종 업데이트:** 2026-08-01

## 폴더 용도

| 폴더 | 내용 |
|------|------|
| [architecture/](architecture/) | 시스템 구조·불변조건 |
| [guides/](guides/) | 개발·배포·QC·운영 절차 |
| [reference/](reference/) | API·환경변수·에러·커버리지 맵 |
| [decisions/](decisions/) | ADR (설계 결정 배경) |
| [security/](security/) | 인시던트·감사 면제 |
| [superpowers/](superpowers/) | 설계 초안·장기 계획. **현재 상태는 architecture/guides/reference/`CLAUDE.md` 우선** |

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
| [testing.md](guides/testing.md) | 테스트 전략·모킹·실행 명령 |
| [deployment.md](guides/deployment.md) | CI/CD·Railway·도메인·관리자 검증 API |
| [operations.md](guides/operations.md) | 일상 운영·모니터링·백업·장애 대응 |
| [qc-process.md](guides/qc-process.md) | 생성/재생성 QC 8단계 |
| [sqlite-restore-runbook.md](guides/sqlite-restore-runbook.md) | DB 손상·오염 시 백업 복구 |
| [sqlite-cutover-runbook.md](guides/sqlite-cutover-runbook.md) | Supabase→SQLite 컷오버 (역사 런북) |
| [monitoring-sink-setup.md](guides/monitoring-sink-setup.md) | Slack 알림 sink 등록·검증 |

## reference/

| 문서 | 목적 |
|------|------|
| [api-endpoints.md](reference/api-endpoints.md) | `/api/v1/*` 엔드포인트 목록 |
| [env-vars.md](reference/env-vars.md) | 환경변수 전체 |
| [error-codes.md](reference/error-codes.md) | 에러 클래스·코드 |
| [test-coverage-map.md](reference/test-coverage-map.md) | 테스트 커버 범위·공백 |
| [golden-api-set.md](reference/golden-api-set.md) | 검증된 골든셋 API |

## security/

| 문서 | 목적 |
|------|------|
| [incident-response.md](security/incident-response.md) | 보안 인시던트 대응 |
| [audit-waivers.md](security/audit-waivers.md) | `pnpm audit` 면제 근거 |

## superpowers/plans/ (유지)

| 문서 | 목적 |
|------|------|
| [2026-07-31-project-wbs.md](superpowers/plans/2026-07-31-project-wbs.md) | **잔여작업 백로그 진실원** |
| [2026-06-22-db-removal-sqlite-migration.md](superpowers/plans/2026-06-22-db-removal-sqlite-migration.md) | SQLite 전환 WBS (Phase 1–8, 역사) |

> 출하 완료 기능의 구현 일지 plan은 삭제했다. 결정은 아래 ADR·가이드가 진실원.

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

| 문서 | 한 줄 요약 |
|------|------------|
| [tech-choices.md](decisions/tech-choices.md) | 핵심 기술 선택 배경 |
| [db-provider-pattern.md](decisions/db-provider-pattern.md) | Repository 팩토리 패턴 |
| [organization-code-removal.md](decisions/organization-code-removal.md) | Organization 코드 제거 |
| [provider-migration.md](decisions/provider-migration.md) | DB/Auth Provider 추상화 (역사 — 컷오버로 single-stack) |
| [2026-04-26-repository-utils-extraction.md](decisions/2026-04-26-repository-utils-extraction.md) | Repository 공통 유틸 추출 |
| [2026-04-26-ci-eslint-migration.md](decisions/2026-04-26-ci-eslint-migration.md) | CI ESLint (`next lint` 제거) |
| [2026-04-26-coverage-improvement-retrospective.md](decisions/2026-04-26-coverage-improvement-retrospective.md) | 커버리지 개선 회고 (PR #45·#46) |
| [2026-04-26-sonarcloud-security-a11y-coverage.md](decisions/2026-04-26-sonarcloud-security-a11y-coverage.md) | SonarCloud 보안·a11y·커버리지 |
| [2026-04-29-generation-success-rate-improvement.md](decisions/2026-04-29-generation-success-rate-improvement.md) | 생성 성공률 Phase 2 |
| [2026-04-30-accuracy-gate-and-visibility.md](decisions/2026-04-30-accuracy-gate-and-visibility.md) | 정확도 게이트·가시화 |
| [2026-05-01-api-catalog-verification.md](decisions/2026-05-01-api-catalog-verification.md) | 카탈로그 전수 검증 |
| [2026-05-01-api-catalog-immediate-usable-cleanup.md](decisions/2026-05-01-api-catalog-immediate-usable-cleanup.md) | 즉시 사용 가능 기준 정리 |
| [2026-05-01-developer-key-api-reactivation.md](decisions/2026-05-01-developer-key-api-reactivation.md) | 개발자 키 API 재활성화 |
| [2026-05-03-production-incident-et-api-migration.md](decisions/2026-05-03-production-incident-et-api-migration.md) | ET 마이그레이션 연쇄 장애 회고 |
| [2026-05-03-quality-loop-restoration-et-timeout.md](decisions/2026-05-03-quality-loop-restoration-et-timeout.md) | Quality Loop·ET 타임아웃 분리 |
| [2026-05-04-proxy-response-cache.md](decisions/2026-05-04-proxy-response-cache.md) | 프록시 LRU+TTL 캐시 |
| [2026-05-04-unsplash-attribution-auto-injection.md](decisions/2026-05-04-unsplash-attribution-auto-injection.md) | Unsplash attribution 자동 삽입 |
| [2026-05-22-playwright-core-nft-browsers-json-fix.md](decisions/2026-05-22-playwright-core-nft-browsers-json-fix.md) | playwright-core browsers.json nft 수정 |
| [2026-05-23-security-audit-findings.md](decisions/2026-05-23-security-audit-findings.md) | 보안 감사 C-1·H-2~H-11 |
| [2026-06-09-test-flaky-timeout-contention-fix.md](decisions/2026-06-09-test-flaky-timeout-contention-fix.md) | Vitest full-suite 플래키 타임아웃 |
| [2026-06-09-service-health-audit-fixes.md](decisions/2026-06-09-service-health-audit-fixes.md) | 서비스 건강 감사 16건 |
| [2026-06-21-api-catalog-health-monitoring.md](decisions/2026-06-21-api-catalog-health-monitoring.md) | 카탈로그 헬스·키 검증 자동화 |
| [2026-06-22-node22-supabase-websocket-fix.md](decisions/2026-06-22-node22-supabase-websocket-fix.md) | Node 22 고정 |
| [2026-06-22-verification-status-consumption.md](decisions/2026-06-22-verification-status-consumption.md) | verification_status AI 추천 소비 |
| [2026-06-22-catalog-registration-and-seed-resync.md](decisions/2026-06-22-catalog-registration-and-seed-resync.md) | Countries 등록·시드 재동기화 |
| [2026-06-23-sqlite-cutover-and-supabase-removal.md](decisions/2026-06-23-sqlite-cutover-and-supabase-removal.md) | SQLite 컷오버·Supabase 제거 |
| [2026-06-24-public-signup-multi-user-auth.md](decisions/2026-06-24-public-signup-multi-user-auth.md) | 공개 회원가입·다중 사용자 |
| [2026-07-28-better-sqlite3-v13-napi-prebuilds.md](decisions/2026-07-28-better-sqlite3-v13-napi-prebuilds.md) | better-sqlite3 v13 N-API 프리빌트 |
| [2026-07-28-dependency-security-updates.md](decisions/2026-07-28-dependency-security-updates.md) | 의존성 보안·audit 2단계 |
| [2026-07-28-published-site-proxy-authz.md](decisions/2026-07-28-published-site-proxy-authz.md) | 게시 사이트 프록시 인가 |
| [2026-07-29-medium-audit-findings.md](decisions/2026-07-29-medium-audit-findings.md) | 검수 MEDIUM 항목 |
| [2026-07-29-durable-generation-lock.md](decisions/2026-07-29-durable-generation-lock.md) | DB generation lock |
| [2026-07-29-proxy-cache-key-identity.md](decisions/2026-07-29-proxy-cache-key-identity.md) | 캐시 키 키-신원 |
| [2026-07-29-site-proxy-abuse-monitoring.md](decisions/2026-07-29-site-proxy-abuse-monitoring.md) | site 프록시 오남용 지표 |
| [2026-07-29-llm-model-upgrade-opus5.md](decisions/2026-07-29-llm-model-upgrade-opus5.md) | Opus 5 상향·thinking 규약 |
| [2026-07-30-account-delete-and-export.md](decisions/2026-07-30-account-delete-and-export.md) | 계정 삭제·내보내기·유령 세션 |
| [2026-07-30-login-rate-limit.md](decisions/2026-07-30-login-rate-limit.md) | 로그인 레이트리밋 |
| [2026-07-30-monitoring-sink-slack-only.md](decisions/2026-07-30-monitoring-sink-slack-only.md) | Slack-only sink·백업 경보 |
| [2026-07-30-suggestion-daily-quota-separation.md](decisions/2026-07-30-suggestion-daily-quota-separation.md) | AI 추천 일일 쿼터 분리 |
| [2026-08-01-remove-external-deploy-stack.md](decisions/2026-08-01-remove-external-deploy-stack.md) | 외부 deploy export 스택 제거 |

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
