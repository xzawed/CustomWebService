# CustomWebService — Claude Code 지침

## 프로젝트 개요

AI 기반 노코드 플랫폼. 무료 API를 선택하고 서비스를 설명하면 AI가 HTML/CSS/JS를 생성하여 서브도메인(`slug.xzawed.xyz`)으로 즉시 게시.

- 서비스 URL: https://xzawed.xyz
- 배포: Railway (단일 인스턴스, Dockerfile, standalone output)
- 프로덕션 운영 중 (실사용자 서비스), 안정화 및 품질 개선 단계

## 작업 게이트 (모든 작업에 선행 — 이 절만은 건너뛰지 말 것)

아래는 취향이 아니라 **실제로 거짓보고를 만든 경로**다. 2026-08-05 세션 전수 분석에서
라이브 실측이 문서·합성 근거를 **8회** 뒤집었고, 원인은 문서 부족이 아니라 여기 적힌 것들이었다.
근거: [docs/guides/agent-working-rules.md](docs/guides/agent-working-rules.md)

### G1. 증거 등급을 섞지 말 것

**라이브 실측 > 코드 읽기 > 문서 > 합성 테스트.** 낮은 등급을 높은 등급의 어조로 보고하는 것이
"거짓보고"의 정체다. 보고 문장에 등급이 드러나야 한다 — *"실측했다"* / *"코드상 그렇다"* /
*"문서에 그렇게 적혀 있다"* / *"추정이다"*.

- 합성 테스트 2,433건 통과가 실제 응답 4건이 새는 것을 못 막았다. **초록색은 증거가 아니다.**
- 문서에 적힌 수치·목록은 **관측 시점의 사실**이다. 지금도 참인지는 명령으로 확인한다.

### G2. "동작한다"의 정의를 프록시 지표로 대체하지 말 것

**HTTP 200 ≠ 정상. `keys-verify` VALID ≠ 동작.** `keys-verify`는 *키가 주입되고 인증 경로가
하드 실패하지 않았다*만 말한다. 기능 정상성은 `looksLikeErrorBody`를 포함한 판정이다.

> 이 함정으로 **두 번** 사고가 났다 — REST Countries(2026-06-21), data.go.kr 4종(2026-08-05).
> 활성화 전 [ADR 2026-06-21](docs/decisions/2026-06-21-api-catalog-health-monitoring.md)을 열 것.

### G3. 완료 선언은 잔여 목록과 함께만

**"남은 것 없음"·"오너 액션만 남음"을 잔여 항목 열거 없이 쓰지 않는다.** 한 세션에서 3번 그렇게
말했고 3번 다 코드 작업이 더 나왔다. 형식: *"오너: X / 코드 미해결: Y / 확인 못 한 것: Z"*.

### G4. 균일한 결과는 도메인 결론 전에 방법을 의심할 것

*"61개 전부 그렇다"*, *"경로 5개 전부 실패"* 처럼 **너무 깨끗한 결과**는 대개 쿼리·전제 버그다.
실제로 `.params`(존재하지 않음)와 `.parameters`(실제 필드)를 혼동해 "61개 전부 미정의"라고
보고한 적이 있다. 결론 내기 전에 **원본 객체 하나를 통째로 출력**해 볼 것.

### G5. 모르는 것은 추측하지 말고 "모름"으로 보고할 것

경로·서비스명·파라미터를 지어내 프로브하는 것은 작업이 아니다(TAGO 지하철 5개 전부 오답).
공식 문서·`example_call`·실제 동작 예시가 없으면 **"미상 — 차단됨"** 으로 올린다.

### G6. 도메인을 건드리기 전에 해당 ADR을 열 것

`docs/decisions/` 42개 전부 첫 줄에 **`> 언제 읽나`** 트리거가 있다. 손대려는 파일·함수·env가
그 트리거에 있으면 **읽고 시작한다.** ADR은 "왜 이렇게 됐는지"이고, 대부분 **이미 한 번 사고가 난 것**이다.

## 기술 스택

| 영역 | 기술 |
|------|------|
| Framework | Next.js 16+ (App Router, TypeScript strict) |
| UI | React 19, Tailwind CSS 4, Lucide React |
| State | Zustand (분리 스토어 + persist middleware) |
| Form | React 로컬 상태(`useState`) + Zod (서버 검증) — React Hook Form 미사용 |
| Database | 임베디드 SQLite (better-sqlite3 + drizzle-orm, WAL · Railway Volume `/data/app.db`) |
| Auth | Auth.js v5 (Credentials + JWT 무상태) — 공개 셀프서비스 회원가입, DB 사용자별 scrypt 인증, 이메일 인증 게이트 |
| AI | Claude API (Anthropic SDK, claude-opus-5 기본, 조건부 Extended Thinking) |
| Testing | Vitest, happy-dom, MSW |
| CI/CD | GitHub Actions → lint → type-check → test → build → deploy |
| Package Manager | pnpm |

## 모듈 지도 — 어느 파일이 어떤 규칙을 소유하는가

레이아웃: `src/` = `app`(App Router 라우트) · `components` · `hooks` · `lib`(도메인 로직) ·
`providers`(AI) · `repositories` · `services` · `stores` · `types` · `data`(부팅 시드) · `__tests__`·`test`.
**파일 목록은 glob으로 확인한다** — 여기엔 목록이 아니라 **불변조건의 소유자**만 적는다.
(파일 개수·행 수 같은 스냅샷 수치는 적지 않는다. 썩고, 모델은 그걸 믿는다.)

| 소유자 | 소유한 규칙 |
|---|---|
| `middleware.ts` | 서브도메인 rewrite · CSP/HSTS. **Edge runtime** — Node 전용 모듈 금지, 인증은 `local-auth-edge` 동적 import만 |
| `lib/proxy/resolveProxyContext` | site·app 프록시 인가 **단일 진입점**. 라우트에 인가 분기를 새로 만들지 말 것 |
| `lib/cache/proxyCache` | `buildCacheKey` 4번째 인자 **키 신원 필수** — 없으면 교차 테넌트 유출 |
| `lib/catalog/healthCheck` | 정상/고장 판정. **HTTP 200+에러 본문**을 여기서 잡는다 |
| `lib/catalog/keyCheck` | **키 인증 검증 전용 — 동작 판정이 아니다**(활성화 게이트로 쓰지 말 것) |
| `lib/catalog/activeApiCount` | 활성 개수 **동적 카운트 — 하드코딩 금지** |
| `lib/ai/generationLock` | 중복 생성 차단(DB 락). `generationTracker`는 **진행률 전용** |
| `lib/auth/rateLimit` | `getClientIp` **단일 출처** — XFF **최우측**만 신뢰 |
| `lib/auth/local-auth*` | Credentials+JWT. **edge-safe 분할**(base/edge) — middleware에서 scrypt 쪽을 정적 import 금지 |
| `lib/config/featureFlags` | DB 기반 운영 킬스위치. 재배포 없이 즉시 반영 · **fail-open** |
| `lib/constants/cdn` | CSP CDN 화이트리스트 **단일 출처** (`buildSiteCsp`) |
| `lib/db/sqlite/ensureCatalog` | 부팅 시 구조 동기화. **`is_active`·`verification_status`는 절대 안 건드린다** |
| `lib/events/eventPersister` | 모든 도메인 이벤트 자동 DB 기록(감사 로그) |
| `repositories/factory` | **무인자** SQLite 생성 — 클라이언트 주입 금지 |
| `src/data/*.json` | 부팅 시드(프로덕션 미러). **JSON만 고쳐선 기존 행이 안 바뀐다** → `ensureCatalog` 구조 패치 |

## 개발 명령어

```bash
pnpm dev              # 개발 서버 (Turbopack)
pnpm build            # 프로덕션 빌드
pnpm lint             # ESLint 검사 (CI 게이트)
pnpm lint:fix         # ESLint 자동 수정
pnpm type-check       # TypeScript 타입 검사 (CI 게이트)
pnpm test             # 전체 테스트 (CI는 test:coverage로 전체 실행)
pnpm test:unit        # 단위 테스트 (lib, providers, services, repositories)
pnpm test:integration # 통합 테스트 (API routes — src/__tests__/api + src/app/api)
pnpm test:coverage    # 커버리지 리포트
pnpm test:e2e         # E2E (Playwright — 실 백엔드 env 필요, CI에서 실행)
```

```bash
# 운영 스크립트
pnpm countries:generate  # 국가 데이터(src/data/countries.json) 재생성 (준-정적)
pnpm countries:check     # 쓰기 없이 업스트림 드리프트 검사 — 0 동일 / 1 드리프트 / 2 업스트림 도달 실패
pnpm ai:contract-check   # AI 규약 드리프트 검사 — 0 유지 / 1 드리프트 / 2 도달 실패
```

> `pnpm admin:hash`(단일 관리자 해시 생성)는 다중 사용자 전환(2026-06-24)으로 **제거됨**. 계정 생성은 `/signup` 공개 페이지를 통해 수행한다.

> 카탈로그 키 검증은 배포 런타임 관리자 엔드포인트 `GET /api/v1/admin/keys-verify`로 수행한다.
> (Supabase 의존 CLI 스크립트 `catalog:healthcheck`·`keys:verify`·`seed:generate`·`cutover:migrate`는 SQLite 컷오버로 제거됨.)

> 포맷팅은 ESLint 규칙으로 통합 관리한다. `prettier`는 의존성에 없으며 `format`/`format:check`
> 스크립트는 제거됨(2026-06-09 감사). 포맷은 `pnpm lint`/`lint:fix`로 처리.

## 코딩 컨벤션

- **TypeScript strict mode** — `any` 사용 금지, export 함수에 명시적 반환 타입
- **Path alias**: `@/*` → `src/*`
- **API 라우트**: `/api/v1/*` 패턴 — 인증 + 유효성 검증 → Service 호출
- **아키텍처 레이어**: Route Handler → Service → Repository → SQLite (better-sqlite3, 무인자 factory)
- **AI Provider**: `IAiProvider` 인터페이스 — Provider 전용 로직은 Provider 내부에만
- **이벤트 시스템**: `EventBus` + `EventRepository` (감사 로그)
- **레이트리밋**: 혼합 패턴 — generate/regenerate/suggestion은 SQLite 원자적 (better-sqlite3 동기 트랜잭션 `BEGIN` + `UPDATE WHERE count < limit RETURNING`, 단일 writer), proxy는 인메모리 Map (단일 인스턴스 전제). 외부 deploy 일일 한도는 2026-08-01 제거
- **요청 추적**: `X-Correlation-Id` 헤더
- **i18n**: `@/lib/i18n`의 `t()` 함수 사용, 한국어 기본
- **스토어**: 관심사별 분리된 Zustand 스토어 (단일 mega store 금지)
- **에러 처리**: `@/lib/utils/errors`의 커스텀 에러 클래스 사용
- **테스트**: 소스 옆 co-located `*.test.ts` 또는 `src/__tests__/`

## 핵심 설계 결정

- **서브도메인 라우팅**: middleware에서 Host 헤더 감지 → `/site/[slug]` rewrite
- **Standalone output**: Docker/Railway 배포를 위한 Next.js standalone 모드
- **보안 헤더**: middleware에서 CSP, HSTS, X-Frame-Options 설정
- **코드 생성 결과물**: React가 아닌 순수 HTML/CSS/JS (사용자 서비스용)
- **설정 기반 제한**: 환경변수로 생성 한도/버전 수 등 비즈니스 규칙 조절
- **모바일 백그라운드 생성**: SSE + 폴링 이중 구조 — `generationTracker` (서버 메모리, `generating` 30분 / `completed`·`failed` 10분 차등 TTL), 클라이언트 `visibilitychange` 감지 + `/api/v1/generate/status/:projectId` 폴링 fallback
- **AI 성능 최적화**: Prompt Caching (`ephemeral`), 조건부 Extended Thinking (`evaluateComplexityScore()` ≥ `ET_COMPLEXITY_THRESHOLD`(기본 35) 시 `thinking: { type: 'adaptive' }` + `output_config: { effort: 'high' }`), 조건부 Stage 2/3 스킵으로 비용·속도 최적화

## 환경변수 (참고용 — 값 절대 포함 금지)

- `AUTH_SECRET` — Auth.js JWT 세션 서명 키 (필수)
- `AUTH_TRUST_HOST=true` — 커스텀 도메인/프록시 뒤 필수 (없으면 `/api/auth/*` 500)
- `NEXT_PUBLIC_AUTH_PROVIDER=local` — 클라이언트 빌드타임 상수
- `RESEND_API_KEY` — 이메일 발송 Resend API 키 (미설정 시 콘솔 no-op 폴백 — 이메일 실제 미발송)
- `EMAIL_FROM` — 발신자 주소 (예: `noreply@xzawed.xyz`, `RESEND_API_KEY` 설정 시 필수. 빈 문자열 금지 — 발송 실패)
- `APP_URL` — 이메일 링크(인증·재설정)의 공개 base URL (예: `https://xzawed.xyz`). 미설정 시 `NEXT_PUBLIC_ROOT_DOMAIN`→요청 origin 폴백. 프록시 뒤 0.0.0.0 링크 방지 + 호스트 헤더 미신뢰(reset poisoning 차단). 로직: `getBaseUrl`(`src/lib/auth/routeHelpers.ts`)
- `SQLITE_PATH` — 기본 `/data/app.db`. **Railway Volume 마운트 필수** — 아니면 재배포마다 데이터가 사라진다
- `ENCRYPTION_KEY` — 사용자 API 키 암호화 · `ADMIN_API_KEY` — 관리자 API 인증
- `GENERATION_LOCK_STALE_MS` > `GENERATION_LOCK_HEARTBEAT_MS` — 어기면 `heartbeat × 2`로 **조용히 교정**된다
- `GITHUB_TOKEN` / `GITHUB_ORG` / `RAILWAY_TOKEN` — **제거됨·미사용**. 다시 쓰지 말 것 [ADR](docs/decisions/2026-08-01-remove-external-deploy-stack.md)

> ⚠️ **빈 문자열은 "미설정"과 같다.** 코드가 `if (!value)`로 검사하므로 값이 `""`면 없는 것과 동일하게
> 동작한다. 점검할 때 **키 존재가 아니라 값 길이를 볼 것.** `SLACK_WEBHOOK_URL`·`EMAIL_FROM`이 그렇고,
> 2026-08-05에 Railway의 `API_KEY_*` 24개 중 14개가 빈 문자열이었다(설정된 것처럼 보였다).

**나머지 전부**(AI 모델·Quality Loop·QC 임계·백업 주기·레이트리밋 등)는
**[docs/reference/env-vars.md](docs/reference/env-vars.md)가 유일한 진실원**이다. 여기에 복제하지 말 것 —
두 곳에 적히는 순간 한쪽이 썩는다.

## 문서 참조

에이전트가 매 세션 열 네비게이션 맵. **전체 목록·ADR 카탈로그·문서 진실 정책은 [docs/README.md](docs/README.md).**  
(현재 시제 = 이 파일 + `docs/architecture|guides|reference|security`. 역사 = `docs/decisions/` 또는 `docs/archive/`(`DO_NOT_EXECUTE`). **두 번째 규칙서·`.claude/docs` 미러 금지** — 근거는 docs/README 정책 절.)

| 질문 | 참조 문서 |
|------|-----------|
| **불변조건·계약 (깨면 조용히 사고 나는 것들)** | [docs/architecture/system-spec.md](docs/architecture/system-spec.md) |
| **테스트 전략·함정** | [docs/guides/testing.md](docs/guides/testing.md) |
| **테스트 커버 범위·공백** | [docs/reference/test-coverage-map.md](docs/reference/test-coverage-map.md) |
| **잔여작업 전체 지도 (백로그 진실원)** | [docs/superpowers/plans/2026-07-31-project-wbs.md](docs/superpowers/plans/2026-07-31-project-wbs.md) |
| AI 코드 생성 흐름 | [docs/architecture/ai-pipeline.md](docs/architecture/ai-pipeline.md) |
| 코드 생성/재생성 QC **(필수)** | [docs/guides/qc-process.md](docs/guides/qc-process.md) |
| 환경변수 목록 | [docs/reference/env-vars.md](docs/reference/env-vars.md) |
| API 엔드포인트 | [docs/reference/api-endpoints.md](docs/reference/api-endpoints.md) |
| **에이전트 작업 규율 — 게이트 G1~G6의 근거** | [docs/guides/agent-working-rules.md](docs/guides/agent-working-rules.md) |
| 일상 운영·모니터링·백업 | [docs/guides/operations.md](docs/guides/operations.md) |
| **배포했는데 반영이 안 될 때** (조용한 미배포 2종) | [docs/guides/railway-deploy-troubleshooting.md](docs/guides/railway-deploy-troubleshooting.md) |
| SQLite 복구 런북 | [docs/guides/sqlite-restore-runbook.md](docs/guides/sqlite-restore-runbook.md) |
| 시크릿 노출·회전 | [docs/security/incident-response.md](docs/security/incident-response.md) |
| 에러 코드 | [docs/reference/error-codes.md](docs/reference/error-codes.md) |
| 개발 환경·팩토리 규칙 | [docs/guides/development.md](docs/guides/development.md) |
| 설계 결정(ADR) 전체 | [docs/decisions/](docs/decisions/) · 목록은 [docs/README.md](docs/README.md) |
| 컷오버 등 **비실행** 역사 | [docs/archive/](docs/archive/) |
| 문서 인덱스·anti-recurrence | [docs/README.md](docs/README.md) |
| 슬래시 커맨드 체크리스트 only | [.claude/commands/](.claude/commands/) |

- [README.md](README.md) — 제품 정문·설치 퀵스타트
- [Agents.md](Agents.md) — **포인터 only** (규칙 본문 복제 금지)
- [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md) — PR 템플릿
- [.scamanager/](.scamanager/) — pre-push 자동 코드리뷰 훅 (`install-hook.sh`로 설치)

## 배포 품질 원칙 (필수)

이 서비스는 다수 사용자가 이용 중입니다. 배포 품질 = 서비스 신뢰도.

### CSP / 보안 헤더 변경 시
- `src/middleware.ts`, `src/app/site/[slug]/route.ts`, `src/app/api/v1/preview/[projectId]/route.ts` 3개 파일을 반드시 동시에 확인 (전체 경로 기준 — 이름만으로는 못 찾음)
- CSP 헤더가 2중 적용되는 경로가 없는지 검증 (HTTP 표준: CSP 2개면 둘 다 적용)
- 프롬프트가 사용하는 CDN이 CSP에서 허용되는지 확인

### 서빙 파이프라인 변경 시
- 미리보기, 게시(직접), 게시(서브도메인) 3가지 경로 모두 추적
- assembleHtml() 변경 시 CSS/JS 누락 여부 확인
- "A에서는 되지만 B에서는 안 된다" 같은 경로별 차이가 없어야 함
- **서브도메인 rewrite 예외**: `src/middleware.ts`의 `SUBDOMAIN_PASSTHROUGH_PREFIXES`에 있는 경로만 `/site/{slug}` rewrite를 건너뛴다. 게시 사이트의 생성 JS가 상대경로 `/api/v1/proxy`로 호출하므로 이 예외가 없으면 API 데이터가 전부 404가 된다(미리보기는 apex라 정상 동작해 드러나지 않음 — 2026-07-28 실측 발견). 새 경로 추가 시 최소 노출 원칙 유지
- **프록시 인가는 `resolveProxyContext()` 단일 진입점**: site(익명·Host 바인딩)/app(세션·소유권 강제) 판정이 이 한 곳에 있다. 라우트에 인가 분기를 새로 만들지 말 것 — 판단이 흩어져 개인 키 해석부가 소유권을 확인하지 않던 것이 H-1이었다. 소유권은 `assertOwner` 재사용, Host로 프로젝트가 확정되면 클라이언트 `projectId`는 무시. 배경: [ADR](docs/decisions/2026-07-28-published-site-proxy-authz.md)

- **프록시 캐시 키에는 반드시 키 신원을 넣는다**: `buildCacheKey(apiId, proxyPath, params, keyIdentity)`의 4번째 인자는 **필수**다(선택으로 두면 잊었을 때 조용히 교차 테넌트 유출이 돌아온다). `keyIdentity`는 실제로 주입된 키의 `keyFingerprint()`(sha256 앞 16자)이고 주입이 없으면 `NO_KEY_IDENTITY`(`'none'`). 익명 site 모드가 **오너의 개인 키로 업스트림을 호출**하므로 키가 다르면 캐시 항목도 달라야 한다. 원문을 넣지 말 것 — 캐시 키는 로그·디버깅에서 보일 수 있다. 플랫폼 키도 지문을 쓰며(동작 동일 + 키 교체 시 자동 무효화), 응답 본문은 여전히 메모리에 평문이므로 민감 데이터 API에 `cacheTtlSeconds`를 부여할 때는 별도 검토 필요. 배경: [ADR](docs/decisions/2026-07-29-proxy-cache-key-identity.md)

### 코드 수정 후
- 수정한 함수/파일을 호출하는 모든 경로를 나열하고 각각 검증
- 단일 파일만 보고 끝내지 않고 cross-cutting concern(미들웨어, 공통 함수) 영향 확인

### railway.toml `startCommand` 금지 (비root 실행 유지)
- Railway는 **Dockerfile 배포에서 `startCommand`로 이미지의 `ENTRYPOINT`를 덮어쓴다**([공식 문서](https://docs.railway.com/deployments/start-command): *"the start command overrides the image's ENTRYPOINT in exec form"*)
- `startCommand`를 지정하면 `Dockerfile`의 `/docker-entrypoint.sh`(→ `chown /data` + `su-exec nextjs:nodejs`)가 실행되지 않아 **컨테이너가 root로 뜬다**. Dockerfile에 `USER` 지시자가 없는 이유는 마운트 볼륨 쓰기 크래시 때문(의도적)
- 기동 명령을 바꿔야 하면 `startCommand`가 아니라 `docker-entrypoint.sh`의 `exec su-exec ...` 줄을 고칠 것
- 2026-07-10 수정 이력: `startCommand = "node server.js"` 제거로 비root 실행 복원

### 클라이언트 IP 도출 규칙 (레이트리밋)
- `x-forwarded-for`는 **최우측** 항목만 신뢰한다. 최좌측은 클라이언트가 위조할 수 있어 per-IP 리밋이 무력화된다
- 단일 출처: `getClientIp()`(`src/lib/auth/rateLimit.ts`) — `adminAuth.verifyAdminKey()`와 동일 규칙. 새 리밋을 추가할 때 XFF를 직접 파싱하지 말 것
- **`x-real-ip`는 신뢰하지 않는다**(2026-07-29). 신뢰 경계가 붙였다는 보장이 없어 클라이언트가 위조·회전할 수 있고, 폴백을 두면 XFF 없는 경로에서 per-IP 한도가 무력화된다. 식별 불가 시 `'unknown'` 단일 버킷으로 fail-closed

### 인메모리 레이트리밋 구현 규칙
- **LRU eviction으로 활성 윈도를 버리지 말 것**. 용량 초과 시 살아 있는 카운터가 evict되면 다음 요청이 `count:1`로 시작해 한도가 우회된다(동시 사용자가 많을수록 심해짐 — 2026-07-29 수정)
- 올바른 패턴: 만료 버킷만 정리하고, 정리 후에도 자리가 없으면 **새 키를 거부(차단)**한다. 우회보다 과차단이 안전하다. 구현 참고: `src/lib/proxy/siteRateLimit.ts`, `checkProxyRateLimit`(`proxy/route.ts`), `src/lib/auth/rateLimit.ts`, `src/lib/utils/adminAuth.ts`(2026-08-03 C3로 합류 — 인메모리 리밋에 예외는 이제 없다)
- **읽기 전용 검사(`isLimited`)는 없는 키라도 cap이 가득이면 `true`를 반환할 것**(fail-closed). 아니면 키를 회전시켜 "첫 실패는 항상 공짜"를 무한히 얻는다
- `src/lib/auth/rateLimit.ts`는 signup·forgot·resend·login이 **Map 하나를 공유**한다. `MAX_AUTH_RATE_LIMIT_BUCKETS`(기본 10000) 소진 시 signup·forgot이 과차단될 수 있으며 이는 의도된 fail-closed다

### 로그인 스로틀 (`authorizeWithLoginRateLimit`)
- **계정 버킷은 조회된 사용자가 아니라 "제출된 이메일"로 키를 잡는다.** 미존재/존재가 같은 동작을 해야 계정 존재 여부가 새지 않는다
- **실패만 세고, 성공하면 이메일 키만 지운다**(IP 키는 유지 — 공유 NAT에서 한 명의 성공이 전체 예산을 리셋하면 약해진다)
- **한도 초과 시 `return null`.** 일반 `Error`를 던지면 Auth.js가 `CallbackRouteError`로 감싸 클라이언트에 `error=Configuration`으로 보인다(서버 버그처럼 보임). 향후 UX 코드를 붙이더라도 IP/계정·존재 여부에 따라 코드를 달리하면 오라클이 되므로 **항상 같은 코드**여야 한다
- 한도 검사는 **DB 조회·scrypt 이전에** 한다
- **`authorize`의 `request`는 `@auth/core`가 재구성한 것**이다(`new Request(url, { headers, method, body })`). 헤더가 빠지면 `getClientIp`가 조용히 `'unknown'`으로 붕괴해 per-IP 한도가 사실상 사라진다 — `local-auth-config.test.ts`의 XFF 회귀 테스트가 이 결합을 고정한다. 배경: [ADR](docs/decisions/2026-07-30-login-rate-limit.md)

### site 프록시 한도는 관측하면서 조정한다
- 프로젝트 전역 한도(`SITE_PROXY_PROJECT_LIMIT_PER_MIN`, 기본 120)가 **분산 IP로도 우회되지 않는 실질 상한**이다. 도달하면 `logger.warn('Site proxy project limit reached')`가 **버킷당 윈도 1회** 남는다(봇이 두드릴 때 로그가 폭발하므로 매 요청 로깅 금지)
- 사용량은 `GET /api/v1/admin/site-proxy-stats`(ADMIN_API_KEY)로 본다. `blockedByIp`(방문자 과속 — 정상일 수 있음)와 `blockedByProject`(**0이 아니면 오남용 또는 한도 부족**)를 반드시 구분해 해석할 것. 집계는 인메모리라 재시작 시 초기화된다
- 기본값 20/120은 실사용 데이터 없이 정한 값이다. **조정 판단 기준표가 [ADR](docs/decisions/2026-07-29-site-proxy-abuse-monitoring.md)에 고정**되어 있으니 임의로 바꾸지 말고 지표를 근거로 바꿀 것
- Slack 승격·Origin 바인딩은 **의도적으로 보류**했다(경보 임계를 정할 트래픽이 없고, Origin 헤더는 위조 가능해 단독 경계가 못 된다). 지표가 쌓인 뒤 판단한다

### AI 호출 타임아웃 규칙
- **타임아웃은 `Promise.race`만으로 끝내지 말고 `AbortSignal`을 함께 넘길 것**. race는 즉시 종료돼도 업스트림 호출은 SDK 타임아웃(최대 ~270초)까지 살아 있어, 다음 반복이 겹치면 **Opus/ET 토큰 비용이 이중 청구**된다. `AiPrompt.abortSignal` → `ClaudeProvider`의 `{ signal }`로 이미 배선되어 있다
- race에서 지는 쪽의 거부는 아무도 관측하지 않으므로 생성 Promise에 no-op `.catch()`를 미리 붙여 `unhandledRejection`을 막을 것 (`qualityLoop.ts` 참고)

### 백그라운드 스케줄러에 경보를 붙일 때 (백업·보존 등)
- **순서를 못박는다: `logger.error`(동기) → 상태 전이(동기) → 경보(`void Promise.resolve(alertFn(...)).catch(...)`).** 알림 실패가 스케줄러를 죽이면 **알림 없는 상태보다 엄격히 나쁘다**
- **`sendSlackAlert`에 비-reject 보장이 없다.** 내부 try/catch가 있지만 `try` 이전 경로·주입된 `alertFn`·향후 수정이 전부 위험이다. `scheduleBackups`의 `tick()`은 `void runFn(...).then(onOk, onErr)` 형태라 **핸들러가 던지거나 async 핸들러가 reject하면 `unhandledRejection`**이 된다 → `onReject` 안에서 `await alertFn`을 하지 말고 별도 voided promise로 분리할 것
- `errorRateMonitor`가 `await sendSlackAlert`를 해도 되는 이유는 `EventBus.emit`이 핸들러를 `.catch`로 감싸기 때문이다. **스케줄러에는 그 래퍼가 없다** — EventBus 소비자 코드를 그대로 복사하면 안 된다
- **매 주기 경보 금지 — 상태 전이만.** `null/true→fail` 1회(error), `fail→success` 1회(info 복구), 연속 실패는 억제. 최초 실행 실패도 경보한다(선행 성공을 기다리면 그게 조용한 죽음이다). 복구 경보를 빼면 억제가 정보를 삼킨다
- 상태는 **클로저 로컬**로 둘 것(모듈 레벨 플래그 금지) — 인스턴스 독립이라 테스트가 `vi.resetModules()`를 안 써도 된다. 배경: [ADR](docs/decisions/2026-07-30-monitoring-sink-slack-only.md)

### 의존성 감사 게이트 (`pnpm audit`)
- CI는 2단계로 실행한다: ① `pnpm audit --prod --audit-level=high`(**프로덕션 트리 하드 게이트**), ② `pnpm audit --audit-level=high`(전체 트리, 검토된 면제 적용)
- **감사는 트리 전체를 평가한다** — Dependabot이 패키지 하나만 올린 PR은 다른 취약점이 남아 있으면 무조건 실패한다. 보안 알림이 여러 건 쌓였으면 개별 PR을 하나씩 머지하려 하지 말고 **한 브랜치로 통합 상향**할 것 (2026-07-28: PR 4건이 전부 이 데드락으로 막혀 있었음)
- 면제는 `package.json`의 `pnpm.auditConfig.ignoreGhsas`에 등록하고 **근거는 반드시 [docs/security/audit-waivers.md](docs/security/audit-waivers.md)에 기록**한다(JSON에 주석 불가). 등록 기준: ① 상위 최신 버전에도 픽스 없음 ② 프로덕션 번들 미포함 ③ 공격자 통제 입력 아님 — 셋 다 충족 시에만
- **전이 의존성 오버라이드는 스코프를 좁힐 것**: `"brace-expansion@^5": "^5.0.8"`처럼 버전 범위를 명시한다. 전역 오버라이드는 메이저가 다른 소비자를 런타임에 깨뜨린다(v5 CJS는 named export라 `minimatch@3`의 `require(...)(pattern)` 호출이 깨짐 — 실증됨)
- `sharp`는 `next`의 optionalDependency(`^0.34.5`)라 상위 상향으로 패치 버전에 도달하지 못한다 → `pnpm.overrides`로 상향. 변경 시 **Alpine musl 프리빌트(`@img/sharp-linuxmusl-x64`) 존재 여부와 lockfile 등재를 반드시 확인**(Dockerfile이 `node:22-alpine`)

### 생성물의 Alpine.js 이중 init 금지
- Alpine은 마운트 시 `x-data` 객체의 **`init()`을 자동 호출**한다. 같은 요소에 `x-init="init()"`을 쓰면 **두 번 실행**되어 같은 API 요청이 동시에 두 번 나간다 — 업스트림 리밋이 빡빡한 API(예: OpenTDB 1req/5초)에서 두 번째가 429가 되고 사용자에게 오류 화면이 보인다(2026-07-29 프로덕션 실측)
- 2중 방어: ① `promptBuilder.ts`의 Alpine 절에 ❌/✅ 예시와 함께 명시 금지 ② `detectAlpineDoubleInit()`(`codeValidator.ts`)가 정적 검출해 `validateFunctionality` **경고**로 올린다. 보안 문제가 아니므로 `errors`가 아니라 `warnings` — 게시를 막지 않는다
- 검출 규칙은 **JS 본문을 보지 않는다**. `x-init`이 `init`이라는 이름의 메서드를 부르면 정의돼 있으면 이중 실행, 없으면 ReferenceError라 어느 쪽이든 버그이기 때문. 단어 경계를 쓰므로 `initialize()`·`initChart()`·`myInit()`은 잡지 않는다
- **프롬프트에 `x-init` 예시를 추가할 때 로더 이름을 `init`으로 짓지 말 것.** 원인은 프롬프트가 나쁜 예시를 준 게 아니라(당시 프롬프트엔 없었다) 모델이 로더를 자연스럽게 `init`으로 명명한 것이었다 — 좋은 예시만으로는 못 막고 명시 금지가 필요하다. 배경: [#204](https://github.com/xzawed/CustomWebService/issues/204)

### QC 프로세스 (생성/재생성 공통)
- **상세 절차**: [docs/guides/qc-process.md](docs/guides/qc-process.md) 참조 (8단계 표준 프로세스)
- **파이프라인 설계**: [docs/architecture/ai-pipeline.md](docs/architecture/ai-pipeline.md) 참조 (3단계 Stage + Quality Loop)
- QC 관련 로직 수정 시 `generationPipeline.ts` 중심으로 수정하면 generate/regenerate 양쪽에 동시 반영됨
- QC·저장은 최종 단계 결과에만 적용; 중간 산출물은 DB 저장 안 함

### Edge Runtime 호환성 (middleware.ts 수정 시 필수)
- `middleware.ts`는 Next.js Edge runtime에서 실행됨 — Node.js 전용 모듈(`net`, `fs`, `node:crypto`, `better-sqlite3` 등) 사용 불가
- 인증 게이팅은 **edge-safe 분할 설정** `@/lib/auth/local-auth-edge`(node:crypto 미의존)를 **동적 import**로만 로드한다 — `local-auth-config`(scrypt) 정적 import 금지
- 임포트 추가 시 체인 전체를 역추적: `middleware` → `A` → `B` → ... → Node-only 모듈 패턴 탐지
- 수정 후 `pnpm test:prod` 로 로컬 standalone 서버에서 헬스체크 통과 여부 확인

### 배포 태그 규칙
- Railway 배포 성공 확인 후: `git tag deploy/YYYY-MM-DD-HHmm && git push origin --tags`
- 배포 롤백이 필요할 때 태그 목록(`git tag -l 'deploy/*'`)으로 이전 커밋 빠르게 식별

### Railway 배포 상태 판별 (FAILED를 오해하지 말 것)
**병합했으면 배포 status가 `SUCCESS`인지 반드시 확인한다.** 조용한 미배포가 2종 있고, 둘 다
서비스는 멀쩡히 떠 있고 health도 200이라 **배포 목록을 보지 않으면 모른다.**

| 상황 | 해석 |
|------|------|
| 신규 커밋 · `WAITING` 지속 | 정상 — CI 완료 대기 중(실측 ~2.5분) |
| env 단독 변경 · `SUCCESS` | 정상 — env가 적용됐다 |
| env 단독 변경 · **`FAILED`** | 메타의 `builder`를 볼 것. **`RAILPACK`이면 `railway.toml` 미적용**(로그는 비어 있다). **env는 적용되지 않았다** |
| 신규 커밋 · **`SKIPPED`** | **CI 실패로 배포 취소.** `gh run rerun`으로 CI를 green으로 만들어도 **되살아나지 않는다** |
| 신규 커밋 · `BUILDING`/`DEPLOYING` 중 `FAILED` | 실제 배포 실패 — 로그 즉시 수집 |
| 서비스 health 죽음 | 실제 장애 — 즉시 롤백 검토 |

- **`FAILED`·`SKIPPED` 복구는 동일하다: 커밋을 하나 올려 새 배포를 트리거한다.** env 값은 이미 저장돼 있어 그 배포에서 함께 적용된다
- **`FAILED`를 보면 로그를 즉시 수집할 것** — 후속 배포로 대체되면 사라진다(2026-07-28 건이 그래서 원인 미상으로 남았다). 단 위 두 건은 **로그가 비어 있는 것이 정상**이니 메타를 봐야 한다
- 메타 읽기: `patchId` 있음 = env 변경 재배포 · `imageDigest` 없음 = 이미지 생성 전 실패 · `builder`는 `DOCKERFILE`이어야 정상
- 실측 quirk: `railway variable set`은 재배포를 트리거하지만 **`railway variable delete`는 트리거하지 않는다**
- 진단 절차·실증 근거: **[railway-deploy-troubleshooting.md](docs/guides/railway-deploy-troubleshooting.md)** · [#201](https://github.com/xzawed/CustomWebService/issues/201)

## 개발 워크플로우

- **브랜치 전략**: 모든 변경은 main에서 파생된 단기 브랜치에서 작업 후 PR → main 병합.
- **브랜치 네이밍**: `feat/`, `fix/`, `refactor/`, `chore/`, `docs/`, `test/`, `ci/` 접두사 사용
- **"커밋 푸쉬 PR"** = main 파생 브랜치 커밋 → push → PR 생성 → main 병합
- **새 작업 단위**: 이전 PR이 머지되었거나 종료된 상태라면 기존 PR을 재사용하지 않고 새 브랜치와 새 PR을 생성한다.
- 대규모 변경 시 Phase 단위로 나누어 각 Phase를 하나의 커밋으로 묶는 것을 선호
- **PR 병합 타이밍**: 여러 커밋이 예정된 작업은 모든 커밋이 완료된 후에 병합한다. 중간에 병합하면 cherry-pick 등 복구 작업이 필요해짐

## 커밋 메시지 규칙

한국어 커밋 메시지 사용. prefix 패턴: `feat:`, `fix:`, `refactor:`, `ci:`, `docs:`, `test:`, `chore:`
- 코드 변경과 관련 문서 변경은 동일 커밋에 포함 (코드-문서 동기화 보장)

## 타입·에이전트 주의사항

> **불변조건의 본문**은 [system-spec.md](docs/architecture/system-spec.md)에 있다. 아래는 (1) system-spec 한 줄 리마인더 또는 (2) 에이전트/테스트/CI 전용 함정이다. 조용히 깨지는 규칙을 여기서 지우지 말 것 — 없으면 system-spec으로 옮긴 뒤 포인터만 남겨라.

### system-spec 포인터 (전문은 그쪽)

- **Opus 5 `thinking` / 허용목록 폴백 / 구세대 ID 유지** — system-spec §3.4·§3.5 · [ADR](docs/decisions/2026-07-29-llm-model-upgrade-opus5.md)
- **JSON snake_case·camelCase 이중 처리** — system-spec §5.5 (`parseEndpoints` 등)
- **slug 유일성(앱 관리)·프로젝트/계정 삭제 캐스케이드·삭제 이벤트 payload 키(`deletedProjectId`/`deletedUserId`)·감사 로그 익명화** — system-spec §2·§5.2
- **`getAuthUser` DB 행 확인(유령 세션 차단)** — system-spec §1.2 · [ADR](docs/decisions/2026-07-30-account-delete-and-export.md)
- **`generationTracker`는 진행률 전용 · 중복 차단은 `generationLock`** — system-spec §3.1 · [ADR](docs/decisions/2026-07-29-durable-generation-lock.md)
- **생성 status `not_found` 통일** — system-spec §1.7 (클라 union 누락 시 잘못된 UX — 아래 폴링 절 참고)
- **WAL 모드: 체크포인트 전 커밋은 `-wal`에만 있을 수 있음 · main 교체+WAL/SHM 제거는 한 세트 · 성공=행 수(크기·`integrity_check` 아님) · 보존 정책(미사용 토큰 삭제 금지) · 카운터 `DEFAULT 0` · 쿼터 `charged===true` 환불** — system-spec §4.5–4.7·§5.1 · [복구 런북](docs/guides/sqlite-restore-runbook.md)

### 에이전트·테스트·CI 함정 (항상 로드)

- `IAiProvider.tokensUsed` — `{ input: number; output: number }` 구조 (`inputTokens`/`outputTokens` 아님)
- **Anthropic 모델 ID**: 날짜 suffix 없이 사용 — `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-sonnet-5`, `claude-opus-4-6`, `claude-opus-4-7`, `claude-opus-4-8`, `claude-opus-5`. 날짜 포함 ID는 허용목록에 없어 기본값으로 폴백된다
- `AiProviderFactory.ts` 모델 ID 수정 시 **`.test.ts`도 반드시 동시 업데이트** (CI 파손 방지)
- **Playwright 병렬 체크**: 단일 `page`에서 `Promise.allSettled` 사용 시 viewport를 바꾸는 체크는 다른 체크 완료 후 순차 실행 (`renderingQc.ts`)
- **playwright-core executablePath**: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`를 자동 읽지 않음 — `chromium.launch({ ...(executablePath && { executablePath }) })`로 명시 전달 (`browserPool.ts`). 풀 패키지 `playwright`와 다름
- **생성 상태 폴링**: `builder/page.tsx` SSE 폴백은 `src/lib/generation/pollGenerationStatus.ts`(주입형 `fetchFn`·`delay`). 상태: `generating`→진행률, `completed`+result→완료, **`failed`→즉시 terminal 실패**, `not_found`→미존재 메시지, 그 외→연결 복구 실패. 테스트는 DI-delay로 결정적 검증, 기본 `setTimeout`만 `vi.useFakeTimers()`+`runAllTimersAsync()`
- **모듈 레벨 플래그 테스트**: `let registered = false` 류는 `vi.resetModules()` + 매 테스트 `await import(...)` 격리 (`eventPersister.ts`)
- **api 라우트 테스트**: `@/lib/config/providers`·`@/lib/supabase/server` 모킹 **불필요**(모듈 삭제됨). 잔존 시 미존재 모듈 모킹. `vitest.config.ts` `testTimeout`/`hookTimeout` 15000ms는 경합 마진으로 유지 — [ADR](docs/decisions/2026-06-09-test-flaky-timeout-contention-fix.md)
- **happy-dom iframe**: `environmentOptions.happyDOM.settings.navigation.disableChildFrameNavigation = true`. v20 `disableIframePageLoading` deprecated. `disableFallbackToSetURL` 기본 false 유지(iframe.src 단언용)
- **MSW 미처리 요청**: 새 fetch 엔드포인트는 `src/test/mocks/handlers.ts`에 핸들러 필수. `onUnhandledRequest`는 **콜백으로 기록 + `afterEach` 단언**이라(`src/test/setup.ts`) 앱이 `.catch()`로 삼킨 요청도 테스트를 실패시킨다. 옛 `'error'` 문자열 설정만 쓰던 시절의 caveat(MSW #946/#943 — 전체 통과 ≠ 미처리 요청 부재)는 **2026-08-04 E7로 해소**됐다. 이 단언을 걷어내면 caveat가 되살아난다
- **SonarCloud vs Codecov**: Codecov/Vitest는 `coverage.include` 화이트리스트만, SonarCloud는 `sonar.sources=src` 전체 — 숫자 불일치를 설정 오류로 단정하지 말 것
- **`coverage.include` 누락 시 CI 빨갱 (2026-07-10 실증)**: lcov에 없는 파일의 변경 라인은 `new_coverage`/`codecov/patch`에서 **0%**. 라우트 테스트 추가 시 `vitest.config.ts` `coverage.include`에도 추가. 비테스트 파일은 `sonar.coverage.exclusions`와 `codecov.yml` `ignore` **양쪽**
- **`temperature`**: Claude 4.x에서 미지원·Provider에서 제거. `IAiPrompt.temperature`는 legacy 필드만 유지(API 미전달)
- **인메모리 rate limit**: 재시작 시 초기화, Railway 단일 인스턴스 전제. 멀티 인스턴스 시 Redis 등 필요 (generationTracker와 동일)
- **레이트리밋 환불**: 생성·추천 실패 시 SQLite in-process (`GREATEST(count-1,0)`). 외부 deploy 한도 메서드는 2026-08-01 제거(`deploy_count` 컬럼만 스키마 유지·불활성)
- **레이트리밋 우회 로깅**: `RATE_LIMIT_BYPASS_USER_IDS` 적용 시 `logger.info('Rate limit bypass applied', ...)` 필수(무로깅 우회 금지)
- **추천 라우트 모델**: `suggest-*`는 전부 `createForTask('suggestion')`(Haiku). `AiProviderFactory.create()` 기본(Sonnet 5)을 쓰면 조용히 3배 단가
- **백업 스케줄러 부작용**: 백업을 `readonly: true`로 열면 `.db-shm`/`.db-wal`이 백업 dir에 생기고 prune 패턴에 안 걸림 → 검증 후 `rm -f /data/backups/*.db-wal /data/backups/*.db-shm`. 오프사이트·계층: [operations.md](docs/guides/operations.md)
- **프록시 키 prefix**: `auth_config.prefix`/`header_prefix`를 `resolveApiKey`가 주입 시 적용(`startsWith` 이중 적용 가드). env/유저 키는 raw 저장. 검증: `keys-verify`의 `needsPrefixFix`
- **`pnpm.onlyBuiltDependencies`는 빈 배열 유지 (키 삭제 금지)**: better-sqlite3 v13 N-API 프리빌트인데 `binding.gyp` 때문에 암묵 rebuild. 키 부재 시 pnpm 9는 모든 스크립트 실행. CI·Dockerfile이 `pnpm@9`. 배경: [ADR](docs/decisions/2026-07-28-better-sqlite3-v13-napi-prebuilds.md)
- **Node 22 고정**: `engines.node: ">=22"`, `node:22-alpine`, CI `node-version: 22`. 다운그레이드 금지. [ADR](docs/decisions/2026-06-22-node22-supabase-websocket-fix.md)

### 카탈로그·시드 (상세는 아키텍처/ADR)

- **헬스·키 검증**: CLI `catalog:healthcheck`/`keys:verify` 제거. 현행 `GET /api/v1/admin/keys-verify`, `POST /api/v1/admin/verify-catalog`. 분류 로직 `healthCheck.ts` 잔존. [ADR](docs/decisions/2026-06-21-api-catalog-health-monitoring.md)
- **`verification_status` 소비**: AI 추천은 `broken` 제외·`verified` 우선, 브라우징 `search()`는 broken 숨기지 않음. [ADR](docs/decisions/2026-06-22-verification-status-consumption.md)
- **국가 데이터**: REST Countries 폐기 → `src/data/countries.json` + `/api/v1/countries`. 재생성 `pnpm tsx scripts/generateCountries.ts`. [설계](docs/superpowers/specs/2026-06-22-country-data-api-design.md) · [등록 ADR](docs/decisions/2026-06-22-catalog-registration-and-seed-resync.md)
- **시드**: `src/data/apiCatalog.json`·`featureFlags.json` → `seedCatalog`/`seedFeatureFlags`(빈 테이블만) + `ensureCatalogEntries`(신규 삽입·키리스 오분류 정정). 절차: [database.md](docs/architecture/database.md) §부팅

## 백로그

잔여 작업·열린 판단은 **[WBS](docs/superpowers/plans/2026-07-31-project-wbs.md)가 진실원**이다. [#216](https://github.com/xzawed/CustomWebService/issues/216)(데이터 확보 후 재검토 3건)은 트리거 미충족이면 **착수하지 않는다**.

### 상시 결정 — 비용이 드는 것은 구현 대상이 아니다 (2026-08-01)

**돈이 드는 신규 완화·기능은 제안하지도, 잔여 작업으로 남기지도 않는다.** "오너 액션 대기"가 아니라
**하지 않기로 한 것**으로 표기한다. 해당: 유료 DR(Railway 볼륨 백업·관리형 오브젝트 스토리지·Litestream→S3),
Sentry SaaS 도입.

**세 가지를 혼동하지 말 것** — 뭉뚱그리면 또 다른 거짓말이 된다:

| 구분 | 예 | 취급 |
|---|---|---|
| 신규 유료 완화 | Railway 볼륨 백업 · S3 · Sentry | ❌ **제외** |
| 기존 제품 운영비 | Anthropic API · Railway 호스팅 · Resend | 정상 운영 — 제외 대상 아님 |
| **무료** 가입·심사 | NASA 등록 키 · data.go.kr · Unsplash Production | 오너 ops로 **살아 있다** |

**무과금 운영 원칙 (2026-08-04 오너 재확인)**: "현존 서비스는 무과금 원칙이고 운영도 무과금이 되어야 한다."
→ **Open-Meteo 상업 라이선스는 사용하지 않는다.** CC BY 4.0 비상업 조건 그대로 쓰며,
수익화 게이트 자체가 사라졌으므로 "수익화 시 재검토" 항목으로도 남기지 말 것.
→ **다국어(i18n)는 계획 없음**으로 종결됐다. 재검토 트리거 없음.

**비용이 아니라 시간으로 막히는 것에는 킬스위치가 있다**: env 변경은 재배포(+Wait for CI)라
그 사이 비용이 계속 나간다. `enable_generation`·`enable_signup`은 DB 기반이라 재배포 없이
즉시 멈춘다 — 절차는 [operations.md §4.4](docs/guides/operations.md).

**수용한 잔여 위험**: 볼륨이 사라지고 오프라인 사본이 없으면 **복구 절차가 없다**.
유일한 무료 오프-볼륨 경로는 `GET /api/v1/admin/backup/latest`를 사람이 실제로 당기는 것뿐이며,
자동화·강제 스케줄은 없다. 계층·근거: [operations.md §3.4](docs/guides/operations.md)

## 세션 시작 체크리스트 (필수)

작업 세션을 시작할 때 아래 두 가지를 반드시 먼저 확인한다.

1. **Railway 배포 상태** — `railway deployment list --json` (최신 배포 status·커밋 확인)
2. **SonarCloud 품질 상태** — 아래 우선순위로 확인:
   - **(기본)** SonarQube MCP 도구로 `xzawed_CustomWebService` 프로젝트 이슈·품질 게이트 조회
   - **(차선 — MCP 미로드 시)** SonarCloud REST API로 대체 (`SONARCLOUD_TOKEN` 환경변수 또는 `~/.sonar-token` 파일에서 읽기):
     ```bash
     # 토큰 설정: echo "토큰값" > ~/.sonar-token && chmod 600 ~/.sonar-token
     # 또는: export SONARCLOUD_TOKEN=토큰값
     SONAR_TOKEN="${SONARCLOUD_TOKEN:-$(cat ~/.sonar-token 2>/dev/null)}"
     # 품질 게이트
     curl -s -u "$SONAR_TOKEN:" \
       "https://sonarcloud.io/api/qualitygates/project_status?projectKey=xzawed_CustomWebService"
     # 신규 이슈
     curl -s -u "$SONAR_TOKEN:" \
       "https://sonarcloud.io/api/issues/search?projectKeys=xzawed_CustomWebService&resolved=false&ps=5"
     ```

이상 징후(배포 실패, 품질 게이트 FAILED, 신규 버그/취약점)가 있을 때만 사용자에게 보고한다. 정상이면 별도 보고 없이 작업을 진행한다.

## Claude 도움 요청 원칙

업무 수행 중 다음 상황이 발생하면 Claude는 **즉시 사용자에게 도움을 요청**합니다:

- **막힌 경우**: 로그 미접근, 외부 시스템 확인 필요, 재현 불가한 환경 차이
- **판단이 필요한 경우**: 트레이드오프가 있어 방향 결정이 필요할 때
- **확인이 필요한 경우**: Railway·GitHub 등 외부 시스템 실제 상태를 알아야 할 때
- **리스크가 불확실한 경우**: 영향 범위 파악이 어렵고 되돌리기 어려운 변경

기다리거나 혼자 해결을 시도하기보다 **빠르게 물어보는 것**이 원칙입니다.

## Claude 자율 관리 권한

Claude는 이 프로젝트에서 컨텍스트 업무를 정확하고 효율적으로 수행하기 위해 다음 항목을 **사용자 승인 없이 자율적으로 생성·수정·삭제**할 수 있습니다:

- **스킬(Skills)**: `~/.claude/` 하위 커스텀 스킬 파일
- **에이전트(Agents)**: 서브에이전트 디스패치 프롬프트 및 설정
- **훅(Hooks)**: 이벤트 기반 셸 훅 (`PreToolUse`, `PostToolUse`, `Stop` 등)
- **메모리(Memory)**: `~/.claude/projects/.../memory/` 하위 기억 파일 및 인덱스
- **CLAUDE.md**: 이 파일 자체 — 규칙 추가·수정·삭제
- **MCP 설정**: 프로젝트 로컬 MCP 서버 설정

단, 다음은 사용자 명시적 승인 후에만 변경합니다:
- 전역(`~/.claude/settings.json`) 권한 모드 변경
- 외부 서비스(Railway, GitHub) 영향 설정
- 소스 코드 및 프로덕션 배포에 직접 영향을 주는 변경

## 문서 관리 원칙

Claude는 프로젝트 문서의 파일명·위치·내용을 정확하고 이해하기 쉽게 관리합니다.

**디렉터리 용도:**
- `docs/architecture/` — 시스템 구조 설명
- `docs/guides/` — 작업 절차 가이드
- `docs/reference/` — API·환경변수 등 참조 자료
- `docs/decisions/` — 설계 결정 배경 (ADR)
- `docs/superpowers/specs/` — 기능 설계 문서 (`YYYY-MM-DD-<topic>-design.md`)
- `docs/superpowers/plans/` — 구현 계획 (`YYYY-MM-DD-<topic>.md`)

**규칙:**
- 새 문서 추가·수정·삭제 시 [docs/README.md](docs/README.md) 인덱스를 갱신하고, 에이전트 필수 문서면 이 파일의 "문서 참조"에도 반영
- 코드 변경 시 영향받는 문서도 동일 커밋에서 갱신 (코드-문서 drift 방지)
- 불변조건 변경은 [system-spec.md](docs/architecture/system-spec.md)를 같은 커밋에서 갱신
