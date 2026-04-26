# Quality Improvements — Repository Utils, Security Tests, ET Scoring

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Reduce code duplication across 20 repository files via shared utilities, improve security test coverage, and replace binary shouldUseExtendedThinking with nuanced scoring.

**Architecture:** Three independent work streams — (A) repository utility extraction into `src/repositories/utils/`, (B) security test additions + implementation fixes, (C) ET scoring improvement in `generationPipeline.ts`.

**Tech Stack:** TypeScript strict, Vitest 4.x, Next.js 16+ App Router, Drizzle ORM + Supabase dual provider

---

## Work Stream A — Repository Utils Extraction

### Task A1: pagination.ts utility

**Files:**
- Create: `src/repositories/utils/pagination.ts`
- Modify: `src/repositories/utils/index.ts`
- Modify: `src/repositories/drizzle/DrizzleCatalogRepository.ts` (line 28-29)
- Modify: `src/repositories/drizzle/DrizzleProjectRepository.ts` (line 28-29)
- Modify: `src/repositories/drizzle/DrizzleCodeRepository.ts`
- Modify: `src/repositories/drizzle/DrizzleUserRepository.ts`
- Modify: `src/repositories/base/BaseRepository.ts` (line 32-33)
- Test: `src/repositories/utils/__tests__/pagination.test.ts`

- [ ] Write failing test for normalizePagination

```typescript
// src/repositories/utils/__tests__/pagination.test.ts
import { describe, it, expect } from 'vitest';
import { normalizePagination } from '../pagination';

describe('normalizePagination()', () => {
  it('기본값 page=1, limit=20', () => {
    const { offset, limit } = normalizePagination({});
    expect(offset).toBe(0);
    expect(limit).toBe(20);
  });

  it('page=2, limit=10 → offset=10', () => {
    const { offset, limit } = normalizePagination({ page: 2, limit: 10 });
    expect(offset).toBe(10);
    expect(limit).toBe(10);
  });

  it('page=3, limit=20 → offset=40', () => {
    const { offset } = normalizePagination({ page: 3, limit: 20 });
    expect(offset).toBe(40);
  });

  it('page=1은 offset=0', () => {
    const { offset } = normalizePagination({ page: 1, limit: 5 });
    expect(offset).toBe(0);
  });
});
```

- [ ] Run test to verify it fails: `pnpm test src/repositories/utils/__tests__/pagination.test.ts`

- [ ] Implement pagination.ts

```typescript
// src/repositories/utils/pagination.ts
export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface NormalizedPagination {
  offset: number;
  limit: number;
}

export function normalizePagination(options: PaginationOptions): NormalizedPagination {
  const page = options.page ?? 1;
  const limit = options.limit ?? 20;
  return { offset: (page - 1) * limit, limit };
}
```

- [ ] Run test to verify it passes
- [ ] Update `src/repositories/utils/index.ts` to export it:
  ```typescript
  export { normalizePagination } from './pagination';
  ```
- [ ] Refactor `DrizzleCatalogRepository.ts` findMany/search to use `normalizePagination`:
  Change:
  ```typescript
  const { page = 1, limit = 20, ... } = options;
  const offset = (page - 1) * limit;
  ```
  To:
  ```typescript
  const { orderDirection = 'desc' } = options;
  const { offset, limit } = normalizePagination(options);
  ```
- [ ] Do same refactor in DrizzleProjectRepository.ts, DrizzleCodeRepository.ts, DrizzleUserRepository.ts
- [ ] Do same refactor in BaseRepository.ts findMany
- [ ] Run: `pnpm test && pnpm type-check`
- [ ] Commit: `refactor(repositories): normalizePagination 유틸리티 추출`

---

### Task A2: supabaseErrors.ts utility

**Files:**
- Create: `src/repositories/utils/supabaseErrors.ts`
- Modify: `src/repositories/utils/index.ts`
- Modify: `src/repositories/base/BaseRepository.ts` (line 22)
- Test: `src/repositories/utils/__tests__/supabaseErrors.test.ts`

- [ ] Write failing test

```typescript
// src/repositories/utils/__tests__/supabaseErrors.test.ts
import { describe, it, expect } from 'vitest';
import { isNotFound } from '../supabaseErrors';

describe('isNotFound()', () => {
  it('PGRST116 에러 → true', () => {
    expect(isNotFound({ code: 'PGRST116', message: 'JSON object requested...' })).toBe(true);
  });

  it('다른 에러 코드 → false', () => {
    expect(isNotFound({ code: '23505', message: 'duplicate key' })).toBe(false);
  });

  it('코드 없는 에러 → false', () => {
    expect(isNotFound({ message: 'some error' })).toBe(false);
  });

  it('null → false', () => {
    expect(isNotFound(null)).toBe(false);
  });
});
```

- [ ] Run test to verify it fails
- [ ] Implement supabaseErrors.ts

```typescript
// src/repositories/utils/supabaseErrors.ts
export function isNotFound(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code: string }).code === 'PGRST116'
  );
}
```

- [ ] Run test to verify it passes
- [ ] Update `src/repositories/utils/index.ts` to export it
- [ ] Update `BaseRepository.ts` findById:
  Change `if (error.code === 'PGRST116') return null;`
  To `if (isNotFound(error)) return null;`
  Add import: `import { toSnake, isNotFound } from '@/repositories/utils';`
- [ ] Run: `pnpm test && pnpm type-check`
- [ ] Commit: `refactor(repositories): isNotFound(PGRST116) 유틸리티 추출`

---

### Task A3: rowMapper.ts utility

**Files:**
- Create: `src/repositories/utils/rowMapper.ts`
- Modify: `src/repositories/utils/index.ts`
- Modify: `src/repositories/drizzle/DrizzleCatalogRepository.ts` (private toDatabase method)
- Modify: `src/repositories/drizzle/DrizzleProjectRepository.ts`
- Modify: `src/repositories/drizzle/DrizzleCodeRepository.ts`
- Modify: `src/repositories/drizzle/DrizzleUserRepository.ts`
- Modify: `src/repositories/base/BaseRepository.ts` (protected toDatabase method)
- Test: `src/repositories/utils/__tests__/rowMapper.test.ts`

- [ ] Write failing tests

```typescript
// src/repositories/utils/__tests__/rowMapper.test.ts
import { describe, it, expect } from 'vitest';
import { toDatabaseRow } from '../rowMapper';

describe('toDatabaseRow()', () => {
  it('camelCase 키를 snake_case로 변환', () => {
    const result = toDatabaseRow({ userId: '1', createdAt: new Date() });
    expect(result).toHaveProperty('user_id', '1');
    expect(result).not.toHaveProperty('userId');
  });

  it('id, createdAt, updatedAt 키는 제외', () => {
    const result = toDatabaseRow({ id: '1', createdAt: new Date(), updatedAt: new Date(), name: 'test' });
    expect(result).not.toHaveProperty('id');
    expect(result).not.toHaveProperty('created_at');
    expect(result).not.toHaveProperty('updated_at');
    expect(result).toHaveProperty('name', 'test');
  });

  it('undefined 값도 포함 (명시적 undefined 전달)', () => {
    const result = toDatabaseRow({ name: undefined });
    expect(result).toHaveProperty('name', undefined);
  });
});
```

- [ ] Run test to verify it fails
- [ ] Implement rowMapper.ts

```typescript
// src/repositories/utils/rowMapper.ts
import { toSnake } from './caseConverter';

export function toDatabaseRow(model: Partial<Record<string, unknown>>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(model)) {
    if (key === 'id' || key === 'createdAt' || key === 'updatedAt') continue;
    result[toSnake(key)] = value;
  }
  return result;
}
```

- [ ] Run test to verify it passes
- [ ] Update `src/repositories/utils/index.ts` to export `toDatabaseRow`
- [ ] Update `BaseRepository.ts` `toDatabase()` to call `toDatabaseRow`:
  ```typescript
  import { toSnake as toSnakeUtil, toDatabaseRow } from '@/repositories/utils';
  // ...
  protected toDatabase(model: Partial<T>): Record<string, unknown> {
    return toDatabaseRow(model as Partial<Record<string, unknown>>);
  }
  ```
- [ ] Remove private `toDatabase()` from each Drizzle repo and call `toDatabaseRow` directly (already imported via `@/repositories/utils`)
- [ ] Run: `pnpm test && pnpm type-check`
- [ ] Commit: `refactor(repositories): toDatabaseRow 공통 유틸리티 추출 — Drizzle repo 중복 제거`

---

## Work Stream B — Security Tests

### Task B1: sanitizeCss — bypass vector tests + implementation fix

**Files:**
- Modify: `src/__tests__/lib/sanitizeCss.test.ts`
- Modify: `src/lib/ai/codeParser.ts` (sanitizeCss function)

- [ ] Add failing tests for unhandled bypass vectors

```typescript
// Append to describe block in sanitizeCss.test.ts

  describe('추가 XSS 벡터 차단', () => {
    it('-webkit-binding: → 차단 (Firefox -moz-binding과 동일 패턴)', () => {
      const result = sanitizeCss('-webkit-binding: url("http://evil.com/xss.xml")');
      expect(result).not.toContain('-webkit-binding:');
    });

    it('url(data:text/html,...) → 차단', () => {
      const result = sanitizeCss('background: url(data:text/html,<script>alert(1)</script>)');
      expect(result).not.toContain('data:text/html');
    });

    it('url(data:application/x-...) → 차단', () => {
      const result = sanitizeCss('content: url(data:application/x-shockwave-flash,...)');
      expect(result).not.toContain('data:application/x-');
    });

    it('@import 차단', () => {
      const result = sanitizeCss('@import url("http://evil.com/steal.css");');
      expect(result).not.toContain('@import');
    });

    it('대소문자 혼합 @IMPORT → 차단', () => {
      const result = sanitizeCss('@IMPORT "http://evil.com/steal.css";');
      expect(result).not.toContain('@IMPORT');
    });
  });
```

- [ ] Run tests to verify they fail
- [ ] Fix `sanitizeCss` in `src/lib/ai/codeParser.ts`:

```typescript
export function sanitizeCss(css: string): string {
  return css
    .replace(/expression\s*\(/gi, '/* removed */(')
    .replace(/url\s*\(\s*(['"]?\s*)javascript:/gi, 'url($1#')
    .replace(/url\s*\(\s*(['"]?\s*)data:/gi, 'url($1#')
    .replace(/behavior\s*:/gi, '/* removed */:')
    .replace(/-moz-binding\s*:/gi, '/* removed */:')
    .replace(/-webkit-binding\s*:/gi, '/* removed */:')
    .replace(/@import\b/gi, '/* removed */');
}
```

- [ ] Run tests to verify they pass
- [ ] Run: `pnpm test && pnpm type-check`
- [ ] Commit: `fix(security): sanitizeCss — -webkit-binding, data: URI, @import 차단 추가`

---

### Task B2: Proxy — DNS rebinding + POST forwarding tests

**Files:**
- Modify: `src/__tests__/api/proxy.test.ts`

- [ ] Add DNS rebinding tests (DNS resolves to private IP):

```typescript
// Add to describe('SSRF 방지 — private IP 차단') in proxy.test.ts

    it('DNS 리바인딩 — 해석된 IP가 RFC 1918 10.x.x.x → 403', async () => {
      const { lookup } = (await import('dns/promises')).default;
      vi.mocked(lookup).mockResolvedValueOnce({ address: '10.0.0.1', family: 4 });

      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);

      const { createCatalogRepository } = await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue({ ...mockPublicApi, baseUrl: 'https://legit-api.example.com' }),
      } as never);

      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(makeRequest(VALID_API_ID, '/data'));
      expect(res.status).toBe(403);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('DNS 리바인딩 — IPv6 링크-로컬 ::1 → 403', async () => {
      const { lookup } = (await import('dns/promises')).default;
      vi.mocked(lookup).mockResolvedValueOnce({ address: '::1', family: 6 });

      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);

      const { createCatalogRepository } = await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue({ ...mockPublicApi, baseUrl: 'https://legit-api.example.com' }),
      } as never);

      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(makeRequest(VALID_API_ID, '/data'));
      expect(res.status).toBe(403);
    });

    it('DNS lookup 실패 → 403 (안전 실패)', async () => {
      const { lookup } = (await import('dns/promises')).default;
      vi.mocked(lookup).mockRejectedValueOnce(new Error('ENOTFOUND'));

      const { getAuthUser } = await import('@/lib/auth/index');
      vi.mocked(getAuthUser).mockResolvedValue(mockUser);

      const { createCatalogRepository } = await import('@/repositories/factory');
      vi.mocked(createCatalogRepository).mockReturnValue({
        findById: vi.fn().mockResolvedValue({ ...mockPublicApi, baseUrl: 'https://legit-api.example.com' }),
      } as never);

      const { GET } = await import('@/app/api/v1/proxy/route');
      const res = await GET(makeRequest(VALID_API_ID, '/data'));
      expect(res.status).toBe(403);
    });
```

- [ ] Add POST forwarding test:

```typescript
// Add to describe('GET /api/v1/proxy') in proxy.test.ts

  it('POST 요청 — body 전달 확인', async () => {
    const { getAuthUser } = await import('@/lib/auth/index');
    vi.mocked(getAuthUser).mockResolvedValue(mockUser);

    const { createCatalogRepository } = await import('@/repositories/factory');
    vi.mocked(createCatalogRepository).mockReturnValue({
      findById: vi.fn().mockResolvedValue(mockPublicApi),
    } as never);

    const postBody = JSON.stringify({ q: 'test' });
    const url = new URL('http://localhost/api/v1/proxy');
    url.searchParams.set('apiId', VALID_API_ID);
    url.searchParams.set('proxyPath', '/search');
    const req = new Request(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: postBody,
    });

    const { POST } = await import('@/app/api/v1/proxy/route');
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('api.example.com'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
```

- [ ] Run tests: `pnpm test src/__tests__/api/proxy.test.ts`
- [ ] Commit: `test(security): proxy — DNS 리바인딩·POST 전달 테스트 추가`

---

### Task B3: ClaudeProvider — retry/backoff tests

**Files:**
- Modify: `src/providers/ai/ClaudeProvider.test.ts`

- [ ] Add retry tests (read current test file first to find the right location):

```typescript
// src/providers/ai/ClaudeProvider.test.ts — add to describe block

  describe('withRetry 재시도 로직', () => {
    it('429 응답 → 재시도 후 성공', async () => {
      const rateLimitError = Object.assign(new Error('rate_limit'), { status: 429 });
      let callCount = 0;
      vi.mocked(Anthropic).mockImplementation(function() {
        return {
          messages: {
            create: vi.fn(async () => {
              callCount++;
              if (callCount === 1) throw rateLimitError;
              return mockSuccessResponse;
            }),
          },
          beta: { messages: { create: vi.fn() } },
        };
      } as never);

      const provider = new ClaudeProvider('test-key');
      const result = await provider.generateCode(mockInput);
      expect(result).toBeDefined();
      expect(callCount).toBe(2);
    });

    it('500 응답 → 재시도 후 성공', async () => {
      const serverError = Object.assign(new Error('server_error'), { status: 500 });
      let callCount = 0;
      vi.mocked(Anthropic).mockImplementation(function() {
        return {
          messages: {
            create: vi.fn(async () => {
              callCount++;
              if (callCount < 2) throw serverError;
              return mockSuccessResponse;
            }),
          },
          beta: { messages: { create: vi.fn() } },
        };
      } as never);

      const provider = new ClaudeProvider('test-key');
      await provider.generateCode(mockInput);
      expect(callCount).toBe(2);
    });

    it('400 응답 → 재시도 없이 즉시 실패', async () => {
      const badRequestError = Object.assign(new Error('bad_request'), { status: 400 });
      let callCount = 0;
      vi.mocked(Anthropic).mockImplementation(function() {
        return {
          messages: {
            create: vi.fn(async () => {
              callCount++;
              throw badRequestError;
            }),
          },
          beta: { messages: { create: vi.fn() } },
        };
      } as never);

      const provider = new ClaudeProvider('test-key');
      await expect(provider.generateCode(mockInput)).rejects.toThrow();
      expect(callCount).toBe(1);
    });

    it('MAX_RETRIES 초과 → 최종 에러 throw', async () => {
      const serverError = Object.assign(new Error('server_error'), { status: 500 });
      let callCount = 0;
      vi.mocked(Anthropic).mockImplementation(function() {
        return {
          messages: {
            create: vi.fn(async () => {
              callCount++;
              throw serverError;
            }),
          },
          beta: { messages: { create: vi.fn() } },
        };
      } as never);

      const provider = new ClaudeProvider('test-key');
      await expect(provider.generateCode(mockInput)).rejects.toThrow();
      // MAX_RETRIES = 2 → 최대 3번 시도 (초기 1 + 재시도 2)
      expect(callCount).toBe(3);
    });
  });
```

- [ ] Run tests: `pnpm test src/providers/ai/ClaudeProvider.test.ts`
- [ ] Commit: `test(security): ClaudeProvider 재시도 로직 테스트 추가`

---

## Work Stream C — shouldUseExtendedThinking Scoring

### Task C1: 100-point scoring system

**Files:**
- Modify: `src/lib/ai/generationPipeline.ts`
- Create: `src/lib/ai/__tests__/generationPipeline.extendedThinking.test.ts`

- [ ] Write failing tests

```typescript
// src/lib/ai/__tests__/generationPipeline.extendedThinking.test.ts
import { describe, it, expect } from 'vitest';
import { shouldUseExtendedThinking } from '../generationPipeline';
import type { ApiCatalogItem } from '@/types/api';

function makeApi(overrides: Partial<ApiCatalogItem> = {}): ApiCatalogItem {
  return {
    id: 'test-id',
    name: 'Test API',
    description: 'A test API',
    category: 'test',
    baseUrl: 'https://api.example.com',
    authType: 'none',
    authConfig: {},
    rateLimit: null,
    isActive: true,
    iconUrl: null,
    docsUrl: null,
    endpoints: [],
    tags: [],
    apiVersion: null,
    deprecatedAt: null,
    successorId: null,
    corsSupported: true,
    requiresProxy: false,
    creditRequired: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('shouldUseExtendedThinking()', () => {
  it('단순 1개 API, 짧은 컨텍스트 → false', () => {
    expect(shouldUseExtendedThinking([makeApi()], '간단한 서비스')).toBe(false);
  });

  it('3개 이상 API → true (API 수 기여)', () => {
    const apis = [makeApi(), makeApi(), makeApi()];
    expect(shouldUseExtendedThinking(apis, '서비스')).toBe(true);
  });

  it('OAuth 인증 API → 점수 기여로 true', () => {
    const api = makeApi({ authType: 'oauth2' });
    expect(shouldUseExtendedThinking([api, makeApi(), makeApi()], 'OAuth 서비스')).toBe(true);
  });

  it('500자 이상 컨텍스트 → true', () => {
    const longContext = 'a'.repeat(500);
    expect(shouldUseExtendedThinking([makeApi()], longContext)).toBe(true);
  });

  it('1개 API, API key 인증, 짧은 컨텍스트 → false', () => {
    expect(shouldUseExtendedThinking([makeApi({ authType: 'api_key' })], '단순 서비스')).toBe(false);
  });
});
```

- [ ] Run tests to confirm existing tests pass and new tests fail (since signature changes)
- [ ] Update `shouldUseExtendedThinking` in `generationPipeline.ts`:

```typescript
const ET_THRESHOLD = Number(process.env.ET_COMPLEXITY_THRESHOLD ?? 45);

function evaluateComplexityScore(apis: ApiCatalogItem[], context?: string): number {
  let score = 0;

  // API count signal (max 20pts)
  const extraApis = Math.max(0, apis.length - 2);
  score += Math.min(extraApis * 5, 20);

  // Auth complexity signal (max 15pts — highest auth wins)
  const maxAuth = apis.reduce((max, api) => {
    if (api.authType === 'oauth2' || api.authType === 'oauth') return Math.max(max, 15);
    if (api.authType === 'api_key') return Math.max(max, 8);
    return max;
  }, 0);
  score += maxAuth;

  // Endpoint diversity signal (max 18pts)
  const totalEndpoints = apis.reduce((sum, api) => sum + (api.endpoints?.length ?? 0), 0);
  if (totalEndpoints >= 4) score += 10;
  else if (totalEndpoints >= 2) score += 5;
  const hasMutations = apis.some((api) =>
    api.endpoints?.some((ep) => ep.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(ep.method.toUpperCase()))
  );
  if (hasMutations) score += 8;

  // Context quality signal (max 15pts)
  const ctxLen = context?.length ?? 0;
  if (ctxLen >= 500) score += 15;
  else if (ctxLen >= 100) score += 8;
  else if (ctxLen > 0) score += 10;

  // Dependency complexity signal (max 10pts)
  const categories = new Set(apis.map((api) => api.category));
  const sameCategoryMultiple = apis.length >= 2 && categories.size === 1;
  const hasPayment = apis.some((api) =>
    api.name.toLowerCase().includes('payment') || api.name.toLowerCase().includes('stripe') || api.name.toLowerCase().includes('결제')
  );
  if (sameCategoryMultiple || hasPayment) score += 10;

  return score;
}

function shouldUseExtendedThinking(apis: ApiCatalogItem[], context?: string): boolean {
  return evaluateComplexityScore(apis, context) >= ET_THRESHOLD;
}
```

- [ ] Run tests: `pnpm test src/lib/ai/__tests__/generationPipeline.extendedThinking.test.ts`
- [ ] Export `evaluateComplexityScore` for testability if needed (add to function signature as named export or keep private)
- [ ] Run: `pnpm test && pnpm type-check`
- [ ] Commit: `feat(ai): shouldUseExtendedThinking — 이진 조건을 100점 복잡도 스코어링으로 교체`

---

## Final Validation

- [ ] Run full test suite: `pnpm test`
- [ ] Run type check: `pnpm type-check`
- [ ] Run lint: `pnpm lint`
- [ ] Verify coverage thresholds pass: `pnpm test:coverage`
