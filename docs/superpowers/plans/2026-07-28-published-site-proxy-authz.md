# 게시 사이트 프록시 복구 및 인가 모델 정비 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 게시된 서브도메인 사이트가 익명 방문자에게도 API 데이터를 표시하도록 복구하고, 프록시의 인가 판단을 단일 진입점으로 모아 교차 테넌트 키 남용과 토큰 재사용을 차단한다.

**Architecture:** 미들웨어가 서브도메인에서 프록시 경로 하나만 리라이트 예외로 처리한다(C-1). 프록시는 새 `resolveProxyContext()`로 site(익명·Host 바인딩)/app(세션·소유권 강제) 모드를 판정하고, 라우트는 그 결과만 소비한다(C-2·H-1). 토큰 소비는 단일 원자 SQL로 대체한다(H-2).

**Tech Stack:** Next.js 16 App Router, TypeScript strict, drizzle-orm(better-sqlite3), Vitest, Auth.js v5

## Global Constraints

- **TypeScript strict** — `any` 금지, export 함수에 명시적 반환 타입
- **Path alias** — `@/*` → `src/*`
- **한국어 커밋 메시지**, prefix: `feat:` `fix:` `refactor:` `test:` `docs:` `chore:`
- **클라이언트 IP는 `getClientIp()`(`src/lib/auth/rateLimit.ts`) 단일 출처만 사용** — XFF 직접 파싱 금지(최우측만 신뢰)
- **소유권 검증은 기존 `assertOwner()`(`src/lib/auth/authorize.ts`) 재사용** — 프록시 전용 분기 신설 금지
- **커버리지 등록 필수** — 수정/신규 라우트·모듈이 `vitest.config.ts`의 `coverage.include`에 없으면 SonarCloud `new_coverage`·`codecov/patch`가 0%로 계산되어 CI 실패
- 레이트리밋 한도 기본값: `SITE_PROXY_RATE_LIMIT_PER_MIN=20`, `SITE_PROXY_PROJECT_LIMIT_PER_MIN=120`
- 응답 규약: 프로젝트 부재·미게시 → 404 / `apiId ∉ project_apis` → 403 / app 모드 미소유 → 403 / 레이트리밋 → 429 + `Retry-After`

## File Structure

| 파일 | 책임 |
|------|------|
| `src/middleware.ts` (수정) | 서브도메인 리라이트에 패스스루 예외 추가 |
| `src/lib/proxy/resolveProxyContext.ts` (신규) | 요청 → site/app 모드 판정 + 인가. 프록시 인가의 단일 진실 소스 |
| `src/lib/proxy/siteRateLimit.ts` (신규) | 익명 site 모드 전용 레이트리밋(IP+projectId, 프로젝트 전역) |
| `src/lib/config/rateLimit.ts` (수정) | site 한도 상수 2개 추가 |
| `src/repositories/interfaces/IAuthTokenRepository.ts` (수정) | `consumeValid` 추가, `findValidByHash`/`consume` 제거 |
| `src/repositories/sqlite/SqliteAuthTokenRepository.ts` (수정) | 원자적 `consumeValid` 구현 |
| `src/lib/auth/tokens.ts` (수정) | 2단계 → 원자 1단계 |
| `src/app/api/v1/proxy/route.ts` (수정) | `resolveProxyContext` 소비, 모드별 키 해석 |

---

### Task 1: 미들웨어 서브도메인 패스스루 (C-1)

**Files:**
- Modify: `src/middleware.ts`
- Test: `src/middleware.test.ts`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: 서브도메인 요청의 `/api/v1/proxy`가 리라이트되지 않고 App Router 라우트에 도달한다. Task 5가 이 동작에 의존한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/middleware.test.ts` 하단에 추가한다. 기존 파일은 `beforeEach`에서 `NEXT_PUBLIC_ROOT_DOMAIN`을 지우므로, 서브도메인 테스트는 별도 `describe`에서 직접 설정한다.

```ts
describe('middleware — 서브도메인 리라이트와 프록시 패스스루', () => {
  const ORIG = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'xzawed.xyz';
  });

  afterEach(() => {
    process.env = { ...ORIG };
  });

  function subdomainReq(path: string): NextRequest {
    return new NextRequest(new URL(`http://weather.xzawed.xyz${path}`), {
      headers: { host: 'weather.xzawed.xyz' },
    });
  }

  it('서브도메인의 일반 경로는 /site/{slug}로 리라이트된다', async () => {
    const res = await middleware(subdomainReq('/'));
    expect(res.headers.get('x-middleware-rewrite')).toContain('/site/weather');
  });

  it('서브도메인의 하위 페이지 경로도 /site/{slug} 아래로 리라이트된다', async () => {
    const res = await middleware(subdomainReq('/about'));
    expect(res.headers.get('x-middleware-rewrite')).toContain('/site/weather/about');
  });

  it('서브도메인의 /api/v1/proxy는 리라이트되지 않는다 (게시 사이트가 상대경로로 호출)', async () => {
    const res = await middleware(subdomainReq('/api/v1/proxy?apiId=x&proxyPath=/y'));
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it('패스스루 응답에도 보안 헤더가 적용된다', async () => {
    const res = await middleware(subdomainReq('/api/v1/proxy'));
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('패스스루(API)에는 CSP를 붙이지 않는다 (이중 적용 방지)', async () => {
    const res = await middleware(subdomainReq('/api/v1/proxy'));
    expect(res.headers.get('Content-Security-Policy')).toBeNull();
  });

  it('프록시가 아닌 /api 경로는 여전히 리라이트된다 (최소 노출)', async () => {
    const res = await middleware(subdomainReq('/api/v1/projects'));
    expect(res.headers.get('x-middleware-rewrite')).toContain('/site/weather');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/middleware.test.ts`
Expected: FAIL — 패스스루 테스트에서 `x-middleware-rewrite`가 `/site/weather/api/v1/proxy`로 존재

- [ ] **Step 3: 최소 구현**

`src/middleware.ts`의 `PROTECTED_ROUTES` 선언 아래에 추가한다.

```ts
/**
 * 서브도메인에서 `/site/{slug}` 리라이트를 건너뛸 경로.
 *
 * 게시 사이트의 생성 JS는 상대경로 `/api/v1/proxy?...`로 API를 호출한다
 * (promptBuilder가 직접 외부 URL 호출을 금지하므로 프록시 경유가 유일한 경로).
 * 리라이트되면 `/site/{slug}/api/v1/proxy`가 되어 단일 세그먼트 라우트에
 * 매칭되지 않아 404가 된다.
 *
 * `/api/*` 전체가 아니라 프록시 경로만 여는 이유: 세션 쿠키가 `__Host-`
 * 프리픽스라 호스트 전용이므로 생성 사이트가 방문자 세션을 탈취할 수는 없지만,
 * 불필요한 엔드포인트를 서브도메인에 노출할 이유가 없다(최소 노출).
 */
const SUBDOMAIN_PASSTHROUGH_PREFIXES = ['/api/v1/proxy'];

function isSubdomainPassthrough(pathname: string): boolean {
  return SUBDOMAIN_PASSTHROUGH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
```

이어서 서브도메인 분기의 조건을 수정한다. 기존:

```ts
      if (slug && slug !== 'www') {
```

수정 후:

```ts
      if (slug && slug !== 'www' && !isSubdomainPassthrough(request.nextUrl.pathname)) {
```

패스스루면 `if` 블록에 들어가지 않고 함수 아래쪽 일반 응답 경로로 흘러간다. 그 경로가 correlation id·보안 헤더를 설정하고 `isApi` 판정으로 CSP를 건너뛰므로 별도 처리가 필요 없다.

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/middleware.test.ts`
Expected: PASS (신규 6건 포함 전체 통과)

- [ ] **Step 5: 커버리지 등록 (확인이 아니라 추가 — 현재 없음)**

`src/middleware.ts`는 **현재 `coverage.include`에 없다**(확인됨). 누락 시 변경 라인이
SonarCloud `new_coverage`·`codecov/patch`에서 0%로 계산되어 CI가 실패한다.

`vitest.config.ts`의 `coverage.include` 배열에 추가한다:

```ts
        'src/middleware.ts',
```

Run: `grep -n "src/middleware.ts" vitest.config.ts`
Expected: 한 줄 출력

- [ ] **Step 6: 커밋**

```bash
git add src/middleware.ts src/middleware.test.ts vitest.config.ts
git commit -m "fix: 게시 서브도메인에서 프록시 경로 404 수정 (C-1)

서브도메인 요청의 모든 경로를 /site/{slug}로 리라이트해
/api/v1/proxy가 단일 세그먼트 라우트에 미매칭되어 404였다.
생성 사이트는 상대경로로만 프록시를 호출하므로 API 데이터가
전부 로딩 실패했다(프로덕션 실측: apex 401 vs 서브도메인 404).

프록시 경로 하나만 리라이트 예외로 둔다. /api/* 전체를 열지 않는 것은
최소 노출 원칙 — 세션 쿠키가 __Host- 프리픽스라 호스트 전용이지만
불필요한 엔드포인트를 서브도메인에 노출할 이유가 없다."
```

---

### Task 2: 토큰 원자적 소비 (H-2)

**Files:**
- Modify: `src/repositories/interfaces/IAuthTokenRepository.ts`
- Modify: `src/repositories/sqlite/SqliteAuthTokenRepository.ts`
- Modify: `src/lib/auth/tokens.ts`
- Test: `src/lib/auth/tokens.test.ts`
- Test(수정): `src/services/authService.test.ts` — fake repo가 제거된 메서드를 참조한다

**Interfaces:**
- Consumes: 없음 (Task 1과 독립)
- Produces: `IAuthTokenRepository.consumeValid(tokenHash: string, type: AuthTokenType, now: string): Promise<string | null>` — 유효·미소비·미만료 토큰을 원자적으로 소비하고 `userId` 반환, 조건 불일치면 `null`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/auth/tokens.test.ts`의 `fakeRepo()`를 새 인터페이스로 교체하고, 원자성 테스트를 추가한다.

```ts
function fakeRepo(): IAuthTokenRepository & { rows: Array<Record<string, unknown>> } {
  const rows: Array<Record<string, unknown>> = [];
  return {
    rows,
    create: vi.fn(async (userId, tokenHash, type, expiresAt) => {
      rows.push({ id: `t${rows.length}`, userId, tokenHash, type, expiresAt, consumed: false });
    }),
    // 원자적 소비: 조건 검사와 상태 변경이 같은 동기 블록에서 일어난다.
    consumeValid: vi.fn(async (tokenHash, type, now) => {
      const r = rows.find(
        (x) =>
          x.tokenHash === tokenHash &&
          x.type === type &&
          !x.consumed &&
          (x.expiresAt as string) > now,
      );
      if (!r) return null;
      r.consumed = true;
      return r.userId as string;
    }),
    invalidateByUserAndType: vi.fn(async () => {}),
  };
}
```

기존 테스트에 이어 추가한다.

```ts
  it('같은 토큰의 두 번째 소비는 null이다 (일회성 계약)', async () => {
    const repo = fakeRepo();
    const raw = await issueToken(repo, 'user-1', 'password_reset', EMAIL_VERIFY_TTL_MS);

    expect(await verifyAndConsumeToken(repo, raw, 'password_reset')).toBe('user-1');
    expect(await verifyAndConsumeToken(repo, raw, 'password_reset')).toBeNull();
  });

  it('verifyAndConsumeToken은 조회·소비를 나누지 않고 consumeValid 한 번만 호출한다', async () => {
    // 2단계로 되돌아가면(조회 → await → 소비) 그 사이에 다른 요청이 끼어들 수 있다.
    // 원자성의 실체는 SQL의 `WHERE consumed_at IS NULL`이고, 이 테스트는 호출부가
    // 그 원자 연산을 우회하지 않는다는 계약을 고정한다.
    const repo = fakeRepo();
    const raw = await issueToken(repo, 'user-1', 'email_verify', EMAIL_VERIFY_TTL_MS);
    await verifyAndConsumeToken(repo, raw, 'email_verify');
    expect(repo.consumeValid).toHaveBeenCalledTimes(1);
  });

  it('만료된 토큰은 소비되지 않는다', async () => {
    const repo = fakeRepo();
    const raw = await issueToken(repo, 'user-1', 'email_verify', -1000); // 이미 만료
    expect(await verifyAndConsumeToken(repo, raw, 'email_verify')).toBeNull();
  });

  it('타입이 다르면 소비되지 않는다', async () => {
    const repo = fakeRepo();
    const raw = await issueToken(repo, 'user-1', 'email_verify', EMAIL_VERIFY_TTL_MS);
    expect(await verifyAndConsumeToken(repo, raw, 'password_reset')).toBeNull();
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/lib/auth/tokens.test.ts`
Expected: FAIL — `repo.consumeValid is not a function` (아직 `tokens.ts`가 2단계 호출)

- [ ] **Step 3: 인터페이스 교체**

`src/repositories/interfaces/IAuthTokenRepository.ts`:

```ts
export interface IAuthTokenRepository {
  create(userId: string, tokenHash: string, type: AuthTokenType, expiresAt: string): Promise<void>;
  /**
   * 유효(미소비·미만료)한 토큰을 **원자적으로** 소비하고 userId를 반환한다.
   * 조건에 맞는 행이 없으면 null.
   *
   * 조회 → 소비 2단계로 나누면 두 await 사이에 다른 요청이 끼어들어 같은 토큰이
   * 두 번 소비될 수 있다(비밀번호 재설정 링크 재사용). 단일 문으로 유지할 것.
   */
  consumeValid(tokenHash: string, type: AuthTokenType, now: string): Promise<string | null>;
  invalidateByUserAndType(userId: string, type: AuthTokenType, now: string): Promise<void>;
}
```

- [ ] **Step 4: SQLite 구현 교체**

`src/repositories/sqlite/SqliteAuthTokenRepository.ts`에서 `findValidByHash`와 `consume`를 삭제하고 아래를 추가한다. 임포트에 `gt`, `isNull`, `and`, `eq`가 이미 있으면 재사용한다.

```ts
  async consumeValid(
    tokenHash: string,
    type: AuthTokenType,
    now: string,
  ): Promise<string | null> {
    // 조건 검사와 갱신이 단일 UPDATE ... RETURNING으로 원자 실행된다.
    const row = this.db
      .update(schema.authTokens)
      .set({ consumed_at: now })
      .where(
        and(
          eq(schema.authTokens.token_hash, tokenHash),
          eq(schema.authTokens.type, type),
          isNull(schema.authTokens.consumed_at),
          gt(schema.authTokens.expires_at, now),
        ),
      )
      .returning({ userId: schema.authTokens.user_id })
      .get();
    return row?.userId ?? null;
  }
```

- [ ] **Step 5: 호출부 단순화**

`src/lib/auth/tokens.ts`의 `verifyAndConsumeToken`을 교체한다.

```ts
/** 원문 토큰을 검증하고 일회성으로 소비한다. 유효하면 userId, 아니면 null. */
export async function verifyAndConsumeToken(
  repo: IAuthTokenRepository,
  raw: string,
  type: AuthTokenType,
): Promise<string | null> {
  return repo.consumeValid(hashToken(raw), type, new Date().toISOString());
}
```

- [ ] **Step 6: 다른 fake repo 갱신**

`src/services/authService.test.ts`의 fake repo가 `findValidByHash`를 참조한다(32·77·83·156·162행). `consumeValid`로 교체한다. 예를 들어 `findValidByHash.mockResolvedValue({ id: 'tok1', userId })`는 `consumeValid.mockResolvedValue(userId)`로, `mockResolvedValue(null)`은 그대로 `null`이다.

- [ ] **Step 6b: SQLite 레포 테스트 재작성 (이걸 빠뜨리면 CI가 깨진다)**

`src/repositories/sqlite/SqliteAuthTokenRepository.test.ts`가 제거되는 `findValidByHash`(33·39·44·46·51·58·59행)와 `consume`(45행)을 직접 호출한다. **실 SQLite에 대한 유일한 원자성 검증**이므로 지우지 말고 `consumeValid` 기준으로 재작성한다.

```ts
  it('유효한 토큰을 소비하면 userId를 반환한다', async () => {
    await repo.create('user-1', 'hash-a', 'email_verify', future);
    expect(await repo.consumeValid('hash-a', 'email_verify', now)).toBe('user-1');
  });

  it('같은 토큰을 두 번 소비하면 두 번째는 null (실 SQLite 원자성)', async () => {
    await repo.create('user-1', 'hash-c', 'password_reset', future);
    expect(await repo.consumeValid('hash-c', 'password_reset', now)).toBe('user-1');
    expect(await repo.consumeValid('hash-c', 'password_reset', now)).toBeNull();
  });

  it('만료된 토큰은 소비되지 않는다', async () => {
    await repo.create('user-1', 'hash-d', 'password_reset', past);
    expect(await repo.consumeValid('hash-d', 'password_reset', now)).toBeNull();
  });

  it('타입이 다르면 소비되지 않는다', async () => {
    await repo.create('user-1', 'hash-e', 'email_verify', future);
    expect(await repo.consumeValid('hash-e', 'password_reset', now)).toBeNull();
  });

  it('invalidateByUserAndType 이후에는 소비되지 않는다', async () => {
    await repo.create('user-1', 'hash-f', 'password_reset', future);
    await repo.invalidateByUserAndType('user-1', 'password_reset', now);
    expect(await repo.consumeValid('hash-f', 'password_reset', now)).toBeNull();
  });
```

기존 파일의 `repo`·`now`·`future`·`past` 셋업(상단 `beforeEach`)은 그대로 재사용한다.

- [ ] **Step 7: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/auth/tokens.test.ts src/services/authService.test.ts`
Expected: PASS

- [ ] **Step 8: 타입 검사**

Run: `pnpm type-check`
Expected: 통과 — 제거한 메서드를 참조하는 곳이 남아 있으면 여기서 잡힌다

- [ ] **Step 9: 커밋**

```bash
git add src/repositories/interfaces/IAuthTokenRepository.ts src/repositories/sqlite/SqliteAuthTokenRepository.ts src/repositories/sqlite/SqliteAuthTokenRepository.test.ts src/lib/auth/tokens.ts src/lib/auth/tokens.test.ts src/services/authService.test.ts
git commit -m "fix: 일회성 토큰을 원자적으로 소비 (H-2)

findValidByHash → await → consume(id) 2단계였고 consume은 WHERE id만
검사해 consumed_at IS NULL 가드도 변경 행 수 확인도 없었다. 두 await
사이에 이벤트 루프가 다른 요청을 진행시켜 동시 요청이 모두 성공하면
비밀번호 재설정 링크가 재사용될 수 있었다.

단일 UPDATE ... WHERE consumed_at IS NULL AND expires_at > ? RETURNING
으로 대체하고, 오용 여지를 남기지 않도록 기존 2개 메서드는 인터페이스에서
제거했다."
```

---

### Task 3: 프록시 인가 컨텍스트 판정 (C-2·H-1의 핵심 단위)

**Files:**
- Create: `src/lib/proxy/resolveProxyContext.ts`
- Test: `src/lib/proxy/resolveProxyContext.test.ts`

**Interfaces:**
- Consumes: 없음 (순수 로직 단위)
- Produces:
  ```ts
  type ProxyContext =
    | { mode: 'site'; project: Project; linkedApiIds: string[] }
    | { mode: 'app'; user: AuthUser; project: Project | null; linkedApiIds: string[] };

  type ProxyContextDeps = {
    getAuthUser: () => Promise<AuthUser | null>;
    findProjectBySlug: (slug: string) => Promise<Project | null>;
    findProjectById: (id: string) => Promise<Project | null>;
    getProjectApiIds: (projectId: string) => Promise<string[]>;
    rootDomain: string | undefined;
  };

  function resolveProxyContext(
    request: Request,
    apiId: string,
    deps: ProxyContextDeps,
  ): Promise<ProxyContext | ProxyContextError>;

  type ProxyContextError = { error: { status: 401 | 403 | 404; code: string; message: string } };
  ```
  Task 5가 이 함수와 타입을 소비한다. 의존성을 주입형으로 두어 라우트 없이 단위 테스트한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/proxy/resolveProxyContext.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { resolveProxyContext, type ProxyContextDeps } from './resolveProxyContext';
import type { Project } from '@/types/project';

const API_ID = 'aaaabbbb-cccc-dddd-eeee-ffffffffffff';
const OTHER_API_ID = '11112222-3333-4444-5555-666677778888';

function makeProject(over: Partial<Project> = {}): Project {
  return {
    id: 'proj-1', userId: 'owner-1', organizationId: null, name: 'p', context: 'c',
    status: 'published', deployUrl: null, deployPlatform: null, repoUrl: null,
    previewUrl: null, metadata: {}, currentVersion: 1, apis: [], slug: 'weather',
    publishedAt: '2026-01-01T00:00:00.000Z', createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z', ...over,
  } as Project;
}

/** 각 의존성을 vi.fn으로 노출해 호출 여부까지 단언할 수 있게 한다. */
type MockedDeps = {
  [K in keyof ProxyContextDeps]: ProxyContextDeps[K] extends (...a: infer A) => infer R
    ? ReturnType<typeof vi.fn<(...a: A) => R>>
    : ProxyContextDeps[K];
};

function makeDeps(over: Partial<MockedDeps> = {}): MockedDeps {
  return {
    getAuthUser: vi.fn(async () => null),
    findProjectBySlug: vi.fn(async () => makeProject()),
    findProjectById: vi.fn(async () => makeProject()),
    getProjectApiIds: vi.fn(async () => [API_ID]),
    rootDomain: 'xzawed.xyz',
    ...over,
  } as MockedDeps;
}

function req(url: string, host?: string): Request {
  return new Request(url, host ? { headers: { host } } : undefined);
}

describe('resolveProxyContext — site 모드 (익명)', () => {
  it('published 서브도메인 → site 모드, 프로젝트는 Host에서 확정', async () => {
    const deps = makeDeps();
    const ctx = await resolveProxyContext(
      req('https://weather.xzawed.xyz/api/v1/proxy', 'weather.xzawed.xyz'), API_ID, deps,
    );
    expect(ctx).toMatchObject({ mode: 'site' });
    expect((ctx as { project: Project }).project.userId).toBe('owner-1');
  });

  it('Host가 있으면 클라이언트 projectId는 무시된다', async () => {
    const deps = makeDeps();
    await resolveProxyContext(
      req('https://weather.xzawed.xyz/api/v1/proxy?projectId=attacker-proj', 'weather.xzawed.xyz'),
      API_ID, deps,
    );
    expect(deps.findProjectBySlug).toHaveBeenCalledWith('weather');
    expect(deps.findProjectById).not.toHaveBeenCalled();
  });

  it('미게시 프로젝트의 서브도메인 → 404', async () => {
    const deps = makeDeps({ findProjectBySlug: vi.fn(async () => makeProject({ status: 'draft' })) });
    const ctx = await resolveProxyContext(
      req('https://weather.xzawed.xyz/api/v1/proxy', 'weather.xzawed.xyz'), API_ID, deps,
    );
    expect(ctx).toMatchObject({ error: { status: 404 } });
  });

  it('존재하지 않는 slug → 404 (부재와 미게시를 구분해 노출하지 않음)', async () => {
    const deps = makeDeps({ findProjectBySlug: vi.fn(async () => null) });
    const ctx = await resolveProxyContext(
      req('https://nope.xzawed.xyz/api/v1/proxy', 'nope.xzawed.xyz'), API_ID, deps,
    );
    expect(ctx).toMatchObject({ error: { status: 404 } });
  });

  it('apex + 세션 없음 + published projectId → site 모드 (직접 게시 URL 경로)', async () => {
    const deps = makeDeps();
    const ctx = await resolveProxyContext(
      req('https://xzawed.xyz/api/v1/proxy?projectId=proj-1', 'xzawed.xyz'), API_ID, deps,
    );
    expect(ctx).toMatchObject({ mode: 'site' });
  });

  it('apex + 세션 없음 + projectId 없음 → 401', async () => {
    const deps = makeDeps();
    const ctx = await resolveProxyContext(
      req('https://xzawed.xyz/api/v1/proxy', 'xzawed.xyz'), API_ID, deps,
    );
    expect(ctx).toMatchObject({ error: { status: 401 } });
  });

  it('site 모드에서 프로젝트에 연결되지 않은 apiId → 403', async () => {
    const deps = makeDeps();
    const ctx = await resolveProxyContext(
      req('https://weather.xzawed.xyz/api/v1/proxy', 'weather.xzawed.xyz'), OTHER_API_ID, deps,
    );
    expect(ctx).toMatchObject({ error: { status: 403 } });
  });

  it('예약 slug(www)는 서브도메인 사이트로 보지 않는다', async () => {
    const deps = makeDeps();
    const ctx = await resolveProxyContext(
      req('https://www.xzawed.xyz/api/v1/proxy', 'www.xzawed.xyz'), API_ID, deps,
    );
    expect(ctx).toMatchObject({ error: { status: 401 } });
    expect(deps.findProjectBySlug).not.toHaveBeenCalled();
  });
});

describe('resolveProxyContext — app 모드 (세션)', () => {
  const user = { id: 'owner-1', email: 'o@x.com', name: null, avatarUrl: null };

  it('세션 + 자기 projectId → app 모드', async () => {
    const deps = makeDeps({ getAuthUser: vi.fn(async () => user) });
    const ctx = await resolveProxyContext(
      req('https://xzawed.xyz/api/v1/proxy?projectId=proj-1', 'xzawed.xyz'), API_ID, deps,
    );
    expect(ctx).toMatchObject({ mode: 'app' });
  });

  it('세션 + 타인 projectId → 403 (H-1 회귀 방지)', async () => {
    const deps = makeDeps({
      getAuthUser: vi.fn(async () => ({ ...user, id: 'attacker' })),
      findProjectById: vi.fn(async () => makeProject({ userId: 'victim' })),
    });
    const ctx = await resolveProxyContext(
      req('https://xzawed.xyz/api/v1/proxy?projectId=proj-1', 'xzawed.xyz'), API_ID, deps,
    );
    expect(ctx).toMatchObject({ error: { status: 403 } });
  });

  it('세션 + projectId 없음 → app 모드, project는 null (플랫폼 키만 사용)', async () => {
    const deps = makeDeps({ getAuthUser: vi.fn(async () => user) });
    const ctx = await resolveProxyContext(
      req('https://xzawed.xyz/api/v1/proxy', 'xzawed.xyz'), API_ID, deps,
    );
    expect(ctx).toMatchObject({ mode: 'app', project: null });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/lib/proxy/resolveProxyContext.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`src/lib/proxy/resolveProxyContext.ts`:

```ts
import type { Project } from '@/types/project';
import type { AuthUser } from '@/lib/auth/types';
import { isValidSlug } from '@/lib/utils/slugify';
import { assertOwner } from '@/lib/auth/authorize';

/**
 * 프록시 요청의 인가 컨텍스트.
 *
 * 인증·인가 판단이 라우트 여러 곳에 흩어져 있으면 한쪽만 고쳐 구멍이 남는다
 * (H-1: 개인 키 해석부가 소유권을 확인하지 않았다). 판단을 이 모듈 하나로 모으고
 * 라우트는 결과만 소비한다.
 */
export type ProxyContext =
  | { mode: 'site'; project: Project; linkedApiIds: string[] }
  | { mode: 'app'; user: AuthUser; project: Project | null; linkedApiIds: string[] };

export interface ProxyContextError {
  error: { status: 401 | 403 | 404; code: string; message: string };
}

export interface ProxyContextDeps {
  getAuthUser: () => Promise<AuthUser | null>;
  findProjectBySlug: (slug: string) => Promise<Project | null>;
  findProjectById: (id: string) => Promise<Project | null>;
  getProjectApiIds: (projectId: string) => Promise<string[]>;
  rootDomain: string | undefined;
}

const NOT_FOUND: ProxyContextError = {
  error: { status: 404, code: 'NOT_FOUND', message: '사이트를 찾을 수 없습니다.' },
};
const AUTH_REQUIRED: ProxyContextError = {
  error: { status: 401, code: 'AUTH_REQUIRED', message: '로그인이 필요합니다.' },
};
const API_NOT_LINKED: ProxyContextError = {
  error: { status: 403, code: 'API_NOT_LINKED', message: '이 사이트에 연결되지 않은 API입니다.' },
};
const FORBIDDEN: ProxyContextError = {
  error: { status: 403, code: 'FORBIDDEN', message: '권한이 없습니다.' },
};

/**
 * Host 헤더에서 게시 사이트 slug를 추출한다. 서브도메인이 아니면 null.
 *
 * 호스트명은 대소문자를 구분하지 않으므로(RFC 4343) 비교 전에 소문자로 정규화한다.
 * 정규화하지 않으면 `Weather.xzawed.xyz` 같은 요청이 endsWith·isValidSlug에서
 * 조용히 탈락해 간헐적으로만 실패한다.
 */
export function extractSiteSlug(host: string, rootDomain: string | undefined): string | null {
  if (!rootDomain) return null;
  const hostname = host.toLowerCase().split(':')[0];
  if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) return null;
  const root = rootDomain.toLowerCase();
  if (!hostname.endsWith(`.${root}`)) return null;
  const slug = hostname.slice(0, -(root.length + 1));
  // isValidSlug가 예약어(www·api·admin 등)와 형식을 함께 검사한다.
  return isValidSlug(slug) ? slug : null;
}

export async function resolveProxyContext(
  request: Request,
  apiId: string,
  deps: ProxyContextDeps,
): Promise<ProxyContext | ProxyContextError> {
  const url = new URL(request.url);
  const host = request.headers.get('host') ?? url.host;
  const slug = extractSiteSlug(host, deps.rootDomain);

  // 1) Host가 게시 사이트를 가리키면 그것이 권위 — 클라이언트 projectId는 보지 않는다.
  if (slug) {
    const project = await deps.findProjectBySlug(slug);
    if (!project || project.status !== 'published') return NOT_FOUND;
    return buildSiteContext(project, apiId, deps);
  }

  // 2) apex + 세션 → app 모드(소유권 강제)
  const user = await deps.getAuthUser();
  const projectId = url.searchParams.get('projectId');

  if (user?.id) {
    if (!projectId) return { mode: 'app', user, project: null, linkedApiIds: [] };
    const project = await deps.findProjectById(projectId);
    if (!project) return NOT_FOUND;
    // 소유권 규약은 assertOwner 한 곳에만 둔다 — 프록시 전용 비교식을 새로 만들면
    // 규약이 갈라지고, 개인 키 해석부가 소유권을 확인하지 않던 H-1이 재발한다.
    try {
      assertOwner(project, user.id);
    } catch {
      return FORBIDDEN;
    }
    const linkedApiIds = await deps.getProjectApiIds(project.id);
    if (!linkedApiIds.includes(apiId)) return API_NOT_LINKED;
    return { mode: 'app', user, project, linkedApiIds };
  }

  // 3) apex + 세션 없음 + published projectId → site 모드
  //    apex의 /site/{slug} 직접 서빙 경로를 위해 필요하다. 이게 없으면
  //    "서브도메인에선 되고 직접 게시 URL에선 안 되는" 경로별 분기가 생긴다.
  if (projectId) {
    const project = await deps.findProjectById(projectId);
    if (!project || project.status !== 'published') return NOT_FOUND;
    return buildSiteContext(project, apiId, deps);
  }

  return AUTH_REQUIRED;
}

async function buildSiteContext(
  project: Project,
  apiId: string,
  deps: ProxyContextDeps,
): Promise<ProxyContext | ProxyContextError> {
  const linkedApiIds = await deps.getProjectApiIds(project.id);
  // 게시 사이트가 자신과 무관한 카탈로그 API를 오너 키로 호출하는 것을 막는다.
  if (!linkedApiIds.includes(apiId)) return API_NOT_LINKED;
  return { mode: 'site', project, linkedApiIds };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/proxy/resolveProxyContext.test.ts`
Expected: PASS (13건)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/proxy/resolveProxyContext.ts src/lib/proxy/resolveProxyContext.test.ts
git commit -m "feat: 프록시 인가 컨텍스트 판정 모듈 추가

site(익명·Host 바인딩)/app(세션·소유권 강제) 이중 모드를 한 곳에서
판정한다. Host로 프로젝트가 확정되면 클라이언트 projectId는 무시해
사용자 입력이 인가 근거가 되지 않게 한다. 두 모드 공통으로
apiId ∈ project_apis를 강제한다.

의존성 주입형이라 라우트 없이 진리표를 단위 검증한다."
```

---

### Task 4: 익명 사이트 모드 레이트리밋

**Files:**
- Modify: `src/lib/config/rateLimit.ts`
- Create: `src/lib/proxy/siteRateLimit.ts`
- Test: `src/lib/proxy/siteRateLimit.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: `checkSiteRateLimit(clientIp: string, projectId: string): { allowed: boolean; retryAfterSec: number }` — Task 5가 site 모드에서 호출한다

- [ ] **Step 1: 설정 상수 추가**

`src/lib/config/rateLimit.ts` 하단에 추가한다.

```ts
/**
 * 익명 게시 사이트 프록시 한도 — IP+projectId 단위. 기본 20회/분.
 *
 * 이 리미터가 타인 API 키 소진을 막는 유일한 경계다(게시 사이트는 오너의 개인 키로
 * 업스트림을 호출한다). 게시 사이트 실사용 데이터가 없어 보수적으로 시작하고,
 * 운영 로그를 보고 환경변수로 조정한다.
 */
export const SITE_PROXY_RATE_LIMIT_PER_MIN = envInt('SITE_PROXY_RATE_LIMIT_PER_MIN', 20);

/** 프로젝트 전역 한도. 분산 IP로 한 오너의 키를 소진시키는 것을 상한. 기본 120회/분. */
export const SITE_PROXY_PROJECT_LIMIT_PER_MIN = envInt('SITE_PROXY_PROJECT_LIMIT_PER_MIN', 120);

/** site 리미터가 동시에 추적하는 최대 버킷 수. 초과 시 만료 항목만 정리한다. */
export const MAX_SITE_RATE_LIMIT_BUCKETS = envInt('MAX_SITE_RATE_LIMIT_BUCKETS', 5000);
```

- [ ] **Step 2: 실패하는 테스트 작성**

`src/lib/proxy/siteRateLimit.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { checkSiteRateLimit, __resetSiteRateLimit } from './siteRateLimit';
import { SITE_PROXY_RATE_LIMIT_PER_MIN, SITE_PROXY_PROJECT_LIMIT_PER_MIN } from '@/lib/config/rateLimit';

describe('checkSiteRateLimit', () => {
  beforeEach(() => {
    __resetSiteRateLimit();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('한도 내에서는 허용한다', () => {
    for (let i = 0; i < SITE_PROXY_RATE_LIMIT_PER_MIN; i++) {
      expect(checkSiteRateLimit('1.1.1.1', 'p1').allowed).toBe(true);
    }
  });

  it('IP+projectId 한도 초과 시 차단하고 retryAfter를 준다', () => {
    for (let i = 0; i < SITE_PROXY_RATE_LIMIT_PER_MIN; i++) checkSiteRateLimit('1.1.1.1', 'p1');
    const res = checkSiteRateLimit('1.1.1.1', 'p1');
    expect(res.allowed).toBe(false);
    expect(res.retryAfterSec).toBeGreaterThan(0);
  });

  it('다른 IP는 서로 영향을 주지 않는다', () => {
    for (let i = 0; i < SITE_PROXY_RATE_LIMIT_PER_MIN; i++) checkSiteRateLimit('1.1.1.1', 'p1');
    expect(checkSiteRateLimit('2.2.2.2', 'p1').allowed).toBe(true);
  });

  it('윈도가 지나면 리셋된다', () => {
    for (let i = 0; i < SITE_PROXY_RATE_LIMIT_PER_MIN; i++) checkSiteRateLimit('1.1.1.1', 'p1');
    expect(checkSiteRateLimit('1.1.1.1', 'p1').allowed).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(checkSiteRateLimit('1.1.1.1', 'p1').allowed).toBe(true);
  });

  it('분산 IP여도 프로젝트 전역 한도에서 차단된다', () => {
    let allowed = 0;
    // IP를 매번 바꿔 IP 버킷은 항상 여유가 있게 한다.
    for (let i = 0; i < SITE_PROXY_PROJECT_LIMIT_PER_MIN + 10; i++) {
      if (checkSiteRateLimit(`10.0.${Math.floor(i / 250)}.${i % 250}`, 'p1').allowed) allowed++;
    }
    expect(allowed).toBe(SITE_PROXY_PROJECT_LIMIT_PER_MIN);
  });

  it('용량 압박이 있어도 활성 윈도의 카운터를 리셋하지 않는다', () => {
    // 기존 프록시 리미터(LRUMap)는 eviction 시 활성 카운터가 사라져 한도를 우회할 수 있다.
    // 이 리미터는 만료 항목만 정리하므로 살아 있는 카운터가 유지되어야 한다.
    for (let i = 0; i < SITE_PROXY_RATE_LIMIT_PER_MIN; i++) checkSiteRateLimit('1.1.1.1', 'p1');
    // 다른 버킷을 대량 생성해 용량을 압박한다.
    for (let i = 0; i < 6000; i++) checkSiteRateLimit(`9.9.${Math.floor(i / 250)}.${i % 250}`, 'pX');
    expect(checkSiteRateLimit('1.1.1.1', 'p1').allowed).toBe(false);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm vitest run src/lib/proxy/siteRateLimit.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 4: 구현**

`src/lib/proxy/siteRateLimit.ts`:

```ts
import {
  RATE_LIMIT_WINDOW_MS,
  SITE_PROXY_RATE_LIMIT_PER_MIN,
  SITE_PROXY_PROJECT_LIMIT_PER_MIN,
  MAX_SITE_RATE_LIMIT_BUCKETS,
} from '@/lib/config/rateLimit';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * 익명 게시 사이트 프록시 레이트리밋.
 *
 * 기존 프록시 리미터는 LRUMap을 써서 용량 초과 시 **활성 윈도의 카운터가 통째로
 * 사라진다** — 다음 요청이 count:1로 다시 시작해 한도를 우회할 수 있다.
 * 이 리미터는 타인 API 키 소진을 막는 유일한 경계이므로 그 패턴을 쓰지 않는다:
 * 만료된 버킷만 정리하고, 용량이 부족하면 살아 있는 카운터를 버리는 대신
 * 새 버킷 생성을 거부(=차단)한다.
 *
 * Railway 단일 인스턴스 전제. 멀티 인스턴스 전환 시 Redis 등으로 교체 필요.
 */
const ipBuckets = new Map<string, Bucket>();
const projectBuckets = new Map<string, Bucket>();

function sweepExpired(map: Map<string, Bucket>, now: number): void {
  for (const [key, bucket] of map) {
    if (now >= bucket.resetAt) map.delete(key);
  }
}

/**
 * 버킷을 소비한다.
 * @returns 허용되면 true. 한도 초과이거나 용량 부족으로 새 버킷을 만들 수 없으면 false.
 */
function consume(
  map: Map<string, Bucket>,
  key: string,
  limit: number,
  now: number,
): { allowed: boolean; resetAt: number } {
  const existing = map.get(key);
  if (existing && now < existing.resetAt) {
    if (existing.count >= limit) return { allowed: false, resetAt: existing.resetAt };
    existing.count++;
    return { allowed: true, resetAt: existing.resetAt };
  }

  // 신규 또는 만료된 버킷 — 먼저 만료분을 정리해 자리를 확보한다.
  if (!existing && map.size >= MAX_SITE_RATE_LIMIT_BUCKETS) {
    sweepExpired(map, now);
    if (map.size >= MAX_SITE_RATE_LIMIT_BUCKETS) {
      // 활성 카운터를 버리느니 차단한다(우회 방지).
      return { allowed: false, resetAt: now + RATE_LIMIT_WINDOW_MS };
    }
  }

  const resetAt = now + RATE_LIMIT_WINDOW_MS;
  map.set(key, { count: 1, resetAt });
  return { allowed: true, resetAt };
}

export function checkSiteRateLimit(
  clientIp: string,
  projectId: string,
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();

  const perIp = consume(ipBuckets, `${clientIp}:${projectId}`, SITE_PROXY_RATE_LIMIT_PER_MIN, now);
  if (!perIp.allowed) {
    return { allowed: false, retryAfterSec: Math.ceil((perIp.resetAt - now) / 1000) };
  }

  const perProject = consume(projectBuckets, projectId, SITE_PROXY_PROJECT_LIMIT_PER_MIN, now);
  if (!perProject.allowed) {
    return { allowed: false, retryAfterSec: Math.ceil((perProject.resetAt - now) / 1000) };
  }

  return { allowed: true, retryAfterSec: 0 };
}

/** 테스트 전용 — 모듈 레벨 상태를 초기화한다. */
export function __resetSiteRateLimit(): void {
  ipBuckets.clear();
  projectBuckets.clear();
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm vitest run src/lib/proxy/siteRateLimit.test.ts`
Expected: PASS (6건)

- [ ] **Step 6: 커밋**

```bash
git add src/lib/config/rateLimit.ts src/lib/proxy/siteRateLimit.ts src/lib/proxy/siteRateLimit.test.ts
git commit -m "feat: 익명 게시 사이트 프록시 레이트리밋 추가

IP+projectId 버킷(기본 20/분)과 프로젝트 전역 버킷(기본 120/분)을 둔다.
게시 사이트는 오너의 개인 API 키로 업스트림을 호출하므로 이 리미터가
키 소진을 막는 유일한 경계다.

기존 프록시 리미터의 LRUMap eviction 패턴을 의도적으로 피했다 — 용량
초과 시 활성 윈도 카운터가 사라져 한도를 우회할 수 있다. 여기서는 만료
버킷만 정리하고, 자리가 없으면 살아 있는 카운터를 버리는 대신 차단한다."
```

---

### Task 5: 프록시 라우트 통합 (C-2·H-1 완결)

**Files:**
- Modify: `src/app/api/v1/proxy/route.ts`
- Test: `src/__tests__/api/proxy.test.ts`

**Interfaces:**
- Consumes: Task 3의 `resolveProxyContext` / `ProxyContext` / `ProxyContextError`, Task 4의 `checkSiteRateLimit`
- Produces: 없음 (최종 통합)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/__tests__/api/proxy.test.ts` 하단에 추가한다. 파일 상단의 기존 `vi.mock('@/repositories/factory', ...)`에 `createProjectRepository`가 이미 있으므로 그대로 쓴다.

```ts
import { __resetSiteRateLimit } from '@/lib/proxy/siteRateLimit';

describe('프록시 인가 — site/app 모드', () => {
  const ORIG_ENV = { ...process.env };
  const PROJECT = { id: 'proj-1', userId: 'owner-1', status: 'published', slug: 'weather' };
  const ATTACKER = { id: 'attacker', email: 'a@x.com', name: null, avatarUrl: null };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    __resetSiteRateLimit();
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'xzawed.xyz';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(makeSuccessResponse())));
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
  });

  function siteReq(host: string, extra = ''): Request {
    return new Request(
      `https://${host}/api/v1/proxy?apiId=${VALID_API_ID}&proxyPath=/data${extra}`,
      { headers: { host } },
    );
  }

  /**
   * 프록시 라우트를 mock 상태로 호출한다.
   * `times`를 주면 같은 요청을 N회 호출하고 **마지막 응답**을 반환한다(레이트리밋 검증용).
   */
  async function invokeProxy(opts: {
    request: Request;
    user?: typeof ATTACKER | null;
    projectBySlug?: Record<string, unknown> | null;
    projectById?: Record<string, unknown> | null;
    linkedApiIds?: string[];
    times?: number;
  }): Promise<{ res: Response; userApiKeyRepo: { findByUserAndApi: ReturnType<typeof vi.fn> } }> {
    const { getAuthUser } = await import('@/lib/auth/index');
    const factory = await import('@/repositories/factory');

    vi.mocked(getAuthUser).mockResolvedValue(opts.user ?? null);

    const userApiKeyRepo = { findByUserAndApi: vi.fn().mockResolvedValue(null) };
    vi.mocked(factory.createUserApiKeyRepository).mockReturnValue(
      userApiKeyRepo as unknown as ReturnType<typeof factory.createUserApiKeyRepository>,
    );

    vi.mocked(factory.createProjectRepository).mockReturnValue({
      findBySlug: vi.fn().mockResolvedValue(opts.projectBySlug ?? null),
      findById: vi.fn().mockResolvedValue(opts.projectById ?? null),
      getProjectApiIds: vi.fn().mockResolvedValue(opts.linkedApiIds ?? [VALID_API_ID]),
    } as unknown as ReturnType<typeof factory.createProjectRepository>);

    vi.mocked(factory.createCatalogRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue(mockPublicApi),
    } as unknown as ReturnType<typeof factory.createCatalogRepository>);

    const { GET } = await import('@/app/api/v1/proxy/route');
    let res!: Response;
    for (let i = 0; i < (opts.times ?? 1); i++) {
      res = await GET(opts.request);
    }
    return { res, userApiKeyRepo };
  }

  it('published 서브도메인의 익명 요청을 허용한다 (C-2)', async () => {
    const { res } = await invokeProxy({
      request: siteReq('weather.xzawed.xyz'),
      user: null,
      projectBySlug: PROJECT,
    });
    expect(res.status).toBe(200);
  });

  it('미게시 프로젝트의 서브도메인 요청은 404 (존재 여부 미노출)', async () => {
    const { res } = await invokeProxy({
      request: siteReq('weather.xzawed.xyz'),
      user: null,
      projectBySlug: { ...PROJECT, status: 'draft' },
    });
    expect(res.status).toBe(404);
  });

  it('세션 사용자가 타인 projectId로 개인 키를 쓰려 하면 403 (H-1)', async () => {
    const { res } = await invokeProxy({
      request: siteReq('xzawed.xyz', '&projectId=proj-1'),
      user: ATTACKER,
      projectById: { ...PROJECT, userId: 'victim' },
    });
    expect(res.status).toBe(403);
  });

  it('타인 projectId 요청에서는 개인 키 조회 자체가 일어나지 않는다 (H-1)', async () => {
    const { userApiKeyRepo } = await invokeProxy({
      request: siteReq('xzawed.xyz', '&projectId=proj-1'),
      user: ATTACKER,
      projectById: { ...PROJECT, userId: 'victim' },
    });
    expect(userApiKeyRepo.findByUserAndApi).not.toHaveBeenCalled();
  });

  it('프로젝트에 연결되지 않은 apiId는 403', async () => {
    const { res } = await invokeProxy({
      request: siteReq('weather.xzawed.xyz'),
      user: null,
      projectBySlug: PROJECT,
      linkedApiIds: [],
    });
    expect(res.status).toBe(403);
  });

  it('site 모드 레이트리밋 초과 시 429 + Retry-After', async () => {
    const { res } = await invokeProxy({
      request: siteReq('weather.xzawed.xyz'),
      user: null,
      projectBySlug: PROJECT,
      times: 25, // 기본 한도 20/분 초과
    });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm vitest run src/__tests__/api/proxy.test.ts`
Expected: FAIL — 익명 요청이 401, 타인 projectId가 200

- [ ] **Step 3: `validateRequest`에서 인증 판단 제거**

`src/app/api/v1/proxy/route.ts`의 `validateRequest`는 파라미터 형식 검증만 남긴다. 인증·레이트리밋은 컨텍스트 판정 이후로 옮긴다.

```ts
interface ValidatedRequest {
  apiId: string;
  proxyPath: string;
  searchParams: URLSearchParams;
}

/** 파라미터 형식만 검증한다. 인증·인가는 resolveProxyContext가 담당한다. */
function validateParams(request: Request): ValidatedRequest | Response {
  const { searchParams } = new URL(request.url);
  const apiId = searchParams.get('apiId');
  const proxyPath = searchParams.get('proxyPath');

  if (!apiId || !proxyPath) return error400('apiId와 proxyPath가 필요합니다.');
  if (!UUID_RE.test(apiId)) return error400('유효하지 않은 API ID입니다.');
  if (proxyPath.includes('..') || /\/\//.test(proxyPath)) return error400('유효하지 않은 경로입니다.');

  return { apiId, proxyPath, searchParams };
}
```

- [ ] **Step 4: `handleProxy`에 컨텍스트 판정과 모드별 레이트리밋 배선**

`handleProxy` 시작부를 아래로 교체한다.

```ts
async function handleProxy(request: Request, method: 'GET' | 'POST'): Promise<Response> {
  const validated = validateParams(request);
  if (validated instanceof Response) return validated;
  const { apiId, proxyPath, searchParams } = validated;

  const ctx = await resolveProxyContext(request, apiId, {
    getAuthUser,
    findProjectBySlug: (slug) => createProjectRepository().findBySlug(slug),
    findProjectById: (id) => createProjectRepository().findById(id),
    getProjectApiIds: (id) => createProjectRepository().getProjectApiIds(id),
    rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
  });

  if ('error' in ctx) {
    return errorResponse(ctx.error.status, ctx.error.code, ctx.error.message);
  }

  // 모드별 레이트리밋 — 익명 site는 IP+projectId, 세션 app은 기존 userId 버킷.
  if (ctx.mode === 'site') {
    const limit = checkSiteRateLimit(getClientIp(request), ctx.project.id);
    if (!limit.allowed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: 'RATE_LIMITED', message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(limit.retryAfterSec),
          },
        },
      );
    }
  } else if (!checkProxyRateLimit(ctx.user.id)) {
    return errorResponse(429, 'RATE_LIMITED', '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
  }

  // 이하 카탈로그 조회·URL 조립은 기존과 동일
  const catalogRepo = createCatalogRepository();
  // ...
```

임포트를 추가한다.

```ts
import { resolveProxyContext } from '@/lib/proxy/resolveProxyContext';
import { checkSiteRateLimit } from '@/lib/proxy/siteRateLimit';
import { getClientIp } from '@/lib/auth/rateLimit';
```

- [ ] **Step 5: `resolveApiKey`가 컨텍스트를 받도록 변경 (H-1 수정 지점)**

`resolveApiKey`는 더 이상 `searchParams`에서 `projectId`를 읽지 않는다. 대신 **키를 쓸 사용자**를 컨텍스트에서 받는다.

```ts
/**
 * 키 소유자 결정:
 *  - site 모드: 게시 프로젝트의 오너 (Host로 확정된 프로젝트이므로 정당)
 *  - app 모드 + 자기 프로젝트: 그 프로젝트의 오너 == 호출자
 *  - app 모드 + 프로젝트 없음: 개인 키 없음(플랫폼 키만)
 *
 * 이전에는 클라이언트가 보낸 projectId로 아무 사용자의 키나 복호화할 수 있었다(H-1).
 * 소유권은 resolveProxyContext가 이미 강제했으므로 여기서는 결정된 소유자만 쓴다.
 */
function keyOwnerIdOf(ctx: ProxyContext): string | null {
  return ctx.project?.userId ?? null;
}
```

`resolveApiKey`의 시그니처에서 `searchParams` 대신 `keyOwnerId: string | null`을 받고, 1) 블록을 아래로 교체한다.

```ts
  // 1) 키 소유자의 개인 API 키 조회 (소유권은 resolveProxyContext에서 이미 검증됨)
  if (keyOwnerId) {
    try {
      const userKey = await createUserApiKeyRepository().findByUserAndApi(keyOwnerId, apiId);
      if (userKey?.encryptedKey) {
        try { resolvedKey = decryptApiKey(userKey.encryptedKey); } catch { /* skip */ }
      }
    } catch { /* 조회 실패 시 플랫폼 키로 폴백 */ }
  }
```

호출부도 함께 수정한다: `resolveApiKey(apiId, cfg, keyOwnerIdOf(ctx), headers, targetUrl)`.

- [ ] **Step 5b: 개인 키가 주입된 응답은 캐시하지 않는다 (M-4 가드레일)**

`buildCacheKey`는 `apiId:proxyPath:params`뿐이라 **키 신원이 들어가지 않는다**. 지금까지는
캐시 대상이 공개 키리스 API뿐이라 잠복 상태였지만, 이번 변경으로 **익명 호출자가 오너의 개인
키로 업스트림을 호출**하게 되므로 같은 캐시 항목이 테넌트를 넘나들 위험이 실제화된다.
내가 만든 위험이므로 여기서 최소한으로 닫는다.

`resolveApiKey`가 개인 키를 주입했는지 호출부에 알리도록 반환값을 바꾼다.

```ts
// resolveApiKey 시그니처: Promise<void> → Promise<{ usedPersonalKey: boolean }>
// 개인 키 분기에서 복호화에 성공하면 usedPersonalKey = true
```

호출부에서 캐시 저장·조회를 건너뛴다.

```ts
  // 개인 키로 받은 응답은 테넌트 간 공유가 불가하다. 캐시 키에 키 신원이 없으므로
  // 캐시 자체를 건너뛴다(가장 단순하고 안전한 선택).
  const cacheable = cacheTtlMs !== null && !usedPersonalKey;
```

`cacheTtlMs !== null` 조건을 쓰는 곳(조회 305-320행, 저장 353-355행, 응답 헤더 362-364행)을
모두 `cacheable`로 바꾼다. 개인 키 경로는 `Cache-Control: no-store`가 되어야 한다.

테스트를 추가한다.

```ts
  it('개인 키가 주입된 응답은 캐시하지 않는다 (M-4 가드레일)', async () => {
    const { res } = await invokeProxy({
      request: siteReq('weather.xzawed.xyz'),
      user: null,
      projectBySlug: PROJECT,
      // 오너의 개인 키가 존재하는 상황을 만든다
      personalKey: 'secret-key',
    });
    expect(res.headers.get('X-Cache')).toBeNull();
    expect(res.headers.get('Cache-Control')).toContain('no-store');
  });
```

`invokeProxy`에 `personalKey?: string` 옵션을 추가해 `userApiKeyRepo.findByUserAndApi`가
`{ encryptedKey: 'enc' }`를 반환하게 하고, `decryptApiKey` mock이 그 값을 돌려주게 한다.

- [ ] **Step 5c: 재생성 프롬프트에 projectId 추가**

[`promptBuilder.ts:947`](../../../src/lib/ai/promptBuilder.ts)의
`buildStage1RegenerationUserPrompt`가 만드는 프록시 URL에는 `projectId`가 없다(확인됨).
서브도메인은 Host 모드로 덮이지만 apex 직접 게시 경로와 개인 키 해석이 이 파라미터에 의존한다.

함수 시그니처에 `projectId?: string`을 추가하고 최초 생성 경로(830행)와 동일하게 만든다.

```ts
  const projectParam = projectId ? `&projectId=${projectId}` : '';
  const callMethod = `서버 프록시 (인증 방식 무관): /api/v1/proxy?apiId=${api.id}${projectParam}&proxyPath=<경로>`;
```

호출부(재생성 라우트)에서 `project.id`를 넘긴다. 기존 호출부가 인자를 넘기지 않아도
`projectId?`가 선택적이라 타입은 깨지지 않지만, **넘기지 않으면 이 수정이 무의미하므로
호출부 수정까지 반드시 포함한다.**

Run: `grep -rn "buildStage1RegenerationUserPrompt" src --include=*.ts` 로 호출부를 찾는다.

- [ ] **Step 6: 테스트 통과 확인**

Run: `pnpm vitest run src/__tests__/api/proxy.test.ts`
Expected: PASS (기존 + 신규 7건)

- [ ] **Step 7: 전체 검증**

Run: `pnpm lint && pnpm type-check && pnpm test`
Expected: 전부 통과. 기존 프록시 테스트가 `getAuthUser` mock에 의존하므로 실패하면 site/app 모드 세팅을 보강한다.

- [ ] **Step 8: 커밋**

```bash
git add src/app/api/v1/proxy/route.ts src/__tests__/api/proxy.test.ts
git commit -m "fix: 익명 게시 사이트 프록시 허용 및 소유권 강제 (C-2·H-1)

C-2: 프록시가 항상 세션을 요구해 게시 사이트의 익명 방문자가 401이었다.
resolveProxyContext로 site/app 모드를 판정해 published 사이트의 익명
요청을 허용한다.

H-1: resolveApiKey가 클라이언트가 보낸 projectId로 그 프로젝트 오너의
개인 API 키를 복호화하면서 호출자 소유 여부를 확인하지 않았다. 로그인한
아무나 남의 키 할당량을 소진시킬 수 있었다. 키 소유자를 컨텍스트에서만
받도록 바꿔 소유권 검증을 우회할 경로를 없앴다.

site 모드는 IP+projectId 리밋, app 모드는 기존 userId 리밋을 적용한다."
```

---

### Task 6: 문서 동기화 및 최종 검증

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/reference/env-vars.md`
- Create: `docs/decisions/2026-07-28-published-site-proxy-authz.md`

**Interfaces:**
- Consumes: Task 1~5 전체
- Produces: 없음

- [ ] **Step 1: ADR 작성**

`docs/decisions/2026-07-28-published-site-proxy-authz.md`를 아래 구성으로 작성한다.

```markdown
# 게시 사이트 프록시 복구 및 인가 모델 정비 (2026-07-28)

## 상태
승인됨 — 구현 완료

## 배경
- 검수 경위: Claude 독립 검증 + Grok 독립 감사 + 상호 반박 라운드로 13건 확정, 그중 C·H 4건이 본 범위
- C-1 프로덕션 실측 근거 (apex 401 vs 서브도메인 404) — 실제 curl 출력 그대로 인용
- 왜 지금까지 드러나지 않았는가: 미리보기는 apex라 정상 동작, 게시 사이트가 아직 없었음

## 결정
1. 미들웨어 `SUBDOMAIN_PASSTHROUGH_PREFIXES` — 프록시 경로만 리라이트 예외 (최소 노출 근거 포함)
2. `resolveProxyContext()` 단일 진입점 — site/app 이중 모드 판정표
3. Host 우선 원칙 — 클라이언트 `projectId`는 Host가 있으면 무시
4. `apiId ∈ project_apis` 양 모드 공통 강제
5. 토큰 원자적 소비 — 2단계를 단일 UPDATE ... RETURNING으로

## 트레이드오프 (명시)
published `projectId`를 아는 사람은 누구나 그 오너의 키로 업스트림 호출을 트리거할 수 있다.
게시 사이트 자체가 공개이므로 노출 수준은 동일하나, 레이트리밋이 유일한 방어선이 된다.
한도(20/분 IP+project, 120/분 project)와 조정 방법(환경변수)을 기재한다.

## 검증
Task 1~6의 실제 실행 결과 표 — lint · type-check · 테스트 수 · build · standalone 헬스체크 ·
배포 후 curl 3종 결과

## 범위 밖
M-1~M-8 및 `AUTH_URL` 미설정 건 목록
```

- [ ] **Step 2: CLAUDE.md 갱신**

"문서 참조" 테이블에 ADR 행을 추가하고, "배포 품질 원칙 → 서빙 파이프라인 변경 시" 항목에 아래를 추가한다.

```markdown
- **서브도메인 리라이트 예외**: `src/middleware.ts`의 `SUBDOMAIN_PASSTHROUGH_PREFIXES`에 있는 경로만 `/site/{slug}` 리라이트를 건너뛴다. 게시 사이트의 생성 JS가 상대경로 `/api/v1/proxy`로 호출하므로 이 예외가 없으면 API 데이터가 전부 404가 된다. 새 경로를 추가할 땐 최소 노출 원칙을 지킬 것
- **프록시 인가는 `resolveProxyContext()` 단일 진입점**: site(익명·Host 바인딩)/app(세션·소유권 강제) 판정이 여기 한 곳에 있다. 라우트에 인가 분기를 새로 만들지 말 것 — 판단이 흩어져 개인 키 해석부가 소유권을 확인하지 않던 것이 H-1이었다
```

- [ ] **Step 2b: 신규 환경변수 문서화**

`docs/reference/env-vars.md`에 3개를 추가한다(프로젝트 문서 규칙: 환경변수는 이 파일이 단일 출처).

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `SITE_PROXY_RATE_LIMIT_PER_MIN` | 20 | 익명 게시 사이트 프록시 — IP+projectId 단위 분당 한도 |
| `SITE_PROXY_PROJECT_LIMIT_PER_MIN` | 120 | 익명 게시 사이트 프록시 — 프로젝트 전역 분당 한도(분산 IP 상한) |
| `MAX_SITE_RATE_LIMIT_BUCKETS` | 5000 | site 리미터가 동시에 추적하는 최대 버킷 수 |

CLAUDE.md "환경변수" 절에도 한 줄씩 추가한다.

- [ ] **Step 3: 전체 파이프라인 검증**

```bash
pnpm lint && pnpm type-check && pnpm test && pnpm build
```
Expected: 전부 통과

- [ ] **Step 4: standalone 부팅 확인**

미들웨어를 수정했으므로 CLAUDE.md 규칙에 따라 standalone 서버 기동을 확인한다.

Run: `pnpm test:prod`
Expected: `healthcheck: 200`

- [ ] **Step 5: 커밋 및 PR**

```bash
git add CLAUDE.md docs/decisions/2026-07-28-published-site-proxy-authz.md
git commit -m "docs: 게시 사이트 프록시 복구·인가 모델 ADR 및 CLAUDE.md 규칙 추가"
git push -u origin fix/published-site-proxy-authz
```

PR 본문에는 프로덕션 실측 근거(apex 401 vs 서브도메인 404), 4건의 수정 내용, 명시적 트레이드오프, 검증 결과표를 포함한다.

---

## 배포 후 확인 (머지 이후)

게시 사이트가 실제로 복구됐는지는 **게시된 프로젝트가 있어야** 확인 가능하다. 현재 게시된
사이트가 없으므로, 배포 후 테스트 프로젝트를 하나 게시해 아래를 확인한다.

```bash
# 1) 서브도메인 프록시가 404가 아닌지 (라우트 도달)
curl -s -o /dev/null -w "%{http_code}\n" "https://<slug>.xzawed.xyz/api/v1/proxy?apiId=<연결된 apiId>&proxyPath=/<경로>"
#    기대: 200 (익명 허용) — 404면 미들웨어 패스스루 미적용

# 2) 연결되지 않은 apiId는 차단되는지
curl -s -o /dev/null -w "%{http_code}\n" "https://<slug>.xzawed.xyz/api/v1/proxy?apiId=<무관한 apiId>&proxyPath=/x"
#    기대: 403

# 3) 서브도메인의 다른 API 경로는 여전히 닫혀 있는지
curl -s -o /dev/null -w "%{http_code}\n" "https://<slug>.xzawed.xyz/api/v1/projects"
#    기대: 404 (리라이트되어 site 라우트로 감)
```

## 범위 밖 (다음 라운드)

M-1 Quality Loop AbortSignal · M-2 stale `validation` 저장 · M-3 레이트리밋 fail-open 환불 ·
M-4 프록시 캐시 키 owner 신원 누락 · M-5 `generationTracker` LRU/TTL 락 소실 ·
M-6 기존 프록시 리미터 eviction 리셋 · M-7 IPv4-mapped IPv6 SSRF · M-8 `x-real-ip` 신뢰 ·
`AUTH_URL` 미설정으로 인한 `callback-url=https://0.0.0.0:8080`
