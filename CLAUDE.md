# CustomWebService — Claude Code 지침

AI 기반 노코드 플랫폼. 무료 API를 고르고 서비스를 설명하면 AI가 HTML/CSS/JS를 생성해
서브도메인(`slug.xzawed.xyz`)으로 즉시 게시한다.
서비스 <https://xzawed.xyz> · 배포 Railway(단일 인스턴스 · Dockerfile · standalone).

> **⚠️ 2026-08-31자로 운영 종료 예정**(오너 결정, 2026-08-23). 잔여 작업의 기준이 뒤집혔다 —
> **신규 기능·무료 키 발급·심사·유지보수성 투자는 착수하지 않는다.** 남는 것은 종료 절차뿐이고
> 그 목록은 [WBS](docs/superpowers/plans/2026-07-31-project-wbs.md)의 「2026-08-31 종료로 드롭」 절이 진실원이다.
> AI 생성은 Anthropic 한도가 **2026-09-01**에야 풀려 남은 기간 내내 불가능하다 → `enable_generation` 내림.

## 이 파일의 예산 — 220줄 (2026-08-07)

**이 파일은 모든 세션에 무조건 로드된다.** 개별 줄은 다 타당해 보이는데 총량은 아무도 세지
않아서 449줄까지 자랐다. 그때 실측한 것이 이 예산의 근거다 — **기계로 검증 가능한 층
(경로·명령·행번호)은 위반 0건이었고, 실제로 거짓보고를 만든 것은 검증할 수 없는 단정이었다.**
예: *"E2E는 실 백엔드 env가 있어야 돈다"* (거짓이었다) · *"실측 ~2.5분"* (무엇의 시간인지 미상).

- 넣을지 말지의 기준은 하나다 — **CI·테스트가 잡아주면 `docs/`로 옮기고, 조용히 프로덕션이
  깨지면 여기 남긴다.** 아래 「조용히 깨지는 규칙」이 그 목록이고, 그게 이 파일의 존재 이유다
- 강제 장치: `pnpm docs:check` ⑥ + `PreToolUse` 훅(`scripts/hooks/guardAlwaysLoadedBudget.mjs`).
  훅은 예산을 넘기는 편집을 **실제로 차단**한다. 테스트는 `src/__tests__/hooks/`
- 예산은 `scripts/doc-budgets.json` **단일 출처**다. 올리려면 **거기만** 고치고
  왜 올리는지를 `_rationale`에 적을 것. 숫자만 바꾸면 1년 뒤 다시 449줄이 된다

## 작업 게이트 (모든 작업에 선행 — 이 절만은 건너뛰지 말 것)

취향이 아니라 **실제로 거짓보고를 만든 경로**다. 근거·기준선: [agent-working-rules.md](docs/guides/agent-working-rules.md)

**G1. 증거 등급을 섞지 말 것.** 라이브 실측 > 코드 읽기 > 문서 > 합성 테스트. 낮은 등급을 높은
등급의 어조로 보고하는 것이 "거짓보고"의 정체다. 문장에 등급이 드러나야 한다 — *"실측했다"* /
*"코드상 그렇다"* / *"문서에 그렇게 적혀 있다"* / *"추정이다"*. 합성 테스트 2,433건 통과가 실제
응답 4건이 새는 것을 못 막았다. **초록색은 증거가 아니다.** 문서의 수치·목록은 관측 시점의
사실이며, **지금도 참인지는 명령으로 확인한다.**

**G2. "동작한다"를 프록시 지표로 대체하지 말 것.** HTTP 200 ≠ 정상 · `keys-verify` VALID ≠ 동작.
후자는 *키가 주입되고 인증이 하드 실패하지 않았다*만 말한다. 이 함정으로 **두 번** 사고가 났다
(REST Countries 2026-06-21 · data.go.kr 4종 2026-08-05) → [ADR](docs/decisions/2026-06-21-api-catalog-health-monitoring.md)

**G3. 완료 선언은 잔여 목록과 함께만.** *"남은 것 없음"*·*"오너 액션만 남음"*을 항목 열거 없이
쓰지 않는다. 한 세션에서 3번 그렇게 말했고 3번 다 코드 작업이 더 나왔다.
형식: *"오너: X / 코드 미해결: Y / 확인 못 한 것: Z"*.

**G4. 균일한 결과는 도메인 결론 전에 방법을 의심할 것.** *"61개 전부 그렇다"* 처럼 너무 깨끗한
결과는 대개 쿼리·전제 버그다. 실제로 `.params`(없음)와 `.parameters`(실제)를 혼동해 "61개 전부
미정의"라고 보고했고, `grep '^-[^-]'`가 `- ` 리스트 삭제를 통째로 빠뜨린 적도 있다.
결론 전에 **원본 하나를 통째로 출력**해 볼 것.

**G5. 모르는 것은 추측하지 말고 "모름"으로 보고할 것.** 경로·서비스명·파라미터를 지어내
프로브하는 것은 작업이 아니다(TAGO 지하철 5개 전부 오답). 근거가 없으면 **"미상 — 차단됨"**.

**G6. 도메인을 건드리기 전에 해당 ADR을 열 것.** `docs/decisions/`의 모든 ADR 첫 줄에
**`> 언제 읽나`** 트리거가 있다. 손대려는 파일·함수·env가 거기 있으면 읽고 시작한다.
ADR은 "왜 이렇게 됐는지"이고 **대부분 이미 한 번 사고가 난 것**이다.

## 기술 스택

| 영역 | 기술 |
|------|------|
| Framework | Next.js 16+ (App Router, TypeScript strict) |
| UI | React 19 · Tailwind CSS 4 · Lucide React |
| State | Zustand (관심사별 분리 스토어 + persist) |
| Form | React 로컬 상태(`useState`) + Zod(서버 검증) — React Hook Form 미사용 |
| Database | 임베디드 SQLite (better-sqlite3 + drizzle-orm, WAL · Railway Volume `/data/app.db`) |
| Auth | Auth.js v5 (Credentials + JWT 무상태) — 공개 회원가입 · scrypt · 이메일 인증 게이트 |
| AI | Claude API (Anthropic SDK · `claude-opus-5` 기본 · 조건부 Extended Thinking) |
| Testing | Vitest · happy-dom · MSW · Playwright(E2E) |
| CI/CD | GitHub Actions → lint → type-check → **test:coverage** → build → E2E |
| Package Manager | pnpm 9 · Node 22 고정 |

## 모듈 지도 — 어느 파일이 어떤 규칙을 소유하는가

레이아웃: `src/` = `app` · `components` · `hooks` · `lib`(도메인) · `providers`(AI) ·
`repositories` · `services` · `stores` · `types` · `data`(부팅 시드) · `__tests__`·`test`.
**파일 목록은 glob으로 확인한다** — 여기엔 목록이 아니라 **불변조건의 소유자**만 적는다.

| 소유자 | 소유한 규칙 |
|---|---|
| `middleware.ts` | 서브도메인 rewrite · CSP/HSTS. **Edge runtime** — Node 전용 모듈 금지 |
| `lib/proxy/resolveProxyContext` | site·app 프록시 인가 **단일 진입점**. 라우트에 인가 분기를 새로 만들지 말 것 |
| `lib/cache/proxyCache` | `buildCacheKey` 4번째 인자 **키 신원 필수** — 없으면 교차 테넌트 유출 |
| `lib/catalog/healthCheck` | 정상/고장 판정. **HTTP 200+에러 본문**을 여기서 잡는다 |
| `lib/catalog/keyCheck` | **키 인증 검증 전용 — 동작 판정이 아니다**(활성화 게이트로 쓰지 말 것) |
| `lib/catalog/activeApiCount` | 활성 개수 **동적 카운트 — 하드코딩 금지** |
| `lib/ai/generationLock` | 중복 생성 차단(DB 락). `generationTracker`는 **진행률 전용** |
| `lib/auth/rateLimit` | `getClientIp` **단일 출처** — XFF **최우측**만 신뢰 |
| `lib/auth/local-auth*` | Credentials+JWT. **edge-safe 분할**(base/edge) |
| `lib/config/featureFlags` | DB 기반 운영 킬스위치. 재배포 없이 즉시 반영 · **fail-open** |
| `lib/constants/cdn` | CSP CDN 화이트리스트 **단일 출처** (`buildSiteCsp`) |
| `lib/db/sqlite/ensureCatalog` | 부팅 시 구조 동기화. **예외: `CORRECTIONS` 2건은 매 부팅 `is_active=true`로 되돌린다** — 이 둘만 deactivate가 유지되지 않는다 |
| `lib/events/eventPersister` | 모든 도메인 이벤트 자동 DB 기록(감사 로그) |
| `repositories/factory` | **무인자** SQLite 생성 — 클라이언트 주입 금지 |
| `src/data/*.json` | 부팅 시드. **JSON만 고쳐선 기존 행이 안 바뀐다** → `ensureCatalog` 구조 패치 |

## 조용히 깨지는 규칙 (CI·테스트가 못 잡는 것만)

여기 있는 것은 **어기면 초록불 상태로 프로덕션이 망가진다.** 나머지 규칙은 전부 `docs/`에 있고,
그것들은 lint·type-check·테스트·커버리지 게이트가 잡아준다.

- **CSP를 set 하는 3곳**: `src/middleware.ts` · `src/app/site/[slug]/route.ts` ·
  `src/app/api/v1/preview/[projectId]/route.ts` — 동시에 확인. **문자열을 소유하는 곳은 2곳**
  (`middleware.ts`의 앱 CSP 배열 · `src/lib/constants/cdn.ts`). **CDN 허용을 고치는 곳은 route가 아니라 `cdn.ts`다**
- **서브도메인 rewrite 예외**: `middleware.ts`의 `SUBDOMAIN_PASSTHROUGH_PREFIXES`에 있는 경로만
  `/site/{slug}` rewrite를 건너뛴다. 게시 사이트의 생성 JS가 상대경로 `/api/v1/proxy`를 부르므로
  이 예외가 없으면 **API 데이터가 전부 404**가 된다(미리보기는 apex라 정상 동작해 안 드러난다)
- **프록시 인가는 `resolveProxyContext()` 단일 진입점.** 라우트에 분기를 새로 만들지 말 것 —
  판단이 흩어져 개인 키 해석부가 소유권을 확인하지 않던 것이 H-1이었다 · [ADR](docs/decisions/2026-07-28-published-site-proxy-authz.md)
- **프록시 캐시 키에 키 신원 필수.** `buildCacheKey(...)`의 4번째 인자는 선택이 아니다 —
  잊으면 조용히 교차 테넌트 유출이 돌아온다. 원문이 아니라 `keyFingerprint()` · [ADR](docs/decisions/2026-07-29-proxy-cache-key-identity.md)
- **`x-forwarded-for`는 최우측만 신뢰**하고 `x-real-ip`는 신뢰하지 않는다. 최좌측·`x-real-ip`는
  클라이언트가 위조할 수 있어 per-IP 리밋이 무력화된다. 식별 불가 시 `'unknown'` 단일 버킷(fail-closed)
- **인메모리 레이트리밋은 활성 윈도를 evict하지 않는다.** 우회보다 과차단이 안전하다 ·
  [system-spec §4.1 (인메모리 레이트리밋)](docs/architecture/system-spec.md)
- **`railway.toml`에 `startCommand`를 넣지 말 것.** Dockerfile 배포에서 이미지 `ENTRYPOINT`를
  덮어써 `chown /data` + `su-exec`가 실행되지 않고 **컨테이너가 root로 뜬다** ·
  [트러블슈팅](docs/guides/railway-deploy-troubleshooting.md)
- **`middleware.ts`는 Edge runtime.** Node 전용 모듈(`node:crypto`·`better-sqlite3` 등) 금지.
  인증은 `@/lib/auth/local-auth-edge`를 **동적 import로만** — `local-auth-config`(scrypt) 정적 import 금지.
  임포트 추가 시 체인 전체를 역추적하고 `pnpm test:prod`로 확인
- **AI 호출 타임아웃은 `Promise.race`만으로 끝내지 말고 `AbortSignal`을 함께 넘길 것.**
  race가 이겨도 업스트림은 살아 있어 **토큰 비용이 이중 청구**된다 · [system-spec §3.3 (AI 호출 타임아웃)](docs/architecture/system-spec.md)
- **병합했으면 배포가 실제로 됐는지 확인한다.** 조용한 미배포가 **3종** 있고 전부 health 200이라
  드러나지 않는다. 세 번째(**런 자체가 생성되지 않음**)는 배포 목록이 아니라 **런 목록**을 봐야
  보인다 · [트러블슈팅](docs/guides/railway-deploy-troubleshooting.md)
- **모델 ID를 어디에도 하드코딩하지 말 것.** `createForTask('suggestion')`(Haiku) 또는 —
  tool use가 필요해 `IAiProvider`를 못 쓰면 — `resolveTaskModel('suggestion')`을 거친다.
  `create()` 기본(Sonnet 5)을 쓰면 **조용히 3배 단가**이고, 하드코딩하면 **`AI_MODEL_*` env가
  그 경로에만 닿지 않는다**(허용목록 검증·경고도 건너뛴다). 실제로 `preferencesRecommender`·
  `featureExtractor` 2곳이 그랬다(2026-08-07 발견·수정). **테스트도 CI도 비용은 안 잡는다**
- **`RATE_LIMIT_BYPASS_USER_IDS` 적용 시 `logger.info('Rate limit bypass applied', ...)` 필수.**
  무로깅 우회는 감사 흔적이 사라진다 — 어떤 게이트도 이걸 검출하지 않는다

## 코딩 컨벤션

- **TypeScript strict** — `any` 금지, export 함수에 명시적 반환 타입 · **Path alias** `@/*` → `src/*`
- **레이어**: Route Handler → Service → Repository → SQLite · **API 라우트**: `/api/v1/*` (인증 + Zod 검증 → Service)
- **AI Provider**: `IAiProvider` 인터페이스 — Provider 전용 로직은 Provider 내부에만
- **에러**: `@/lib/utils/errors`의 커스텀 클래스 · **i18n**: `@/lib/i18n`의 `t()`, 한국어 기본
- **요청 추적**: `X-Correlation-Id` · **테스트**: 소스 옆 `*.test.ts` 또는 `src/__tests__/`
- **생성물은 React가 아니라 순수 HTML/CSS/JS**(사용자 서비스용)

## 문서 참조

**전체 목록·ADR 카탈로그·문서 진실 정책은 [docs/README.md](docs/README.md).**
현재 시제 = 이 파일 + `docs/architecture|guides|reference|security`. 역사 = `docs/decisions/`·`docs/archive/`.
**두 번째 규칙서·`.claude/docs` 미러 금지.** 현재 시제 문서는 전부 첫 줄에 `> **언제 읽나**` 트리거가 있다.

| 질문 | 참조 |
|------|------|
| **불변조건·계약 (깨면 조용히 사고 나는 것)** | [architecture/system-spec.md](docs/architecture/system-spec.md) |
| **에이전트 작업 규율 — G1~G6의 근거·측정 기준선** | [guides/agent-working-rules.md](docs/guides/agent-working-rules.md) |
| **테스트 전략·함정 · 에이전트/CI 함정 전체** | [guides/testing.md](docs/guides/testing.md) |
| 테스트 커버 범위·공백 | [reference/test-coverage-map.md](docs/reference/test-coverage-map.md) |
| **잔여작업 전체 지도 (백로그 진실원)** | [superpowers/plans/2026-07-31-project-wbs.md](docs/superpowers/plans/2026-07-31-project-wbs.md) |
| 코드 생성/재생성 QC **(필수)** | [guides/qc-process.md](docs/guides/qc-process.md) |
| AI 코드 생성 흐름 | [architecture/ai-pipeline.md](docs/architecture/ai-pipeline.md) |
| 환경변수 목록 **(유일한 진실원)** | [reference/env-vars.md](docs/reference/env-vars.md) |
| API 엔드포인트 | [reference/api-endpoints.md](docs/reference/api-endpoints.md) |
| 일상 운영·모니터링·백업·의존성 감사 | [guides/operations.md](docs/guides/operations.md) |
| **배포했는데 반영이 안 될 때** (조용한 미배포 3종) | [guides/railway-deploy-troubleshooting.md](docs/guides/railway-deploy-troubleshooting.md) |
| SQLite 복구 런북 | [guides/sqlite-restore-runbook.md](docs/guides/sqlite-restore-runbook.md) |
| 시크릿 노출·회전 | [security/incident-response.md](docs/security/incident-response.md) |
| **DB 스키마·시드·`ensureCatalog` 계약** | [architecture/database.md](docs/architecture/database.md) |
| 개발 환경·팩토리 규칙 | [guides/development.md](docs/guides/development.md) |
| 설계 결정(ADR) 전체 | [docs/decisions/](docs/decisions/) |

## 개발 워크플로우

- 모든 변경은 main 파생 단기 브랜치 → PR → main 병합. 접두사 `feat/` `fix/` `refactor/` `chore/`
  `docs/` `test/` `ci/`. **"커밋 푸쉬 PR"** = 브랜치 커밋 → push → PR 생성 → 병합
- **이전 PR이 끝났으면 재사용하지 말고 새 브랜치·새 PR**을 만든다
- 대규모 변경은 Phase 단위로 나눠 각 Phase를 한 커밋으로. **여러 커밋이 예정된 작업은 전부
  끝난 뒤 병합**한다(중간 병합은 cherry-pick 복구를 부른다)
- 한국어 커밋 메시지 · prefix `feat:` `fix:` `refactor:` `ci:` `docs:` `test:` `chore:`
- **코드 변경과 관련 문서 변경은 같은 커밋에** (코드-문서 drift 방지). 불변조건을 바꾸면
  [system-spec.md](docs/architecture/system-spec.md)를 같은 커밋에서 갱신
- 문서를 추가·삭제하면 [docs/README.md](docs/README.md) 인덱스를 갱신한다

## 세션 시작 체크리스트

1. **Railway 배포 상태** — `railway deployment list --json` (최신 status·커밋)
2. **SonarCloud** — SonarQube MCP로 `xzawed_CustomWebService` 조회. MCP 미로드 시 REST 폴백은
   [operations.md](docs/guides/operations.md). **게이트는 신규 코드만 본다** — PASS여도 기존
   BLOCKER·CRITICAL은 따로 조회할 것

이상 징후(배포 실패·게이트 FAILED·신규 버그)가 있을 때만 보고한다. 정상이면 그냥 진행.

## 백로그 · 상시 결정

**종료가 확정된 뒤로 잔여 작업의 대부분은 "하지 않기로 한 것"이다.** 진실원은
[WBS](docs/superpowers/plans/2026-07-31-project-wbs.md)의 「2026-08-31 종료로 드롭」 절.
무료 키 발급(B3(a)·A8(a))·심사(B5)·#216·커버리지/복잡도 투자는 **다시 올리지 말 것**.

**돈이 드는 신규 완화·기능은 제안하지도, 잔여 작업으로 남기지도 않는다**(2026-08-01).
유료 DR·Sentry SaaS는 "오너 액션 대기"가 아니라 **하지 않기로 한 것**이다.
**수용한 잔여 위험**: 볼륨이 사라지고 오프라인 사본이 없으면 **복구 절차가 없다** ·
[operations.md](docs/guides/operations.md)

## Claude 권한과 도움 요청

**승인 없이 자율 관리**: 스킬 · 에이전트 · 훅 · 메모리 · 이 파일 · 프로젝트 로컬 MCP 설정.
**명시적 승인 필요**: 전역 `~/.claude/settings.json` 권한 모드 · 외부 서비스(Railway·GitHub) 설정 ·
소스 코드와 프로덕션 배포에 직접 영향을 주는 변경.

**막히면 혼자 해결하려 하지 말고 즉시 물어본다** — 로그 미접근·외부 시스템 상태 확인 필요·
트레이드오프 판단·되돌리기 어려운 변경의 영향 범위가 불확실할 때.
