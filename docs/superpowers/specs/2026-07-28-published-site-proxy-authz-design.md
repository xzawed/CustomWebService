<!-- DOC_STATUS: HISTORICAL | completed: 2026-07-28 | superseded_by: docs/decisions/2026-07-28-published-site-proxy-authz.md, docs/architecture/system-spec.md -->
# 게시 사이트 프록시 복구 및 인가 모델 정비 설계 (2026-07-28)

## 배경

전체 검수(Claude 독립 검증 + Grok 교차검증)에서 검증된 13건 중, **제품 핵심 기능이 동작하지
않는 CRITICAL 2건과 인가 결함 HIGH 2건**을 이 설계의 범위로 삼는다. MEDIUM 7건은 검증된
목록으로 남겨 다음 라운드에서 처리한다.

### 해결 대상

| ID | 심각도 | 내용 |
|----|--------|------|
| C-1 | critical | 게시 서브도메인에서 `/api/*`가 404 — 미들웨어가 전 경로를 `/site/{slug}`로 리라이트 |
| C-2 | critical | 프록시가 세션을 요구 — 익명 방문자는 401 |
| H-1 | high | 프록시 `projectId`에 소유권 검사 없음 — 타인의 개인 API 키 사용 가능 |
| H-2 | high | 일회성 토큰이 원자적으로 소비되지 않음 — 재설정 링크 재사용 가능 |

### C-1 근거 (프로덕션 실측)

```
GET https://xzawed.xyz/api/v1/proxy?…        → 401   (라우트 도달, 인증 요구)
GET https://testprobe.xzawed.xyz/api/v1/proxy?… → 404   (리라이트되어 라우트 미매칭)
```

미들웨어([src/middleware.ts:38-49](../../../src/middleware.ts))는 서브도메인 요청의 **모든**
경로를 `/site/{slug}{pathname}`로 리라이트한다. `/site/[slug]/route.ts`는 단일 동적 세그먼트라
`/site/weather/api/v1/proxy`는 매칭되지 않는다.

생성 프롬프트는 상대경로 호출을 강제하고 직접 외부 URL을 금지한다
([promptBuilder.ts:491-494](../../../src/lib/ai/promptBuilder.ts)):

```
✅ fetch('/api/v1/proxy?apiId=<ID>&proxyPath=<경로>')
❌ fetch('https://api.example.com/v1/data')   ← CORS 차단
```

따라서 **API를 사용하는 게시 사이트는 전부 데이터 로딩에 실패**한다. 미리보기는 apex 도메인이라
정상 동작해 결함이 드러나지 않았다.

### 전제 (실측 확인)

- 세션 쿠키는 `__Host-` / `__Secure-` 프리픽스이며 `Domain` 속성이 없다 → **호스트 전용**.
  AI 생성 사이트(`slug.xzawed.xyz`)는 방문자의 apex 세션 쿠키에 접근할 수 없다.
- 현재 게시된(published) 사이트는 없다 → 활성 장애가 아닌 **잠복 결함**. 정규 설계·검증 절차를 밟는다.

## 설계

### 1. 요청 모드 판정 — `resolveProxyContext()` (신규)

"누가, 어떤 프로젝트를 대신해 요청하는가"를 한 곳에서 결정하고, 프록시 라우트는 결과만 소비한다.
현재 인증·인가 판단이 `validateRequest`와 `resolveApiKey` 두 곳에 흩어져 H-1이 발생했으므로,
단일 진입점으로 모은다.

```ts
type ProxyContext =
  | { mode: 'site'; project: Project; linkedApiIds: string[] }
  | { mode: 'app'; user: AuthUser; project: Project | null; linkedApiIds: string[] };

async function resolveProxyContext(
  request: Request,
  apiId: string,
): Promise<ProxyContext | Response>;
```

판정 순서:

| # | 조건 | 결과 |
|---|------|------|
| 1 | Host가 `{slug}.{NEXT_PUBLIC_ROOT_DOMAIN}`이고 `isValidSlug(slug)` 통과 | slug로 프로젝트 조회 → `status==='published'`면 **site 모드**, 아니면 404 |
| 2 | apex + 유효 세션 | **app 모드** |
| 3 | apex + 세션 없음 + `projectId`가 published | **site 모드** |
| 4 | 그 외 | 401 |

**3번이 필요한 이유**: apex의 `/site/{slug}` 직접 서빙 경로가 존재한다. 3번을 빼면
"서브도메인에선 되고 직접 게시 URL에선 안 되는" 경로별 분기가 생긴다 — CLAUDE.md
"서빙 파이프라인 변경 시 3가지 경로 모두 추적" 원칙 위반.

생성 프롬프트는 [promptBuilder.ts:830](../../../src/lib/ai/promptBuilder.ts)에서 이미
`&projectId=`를 붙이므로 프롬프트·기존 생성 코드 변경이 없다.

**Host 우선 원칙**: Host로 프로젝트가 확정되면 클라이언트가 보낸 `projectId`는 **무시**한다
(불일치 시에도 Host를 신뢰). 클라이언트 입력이 인가 근거가 되지 않게 한다.

### 2. 인가 규칙

| 모드 | 프로젝트 출처 | apiId 검사 | 키 출처 | 레이트리밋 |
|------|---------------|-----------|---------|-----------|
| site | Host slug(우선) 또는 published `projectId` | `apiId ∈ project_apis` **강제** | 플랫폼 키 또는 **그 프로젝트 오너**의 개인 키 | IP + projectId |
| app | 클라이언트 `projectId` + **소유권 assert** | `projectId`가 있으면 동일 강제 | 플랫폼 키 또는 **호출자 본인**의 개인 키 | userId (기존 유지) |

- **H-1 수정**: app 모드는 `project.userId === user.id`를 확인한 뒤에만 개인 키를 해석한다.
  현재 [proxy/route.ts:209-227](../../../src/app/api/v1/proxy/route.ts)의
  "게시 사이트 서빙 의미상 소유권 미적용" 주석과 그 동작을 제거한다. 게시 신뢰는
  **Host→slug**에서 오지, 자유 입력 `projectId`에서 오지 않는다.
- **`apiId ∈ project_apis`**: 두 모드 공통. 게시 사이트가 자신과 무관한 카탈로그 API를
  오너 키로 호출하는 것을 막는다. 조회는 `projectService.getProjectApiIds(projectId)`.

### 3. 미들웨어 변경 (C-1)

서브도메인에서 **프록시 경로 하나만** 리라이트 예외로 둔다. `/api/*` 전체를 여는 것이 아니라
최소 노출 원칙을 적용한다.

```ts
const SUBDOMAIN_PASSTHROUGH_PREFIXES = ['/api/v1/proxy'];

function isSubdomainPassthrough(pathname: string): boolean {
  return SUBDOMAIN_PASSTHROUGH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}
```

패스스루에 해당하면 rewrite를 건너뛰고 **일반 응답 경로로 흘려보낸다**. 그래야 기존 보안 헤더
설정(`X-Content-Type-Options`, HSTS 등)과 "API 경로에는 CSP 미적용" 규칙이 그대로 적용된다.
서브도메인 분기에서 조기 `return` 하면 이 처리가 누락되므로 주의한다.

> `/api/*` 전체를 열지 않는 이유: 세션 쿠키가 호스트 전용이라 생성 사이트가 방문자 세션을
> 탈취할 수는 없지만, 불필요한 엔드포인트 노출(예: `/api/auth/*`가 서브도메인에 쿠키를 설정)을
> 만들 이유가 없다.

### 4. 익명 사이트 모드 레이트리밋

승인된 정책: **오너 개인 키 사용 허용 + 강한 레이트리밋**. 이 리미터가 타인 API 키 소진을 막는
유일한 경계이므로 별도 버킷으로 분리한다.

- 키: `${clientIp}:${projectId}` — IP는 `getClientIp()`(`src/lib/auth/rateLimit.ts`) 단일 출처 사용
  (XFF **최우측**만 신뢰하는 기존 규칙 준수)
- 프로젝트당 전역 상한을 추가로 두어 분산 IP 공격이 한 오너의 키를 소진시키는 것을 제한

한도는 `src/lib/config/rateLimit.ts`에 환경변수로 추가한다(기존 `RATE_LIMIT_PER_MIN`과 별개):

| 상수 | 환경변수 | 기본값 | 의미 |
|------|----------|--------|------|
| `SITE_PROXY_RATE_LIMIT_PER_MIN` | 동명 | **20**/분 | IP+projectId 단위. 일반 사이트 방문자의 정상 사용은 덮되 남용은 차단 |
| `SITE_PROXY_PROJECT_LIMIT_PER_MIN` | 동명 | **120**/분 | 프로젝트 전역. 분산 IP로 한 오너 키를 소진시키는 것을 상한 |

기본값은 보수적으로 시작한다 — 게시 사이트가 아직 없어 실사용 데이터가 없으므로,
운영 로그를 보고 환경변수로 조정한다(코드 변경 불필요).

**M-6 패턴을 신규 경로에 심지 않는다**: 기존 프록시 리미터는 `LRUMap(1000)` eviction 시 활성
윈도의 카운터가 리셋되어 한도를 우회할 수 있다(검증됨, 이번 범위 밖). 신규 site 리미터는
**활성 윈도를 eviction으로 리셋하지 않도록** 만든다 — 만료 기반 정리만 수행하고, 용량 압박 시
새 키를 거부할지언정 살아 있는 카운터를 버리지 않는다.

### 5. 토큰 원자적 소비 (H-2)

현재 [tokens.ts:26-35](../../../src/lib/auth/tokens.ts)는 조회 → `await` → 소비의 2단계이고,
`consume`은 `WHERE id = ?`만 검사한다(`consumed_at IS NULL` 가드 없음, 변경 행 수 미확인).
두 `await` 사이에 이벤트 루프가 다른 요청을 진행시킬 수 있어 동시 요청이 모두 성공한다.

단일 원자 문으로 대체한다:

```sql
UPDATE auth_tokens
   SET consumed_at = ?
 WHERE token_hash = ? AND type = ? AND consumed_at IS NULL AND expires_at > ?
RETURNING user_id
```

- `IAuthTokenRepository`에 `consumeValid(tokenHash, type, now): Promise<string | null>` 추가
- `verifyAndConsumeToken`은 이 메서드만 호출하고, 0행이면 `null`(무효) 반환
- 기존 `findValidByHash` + `consume` 조합은 **오용 여지가 남으므로 다른 호출자가 없으면 제거**한다

### 6. 에러 처리

| 상황 | 응답 | 이유 |
|------|------|------|
| 프로젝트 부재 / 미게시 (site 모드) | 404 | 존재 여부를 구분해 노출하지 않음 |
| `apiId ∉ project_apis` | 403 | 요청 자체는 인증됐으나 허용되지 않음 |
| app 모드에서 미소유 `projectId` | **403** | 기존 관례 준수 — `assertOwner`(`src/lib/auth/authorize.ts`)가 `ForbiddenError`를 던진다 |
| 레이트리밋 초과 | 429 + `Retry-After` | 클라이언트가 재시도 시점을 알 수 있게 함 |

app 모드는 소유권 검증에 **기존 `assertOwner`를 재사용**한다. 프록시 전용 분기를 새로 만들지
않아야 인가 규약이 한 곳에 유지된다.

### 7. 테스트 전략

**단위 — `resolveProxyContext` 진리표**
Host 변형(서브도메인 / apex / `www` / 예약 slug / 알 수 없는 slug) × 프로젝트 상태(published /
draft / 부재) × 세션 유무 × 소유 여부의 조합을 표로 고정한다.

**단위 — 키 선택 격리 (H-1 회귀 방지)**
- site 모드: 해당 프로젝트 오너의 키만 사용, 다른 사용자 키는 절대 조회되지 않음
- app 모드: 타인 `projectId` 전달 시 개인 키 조회 이전에 차단
- 두 모드 공통: `apiId ∉ project_apis`면 키 해석 자체가 일어나지 않음

**단위 — 토큰 원자성 (H-2 회귀 방지)**
동일 토큰으로 `verifyAndConsumeToken`을 연속 호출하면 첫 번째만 `userId`, 두 번째는 `null`.

**통합 — 미들웨어 라우팅 (C-1 회귀 방지)**
- 서브도메인 `/api/v1/proxy` → 리라이트되지 않고 라우트 도달
- 서브도메인 그 외 경로 → 기존대로 `/site/{slug}`로 리라이트
- 패스스루 응답에도 보안 헤더가 적용됨

**회귀 — 미리보기 경로**
apex + 세션(오너)의 미리보기가 기존과 동일하게 동작.

**커버리지 설정**
`src/app/api/v1/proxy/route.ts`는 이미 `vitest.config.ts`의 `coverage.include`에 있다.
`src/middleware.ts`와 신규 파일이 포함되는지 확인하고, 빠졌으면 추가한다 — 누락 시 변경 라인이
SonarCloud `new_coverage`·`codecov/patch`에서 0%로 계산되어 CI가 실패한다(CLAUDE.md 기록).

## 명시적 트레이드오프

site 모드는 결과적으로 **published `projectId`를 아는 사람은 누구나 그 오너의 키로 업스트림
호출을 트리거할 수 있다**는 뜻이다. 게시된 사이트 자체가 공개이므로 노출 수준은 동일하지만,
레이트리밋이 유일한 방어선이 된다. 사용자 승인된 정책("허용 + 강한 레이트리밋")이며,
Host 바인딩을 우선 적용해 방어 심도를 더한다.

## 범위 밖 (검증되었으나 다음 라운드)

M-1 Quality Loop AbortSignal 부재 · M-2 저장되는 stale `validation` · M-3 레이트리밋
fail-open 환불 · M-4 프록시 캐시 키의 owner 신원 누락 · M-5 `generationTracker` LRU/TTL
락 소실 · M-6 프록시 리미터 eviction 리셋 · M-7 IPv4-mapped IPv6 SSRF 우회 ·
M-8 `x-real-ip` 신뢰.

부수 관찰: `__Secure-authjs.callback-url`이 `https://0.0.0.0:8080`으로 설정되어 있다
(`AUTH_URL` 미설정 추정). 로그인 리다이렉트에 영향 가능 — 별도 확인 필요.

## 참고

- 감사 방법: Claude 독립 검증 + Grok 독립 감사 후 상호 반박 라운드. Grok의 "check→start
  TOCTOU로 중복 파이프라인" 주장은 해당 구간에 `await`이 없어 오탐으로 철회됨.
- [CLAUDE.md](../../../CLAUDE.md) 배포 품질 원칙 — 서빙 3경로 추적, CSP 이중 적용 금지
