# 서브도메인 라우팅 아키텍처

> **언제 읽나**: `middleware.ts` 의 Host 감지·`/site/[slug]` rewrite·`SUBDOMAIN_PASSTHROUGH_PREFIXES`·`NEXT_PUBLIC_ROOT_DOMAIN` 을 손댈 때. 패스스루 목록이 없으면 게시 사이트의 `/api/v1/proxy` 호출이 전부 404가 된다

> 최종 업데이트: 2026-05-22

---

## 1. 개요

`slug.xzawed.xyz` 형태의 요청이 Next.js 앱 하나로 처리되는 방식을 설명한다.

```
브라우저: GET https://my-weather-app.xzawed.xyz/

1. DNS: *.xzawed.xyz → Railway 앱 IP (와일드카드 CNAME)
2. Railway → Next.js 앱으로 요청 전달
3. Next.js Middleware (middleware.ts):
   - Host 헤더에서 서브도메인("my-weather-app") 추출
   - /site/my-weather-app 으로 내부 rewrite
4. /site/[slug]/route.ts:
   - DB에서 slug="my-weather-app" 프로젝트 조회
   - 코드 조회 후 HTML 조합
   - 응답 반환 (Cache-Control + 보안 헤더 포함)
5. 브라우저: HTML 렌더링
```

단일 Railway 인스턴스가 모든 서브도메인 요청을 처리한다. 사용자별 개별 인스턴스나 외부 배포 없이 DB 조회만으로 서빙이 완료된다.

---

## 2. 미들웨어 라우팅 로직

**파일**: `src/middleware.ts`

### Host 헤더 감지 방식

```typescript
const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

if (rootDomain) {
  const host = request.headers.get('host') ?? '';
  const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');

  if (!isLocalhost && host.endsWith(`.${rootDomain}`)) {
    const slug = host.slice(0, -(rootDomain.length + 1));
    if (slug && slug !== 'www') {
      // /site/[slug] 로 내부 rewrite
    }
  }
}
```

### NEXT_PUBLIC_ROOT_DOMAIN 역할

- `NEXT_PUBLIC_ROOT_DOMAIN=xzawed.xyz`로 설정하면 서브도메인 감지가 활성화된다.
- 미설정 시 서브도메인 감지가 비활성화되어 일반 Next.js 라우팅으로 동작한다.
- `localhost` 및 `127.0.0.1`은 항상 서브도메인 감지에서 제외된다 — 로컬 개발 시 `/site/[slug]` 경로로 직접 접근하여 테스트한다.

### /site/[slug] rewrite 동작

서브도메인이 감지되면 `NextResponse.rewrite()`로 내부 경로를 변경한다. 브라우저 주소창은 원래 서브도메인 URL을 유지하며, 실제 처리는 `src/app/site/[slug]/route.ts`가 담당한다.

```
요청: GET https://my-weather-app.xzawed.xyz/
   ↓ middleware rewrite (URL 바뀌지 않음)
처리: /site/my-weather-app
```

### 서브도메인 패스스루 (`SUBDOMAIN_PASSTHROUGH_PREFIXES`)

게시 사이트의 생성 JS는 CORS 때문에 외부 API를 직접 호출하지 않고 **상대경로** `/api/v1/proxy?...`로 프록시를 호출한다. 서브도메인 요청을 무조건 `/site/{slug}…`로 rewrite하면 경로가 `/site/{slug}/api/v1/proxy`가 되고, `/site/[slug]`는 단일 동적 세그먼트라 매칭되지 않아 **404**가 된다 — API를 쓰는 게시 사이트가 전부 데이터 로딩에 실패한다(미리보기는 apex 도메인이라 rewrite가 없어 정상 동작 → 2026-07-28 프로덕션에서 실측).

`src/middleware.ts`는 아래 접두사만 rewrite를 건너뛴다(최소 노출 — `/api/*` 전체 개방 아님):

```typescript
const SUBDOMAIN_PASSTHROUGH_PREFIXES = ['/api/v1/proxy'];
```

패스스루 경로는 일반 응답 경로로 흘러 correlation id·보안 헤더가 적용되고, API 경로 판정으로 CSP를 건너뛴다. 새 경로를 추가할 때도 이 최소 노출 원칙을 유지한다.

### 보안 헤더 (서브도메인 경로)

서브도메인 rewrite 경로에서는 다음 헤더만 적용된다. CSP는 `site/[slug]/route.ts`에서 별도 설정한다.

| 헤더 | 값 |
|------|----|
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Correlation-Id` | 요청별 고유 ID |

미들웨어는 서브도메인 경로에 CSP를 설정하지 않는다. `site/[slug]/route.ts`가 AI 생성 코드에 필요한 외부 CDN을 허용하는 별도 CSP(`SITE_CSP`)를 직접 설정한다. 미들웨어에서 제한적 CSP를 추가하면 브라우저가 두 CSP를 모두 적용하여 CDN이 차단된다.

---

## 3. 사이트 서빙 흐름

**파일**: `src/app/site/[slug]/route.ts`

```
1. isValidSlug(slug) 검사 — 형식 오류 시 400
2. RESERVED_SLUGS 확인 — 예약어면 404 HTML 반환
3. projectRepo.findBySlug(slug) 조회
   - 없음 → 404 HTML 반환
   - status !== 'published' → preparingHtml() 반환 (HTTP 200)
4. codeRepo.findByProject(project.id) 조회
   - 없음 → preparingHtml() 반환
5. assembleHtml({ html, css, js }) 로 HTML 조합
6. 응답 반환
```

**응답 헤더**:

| 헤더 | 값 |
|------|----|
| `Content-Type` | `text/html; charset=utf-8` |
| `Cache-Control` | `public, s-maxage=60, stale-while-revalidate=300` |
| `Content-Security-Policy` | `SITE_CSP` (외부 CDN 허용, `src/lib/constants/cdn.ts`) |
| `X-Robots-Tag` | `index, follow` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups` |

캐싱: CDN/Railway 엣지에서 60초 캐시, 이후 300초 stale-while-revalidate. 재생성 후 캐시 purge는 Railway가 자동 처리한다.

---

## 4. Slug 관리

### Slug 형식

- 허용 문자: `[a-z0-9-]` (영문 소문자, 숫자, 하이픈)
- 길이: 3~50자
- 예약어(`www`, `api`, `admin`, `site`, `login`, `callback` 등)는 사용 불가

### 게시 흐름 (projectService.ts)

```
POST /api/v1/projects/[id]/publish { slug? }
    │
    ├── 재게시: project.slug가 이미 있으면 기존 slug 유지 (다이얼로그 미표시)
    │
    └── 최초 게시:
        ├── chosenSlug가 유효하면 사용
        └── 없으면 generateSlug(name, id) 자동 생성
                │
                └── assignUniqueSlug(base)
                      base → base-2 → ... → base-10 → base-{timestamp4자리} fallback
                      findBySlug()로 각 후보 가용성 확인
                        │
                        └── projectRepo.updateSlug(id, finalSlug, publishedAt)
                              ↑ 23505 unique 위반 시 1회 재시도
```

### AI 슬러그 제안

코드 생성 Stage 3 완료 직후 `suggestSlugs()` (`src/lib/ai/slugSuggester.ts`)가 best-effort로 호출되어 3개의 슬러그 후보를 `projects.suggested_slugs`(TEXT[])에 저장한다. 게시 다이얼로그(`PublishDialog.tsx`)에서 라디오 버튼으로 표시된다.

### publishedAt 설정 흐름

```
publish() 호출
    └── projectRepo.updateSlug(id, slug, new Date())
          └── projects 테이블: status = 'published', slug = slug, published_at = now()
```

---

## 5. 서빙 경로 비교

| 경로 | URL 패턴 | 처리 파일 | 인증 필요 |
|------|---------|-----------|----------|
| 서브도메인 | `slug.xzawed.xyz` | middleware rewrite → `site/[slug]/route.ts` | 불필요 (public) |
| 직접 경로 | `xzawed.xyz/site/slug` | `site/[slug]/route.ts` 직접 | 불필요 (public) |
| 미리보기 | `xzawed.xyz/api/v1/preview/[projectId]` | `api/v1/preview/[projectId]/route.ts` | 필요 (소유자) |

로컬 개발 환경에서는 서브도메인 없이 `/site/[slug]` 경로로 직접 접근하여 서빙 동작을 테스트한다.

---

## 6. 환경변수

| 변수 | 설명 | 예시 |
|------|------|------|
| `NEXT_PUBLIC_ROOT_DOMAIN` | 서브도메인 감지 기준 도메인. 미설정 시 서브도메인 기능 비활성화 | `xzawed.xyz` |

인프라 요구사항:
- DNS: `*.xzawed.xyz` → Railway 앱으로 와일드카드 CNAME
- Railway: 커스텀 도메인 `xzawed.xyz`, `*.xzawed.xyz` 등록
