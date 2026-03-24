# CustomWebService — 서브도메인 가상 호스팅 Sprint 계획

> 기반 문서: `docs/virtual-hosting-plan.md`
> 작성일: 2026-03-25 | 최종 업데이트: 2026-03-25
> 목표: Railway per-project 배포 → 단일 인스턴스 서브도메인 서빙으로 전환

---

## 진행 현황

| Sprint | 목표 | 상태 | 커밋 |
|--------|------|------|------|
| S0 | 기존 버그 수정 | ✅ 완료 | `1a88e81` |
| S1 | DB 마이그레이션 + Slug 인프라 | ✅ 완료 | `64177ab` + DB 직접 실행 |
| S2 | 서브도메인 라우팅 + 사이트 서빙 | ✅ 완료 | `842ef50` |
| S3 | 게시 API 구현 | ✅ 완료 | `95a16f5` |
| S4 | 대시보드 UI 업데이트 | ✅ 완료 | `67dc6dc` |
| S5 | 인프라 설정 (DNS/Railway/Supabase) | ⏳ 진행 중 | 수동 작업 필요 |
| S6 | 기존 Railway 배포 방식 정리 | ⏳ 대기 | S5 완료 후 |

---

## Sprint 0 — 기존 버그 수정

> 서브도메인 기능과 무관하게 즉시 수정이 필요한 긴급 버그들.
> 이 Sprint는 독립적으로 배포 가능.

### S0-1. X-Frame-Options 충돌 수정 ✅ 우선순위: 긴급

**문제:** `middleware.ts`가 모든 요청에 `X-Frame-Options: DENY`를 적용해
미리보기 iframe(`/api/v1/preview/[projectId]`)이 동작하지 않음.

**수정 파일:** `src/middleware.ts`

현재 코드 (8번째 줄):
```typescript
response.headers.set('X-Frame-Options', 'DENY');
```

수정 방향:
- `/api/v1/preview/` 경로는 `SAMEORIGIN` 적용
- 나머지는 `DENY` 유지
- 추후 S2에서 `/site/[slug]` 추가 시 `DENY` 유지 (서브도메인이 별개 origin이므로)

---

### S0-2. 미리보기 API CSP 헤더 추가 ✅ 우선순위: 높음

**문제:** `preview/[projectId]/route.ts`에서 생성된 HTML 서빙 시 CSP 없음.
XSS 위험 + 외부 리소스 로딩 불가 문제 존재.

**수정 파일:** `src/app/api/v1/preview/[projectId]/route.ts`

현재 응답 헤더 (47~53번째 줄):
```typescript
return new Response(fullHtml, {
  headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Frame-Options': 'SAMEORIGIN',
    'Cache-Control': 'no-cache',
  },
});
```

추가할 헤더:
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

### S0-3. contextStore localStorage 누수 수정 ✅ 우선순위: 중간

**문제:** 서비스 생성 완료 후 `contextStore`에 이전 context/selectedTemplate이
localStorage에 잔류해 다음 생성 시 오염 가능.

**수정 파일:** `src/stores/contextStore.ts`

확인 후 reset 액션 추가, `useGeneration` 훅의 완료 이벤트에서 호출.

**관련 파일:** `src/hooks/useGeneration.ts`

---

**S0 완료 조건:**
- [x] 미리보기 iframe이 대시보드에서 정상 표시됨
- [x] 빌드 에러 없음
- [x] 기존 기능 회귀 없음 (로그인, 생성, 미리보기)

> ✅ **S0 완료** — 커밋 `1a88e81` (2026-03-25)

---

## Sprint 1 — DB 마이그레이션 + Slug 인프라

> 서브도메인 서빙의 핵심 기반. S2 이전에 반드시 완료.

### S1-1. DB 마이그레이션 실행

**위치:** Supabase SQL Editor

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

**완료 확인:** Supabase Table Editor에서 `projects` 테이블에 `slug`, `published_at` 컬럼 존재 확인.

---

### S1-2. Project 타입 확장

**수정 파일:** `src/types/project.ts`

현재 `ProjectStatus` (3~9번째 줄):
```typescript
export type ProjectStatus =
  | 'draft'
  | 'generating'
  | 'generated'
  | 'deploying'
  | 'deployed'
  | 'failed';
```

변경 후:
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

현재 `Project` 인터페이스 (11~27번째 줄)에 필드 추가:
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

현재 메서드 목록: `findByUserId`, `countTodayGenerations`, `insertProjectApis`, `getProjectApiIds`

추가할 메서드:
```typescript
async findBySlug(slug: string): Promise<Project | null>
async updateSlug(id: string, slug: string, publishedAt: Date): Promise<Project>
```

`toDomain()` (58~76번째 줄)에 신규 필드 매핑 추가:
```typescript
slug: (row.slug as string) ?? null,
publishedAt: (row.published_at as string) ?? null,
```

---

### S1-5. ProjectService — publish() / unpublish() 추가

**수정 파일:** `src/services/projectService.ts`

추가할 메서드:
```typescript
async publish(id: string, userId: string): Promise<Project>
  // 1. getById()로 소유자 확인
  // 2. project.status가 'generated' | 'deployed'인지 확인
  // 3. slug 없으면 generateSlug(project.name, project.id) 생성
  // 4. DB에 slug, published_at, status='published' 업데이트
  // 5. PROJECT_PUBLISHED 이벤트 emit

async unpublish(id: string, userId: string): Promise<Project>
  // 1. getById()로 소유자 확인
  // 2. status='unpublished', published_at=null 업데이트
  // 3. slug는 유지 (링크 재게시 시 재사용)
```

---

**S1 완료 조건:**
- [x] `projects` 테이블에 `slug`, `published_at` 컬럼 존재
- [x] `generateSlug('날씨 앱', 'abc-123-def')` → `[a-z0-9-]+` 형태 반환
- [x] `findBySlug('test-slug')` 정상 동작
- [x] TypeScript 컴파일 에러 없음

> ✅ **S1 완료** — 커밋 `64177ab` + DB 마이그레이션 완료 (2026-03-25)

---

## Sprint 2 — 서브도메인 라우팅 + 사이트 서빙

> 핵심 기능. S1 완료 후 진행.

### S2-1. 환경변수 추가

**수정 파일:** `.env.local`

추가:
```bash
NEXT_PUBLIC_ROOT_DOMAIN=localhost:3000
# 운영 환경 Railway 변수: NEXT_PUBLIC_ROOT_DOMAIN=customwebservice.app
```

---

### S2-2. 미들웨어 서브도메인 감지 추가

**수정 파일:** `src/middleware.ts`

현재 미들웨어는 단순히 `updateSession` + 보안 헤더만 적용 (24줄).

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

구현 시 주의사항:
- `NEXT_PUBLIC_ROOT_DOMAIN` 미설정 시 서브도메인 감지 비활성화 (로컬 개발 호환)
- `localhost`는 서브도메인 테스트 없이 `/site/[slug]` 직접 접근으로 테스트

---

### S2-3. 사이트 서빙 Route Handler 생성

**신규 파일:** `src/app/site/[slug]/route.ts`

처리 흐름:
```
GET /site/[slug]

1. params.slug 유효성 검사
   - SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/
   - 실패 → 400 응답

2. 예약어 확인 (RESERVED_SLUGS)
   - 해당 → 404 사이트 없음 페이지

3. Supabase에서 findBySlug(slug) 조회
   - 없음 → 404 사이트 없음 페이지

4. project.status 확인
   - 'published' 아님 → 준비 중 페이지 (10초 자동 새로고침)

5. CodeRepository.findByProject(projectId) 조회
   - 코드 없음 → 준비 중 페이지

6. assembleHtml()로 완성 HTML 조합

7. 응답 헤더 설정 후 반환:
   - Content-Type: text/html; charset=utf-8
   - Cache-Control: public, s-maxage=60, stale-while-revalidate=300
   - Content-Security-Policy: (7-2 보안 설계 참조)
   - X-Robots-Tag: index, follow
   - X-Content-Type-Options: nosniff
```

**의존:** `CodeRepository` (기존), `ProjectRepository.findBySlug()` (S1-4)

---

### S2-4. 404/준비 중 HTML 템플릿

**신규 파일:** `src/lib/templates/siteError.ts`

export 함수:
```typescript
export function notFoundHtml(slug: string): string
export function preparingHtml(slug: string): string
```

---

### S2-5. Next.js 설정 — 와일드카드 도메인 허용

**수정 파일:** `next.config.ts` (또는 `next.config.js`)

```typescript
// 이미지 도메인 및 서브도메인 허용 설정 확인
```

---

**S2 완료 조건:**
- [x] `http://localhost:3000/site/[존재하는slug]` → 생성된 HTML 반환
- [x] `http://localhost:3000/site/없는슬러그` → 404 HTML 반환
- [x] `http://localhost:3000/site/!!invalid!!` → 400 반환
- [x] 응답에 Cache-Control 헤더 포함
- [x] 로그인 없이 접근 가능 (인증 불필요)

> ✅ **S2 완료** — 커밋 `842ef50` (2026-03-25)

---

## Sprint 3 — 게시 API 구현

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
  → slug 유효성 검사
  → 중복 확인 (findBySlug)
  → 업데이트
```

> 초기 구현에서는 생략 가능. 자동 생성 slug만으로 충분.

---

**S3 완료 조건:**
- [x] `POST /api/v1/projects/[id]/publish` → 200, project.status === 'published'
- [x] `DELETE /api/v1/projects/[id]/publish` → 200, project.status === 'unpublished'
- [x] 타인의 프로젝트 게시 시도 → 403
- [x] 미생성(draft) 프로젝트 게시 시도 → 400

> ✅ **S3 완료** — 커밋 `95a16f5` (2026-03-25)

---

## Sprint 4 — 대시보드 UI 업데이트

> S1, S3 완료 후 진행.

### S4-1. ProjectCard — slug URL + 게시 버튼

**수정 파일:** `src/components/dashboard/ProjectCard.tsx`

현재 구조 (37~101번째 줄):
- 상태 뱃지 + context 텍스트
- `deployUrl` 표시 (있으면)
- 상세보기 / 미리보기 / 삭제 버튼

변경 사항:
1. `statusConfig`에 `published`, `unpublished` 항목 추가
2. `project.slug` 있으면 slug URL 표시 + 클립보드 복사 버튼
3. 게시 가능 조건 (`generated` | `deployed`)에 게시 버튼 추가
4. `published` 상태에 게시 취소 버튼 추가

```typescript
// 추가할 props
interface ProjectCardProps {
  project: Project;
  onDelete?: (id: string) => void;
  onPublish?: (id: string) => void;   // 신규
  onUnpublish?: (id: string) => void; // 신규
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

내부에서 `/api/v1/projects/[id]/publish` POST/DELETE 호출.

---

### S4-3. 대시보드 페이지 — usePublish 연결

**수정 파일:** `src/app/(main)/dashboard/page.tsx`

`usePublish` 훅 연결 후 `ProjectCard`의 `onPublish`, `onUnpublish` 콜백에 전달.
게시/게시취소 후 프로젝트 목록 갱신.

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

> ✅ **S4 완료** — 커밋 `67dc6dc` (2026-03-25)

---

## Sprint 5 — 인프라 설정

> 운영 배포 직전. S2, S3 완료 후 진행.
> **주의: 이 Sprint는 실제 DNS/외부 서비스 변경을 포함하므로 준비 후 신중하게 진행.**

### S5-1. DNS 설정 (Cloudflare 기준)

Cloudflare DNS 패널에서 추가:

| 타입 | 이름 | 값 | 프록시 |
|------|------|----|--------|
| CNAME | `customwebservice.app` | `customwebservice-production.up.railway.app` | 활성화 |
| CNAME | `*.customwebservice.app` | `customwebservice-production.up.railway.app` | 활성화 |

> Cloudflare 프록시 활성화 시: SSL 자동 처리 + DDoS 보호 + 엣지 캐싱.

---

### S5-2. Railway 커스텀 도메인 등록

Railway 대시보드 → 서비스 → Settings → Networking → Custom Domains:

```
customwebservice.app
*.customwebservice.app
```

SSL 인증서 발급 완료 확인 (보통 수 분 소요).

---

### S5-3. Railway 환경변수 추가

Railway 대시보드 → 서비스 → Variables:

```
NEXT_PUBLIC_ROOT_DOMAIN=customwebservice.app
```

추가 후 재배포 트리거.

---

### S5-4. Supabase Redirect URLs 업데이트

Supabase Dashboard → Authentication → URL Configuration:

```
Site URL:
  https://customwebservice.app

Additional Redirect URLs:
  https://customwebservice.app/callback
  https://customwebservice-production.up.railway.app/callback
  http://localhost:3000/callback
  http://localhost:8080/callback
```

---

**S5 완료 조건:**
- [ ] `https://customwebservice.app` 접근 정상
- [ ] `https://[slug].customwebservice.app` → 게시된 HTML 표시
- [ ] 없는 slug → 404 페이지 표시
- [ ] OAuth 로그인 후 대시보드 리다이렉트 정상
- [ ] HTTPS 인증서 유효 (잠금 아이콘 확인)

---

## Sprint 6 — 기존 Railway 배포 방식 정리

> S5 완료 후, 서브도메인 서빙이 안정적으로 동작 확인 후 진행.
> **기존 사용자 영향 최소화를 위해 마지막에 진행.**

### S6-1. deploy API 라우트 — Railway 호출 제거

**수정 파일:** `src/app/api/v1/deploy/route.ts`

현재: GitHub 저장소 생성 + Railway 서비스 생성 + polling
변경: `/api/v1/projects/[id]/publish`로 리다이렉트하거나 deprecated 처리

---

### S6-2. DeployService — Railway 의존성 제거

**수정 파일:** `src/services/deployService.ts`

Railway/GitHub 관련 로직 제거 또는 비활성화.
`deployStore.ts`의 deploy 상태 관련 로직 정리.

---

### S6-3. useDeploy 훅 → usePublish로 대체

**수정 파일:** `src/hooks/useDeploy.ts`
→ S4-2에서 생성한 `usePublish`로 교체

builder 페이지에서 "배포" 버튼 → "게시" 버튼으로 텍스트 변경:
**수정 파일:** `src/app/(main)/builder/page.tsx`

---

### S6-4. 기존 deployed 프로젝트 데이터 마이그레이션

```sql
-- deploy_url을 가진 기존 프로젝트에 slug 부여 및 published 상태 전환
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

> 삭제 전 반드시 import 참조 확인 (grep 사용).

---

**S6 완료 조건:**
- [ ] "게시" 버튼 클릭 시 Railway 호출 없이 즉시 URL 생성
- [ ] 기존 `deployed` 프로젝트가 서브도메인으로 접근 가능
- [ ] `deploy` 관련 API/서비스/훅 미사용 코드 제거
- [ ] 빌드/테스트 통과

---

## 전체 의존성 그래프

```
S0 (버그수정)
  │ 독립적으로 배포 가능
  │
S1 (DB + Slug 인프라)
  │
  ├─── S2 (서브도메인 라우팅)
  │         │
  │    S3 (게시 API) ──── S4 (대시보드 UI)
  │         │
  │    S5 (인프라 설정)
  │         │
  └─────────── S6 (Railway 정리)
```

---

## 각 Sprint별 테스트 체크리스트

### S0 테스트
```bash
# 미리보기 iframe 동작 확인
# 브라우저에서 /dashboard/[id] 접근 후 미리보기 클릭
# DevTools > Console에서 X-Frame-Options 에러 없음 확인
```

### S1 테스트
```bash
# slugify 단위 테스트
npx jest slugify
```

### S2 테스트
```bash
# /site/[slug] 직접 접근 테스트
curl http://localhost:3000/site/test-slug-abc
curl http://localhost:3000/site/!!invalid  # 400 확인
curl http://localhost:3000/site/없는슬러그  # 404 HTML 확인
```

### S3 테스트
```bash
# 게시 API 테스트
curl -X POST http://localhost:3000/api/v1/projects/[id]/publish \
  -H "Cookie: ..." # 인증 쿠키 포함
```

### S5 테스트
```bash
# DNS 전파 확인
nslookup test.customwebservice.app
# SSL 확인
curl -I https://customwebservice.app
curl -I https://[slug].customwebservice.app
```

---

## 리스크 관리

| 리스크 | Sprint | 완화 방법 |
|--------|--------|-----------|
| Cloudflare 와일드카드 SSL 지연 | S5 | 도메인 설정 후 최대 24시간 대기 예상 |
| Slug 충돌 | S1 | UNIQUE 제약 + 서비스 레이어 재시도 로직 |
| 기존 사용자 Railway URL 무효화 | S6 | S5 안정화 후 진행 + 마이그레이션 SQL |
| 미들웨어 서브도메인 감지 오탐 | S2 | NEXT_PUBLIC_ROOT_DOMAIN 정확히 설정, 로컬 개발시 미동작 |

---

## 파일별 변경 요약

### 신규 생성
```
src/app/site/[slug]/route.ts
src/app/api/v1/projects/[id]/publish/route.ts
src/lib/utils/slugify.ts
src/lib/templates/siteError.ts
src/hooks/usePublish.ts
```

### 수정
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

### 삭제 예정 (S6)
```
src/lib/deploy/githubService.ts
src/lib/deploy/railwayService.ts
src/providers/deploy/RailwayDeployer.ts
src/providers/deploy/GithubPagesDeployer.ts
src/providers/deploy/DeployProviderFactory.ts
src/hooks/useDeploy.ts
src/services/deployService.ts (부분 또는 전체)
```
