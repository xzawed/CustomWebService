# 문서 체계 재편성 구현 계획 — Claude Code 최적화

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 51개의 분산된 문서를 16개의 통합 파일로 재편성하여 Claude Code CLI가 컨텍스트에 맞는 문서를 즉시 찾을 수 있는 구조로 최적화.

**Architecture:** 4개 목적별 폴더(`architecture/`, `guides/`, `reference/`, `decisions/`)로 재편성. CLAUDE.md는 카테고리별 링크 테이블을 가진 간결한 허브로 유지. 스프린트/아카이브 파일은 핵심 결정사항만 추출 후 삭제.

**Tech Stack:** Markdown, Git

---

## 파일 구조 (최종 목표)

```
docs/
├── README.md                      (최소 인덱스로 변환)
├── architecture/
│   ├── overview.md                (NEW: 시스템 아키텍처 통합)
│   ├── ai-pipeline.md             (NEW: AI 코드 생성 파이프라인)
│   ├── auth.md                    (NEW: 인증/인가 흐름)
│   ├── database.md                (NEW: DB 스키마 + RLS)
│   ├── events.md                  (NEW: EventBus + EventRepository)
│   └── subdomain.md               (NEW: 서브도메인 라우팅)
├── guides/
│   ├── development.md             (NEW: 개발 가이드)
│   ├── deployment.md              (NEW: 배포 + CI/CD)
│   ├── qc-process.md              (MOVED: 20_QC_표준_프로세스.md)
│   └── operations.md              (NEW: 운영 가이드)
├── reference/
│   ├── api-endpoints.md           (NEW: API v1 전체 엔드포인트)
│   ├── env-vars.md                (NEW: 환경변수 전체 목록)
│   └── error-codes.md             (NEW: 에러 클래스 + HTTP 코드)
├── decisions/
│   ├── provider-migration.md      (NEW: Grok→Claude + DB Provider)
│   ├── db-provider-pattern.md     (NEW: Factory 패턴 도입)
│   ├── gallery-feature.md         (NEW: 갤러리 Phase A-1)
│   └── tech-choices.md            (NEW: 기술 선택 배경)
└── superpowers/
    └── specs/
        └── 2026-04-12-docs-reorganization-design.md
```

---

### Task 1: docs/architecture/overview.md 생성

**Files:**
- Read: `docs/architecture/01-system-overview.md`
- Create: `docs/architecture/overview.md`

- [ ] **Step 1: 소스 파일 열기**

`docs/architecture/01-system-overview.md`를 열어 전체 내용을 확인한다.

- [ ] **Step 2: overview.md 작성**

소스 파일의 **섹션 1-7** 전체를 기반으로 작성하되 다음 사항을 수정:

1. **섹션 1 아키텍처 다이어그램**: `GrokProvider` → `ClaudeProvider` 로 텍스트 교체 (다이어그램의 `│ GrokProvider │` 줄)
2. **섹션 4.1 AI Provider 인터페이스**: 코드블록의 `generateCodeStream(prompt: AiPrompt): AsyncGenerator<string>` → `generateCodeStream(prompt: AiPrompt, onChunk: (chunk: string, accumulated: string) => void): Promise<AiResponse>` 로 업데이트 (실제 구현과 일치)
3. **섹션 6 AI 서비스 선택 전략** (확장 가능한 섹션): `GrokProvider` → `ClaudeProvider` 로 업데이트
4. **파일 상단에 메타 정보 추가**:

```markdown
# 시스템 아키텍처

> **최종 업데이트:** 2026-04-12  
> **구현 상태:** 운영 중 (286개 테스트 통과)

```

5. 파일 상단의 `> v1 대비 변경사항: ...` 이전 버전 비교 노트 제거 (AI에게 불필요)

- [ ] **Step 3: 커밋**

```bash
cd f:/DEVELOPMENT/SOURCE/CLAUDE/CustomWebService
git add docs/architecture/overview.md
git commit -m "docs: architecture/overview.md 생성 (시스템 아키텍처 통합)"
```

---

### Task 2: docs/architecture/ai-pipeline.md 생성

**Files:**
- Read: `docs/architecture/04-ai-generation.md`
- Read: `docs/20_QC_표준_프로세스.md` (섹션 1만)
- Create: `docs/architecture/ai-pipeline.md`

- [ ] **Step 1: 소스 파일 열기**

`docs/architecture/04-ai-generation.md`를 열어 전체 내용 확인.

- [ ] **Step 2: ai-pipeline.md 작성**

소스 파일 전체를 기반으로 작성하되 다음 수정:

1. **파일 상단 메타 추가**:
```markdown
# AI 코드 생성 파이프라인

> **최종 업데이트:** 2026-04-12
```

2. **섹션 6 "AI 서비스 선택 전략"** 전면 교체:
```markdown
## 6. AI Provider 구현

### 현재 구현
- **Claude API (Anthropic)** — 기본 Provider
  - 구현: `src/providers/ai/ClaudeProvider.ts`
  - 팩토리: `AiProviderFactory.create()`, `AiProviderFactory.createForTask()`
  - 모델: `claude-sonnet-4-6` (기본), 태스크별 최적 모델 자동 선택

### Provider 인터페이스 (`src/providers/ai/IAiProvider.ts`)
- `generateCode(prompt)` — 단일 응답 생성
- `generateCodeStream(prompt, onChunk)` — SSE 스트리밍 생성

### 확장 방법
1. `IAiProvider` 구현 클래스 추가
2. `AiProviderFactory`에 등록
3. 환경변수로 활성화
```

3. `GrokProvider` 언급 모두 제거 (섹션 6 전체 교체로 처리됨)
4. 소스의 섹션 3-5 (프롬프트, 검증, 코드 구조)는 그대로 유지
5. **섹션 추가** — 소스 파일 끝에 QC 파이프라인 요약 추가:
```markdown
## 9. QC 통합 위치

코드 생성 완료 후 `docs/guides/qc-process.md`의 8단계 QC 파이프라인이 자동 실행된다.

생성 흐름: AI 응답 수신 → `codeValidator.validateAll()` (보안 차단) → `evaluateQuality()` (품질 점수) → 기준 미달 시 재생성 → DB 저장 → 비동기 Deep QC
```

- [ ] **Step 3: 커밋**

```bash
git add docs/architecture/ai-pipeline.md
git commit -m "docs: architecture/ai-pipeline.md 생성 (AI 파이프라인 + Claude 업데이트)"
```

---

### Task 3: docs/architecture/auth.md 생성

**Files:**
- Read: `docs/architecture/06-provider-migration.md` (Auth 관련 섹션)
- Read: `docs/architecture/01-system-overview.md` (섹션 7 OAuth 인증 흐름)
- Create: `docs/architecture/auth.md`

- [ ] **Step 1: 소스 파일 확인**

`docs/architecture/06-provider-migration.md`를 열어 Auth Provider 관련 섹션 확인.

- [ ] **Step 2: auth.md 작성**

아래 구조로 새 파일 작성:

```markdown
# 인증/인가 아키텍처

> **최종 업데이트:** 2026-04-12  
> **기본 Provider:** Supabase Auth (Google, GitHub OAuth)

---

## 1. 인증 흐름

`docs/architecture/01-system-overview.md` 섹션 7 "OAuth 인증 흐름" 다이어그램 그대로 복사.

---

## 2. Auth Provider 추상화

`docs/architecture/06-provider-migration.md` 중 Auth 관련 섹션 복사:
- 환경변수 표 (`AUTH_PROVIDER`, `AUTH_SECRET` 등)
- `getAuthUser()` 함수 경로 및 동작 방식
- Supabase 모드 vs Auth.js 모드 분기 코드

---

## 3. 서버사이드 인증 (API Routes)

모든 보호 Route에서:
\```typescript
import { getAuthUser } from '@/lib/auth/index';

const user = await getAuthUser();
if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
\```

**중요**: `getAuthUser()`는 `lib/auth/index.ts`의 통합 함수. 직접 `supabase.auth.getUser()` 호출 금지.

---

## 4. 권한 검증 (소유권)

\```typescript
import { assertOwner } from '@/lib/auth/authorize';

// 프로젝트 소유자 확인 — 불일치 시 ForbiddenError throw
assertOwner(project.userId, user.id);
\```

---

## 5. 첫 로그인 사용자 처리

`/callback` Route Handler에서 OAuth 완료 후 `AuthService.getCurrentUser()` 호출.  
신규 사용자면 `UserRepository.createWithAuthId()` 자동 실행.  
경합 조건(23505 중복 키)은 자동 처리됨.
```

- [ ] **Step 3: 커밋**

```bash
git add docs/architecture/auth.md
git commit -m "docs: architecture/auth.md 생성 (인증/인가 흐름)"
```

---

### Task 4: docs/architecture/database.md 생성

**Files:**
- Read: `docs/architecture/02-database.md`
- Create: `docs/architecture/database.md`

- [ ] **Step 1: 소스 파일 확인**

`docs/architecture/02-database.md` 전체 내용 확인.

- [ ] **Step 2: database.md 작성**

소스 파일 전체를 복사하되:

1. 파일 상단 `> v1 대비 변경사항:` 노트 제거
2. 상단에 메타 추가:
```markdown
# 데이터베이스 설계

> **최종 업데이트:** 2026-04-12  
> **DB:** Supabase (PostgreSQL + Row Level Security)
```
3. 내용은 현재 스키마를 정확히 반영하므로 그대로 유지

- [ ] **Step 3: 커밋**

```bash
git add docs/architecture/database.md
git commit -m "docs: architecture/database.md 생성 (DB 스키마 + RLS)"
```

---

### Task 5: docs/architecture/events.md + subdomain.md 생성

**Files:**
- Read: `docs/architecture/01-system-overview.md` (섹션 5 이벤트 시스템)
- Read: `docs/operations/04-virtual-hosting.md`
- Create: `docs/architecture/events.md`
- Create: `docs/architecture/subdomain.md`

- [ ] **Step 1: events.md 작성**

`docs/architecture/01-system-overview.md` 섹션 5 "이벤트 시스템" 전체를 복사 후 상단 추가:

```markdown
# 이벤트 시스템

> **파일:** `src/lib/events/eventBus.ts`, `src/lib/events/domainEvents.ts`  
> **패턴:** EventBus (발행/구독) + EventRepository (감사 로그 영속화)
```

그리고 끝에 추가:
```markdown
## EventRepository (감사 로그)

모든 도메인 이벤트는 `event_log` 테이블에 비동기 영속화됨.  
**파일:** `src/repositories/eventRepository.ts`  
**사용 예시:**
\```typescript
const eventRepo = createEventRepository();
eventRepo.persistAsync(event); // 실패해도 메인 흐름 차단 안 함
\```
```

- [ ] **Step 2: subdomain.md 작성**

`docs/operations/04-virtual-hosting.md` 전체를 읽은 후:
1. 상단 메타 추가:
```markdown
# 서브도메인 라우팅

> **파일:** `src/middleware.ts`  
> **패턴:** Host 헤더 감지 → `/site/[slug]` rewrite
```
2. 파일 내용 전체 복사 (운영 가이드 성격의 내용은 그대로 유지)

- [ ] **Step 3: 커밋**

```bash
git add docs/architecture/events.md docs/architecture/subdomain.md
git commit -m "docs: architecture/events.md + subdomain.md 생성"
```

---

### Task 6: docs/guides/qc-process.md 생성

**Files:**
- Read: `docs/20_QC_표준_프로세스.md`
- Create: `docs/guides/qc-process.md`

- [ ] **Step 1: qc-process.md 작성**

`docs/20_QC_표준_프로세스.md` 전체 내용을 그대로 복사. 내용 변경 없음.  
(이 파일은 CLAUDE.md에서 직접 참조되는 핵심 운영 문서)

- [ ] **Step 2: 커밋**

```bash
git add docs/guides/qc-process.md
git commit -m "docs: guides/qc-process.md 생성 (QC 8단계 프로세스 이전)"
```

---

### Task 7: docs/guides/development.md 생성

**Files:**
- Read: `docs/design/04-development-spec.md`
- Read: `docs/development/05-ai-prompt-testing.md`
- Create: `docs/guides/development.md`

- [ ] **Step 1: 소스 파일 확인**

`docs/design/04-development-spec.md`와 `docs/development/05-ai-prompt-testing.md` 열기.

- [ ] **Step 2: development.md 작성**

아래 구조로 작성:

```markdown
# 개발 가이드

> **최종 업데이트:** 2026-04-12

---

## 1. 개발 환경 설정

### 필수 도구
- Node.js 20+, pnpm
- Supabase CLI (로컬 개발 시)

### 설치 및 실행
\```bash
pnpm install
cp .env.example .env.local   # 환경변수 설정
pnpm dev                      # Turbopack 개발 서버
\```

---

## 2. 코딩 컨벤션

`design/04-development-spec.md`의 코딩 컨벤션 섹션 그대로 복사.  
(TypeScript strict, 레이어 규칙, 에러 처리 패턴 등)

---

## 3. 아키텍처 레이어 규칙

- **Route Handler** → 인증 확인 + Zod 검증 + Service 호출만
- **Service** → 비즈니스 로직, Factory 함수로 Repository 주입
- **Repository** → DB CRUD만, 비즈니스 판단 없음

### Service/Repository 생성 패턴
\```typescript
// ✅ 올바른 방식 (Factory 패턴)
const projectService = createProjectService(supabase);
const codeRepo = createCodeRepository(supabase);

// ❌ 금지 (직접 생성)
const service = new ProjectService(supabase);
\```

---

## 4. 테스트 작성 가이드

### 통합 테스트 (API Routes)
\```typescript
// vi.mock을 파일 상단에 선언 (호이스팅됨)
vi.mock('@/services/factory', () => ({
  createProjectService: vi.fn(),
}));

// 각 테스트에서 동적 import 사용
const { POST } = await import('@/app/api/v1/your-route/route');
\```

`development/05-ai-prompt-testing.md` 내용 중 테스트 패턴 섹션 복사.

---

## 5. 주요 명령어

\```bash
pnpm test              # 전체 테스트
pnpm test:coverage     # 커버리지 리포트
pnpm type-check        # TypeScript 검사
pnpm lint              # ESLint
pnpm build             # 프로덕션 빌드
\```
```

- [ ] **Step 3: 커밋**

```bash
git add docs/guides/development.md
git commit -m "docs: guides/development.md 생성 (개발 가이드 통합)"
```

---

### Task 8: docs/guides/deployment.md 생성

**Files:**
- Read: `docs/operations/01-deployment.md`
- Read: `docs/23_CICD_자동화_설계.md`
- Create: `docs/guides/deployment.md`

- [ ] **Step 1: 소스 파일 확인**

`docs/operations/01-deployment.md`와 `docs/23_CICD_자동화_설계.md` 열기.

- [ ] **Step 2: deployment.md 작성**

```markdown
# 배포 가이드

> **최종 업데이트:** 2026-04-12  
> **플랫폼:** Railway (자동 배포)

---

## 1. 배포 프로세스

`operations/01-deployment.md` 섹션 3 "배포 프로세스" 복사 (플랫폼 자체 배포 + 사용자 생성 서비스 배포 흐름).

---

## 2. CI/CD 파이프라인

`23_CICD_자동화_설계.md`에서 핵심 파이프라인 단계만 추출:

\```
Push → GitHub Actions
  ├── pnpm lint
  ├── pnpm type-check
  ├── pnpm test
  └── Railway 자동 배포 (main 브랜치)
\```

GitHub Actions 설정 파일: `.github/workflows/ci.yml`

---

## 3. 환경 설정 (Railway)

필수 환경변수 목록은 `docs/reference/env-vars.md` 참조.

Railway 대시보드에서 설정:
1. Variables 탭 → 모든 환경변수 입력
2. `NEXT_PUBLIC_*` 변수는 빌드 시 주입되므로 재배포 필요

---

## 4. 도메인 설정

`operations/01-deployment.md` 도메인/서브도메인 설정 섹션 복사.  
가비아 DNS 설정 참고: `27_가비아_도메인_셋팅가이드.md`에서 핵심 DNS 레코드 설정 단계 추출.

---

## 5. 무료 티어 한도

`operations/01-deployment.md` 섹션 2 "무료 티어 한도" 표 복사.
```

**주의**: `operations/01-deployment.md`에 `xAI Grok API` 언급이 있으면 삭제 또는 `Claude API (Anthropic)`로 교체.

- [ ] **Step 3: 커밋**

```bash
git add docs/guides/deployment.md
git commit -m "docs: guides/deployment.md 생성 (배포 + CI/CD 가이드)"
```

---

### Task 9: docs/guides/operations.md 생성

**Files:**
- Read: `docs/operations/02-operator-guide.md`
- Read: `docs/operations/05-free-tier-management.md`
- Create: `docs/guides/operations.md`

- [ ] **Step 1: 소스 파일 확인**

두 파일 열기.

- [ ] **Step 2: operations.md 작성**

```markdown
# 운영 가이드

> **최종 업데이트:** 2026-04-12

---

## 1. 모니터링

`operations/02-operator-guide.md` 모니터링 섹션 복사.

---

## 2. 트러블슈팅

`operations/02-operator-guide.md` 트러블슈팅 섹션 복사.

---

## 3. 무료 티어 한도 관리

`operations/05-free-tier-management.md` 전체 복사.

---

## 4. 관리자 API

\```bash
# QC 통계 조회
GET /api/v1/admin/qc-stats
Authorization: Bearer ${ADMIN_API_KEY}

# 수동 QC 트리거
POST /api/v1/admin/qc-trigger
Authorization: Bearer ${ADMIN_API_KEY}
\```
```

- [ ] **Step 3: 커밋**

```bash
git add docs/guides/operations.md
git commit -m "docs: guides/operations.md 생성 (운영 가이드 통합)"
```

---

### Task 10: docs/reference/api-endpoints.md 생성

**Files:**
- Read: `docs/architecture/03-api-design.md`
- Create: `docs/reference/api-endpoints.md`

- [ ] **Step 1: 소스 파일 확인**

`docs/architecture/03-api-design.md` 전체 열기.

- [ ] **Step 2: api-endpoints.md 작성**

소스 파일 전체 복사 후:

1. 상단 메타 추가:
```markdown
# API v1 엔드포인트 레퍼런스

> **Base URL (개발):** http://localhost:3000/api/v1  
> **Base URL (프로덕션):** https://xzawed.xyz/api/v1  
> **인증:** 모든 엔드포인트는 Supabase 세션 쿠키 필요 (공개 엔드포인트 제외)
```

2. 추가 누락 엔드포인트 확인 후 보완:
   - `POST /api/v1/suggest-apis` (컨텍스트 기반 API 추천)
   - `POST /api/v1/suggest-context` (컨텍스트 제안)
   - `GET /api/v1/gallery` (갤러리 공개 목록)
   - `POST /api/v1/gallery/[id]/like` (좋아요)
   - `POST /api/v1/gallery/[id]/fork` (포크)
   - 실제 파일 존재 여부는 `src/app/api/v1/` 폴더 확인 후 추가

- [ ] **Step 3: 커밋**

```bash
git add docs/reference/api-endpoints.md
git commit -m "docs: reference/api-endpoints.md 생성 (API v1 엔드포인트 레퍼런스)"
```

---

### Task 11: docs/reference/env-vars.md 생성

**Files:**
- Read: `docs/architecture/06-provider-migration.md` (환경변수 표)
- Read: `CLAUDE.md` (환경변수 섹션)
- Create: `docs/reference/env-vars.md`

- [ ] **Step 1: env-vars.md 작성**

```markdown
# 환경변수 레퍼런스

> **주의:** 실제 값은 절대 커밋하지 말 것. `.env.local`(로컬) 또는 Railway Variables(프로덕션)에서 관리.

---

## Supabase

| 변수 | 필수 | 설명 |
|------|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon 공개 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | 서버사이드 전용 서비스 키 |

---

## Provider 전환

`docs/architecture/06-provider-migration.md`의 환경변수 표 전체 복사.  
(`DB_PROVIDER`, `AUTH_PROVIDER`, `DATABASE_URL`, `AUTH_SECRET` 등)

---

## AI

| 변수 | 필수 | 설명 |
|------|------|------|
| `ANTHROPIC_API_KEY` | ✅ | Claude API 키 |

---

## 배포

| 변수 | 필수 | 설명 |
|------|------|------|
| `GITHUB_TOKEN` | 배포 시 | GitHub API 토큰 |
| `RAILWAY_TOKEN` | 배포 시 | Railway API 토큰 |
| `NEXT_PUBLIC_ROOT_DOMAIN` | ✅ | 서브도메인 루트 (e.g. `xzawed.xyz`) |

---

## 보안

| 변수 | 필수 | 설명 |
|------|------|------|
| `ENCRYPTION_KEY` | ✅ | 사용자 API 키 암호화 (32자 이상) |
| `ADMIN_API_KEY` | ✅ | 관리자 API 인증 |

---

## 비즈니스 규칙 (선택, 기본값 있음)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `MAX_APIS_PER_PROJECT` | `5` | 프로젝트당 최대 API 수 |
| `MAX_DAILY_GENERATIONS` | `10` | 사용자당 일일 생성 횟수 |
| `MAX_PROJECTS_PER_USER` | `20` | 사용자당 최대 프로젝트 수 |
| `MAX_REGENERATIONS` | `5` | 프로젝트당 재생성 횟수 |
| `CONTEXT_MIN_LENGTH` | `50` | 컨텍스트 최소 길이 (자) |
| `CONTEXT_MAX_LENGTH` | `2000` | 컨텍스트 최대 길이 (자) |
| `GENERATION_TIMEOUT_MS` | `120000` | 생성 타임아웃 (ms) |

---

## QC

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `ENABLE_RENDERING_QC` | `false` | Playwright 렌더링 QC 활성화 |
```

- [ ] **Step 2: 커밋**

```bash
git add docs/reference/env-vars.md
git commit -m "docs: reference/env-vars.md 생성 (환경변수 전체 목록)"
```

---

### Task 12: docs/reference/error-codes.md 생성

**Files:**
- Read: `src/lib/utils/errors.ts`
- Create: `docs/reference/error-codes.md`

- [ ] **Step 1: 소스 파일 확인**

`src/lib/utils/errors.ts` 열어 모든 에러 클래스와 HTTP 상태 코드 확인.

- [ ] **Step 2: error-codes.md 작성**

`src/lib/utils/errors.ts`의 실제 내용을 바탕으로:

```markdown
# 에러 코드 레퍼런스

> **경로:** `src/lib/utils/errors.ts`  
> **사용 패턴:** Route Handler에서 catch 후 HTTP 상태 코드로 변환

---

## 커스텀 에러 클래스

| 클래스 | HTTP 상태 | 사용 상황 |
|--------|-----------|-----------|
| `ValidationError` | 400 | 입력값 검증 실패 |
| `AuthError` | 401 | 인증 없음 또는 세션 만료 |
| `ForbiddenError` | 403 | 리소스 소유권 불일치 |
| `NotFoundError` | 404 | 리소스 없음 |
| `RateLimitError` | 429 | 일일 한도 초과 |
| `ConflictError` | 409 | 중복 리소스 |

(실제 클래스 정의는 `src/lib/utils/errors.ts` 파일에서 확인)

---

## Route Handler 에러 처리 패턴

\```typescript
try {
  // ...
} catch (error) {
  if (error instanceof RateLimitError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 429 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 404 });
  }
  // 예상치 못한 에러
  logger.error('Unexpected error', { error });
  return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다' }, { status: 500 });
}
\```
```

- [ ] **Step 3: 커밋**

```bash
git add docs/reference/error-codes.md
git commit -m "docs: reference/error-codes.md 생성 (에러 클래스 레퍼런스)"
```

---

### Task 13: docs/decisions/provider-migration.md 생성

**Files:**
- Read: `docs/architecture/06-provider-migration.md`
- Read: `docs/archive/superpowers/2026-03-30-claude-api-transition-design.md`
- Create: `docs/decisions/provider-migration.md`

- [ ] **Step 1: 소스 파일 확인**

두 파일 열기.

- [ ] **Step 2: provider-migration.md 작성**

```markdown
# Provider 마이그레이션 결정 기록

> **결정 날짜:** 2026-03-30 ~ 2026-04-11  
> **상태:** 완료

---

## 1. AI Provider: Grok → Claude API 전환

### 배경
`docs/archive/superpowers/2026-03-30-claude-api-transition-design.md`의 핵심 결정 근거 추출:
- 전환 이유
- 고려한 대안
- 최종 선택 근거

### 현재 상태
- 기본 Provider: Claude API (`src/providers/ai/ClaudeProvider.ts`)
- Grok Provider 제거 완료
- `AiProviderFactory.create()`, `createForTask()` 메서드로 접근

---

## 2. DB/Auth Provider 이중화

`docs/architecture/06-provider-migration.md` 전체 복사.

(Supabase ↔ PostgreSQL 전환 아키텍처, Factory 패턴, 환경변수 전환 방법 포함)
```

- [ ] **Step 3: 커밋**

```bash
git add docs/decisions/provider-migration.md
git commit -m "docs: decisions/provider-migration.md 생성 (Provider 전환 결정 기록)"
```

---

### Task 14: decisions/ 나머지 3개 파일 생성

**Files:**
- Read: `docs/archive/superpowers/2026-03-31-generation-quality-enhancement.md`
- Read: `docs/archive/superpowers/2026-03-29-claude-setup.md`
- Read: `docs/architecture/05-scalability.md`
- Create: `docs/decisions/db-provider-pattern.md`
- Create: `docs/decisions/gallery-feature.md`
- Create: `docs/decisions/tech-choices.md`

- [ ] **Step 1: 소스 파일 확인**

세 파일 열기.

- [ ] **Step 2: db-provider-pattern.md 작성**

`2026-03-31-generation-quality-enhancement.md`에서 Repository 팩토리 패턴 도입 관련 결정 내용 추출:

```markdown
# Repository 팩토리 패턴 도입 결정

> **결정 날짜:** 2026-03-31  
> **상태:** 완료 (모든 Service/Repository 적용 완료)

## 배경
[2026-03-31 스펙에서 도입 이유 추출]

## 결정 내용
- `new XxxService(supabase)` 직접 생성 → `createXxxService(supabase)` 팩토리 함수
- 테스트에서 `vi.mock('@/services/factory')` 패턴으로 모킹 가능
- Provider 전환 시 팩토리 내부만 수정

## 현재 팩토리 파일
- `src/services/factory.ts`
- `src/repositories/factory.ts`
```

- [ ] **Step 3: gallery-feature.md 작성**

`2026-03-29-claude-setup.md`에서 갤러리 Phase A-1 핵심 설계 결정 추출:

```markdown
# 갤러리 기능 설계 결정

> **결정 날짜:** 2026-03-29  
> **상태:** Phase A-1 완료

## 배경
[2026-03-29 스펙에서 갤러리 도입 이유 및 설계 결정 추출]

## 구현 위치
- `src/app/api/v1/gallery/` (API Routes)
- `src/services/galleryService.ts`
- `src/repositories/galleryRepository.ts`
- `src/app/(main)/gallery/` (UI)
```

- [ ] **Step 4: tech-choices.md 작성**

`docs/architecture/05-scalability.md`에서 기술 선택 배경 및 설계 결정 추출 (미래 로드맵은 제외):

```markdown
# 핵심 기술 선택 배경

> **최종 업데이트:** 2026-04-12

## Next.js App Router 선택
[05-scalability.md에서 관련 내용 추출]

## Supabase 선택
[관련 내용 추출]

## Railway 배포 선택
[관련 내용 추출]

## Tailwind CSS 4 (shadcn/ui 미사용)
디자인 시스템을 직접 구현하여 번들 크기 최소화 및 커스터마이징 자유도 확보.
```

- [ ] **Step 5: 커밋**

```bash
git add docs/decisions/db-provider-pattern.md docs/decisions/gallery-feature.md docs/decisions/tech-choices.md
git commit -m "docs: decisions/ 나머지 3개 파일 생성 (Factory 패턴, 갤러리, 기술 선택)"
```

---

### Task 15: CLAUDE.md 업데이트

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: CLAUDE.md 열기**

`CLAUDE.md` 파일 전체 내용 확인.

- [ ] **Step 2: 기술 스택 표 수정**

**변경 전:**
```markdown
| AI | Claude API (Anthropic SDK) — 기본, Grok (롤백용) |
```

**변경 후:**
```markdown
| AI | Claude API (Anthropic SDK, claude-sonnet-4-6) |
```

- [ ] **Step 3: 문서 참조 섹션 교체**

**변경 전 (현재):**
```markdown
## 문서 참조

- `docs/20_QC_표준_프로세스.md` — **QC 표준 프로세스** (모든 생성/수정에 적용)
- `docs/` — 40+ 상세 설계 문서 (한국어): 아키텍처, DB, API, UI/UX, 스프린트 계획
- `README.md` — 프로젝트 전체 개요
- `.github/PULL_REQUEST_TEMPLATE.md` — PR 템플릿
- `.scamanager/` — pre-push 자동 코드리뷰 훅 (Claude CLI → SCAManager 서버, `install-hook.sh`로 설치)
```

**변경 후:**
```markdown
## 문서 참조

| 질문 | 참조 문서 |
|------|-----------|
| 시스템 전체 구조 | [docs/architecture/overview.md](docs/architecture/overview.md) |
| AI 코드 생성 흐름 | [docs/architecture/ai-pipeline.md](docs/architecture/ai-pipeline.md) |
| 코드 생성/재생성 작업 **(필수)** | [docs/guides/qc-process.md](docs/guides/qc-process.md) |
| API 엔드포인트 목록 | [docs/reference/api-endpoints.md](docs/reference/api-endpoints.md) |
| 환경변수 목록 | [docs/reference/env-vars.md](docs/reference/env-vars.md) |
| 에러 클래스 참조 | [docs/reference/error-codes.md](docs/reference/error-codes.md) |
| 배포/운영 작업 | [docs/guides/deployment.md](docs/guides/deployment.md) |
| DB/Auth Provider 전환 | [docs/decisions/provider-migration.md](docs/decisions/provider-migration.md) |
| 설계 결정 배경 | [docs/decisions/](docs/decisions/) |

- [README.md](README.md) — 프로젝트 전체 개요
- [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md) — PR 템플릿
- [.scamanager/](scamanager/) — pre-push 자동 코드리뷰 훅 (`install-hook.sh`로 설치)
```

- [ ] **Step 4: 커밋**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md 업데이트 (Grok 제거, 문서 참조 링크 테이블 추가)"
```

---

### Task 16: 기존 파일/폴더 삭제

**Files:**
- Delete: `docs/sprints/` (8개 파일)
- Delete: `docs/archive/` (7개 파일)
- Delete: `docs/planning/` (3개 파일)
- Delete: `docs/design/` (4개 파일)
- Delete: `docs/development/` (5개 파일)
- Delete: `docs/operations/` (5개 파일)
- Delete: `docs/architecture/` 기존 파일들 (6개)
- Delete: `docs/reference/` 기존 파일들 (5개)
- Delete: `docs/` 루트 번호 파일들 (10개)

- [ ] **Step 1: 구 폴더 전체 삭제**

```bash
cd f:/DEVELOPMENT/SOURCE/CLAUDE/CustomWebService

# 스프린트/아카이브/플래닝 — 결정사항은 이미 decisions/로 추출됨
git rm -r docs/sprints/
git rm -r docs/archive/
git rm -r docs/planning/

# 기존 서브폴더 (새 파일로 대체됨)
git rm -r docs/design/
git rm -r docs/development/
git rm -r docs/operations/

# 기존 architecture/ 파일들 (새 파일로 대체됨)
git rm docs/architecture/01-system-overview.md
git rm docs/architecture/02-database.md
git rm docs/architecture/03-api-design.md
git rm docs/architecture/04-ai-generation.md
git rm docs/architecture/05-scalability.md
git rm docs/architecture/06-provider-migration.md

# 기존 reference/ 파일들
git rm docs/reference/01-api-catalog.md
git rm docs/reference/02-api-validation.md
git rm docs/reference/03-design-assets.md
git rm docs/reference/04-legal.md
git rm docs/reference/05-technical-spec.md

# 루트 번호 파일들
git rm docs/20_QC_표준_프로세스.md
git rm docs/21_확장성_분석_및_로드맵.md
git rm docs/22_확장성_검토_보고서.md
git rm docs/23_CICD_자동화_설계.md
git rm docs/24_CICD_구현_파일목록.md
git rm docs/25_마무리_작업_가이드.md
git rm docs/26_운영자_수행가이드.md
git rm docs/27_가비아_도메인_셋팅가이드.md
git rm docs/28_플랫폼_기술명세서.md
```

- [ ] **Step 2: 커밋**

```bash
git commit -m "docs: 구 문서 파일 삭제 (새 구조로 대체 완료)"
```

---

### Task 17: docs/README.md 업데이트 + 최종 검증

**Files:**
- Modify: `docs/README.md`

- [ ] **Step 1: docs/README.md 최소 인덱스로 변환**

기존 내용을 모두 교체:

```markdown
# 문서

이 프로젝트의 문서는 다음 4개 폴더로 구성됩니다.

| 폴더 | 내용 |
|------|------|
| [architecture/](architecture/) | 시스템 구조, AI 파이프라인, DB, 인증 |
| [guides/](guides/) | 개발, 배포, QC 프로세스, 운영 |
| [reference/](reference/) | API 엔드포인트, 환경변수, 에러 코드 |
| [decisions/](decisions/) | 설계 결정 배경 (ADR) |

Claude Code를 사용 중이라면 루트의 `CLAUDE.md`를 참조하세요.
```

- [ ] **Step 2: 최종 파일 구조 확인**

```bash
find docs -name "*.md" | sort
```

예상 출력 (17개 콘텐츠 + README.md + spec + plans = 20개):
```
docs/README.md
docs/architecture/ai-pipeline.md
docs/architecture/auth.md
docs/architecture/database.md
docs/architecture/events.md
docs/architecture/overview.md
docs/architecture/subdomain.md
docs/decisions/db-provider-pattern.md
docs/decisions/gallery-feature.md
docs/decisions/provider-migration.md
docs/decisions/tech-choices.md
docs/guides/deployment.md
docs/guides/development.md
docs/guides/operations.md
docs/guides/qc-process.md
docs/reference/api-endpoints.md
docs/reference/env-vars.md
docs/reference/error-codes.md
docs/superpowers/specs/2026-04-12-docs-reorganization-design.md
docs/superpowers/plans/2026-04-12-docs-reorganization.md
```

- [ ] **Step 3: CLAUDE.md 링크 유효성 확인**

```bash
# CLAUDE.md에 명시된 각 링크 파일 존재 확인
ls docs/architecture/overview.md
ls docs/architecture/ai-pipeline.md
ls docs/guides/qc-process.md
ls docs/reference/api-endpoints.md
ls docs/reference/env-vars.md
ls docs/reference/error-codes.md
ls docs/guides/deployment.md
ls docs/decisions/provider-migration.md
```

모든 파일이 존재하면 정상.

- [ ] **Step 4: 최종 커밋 + 푸시**

```bash
git add docs/README.md
git commit -m "docs: docs/README.md 최소 인덱스로 변환 + 문서 재편성 완료"
git push origin main
```

---

## 검증 체크리스트

- [ ] `find docs -name "*.md" | wc -l` 결과 20 (17개 콘텐츠 + README + spec + plans 파일)
- [ ] CLAUDE.md의 모든 링크 파일이 실제로 존재
- [ ] `pnpm build` 성공 (문서 변경이 빌드에 영향 없음 확인)
- [ ] Grok 관련 언급이 문서에 남아있지 않음: `grep -r "Grok\|grok" docs/`
