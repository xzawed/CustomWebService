# 서브도메인 라우팅

> **파일:** `src/middleware.ts`  
> **패턴:** Host 헤더 감지 → `/site/[slug]` rewrite

---

# CustomWebService — 가상 호스팅(서브도메인) 도입 기획 및 기술 검토

> 작성일: 2026-03-25
> 범위: 서브도메인 가상 호스팅 도입 + 기존 코드 개선사항

---

## 목차

1. [현황 분석 및 문제 정의](#1-현황-분석-및-문제-정의)
2. [아키텍처 비교](#2-아키텍처-비교)
3. [기존 코드 개선 필요 사항](#3-기존-코드-개선-필요-사항)
4. [가상 호스팅 상세 설계](#4-가상-호스팅-상세-설계)
5. [데이터베이스 변경](#5-데이터베이스-변경)
6. [인프라 설정](#6-인프라-설정)
7. [보안 설계](#7-보안-설계)
8. [구현 단계별 계획](#8-구현-단계별-계획)
9. [테스트 전략](#9-테스트-전략)
10. [리스크 및 완화 방안](#10-리스크-및-완화-방안)

---

## 1. 현황 분석 및 문제 정의

### 1-1. 현재 배포 흐름

```
사용자가 "배포" 클릭
        ↓
POST /api/v1/deploy
        ↓
GitHub 저장소 생성 (새 repo)
        ↓
코드 푸시 (index.html, styles.css, script.js)
        ↓
Railway 새 프로젝트 생성
        ↓
Railway 서비스 생성 (GitHub 연동)
        ↓
배포 완료 대기 polling (최대 150초, 5초 × 30회)
        ↓
URL: https://[random].up.railway.app
```

### 1-2. 확인된 문제점

| # | 문제 | 심각도 | 영향 |
|---|------|--------|------|
| 1 | 프로젝트당 Railway 서비스 1개 생성 → 비용 폭증 | 🔴 치명적 | 사용자 증가 시 비례 과금 |
| 2 | 배포 시간 2~5분 (UX 매우 나쁨) | 🔴 치명적 | 이탈률 증가 |
| 3 | `0.0.0.0:8080`으로 OAuth 콜백 리다이렉트 | 🔴 치명적 | 로그인 불가 |
| 4 | `RailwayDeployer.projectMap`이 인메모리 | 🔴 치명적 | 서버 재시작/수평확장 시 데이터 소실 |
| 5 | `X-Frame-Options: DENY` vs 미리보기 iframe 충돌 | 🟠 높음 | 미리보기 기능 동작 불가 |
| 6 | URL이 `xxx.up.railway.app` 형태 — 브랜드 없음 | 🟠 높음 | 신뢰도 저하 |
| 7 | projects 테이블에 `slug` 컬럼 없음 | 🟠 높음 | 사람이 읽을 수 있는 URL 불가 |
| 8 | `NEXT_PUBLIC_ROOT_DOMAIN` 환경변수 없음 | 🟡 중간 | 서브도메인 라우팅 설정 불가 |
| 9 | 애플리케이션 레벨 레이트 리미팅만 존재 | 🟡 중간 | 미들웨어 레벨 보호 없음 |
| 10 | `contextStore` localStorage 정리 로직 없음 | 🟡 중간 | 스토어 상태 오염 가능 |

### 1-3. 사용자 경험 목표

**현재:**
> "배포" 클릭 → 2~5분 대기 → `https://a1b2c3d4.up.railway.app`

**목표:**
> "게시" 클릭 → 즉시 완료 → `https://my-weather-app.customwebservice.app`

---

## 2. 아키텍처 비교

### 2-1. 현재 아키텍처 (per-project Railway deployment)

```
[사용자]
    │
    ▼
[메인 앱 - Railway 인스턴스]
    │ 생성
    ▼
[GitHub 저장소 #1] ──── [Railway 서비스 #1] ──── xxx1.railway.app
[GitHub 저장소 #2] ──── [Railway 서비스 #2] ──── xxx2.railway.app
[GitHub 저장소 #N] ──── [Railway 서비스 #N] ──── xxxN.railway.app
```

**비용 구조:**
- Railway 서비스 1개당 최소 $5/월
- 사용자 100명 × 평균 3개 프로젝트 = 300개 서비스 = **$1,500/월**

### 2-2. 목표 아키텍처 (subdomain serving)

```
[사용자]
    │
    ▼
*.customwebservice.app  (와일드카드 DNS)
    │
    ▼
[메인 앱 - Railway 인스턴스 단 1개]
    │
    ├── customwebservice.app          → 랜딩/대시보드
    ├── abc123.customwebservice.app   → 프로젝트 A HTML 서빙
    ├── def456.customwebservice.app   → 프로젝트 B HTML 서빙
    └── xyz789.customwebservice.app   → 프로젝트 C HTML 서빙
                │
                ▼
          [Supabase DB]
          generated_codes 테이블
```

**비용 구조:**
- Railway 서비스 **1개** 고정 = **$5/월**
- 사용자 수와 무관하게 고정 비용

### 2-3. 요청 흐름 (목표)

```
브라우저: GET https://abc123.customwebservice.app/

1. DNS: *.customwebservice.app → Railway 앱 IP (CNAME)
2. Railway: 요청을 메인 Next.js 앱으로 전달
3. Next.js Middleware:
   - Host 헤더 파싱 → 서브도메인 "abc123" 추출
   - /site/abc123 으로 내부 rewrite
4. /site/[slug]/route.ts:
   - Supabase에서 slug="abc123" 프로젝트 조회
   - generated_codes에서 HTML 조회
   - 응답 반환 (Cache-Control 포함)
5. 브라우저: HTML 렌더링
```

---

## 3. 기존 코드 개선 필요 사항

코드 감사 결과 서브도메인 기능과 별개로 수정이 필요한 항목들입니다.

### 3-1. [긴급] OAuth 콜백 Origin 문제

**파일:** `src/app/(auth)/callback/route.ts`

**문제:**
```typescript
// 현재: request.url에서 origin 추출 → 0.0.0.0:8080이 될 수 있음
const { searchParams, origin } = new URL(request.url);
return NextResponse.redirect(`${origin}${next}`);
```

**수정 (이미 적용됨):**
```typescript
const { searchParams, origin: requestOrigin } = new URL(request.url);
const origin = process.env.NEXT_PUBLIC_APP_URL ?? requestOrigin;
```

**추가 조치:** `.env.local` / Railway 환경변수에서 `NEXT_PUBLIC_APP_URL`이 정확한 도메인으로 설정되어 있는지 확인 필수.

---

### 3-2. [긴급] X-Frame-Options 충돌

**파일:** `src/middleware.ts` vs `src/app/api/v1/preview/[projectId]/route.ts`

**문제:**
- 미들웨어: `X-Frame-Options: DENY` (모든 iframe 차단)
- 미리보기 API: `X-Frame-Options: SAMEORIGIN` (같은 출처 iframe 허용)
- 결과: 미들웨어가 먼저 실행되어 `DENY`가 적용 → 미리보기 iframe이 동작하지 않음

**수정:**
```typescript
// src/middleware.ts
// 서브도메인 사이트와 미리보기는 iframe 허용 필요
const isSubdomainSite = isSubdomain;
const isPreviewApi = request.nextUrl.pathname.startsWith('/api/v1/preview');

if (!isSubdomainSite && !isPreviewApi) {
  response.headers.set('X-Frame-Options', 'DENY');
} else {
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
}
```

---

### 3-3. [긴급] RailwayDeployer 인메모리 상태 문제

**파일:** `src/providers/deploy/RailwayDeployer.ts`

**문제:**
```typescript
// 서버 재시작 또는 수평 확장 시 소실되는 인메모리 Map
private projectMap = new Map<string, {
  railwayProjectId: string;
  serviceId: string;
  repoFullName: string;
}>();
```

**원인:** `deploy()` 메서드 실행 중 서버가 재시작되거나, 로드밸런서가 다른 인스턴스로 요청을 보내면 `projectMap`이 비어있어 `Project context not found` 에러 발생.

**수정 방향:**
- 가상 호스팅 전환 후 Railway per-project 배포 자체를 없애는 것이 근본 해결책
- 전환 전 임시 조치: `projectMap` 대신 Supabase `projects` 테이블의 `metadata` 컬럼에 저장

```typescript
// projects.metadata에 저장할 구조
interface DeployMetadata {
  railwayProjectId?: string;
  railwayServiceId?: string;
  repoFullName?: string;
}
```

---

### 3-4. [중간] 미리보기 페이지 인증 보안 누락

**파일:** `src/app/(main)/preview/[id]/page.tsx`

**문제:** 미리보기 페이지의 서버 컴포넌트에서 `user.id === project.userId` 소유자 확인이 되는지 검토 필요. API 라우트 (`/api/v1/preview/[projectId]`)는 확인하지만 페이지 자체는 별도 확인이 없을 수 있음.

**수정 방향:** 모든 프로젝트 접근 시 `ProjectService.getById(id, userId)` 호출로 소유자 검증 통일.

---

### 3-5. [중간] DeployProviderFactory 싱글톤 문제

**파일:** `src/providers/deploy/DeployProviderFactory.ts`

**문제:**
```typescript
// 정적 Map으로 싱글톤 유지 → 수평 확장 시 각 인스턴스가 독립적 상태
private static providers = new Map<string, IDeployProvider>();
```

**수정 방향:** 가상 호스팅 전환 후 RailwayDeployer 사용을 없애면 자연스럽게 해결. 유지한다면 상태 없는 (stateless) 팩토리로 변경.

---

### 3-6. [중간] contextStore localStorage 누수

**파일:** `src/stores/contextStore.ts`

**문제:** 서비스 생성 완료 후에도 localStorage에 이전 `context`와 `selectedTemplate`이 남아 다음 생성 시 의도치 않게 이전 값이 사용될 수 있음.

**수정 방향:**
```typescript
// 생성 완료 후 호출
const reset = () => set({
  context: '',
  selectedTemplate: null,
});
```
`useGeneration` 훅의 완료 이벤트에서 `contextStore.reset()` 호출.

---

### 3-7. [낮음] 생성된 코드 보안 헤더 CSP 부재

**파일:** `src/app/api/v1/preview/[projectId]/route.ts`

**문제:** 생성된 HTML을 서빙할 때 Content Security Policy가 없어 XSS 위험.

**수정 방향:**
```typescript
headers: {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'unsafe-inline'",    // 인라인 JS 허용 (생성 코드 특성상)
    "style-src 'unsafe-inline'",
    "img-src * data:",
    "connect-src *",                  // fetch() API 호출 허용
    "frame-ancestors 'self'",
  ].join('; '),
}
```

---

### 3-8. [낮음] 에러 응답 일관성

일부 API 라우트에서 에러 응답 구조가 다름:

```typescript
// 일부는 이 형태
{ error: "메시지" }

// 일부는 이 형태
{ success: false, error: { code: "...", message: "..." } }
```

**수정 방향:** `handleApiError()` 유틸리티를 모든 라우트에서 일관되게 사용.

---

## 4. 가상 호스팅 상세 설계

### 4-1. Slug 정책

사용자 친화적이고 URL-safe한 slug 규칙:

| 항목 | 규칙 |
|------|------|
| 형식 | `[영문소문자]-[영문소문자]-[영문소문자]` 또는 커스텀 |
| 자동 생성 | 프로젝트 이름을 slugify + 충돌 시 숫자 suffix |
| 길이 | 3~50자 |
| 허용 문자 | `[a-z0-9-]` (영문 소문자, 숫자, 하이픈) |
| 예약어 | `www`, `api`, `admin`, `mail`, `ftp`, `static` 등 금지 |

**Slug 예시:**
```
프로젝트명: "날씨 대시보드"
slug: "weather-dashboard-a1b2"    ← 한글은 영문으로 변환 후 랜덤 suffix
```

### 4-2. 미들웨어 라우팅 로직

```
요청 Host 헤더 분석
        │
        ├─ customwebservice.app (루트 도메인)
        │       → 기존 Next.js 앱 라우팅 유지
        │
        ├─ *.customwebservice.app (서브도메인)
        │       → /site/[slug] 로 내부 rewrite
        │       → 인증 미들웨어 건너뜀 (public 접근)
        │
        └─ localhost:8080 (로컬 개발)
                → /site/[slug] 파라미터로 개발 테스트 지원
                  (/site/abc123 직접 접근으로 테스트)
```

### 4-3. 사이트 서빙 Route Handler

**`src/app/site/[slug]/route.ts`**

처리 흐름:
```
1. slug 유효성 검사 (정규식: /^[a-z0-9-]{3,50}$/)
2. 예약어 확인
3. Supabase에서 slug로 projects 조회
   - not_found → 404 커스텀 페이지 반환
   - status != 'published' → 준비 중 페이지 반환
4. generated_codes에서 최신 버전 HTML 조회
5. 응답 헤더 설정:
   - Content-Type: text/html; charset=utf-8
   - Cache-Control: public, s-maxage=60, stale-while-revalidate=300
   - X-Robots-Tag: index, follow  (검색 엔진 허용)
   - Content-Security-Policy: ...
6. HTML 반환
```

### 4-4. 캐싱 전략

```
[브라우저] ←── 60초 캐시 ──┐
                            │
[Railway CDN/Edge] ←─ stale-while-revalidate 300초 ─┐
                                                       │
                                          [메인 앱 Route Handler]
                                                       │
                                              [Supabase DB 조회]
```

- `s-maxage=60`: CDN에서 60초 캐시
- `stale-while-revalidate=300`: 만료 후 300초간 stale 응답 제공하면서 백그라운드 갱신
- 코드 업데이트(재생성) 시: slug의 캐시 purge 필요 (Railway는 자동, 별도 CDN 사용 시 purge API 호출)

### 4-5. 404/준비 중 페이지

서브도메인 접근 시 프로젝트가 없거나 아직 생성 중인 경우:

```html
<!-- 404 - 사이트 없음 -->
<html>
  <head><title>사이트를 찾을 수 없습니다</title></head>
  <body>
    <h1>🔍 이 주소의 사이트가 없습니다</h1>
    <p>abc123.customwebservice.app 은 존재하지 않습니다.</p>
    <a href="https://customwebservice.app">서비스 만들러 가기 →</a>
  </body>
</html>

<!-- 준비 중 -->
<html>
  <head>
    <meta http-equiv="refresh" content="10">  <!-- 10초 후 자동 새로고침 -->
    <title>준비 중...</title>
  </head>
  <body>
    <h1>⚙️ 사이트 준비 중입니다</h1>
    <p>잠시 후 자동으로 새로고침됩니다.</p>
  </body>
</html>
```

### 4-6. 대시보드 UI 변경

기존: `배포` 버튼 → Railway 배포 후 URL 표시
변경: `게시` 버튼 → 즉시 slug 기반 URL 부여 + 복사 버튼

```
프로젝트 카드 (변경 후)
┌─────────────────────────────────────┐
│ 🌤 날씨 대시보드               ● 게시됨 │
│                                      │
│ https://weather-dashboard-a1b2       │
│ .customwebservice.app  [복사] [열기]  │
│                                      │
│ [미리보기]  [재생성]  [삭제]          │
└─────────────────────────────────────┘
```

---

## 5. 데이터베이스 변경

### 5-1. projects 테이블 변경

```sql
-- Supabase SQL Editor에서 실행

-- 1. slug 컬럼 추가
ALTER TABLE projects
  ADD COLUMN slug TEXT,
  ADD COLUMN published_at TIMESTAMPTZ;

-- 2. slug 유니크 인덱스
CREATE UNIQUE INDEX idx_projects_slug ON projects (slug)
  WHERE slug IS NOT NULL;

-- 3. slug 검색용 인덱스
CREATE INDEX idx_projects_slug_status ON projects (slug, status)
  WHERE slug IS NOT NULL;

-- 4. 기존 deployed 상태 프로젝트에 slug 자동 부여
UPDATE projects
SET slug = LEFT(REPLACE(id::text, '-', ''), 8)
WHERE status = 'deployed' AND slug IS NULL;
```

### 5-2. ProjectStatus 타입 변경

```typescript
// src/types/project.ts 변경
export type ProjectStatus =
  | 'draft'
  | 'generating'
  | 'generated'
  | 'deploying'    // ← 제거 예정 (Railway 배포 불필요)
  | 'deployed'     // ← 'published'로 rename 권장
  | 'published'    // ← 새로 추가: 서브도메인으로 게시됨
  | 'unpublished'  // ← 새로 추가: 게시 취소
  | 'failed';

// Project 타입에 필드 추가
export interface Project {
  // ... 기존 필드 ...
  slug: string | null;          // 새로 추가
  publishedAt: Date | null;     // 새로 추가
  // deployPlatform은 유지 (이력 보존)
}
```

### 5-3. Slug 생성 서비스

```typescript
// src/lib/utils/slugify.ts (새 파일)

const RESERVED_SLUGS = new Set([
  'www', 'api', 'admin', 'mail', 'ftp', 'static',
  'assets', 'cdn', 'app', 'dashboard', 'login',
  'callback', 'auth', 'health', 'site',
]);

export function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[가-힣]/g, '')         // 한글 제거 (번역 API 없이)
    .replace(/[^a-z0-9\s-]/g, '')    // 특수문자 제거
    .replace(/\s+/g, '-')            // 공백 → 하이픈
    .replace(/-+/g, '-')             // 연속 하이픈 정리
    .replace(/^-|-$/g, '')           // 앞뒤 하이픈 제거
    .slice(0, 40);                    // 최대 40자
}

export function generateSlug(projectName: string, projectId: string): string {
  const base = toSlug(projectName) || 'site';
  const suffix = projectId.replace(/-/g, '').slice(0, 6);
  const candidate = `${base}-${suffix}`;

  if (RESERVED_SLUGS.has(candidate)) {
    return `my-${candidate}`;
  }
  return candidate;
}
```

---

## 6. 인프라 설정

### 6-1. DNS 설정 (Cloudflare 기준)

```
타입    이름                          값
─────────────────────────────────────────────────────
CNAME   customwebservice.app          r4r002eg.up.railway.app
CNAME   *.customwebservice.app        r4r002eg.up.railway.app
```

> **주의:** Cloudflare Proxy (주황 구름) 활성화 권장
> - DDoS 보호
> - 무료 SSL/TLS 자동 처리
> - 엣지 캐싱

### 6-2. Railway 커스텀 도메인 설정

Railway 대시보드 → Service → Settings → Networking → Custom Domains:

```
customwebservice.app
*.customwebservice.app
```

### 6-3. 환경변수 추가

```bash
# .env.local 및 Railway 환경변수에 추가

# 루트 도메인 (서브도메인 감지에 사용)
NEXT_PUBLIC_ROOT_DOMAIN=customwebservice.app

# 로컬 개발시
# NEXT_PUBLIC_ROOT_DOMAIN=localhost:8080
```

### 6-4. Supabase 설정

Supabase Dashboard → Authentication → URL Configuration:

```
Site URL:
  https://customwebservice.app

Redirect URLs (허용 목록):
  https://customwebservice.app/callback
  https://r4r002eg.up.railway.app/callback
  http://localhost:3000/callback
  http://localhost:8080/callback
```

---

## 7. 보안 설계

### 7-1. 서브도메인 사이트의 보안 헤더

서브도메인으로 서빙되는 사용자 생성 HTML은 메인 앱과 다른 보안 정책 필요:

```typescript
// /site/[slug]/route.ts의 응답 헤더
const siteHeaders = {
  'Content-Type': 'text/html; charset=utf-8',

  // 캐싱
  'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',

  // CSP: 생성된 코드가 외부 API 호출을 하므로 connect-src는 열어둠
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'unsafe-inline' 'unsafe-eval'",  // 생성 코드 특성상
    "style-src 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src * data: blob:",
    "connect-src *",                              // fetch() API 허용
    "frame-ancestors 'none'",                     // 다른 사이트가 이 페이지를 iframe으로 삽입 불가
  ].join('; '),

  // 클릭재킹 방지
  'X-Frame-Options': 'DENY',

  // MIME 타입 스니핑 방지
  'X-Content-Type-Options': 'nosniff',

  // 리퍼러 정보 최소화
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};
```

### 7-2. Slug 인젝션 방지

```typescript
// route.ts에서 slug 검증
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

if (!SLUG_REGEX.test(params.slug)) {
  return new NextResponse('Invalid slug', { status: 400 });
}
```

### 7-3. 생성 코드 내 민감 정보 검사 강화

현재 `codeValidator.ts`에서 일부 검사 중. 추가 필요:

```typescript
// 강화할 패턴들
const DANGEROUS_PATTERNS = [
  /eval\s*\(/,
  /new\s+Function\s*\(/,
  /document\.cookie/,
  /localStorage\.setItem.*password/i,
  /window\.location\s*=/,               // 리다이렉트 공격
  /fetch\s*\(\s*['"`](?!https?:\/\/)/,  // 프로토콜 없는 fetch
];
```

### 7-4. 사용자별 slug 소유권

- slug는 생성한 사용자만 삭제/변경 가능
- slug 변경 시 이전 slug는 일정 기간(7일) 리다이렉트 유지 → 링크 깨짐 방지

---

## 8. 구현 단계별 계획

### Phase 0: 기존 버그 수정 (즉시, ~1일)

| 순서 | 작업 | 파일 | 상태 |
|------|------|------|------|
| 0-1 | OAuth 콜백 Origin 수정 | `callback/route.ts` | ✅ 완료 |
| 0-2 | `.env.local` APP_URL 수정 | `.env.local` | ✅ 완료 |
| 0-3 | X-Frame-Options 충돌 수정 | `middleware.ts` | ⏳ 대기 |
| 0-4 | 미리보기 CSP 헤더 추가 | `preview/route.ts` | ⏳ 대기 |

### Phase 1: DB 및 Slug 인프라 (~1일)

| 순서 | 작업 | 파일 |
|------|------|------|
| 1-1 | DB migration: slug, published_at 컬럼 추가 | Supabase SQL |
| 1-2 | `slugify.ts` 유틸리티 작성 | `src/lib/utils/slugify.ts` |
| 1-3 | Project 타입에 slug, publishedAt 추가 | `src/types/project.ts` |
| 1-4 | ProjectRepository에 findBySlug() 추가 | `src/repositories/projectRepository.ts` |
| 1-5 | ProjectService에 publish(), unpublish() 추가 | `src/services/projectService.ts` |

### Phase 2: 서브도메인 라우팅 (~1일)

| 순서 | 작업 | 파일 |
|------|------|------|
| 2-1 | 미들웨어 서브도메인 감지 추가 | `src/middleware.ts` |
| 2-2 | `/site/[slug]/route.ts` 생성 | `src/app/site/[slug]/route.ts` |
| 2-3 | 404/준비중 HTML 페이지 작성 | `src/lib/templates/siteError.ts` |
| 2-4 | NEXT_PUBLIC_ROOT_DOMAIN 환경변수 추가 | `.env.local`, Railway |

### Phase 3: 게시/비게시 API (~0.5일)

| 순서 | 작업 | 파일 |
|------|------|------|
| 3-1 | `POST /api/v1/projects/[id]/publish` 라우트 | `src/app/api/v1/projects/[id]/publish/route.ts` |
| 3-2 | `POST /api/v1/projects/[id]/unpublish` 라우트 | 동일 파일 |
| 3-3 | slug 중복 체크 로직 | `projectService.ts` |

### Phase 4: 대시보드 UI 업데이트 (~1일)

| 순서 | 작업 | 파일 |
|------|------|------|
| 4-1 | ProjectCard에 slug URL 표시 + 복사 버튼 | `src/components/dashboard/ProjectCard.tsx` |
| 4-2 | ProjectCard에 "게시/게시 취소" 버튼 추가 | 동일 |
| 4-3 | 프로젝트 상세 페이지 slug 관리 UI | `src/app/(main)/dashboard/[id]/page.tsx` |
| 4-4 | useDeploy 훅 → usePublish 훅으로 전환 | `src/hooks/usePublish.ts` |

### Phase 5: 인프라 설정 (~0.5일)

| 순서 | 작업 |
|------|------|
| 5-1 | DNS CNAME 와일드카드 설정 |
| 5-2 | Railway 커스텀 도메인 등록 |
| 5-3 | Supabase redirect URLs 업데이트 |
| 5-4 | Railway 환경변수 NEXT_PUBLIC_ROOT_DOMAIN 추가 |

### Phase 6: 기존 Railway 배포 방식 정리 (~0.5일)

| 순서 | 작업 |
|------|------|
| 6-1 | DeployService에서 Railway 호출 제거 또는 옵셔널 처리 |
| 6-2 | 기존 생성된 Railway 서비스 정리 (Railway 대시보드) |
| 6-3 | deploy API 라우트를 publish API로 대체 |
| 6-4 | 기존 deploy_url이 있는 프로젝트 마이그레이션 |

---

## 9. 테스트 전략

### 9-1. 단위 테스트

```typescript
// slugify 테스트
describe('generateSlug', () => {
  it('한글 프로젝트명을 slug로 변환', () => {
    expect(generateSlug('날씨 앱', 'abc-123-def')).toMatch(/^[a-z0-9-]+$/);
  });
  it('예약어 slug 방지', () => {
    expect(generateSlug('admin', 'abc-123-def')).not.toBe('admin');
  });
  it('50자 초과 slug 잘라냄', () => {
    expect(generateSlug('a'.repeat(100), 'abc-123')).toHaveLength.lessThanOrEqual(50);
  });
});
```

### 9-2. 통합 테스트

```typescript
// /site/[slug] route 테스트
describe('GET /site/[slug]', () => {
  it('유효한 slug → 200 HTML 반환');
  it('없는 slug → 404 HTML 반환');
  it('비게시 프로젝트 → 준비중 페이지 반환');
  it('잘못된 slug 형식 → 400 반환');
  it('캐시 헤더 포함 확인');
});
```

### 9-3. 로컬 개발 테스트 (서브도메인 없이)

로컬에서 서브도메인 없이 `/site/[slug]` 직접 접근으로 테스트:
```
http://localhost:8080/site/abc123
```

미들웨어의 서브도메인 감지는 `NEXT_PUBLIC_ROOT_DOMAIN`이 설정된 경우에만 동작:
```typescript
// 개발 환경에서는 서브도메인 감지 건너뜀
if (process.env.NODE_ENV === 'development') {
  // /site/[slug] 직접 접근으로 테스트
}
```

### 9-4. 엔드투엔드 체크리스트

- [ ] 로그인 후 대시보드 접근 정상
- [ ] 프로젝트 생성 → slug 자동 부여 확인
- [ ] "게시" 클릭 → `slug.customwebservice.app` 접근 가능
- [ ] "게시 취소" 클릭 → 준비중 페이지로 변경
- [ ] 없는 slug 접근 → 404 페이지
- [ ] 로그인 없이 서브도메인 접근 가능 (public)
- [ ] 미리보기 iframe 동작 확인 (X-Frame-Options 수정 후)
- [ ] 모바일 브라우저에서 서브도메인 접근 확인

---

## 10. 리스크 및 완화 방안

| 리스크 | 가능성 | 영향 | 완화 방안 |
|--------|--------|------|-----------|
| 와일드카드 SSL 인증서 발급 실패 | 낮음 | 높음 | Cloudflare 프록시 사용 시 자동 처리 |
| Slug 충돌 | 중간 | 낮음 | DB UNIQUE 제약 + 재시도 로직 |
| 악성 HTML 서빙 | 중간 | 높음 | 코드 검증 강화 + CSP 헤더 |
| DB 조회 성능 저하 (트래픽 증가) | 중간 | 중간 | slug 인덱스 + 응답 캐싱 |
| 기존 deploy_url 있는 사용자 혼란 | 낮음 | 낮음 | 마이그레이션 스크립트 + 알림 |
| Railway 무료 티어 대역폭 초과 | 낮음 | 중간 | Cloudflare 캐싱으로 원본 요청 감소 |

---

## 부록: 파일 변경 목록 요약

### 신규 생성 파일

```
src/app/site/[slug]/route.ts              # 서브도메인 사이트 서빙
src/app/api/v1/projects/[id]/publish/route.ts  # 게시 API
src/lib/utils/slugify.ts                  # Slug 생성 유틸
src/lib/templates/siteError.ts            # 404/준비중 HTML 템플릿
src/hooks/usePublish.ts                   # 게시 훅
```

### 수정 파일

```
src/middleware.ts                         # 서브도메인 라우팅 + X-Frame-Options 수정
src/app/(auth)/callback/route.ts          # ✅ 이미 수정됨
src/types/project.ts                      # slug, publishedAt 필드 추가
src/repositories/projectRepository.ts    # findBySlug() 추가
src/services/projectService.ts           # publish(), unpublish() 추가
src/components/dashboard/ProjectCard.tsx # slug URL + 게시 버튼
src/app/(main)/dashboard/[id]/page.tsx   # slug 관리 UI
src/app/api/v1/preview/[projectId]/route.ts  # CSP 헤더 추가
.env.local                                # ✅ APP_URL 수정, ROOT_DOMAIN 추가 필요
```

### DB 마이그레이션

```sql
-- 001_add_slug_to_projects.sql
ALTER TABLE projects ADD COLUMN slug TEXT;
ALTER TABLE projects ADD COLUMN published_at TIMESTAMPTZ;
CREATE UNIQUE INDEX idx_projects_slug ON projects (slug) WHERE slug IS NOT NULL;
```

---

*이 문서는 구현 시작 전 팀 리뷰 후 확정하며, 각 Phase 완료 시 업데이트합니다.*

---

## 11. Slug 정책 (현행)

### 11-1. AI 슬러그 제안

코드 생성 Stage 3 완료 직후 `suggestSlugs()` (`src/lib/ai/slugSuggester.ts`)가 **best-effort**로 호출된다.

- 모델: `claude-haiku-4-5` (빠른 응답, 비용 최소화)
- 출력: 영문 소문자·하이픈 슬러그 3개
- 저장: `projects.suggested_slugs` (TEXT[] 컬럼)
- 실패 시: 오류 무시, 파이프라인 계속 진행 (빈 배열로 폴백)

### 11-2. 게시 다이얼로그 흐름

1. AI 제안 슬러그 3개를 라디오 버튼으로 표시 (`PublishDialog.tsx`)
2. 직접 입력 옵션 (커스텀 슬러그)
3. 선택/입력 시 실시간 가용성 체크 (`GET /api/v1/projects/slug-check?slug=…`)
4. 확인 → `POST /api/v1/projects/[id]/publish { slug }`

**재게시(Re-publish):** 이미 slug가 할당된 프로젝트를 재게시하면 기존 slug를 그대로 유지 (다이얼로그 미표시).

### 11-3. 충돌 해소

`assignUniqueSlug()` (`src/services/projectService.ts`):

1. base slug 시도
2. 실패 시 `base-2` … `base-10` 순차 시도
3. 모두 실패 시 타임스탬프 suffix 폴백
4. INSERT 시 Postgres 23505(unique_violation) 발생 → 1회 재시도
