# 배포 가이드

> **언제 읽나**: CI 워크플로(`.github/workflows/ci.yml`)·`Dockerfile`·`railway.toml`·도메인 연결을 손댈 때

> **최종 업데이트:** 2026-08-01  
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

### 사용자 생성 서비스 “배포” = 서브도메인 게시

외부 GitHub/Railway export 스택은 **2026-08-01 제거**됐다.
[ADR](../decisions/2026-08-01-remove-external-deploy-stack.md)

```
[코드 생성 완료]
    │
    ├── 1. POST /api/v1/projects/:id/publish  (slug 확정)
    │
    ├── 2. middleware Host 감지 → /site/[slug] rewrite
    │
    └── 3. 공개 URL: https://{slug}.xzawed.xyz
           (API 키는 플랫폼 프록시 /api/v1/proxy 로 보호)
```

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

### 카탈로그·키 검증 (배포 런타임 관리자 API)

Supabase 의존 CI cron(`.github/workflows/scheduled.yml`)과 CLI
`pnpm catalog:healthcheck` / `pnpm keys:verify`는 **SQLite 컷오버로 제거**됐다.

| 목적 | 현행 메커니즘 | 로직 |
|------|--------------|------|
| 플랫폼 API 키 설정·형식 검증 | `GET /api/v1/admin/keys-verify` (`ADMIN_API_KEY`) | `src/lib/catalog/keyCheck.ts` |
| 활성 카탈로그 라이브 검증·`verification_status` 갱신 | `POST /api/v1/admin/verify-catalog` (`ADMIN_API_KEY`) | `src/lib/catalog/verifyRunner.ts` + `healthCheck.ts` |
| QC·서비스 헬스 관측 | `qc-monitor.yml` → `/api/v1/admin/qc-stats`, `/api/v1/health` | — |

자동 스케줄러 대신 **관리자 트리거**를 택한 이유: 일시 장애로 broken 플래핑·무인 outbound를 피하기 위함.
배경: [docs/decisions/2026-06-21-api-catalog-health-monitoring.md](../decisions/2026-06-21-api-catalog-health-monitoring.md)

### 사용 도구 및 모니터링

| 도구 | 용도 | 비고 |
|------|------|------|
| **GitHub Actions** | CI 파이프라인 | lint → type-check → test → build → deploy |
| **Railway** | 배포 (단일 인스턴스 + Volume) | SQLite 경로 `/data/app.db` |
| **Vitest** | 단위/통합 테스트 | OSS |
| **Slack** (`#alerts`) | 에러·백업 경보 sink | `SLACK_WEBHOOK_URL` — **Sentry SaaS 미도입·스캐폴딩 제거** (#220 · C4) |
| **UptimeRobot** 등 | 가동 모니터링 | 선택 |

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

## 4. Playwright QC 환경 구성 (Dockerfile)

`ENABLE_RENDERING_QC=true` 시 서버에서 Chromium을 실행하여 렌더링 품질을 검사합니다. 이 환경을 구성하는 데 중요한 두 가지 사항이 있습니다.

### Alpine Chromium 패키지

Stage 3 (runner)에서 시스템 Chromium을 직접 설치합니다:

```dockerfile
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
```

Railway 환경변수 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`도 함께 설정해야 합니다.

### playwright-core browsers.json 복사 (nft 동적 require 우회)

Next.js standalone 빌드는 nft(Node File Tracer)로 필요한 파일만 복사합니다. playwright-core의 `coreBundle.js`가 `require(path.join(__dirname, '..', 'browsers.json'))`으로 `browsers.json`을 동적 로드하는데, nft는 동적 require를 추적하지 못해 standalone에서 파일이 누락됩니다.

Dockerfile Stage 2에서 빌드 후 명시적으로 복사합니다:

```dockerfile
RUN find /app/.next/standalone/node_modules -path "*/playwright-core/lib/coreBundle.js" | \
    while read f; do \
      dest="$(dirname "$(dirname "$f")")/browsers.json"; \
      [ ! -f "$dest" ] && cp /app/node_modules/playwright-core/browsers.json "$dest"; \
    done
```

> **playwright-core 버전 업그레이드 시 주의**: `lib/coreBundle.js` 경로가 변경되면 복사가 되지 않아 런타임에만 크래시가 발생합니다(`browsers.json` 파일 부재). Dockerfile에 검증 단계가 포함되어 빌드 시 조기 감지됩니다.

---

## 6. 도메인 설정

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

### 인증 콜백 (Auth.js local)

OAuth/Supabase Auth 경로는 **2026-06-23 컷오버로 제거**됐다. 현행은 Auth.js v5 Credentials + JWT.
공개 URL·이메일 링크 base는 `APP_URL` / `NEXT_PUBLIC_ROOT_DOMAIN`으로 설정한다
(호스트 헤더 미신뢰 — reset poisoning 차단). 상세: [auth.md](../architecture/auth.md), [env-vars.md](../reference/env-vars.md).

### 서브도메인 라우팅

`middleware.ts`에서 Host 헤더를 감지하여 `/site/[slug]`로 rewrite.  
환경변수 `NEXT_PUBLIC_ROOT_DOMAIN=xzawed.xyz` 설정 필요.

---

## 7. 비용·한도 참고

한도 숫자는 플랜·시점에 따라 바뀌므로 **대시보드 실측이 진실원**이다.
Trial $5·Supabase 500MB·Sentry 이벤트 같은 **폐기 수치는 적지 않는다** (WBS D-e / [operations.md](operations.md)).

| 서비스 | 역할 |
|--------|------|
| **Railway** | 앱 + Volume (SQLite) |
| **GitHub Actions** | CI |
| **Claude API** | 생성·추천 (사용량 과금) |
| **Resend** | 인증·재설정 이메일 |
| **Slack** | 운영 경보 (`#alerts`) |

> 일상 운영·모니터링·백업·장애 대응: [operations.md](operations.md)
