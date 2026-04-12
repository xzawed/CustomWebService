# 문서 체계 재편성 디자인 — Claude Code 최적화

**날짜**: 2026-04-12  
**목적**: 51개 문서 파일을 Claude Code CLI가 효율적으로 읽고 활용할 수 있는 구조로 재편성  
**범위**: 전면 최적화 (재구성 + 내용 업데이트 + AI 가독성 개선)

---

## 목표

Claude Code가 작업 컨텍스트에 따라 정확한 문서를 빠르게 찾을 수 있도록:
- CLAUDE.md를 간결한 허브(~200줄)로 유지하며 카테고리별 링크 제공
- 51개 파일 → 16개 파일로 통합 (69% 감소)
- 현재 코드 작업에 직접 유용하지 않은 문서(완료된 계획, 스프린트 기록, 과거 아카이브) 제거

---

## 새 폴더 구조

```
docs/
├── architecture/          # 시스템이 어떻게 동작하는가
│   ├── overview.md        # 전체 아키텍처 + 레이어 설명
│   ├── ai-pipeline.md     # AI 코드 생성 파이프라인 (프롬프트→QC→저장)
│   ├── auth.md            # 인증/인가 흐름 (Supabase Auth + getAuthUser)
│   ├── database.md        # DB 스키마 + RLS 정책
│   ├── events.md          # EventBus + EventRepository 패턴
│   └── subdomain.md       # 서브도메인 라우팅 + 미들웨어
│
├── guides/                # 어떻게 작업하는가
│   ├── development.md     # 개발 환경, 컨벤션, 테스트 작성법
│   ├── deployment.md      # Railway 배포, 도메인 설정, 운영
│   ├── qc-process.md      # QC 8단계 프로세스 (코드 생성/재생성 시 필수)
│   └── operations.md      # 모니터링, 트러블슈팅, 무료 티어 관리
│
├── reference/             # 빠른 참조
│   ├── api-endpoints.md   # 전체 API v1 엔드포인트 + 요청/응답 형식
│   ├── env-vars.md        # 환경변수 전체 목록 + 설명 + 필수 여부
│   └── error-codes.md     # 커스텀 에러 클래스 + HTTP 상태 코드 매핑
│
└── decisions/             # 왜 이렇게 만들었는가 (ADR)
    ├── provider-migration.md    # Grok→Claude API 전환 배경 및 결정
    ├── db-provider-pattern.md   # Repository 팩토리 패턴 도입 이유
    ├── gallery-feature.md       # 갤러리 Phase A-1 핵심 설계 결정
    └── tech-choices.md          # 핵심 기술 선택 배경 (Next.js, Supabase, Railway)
```

---

## 파일 매핑 (현재 → 신규)

### architecture/ 생성

| 신규 파일 | 소스 파일 |
|-----------|-----------|
| `architecture/overview.md` | `architecture/01-system-overview.md` + `28_플랫폼_기술명세서.md` (핵심만) |
| `architecture/ai-pipeline.md` | `architecture/04-ai-generation.md` + `20_QC_표준_프로세스.md` (파이프라인 흐름 부분) |
| `architecture/auth.md` | `architecture/03-api-design.md` (인증 섹션) + `design/04-development-spec.md` (인증 부분) |
| `architecture/database.md` | `architecture/02-database.md` |
| `architecture/events.md` | `architecture/01-system-overview.md` (이벤트 섹션) |
| `architecture/subdomain.md` | `operations/04-virtual-hosting.md` + `27_가비아_도메인_셋팅가이드.md` (기술 부분) |

### guides/ 생성

| 신규 파일 | 소스 파일 |
|-----------|-----------|
| `guides/development.md` | `design/04-development-spec.md` + `development/05-ai-prompt-testing.md` |
| `guides/deployment.md` | `operations/01-deployment.md` + `23_CICD_자동화_설계.md` + `24_CICD_구현_파일목록.md` (핵심만) |
| `guides/qc-process.md` | `20_QC_표준_프로세스.md` (전체 이전, CLAUDE.md 참조 경로 업데이트) |
| `guides/operations.md` | `operations/02-operator-guide.md` + `operations/05-free-tier-management.md` + `26_운영자_수행가이드.md` |

### reference/ 생성

| 신규 파일 | 소스 파일 |
|-----------|-----------|
| `reference/api-endpoints.md` | `architecture/03-api-design.md` + `reference/01-api-catalog.md` + `reference/02-api-validation.md` |
| `reference/env-vars.md` | `operations/01-deployment.md` (환경변수 섹션) + `28_플랫폼_기술명세서.md` (환경변수 부분) |
| `reference/error-codes.md` | `design/04-development-spec.md` (에러 처리 섹션) + `architecture/03-api-design.md` (에러 응답 부분) |

### decisions/ 생성 (아카이브/스프린트에서 추출)

| 신규 파일 | 소스 파일 |
|-----------|-----------|
| `decisions/provider-migration.md` | `architecture/06-provider-migration.md` + `archive/superpowers/2026-03-30-claude-api-transition-design.md` |
| `decisions/db-provider-pattern.md` | `archive/superpowers/2026-03-31-generation-quality-enhancement.md` (DB 패턴 결정 부분) + 스프린트 기록에서 추출 |
| `decisions/gallery-feature.md` | `archive/superpowers/2026-03-29-claude-setup.md` + 스프린트 기록에서 추출 |
| `decisions/tech-choices.md` | `architecture/05-scalability.md` (기술 결정 부분) + `design/01-requirements.md` (핵심만) |

---

## 삭제 대상

다음 파일/폴더는 내용을 추출한 후 삭제:

**폴더 전체 삭제:**
- `docs/sprints/` (8개 파일) — 완료된 스프린트 TODO, AI 작업에 불필요
- `docs/archive/` (7개 파일) — 핵심 결정사항은 `decisions/`로 추출
- `docs/planning/` (3개 파일) — 완료된 론칭 체크리스트, 미래 계획

**개별 파일 삭제 (루트 번호 파일):**
- `20_QC_표준_프로세스.md` → `guides/qc-process.md`로 이전 후 삭제
- `21_확장성_분석_및_로드맵.md` → 관련 내용은 `decisions/tech-choices.md`로
- `22_확장성_검토_보고서.md` → 위와 동일
- `23_CICD_자동화_설계.md` → 핵심만 `guides/deployment.md`로
- `24_CICD_구현_파일목록.md` → 위와 동일
- `25_마무리_작업_가이드.md` → 완료된 작업, 삭제
- `26_운영자_수행가이드.md` → `guides/operations.md`로 통합
- `27_가비아_도메인_셋팅가이드.md` → `architecture/subdomain.md`로 핵심 이전
- `28_플랫폼_기술명세서.md` → 여러 파일로 분산

**기존 폴더 내 삭제:**
- `architecture/05-scalability.md` → 미래 로드맵, `decisions/tech-choices.md`로 결정 부분만
- `architecture/06-provider-migration.md` → `decisions/provider-migration.md`로 이전
- `design/01-requirements.md` → 초기 요구사항, 핵심만 추출 후 삭제
- `design/02-ui-ux.md` → UI 가이드라인 (현재 코드 작업에 직접 불필요)
- `design/03-service-planning.md` → 완료된 계획
- `development/01-roadmap.md` → 미래 계획
- `development/02-sprint-plan.md` → 스프린트 계획
- `development/03-sprint-history.md` → 스프린트 기록
- `reference/03-design-assets.md` → 디자인 에셋 (AI 작업 불필요)
- `reference/04-legal.md` → 법적 고지 (AI 작업 불필요)
- `docs/README.md` → GitHub 폴더 탐색용으로 최소 인덱스(2줄)로 변환: "프로젝트 문서입니다. 자세한 내용은 루트 CLAUDE.md를 참조하세요."

---

## CLAUDE.md 업데이트 내용

### 수정 사항
1. **기술 스택 표**: `"Grok (롤백용)"` 제거 → `"Claude API (Anthropic SDK)"` 단독
2. **문서 참조 섹션**: 카테고리별 링크 테이블로 교체

### 새 문서 참조 섹션 형식
```markdown
## 문서 참조

| 질문 | 참조 문서 |
|------|-----------|
| 시스템 전체 구조 | docs/architecture/overview.md |
| AI 코드 생성 흐름 | docs/architecture/ai-pipeline.md |
| 코드 생성/재생성 작업 (필수) | docs/guides/qc-process.md |
| API 엔드포인트 목록 | docs/reference/api-endpoints.md |
| 환경변수 목록 | docs/reference/env-vars.md |
| 에러 클래스 참조 | docs/reference/error-codes.md |
| 배포/운영 작업 | docs/guides/deployment.md |
| 설계 결정 배경 | docs/decisions/ |
```

---

## 검증 기준

각 신규 파일 작성 후 확인:
- [ ] 현재 코드베이스와 일치하는 내용인가 (구 아키텍처 설명 제거)
- [ ] CLAUDE.md 링크가 실제 파일 경로와 일치하는가
- [ ] 중복 내용이 없는가 (동일 내용이 두 파일에 존재하지 않음)
- [ ] AI가 파일 제목만 보고 내용을 예측할 수 있는가

---

## 실행 순서

1. 신규 파일 작성 (소스 내용 통합)
2. CLAUDE.md 업데이트
3. 기존 파일/폴더 삭제
4. 링크 검증
