# CustomWebService 문서 허브

> AI 기반 노코드 웹서비스 플랫폼 — 전체 문서 인덱스  
> **마지막 업데이트:** 2026-04-11

---

## 빠른 탐색

| 목적 | 문서 |
|------|------|
| 프로젝트 처음 이해하기 | [프로젝트 개요](planning/01-project-overview.md) |
| 시스템 구조 파악 | [시스템 아키텍처](architecture/01-system-overview.md) |
| DB/Auth Provider 전환 | [Provider 이중화 아키텍처](architecture/06-provider-migration.md) |
| API 엔드포인트 확인 | [API 설계](architecture/03-api-design.md) |
| 배포 방법 | [배포/운영 계획](operations/01-deployment.md) |
| 개발 시작 전 체크 | [사전 작업 체크리스트](planning/02-pre-launch-checklist.md) |
| 운영 중 문제 발생 | [운영자 가이드](operations/02-operator-guide.md) |

---

## 폴더 구조

```
docs/
├── README.md                        ← 이 파일 (마스터 인덱스)
├── architecture/                    ← 시스템 설계 결정
├── design/                          ← 기능·UX 설계 명세
├── development/                     ← 개발 가이드·스프린트
├── operations/                      ← 배포·운영·도메인
├── reference/                       ← API 카탈로그·법규·에셋
├── planning/                        ← 기획·체크리스트
└── archive/                         ← 구버전 보관
```

---

## Architecture — 시스템 설계 결정

| # | 문서 | 설명 |
|---|------|------|
| 01 | [시스템 아키텍처](architecture/01-system-overview.md) | 레이어드 아키텍처, Provider 패턴, 이벤트 시스템 |
| 02 | [데이터베이스 설계](architecture/02-database.md) | 10개 테이블 ERD, RLS 정책, 마이그레이션 전략 |
| 03 | [API 설계](architecture/03-api-design.md) | `/api/v1/*` 엔드포인트, SSE 스트리밍, 에러 코드 |
| 04 | [AI 코드 생성 설계](architecture/04-ai-generation.md) | 생성 파이프라인, 검증, 후처리, 템플릿 |
| 05 | [확장성 설계 및 로드맵](architecture/05-scalability.md) | 22개 이슈 분석, Phase별 확장 기능 로드맵 |
| 06 | [Provider 이중화 아키텍처](architecture/06-provider-migration.md) | DB/Auth 이중화, Drizzle ORM, Auth.js v5 |

---

## Design — 기능·UX 설계 명세

| # | 문서 | 설명 |
|---|------|------|
| 01 | [요구사항 정의서](design/01-requirements.md) | 기능/비기능 요구사항, 제약 조건 |
| 02 | [UI/UX 설계](design/02-ui-ux.md) | 페이지 구성, 컴포넌트 명세, 디자인 시스템 |
| 03 | [서비스 기획서](design/03-service-planning.md) | 페르소나, 사용자 여정, 기능 상세 |
| 04 | [개발 명세서](design/04-development-spec.md) | 기능별 구현 상세, 예외 처리 |

---

## Development — 개발 가이드·스프린트

| # | 문서 | 설명 |
|---|------|------|
| 01 | [개발 로드맵](development/01-roadmap.md) | MVP 8스프린트, 마일스톤, 의존성 |
| 02 | [스프린트 계획](development/02-sprint-plan.md) | 137개 태스크, 완료 기준, 현재 진행 상황 |
| 03 | [스프린트 히스토리](development/03-sprint-history.md) | S7~S12 상세 계획 및 완료 내역 |
| 04 | [CI/CD 자동화](development/04-cicd.md) | GitHub Actions 파이프라인, Dockerfile, 테스트 전략 |
| 05 | [AI 프롬프트 테스트](development/05-ai-prompt-testing.md) | 프롬프트 버전 비교, 시나리오 테스트 |

---

## Operations — 배포·운영·도메인

| # | 문서 | 설명 |
|---|------|------|
| 01 | [배포/운영 계획](operations/01-deployment.md) | Railway 배포 전략, 무료 스택, 모니터링 |
| 02 | [운영자 가이드](operations/02-operator-guide.md) | 장애 대응, 배포 절차, 한도 초과 처리 |
| 03 | [도메인 설정 가이드](operations/03-domain-setup.md) | 가비아 DNS, Railway 커스텀 도메인 |
| 04 | [가상 호스팅 계획](operations/04-virtual-hosting.md) | 서브도메인 라우팅, middleware 구조 |
| 05 | [무료 한도 관리](operations/05-free-tier-management.md) | Railway/Supabase/Claude 한도, 긴급 대응 |

---

## Reference — 참조 자료

| # | 문서 | 설명 |
|---|------|------|
| 01 | [무료 API 카탈로그](reference/01-api-catalog.md) | 10카테고리 54개 API 목록 |
| 02 | [API 검증 가이드](reference/02-api-validation.md) | 10개 검증 항목, 검증 스크립트 |
| 03 | [디자인 에셋 가이드](reference/03-design-assets.md) | 로고·컬러·타이포그래피·무료 도구 |
| 04 | [법적 문서 템플릿](reference/04-legal.md) | 이용약관, 개인정보처리방침, API 라이선스 |
| 05 | [기술 명세서](reference/05-technical-spec.md) | 플랫폼 전체 기술 스펙 |

---

## Planning — 기획·체크리스트

| # | 문서 | 설명 |
|---|------|------|
| 01 | [프로젝트 개요](planning/01-project-overview.md) | 비전, 핵심 가치, 타겟 사용자 |
| 02 | [사전 작업 체크리스트](planning/02-pre-launch-checklist.md) | Day1~3 실행 순서 + Tier별 체크리스트 |
| 03 | [마무리 작업 가이드](planning/03-completion-guide.md) | 출시 전 최종 점검 |

---

## Archive — 구버전 보관

구버전 문서는 `archive/` 폴더에 보관. 참조는 가능하나 최신 정보가 아님.

| 파일 | 대체 문서 |
|------|---------|
| `03-system-architecture-v1.md` | [architecture/01-system-overview.md](architecture/01-system-overview.md) |
| `05-database-v1.md` | [architecture/02-database.md](architecture/02-database.md) |
| `13-sprint-plan-v1.md` | [development/02-sprint-plan.md](development/02-sprint-plan.md) |
| `superpowers/` | 내부 계획 문서 (AI 어시스턴트 작업 기록) |

---

## 기술 스택 요약

| 영역 | 기술 |
|------|------|
| Framework | Next.js 16+ (App Router, TypeScript strict) |
| Database | Supabase (기본) / PostgreSQL + Drizzle ORM (선택) |
| Auth | Supabase Auth (기본) / Auth.js v5 + NextAuth (선택) |
| AI | Claude API (Anthropic SDK) |
| Deploy | Railway (서브도메인 가상 호스팅) |
| Test | Vitest 224개, MSW |

Provider 전환: [architecture/06-provider-migration.md](architecture/06-provider-migration.md)
