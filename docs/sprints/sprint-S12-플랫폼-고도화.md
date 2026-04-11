# Sprint 12 — 플랫폼 고도화 (비주얼 에디터 · PWA · 커스텀 도메인)

> 기반 문서: `docs/20_확장성_분석_및_로드맵.md` F15, F17, F18
> 선행 조건: S11 완료
> 예상 기간: 5~6주
> 목표: 프로 사용자 대응 기능 + 모바일 접근성 + 독립 브랜딩 지원

---

## 진행 현황

| 태스크 | 목표 | 상태 |
|--------|------|------|
| S12-1 | 비주얼 코드 에디터 | ⏳ 대기 |
| S12-2 | PWA 지원 | ⏳ 대기 |
| S12-3 | 사용자 정의 도메인 | ⏳ 대기 |

---

## S12-1. 비주얼 코드 에디터

### 배경

S7-2에서 읽기 전용 코드 뷰어 구현. 이를 편집 가능한 에디터로 확장.
생성된 코드를 미세 조정하고 싶은 사용자 수요 대응.

### 구현 내용

**1) Monaco Editor 통합**

**패키지 추가:**
```bash
pnpm add @monaco-editor/react
```

**신규 파일:** `src/components/editor/CodeEditor.tsx`

```
┌─ 코드 편집기 ─────────────────────────────────────────┐
│  [HTML]  [CSS]  [JS]           [미리보기 ↔ 코드]      │
│ ─────────────────────────────┬─────────────────────── │
│  1 │ <!DOCTYPE html>         │                        │
│  2 │ <html lang="ko">        │   ┌──────────────┐    │
│  3 │ <head>                  │   │  실시간       │    │
│  4 │   <meta charset="...">  │   │  미리보기     │    │
│  5 │   <title>...</title>    │   │              │    │
│  6 │ </head>                 │   │              │    │
│  7 │ <body>                  │   └──────────────┘    │
│  8 │   <div id="app">       │                        │
│  ...                         │                        │
│ ─────────────────────────────┴─────────────────────── │
│  [저장 (새 버전)]  [되돌리기]  [다운로드]               │
└───────────────────────────────────────────────────────┘
```

**기능:**
- HTML/CSS/JS 탭 전환 (Monaco Editor 인스턴스)
- 실시간 미리보기 (debounce 500ms → iframe srcDoc 업데이트)
- 자동 완성 (HTML 태그, CSS 속성)
- 구문 에러 표시 (빨간 밑줄)
- Emmet 지원 (선택적)

**2) 코드 저장 API**

**신규 파일:** `src/app/api/v1/projects/[id]/code/route.ts`

```
PUT /api/v1/projects/:id/code
body: { html, css, js }
→ 새 version으로 generated_codes에 저장
→ ai_provider: 'manual_edit', ai_model: null
→ projects.current_version 업데이트
```

**3) 에디터 페이지**

**신규 파일:** `src/app/(main)/editor/[id]/page.tsx`

- URL: `/editor/[projectId]`
- 전체 화면 에디터 레이아웃 (Header 최소화)
- 대시보드 상세에서 "코드 편집" 버튼으로 진입

**4) 대시보드 연결**

**수정 파일:** `src/components/dashboard/ProjectCard.tsx`

- "코드 편집" 버튼 추가 (generated/published 상태에서)

**수정 파일:** `src/app/(main)/dashboard/[id]/page.tsx`

- "코드 편집" 링크 추가

### 완료 조건
- [ ] Monaco Editor에서 HTML/CSS/JS 편집
- [ ] 실시간 미리보기 연동
- [ ] 저장 시 새 버전으로 기록
- [ ] 수정 후 게시 반영 (서브도메인 재방문 시 최신 코드)
- [ ] 되돌리기 (Ctrl+Z) 동작

---

## S12-2. PWA 지원

### 구현 내용

**1) Web App Manifest**

**신규 파일:** `public/manifest.json`

```json
{
  "name": "CustomWebService",
  "short_name": "CWS",
  "description": "무료 API 기반 웹서비스 자동 생성 플랫폼",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2563eb",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**2) Service Worker**

**신규 파일:** `public/sw.js`

캐시 전략:
- 정적 자산 (CSS, JS, 이미지): Cache First
- API 응답: Network First + 오프라인 폴백
- HTML 페이지: Stale While Revalidate

오프라인 지원 범위:
- 대시보드 프로젝트 목록 (캐시된 데이터)
- 이전에 조회한 프로젝트 상세
- 오프라인 시 "연결을 확인해주세요" 안내

**3) 루트 레이아웃 연결**

**수정 파일:** `src/app/layout.tsx`

```tsx
<head>
  <link rel="manifest" href="/manifest.json" />
  <meta name="theme-color" content="#2563eb" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
</head>
```

**4) SW 등록**

**신규 파일:** `src/lib/pwa/registerSW.ts`

```typescript
// 클라이언트 사이드에서 Service Worker 등록
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

**5) 앱 아이콘 생성**

**신규 파일:** `public/icon-192.png`, `public/icon-512.png`

- 간단한 로고 아이콘 (SVG → PNG 변환)

### 완료 조건
- [ ] Chrome "설치" 버튼 표시 (PWA 감지)
- [ ] 설치 후 독립 앱으로 실행
- [ ] 오프라인 시 캐시된 대시보드 표시
- [ ] Lighthouse PWA 점수 90+

---

## S12-3. 사용자 정의 도메인

### 배경

IDeployProvider에 `custom_domain` 기능 플래그 존재.
현재 `slug.customwebservice.app` 형태의 서브도메인만 지원.

### 구현 내용

**1) custom_domains 테이블**

**신규 파일:** `supabase/migrations/004_custom_domains.sql`

```sql
CREATE TABLE IF NOT EXISTS custom_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  domain VARCHAR(255) NOT NULL UNIQUE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',  -- pending, verifying, active, failed
  verification_token TEXT,
  verified_at TIMESTAMPTZ,
  ssl_status VARCHAR(50) DEFAULT 'pending',       -- pending, active
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_custom_domains_domain ON custom_domains(domain);
CREATE INDEX idx_custom_domains_project_id ON custom_domains(project_id);

ALTER TABLE custom_domains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage domains for their projects"
  ON custom_domains FOR ALL
  USING (EXISTS (
    SELECT 1 FROM projects WHERE projects.id = custom_domains.project_id
    AND projects.user_id = auth.uid()
  ));
```

**2) 도메인 관리 API**

**신규 파일:** `src/app/api/v1/projects/[id]/domains/route.ts`

```
POST /api/v1/projects/:id/domains
  body: { domain: 'myapp.example.com' }
  → 도메인 등록 + verification_token 생성
  → 응답: { domain, verificationToken, cnameTarget }

GET /api/v1/projects/:id/domains
  → 등록된 도메인 목록 + 상태

DELETE /api/v1/projects/:id/domains/:domainId
  → 도메인 제거
```

**신규 파일:** `src/app/api/v1/projects/[id]/domains/verify/route.ts`

```
POST /api/v1/projects/:id/domains/verify
  body: { domainId }
  → DNS TXT 레코드 확인 또는 CNAME 확인
  → 성공 시 status: 'active'
```

**3) 미들웨어 확장**

**수정 파일:** `src/middleware.ts`

```typescript
// 현재: 서브도메인만 감지
// 확장: custom_domains 테이블에서 커스텀 도메인 조회
//       → 매칭되면 해당 프로젝트의 /site/[slug]로 rewrite
// 성능: 도메인 조회 결과 캐싱 (5분 TTL)
```

**4) 도메인 설정 UI**

**수정 파일:** `src/app/(main)/dashboard/[id]/page.tsx`

```
┌─ 커스텀 도메인 ─────────────────────────────────┐
│                                               │
│  현재 URL: my-app.customwebservice.app ✅      │
│                                               │
│  커스텀 도메인 추가:                             │
│  ┌─────────────────────────────────────────┐  │
│  │ myapp.example.com                       │  │
│  └─────────────────────────────────────────┘  │
│  [도메인 추가]                                 │
│                                               │
│  설정 안내:                                    │
│  DNS에 다음 CNAME 레코드를 추가하세요:           │
│  myapp.example.com → customwebservice.app     │
│                                               │
│  상태: ⏳ DNS 확인 중...  [확인]               │
│                                               │
└───────────────────────────────────────────────┘
```

**5) DomainService 생성**

**신규 파일:** `src/services/domainService.ts`

- `addDomain(projectId, domain)` — 도메인 등록 + 토큰 생성
- `verifyDomain(domainId)` — DNS 레코드 확인 (CNAME 또는 TXT)
- `removeDomain(domainId)` — 도메인 제거
- `findByDomain(domain)` — 미들웨어용 도메인 조회

### 완료 조건
- [ ] 커스텀 도메인 등록 + DNS 설정 가이드 표시
- [ ] DNS 확인 후 도메인 활성화
- [ ] 커스텀 도메인 접근 시 프로젝트 HTML 서빙
- [ ] HTTPS 동작 (Cloudflare 프록시 또는 자체 SSL)
- [ ] 도메인 제거 시 즉시 비활성화

---

## S12 테스트 계획

### 단위 테스트 (Unit Tests)

#### `src/services/domainService.test.ts` — 신규 (S12-3)
```
describe('DomainService')
├── describe('addDomain')
│   ├── it('도메인을 등록하고 verification_token을 생성한다')
│   ├── it('이미 등록된 도메인에 ConflictError를 던진다')
│   ├── it('잘못된 도메인 형식에 ValidationError를 던진다')
│   ├── it('예약된 도메인(customwebservice.app 등)을 거부한다')
│   └── it('프로젝트 소유자만 도메인을 추가할 수 있다')
├── describe('verifyDomain')
│   ├── it('CNAME 레코드 확인 후 status를 active로 변경한다')
│   ├── it('DNS 레코드 미설정 시 status를 pending으로 유지한다')
│   └── it('존재하지 않는 도메인에 NotFoundError를 던진다')
├── describe('removeDomain')
│   ├── it('도메인을 제거한다')
│   └── it('타인의 도메인 제거 시 ForbiddenError를 던진다')
└── describe('findByDomain')
    ├── it('활성 도메인에 매칭되는 프로젝트를 반환한다')
    ├── it('비활성 도메인에 null을 반환한다')
    └── it('미등록 도메인에 null을 반환한다')
```
예상 테스트 수: **13개**

#### `src/lib/pwa/registerSW.test.ts` — 신규 (S12-2)
```
describe('Service Worker 등록')
├── it('serviceWorker API 지원 시 등록을 시도한다')
├── it('serviceWorker API 미지원 시 조용히 건너뛴다')
└── it('등록 실패 시 콘솔 에러를 로깅한다')
```
예상 테스트 수: **3개**

#### `src/repositories/codeRepository.test.ts` — 추가 케이스 (S12-1)
```
describe('CodeRepository — 수동 편집')
├── it('ai_provider=manual_edit로 코드를 저장한다')
├── it('새 버전으로 저장하고 current_version을 업데이트한다')
└── it('빈 코드 저장을 거부한다')
```
예상 테스트 수: **3개**

#### `src/lib/utils/domainValidator.test.ts` — 신규 (S12-3)
```
describe('도메인 유효성 검증')
├── it('올바른 도메인을 통과시킨다 (example.com)')
├── it('서브도메인을 통과시킨다 (app.example.com)')
├── it('IP 주소를 거부한다')
├── it('포트 번호가 포함된 도메인을 거부한다')
├── it('특수 문자가 포함된 도메인을 거부한다')
├── it('너무 긴 도메인(255자 초과)을 거부한다')
└── it('프로토콜이 포함된 입력을 거부한다 (https://)')
```
예상 테스트 수: **7개**

### 통합 테스트 (Integration Tests)

#### `src/__tests__/api/code-edit.test.ts` — 신규
```
describe('PUT /api/v1/projects/:id/code')
├── it('인증된 사용자가 코드를 저장한다')
├── it('새 버전 번호가 자동 증가한다')
├── it('ai_provider가 manual_edit로 기록된다')
├── it('미인증 시 401을 반환한다')
├── it('타인의 프로젝트에 403을 반환한다')
├── it('빈 코드에 400을 반환한다')
└── it('게시된 프로젝트 코드 수정 시 서브도메인에 반영된다')
```
예상 테스트 수: **7개**

#### `src/__tests__/api/domains.test.ts` — 신규
```
describe('도메인 관리 API')
├── describe('POST /api/v1/projects/:id/domains')
│   ├── it('도메인을 등록하고 CNAME 안내를 반환한다')
│   ├── it('중복 도메인에 409를 반환한다')
│   ├── it('잘못된 형식에 400을 반환한다')
│   └── it('미인증 시 401을 반환한다')
├── describe('POST /api/v1/projects/:id/domains/verify')
│   ├── it('DNS 확인 성공 시 active 상태로 변경한다')
│   └── it('DNS 미설정 시 pending 유지를 반환한다')
├── describe('GET /api/v1/projects/:id/domains')
│   └── it('프로젝트의 도메인 목록을 반환한다')
└── describe('DELETE /api/v1/projects/:id/domains/:domainId')
    ├── it('도메인을 제거한다')
    └── it('타인의 도메인 제거 시 403을 반환한다')
```
예상 테스트 수: **9개**

#### `src/__tests__/integration/pwa.test.ts` — 신규
```
describe('PWA 설정')
├── it('manifest.json이 올바른 형식이다')
├── it('start_url이 /dashboard이다')
├── it('아이콘 파일이 존재한다 (192x192, 512x512)')
└── it('theme_color이 설정되어 있다')
```
예상 테스트 수: **4개**

### 코드 품질 검토 체크리스트

#### 정적 분석
- [ ] `pnpm lint` — 경고/에러 0건
- [ ] `pnpm type-check` — 컴파일 에러 0건
- [ ] `pnpm format:check` — 포맷 위반 0건

#### 코드 리뷰 포인트
- [ ] Monaco Editor 번들 크기가 과도하지 않은가 (dynamic import 사용)
- [ ] 코드 에디터에서 XSS 공격이 불가능한가 (iframe sandbox)
- [ ] Service Worker 업데이트 전략이 적절한가 (skipWaiting vs 사용자 확인)
- [ ] 오프라인 캐시 크기 제한이 설정되어 있는가
- [ ] 커스텀 도메인 DNS 조회 캐시 TTL이 적절한가 (5분)
- [ ] DNS 조회 실패 시 기존 캐시를 사용하는가 (stale-while-revalidate)
- [ ] 도메인 검증 토큰이 충분히 랜덤한가 (crypto.randomUUID)

#### 보안
- [ ] Monaco Editor가 서버 파일 시스템에 접근할 수 없는가
- [ ] 수동 편집된 코드도 codeValidator 보안 검증을 통과하는가
- [ ] Service Worker가 민감 API 응답을 캐시하지 않는가
- [ ] 커스텀 도메인 추가 시 도메인 소유권 검증이 필요한가
- [ ] SSL/TLS 설정에서 다운그레이드 공격이 방어되는가

#### 성능
- [ ] Monaco Editor가 lazy load되어 초기 번들에 포함되지 않는가
- [ ] 코드 편집 시 실시간 미리보기 debounce가 적절한가 (500ms)
- [ ] Service Worker 캐시가 10MB 이내인가
- [ ] 커스텀 도메인 미들웨어 조회가 서브도메인 처리 속도에 영향을 주지 않는가

#### 접근성
- [ ] 코드 에디터에 키보드 내비게이션이 가능한가
- [ ] PWA 설치 배너에 적절한 ARIA 라벨이 있는가

#### 테스트 커버리지 목표
- [ ] 신규 코드 라인 커버리지 **80% 이상**
- [ ] 신규 테스트 **46개 이상** 추가 (누적 297개 → 343개)

---

## S12 완료 조건 종합

- [ ] Monaco Editor 기반 코드 편집 + 실시간 미리보기
- [ ] PWA 설치 + 오프라인 대시보드 접근
- [ ] 커스텀 도메인 연결 + DNS 검증
- [ ] 빌드 통과, 기존 기능 회귀 없음

---

## 전체 Sprint 의존성 그래프 (S0~S12)

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
