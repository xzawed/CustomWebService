# 배포 가이드

> **최종 업데이트:** 2026-04-12  
> **플랫폼:** Railway (자동 배포, main 브랜치 push 시)

---

## 1. 배포 프로세스

### 플랫폼 자체 배포 (CI/CD)

```
[개발자 Push] → [GitHub] → [Railway 자동 빌드] → [프로덕션 배포]
                    │
                    └─→ [GitHub Actions]
                          ├── 린트 검사
                          ├── 타입 검사
                          └── 테스트 실행
```

### 사용자 생성 서비스 배포

```
[코드 생성 완료]
    │
    ├── 1. GitHub 저장소 자동 생성
    │      (Organization 하위, Template 저장소 기반)
    │
    ├── 2. 생성된 코드 Push
    │      (API 키는 환경변수로 분리)
    │
    ├── 3. 배포 플랫폼 연동
    │      ├── Railway: Railway CLI → 자동 배포
    │      └── GitHub Pages: gh-pages 브랜치 → 자동 배포
    │
    └── 4. 환경변수 설정
           (API 키 등을 배포 플랫폼에 주입)
```

### 배포 플랫폼 선택 기준

| 조건 | 추천 플랫폼 | 구현 상태 |
|------|------------|-----------|
| 정적 사이트 (HTML/CSS/JS만) | GitHub Pages | ✅ `GithubPagesDeployer.ts` |
| API 프록시 필요 (API 키 보호) | Railway | ✅ `RailwayDeployer.ts` |

### 배포 Provider 구현 파일

- `src/providers/deploy/IDeployProvider.ts` - 배포 Provider 인터페이스
- `src/providers/deploy/RailwayDeployer.ts` - Railway 배포
- `src/providers/deploy/GithubPagesDeployer.ts` - GitHub Pages 정적 배포
- `src/providers/deploy/DeployProviderFactory.ts` - 플랫폼별 Provider 팩토리
- `src/lib/deploy/githubService.ts` - GitHub REST API 연동
- `src/lib/deploy/railwayService.ts` - Railway GraphQL API 연동

---

## 2. CI/CD 파이프라인

```
Push → GitHub Actions
  ├── pnpm lint
  ├── pnpm type-check  
  ├── pnpm test
  └── Railway 자동 배포 (main 브랜치)
```

GitHub Actions 설정: `.github/workflows/ci.yml`

### 상세 파이프라인 흐름

```
┌───────────────────────────────────────────────────┐
│  ci.yml                                           │
│                                                   │
│  1. lint-and-typecheck (병렬)                      │
│     └── ESLint + TypeScript noEmit                │
│                                                   │
│  2. test (needs: lint-and-typecheck)              │
│     └── pnpm test (Vitest)                        │
│     └── 커버리지 artifact 업로드                   │
│                                                   │
│  3. build (needs: test)                           │
│     └── pnpm build (Next.js)                      │
│                                                   │
│  4. deploy (needs: build)                         │
│     └── main push + 실제 배포 시에만               │
│     └── Railway CLI (`railway up --detach`)       │
└───────────────────────────────────────────────────┘

※ 테스트 실패 시 → 빌드 차단 → 배포 차단
```

### 스케줄 자동화 (`.github/workflows/scheduled.yml`)

| 작업 | 주기 |
|------|------|
| 무료 API 상태 점검 | 매일 06:00 KST |
| DB 용량/한도 체크 | 매일 09:00 KST |
| 비활성 프로젝트 정리 | 매주 월요일 |
| 의존성 보안 스캔 (Dependabot) | 매주 월요일 |

### 사용 도구 및 무료 한도

| 도구 | 용도 | 무료 한도 |
|------|------|-----------|
| **GitHub Actions** | CI 파이프라인 | 2,000분/월 |
| **Railway** | 배포 (Preview + Production) | $5 무료 크레딧/월 |
| **Vitest** | 단위/통합 테스트 | OSS |
| **Sentry** | 에러 추적 | 5,000 이벤트/월 |
| **UptimeRobot** | 가동 모니터링 | 50 모니터 |

---

## 3. 환경변수 설정 (Railway)

전체 환경변수 목록: `docs/reference/env-vars.md`

Railway 대시보드 → Variables 탭에서 설정.  
`NEXT_PUBLIC_*` 변수는 빌드 타임에 주입되므로 변경 시 재배포 필요.

### 환경별 설정

| 환경 | URL | 용도 |
|------|-----|------|
| Local | localhost:3000 | 개발 |
| Preview | pr-*.up.railway.app | PR 미리보기 |
| Production | xzawed.xyz | 프로덕션 |

---

## 4. 도메인 설정

### Cloudflare DNS 설정

Railway 대시보드의 Railway URL(`r4r002eg.up.railway.app`)을 Cloudflare CNAME으로 연결:

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| `CNAME` | `@` | `r4r002eg.up.railway.app` | 켜기 (주황색 구름) |
| `CNAME` | `*` | `r4r002eg.up.railway.app` | 켜기 (주황색 구름) |

> DNS 변경사항이 전 세계에 퍼지는 데 최대 24시간 걸릴 수 있습니다.  
> 보통 Cloudflare는 5분 이내에 반영됩니다.

### Railway 커스텀 도메인 연결

Railway 대시보드 → 서비스 → Settings → Networking → Custom Domain:

1. `xzawed.xyz` 추가
2. `*.xzawed.xyz` 추가 (서브도메인용)
3. 각 도메인 상태가 **"Active"** (초록색)인지 확인

### Supabase OAuth 리다이렉트 URL 업데이트

Supabase Dashboard → Authentication → URL Configuration:

- **Site URL**: `https://xzawed.xyz`
- **Redirect URLs**에 추가:
  - `https://xzawed.xyz/callback`
  - `https://r4r002eg.up.railway.app/callback`
  - `http://localhost:3000/callback` (개발용, 유지)

### 서브도메인 라우팅

`middleware.ts`에서 Host 헤더를 감지하여 `/site/[slug]`로 rewrite.  
환경변수 `NEXT_PUBLIC_ROOT_DOMAIN=xzawed.xyz` 설정 필요.

---

## 5. 무료 티어 한도

| 서비스 | 무료 한도 | 예상 사용량 | 여유도 |
|--------|-----------|------------|--------|
| **Railway** | $5 무료 크레딧/월, 500시간 실행 | ~$3/월 | 충분 |
| **Supabase** | 500MB DB, 5GB 대역폭, 50K MAU | ~50MB DB | 충분 |
| **GitHub** | 무제한 저장소, Actions 2000분/월 | ~200분/월 | 충분 |
| **Claude API** | 사용량 기반 과금 | ~50 요청/일 | 보통 |
| **Sentry** | 5,000 이벤트/월 | ~500/월 | 충분 |
| **UptimeRobot** | 50 모니터 | ~10 모니터 | 충분 |
| **Resend** | 100 이메일/일 | ~10/일 | 충분 |

> 상세 한도 관리 전략: `docs/guides/operations.md` 참조
