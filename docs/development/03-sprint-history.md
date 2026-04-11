# 스프린트 히스토리

> 기반 문서: `docs/sprint-plan.md`, `docs/sprint-S7~S12-*.md`
> 작성일: 2026-04-11
> 목표: S0~S12 전체 스프린트 계획 및 이력 통합

---

## 전체 개요 및 타임라인

### 진행 현황 (S0~S6)

| Sprint | 목표 | 상태 | 커밋 |
|--------|------|------|------|
| S0 | 기존 버그 수정 | 완료 | `1a88e81` |
| S1 | DB 마이그레이션 + Slug 인프라 | 완료 | `64177ab` + DB 직접 실행 |
| S2 | 서브도메인 라우팅 + 사이트 서빙 | 완료 | `842ef50` |
| S3 | 게시 API 구현 | 완료 | `95a16f5` |
| S4 | 대시보드 UI 업데이트 | 완료 | `67dc6dc` |
| S5 | 인프라 설정 (DNS/Railway/Supabase) | 진행 중 | 수동 작업 필요 |
| S6 | 기존 Railway 배포 방식 정리 | 대기 | S5 완료 후 |

### 전체 Sprint 의존성 그래프 (S0~S12)

```
S0~S6 (서브도메인 호스팅 — 완료/진행 중)
  │
  └── S7 (UX 기반 기능)
        │ 다크모드, 코드뷰어, 초안저장, 추가 템플릿
        │
        └── S8 (피드백 & 버전 관리)
              │ 피드백 수집/재생성, 버전 히스토리, Diff
              │
              └── S9 (AI 생태계 확장)
                    │ 멀티 프로바이더, 모델 선택, 프롬프트 템플릿, 쿼터
                    │
                    └── S10 (다국어 & 멀티 프레임워크)
                          │ i18n 완성, 프레임워크 선택, 파서/밸리데이터 분기
                          │
                          └── S11 (팀/조직 & 분석)
                                │ 멀티 테넌시, 역할 기반 접근, 분석 대시보드
                                │
                                └── S12 (플랫폼 고도화)
                                      비주얼 에디터, PWA, 커스텀 도메인
```

### 파일별 변경 요약 (S0~S6)

#### 신규 생성
```
src/app/site/[slug]/route.ts
src/app/api/v1/projects/[id]/publish/route.ts
src/lib/utils/slugify.ts
src/lib/templates/siteError.ts
src/hooks/usePublish.ts
```

#### 수정
```
src/middleware.ts                              (S0-1, S2-2)
src/app/api/v1/preview/[projectId]/route.ts   (S0-2)
src/stores/contextStore.ts                    (S0-3)
src/hooks/useGeneration.ts                    (S0-3)
src/types/project.ts                          (S1-2)
src/repositories/projectRepository.ts         (S1-4)
src/services/projectService.ts                (S1-5)
.env.local                                    (S2-1)
src/components/dashboard/ProjectCard.tsx      (S4-1)
src/app/(main)/dashboard/page.tsx             (S4-3)
src/app/(main)/dashboard/[id]/page.tsx        (S4-4)
src/app/(main)/builder/page.tsx               (S6-3)
```

#### 삭제 예정 (S6)
```
src/lib/deploy/githubService.ts
src/lib/deploy/railwayService.ts
src/providers/deploy/RailwayDeployer.ts
src/providers/deploy/GithubPagesDeployer.ts
src/providers/deploy/DeployProviderFactory.ts
src/hooks/useDeploy.ts
src/services/deployService.ts (부분 또는 전체)
```

### 리스크 관리

| 리스크 | Sprint | 완화 방법 |
|--------|--------|-----------|
| Cloudflare 와일드카드 SSL 지연 | S5 | 도메인 설정 후 최대 24시간 대기 예상 |
| Slug 충돌 | S1 | UNIQUE 제약 + 서비스 레이어 재시도 로직 |
| 기존 사용자 Railway URL 무효화 | S6 | S5 안정화 후 진행 + 마이그레이션 SQL |
| 미들웨어 서브도메인 감지 오탐 | S2 | NEXT_PUBLIC_ROOT_DOMAIN 정확히 설정, 로컬 개발시 미동작 |

---

## Sprint S0: 기존 버그 수정

> 서브도메인 기능과 무관하게 즉시 수정이 필요한 긴급 버그들.
> 독립적으로 배포 가능.

### S0-1. X-Frame-Options 충돌 수정 — 우선순위: 긴급

**문제:** `middleware.ts`가 모든 요청에 `X-Frame-Options: DENY`를 적용해
미리보기 iframe(`/api/v1/preview/[projectId]`)이 동작하지 않음.

**수정 파일:** `src/middleware.ts`

수정 방향:
- `/api/v1/preview/` 경로는 `SAMEORIGIN` 적용
- 나머지는 `DENY` 유지
- 추후 S2에서 `/site/[slug]` 추가 시 `DENY` 유지 (서브도메인이 별개 origin이므로)

---

### S0-2. 미리보기 API CSP 헤더 추가 — 우선순위: 높음

**문제:** `preview/[projectId]/route.ts`에서 생성된 HTML 서빙 시 CSP 없음. XSS 위험 + 외부 리소스 로딩 불가 문제 존재.

**수정 파일:** `src/app/api/v1/preview/[projectId]/route.ts`

추가 헤더:
```typescript
'Content-Security-Policy': [
  "default-src 'self'",
  "script-src 'unsafe-inline' 'unsafe-eval'",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src * data: blob:",
  "connect-src *",
  "frame-ancestors 'self'",
].join('; '),
'X-Content-Type-Options': 'nosniff',
```

---

### S0-3. contextStore localStorage 누수 수정 — 우선순위: 중간

**문제:** 서비스 생성 완료 후 `contextStore`에 이전 context/selectedTemplate이 localStorage에 잔류해 다음 생성 시 오염 가능.

**수정 파일:** `src/stores/contextStore.ts`

확인 후 reset 액션 추가, `useGeneration` 훅의 완료 이벤트에서 호출.

**관련 파일:** `src/hooks/useGeneration.ts`

---

**S0 완료 조건:**
- [x] 미리보기 iframe이 대시보드에서 정상 표시됨
- [x] 빌드 에러 없음
- [x] 기존 기능 회귀 없음 (로그인, 생성, 미리보기)

> **S0 완료** — 커밋 `1a88e81` (2026-03-25)

---

## Sprint S1: DB 마이그레이션 + Slug 인프라

> 서브도메인 서빙의 핵심 기반. S2 이전에 반드시 완료.

### S1-1. DB 마이그레이션 실행

실행 순서:
```sql
-- 1단계: 컬럼 추가
ALTER TABLE projects
  ADD COLUMN slug TEXT,
  ADD COLUMN published_at TIMESTAMPTZ;

-- 2단계: 유니크 인덱스 (slug로 빠른 조회 + 중복 방지)
CREATE UNIQUE INDEX idx_projects_slug
  ON projects (slug)
  WHERE slug IS NOT NULL;

-- 3단계: 복합 인덱스 (slug + status 조회 최적화)
CREATE INDEX idx_projects_slug_status
  ON projects (slug, status)
  WHERE slug IS NOT NULL;

-- 4단계: 기존 deployed 프로젝트에 임시 slug 부여
UPDATE projects
  SET slug = LEFT(REPLACE(id::text, '-', ''), 8)
  WHERE status = 'deployed' AND slug IS NULL;
```

---

### S1-2. Project 타입 확장

**수정 파일:** `src/types/project.ts`

변경 후 `ProjectStatus`:
```typescript
export type ProjectStatus =
  | 'draft'
  | 'generating'
  | 'generated'
  | 'deploying'   // 기존 Railway 배포 이력 호환용 (S6에서 제거)
  | 'deployed'    // 기존 호환용 (S6에서 'published'로 통합)
  | 'published'   // 신규: 서브도메인으로 게시됨
  | 'unpublished' // 신규: 게시 취소
  | 'failed';
```

`Project` 인터페이스에 신규 필드 추가:
```typescript
slug: string | null;        // 신규
publishedAt: string | null; // 신규
```

---

### S1-3. Slug 유틸리티 생성

**신규 파일:** `src/lib/utils/slugify.ts`

구현 내용:
- `toSlug(text: string): string` — 문자열을 URL-safe slug로 변환
- `generateSlug(projectName: string, projectId: string): string` — 프로젝트명 + ID suffix 조합
- `RESERVED_SLUGS` — 예약어 목록 (www, api, admin, login, site 등)
- `isValidSlug(slug: string): boolean` — 정규식 검증 (`/^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/`)

---

### S1-4. ProjectRepository — findBySlug() 추가

**수정 파일:** `src/repositories/projectRepository.ts`

추가 메서드:
```typescript
async findBySlug(slug: string): Promise<Project | null>
async updateSlug(id: string, slug: string, publishedAt: Date): Promise<Project>
```

`toDomain()`에 신규 필드 매핑 추가:
```typescript
slug: (row.slug as string) ?? null,
publishedAt: (row.published_at as string) ?? null,
```

---

### S1-5. ProjectService — publish() / unpublish() 추가

**수정 파일:** `src/services/projectService.ts`

추가 메서드:
- `publish(id, userId)`: 소유자 확인 → slug 생성 → DB 업데이트 → `PROJECT_PUBLISHED` 이벤트 emit
- `unpublish(id, userId)`: 소유자 확인 → `status='unpublished'`, `published_at=null` 업데이트 (slug 유지)

---

**S1 완료 조건:**
- [x] `projects` 테이블에 `slug`, `published_at` 컬럼 존재
- [x] `generateSlug('날씨 앱', 'abc-123-def')` → `[a-z0-9-]+` 형태 반환
- [x] `findBySlug('test-slug')` 정상 동작
- [x] TypeScript 컴파일 에러 없음

> **S1 완료** — 커밋 `64177ab` + DB 마이그레이션 완료 (2026-03-25)

---

## Sprint S2: 서브도메인 라우팅 + 사이트 서빙

> 핵심 기능. S1 완료 후 진행.

### S2-1. 환경변수 추가

**수정 파일:** `.env.local`

```bash
NEXT_PUBLIC_ROOT_DOMAIN=localhost:3000
# 운영 환경 Railway 변수: NEXT_PUBLIC_ROOT_DOMAIN=customwebservice.app
```

---

### S2-2. 미들웨어 서브도메인 감지 추가

**수정 파일:** `src/middleware.ts`

변경 후 처리 흐름:
```
1. Host 헤더에서 서브도메인 추출
2. 서브도메인이 있으면 → /site/[slug]로 내부 rewrite
3. 서브도메인 요청은 인증 세션 업데이트 건너뜀 (public 접근)
4. X-Frame-Options:
   - 서브도메인 사이트 → DENY (frame-ancestors 'none'을 CSP로 처리)
   - 미리보기 API → SAMEORIGIN (S0-1에서 처리)
   - 나머지 → DENY
```

---

### S2-3. 사이트 서빙 Route Handler 생성

**신규 파일:** `src/app/site/[slug]/route.ts`

처리 흐름:
```
GET /site/[slug]

1. params.slug 유효성 검사 → 실패 시 400 응답
2. 예약어 확인 (RESERVED_SLUGS) → 해당 시 404 사이트 없음 페이지
3. Supabase에서 findBySlug(slug) 조회 → 없으면 404
4. project.status 확인 → 'published' 아님 시 준비 중 페이지
5. CodeRepository.findByProject(projectId) 조회 → 코드 없으면 준비 중 페이지
6. assembleHtml()로 완성 HTML 조합
7. 응답 헤더 설정 후 반환
```

---

### S2-4. 404/준비 중 HTML 템플릿

**신규 파일:** `src/lib/templates/siteError.ts`

```typescript
export function notFoundHtml(slug: string): string
export function preparingHtml(slug: string): string
```

---

**S2 완료 조건:**
- [x] `http://localhost:3000/site/[존재하는slug]` → 생성된 HTML 반환
- [x] `http://localhost:3000/site/없는슬러그` → 404 HTML 반환
- [x] `http://localhost:3000/site/!!invalid!!` → 400 반환
- [x] 응답에 Cache-Control 헤더 포함
- [x] 로그인 없이 접근 가능 (인증 불필요)

> **S2 완료** — 커밋 `842ef50` (2026-03-25)

---

## Sprint S3: 게시 API 구현

> S1, S2 완료 후 진행.

### S3-1. 게시/게시취소 API 라우트 생성

**신규 파일:** `src/app/api/v1/projects/[id]/publish/route.ts`

```
POST /api/v1/projects/[id]/publish
  → ProjectService.publish(id, userId)
  → 200: { project: Project }

DELETE /api/v1/projects/[id]/publish
  → ProjectService.unpublish(id, userId)
  → 200: { project: Project }
```

공통 처리:
- 인증 확인 (AuthRequiredError)
- 소유자 확인 (ForbiddenError)
- `handleApiError()` 에러 처리

---

### S3-2. Slug 커스텀 변경 API (선택적)

**신규 파일:** `src/app/api/v1/projects/[id]/slug/route.ts`

```
PATCH /api/v1/projects/[id]/slug
  body: { slug: string }
  → slug 유효성 검사 → 중복 확인 (findBySlug) → 업데이트
```

> 초기 구현에서는 생략 가능. 자동 생성 slug만으로 충분.

---

**S3 완료 조건:**
- [x] `POST /api/v1/projects/[id]/publish` → 200, project.status === 'published'
- [x] `DELETE /api/v1/projects/[id]/publish` → 200, project.status === 'unpublished'
- [x] 타인의 프로젝트 게시 시도 → 403
- [x] 미생성(draft) 프로젝트 게시 시도 → 400

> **S3 완료** — 커밋 `95a16f5` (2026-03-25)

---

## Sprint S4: 대시보드 UI 업데이트

> S1, S3 완료 후 진행.

### S4-1. ProjectCard — slug URL + 게시 버튼

**수정 파일:** `src/components/dashboard/ProjectCard.tsx`

변경 사항:
1. `statusConfig`에 `published`, `unpublished` 항목 추가
2. `project.slug` 있으면 slug URL 표시 + 클립보드 복사 버튼
3. 게시 가능 조건 (`generated` | `deployed`)에 게시 버튼 추가
4. `published` 상태에 게시 취소 버튼 추가

추가 props:
```typescript
interface ProjectCardProps {
  project: Project;
  onDelete?: (id: string) => void;
  onPublish?: (id: string) => void;
  onUnpublish?: (id: string) => void;
}
```

---

### S4-2. usePublish 훅 생성

**신규 파일:** `src/hooks/usePublish.ts`

```typescript
export function usePublish() {
  const publish = async (projectId: string) => { ... }
  const unpublish = async (projectId: string) => { ... }
  return { publish, unpublish, isLoading }
}
```

---

### S4-3. 대시보드 페이지 — usePublish 연결

**수정 파일:** `src/app/(main)/dashboard/page.tsx`

`usePublish` 훅 연결 후 `ProjectCard`의 `onPublish`, `onUnpublish` 콜백에 전달. 게시/게시취소 후 프로젝트 목록 갱신.

---

### S4-4. 프로젝트 상세 페이지 — slug 정보 표시

**수정 파일:** `src/app/(main)/dashboard/[id]/page.tsx`

추가 내용:
- 현재 slug 표시
- 게시 URL 복사 버튼
- 게시/게시취소 버튼

---

**S4 완료 조건:**
- [x] 대시보드에서 `generated` 프로젝트에 "게시" 버튼 노출
- [x] "게시" 클릭 → 즉시 slug URL 표시
- [x] slug URL 옆 "복사" 클릭 → 클립보드에 전체 URL 복사
- [x] "게시 취소" 클릭 → 상태 변경, URL 숨김
- [x] 새로고침 후 상태 유지

> **S4 완료** — 커밋 `67dc6dc` (2026-03-25)

---

## Sprint S5: 인프라 설정

> 운영 배포 직전. S2, S3 완료 후 진행.
> 주의: 실제 DNS/외부 서비스 변경을 포함하므로 준비 후 신중하게 진행.

### S5-1. DNS 설정 (Cloudflare 기준)

| 타입 | 이름 | 값 | 프록시 |
|------|------|----|--------|
| CNAME | `customwebservice.app` | `r4r002eg.up.railway.app` | 활성화 |
| CNAME | `*.customwebservice.app` | `r4r002eg.up.railway.app` | 활성화 |

---

### S5-2. Railway 커스텀 도메인 등록

Railway 대시보드 → 서비스 → Settings → Networking → Custom Domains:
```
customwebservice.app
*.customwebservice.app
```

---

### S5-3. Railway 환경변수 추가

```
NEXT_PUBLIC_ROOT_DOMAIN=customwebservice.app
```

---

### S5-4. Supabase Redirect URLs 업데이트

```
Site URL: https://customwebservice.app
Additional Redirect URLs:
  https://customwebservice.app/callback
  https://r4r002eg.up.railway.app/callback
  http://localhost:3000/callback
```

---

**S5 완료 조건:**
- [ ] `https://customwebservice.app` 접근 정상
- [ ] `https://[slug].customwebservice.app` → 게시된 HTML 표시
- [ ] 없는 slug → 404 페이지 표시
- [ ] OAuth 로그인 후 대시보드 리다이렉트 정상
- [ ] HTTPS 인증서 유효 (잠금 아이콘 확인)

---

## Sprint S6: 기존 Railway 배포 방식 정리

> S5 완료 후, 서브도메인 서빙이 안정적으로 동작 확인 후 진행.

### S6-1. deploy API 라우트 — Railway 호출 제거

**수정 파일:** `src/app/api/v1/deploy/route.ts`

현재: GitHub 저장소 생성 + Railway 서비스 생성 + polling
변경: `/api/v1/projects/[id]/publish`로 리다이렉트하거나 deprecated 처리

---

### S6-2. DeployService — Railway 의존성 제거

**수정 파일:** `src/services/deployService.ts`

Railway/GitHub 관련 로직 제거 또는 비활성화.

---

### S6-3. useDeploy 훅 → usePublish로 대체

**수정 파일:** `src/hooks/useDeploy.ts` → S4-2에서 생성한 `usePublish`로 교체

builder 페이지에서 "배포" 버튼 → "게시" 버튼으로 텍스트 변경

---

### S6-4. 기존 deployed 프로젝트 데이터 마이그레이션

```sql
UPDATE projects
SET
  slug = LEFT(REPLACE(id::text, '-', ''), 8),
  status = 'published',
  published_at = updated_at
WHERE
  status = 'deployed'
  AND slug IS NULL;
```

---

### S6-5. RailwayDeployer / GithubPagesDeployer 파일 정리

삭제 대상 (사용 여부 확인 후):
- `src/lib/deploy/githubService.ts`
- `src/lib/deploy/railwayService.ts`
- `src/providers/deploy/RailwayDeployer.ts`
- `src/providers/deploy/GithubPagesDeployer.ts`
- `src/providers/deploy/DeployProviderFactory.ts`

---

**S6 완료 조건:**
- [ ] "게시" 버튼 클릭 시 Railway 호출 없이 즉시 URL 생성
- [ ] 기존 `deployed` 프로젝트가 서브도메인으로 접근 가능
- [ ] `deploy` 관련 API/서비스/훅 미사용 코드 제거
- [ ] 빌드/테스트 통과

---

## Sprint S7: UX 기반 기능

> 기반 문서: `docs/20_확장성_분석_및_로드맵.md` Phase 1
> 선행 조건: S5 완료 (인프라 안정화)
> 예상 기간: 1~2주
> 목표: 피처 플래그, persist 미들웨어, TemplateRegistry를 활용한 즉시 구현 가능 기능 4종

### 진행 현황

| 태스크 | 목표 | 상태 |
|--------|------|------|
| S7-1 | 다크 모드 | 대기 |
| S7-2 | 코드 뷰어 | 대기 |
| S7-3 | 빌더 초안 자동 저장 | 대기 |
| S7-4 | 추가 코드 템플릿 3종 | 대기 |

---

### S7-1. 다크 모드

> `enable_dark_mode` 피처 플래그 활성화 + Tailwind `dark:` 클래스 적용

**1) ThemeProvider 생성**

**신규 파일:** `src/components/providers/ThemeProvider.tsx`

- localStorage에서 테마 읽기 (system / light / dark)
- `<html>` 태그에 `class="dark"` 토글
- system 선택 시 `prefers-color-scheme` 미디어 쿼리 연동

**2) 테마 토글 버튼**

**수정 파일:** `src/components/layout/Header.tsx`

- 우측 상단에 달/해 토글 아이콘 추가
- `featureFlags.enableDarkMode === false`이면 버튼 숨김

**3) 루트 레이아웃 연결**

**수정 파일:** `src/app/layout.tsx`

- `<html>` 태그에 `suppressHydrationWarning` 추가
- ThemeProvider로 children 래핑

**4) 컴포넌트별 다크 스타일 적용**

적용 패턴:
```tsx
// 기존
<div className="bg-white text-gray-900 border-gray-200">

// 다크 모드 추가
<div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-200 dark:border-gray-700">
```

수정 대상: Header, Footer, ApiCard, CatalogView, ApiDetailModal, ApiSearchBar, CategoryTabs, StepIndicator, ContextInput, TemplateSelector, GenerationProgress, ProjectCard, ProjectGrid, 랜딩/법적 페이지

**5) 피처 플래그 활성화**

```sql
UPDATE feature_flags SET enabled = true WHERE flag_name = 'enable_dark_mode';
```

**완료 조건:**
- [ ] Header에 테마 토글 버튼 표시
- [ ] 다크 모드 전환 시 전체 페이지 색상 변경
- [ ] 새로고침 후 선택한 테마 유지 (localStorage)
- [ ] 시스템 테마 연동 동작
- [ ] `enable_dark_mode = false` 시 토글 버튼 숨김

---

### S7-2. 코드 뷰어

> 생성된 HTML/CSS/JS 코드를 구문 강조 표시 + 복사 기능

**신규 파일:** `src/components/builder/CodeViewer.tsx`

```typescript
interface CodeViewerProps {
  html: string;
  css: string;
  js: string;
}
// - HTML / CSS / JS 탭 전환
// - 줄 번호 표시
// - 구문 강조 (CSS 기반)
// - "복사" 버튼 (navigator.clipboard.writeText)
// - "전체 다운로드" 버튼 (index.html로 조합)
```

**수정 파일:** `src/app/(main)/builder/page.tsx` — 생성 완료 후 "미리보기" / "코드 보기" 탭 전환 UI

**수정 파일:** `src/app/(main)/dashboard/[id]/page.tsx` — "코드 보기" 버튼 → CodeViewer 모달

**완료 조건:**
- [ ] 생성 완료 후 "코드 보기" 탭에서 HTML/CSS/JS 확인 가능
- [ ] 각 탭에서 "복사" 클릭 시 클립보드에 코드 복사
- [ ] "다운로드" 클릭 시 index.html 파일 다운로드
- [ ] `enable_code_viewer = false` 시 탭 숨김

---

### S7-3. 빌더 초안 자동 저장

> apiSelectionStore에 persist 미들웨어 확장 + 복원 UI

**수정 파일:** `src/stores/apiSelectionStore.ts`

```typescript
// 변경: create<ApiSelectionState>()(persist((set) => ({ ... }), {
//   name: 'builder-api-selection'
// }))
```

**수정 파일:** `src/app/(main)/builder/page.tsx`

- 빌더 진입 시 저장된 초안이 있으면 "이전 작업을 이어서 하시겠습니까?" 토스트 표시
- "이어서 하기" → 저장된 상태 유지
- "새로 시작" → 스토어 초기화

생성 완료 후 `apiSelectionStore.reset()` + `contextStore.reset()` 호출

**완료 조건:**
- [ ] API 선택 + 컨텍스트 입력 후 새로고침 → 데이터 유지
- [ ] 빌더 재진입 시 복원 안내 표시
- [ ] 코드 생성 완료 후 자동 초기화

---

### S7-4. 추가 코드 템플릿 3종

> TemplateRegistry.register()로 동적 추가

**신규 파일:** `src/templates/SearchTemplate.ts` — id: 'search', 검색바 + 카드 리스트 + 페이지네이션

**신규 파일:** `src/templates/FeedTemplate.ts` — id: 'feed', 무한 스크롤 피드 + 카테고리 필터

**신규 파일:** `src/templates/MapTemplate.ts` — id: 'map', Leaflet/OpenStreetMap 기반 지도 + 마커

**수정 파일:** `src/templates/TemplateRegistry.ts` — 3종 등록

**수정 파일:** `src/components/builder/TemplateSelector.tsx` — 기존 3종 → 6종 템플릿 그리드

```sql
UPDATE feature_flags SET enabled = true WHERE flag_name = 'enable_template_system';
```

**완료 조건:**
- [ ] 빌더 Step2에서 6개 템플릿 버튼 표시
- [ ] 각 템플릿 클릭 시 컨텍스트 자동 채움
- [ ] 새 템플릿으로 코드 생성 정상 동작

---

### S7 테스트 계획

| 테스트 파일 | 예상 테스트 수 |
|------------|-------------|
| `ThemeProvider.test.ts` | 6개 |
| `CodeViewer.test.ts` | 6개 |
| `apiSelectionStore.test.ts` | 4개 |
| SearchTemplate/FeedTemplate/MapTemplate 각각 | 18개 |
| `dark-mode.test.ts` (통합) | 2개 |
| `template-registry.test.ts` (통합) | 4개 |

테스트 커버리지 목표: 신규 코드 80% 이상, 신규 테스트 40개 이상 추가 (기존 94개 → 134개)

### S7 완료 조건 종합

- [ ] 다크 모드 토글 정상 동작 + 전체 페이지 반영
- [ ] 코드 뷰어에서 HTML/CSS/JS 확인 및 복사/다운로드
- [ ] 빌더 초안 자동 저장 및 복원
- [ ] 6종 템플릿 선택 및 코드 생성
- [ ] 빌드 통과, 기존 기능 회귀 없음

---

## Sprint S8: 사용자 피드백 & 버전 관리

> 기반 문서: `docs/20_확장성_분석_및_로드맵.md` F8, F9
> 선행 조건: S7 완료
> 예상 기간: 2~3주
> 목표: 생성 품질 개선 루프 구축 + 코드 버전 이력 시각화

### 진행 현황

| 태스크 | 목표 | 상태 |
|--------|------|------|
| S8-1 | 피드백 수집 UI + 저장 | 대기 |
| S8-2 | 피드백 기반 재생성 | 대기 |
| S8-3 | 버전 히스토리 UI | 대기 |
| S8-4 | 버전 간 Diff 뷰어 | 대기 |

---

### S8-1. 피드백 수집 UI + 저장

**배경:** `generated_codes.metadata` JSONB에 `userFeedback` 필드 타입 정의 존재하나 미사용. `buildRegenerationPrompt(code, feedback)` 함수 이미 구현 완료.

**신규 파일:** `src/components/builder/FeedbackPanel.tsx`

UI 구성:
- 좋아요/싫어요 버튼
- 싫어요 선택 시 카테고리 선택 펼침 (디자인/레이아웃, API 표시, 기능 누락, 모바일, 기타)
- 상세 의견 텍스트 입력 (선택)
- "피드백 반영하여 재생성" 버튼

**신규 파일:** `src/app/api/v1/projects/[id]/feedback/route.ts`

```
POST /api/v1/projects/:id/feedback
body: { rating: 'positive' | 'negative', categories: string[], comment?: string }
→ generated_codes.metadata.userFeedback에 저장
```

**수정 파일:** `src/repositories/codeRepository.ts` — `updateFeedback()` 메서드 추가

**완료 조건:**
- [ ] 생성 완료 후 피드백 패널 표시
- [ ] 좋아요/싫어요 클릭 시 DB에 저장
- [ ] 싫어요 시 개선 카테고리 + 상세 의견 수집

---

### S8-2. 피드백 기반 재생성

**배경:** `promptBuilder.ts`에 `buildRegenerationPrompt(code, feedback)` 이미 구현됨.

**수정 파일:** `src/services/generationService.ts` — `regenerateWithFeedback()` 메서드 추가

**신규 파일:** `src/app/api/v1/projects/[id]/regenerate/route.ts`

```
POST /api/v1/projects/:id/regenerate
body: { feedback: string, categories: string[] }
→ SSE 스트림으로 재생성 진행 상황 전달
```

**수정 파일:** `src/hooks/useGeneration.ts` — `regenerate(projectId, feedback)` 함수 추가

**완료 조건:**
- [ ] "피드백 반영하여 재생성" 클릭 시 SSE 스트림으로 재생성
- [ ] 재생성 결과가 새 버전으로 저장 (version +1)
- [ ] 일일 생성 횟수 제한에 재생성도 포함

---

### S8-3. 버전 히스토리 UI

**배경:** `generated_codes` 테이블에 `(project_id, version)` UNIQUE 제약 존재. `POST /api/v1/projects/:id/rollback` 엔드포인트 이미 구현됨.

**신규 파일:** `src/app/api/v1/projects/[id]/versions/route.ts`

```
GET /api/v1/projects/:id/versions
→ [{version, createdAt, aiModel, generationTimeMs, tokenUsage}]
```

**신규 파일:** `src/components/dashboard/VersionHistory.tsx`

버전 이력 표시:
- 버전별 생성일, AI 모델, 토큰 사용량, 생성 시간 표시
- [미리보기] [코드 보기] [Diff] [롤백] 버튼

**수정 파일:** `src/app/(main)/dashboard/[id]/page.tsx` — VersionHistory 컴포넌트 배치

**완료 조건:**
- [ ] 대시보드 상세에서 버전 이력 표시
- [ ] 각 버전의 메타데이터 표시
- [ ] "롤백" 클릭 시 해당 버전으로 전환

---

### S8-4. 버전 간 Diff 뷰어

**신규 파일:** `src/components/dashboard/CodeDiffViewer.tsx`

- 두 버전의 HTML/CSS/JS 좌우 분할 또는 인라인 diff
- 추가된 줄: 녹색 배경, 삭제된 줄: 빨간색 배경
- LCS(Longest Common Subsequence) 기반 간단한 diff 구현

**신규 파일:** `src/app/api/v1/projects/[id]/diff/route.ts`

```
GET /api/v1/projects/:id/diff?v1=1&v2=3
→ { html: {added: [...], removed: [...]}, css: {...}, js: {...} }
```

**완료 조건:**
- [ ] 두 버전 간 코드 차이 시각적 표시
- [ ] HTML/CSS/JS 각각 diff 확인 가능
- [ ] 추가/삭제 줄 색상 구분

---

### S8 테스트 계획

| 테스트 파일 | 예상 테스트 수 |
|------------|-------------|
| `generationService.test.ts` (추가) | 6개 |
| `codeRepository.test.ts` | 7개 |
| `diff.test.ts` | 6개 |
| `FeedbackPanel.test.ts` | 4개 |
| `feedback.test.ts` (통합) | 4개 |
| `regenerate.test.ts` (통합) | 4개 |
| `versions.test.ts` (통합) | 6개 |

테스트 커버리지 목표: 신규 코드 80% 이상, 신규 테스트 37개 이상 추가 (누적 134개 → 171개)

### S8 완료 조건 종합

- [ ] 피드백 수집 → 저장 → 재생성 파이프라인 동작
- [ ] 버전 이력 조회 및 롤백
- [ ] 버전 간 diff 비교
- [ ] 빌드 통과, 기존 기능 회귀 없음

---

## Sprint S9: AI 생태계 확장

> 기반 문서: `docs/20_확장성_분석_및_로드맵.md` F6, F10
> 선행 조건: S8 완료
> 예상 기간: 3~4주
> 목표: AI 프로바이더 확장 + 프롬프트 최적화 시스템 구축

### 진행 현황

| 태스크 | 목표 | 상태 |
|--------|------|------|
| S9-1 | AiProviderFactory 등록 기반 전환 | 대기 |
| S9-2 | OpenAI Provider 추가 | 대기 |
| S9-3 | Ollama Provider 추가 (로컬 폴백) | 대기 |
| S9-4 | 모델 선택 UI | 대기 |
| S9-5 | 프롬프트 템플릿 시스템 | 대기 |
| S9-6 | 쿼터 모니터링 | 대기 |

---

### S9-1. AiProviderFactory 등록 기반 전환

**수정 파일:** `src/providers/ai/AiProviderFactory.ts`

```typescript
class AiProviderFactory {
  private static registry = new Map<string, () => IAiProvider>();

  static register(type: string, creator: () => IAiProvider): void { ... }
  static create(type: string): IAiProvider { ... }
  static getAvailableProviders(): string[] { ... }
  static async getBestAvailable(): Promise<IAiProvider> { ... }
}

// 프로바이더 자동 등록 (파일 로드 시)
AiProviderFactory.register('grok', () => new GrokProvider(process.env.XAI_API_KEY!));
```

**완료 조건:**
- [ ] 기존 GrokProvider가 등록 기반으로 동작
- [ ] 기존 테스트 통과

---

### S9-2. OpenAI Provider 추가

**신규 파일:** `src/providers/ai/OpenAIProvider.ts`

- endpoint: `https://api.openai.com/v1`
- model: `gpt-4o-mini`
- 환경변수: `OPENAI_API_KEY`

**완료 조건:**
- [ ] `OPENAI_API_KEY` 설정 시 openai 프로바이더 자동 등록
- [ ] 코드 생성 결과가 GrokProvider와 동일한 포맷

---

### S9-3. Ollama Provider 추가 (로컬 폴백)

**신규 파일:** `src/providers/ai/OllamaProvider.ts`

- endpoint: `http://localhost:11434/api`
- model: `codellama:7b`
- 환경변수: `OLLAMA_BASE_URL` (선택, 기본값 `http://localhost:11434`)
- `enable_ollama_fallback` 피처 플래그 연동

**완료 조건:**
- [ ] `getBestAvailable()` 폴백 순서: grok → openai → ollama
- [ ] Ollama 미실행 시 `checkAvailability()` false 반환

---

### S9-4. 모델 선택 UI

**신규 파일:** `src/app/api/v1/ai/providers/route.ts`

```
GET /api/v1/ai/providers
→ [{ type, name, model, available }]
```

**신규 파일:** `src/components/builder/ModelSelector.tsx`

**수정 파일:** `src/stores/generationStore.ts` — `selectedProvider: string` 상태 추가

**수정 파일:** `src/app/api/v1/generate/route.ts` — `provider?: string` 파라미터 추가

**완료 조건:**
- [ ] 빌더에서 사용 가능한 AI 모델 목록 표시
- [ ] 모델 선택 후 해당 프로바이더로 코드 생성
- [ ] `generated_codes`에 `ai_provider`, `ai_model` 기록

---

### S9-5. 프롬프트 템플릿 시스템

**신규 파일:** `supabase/migrations/003_prompt_templates.sql`

```sql
CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  type VARCHAR(50) NOT NULL,         -- 'system' | 'user' | 'regeneration'
  language VARCHAR(10) NOT NULL DEFAULT 'ko',
  template TEXT NOT NULL,
  is_default BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**수정 파일:** `src/lib/ai/promptBuilder.ts`

```typescript
export async function buildSystemPrompt(language: string = 'ko'): Promise<string>
export function interpolatePrompt(template: string, vars: Record<string, string>): string
```

**신규 파일:** `src/app/api/v1/admin/prompts/route.ts` — 관리자용 CRUD API

**완료 조건:**
- [ ] 시스템 프롬프트가 DB에서 로드됨
- [ ] 5분 캐시로 DB 부하 최소화
- [ ] `enable_advanced_prompt = false` 시 기존 하드코딩 프롬프트 사용

---

### S9-6. 쿼터 모니터링

**수정 파일:** `src/services/generationService.ts`

- AI 프로바이더의 `checkAvailability()` 결과에서 `remainingQuota` 확인
- 남은 쿼터 20% 이하 시 `API_QUOTA_WARNING` 이벤트 발행

**수정 파일:** `src/app/(main)/dashboard/page.tsx` — 오늘 남은 생성 횟수 표시

**완료 조건:**
- [ ] `API_QUOTA_WARNING` 이벤트 발행 동작
- [ ] 대시보드에 일일 남은 생성 횟수 표시

---

### S9 테스트 계획

| 테스트 파일 | 예상 테스트 수 |
|------------|-------------|
| `AiProviderFactory.test.ts` (리팩터링) | 6개 |
| `OpenAIProvider.test.ts` | 7개 |
| `OllamaProvider.test.ts` | 5개 |
| `promptBuilder.test.ts` (추가) | 5개 |
| `generationService.test.ts` (추가) | 3개 |
| `ai-providers.test.ts` (통합) | 6개 |
| `admin-prompts.test.ts` (통합) | 4개 |

테스트 커버리지 목표: 신규 코드 85% 이상, 신규 테스트 36개 이상 추가 (누적 171개 → 207개)

### S9 완료 조건 종합

- [ ] 등록 기반 팩토리로 전환 완료
- [ ] 2개 이상 AI 프로바이더 동작 (Grok + OpenAI 또는 Ollama)
- [ ] 빌더에서 모델 선택 가능
- [ ] 프롬프트가 DB 기반으로 관리됨
- [ ] 쿼터 모니터링 동작
- [ ] 기존 테스트 통과 + 신규 프로바이더 테스트 추가

---

## Sprint S10: 다국어 지원 완성 · 멀티 프레임워크 코드 생성

> 기반 문서: `docs/20_확장성_분석_및_로드맵.md` F7, F11
> 선행 조건: S9 완료 (프롬프트 템플릿 시스템)
> 예상 기간: 3~4주
> 목표: 글로벌 사용자 대응 + 다양한 프레임워크 코드 출력 지원

### 진행 현황

| 태스크 | 목표 | 상태 |
|--------|------|------|
| S10-1 | i18n 인프라 완성 | 대기 |
| S10-2 | UI 텍스트 전체 i18n 키 전환 | 대기 |
| S10-3 | 프롬프트 다국어화 | 대기 |
| S10-4 | 프레임워크 선택 UI | 대기 |
| S10-5 | 프레임워크별 코드 파서/밸리데이터 | 대기 |

---

### S10-1. i18n 인프라 완성

**배경:** `src/lib/i18n/index.ts` 구조 존재, ko/en 로케일 파일 일부 작성됨. `enable_multi_language` 피처 플래그 존재 (현재 false).

**수정 파일:** `src/lib/i18n/locales/ko.json`, `en.json`

주요 네임스페이스: `common`, `header`, `builder`, `catalog`, `dashboard`, `legal`

**신규 파일:** `src/components/layout/LanguageSelector.tsx`

- Header 우측에 배치 (지구본 아이콘 + 드롭다운)
- 선택된 언어를 localStorage + `users.preferences`에 저장

**수정 파일:** `src/lib/i18n/index.ts`

```typescript
export function useTranslation() {
  const locale = useLocale();  // localStorage → users.preferences → 브라우저 언어
  return { t: (key: string) => getTranslation(locale, key), locale, setLocale };
}
```

**완료 조건:**
- [ ] ko/en 로케일 파일에 전체 UI 텍스트 포함
- [ ] 언어 전환 시 즉시 UI 반영 (새로고침 불필요)

---

### S10-2. UI 텍스트 전체 i18n 키 전환

수정 대상 파일 (하드코딩 한국어 텍스트 → i18n 키):

| 파일 | 주요 변경 |
|------|----------|
| `src/app/page.tsx` | 랜딩 히어로 텍스트, CTA |
| `src/components/layout/Header.tsx` | 네비게이션 라벨 |
| `src/components/layout/Footer.tsx` | 링크 텍스트 |
| `src/components/builder/StepIndicator.tsx` | 단계 라벨 |
| `src/components/builder/ContextInput.tsx` | 레이블, 플레이스홀더 |
| `src/components/builder/GuideQuestions.tsx` | 가이드 질문 텍스트 |
| `src/components/builder/TemplateSelector.tsx` | 템플릿 이름/설명 |
| `src/components/builder/GenerationProgress.tsx` | 진행 메시지 |
| `src/components/catalog/ApiSearchBar.tsx` | 검색 플레이스홀더 |
| `src/components/catalog/CategoryTabs.tsx` | 카테고리 라벨 |
| `src/components/dashboard/ProjectCard.tsx` | 상태 라벨, 버튼 |
| `src/components/dashboard/ProjectGrid.tsx` | 빈 상태 메시지 |
| `src/app/(main)/terms/page.tsx` 등 법적 페이지 | ko/en 분기 |
| `src/app/error.tsx`, `not-found.tsx` | 에러/404 메시지 |

**완료 조건:**
- [ ] 모든 사용자 노출 텍스트가 i18n 키 사용
- [ ] 영어 전환 시 전체 UI 영어 표시

---

### S10-3. 프롬프트 다국어화

**배경:** S9-5에서 프롬프트 템플릿 시스템 구축 완료. 언어별 프롬프트 분기 가능.

**수정 파일:** `src/lib/ai/promptBuilder.ts`

- `buildUserPrompt(apis, context, language)` — language 파라미터 추가

**수정 파일:** `src/services/generationService.ts`

- 사용자 프로필의 `preferences.language` 참조 후 프롬프트 빌더에 전달

**완료 조건:**
- [ ] 영어 사용자 → 영어 주석/라벨의 코드 생성
- [ ] 프롬프트 변경 시 DB 수정만으로 반영

---

### S10-4. 프레임워크 선택 UI

**배경:** `generated_codes.framework` 컬럼 존재 (현재 항상 'vanilla').

**신규 파일:** `src/components/builder/FrameworkSelector.tsx`

- `[HTML/CSS/JS]` / `[React]` / `[Next.js]` 3종 선택 UI

**수정 파일:** `src/stores/generationStore.ts`

- `selectedFramework: 'vanilla' | 'react' | 'next'` 상태 추가 (기본값: 'vanilla')

**수정 파일:** `src/app/api/v1/generate/route.ts` — `framework?: string` 파라미터 추가

**완료 조건:**
- [ ] 빌더에서 3종 프레임워크 선택 가능
- [ ] `generated_codes.framework`에 올바른 값 저장

---

### S10-5. 프레임워크별 코드 파서/밸리데이터

**수정 파일:** `src/lib/ai/codeParser.ts`

```typescript
export function parseGeneratedCode(response: string, framework: string) {
  switch(framework) {
    case 'vanilla': return parseVanillaCode(response);
    case 'react':   return parseReactCode(response);
    case 'next':    return parseNextCode(response);
  }
}
```

**수정 파일:** `src/lib/ai/codeValidator.ts` — 프레임워크별 보안/구문 검증 분기

**수정 파일:** `src/app/api/v1/preview/[projectId]/route.ts`

- vanilla: 기존 HTML 직접 서빙
- react/next: Babel standalone으로 브라우저 내 변환 후 렌더링

**완료 조건:**
- [ ] vanilla 프레임워크: 기존과 동일하게 동작
- [ ] react 프레임워크: JSX 코드 생성 + 미리보기
- [ ] next 프레임워크: App Router 구조 코드 생성
- [ ] 서브도메인 게시는 vanilla만 지원 (react/next는 다운로드)

---

### S10 테스트 계획

| 테스트 파일 | 예상 테스트 수 |
|------------|-------------|
| `i18n.test.ts` | 10개 |
| `locale-completeness.test.ts` | 4개 |
| `promptBuilder.test.ts` (추가) | 4개 |
| `codeParser.test.ts` (추가) | 8개 |
| `codeValidator.test.ts` (추가) | 6개 |
| `i18n.test.ts` (통합) | 3개 |
| `generate-framework.test.ts` (통합) | 5개 |

테스트 커버리지 목표: 신규 코드 80% 이상, 신규 테스트 40개 이상 추가 (누적 207개 → 247개)

### S10 완료 조건 종합

- [ ] 한국어/영어 UI 전환 정상 동작
- [ ] 언어별 AI 프롬프트 분기
- [ ] 3종 프레임워크 코드 생성 및 미리보기
- [ ] 빌드 통과, 기존 기능 회귀 없음

---

## Sprint S11: 팀/조직 기능 · 분석 대시보드

> 기반 문서: `docs/20_확장성_분석_및_로드맵.md` F12, F13
> 선행 조건: S10 완료
> 예상 기간: 4~5주
> 목표: 멀티 테넌시 활성화 + 데이터 기반 서비스 운영

### 진행 현황

| 태스크 | 목표 | 상태 |
|--------|------|------|
| S11-1 | 조직 CRUD + 멤버 관리 | 대기 |
| S11-2 | 조직 프로젝트 공유 | 대기 |
| S11-3 | 역할 기반 접근 제어 | 대기 |
| S11-4 | 분석 데이터 집계 API | 대기 |
| S11-5 | 분석 대시보드 UI | 대기 |

---

### S11-1. 조직 CRUD + 멤버 관리

**배경:** `organizations`, `memberships` 테이블 + RLS 정책 이미 구현 완료. `organizationRepository.ts` 기본 CRUD 존재. `enable_team_features` 피처 플래그 존재 (현재 false).

**신규 파일:** `src/app/api/v1/organizations/route.ts`

```
POST /api/v1/organizations — 조직 생성 + 생성자 owner 추가
GET  /api/v1/organizations — 내가 속한 조직 목록
```

**신규 파일:** `src/app/api/v1/organizations/[orgId]/route.ts`

```
GET    → 조직 상세
PATCH  → 조직 정보 수정 (admin/owner)
DELETE → 조직 삭제 (owner only)
```

**신규 파일:** `src/app/api/v1/organizations/[orgId]/members/route.ts`

```
GET    → 멤버 목록
POST   → 멤버 초대 (body: { email, role })
DELETE → 멤버 제거
PATCH  → 역할 변경
```

**신규 파일:** `src/services/organizationService.ts`

**신규 파일:** `src/app/(main)/org/page.tsx`, `org/[slug]/page.tsx`, `org/[slug]/settings/page.tsx`

```sql
UPDATE feature_flags SET enabled = true WHERE flag_name = 'enable_team_features';
```

**완료 조건:**
- [ ] 조직 생성/수정/삭제 동작
- [ ] 멤버 초대/제거/역할 변경 동작
- [ ] RLS 정책으로 비멤버 접근 차단

---

### S11-2. 조직 프로젝트 공유

**배경:** `projects.organization_id` 컬럼 존재 (nullable FK → organizations).

**수정 파일:** `src/app/(main)/builder/page.tsx` — 조직 소속 시 "개인/조직 프로젝트" 선택 드롭다운

**수정 파일:** `src/app/api/v1/projects/route.ts` — `organizationId?: string` 추가

**수정 파일:** `src/repositories/projectRepository.ts` — `findByOrganizationId()` 추가

**수정 파일:** `src/app/(main)/dashboard/page.tsx` — 개인/조직 프로젝트 탭 필터

**완료 조건:**
- [ ] 조직 프로젝트 생성 시 `organization_id` 저장
- [ ] 조직 멤버 전원이 해당 프로젝트 조회 가능

---

### S11-3. 역할 기반 접근 제어

역할별 권한 매트릭스:

| 동작 | owner | admin | member | viewer |
|------|-------|-------|--------|--------|
| 조직 설정 변경 | 가능 | 가능 | 불가 | 불가 |
| 멤버 관리 | 가능 | 가능 | 불가 | 불가 |
| 프로젝트 생성 | 가능 | 가능 | 가능 | 불가 |
| 프로젝트 수정/삭제 | 가능 | 가능 | 본인만 | 불가 |
| 프로젝트 조회 | 가능 | 가능 | 가능 | 가능 |
| 코드 생성 | 가능 | 가능 | 가능 | 불가 |
| 게시/게시취소 | 가능 | 가능 | 본인만 | 불가 |

**수정 파일:** `src/services/organizationService.ts` — `checkPermission(userId, orgId, action)` 추가

**완료 조건:**
- [ ] viewer는 프로젝트 생성/수정 불가
- [ ] 권한 부족 시 403 에러 반환

---

### S11-4. 분석 데이터 집계 API

**배경:** `event_log`, `generated_codes`, `projects`, `project_apis` 테이블에 데이터 축적 중.

**신규 파일:** `src/app/api/v1/analytics/route.ts`

```
GET /api/v1/analytics?period=7d
→ { generation: {...}, tokens: {...}, projects: {...}, apis: {...} }
```

**신규 파일:** `src/services/analyticsService.ts`

- `getOverview(userId, period)` — 개인 통계
- `getOrgOverview(orgId, period)` — 조직 통계
- `getSystemOverview(period)` — 시스템 전체 (관리자)

**완료 조건:**
- [ ] 기간별 분석 데이터 API 동작
- [ ] 개인/조직/시스템 단위 집계 가능

---

### S11-5. 분석 대시보드 UI

**신규 파일:** `src/app/(main)/analytics/page.tsx`

표시 내용:
- 기간 선택 (7일 / 30일 / 90일)
- 요약 카드: 총 생성, 성공률, 평균 시간
- 일별 생성 추이 바 차트 (CSS 기반)
- 인기 API Top 5
- AI 모델 사용 분포
- 토큰 사용량 합계

**완료 조건:**
- [ ] 분석 페이지에서 기간별 통계 표시
- [ ] 일별 생성 추이 바 차트

---

### S11 테스트 계획

| 테스트 파일 | 예상 테스트 수 |
|------------|-------------|
| `organizationService.test.ts` | 16개 |
| `analyticsService.test.ts` | 9개 |
| `projectService.test.ts` (추가) | 4개 |
| `organizations.test.ts` (통합) | 9개 |
| `members.test.ts` (통합) | 7개 |
| `analytics.test.ts` (통합) | 5개 |

테스트 커버리지 목표: 신규 코드 85% 이상, 신규 테스트 50개 이상 추가 (누적 247개 → 297개)

### S11 완료 조건 종합

- [ ] 조직 생성/관리/멤버 초대 동작
- [ ] 조직 프로젝트 공유 + 역할별 접근 제어
- [ ] 분석 대시보드에서 주요 지표 확인
- [ ] 빌드 통과, 기존 기능 회귀 없음

---

## Sprint S12: 플랫폼 고도화

> 기반 문서: `docs/20_확장성_분석_및_로드맵.md` F15, F17, F18
> 선행 조건: S11 완료
> 예상 기간: 5~6주
> 목표: 프로 사용자 대응 기능 + 모바일 접근성 + 독립 브랜딩 지원

### 진행 현황

| 태스크 | 목표 | 상태 |
|--------|------|------|
| S12-1 | 비주얼 코드 에디터 | 대기 |
| S12-2 | PWA 지원 | 대기 |
| S12-3 | 사용자 정의 도메인 | 대기 |

---

### S12-1. 비주얼 코드 에디터

**배경:** S7-2에서 읽기 전용 코드 뷰어 구현. 편집 가능한 에디터로 확장.

**패키지 추가:** `pnpm add @monaco-editor/react`

**신규 파일:** `src/components/editor/CodeEditor.tsx`

기능:
- HTML/CSS/JS 탭 전환 (Monaco Editor 인스턴스)
- 실시간 미리보기 (debounce 500ms → iframe srcDoc 업데이트)
- 자동 완성, 구문 에러 표시, Emmet 지원 (선택적)
- [저장 (새 버전)] / [되돌리기] / [다운로드] 버튼

**신규 파일:** `src/app/api/v1/projects/[id]/code/route.ts`

```
PUT /api/v1/projects/:id/code
body: { html, css, js }
→ 새 version으로 generated_codes에 저장
→ ai_provider: 'manual_edit', ai_model: null
```

**신규 파일:** `src/app/(main)/editor/[id]/page.tsx` — 전체 화면 에디터 레이아웃

**수정 파일:** `src/components/dashboard/ProjectCard.tsx` — "코드 편집" 버튼 추가

**완료 조건:**
- [ ] Monaco Editor에서 HTML/CSS/JS 편집
- [ ] 실시간 미리보기 연동
- [ ] 저장 시 새 버전으로 기록
- [ ] 수정 후 게시 반영 (서브도메인 재방문 시 최신 코드)

---

### S12-2. PWA 지원

**신규 파일:** `public/manifest.json`

```json
{
  "name": "CustomWebService",
  "short_name": "CWS",
  "start_url": "/dashboard",
  "display": "standalone",
  "theme_color": "#2563eb",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192" },
    { "src": "/icon-512.png", "sizes": "512x512" }
  ]
}
```

**신규 파일:** `public/sw.js`

캐시 전략:
- 정적 자산: Cache First
- API 응답: Network First + 오프라인 폴백
- HTML 페이지: Stale While Revalidate

**신규 파일:** `src/lib/pwa/registerSW.ts`

**수정 파일:** `src/app/layout.tsx` — manifest 링크 + theme-color 메타 추가

**완료 조건:**
- [ ] Chrome "설치" 버튼 표시 (PWA 감지)
- [ ] 설치 후 독립 앱으로 실행
- [ ] 오프라인 시 캐시된 대시보드 표시
- [ ] Lighthouse PWA 점수 90+

---

### S12-3. 사용자 정의 도메인

**신규 파일:** `supabase/migrations/004_custom_domains.sql`

```sql
CREATE TABLE IF NOT EXISTS custom_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  domain VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, verifying, active, failed
  verification_token TEXT,
  verified_at TIMESTAMPTZ,
  ssl_status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**신규 파일:** `src/app/api/v1/projects/[id]/domains/route.ts`

```
POST → 도메인 등록 + verification_token 생성
GET  → 등록된 도메인 목록 + 상태
DELETE → 도메인 제거
```

**신규 파일:** `src/app/api/v1/projects/[id]/domains/verify/route.ts` — DNS 확인 후 활성화

**수정 파일:** `src/middleware.ts`

```typescript
// 확장: custom_domains 테이블에서 커스텀 도메인 조회
//       → 매칭되면 해당 프로젝트의 /site/[slug]로 rewrite
// 성능: 도메인 조회 결과 캐싱 (5분 TTL)
```

**신규 파일:** `src/services/domainService.ts`

- `addDomain(projectId, domain)`, `verifyDomain(domainId)`, `removeDomain(domainId)`, `findByDomain(domain)`

**수정 파일:** `src/app/(main)/dashboard/[id]/page.tsx` — 커스텀 도메인 설정 UI 추가

**완료 조건:**
- [ ] 커스텀 도메인 등록 + DNS 설정 가이드 표시
- [ ] DNS 확인 후 도메인 활성화
- [ ] 커스텀 도메인 접근 시 프로젝트 HTML 서빙
- [ ] 도메인 제거 시 즉시 비활성화

---

### S12 테스트 계획

| 테스트 파일 | 예상 테스트 수 |
|------------|-------------|
| `domainService.test.ts` | 13개 |
| `registerSW.test.ts` | 3개 |
| `codeRepository.test.ts` (추가) | 3개 |
| `domainValidator.test.ts` | 7개 |
| `code-edit.test.ts` (통합) | 7개 |
| `domains.test.ts` (통합) | 9개 |
| `pwa.test.ts` (통합) | 4개 |

테스트 커버리지 목표: 신규 코드 80% 이상, 신규 테스트 46개 이상 추가 (누적 297개 → 343개)

### S12 완료 조건 종합

- [ ] Monaco Editor 기반 코드 편집 + 실시간 미리보기
- [ ] PWA 설치 + 오프라인 대시보드 접근
- [ ] 커스텀 도메인 연결 + DNS 검증
- [ ] 빌드 통과, 기존 기능 회귀 없음
