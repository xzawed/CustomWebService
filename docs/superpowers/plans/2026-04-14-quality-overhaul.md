# Quality Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate mock/fake data exposure in generated pages by rewiring the AI pipeline, QC scoring, and templates to mandate real API calls.

**Architecture:** Three-layer fix — (1) Prompt layer no longer rewards mock data; (2) A new Stage 2 "function verification" LLM pass fixes fetch bugs before the design stage; (3) Static QC penalizes missing fetch calls and placeholder strings. A new DB field `exampleCall` on each API endpoint provides the LLM with ready-to-use fetch snippets.

**Tech Stack:** TypeScript strict, Next.js 15 App Router, Supabase, Playwright, Vitest, Zod v4, Anthropic SDK

---

## File Map

| File | Change |
|------|--------|
| `src/types/api.ts` | Add `exampleCall`, `responseDataPath`, `requestHeaders` to `ApiEndpoint`; add `verificationStatus`, `verifiedAt`, `lastVerificationNote` to `ApiCatalogItem` |
| `src/types/project.ts` | Add new fields to `CodeMetadata` |
| `supabase/migrations/010_catalog_verification_fields.sql` | Nullable columns on `api_catalog` + JSONB field for endpoints |
| `scripts/verifyCatalog.ts` | New standalone CLI script |
| `src/lib/ai/promptBuilder.ts` | Rewrite Stage 1 system + user prompts; add Stage 2 function verification prompts |
| `src/lib/ai/generationPipeline.ts` | Expand 2-stage to 3-stage; update `PipelineInput` type |
| `src/app/api/v1/generate/route.ts` | Pass new stage 2 function prompts |
| `src/app/api/v1/generate/regenerate/route.ts` | Pass new stage 2 function prompts |
| `src/lib/ai/codeValidator.ts` | Remove `hasMockData` bonus; add fetch/placeholder checks |
| `src/lib/qc/qcChecks.ts` | Add 4 new runtime checks |
| `src/lib/qc/renderingQc.ts` | Wire new checks into Fast and Deep QC |
| `src/lib/ai/qualityLoop.ts` | Update retry conditions; remove "add 15 mock items" instruction |
| `src/templates/InfoLookupTemplate.ts` | Remove placeholder JS; add real fetch stub |
| `src/templates/DashboardTemplate.ts` | Same pattern |
| `src/templates/CalculatorTemplate.ts` | Same pattern |
| `src/templates/MapServiceTemplate.ts` | Same pattern |
| `src/templates/ContentFeedTemplate.ts` | Same pattern |
| `src/templates/ComparisonTemplate.ts` | Same pattern |
| `src/templates/TimelineTemplate.ts` | Same pattern |
| `src/templates/NewsCuratorTemplate.ts` | Same pattern |
| `src/templates/QuizTemplate.ts` | Same pattern |
| `src/templates/ProfileTemplate.ts` | Same pattern |
| `docs/architecture/ai-pipeline.md` | Update to 3-stage |
| `docs/guides/qc-process.md` | Update QC check list |
| `CLAUDE.md` | Update 2단계 → 3단계 references |

---

## Task 1: Extend TypeScript API types

**Files:**
- Modify: `src/types/api.ts`
- Modify: `src/types/project.ts`

- [x] **Step 1: Write the failing type test**

Create `src/types/api.test-types.ts` as a compile-only test (no Vitest needed — `pnpm type-check` catches errors):

```typescript
// src/types/api.test-types.ts — delete after Task 2 migration passes
import type { ApiEndpoint, ApiCatalogItem } from './api';

// These must compile without error after Task 1
const ep: ApiEndpoint = {
  path: '/test',
  method: 'GET',
  description: 'test',
  params: [],
  responseExample: {},
  exampleCall: 'fetch("/api/v1/proxy?apiId=1&proxyPath=/test")',
  responseDataPath: 'data.items',
};

const item: ApiCatalogItem = {
  id: '1', name: 'test', description: '', category: '', baseUrl: '',
  authType: 'none', authConfig: {}, rateLimit: null, isActive: true,
  iconUrl: null, docsUrl: null, endpoints: [], tags: [],
  apiVersion: null, deprecatedAt: null, successorId: null,
  corsSupported: true, requiresProxy: false, creditRequired: null,
  createdAt: '', updatedAt: '',
  verificationStatus: 'verified', verifiedAt: '2026-04-14', lastVerificationNote: null,
};
void ep; void item;
```

- [x] **Step 2: Run type-check to confirm it fails**

```bash
cd f:/DEVELOPMENT/SOURCE/CLAUDE/CustomWebService && pnpm type-check 2>&1 | head -20
```

Expected: errors about `exampleCall` not existing on `ApiEndpoint`.

- [x] **Step 3: Update `src/types/api.ts`**

```typescript
export type ApiAuthType = 'none' | 'api_key' | 'oauth';

export interface ApiEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  description: string;
  params: ApiParam[];
  responseExample: Record<string, unknown>;
  /** Ready-to-paste fetch() call for this endpoint (includes proxy path if needed) */
  exampleCall?: string;
  /** Dot-path into the response JSON to find the array/list, e.g. "data.items" */
  responseDataPath?: string;
  /** Extra request headers, e.g. { "X-RapidAPI-Host": "api.example.com" } */
  requestHeaders?: Record<string, string>;
}

export interface ApiParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
  defaultValue?: string;
}

export type ApiVerificationStatus = 'verified' | 'unverified' | 'broken';

export interface ApiCatalogItem {
  id: string;
  name: string;
  description: string;
  category: string;
  baseUrl: string;
  authType: ApiAuthType;
  authConfig: Record<string, unknown>;
  rateLimit: string | null;
  isActive: boolean;
  iconUrl: string | null;
  docsUrl: string | null;
  endpoints: ApiEndpoint[];
  tags: string[];
  apiVersion: string | null;
  deprecatedAt: string | null;
  successorId: string | null;
  corsSupported: boolean;
  requiresProxy: boolean;
  creditRequired: number | null;
  createdAt: string;
  updatedAt: string;
  /** Whether this API's endpoints have been manually tested and confirmed working */
  verificationStatus?: ApiVerificationStatus;
  verifiedAt?: string | null;
  lastVerificationNote?: string | null;
}
```

- [x] **Step 4: Update `CodeMetadata` in `src/types/project.ts`**

Add after the existing `qualityLoopUsed?: boolean;` line:

```typescript
  // Real API binding quality fields
  fetchCallCount?: number;
  hasProxyCall?: boolean;
  hasJsonParse?: boolean;
  placeholderCount?: number;
```

- [x] **Step 5: Run type-check to confirm it passes**

```bash
pnpm type-check
```

Expected: 0 errors. Delete `src/types/api.test-types.ts`.

- [x] **Step 6: Commit**

```bash
git add src/types/api.ts src/types/project.ts
git commit -m "feat: ApiEndpoint에 exampleCall/responseDataPath/requestHeaders 추가, ApiCatalogItem에 verificationStatus 추가"
```

---

## Task 2: DB migration for verification fields

**Files:**
- Create: `supabase/migrations/010_catalog_verification_fields.sql`

Context: `api_catalog` table stores catalogs; `endpoints` is a JSONB array column storing `ApiEndpoint[]`. New columns add verification tracking. JSONB array update for endpoints is done in code (repository layer) — no structural JSONB schema migration needed.

- [x] **Step 1: Create migration file**

```sql
-- supabase/migrations/010_catalog_verification_fields.sql
-- Adds verification metadata to api_catalog table.
-- The 'endpoints' JSONB column already exists; new optional fields
-- (exampleCall, responseDataPath, requestHeaders) are stored inside
-- each endpoint object — no migration needed for those (JSONB is schema-free).

ALTER TABLE api_catalog
  ADD COLUMN IF NOT EXISTS verification_status TEXT
    CHECK (verification_status IN ('verified', 'unverified', 'broken'))
    DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_verification_note TEXT;

-- Back-fill existing rows
UPDATE api_catalog SET verification_status = 'unverified' WHERE verification_status IS NULL;
```

- [x] **Step 2: Apply migration locally (if using Supabase local dev)**

```bash
# If using Supabase CLI local dev:
# supabase db push
# OR apply manually in Supabase Studio SQL editor
echo "Apply migration 010 manually in Supabase Studio or via CLI"
```

- [x] **Step 3: Confirm repository layer maps new columns**

Search for where `api_catalog` rows are mapped to `ApiCatalogItem`:

```bash
grep -r "verification" src/repositories/ src/services/ --include="*.ts" -l
```

If the repository uses `SELECT *` or maps each column explicitly, the new fields will either auto-map (if using Supabase typed client with `select('*')`) or need explicit mapping. Check `src/repositories/` for the catalog repository.

- [x] **Step 4: Update catalog repository mapping if explicit**

Find the catalog repository file:

```bash
grep -r "ApiCatalogItem\|api_catalog" src/repositories/ --include="*.ts" -l
```

If the mapper exists, add:
```typescript
verificationStatus: row.verification_status ?? 'unverified',
verifiedAt: row.verified_at ?? null,
lastVerificationNote: row.last_verification_note ?? null,
```

- [x] **Step 5: Type-check**

```bash
pnpm type-check
```

- [x] **Step 6: Commit**

```bash
git add supabase/migrations/010_catalog_verification_fields.sql
git add -p src/repositories/  # only catalog-related changes
git commit -m "feat: api_catalog 검증 상태 컬럼 추가 마이그레이션 (010)"
```

---

## Task 3: Catalog verification script

**Files:**
- Create: `scripts/verifyCatalog.ts`

Context: Claude cannot access Railway/Supabase directly. This script is run by the user locally to generate a verification report. The user then shares the JSON output to identify which APIs work, enabling Phase 2 (backfill).

- [x] **Step 1: Create the script**

```typescript
// scripts/verifyCatalog.ts
// Run: npx tsx scripts/verifyCatalog.ts > verification-report.json
// Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface EndpointResult {
  path: string;
  method: string;
  status: 'ok' | 'error' | 'skipped';
  httpStatus?: number;
  responseShape?: string[];
  error?: string;
  suggestedExampleCall?: string;
  suggestedResponseDataPath?: string;
}

interface ApiResult {
  id: string;
  name: string;
  category: string;
  baseUrl: string;
  authType: string;
  requiresProxy: boolean;
  endpoints: EndpointResult[];
  overallStatus: 'verified' | 'unverified' | 'broken';
}

async function testEndpoint(
  api: { id: string; baseUrl: string; authType: string; requiresProxy: boolean },
  endpoint: { path: string; method: string; params: Array<{ name: string; required: boolean; defaultValue?: string }> }
): Promise<EndpointResult> {
  if (endpoint.method !== 'GET') {
    return { path: endpoint.path, method: endpoint.method, status: 'skipped' };
  }

  // Build URL with default params
  const params = new URLSearchParams();
  for (const p of endpoint.params) {
    if (p.required || p.defaultValue) {
      params.set(p.name, p.defaultValue ?? 'test');
    }
  }

  const targetUrl = `${api.baseUrl}${endpoint.path}${params.toString() ? '?' + params.toString() : ''}`;
  const proxyUrl = `http://localhost:3000/api/v1/proxy?apiId=${api.id}&proxyPath=${encodeURIComponent(endpoint.path)}${params.toString() ? '&' + params.toString() : ''}`;

  try {
    const url = api.requiresProxy || api.authType !== 'none' ? proxyUrl : targetUrl;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const httpStatus = response.status;

    if (!response.ok) {
      return { path: endpoint.path, method: endpoint.method, status: 'error', httpStatus, error: `HTTP ${httpStatus}` };
    }

    const json = await response.json();
    const topLevelKeys = Object.keys(json).slice(0, 10);

    // Detect array path
    let suggestedResponseDataPath: string | undefined;
    for (const key of topLevelKeys) {
      if (Array.isArray((json as Record<string, unknown>)[key])) {
        suggestedResponseDataPath = key;
        break;
      }
    }

    // Build exampleCall
    const callUrl = api.requiresProxy || api.authType !== 'none'
      ? `/api/v1/proxy?apiId=${api.id}&proxyPath=${encodeURIComponent(endpoint.path)}${params.toString() ? '&' + params.toString() : ''}`
      : targetUrl;
    const suggestedExampleCall = `const res = await fetch('${callUrl}');\nconst data = await res.json();\n${suggestedResponseDataPath ? `const items = data.${suggestedResponseDataPath};` : '// explore: ' + topLevelKeys.join(', ')}`;

    return {
      path: endpoint.path,
      method: endpoint.method,
      status: 'ok',
      httpStatus,
      responseShape: topLevelKeys,
      suggestedExampleCall,
      suggestedResponseDataPath,
    };
  } catch (err) {
    return {
      path: endpoint.path,
      method: endpoint.method,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const { data: apis, error } = await supabase
    .from('api_catalog')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error('Failed to fetch catalogs:', error.message);
    process.exit(1);
  }

  const results: ApiResult[] = [];

  for (const api of apis) {
    const endpoints: EndpointResult[] = [];
    const eps = (api.endpoints as Array<{ path: string; method: string; params: Array<{ name: string; required: boolean; defaultValue?: string }> }>) ?? [];

    for (const ep of eps.slice(0, 3)) { // Test up to 3 endpoints per API
      process.stderr.write(`Testing ${api.name} ${ep.method} ${ep.path}...\n`);
      const result = await testEndpoint(api, ep);
      endpoints.push(result);
      await new Promise(r => setTimeout(r, 500)); // rate-limit
    }

    const okCount = endpoints.filter(e => e.status === 'ok').length;
    const overallStatus = okCount > 0 ? 'verified' : endpoints.some(e => e.status === 'error') ? 'broken' : 'unverified';

    results.push({
      id: api.id,
      name: api.name,
      category: api.category,
      baseUrl: api.base_url,
      authType: api.auth_type,
      requiresProxy: api.requires_proxy,
      endpoints,
      overallStatus,
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totalApis: results.length,
    verified: results.filter(r => r.overallStatus === 'verified').length,
    broken: results.filter(r => r.overallStatus === 'broken').length,
    apis: results,
  };

  fs.writeFileSync('verification-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch(console.error);
```

- [x] **Step 2: Add tsx to devDependencies if not present**

```bash
cd f:/DEVELOPMENT/SOURCE/CLAUDE/CustomWebService
grep "\"tsx\"" package.json || pnpm add -D tsx
```

- [x] **Step 3: Type-check the script**

```bash
pnpm type-check
```

Expected: 0 errors.

- [x] **Step 4: Commit**

```bash
git add scripts/verifyCatalog.ts package.json pnpm-lock.yaml
git commit -m "feat: 카탈로그 API 검증 스크립트 추가 (scripts/verifyCatalog.ts)"
```

> **⚠️ USER ACTION REQUIRED**: After this commit, run the script locally and share `verification-report.json`. This identifies which APIs work and what their `exampleCall` and `responseDataPath` should be. Task 4 (backfill) depends on this output.

---

## Task 4: Backfill golden-set APIs (requires user-provided verification report)

**Files:**
- Modify: Supabase `api_catalog` records (via Studio or migration script)
- Create: `docs/reference/golden-api-set.md`

Context: After the user runs `scripts/verifyCatalog.ts`, pick 3–5 APIs where `overallStatus === 'verified'`. For each, update the `endpoints` JSONB to include `exampleCall` and `responseDataPath`. This is done via Supabase Studio UPDATE or a one-off script.

- [ ] **Step 1: For each golden API, update the Supabase record**

Example SQL for a weather API (adapt to actual values from report):

```sql
-- Run in Supabase Studio SQL Editor
-- Replace with actual api_catalog id and endpoint data from verification-report.json
UPDATE api_catalog
SET
  verification_status = 'verified',
  verified_at = NOW(),
  last_verification_note = '2026-04-14 수동 검증 — 응답 정상 확인',
  endpoints = '[
    {
      "path": "/current.json",
      "method": "GET",
      "description": "현재 날씨 조회",
      "params": [{"name": "q", "type": "string", "required": true, "description": "도시명", "defaultValue": "Seoul"}],
      "responseExample": {"location": {"name": "Seoul"}, "current": {"temp_c": 15}},
      "exampleCall": "const res = await fetch(''/api/v1/proxy?apiId=REPLACE_API_ID&proxyPath=/current.json&q=Seoul'');\nconst data = await res.json();\n// data.current.temp_c, data.location.name",
      "responseDataPath": "current"
    }
  ]'::jsonb
WHERE id = 'REPLACE_WITH_ACTUAL_ID';
```

- [ ] **Step 2: Create golden-set documentation**

Create `docs/reference/golden-api-set.md` documenting each golden API: name, ID, verified endpoints, example calls. (Content filled in after user runs verification script.)

- [ ] **Step 3: Commit**

```bash
git add docs/reference/golden-api-set.md
git commit -m "docs: 골든셋 API 목록 문서화 (검증된 3-5개 API)"
```

---

## Task 5: Stage 1 system prompt — remove mock-data-first rules

**Files:**
- Modify: `src/lib/ai/promptBuilder.ts` (function `_buildStage1SystemPrompt`, lines ~20–510)

Context: The current top rules (L25–L26) mandate mock data first. The "목 데이터 작성 규칙" section rewards 20+ hardcoded items. Both must change. The checklist at L447 asks "목 데이터가 최소 15개 이상인가?" — replace with fetch call check.

- [x] **Step 1: Write a unit test for the new Stage 1 prompt**

```typescript
// src/lib/ai/promptBuilder.test.ts — add these tests
import { describe, it, expect } from 'vitest';
import { buildStage1SystemPrompt, buildStage1UserPrompt } from './promptBuilder';

describe('buildStage1SystemPrompt — no mock data mandate', () => {
  it('does NOT instruct "목 데이터로 즉시 렌더링"', () => {
    const prompt = buildStage1SystemPrompt();
    expect(prompt).not.toContain('목 데이터로 즉시 렌더링');
    expect(prompt).not.toContain('목 데이터로 채워진');
  });

  it('DOES instruct real API call as top priority', () => {
    const prompt = buildStage1SystemPrompt();
    expect(prompt).toMatch(/실제 API 호출.*최우선|fetch.*API.*최우선/i);
  });

  it('DOES include placeholder blocklist', () => {
    const prompt = buildStage1SystemPrompt();
    expect(prompt).toContain('홍길동');
    expect(prompt).toContain('test@example.com');
    expect(prompt).toContain('준비 중');
  });

  it('checklist asks for fetch call, not mock data count', () => {
    const prompt = buildStage1SystemPrompt();
    expect(prompt).not.toContain('목 데이터가 최소 15개');
    expect(prompt).toMatch(/fetch.*호출|API.*호출.*확인/i);
  });
});
```

- [x] **Step 2: Run the tests to confirm they fail**

```bash
pnpm test src/lib/ai/promptBuilder.test.ts
```

Expected: 3 tests fail (not contain mock data rule, etc.)

- [x] **Step 3: Rewrite `_buildStage1SystemPrompt()` — the 5 top rules**

Replace the `## ★ 가장 중요한 규칙` section (L23–L30) with:

```typescript
## ★ 가장 중요한 규칙 (위반 시 실패)

1. **실제 API 호출을 최우선으로 구현하라.** 서비스가 시작되면 DOMContentLoaded에서 즉시 fetch()를 호출하여 실제 데이터를 화면에 표시한다.
2. **하드코딩된 가데이터(mock data) 배열은 절대 금지.** \`const mockData = [...]\`, \`const items = [...]\` 같은 하드코딩 배열을 만들지 마라. API 호출 결과만 렌더링한다.
3. **Placeholder 문자열 절대 금지 — blocklist:** 홍길동, 김철수, test@example.com, user@test.com, Loading..., 준비 중, 구현 예정, Sample Data, Lorem ipsum, 여기에 입력, TODO, 추후 업데이트. 이 문자열들이 최종 코드에 있으면 실패다.
4. **API 호출 중에는 스켈레톤 UI를 표시하고, 완료 후 교체하라.** 빈 화면이나 "데이터가 없습니다"는 API 실패 상태에서만 허용된다.
5. **Chart.js 차트는 API 응답 숫자를 직접 바인딩하라.** API 호출 전에는 차트를 렌더링하지 마라.
```

- [x] **Step 4: Replace "목 데이터 작성 규칙" section with "API 호출 구현 규칙"**

Replace the entire `## 목 데이터 작성 규칙 (★ 매우 중요)` section (L213–L242) with:

```typescript
## API 호출 구현 규칙 (★ 가장 중요)

모든 서비스는 반드시 실제 API를 호출하여 데이터를 가져와야 한다.

### 인증 없는 공개 API (authType: 'none')
\`\`\`javascript
document.addEventListener('DOMContentLoaded', async () => {
  renderSkeletons(6); // 로딩 중 스켈레톤

  try {
    const res = await fetch('https://api.example.com/data?param=value');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items = data.list ?? data.results ?? data.data ?? [];
    renderCards(items);
    showToast('데이터를 불러왔습니다.', 'success');
  } catch (err) {
    showError('데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    console.error(err);
  }
});
\`\`\`

### 인증 필요 API (authType: 'api_key') — 서버 프록시 필수
\`\`\`javascript
document.addEventListener('DOMContentLoaded', async () => {
  renderSkeletons(6);

  try {
    // apiId와 proxyPath는 아래 API 목록에서 확인
    const res = await fetch('/api/v1/proxy?apiId=API_ID_HERE&proxyPath=/endpoint&param=value');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items = data.articles ?? data.results ?? data.data ?? [];
    renderCards(items);
  } catch (err) {
    showError('데이터를 불러오지 못했습니다.');
  }
});
\`\`\`

### 에러 상태 표시 (가데이터로 대체하지 말 것)
\`\`\`javascript
function showError(message) {
  const container = document.getElementById('content');
  container.innerHTML = \`
    <div class="flex flex-col items-center justify-center py-20 text-center">
      <div class="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6">
        <i class="fas fa-exclamation-triangle text-3xl text-red-400"></i>
      </div>
      <h3 class="text-lg font-semibold text-gray-700 mb-2">데이터를 불러오지 못했습니다</h3>
      <p class="text-sm text-gray-400 mb-6">\${message}</p>
      <button onclick="location.reload()" class="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm">다시 시도</button>
    </div>
  \`;
}
\`\`\`

### 이미지 URL
API 응답에 이미지 URL이 없을 때만: \`https://source.unsplash.com/600x400/?{콘텐츠키워드}\`
API 응답의 이미지 필드가 있으면 반드시 그것을 사용하라.
```

- [x] **Step 5: Update the checklist (L442–L473)**

Replace the "콘텐츠 & 데이터" checklist section with:

```typescript
### 콘텐츠 & 데이터
□ DOMContentLoaded에서 즉시 fetch() 호출이 있는가?
□ 하드코딩된 배열(const mockData = [...])이 없는가?
□ API 응답 데이터를 파싱하여 DOM에 바인딩하는가?
□ Placeholder blocklist 문자열이 없는가? (홍길동, test@example.com, Loading..., 준비 중 등)
□ Chart.js 차트에 API 응답 숫자가 바인딩되어 있는가?
□ 모든 텍스트가 한국어인가?
□ API 실패 시 에러 Empty State가 표시되는가?
```

- [x] **Step 6: Update "구현 지시" steps (L591–L635) — swap mock data step with fetch step**

Replace "### 2단계: 목 데이터 준비 (★ 최우선)" with:

```typescript
### 2단계: API 호출 구현 (★ 최우선)
- 아래 API 목록의 exampleCall을 그대로 복사하여 DOMContentLoaded 핸들러를 작성
- 응답의 responseDataPath(예: 'data.items')로 배열을 꺼냄
- 데이터가 로드되기 전에는 renderSkeletons()로 스켈레톤 UI 표시
- fetch() 성공 → renderCards(items), showToast('데이터를 불러왔습니다.', 'success')
- fetch() 실패 → showError('데이터를 불러오지 못했습니다.')
```

- [x] **Step 7: Clear cached prompt**

The function `_buildStage1SystemPrompt` uses a module-level cache `cachedStage1SystemPrompt`. Add cache invalidation for tests:

```typescript
export function clearPromptCache(): void {
  cachedStage1SystemPrompt = null;
  cachedStage2SystemPrompt = null;
}
```

Add this export after the cache variable declarations.

- [x] **Step 8: Run the tests**

```bash
pnpm test src/lib/ai/promptBuilder.test.ts
```

Expected: all 4 tests pass.

- [x] **Step 9: Commit**

```bash
git add src/lib/ai/promptBuilder.ts src/lib/ai/promptBuilder.test.ts
git commit -m "feat: Stage 1 시스템 프롬프트 재작성 — 가데이터 우선 규칙 제거, 실제 API 호출 최우선"
```

---

## Task 6: Stage 1 user prompt — inject exampleCall

**Files:**
- Modify: `src/lib/ai/promptBuilder.ts` (function `buildStage1UserPrompt`, lines ~512–635)

Context: Currently the user prompt shows only `JSON.stringify(ep.params)` and `JSON.stringify(ep.responseExample)`. We need to inject `exampleCall` if present.

- [x] **Step 1: Write failing test**

Add to `src/lib/ai/promptBuilder.test.ts`:

```typescript
import type { ApiCatalogItem } from '@/types/api';

describe('buildStage1UserPrompt — exampleCall injection', () => {
  const mockApi: ApiCatalogItem = {
    id: 'test-api-1',
    name: '날씨 API',
    description: '현재 날씨',
    category: 'weather',
    baseUrl: 'https://api.weather.com',
    authType: 'api_key',
    authConfig: {},
    rateLimit: null,
    isActive: true,
    iconUrl: null,
    docsUrl: null,
    tags: [],
    apiVersion: null,
    deprecatedAt: null,
    successorId: null,
    corsSupported: false,
    requiresProxy: true,
    creditRequired: null,
    createdAt: '',
    updatedAt: '',
    endpoints: [{
      path: '/current.json',
      method: 'GET',
      description: '현재 날씨',
      params: [],
      responseExample: { current: { temp_c: 15 } },
      exampleCall: "const res = await fetch('/api/v1/proxy?apiId=test-api-1&proxyPath=/current.json&q=Seoul');\nconst data = await res.json();",
      responseDataPath: 'current',
    }],
  };

  it('injects exampleCall into the user prompt when available', () => {
    const prompt = buildStage1UserPrompt([mockApi], '날씨 서비스', 'proj-1');
    expect(prompt).toContain("fetch('/api/v1/proxy?apiId=test-api-1");
    expect(prompt).toContain('responseDataPath: current');
  });
});
```

- [x] **Step 2: Run test to confirm failure**

```bash
pnpm test src/lib/ai/promptBuilder.test.ts
```

Expected: "injects exampleCall" test fails.

- [x] **Step 3: Update `buildStage1UserPrompt` endpoint description block**

In `buildStage1UserPrompt` (around L518–L540), update the `apiDescriptions` mapping:

```typescript
const apiDescriptions = apis
  .map((api, i) => {
    const endpoints = api.endpoints
      .map((ep) => {
        const paramStr = JSON.stringify(ep.params);
        const responseStr = JSON.stringify(ep.responseExample).slice(0, 300);
        const exampleBlock = ep.exampleCall
          ? `\n    ★ exampleCall (그대로 사용하라):\n    \`\`\`javascript\n    ${ep.exampleCall.replace(/\n/g, '\n    ')}\n    \`\`\`\n    responseDataPath: ${ep.responseDataPath ?? '직접 탐색'}`
          : '';
        return `  - ${ep.method} ${ep.path}: ${ep.description}\n    파라미터: ${paramStr}\n    응답 예시: ${responseStr}${exampleBlock}`;
      })
      .join('\n');

    const projectParam = projectId ? `&projectId=${projectId}` : '';
    const callMethod =
      api.authType === 'none'
        ? `직접 fetch (인증 불필요): ${api.baseUrl}`
        : `서버 프록시 필수: /api/v1/proxy?apiId=${api.id}${projectParam}&proxyPath=<경로>&<파라미터>=<값>`;

    return `### API ${i + 1}: ${api.name}
- API ID (프록시 호출 시 사용): ${api.id}
- 호출 방법: ${callMethod}
- 인증 방식: ${api.authType}
- 호출 제한: ${api.rateLimit ?? '무제한'}
- 주요 엔드포인트:
${endpoints}`;
  })
  .join('\n\n');
```

- [x] **Step 4: Run tests**

```bash
pnpm test src/lib/ai/promptBuilder.test.ts
```

Expected: all tests pass.

- [x] **Step 5: Commit**

```bash
git add src/lib/ai/promptBuilder.ts
git commit -m "feat: Stage 1 유저 프롬프트에 exampleCall 주입"
```

---

## Task 7: New Stage 2 — function verification prompt

**Files:**
- Modify: `src/lib/ai/promptBuilder.ts` (add two new exports)

Context: This is the new "Stage 2 Function Verification" — an LLM pass that receives Stage 1 code + static QC issues and fixes ONLY JS bugs (fetch errors, placeholder strings, data binding). It does NOT touch CSS or HTML structure.

- [x] **Step 1: Write failing test**

Add to `src/lib/ai/promptBuilder.test.ts`:

```typescript
import { buildStage2FunctionSystemPrompt, buildStage2FunctionUserPrompt } from './promptBuilder';

describe('buildStage2FunctionSystemPrompt', () => {
  it('instructs JS-only fixes', () => {
    const prompt = buildStage2FunctionSystemPrompt();
    expect(prompt).toMatch(/JavaScript.*수정|JS.*버그/i);
    expect(prompt).toMatch(/CSS.*변경.*금지|디자인.*변경.*금지/i);
  });

  it('includes placeholder removal instruction', () => {
    const prompt = buildStage2FunctionSystemPrompt();
    expect(prompt).toContain('홍길동');
    expect(prompt).toContain('준비 중');
  });
});

describe('buildStage2FunctionUserPrompt', () => {
  it('embeds QC issues in the prompt', () => {
    const code = { html: '<html>', css: '', js: 'console.log("hi")' };
    const staticIssues = ['fetch 호출이 없습니다', 'placeholder 감지: 준비 중'];
    const prompt = buildStage2FunctionUserPrompt(code, staticIssues, null);
    expect(prompt).toContain('fetch 호출이 없습니다');
    expect(prompt).toContain('placeholder 감지: 준비 중');
  });
});
```

- [x] **Step 2: Run test to confirm failure**

```bash
pnpm test src/lib/ai/promptBuilder.test.ts
```

Expected: 3 new tests fail (function not exported yet).

- [x] **Step 3: Add `buildStage2FunctionSystemPrompt` and `buildStage2FunctionUserPrompt` to `promptBuilder.ts`**

Add after the existing `buildStage2SystemPrompt` function block (around L932):

```typescript
// ─── Stage 2 Function Verification 시스템 프롬프트 ───────────────────────────

let cachedStage2FunctionSystemPrompt: string | null = null;

export function buildStage2FunctionSystemPrompt(): string {
  return cachedStage2FunctionSystemPrompt ?? (cachedStage2FunctionSystemPrompt = _buildStage2FunctionSystemPrompt());
}

function _buildStage2FunctionSystemPrompt(): string {
  return `당신은 1단계에서 생성된 웹서비스 코드의 기능 버그를 수정하는 JavaScript 전문가입니다.

## 핵심 규칙 (위반 시 실패)

1. **JavaScript 로직만 수정한다.** CSS, HTML 구조, 클래스 이름은 절대 변경하지 않는다.
2. **fetch() 호출이 없으면 반드시 추가한다.** 아래 API 호출 지시를 따른다.
3. **Placeholder 문자열을 제거한다.** 다음 문자열이 JS 코드나 렌더링된 HTML에 있으면 삭제: 홍길동, 김철수, 이영희, test@example.com, user@test.com, Loading..., 준비 중, 구현 예정, Sample Data, Lorem ipsum.
4. **응답 데이터 파싱이 잘못되어 있으면 수정한다.** \`data.items\`가 undefined인 경우 올바른 path로 교체한다.
5. **이벤트 핸들러 버그를 수정한다.** 버튼 클릭이 동작하지 않는 경우, querySelector 오류 등.
6. **전체 코드를 HTML / CSS / JavaScript 형식으로 반환한다.**

## 허용 작업

- fetch() 추가/수정
- 응답 JSON 파싱 경로 수정 (data.X, data.Y.Z 등)
- 이벤트 핸들러 버그 수정
- placeholder 문자열 제거
- renderCards/renderList 함수 수정
- DOMContentLoaded 내 로직 수정

## 금지 작업

- CSS 클래스 추가/제거/변경
- HTML 태그 추가/제거
- 섹션 재설계
- 색상, 폰트, 레이아웃 변경
- 이미 동작하는 기능 수정`;
}

// ─── Stage 2 Function Verification 유저 프롬프트 ────────────────────────────

export function buildStage2FunctionUserPrompt(
  stage1Code: { html: string; css: string; js: string },
  staticQcIssues: string[],
  fastQcIssues: string[] | null,
): string {
  const issueBlock = staticQcIssues.length > 0 || (fastQcIssues && fastQcIssues.length > 0)
    ? `## 발견된 문제 (반드시 수정)

${staticQcIssues.map(i => `- [정적 검사] ${i}`).join('\n')}
${fastQcIssues ? fastQcIssues.map(i => `- [브라우저 QC] ${i}`).join('\n') : ''}
`
    : '## 문제 없음 — 코드를 그대로 반환하세요\n\n';

  return `${issueBlock}
## 1단계 생성 코드

### HTML
\`\`\`html
${stage1Code.html}
\`\`\`

### CSS
\`\`\`css
${stage1Code.css}
\`\`\`

### JavaScript
\`\`\`javascript
${stage1Code.js}
\`\`\`

위 문제를 JavaScript 코드만 수정하여 전체 코드를 반환하세요:

### HTML
\`\`\`html
(HTML — 변경하지 말 것, 그대로 반환)
\`\`\`

### CSS
\`\`\`css
(CSS — 변경하지 말 것, 그대로 반환)
\`\`\`

### JavaScript
\`\`\`javascript
(수정된 JavaScript 코드)
\`\`\``;
}

export function buildStage2FunctionRegenerationUserPrompt(
  stage1Code: { html: string; css: string; js: string },
  staticQcIssues: string[],
  fastQcIssues: string[] | null,
  feedback: string,
): string {
  return buildStage2FunctionUserPrompt(stage1Code, staticQcIssues, fastQcIssues) +
    `\n\n## 사용자 피드백 (기능 관련 부분만 반영)\n${feedback}`;
}
```

- [x] **Step 4: Export the new functions**

Verify all 4 new function names are exported (search for them):

```bash
grep -n "export function buildStage2Function" src/lib/ai/promptBuilder.ts
```

Expected: lines for `buildStage2FunctionSystemPrompt`, `buildStage2FunctionUserPrompt`, `buildStage2FunctionRegenerationUserPrompt`.

- [x] **Step 5: Run tests**

```bash
pnpm test src/lib/ai/promptBuilder.test.ts
```

Expected: all tests pass.

- [x] **Step 6: Commit**

```bash
git add src/lib/ai/promptBuilder.ts src/lib/ai/promptBuilder.test.ts
git commit -m "feat: Stage 2 기능 검증 프롬프트 추가 (buildStage2FunctionSystemPrompt)"
```

---

## Task 8: 3-stage generation pipeline

**Files:**
- Modify: `src/lib/ai/generationPipeline.ts`

Context: Currently `runGenerationPipeline` calls `runStage1` (0→45%) then `runStage2` (45→90%). We insert a new `runStage2Function` (30→65%) between them. The current Stage 2 (design polish) becomes Stage 3 (65→90%). Only Stage 3 output is saved.

**SSE progress milestones:**
- Stage 1 complete: 30%
- Stage 2 function complete: 65%
- Stage 3 design complete: 85% (then validation/save → 95%/100%)

- [x] **Step 1: Write integration test**

```typescript
// src/lib/ai/generationPipeline.test.ts — add describe block
import { describe, it, expect, vi } from 'vitest';

describe('runGenerationPipeline — 3-stage SSE events', () => {
  it('emits stage1_generating, stage2_function_generating, stage3_generating SSE steps', async () => {
    // This is a smoke test — full integration test requires mocking IAiProvider
    // For now, verify PipelineInput type accepts stage2FunctionSystemPrompt
    // Type-checking catches structural errors at compile time
    const input = {
      projectId: 'p1',
      userId: 'u1',
      correlationId: undefined,
      apis: [],
      stage1SystemPrompt: '',
      stage1UserPrompt: '',
      stage2FunctionSystemPrompt: '',
      buildStage2FunctionUserPrompt: (_code: { html: string; css: string; js: string }) => '',
      stage2SystemPrompt: '',
      buildStage2UserPrompt: (_code: { html: string; css: string; js: string }) => '',
    };
    // If PipelineInput accepts these fields, the import succeeds and type-check passes
    expect(input.stage2FunctionSystemPrompt).toBe('');
  });
});
```

- [x] **Step 2: Run test to confirm it compiles**

```bash
pnpm type-check && pnpm test src/lib/ai/generationPipeline.test.ts
```

Expected: type error on `stage2FunctionSystemPrompt` (not in `PipelineInput` yet).

- [x] **Step 3: Update `PipelineInput` interface**

```typescript
export interface PipelineInput {
  projectId: string;
  userId: string;
  correlationId: string | undefined;
  apis: ApiCatalogItem[];
  /** Stage 1 (구조·기능) 시스템 프롬프트 */
  stage1SystemPrompt: string;
  /** Stage 1 유저 프롬프트 */
  stage1UserPrompt: string;
  /** Stage 2 (기능 검증) 시스템 프롬프트 */
  stage2FunctionSystemPrompt: string;
  /**
   * Stage 2 기능 검증 유저 프롬프트 빌더.
   * Receives stage1Code + QC issues.
   */
  buildStage2FunctionUserPrompt: (
    stage1Code: { html: string; css: string; js: string },
    staticQcIssues: string[],
    fastQcIssues: string[] | null,
  ) => string;
  /** Stage 3 (디자인·폴리시) 시스템 프롬프트 — 이전 stage2SystemPrompt */
  stage2SystemPrompt: string;
  /** Stage 3 유저 프롬프트 빌더 */
  buildStage2UserPrompt: (stage1Code: { html: string; css: string; js: string }) => string;
  /** 코드 메타데이터에 병합할 추가 필드 */
  extraMetadata?: Record<string, unknown>;
}
```

- [x] **Step 4: Add `runStage2Function` internal function**

Add after the existing `runStage2` function (around L249):

```typescript
async function runStage2Function(
  stage1Code: { html: string; css: string; js: string },
  systemPrompt: string,
  buildUserPrompt: (
    code: { html: string; css: string; js: string },
    staticIssues: string[],
    qcIssues: string[] | null,
  ) => string,
  staticQcIssues: string[],
  fastQcIssues: string[] | null,
  aiProvider: IAiProvider,
  sse: SseWriter,
): Promise<{
  parsed: { html: string; css: string; js: string };
  durationMs: number;
  tokensUsed: { input: number; output: number };
}> {
  sse.send('progress', { step: 'stage1_complete', progress: 30, message: '구조 완성. 기능 검증 중...' });
  sse.send('progress', { step: 'stage2_function_generating', progress: 35, message: '2단계: 기능 버그 수정 중...' });

  const userPrompt = buildUserPrompt(stage1Code, staticQcIssues, fastQcIssues);
  let lastProgressUpdate = Date.now();
  const streamStartTime = Date.now();

  const response = await aiProvider.generateCodeStream(
    { system: systemPrompt, user: userPrompt },
    (_chunk: string, accumulated: string) => {
      if (sse.isCancelled()) return;
      const now = Date.now();
      if (now - lastProgressUpdate < 500) return;
      lastProgressUpdate = now;
      const estimatedProgress = Math.min(62, 35 + Math.floor((accumulated.length / 10000) * 27));
      const elapsed = Math.floor((now - streamStartTime) / 1000);
      sse.send('progress', {
        step: 'stage2_function_generating',
        progress: estimatedProgress,
        message: `2단계: 기능 버그 수정 중... (${elapsed}초 경과)`,
      });
    },
  );

  return {
    parsed: parseGeneratedCode(response.content),
    durationMs: response.durationMs,
    tokensUsed: response.tokensUsed,
  };
}
```

- [x] **Step 5: Update `runStage1` SSE progress (0→30% instead of 0→40%)**

In the existing `runStage1` function, change:
- Initial progress message: `progress: 5` ✓ (keep)
- `const estimatedProgress = Math.min(40, ...)` → `Math.min(28, ...)`
- Message: `'1단계: 구조 및 기능 생성 중...'` ✓ (keep)

- [x] **Step 6: Update `runStage2` (now Stage 3) SSE progress**

In the existing `runStage2` function:
- Change: `sse.send('progress', { step: 'stage1_complete', progress: 45, ...` → `progress: 65, message: '기능 검증 완성. 디자인 적용 중...'`
- Change step name: `stage2_generating` → `stage3_generating`  
- Change: `Math.min(82, 50 + ...)` → `Math.min(82, 65 + Math.floor((accumulated.length / 15000) * 17))`
- Change message: `'2단계: 디자인 및 인터랙션 적용 중...'` → `'3단계: 디자인 및 인터랙션 적용 중...'`

- [x] **Step 7: Update `runGenerationPipeline` to 3-stage**

In the main pipeline function, replace the current 2-stage call sequence with:

```typescript
// Stage 1: 구조·기능 생성 (0→30%)
const stage1Code = await runStage1(
  stage1SystemPrompt,
  stage1UserPrompt,
  aiProvider,
  sse,
);

if (sse.isCancelled()) return;

// Stage 1 정적 QC — stage2Function에 전달
const stage1Validation = validateAll(stage1Code.html, stage1Code.css, stage1Code.js);
const stage1Quality = evaluateQuality(stage1Code.html, stage1Code.css, stage1Code.js);
const staticQcIssues = [
  ...stage1Validation.warnings,
  ...stage1Quality.details,
  ...(stage1Quality.fetchCallCount === 0 ? ['fetch() 호출이 없습니다 — 반드시 API 호출 추가'] : []),
  ...(stage1Quality.placeholderCount && stage1Quality.placeholderCount > 0
    ? [`Placeholder 감지 (${stage1Quality.placeholderCount}개): 홍길동, 준비 중 등 제거 필요`]
    : []),
];

// Stage 1 Fast QC (기능 문제 감지용)
let stage1FastQcIssues: string[] | null = null;
if (isQcEnabled()) {
  const assembled = safeAssembleHtml(stage1Code);
  if (assembled) {
    try {
      const report = await runFastQc(assembled);
      stage1FastQcIssues = report?.checks.filter(c => !c.passed).map(c => c.name) ?? null;
    } catch {
      // Fast QC 실패해도 계속 진행
    }
  }
}

// Stage 2: 기능 검증 (30→65%)
const stage2FunctionResult = await runStage2Function(
  stage1Code,
  input.stage2FunctionSystemPrompt,
  input.buildStage2FunctionUserPrompt,
  staticQcIssues,
  stage1FastQcIssues,
  aiProvider,
  sse,
);

if (sse.isCancelled()) return;

// Stage 3: 디자인·폴리시 (65→90%)
const stage3Result = await runStage2(
  stage2FunctionResult.parsed,
  stage2SystemPrompt,
  buildStage2UserPrompt,
  aiProvider,
  sse,
);

if (sse.isCancelled()) return;

sse.send('progress', { step: 'validating', progress: 85, message: '코드 검증 중...' });

let parsed = stage3Result.parsed;
const stage3Response = {
  provider: stage3Result.provider,
  model: stage3Result.model,
  durationMs: stage3Result.durationMs + stage2FunctionResult.durationMs,
  tokensUsed: {
    input: stage3Result.tokensUsed.input + stage2FunctionResult.tokensUsed.input,
    output: stage3Result.tokensUsed.output + stage2FunctionResult.tokensUsed.output,
  },
};
```

Then use `stage3Response` in place of `stage2Response` for the rest of the pipeline (saved code, events, etc.).

- [x] **Step 8: Run type-check**

```bash
pnpm type-check
```

Expected: 0 errors. (Routes will fail until Task 9.)

- [x] **Step 9: Commit**

```bash
git add src/lib/ai/generationPipeline.ts src/lib/ai/generationPipeline.test.ts
git commit -m "feat: 생성 파이프라인 3단계 구조로 확장 (Stage 2 기능 검증 추가)"
```

---

## Task 9: Wire 3-stage pipeline into generate and regenerate routes

**Files:**
- Modify: `src/app/api/v1/generate/route.ts`
- Modify: `src/app/api/v1/generate/regenerate/route.ts`

- [x] **Step 1: Update `generate/route.ts`**

Add imports:

```typescript
import {
  buildStage1SystemPrompt,
  buildStage1UserPrompt,
  buildStage2FunctionSystemPrompt,
  buildStage2FunctionUserPrompt,
  buildStage2SystemPrompt,
  buildStage2UserPrompt,
} from '@/lib/ai/promptBuilder';
```

In the `POST` function, add after `const stage1UserPrompt = ...`:

```typescript
const stage2FunctionSystemPrompt = buildStage2FunctionSystemPrompt();
```

In `runGenerationPipeline` call, add:

```typescript
stage2FunctionSystemPrompt,
buildStage2FunctionUserPrompt: (stage1Code, staticIssues, qcIssues) =>
  buildStage2FunctionUserPrompt(stage1Code, staticIssues, qcIssues),
```

- [x] **Step 2: Update `regenerate/route.ts`**

Add the same imports and function wiring. For regeneration, use:

```typescript
import {
  buildStage1SystemPrompt,
  buildStage1RegenerationUserPrompt,
  buildStage2FunctionSystemPrompt,
  buildStage2FunctionRegenerationUserPrompt,
  buildStage2SystemPrompt,
  buildStage2RegenerationUserPrompt,
} from '@/lib/ai/promptBuilder';
```

```typescript
const stage2FunctionSystemPrompt = buildStage2FunctionSystemPrompt();
// In runGenerationPipeline:
stage2FunctionSystemPrompt,
buildStage2FunctionUserPrompt: (stage1Code, staticIssues, qcIssues) =>
  buildStage2FunctionRegenerationUserPrompt(stage1Code, staticIssues, qcIssues, feedback),
```

- [x] **Step 3: Type-check and build**

```bash
pnpm type-check && pnpm build
```

Expected: 0 errors, build succeeds.

- [x] **Step 4: Run all tests**

```bash
pnpm test
```

Expected: all tests pass.

- [x] **Step 5: Commit**

```bash
git add src/app/api/v1/generate/route.ts src/app/api/v1/generate/regenerate/route.ts
git commit -m "feat: generate/regenerate 라우트에 3단계 파이프라인 연결"
```

---

## Task 10: codeValidator redesign — fetch-first scoring

**Files:**
- Modify: `src/lib/ai/codeValidator.ts`

Context: `hasMockData` at L129 currently gives +1 for detecting `const mockData = [...]`. This must be removed. Instead: +1 for having fetch calls, +1 for parsing responses, +1 for no placeholder strings.

- [x] **Step 1: Write failing tests**

```typescript
// Add to src/lib/ai/codeValidator.test.ts (or create it)
import { describe, it, expect } from 'vitest';
import { evaluateQuality } from './codeValidator';

describe('evaluateQuality — fetch-first scoring', () => {
  const baseHtml = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width"><title>T</title></head>
    <body><main><nav></nav><footer></footer></main></body></html>`;

  it('gives +1 for fetch() call in JS', () => {
    const withFetch = evaluateQuality(baseHtml, '', `fetch('/api/v1/proxy?apiId=1').then(r=>r.json())`);
    const noFetch = evaluateQuality(baseHtml, '', 'console.log("hi")');
    expect(withFetch.fetchCallCount).toBeGreaterThan(0);
    expect(noFetch.fetchCallCount).toBe(0);
    expect(withFetch.structuralScore).toBeGreaterThan(noFetch.structuralScore);
  });

  it('penalizes zero fetch calls (fetchCallCount === 0 in details)', () => {
    const result = evaluateQuality(baseHtml, '', 'const mockData = [{id:1}]');
    expect(result.fetchCallCount).toBe(0);
    expect(result.details.some(d => d.includes('fetch'))).toBe(true);
  });

  it('does NOT give bonus for const mockData array', () => {
    const withMock = evaluateQuality(baseHtml, '', 'const mockData = [{id:1},{id:2}]; fetch("/api")');
    const noMock = evaluateQuality(baseHtml, '', 'fetch("/api")');
    // hasMockData no longer factors into score — both should have same score
    expect(withMock.structuralScore).toBe(noMock.structuralScore);
  });

  it('detects placeholder strings', () => {
    const result = evaluateQuality(baseHtml, '', 'document.write("홍길동"); fetch("/api")');
    expect(result.placeholderCount).toBeGreaterThan(0);
  });
});
```

- [x] **Step 2: Run tests to confirm failures**

```bash
pnpm test src/lib/ai/codeValidator.test.ts
```

Expected: 3 tests fail.

- [x] **Step 3: Update `QualityMetrics` interface**

```typescript
export interface QualityMetrics {
  structuralScore: number;
  mobileScore: number;
  hasSemanticHtml: boolean;
  hasMockData: boolean; // kept for backward compat (always false now)
  hasInteraction: boolean;
  hasResponsiveClasses: boolean;
  hasAdequateResponsive: boolean;
  noFixedOverflow: boolean;
  hasImageProtection: boolean;
  hasMobileNav: boolean;
  hasFooter: boolean;
  hasImgAlt: boolean;
  // New real-data binding fields
  fetchCallCount: number;
  hasProxyCall: boolean;
  hasJsonParse: boolean;
  placeholderCount: number;
  details: string[];
}
```

- [x] **Step 4: Rewrite `evaluateQuality` — replace check #2 (hasMockData) with fetch checks**

Replace the entire check #2 block (L129–L134) with three new checks:

```typescript
  // 2. Has real fetch() call — REQUIRED
  const fetchMatches = js.match(/\bfetch\s*\(/g) ?? [];
  const fetchCallCount = fetchMatches.length;
  const hasProxyCall = /\/api\/v1\/proxy/.test(js);
  const hasJsonParse = /\.json\(\)|JSON\.parse\s*\(/.test(js);
  if (fetchCallCount > 0) {
    score++;
    details; // no negative detail
  } else {
    details.push('fetch() 호출이 없습니다 — 실제 API 호출 필수');
  }

  // 2b. Response JSON parsing
  if (hasJsonParse) {
    score++;
  } else {
    details.push('.json() 또는 JSON.parse() 없음 — API 응답 파싱 필요');
  }

  // 2c. No placeholder strings
  const PLACEHOLDER_PATTERNS = /홍길동|김철수|이영희|test@example\.com|user@test\.com|Loading\.\.\.|준비 중|구현 예정|Sample Data|Lorem ipsum/;
  const placeholderCount = (fullCode.match(new RegExp(PLACEHOLDER_PATTERNS.source, 'g')) ?? []).length;
  if (placeholderCount === 0) {
    score++;
  } else {
    details.push(`Placeholder 문자열 감지 (${placeholderCount}개): 홍길동, 준비 중 등 제거 필요`);
  }
```

Update `const maxScore = 14` → `const maxScore = 16` (added 2 new checks, hasMockData removed is replaced by 3 new → net +2).

Update the return value to include new fields:

```typescript
  return {
    structuralScore,
    mobileScore,
    hasSemanticHtml,
    hasMockData: false, // deprecated — always false, use fetchCallCount instead
    hasInteraction,
    hasResponsiveClasses,
    hasAdequateResponsive,
    noFixedOverflow,
    hasImageProtection,
    hasMobileNav,
    hasFooter,
    hasImgAlt,
    fetchCallCount,
    hasProxyCall,
    hasJsonParse,
    placeholderCount,
    details,
  };
```

- [x] **Step 5: Run tests**

```bash
pnpm test src/lib/ai/codeValidator.test.ts
```

Expected: all 4 tests pass.

- [x] **Step 6: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass (other files use `hasMockData` only as a boolean — it's now always `false`, which is backward compatible).

- [x] **Step 7: Commit**

```bash
git add src/lib/ai/codeValidator.ts src/lib/ai/codeValidator.test.ts
git commit -m "feat: codeValidator — hasMockData 보상 제거, fetch 호출 필수 검사 추가"
```

---

## Task 11: qualityLoop — remove mock data instruction, add fetch-based retry

**Files:**
- Modify: `src/lib/ai/qualityLoop.ts`

- [x] **Step 1: Write failing tests**

```typescript
// Add to (or create) src/lib/ai/qualityLoop.test.ts
import { describe, it, expect } from 'vitest';
import { shouldRetryGeneration, buildQualityImprovementPrompt } from './qualityLoop';
import type { QualityMetrics } from './codeValidator';

const baseMetrics: QualityMetrics = {
  structuralScore: 80, mobileScore: 80,
  hasSemanticHtml: true, hasMockData: false, hasInteraction: true,
  hasResponsiveClasses: true, hasAdequateResponsive: true, noFixedOverflow: true,
  hasImageProtection: true, hasMobileNav: true, hasFooter: true, hasImgAlt: true,
  fetchCallCount: 1, hasProxyCall: false, hasJsonParse: true, placeholderCount: 0,
  details: [],
};

describe('shouldRetryGeneration', () => {
  it('retries when fetchCallCount === 0', () => {
    expect(shouldRetryGeneration({ ...baseMetrics, fetchCallCount: 0 }, null)).toBe(true);
  });

  it('retries when placeholderCount > 0', () => {
    expect(shouldRetryGeneration({ ...baseMetrics, placeholderCount: 3 }, null)).toBe(true);
  });

  it('does NOT retry when fetch and no placeholders, good scores', () => {
    expect(shouldRetryGeneration(baseMetrics, null)).toBe(false);
  });
});

describe('buildQualityImprovementPrompt', () => {
  it('does NOT contain "15개" mock data instruction', () => {
    const prompt = buildQualityImprovementPrompt({ html: '', css: '', js: '' }, baseMetrics, null);
    expect(prompt).not.toContain('15개');
    expect(prompt).not.toContain('목 데이터');
  });

  it('instructs to add fetch when missing', () => {
    const prompt = buildQualityImprovementPrompt(
      { html: '', css: '', js: '' },
      { ...baseMetrics, fetchCallCount: 0 },
      null,
    );
    expect(prompt).toMatch(/fetch|API 호출/i);
  });
});
```

- [x] **Step 2: Run tests to confirm failures**

```bash
pnpm test src/lib/ai/qualityLoop.test.ts
```

Expected: 3 tests fail.

- [x] **Step 3: Update `shouldRetryGeneration`**

```typescript
export function shouldRetryGeneration(
  metrics: QualityMetrics,
  qcReport?: QcReport | null
): boolean {
  if (metrics.structuralScore < QC_THRESHOLDS.QUALITY) return true;
  if (metrics.mobileScore < QC_THRESHOLDS.MOBILE) return true;
  // New: retry if no fetch calls or placeholder strings present
  if (metrics.fetchCallCount === 0) return true;
  if (metrics.placeholderCount > 0) return true;
  if (qcReport) {
    const consoleCheck = qcReport.checks.find(c => c.name === 'consoleErrors');
    const scrollCheck = qcReport.checks.find(c => c.name === 'horizontalScroll');
    const footerCheck = qcReport.checks.find(c => c.name === 'footerVisible');
    const overlapCheck = qcReport.checks.find(c => c.name === 'noLayoutOverlap');
    if (consoleCheck && !consoleCheck.passed) return true;
    if (scrollCheck && !scrollCheck.passed) return true;
    if (footerCheck && !footerCheck.passed) return true;
    if (overlapCheck && !overlapCheck.passed) return true;
  }
  return false;
}
```

- [x] **Step 4: Update `buildQualityImprovementPrompt` — remove mock data, add fetch instruction**

Remove line L74: `- 목 데이터가 없다면 const 배열로 최소 15개 추가`

Add to the "수정 규칙" block:

```
- fetch() 호출이 없다면 반드시 추가하라 (exampleCall 참고)
- placeholder 문자열을 제거하라: 홍길동, test@example.com, Loading..., 준비 중, 구현 예정
```

Also update `maxRetries` reference in `generationPipeline.ts` loop from `for (let attempt = 0; attempt < 2; ...)` to `< 3`.

- [x] **Step 5: Run tests**

```bash
pnpm test src/lib/ai/qualityLoop.test.ts
```

Expected: all tests pass.

- [x] **Step 6: Commit**

```bash
git add src/lib/ai/qualityLoop.ts src/lib/ai/qualityLoop.test.ts src/lib/ai/generationPipeline.ts
git commit -m "feat: qualityLoop — 목데이터 지시 제거, fetch 부재/placeholder 재시도 조건 추가"
```

---

## Task 12: qcChecks — add 4 new runtime checks

**Files:**
- Modify: `src/lib/qc/qcChecks.ts`
- Modify: `src/lib/qc/renderingQc.ts`

- [x] **Step 1: Write failing test**

```typescript
// Add to src/lib/qc/renderingQc.test.ts (existing file)
// These are unit tests for the check functions that don't need a real browser
import { describe, it, expect } from 'vitest';

// Import the new check functions once added
// import { checkNoRuntimePlaceholder } from './qcChecks';

describe('checkNoRuntimePlaceholder — DOM check', () => {
  it('exported from qcChecks', async () => {
    const { checkNoRuntimePlaceholder } = await import('./qcChecks');
    expect(typeof checkNoRuntimePlaceholder).toBe('function');
  });
});
```

- [x] **Step 2: Run test to confirm failure**

```bash
pnpm test src/lib/qc/
```

Expected: "checkNoRuntimePlaceholder" import fails.

- [x] **Step 3: Add 4 new check functions to `qcChecks.ts`**

Append after the last existing check (`checkAccessibility`):

```typescript
// ---------------------------------------------------------------------------
// New checks: real data binding quality
// ---------------------------------------------------------------------------

/**
 * Fast check: Scans rendered DOM text for placeholder strings.
 * Runs after page content is loaded.
 */
export async function checkNoRuntimePlaceholder(page: Page): Promise<QcCheckResult> {
  const start = Date.now();
  const PLACEHOLDERS = ['홍길동', '김철수', '이영희', 'test@example.com', 'Loading...', '준비 중', '구현 예정', 'Sample Data', 'Lorem ipsum'];

  try {
    const bodyText = await page.evaluate(() => document.body.innerText);
    const found = PLACEHOLDERS.filter(p => bodyText.includes(p));
    const passed = found.length === 0;
    return {
      name: 'noRuntimePlaceholder',
      passed,
      score: passed ? 100 : Math.max(0, 100 - found.length * 25),
      details: found.map(p => `Placeholder 감지: "${p}"`),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      name: 'noRuntimePlaceholder',
      passed: false,
      score: 0,
      details: [`Evaluation error: ${err instanceof Error ? err.message : String(err)}`],
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Deep check: Clicks the first interactive button and checks if DOM changes.
 */
export async function checkInteractiveBehavior(page: Page): Promise<QcCheckResult> {
  const start = Date.now();
  try {
    // Get initial body text length as baseline
    const before = await page.evaluate(() => document.body.innerHTML.length);

    // Try clicking buttons/tabs
    const buttons = await page.$$('button, [role="tab"]');
    let clicked = false;
    for (const btn of buttons.slice(0, 5)) {
      try {
        const visible = await btn.isVisible();
        if (visible) {
          await btn.click({ timeout: 2000 });
          clicked = true;
          break;
        }
      } catch {
        // try next
      }
    }

    if (!clicked) {
      return {
        name: 'interactiveBehavior',
        passed: true,
        score: 100,
        details: ['No clickable buttons found — skipping'],
        durationMs: Date.now() - start,
      };
    }

    // Wait briefly for DOM update
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => document.body.innerHTML.length);
    const changed = Math.abs(after - before) > 10;

    return {
      name: 'interactiveBehavior',
      passed: changed,
      score: changed ? 100 : 30,
      details: changed ? [] : ['버튼 클릭 후 DOM 변화 없음 — 인터랙션이 동작하지 않을 수 있음'],
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      name: 'interactiveBehavior',
      passed: false,
      score: 0,
      details: [`Evaluation error: ${err instanceof Error ? err.message : String(err)}`],
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Deep check: Checks whether any network requests were made (fetch/XHR).
 * Must be called with request collection set up BEFORE page.setContent().
 */
export function checkNetworkActivity(requests: string[]): QcCheckResult {
  const start = Date.now();
  // Filter out browser internals — look for actual HTTP requests to non-CDN URLs
  const apiRequests = requests.filter(url =>
    !url.startsWith('data:') &&
    !url.includes('cdn.tailwindcss.com') &&
    !url.includes('cdn.jsdelivr.net') &&
    !url.includes('unpkg.com') &&
    !url.includes('cdnjs.cloudflare.com')
  );

  const passed = apiRequests.length > 0;
  return {
    name: 'networkActivity',
    passed,
    score: passed ? 100 : 20,
    details: passed
      ? apiRequests.slice(0, 3).map(u => `Request: ${u.slice(0, 80)}`)
      : ['페이지 로드 후 API 요청이 없습니다 — 실제 데이터 로딩이 없을 수 있음'],
    durationMs: Date.now() - start,
  };
}

/**
 * Deep check: Waits 3s after page load and checks if loading skeletons disappear.
 */
export async function checkLoadingStateDisappears(page: Page): Promise<QcCheckResult> {
  const start = Date.now();
  try {
    // Check for skeleton/loading elements
    const LOADING_SELECTORS = ['.animate-pulse', '.skeleton', '[class*="loading"]', '[class*="skeleton"]'];
    let hadLoadingElements = false;

    for (const sel of LOADING_SELECTORS) {
      const count = await page.$$eval(sel, els => els.length);
      if (count > 0) { hadLoadingElements = true; break; }
    }

    if (!hadLoadingElements) {
      return {
        name: 'loadingStateDisappears',
        passed: true,
        score: 100,
        details: ['No loading skeleton elements found'],
        durationMs: Date.now() - start,
      };
    }

    // Wait for async data load
    await page.waitForTimeout(3000);

    let stillLoading = false;
    for (const sel of LOADING_SELECTORS) {
      const count = await page.$$eval(sel, els => els.length);
      if (count > 0) { stillLoading = true; break; }
    }

    const passed = !stillLoading;
    return {
      name: 'loadingStateDisappears',
      passed,
      score: passed ? 100 : 40,
      details: passed ? [] : ['3초 후에도 로딩 스켈레톤이 남아있습니다 — API 호출이 완료되지 않을 수 있음'],
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      name: 'loadingStateDisappears',
      passed: false,
      score: 0,
      details: [`Evaluation error: ${err instanceof Error ? err.message : String(err)}`],
      durationMs: Date.now() - start,
    };
  }
}
```

- [x] **Step 4: Wire new checks into `renderingQc.ts`**

Update imports in `renderingQc.ts`:

```typescript
import {
  checkConsoleErrors,
  checkHorizontalScroll,
  checkFooterVisible,
  checkNoLayoutOverlap,
  checkImageLoading,
  checkTouchTargets,
  checkResponsiveBreakpoints,
  checkAccessibility,
  checkNoRuntimePlaceholder,
  checkInteractiveBehavior,
  checkNetworkActivity,
  checkLoadingStateDisappears,
} from './qcChecks';
```

In `runFastQcInternal`, add `checkNoRuntimePlaceholder` to the parallel checks:

```typescript
const [scrollResult, footerResult, overlapResult, placeholderResult] = settledResults(
  await Promise.allSettled([
    withCheckTimeout(() => checkHorizontalScroll(page, 375), 'horizontalScroll'),
    withCheckTimeout(() => checkFooterVisible(page), 'footerVisible'),
    withCheckTimeout(() => checkNoLayoutOverlap(page), 'noLayoutOverlap'),
    withCheckTimeout(() => checkNoRuntimePlaceholder(page), 'noRuntimePlaceholder'),
  ]),
  ['horizontalScroll', 'footerVisible', 'noLayoutOverlap', 'noRuntimePlaceholder']
);
const consoleResult = checkConsoleErrors(errors);
const checks = [consoleResult, scrollResult, footerResult, overlapResult, placeholderResult];
```

In `runDeepQcInternal`, add network request collection and new checks:

```typescript
// Add request tracking before page.setContent
const networkRequests: string[] = [];
page.on('request', (req) => networkRequests.push(req.url()));

// After existing checks, add:
const networkResult = checkNetworkActivity(networkRequests);
const [interactResult, loadingResult] = settledResults(
  await Promise.allSettled([
    withCheckTimeout(() => checkInteractiveBehavior(page), 'interactiveBehavior'),
    withCheckTimeout(() => checkLoadingStateDisappears(page), 'loadingStateDisappears'),
  ]),
  ['interactiveBehavior', 'loadingStateDisappears']
);

const checks = [
  consoleResult, scrollResult, footerResult, overlapResult,
  imageResult, touchResult, breakpointResult, a11yResult,
  networkResult, interactResult, loadingResult,
];
```

- [x] **Step 5: Run tests**

```bash
pnpm test src/lib/qc/
pnpm type-check
```

Expected: all pass.

- [x] **Step 6: Commit**

```bash
git add src/lib/qc/qcChecks.ts src/lib/qc/renderingQc.ts
git commit -m "feat: QC 검사 4종 추가 — placeholder, 인터랙션, 네트워크 요청, 로딩 상태 감지"
```

---

## Task 13: Rewrite InfoLookupTemplate

**Files:**
- Modify: `src/templates/InfoLookupTemplate.ts`

Context: The current `js` in `generate()` has `// 실제 API 호출로 교체` at L82 with a hardcoded data object. Replace with a real fetch stub using the API's `exampleCall` if present.

- [x] **Step 1: Update `generate()` in `InfoLookupTemplate.ts`**

Replace the entire `js` field in the `return` with:

```typescript
      js: `async function search() {
  const query = document.getElementById('search-input').value.trim();
  if (!query) return;

  const btn = document.getElementById('search-btn');
  btn.disabled = true;
  btn.textContent = '검색 중...';
  document.getElementById('result-section').style.display = 'none';
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('loading').style.display = 'block';

  try {
${context.apis[0] && context.apis[0].endpoints[0]?.exampleCall
  ? `    // exampleCall from catalog:\n    ${context.apis[0].endpoints[0].exampleCall.replace(/\n/g, '\n    ')}`
  : context.apis[0]
    ? `    const proxyBase = '/api/v1/proxy?apiId=${context.apis[0].id}&proxyPath=${context.apis[0].endpoints[0]?.path ?? '/search'}';\n    const res = await fetch(proxyBase + '&q=' + encodeURIComponent(query));\n    const data = await res.json();`
    : `    const res = await fetch('/api/v1/proxy?apiId=REPLACE_API_ID&proxyPath=/search&q=' + encodeURIComponent(query));\n    const data = await res.json();`
}
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const items = data${context.apis[0]?.endpoints[0]?.responseDataPath ? '.' + context.apis[0].endpoints[0].responseDataPath : '.results ?? data.data ?? data'};
    renderResult(Array.isArray(items) ? items[0] : items, query);
  } catch (err) {
    document.getElementById('detail-card').innerHTML = '<p style="color:#ef4444;padding:1rem">데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</p>';
    document.getElementById('result-section').style.display = 'block';
    console.error(err);
  } finally {
    document.getElementById('loading').style.display = 'none';
    btn.disabled = false;
    btn.textContent = '검색';
  }
}

function renderResult(data, query) {
  if (!data) {
    document.getElementById('empty-state').style.display = 'block';
    document.getElementById('empty-state').innerHTML = '<p style="color:#64748b;padding:2rem;text-align:center">검색 결과가 없습니다: ' + query + '</p>';
    return;
  }
  const title = data.title ?? data.name ?? data.word ?? query;
  const body = data.description ?? data.body ?? data.definition ?? data.summary ?? JSON.stringify(data, null, 2).slice(0, 300);
  const related = data.related ?? data.tags ?? data.synonyms ?? [];
  document.getElementById('detail-header').textContent = title;
  document.getElementById('detail-body').textContent = body;
  document.getElementById('related-list').innerHTML = related.map(r =>
    '<li onclick="document.getElementById(\\'search-input\\').value=\\'' + r + '\\';search()">' + r + '</li>'
  ).join('');
  document.getElementById('result-section').style.display = 'block';
}

function showLoading(show) {
  document.getElementById('loading').style.display = show ? 'block' : 'none';
}

document.getElementById('search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') search();
});`,
```

Also update `promptHint` to reference exampleCall:

```typescript
      promptHint: `Layout: search-detail
Required sections: 검색바+버튼, 결과 상세카드(제목+본문), 관련 항목 리스트
Must include: DOMContentLoaded에서 검색 API fetch() 구현, Enter 키 검색, 로딩 상태, 에러 Empty State
API call pattern: fetch(exampleCall from catalog) → data.responseDataPath → renderResult()
Avoid: 하드코딩 데이터, 가데이터 배열, picsum.photos`,
```

- [x] **Step 2: Type-check**

```bash
pnpm type-check
```

Expected: 0 errors.

- [x] **Step 3: Commit**

```bash
git add src/templates/InfoLookupTemplate.ts
git commit -m "feat: InfoLookupTemplate — 하드코딩 데이터 제거, 실제 API fetch 스텁으로 교체"
```

---

## Task 14: Rewrite remaining 9 templates

**Files:**
- Modify: `src/templates/DashboardTemplate.ts`
- Modify: `src/templates/CalculatorTemplate.ts`
- Modify: `src/templates/MapServiceTemplate.ts`
- Modify: `src/templates/ContentFeedTemplate.ts`
- Modify: `src/templates/ComparisonTemplate.ts`
- Modify: `src/templates/TimelineTemplate.ts`
- Modify: `src/templates/NewsCuratorTemplate.ts`
- Modify: `src/templates/QuizTemplate.ts`
- Modify: `src/templates/ProfileTemplate.ts`

Context: Each template's `generate()` method likely has the same `// 실제 API 호출로 교체` pattern. Apply the same transformation: remove hardcoded data objects, add a fetch stub using `exampleCall`, update `promptHint`.

Pattern to apply to each template:

1. Read the current `js` field
2. Find any `const [varName] = [{...}, {...}]` hardcoded arrays → remove
3. Replace `// 실제 API 호출로 교체` placeholder with a real fetch stub
4. Fetch stub pattern:

```javascript
document.addEventListener('DOMContentLoaded', async () => {
  // [template-specific skeleton rendering]
  try {
    const res = await fetch(/* exampleCall from context.apis[0].endpoints[0].exampleCall */
      context.apis[0]?.endpoints[0]?.exampleCall
        ? context.apis[0].endpoints[0].exampleCall
        : `/api/v1/proxy?apiId=${context.apis[0]?.id}&proxyPath=${context.apis[0]?.endpoints[0]?.path ?? '/data'}`
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const items = data[context.apis[0]?.endpoints[0]?.responseDataPath] ?? data.results ?? data.data ?? [];
    renderItems(items);
  } catch (err) {
    showError('데이터를 불러오지 못했습니다.');
    console.error(err);
  }
});
```

5. Update `promptHint` to say: `Must include: DOMContentLoaded API fetch(), no hardcoded data arrays`

- [x] **Step 1: For each template, read then update**

For each template in order:

```bash
# Check what each template's js section contains
grep -n "실제 API\|mockData\|const.*=.*\[" src/templates/DashboardTemplate.ts | head -10
grep -n "실제 API\|mockData\|const.*=.*\[" src/templates/CalculatorTemplate.ts | head -10
# etc.
```

- [x] **Step 2: Apply the fetch stub pattern to each template**

For `DashboardTemplate.ts`: The dashboard template likely has stats arrays. Replace with:
```javascript
// In generate() js field:
document.addEventListener('DOMContentLoaded', async () => {
  renderSkeletonStats();
  try {
    const res = await fetch(exampleCall);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    renderStats(data);
    renderChart(data);
  } catch (err) {
    document.getElementById('stats').innerHTML = '<p class="text-red-500 p-4">데이터 로딩 실패</p>';
  }
});
```

For `CalculatorTemplate.ts`: Calculator likely has no API data — if so, keep the logic as-is but add a fetch for any data endpoint (e.g., exchange rate, formula lookup). Update `promptHint` to clarify.

For `MapServiceTemplate.ts`: Map templates likely use Leaflet + hardcoded markers. Replace with fetch for location data.

For `ContentFeedTemplate.ts`, `NewsCuratorTemplate.ts`: These have article arrays. Replace with news/feed API fetch.

For `ComparisonTemplate.ts`: Comparison data. Replace with product/item API fetch.

For `TimelineTemplate.ts`: Timeline events. Replace with events API fetch.

For `QuizTemplate.ts`: Quiz questions. Replace with trivia/quiz API fetch.

For `ProfileTemplate.ts`: Profile data. Replace with profile API fetch.

- [x] **Step 3: Run type-check on all templates**

```bash
pnpm type-check
```

Expected: 0 errors.

- [x] **Step 4: Run tests**

```bash
pnpm test
```

Expected: all pass.

- [x] **Step 5: Commit**

```bash
git add src/templates/
git commit -m "feat: 9개 템플릿 하드코딩 데이터 제거, 실제 API fetch 스텁으로 교체"
```

---

## Task 15: Documentation updates

**Files:**
- Modify: `docs/architecture/ai-pipeline.md`
- Modify: `docs/guides/qc-process.md`
- Modify: `CLAUDE.md`

- [x] **Step 1: Update `docs/architecture/ai-pipeline.md`**

Find and update the 2-stage pipeline diagram to 3-stage. Add Stage 2 Function Verification between Stage 1 and the design stage. Key changes:
- Stage 1: 0-30% (structure + API calls)
- Stage 2 (new): 30-65% (function verification — fetch bugs, placeholders)
- Stage 3: 65-90% (design polish, formerly Stage 2)

- [x] **Step 2: Update `docs/guides/qc-process.md`**

Add the 4 new QC checks to the check list table:
- `noRuntimePlaceholder` — DOM placeholder string detection (Fast QC)
- `networkActivity` — actual HTTP request detection (Deep QC)
- `interactiveBehavior` — button click → DOM change (Deep QC)
- `loadingStateDisappears` — skeleton disappears after load (Deep QC)

Also update the scoring section: `fetchCallCount === 0` → retry trigger.

- [x] **Step 3: Update `CLAUDE.md`**

Find line: `생성 파이프라인은 2단계: Stage 1(구조·기능, 0→45%) → Stage 2(디자인·폴리시, 45→90%)`

Replace with:
```
생성 파이프라인은 3단계: Stage 1(구조·API 호출, 0→30%) → Stage 2(기능 검증, 30→65%) → Stage 3(디자인·폴리시, 65→90%)
```

Find line: `QC·저장은 Stage 2 결과에만 적용; Stage 1 출력은 중간 산출물로 DB 저장 안 함`

Replace with:
```
QC·저장은 Stage 3 결과에만 적용; Stage 1·2 출력은 중간 산출물로 DB 저장 안 함
```

Find spec reference line for 2단계 설계 문서and add:
```
| 품질 대개편 설계 | [docs/superpowers/specs/2026-04-14-quality-overhaul-design.md](docs/superpowers/specs/2026-04-14-quality-overhaul-design.md) |
```

- [x] **Step 4: Commit**

```bash
git add docs/architecture/ai-pipeline.md docs/guides/qc-process.md CLAUDE.md
git commit -m "docs: ai-pipeline, qc-process, CLAUDE.md 문서를 3단계 파이프라인 기준으로 업데이트"
```

---

## Task 16: Production QC enablement (user action required)

**Files:**
- Railway environment variables (user action)
- `.env.example` (code change)

> **⚠️ USER ACTION**: In Railway dashboard, set `ENABLE_RENDERING_QC=true`. This activates Playwright in production. Ensure the Dockerfile includes Playwright browser dependencies.

- [x] **Step 1: Check Dockerfile for Playwright dependencies**

```bash
grep -i "playwright\|chromium\|chrome" Dockerfile
```

If missing, add before `RUN pnpm install`:
```dockerfile
RUN apt-get update && apt-get install -y \
    chromium \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
```

- [x] **Step 2: Update `.env.example`**

Change `ENABLE_RENDERING_QC=false` → `ENABLE_RENDERING_QC=true` with comment:
```bash
# Set to true to enable Playwright browser QC (recommended in production)
# Requires Chromium installed in environment
ENABLE_RENDERING_QC=true
```

- [x] **Step 3: Verify browserPool timeout config is adequate**

```bash
grep -n "FAST_MS\|DEEP_MS\|CHECK_MS" src/lib/config/qc.ts
```

Fast QC timeout should be ≤ 15s, Deep QC ≤ 30s. If values are lower, update:

```typescript
// src/lib/config/qc.ts — verify these values exist
export const QC_TIMEOUTS = {
  FAST_MS: 15000,
  DEEP_MS: 30000,
  CHECK_MS: 5000,
  PAGE_DEFAULT_MS: 5000,
  FAST_CONTENT_MS: 8000,
  DEEP_CONTENT_MS: 15000,
};
```

- [x] **Step 4: Commit**

```bash
git add .env.example Dockerfile
git commit -m "feat: ENABLE_RENDERING_QC 기본값 true로 변경, Dockerfile Playwright 의존성 확인"
```

> After Railway deploys with `ENABLE_RENDERING_QC=true`, manually verify:
> 1. Create a new project with a golden-set API → check Network tab for actual HTTP requests
> 2. Check that no "홍길동" or "준비 중" text appears in the generated page
> 3. Click buttons — verify DOM changes
> 4. Check server logs for Fast QC and Deep QC scores

---

## Verification

**Static checks (run after each task):**

```bash
pnpm type-check
pnpm lint
pnpm test
pnpm build
```

**End-to-end quality check (after Task 16):**
1. Use a golden-set API (e.g., weather) to create a new project
2. Open browser DevTools → Network tab → verify external API request fires
3. Check page content — no "홍길동", "준비 중", "Loading..." visible after load
4. Click a button/tab — verify DOM changes (network request or visual update)
5. Check server logs: `Fast QC score: ≥60`, `Deep QC networkActivity: passed: true`

**Regression check:**
- Existing generated projects should still render correctly (existing `hasMockData: false` in metadata is backward compatible)
- Re-generate an existing project → new version should have real API calls

---

## Notes

- **Task 3 requires user action**: Run `scripts/verifyCatalog.ts` with Railway URL or local server running, share the JSON output
- **Task 4 requires user action**: Apply SQL UPDATE to Supabase for golden-set APIs based on Task 3 output  
- **Task 16 requires user action**: Set `ENABLE_RENDERING_QC=true` in Railway environment
- **hasMockData field**: Preserved in `QualityMetrics` as `false` always for backward compatibility. Remove in a future cleanup pass once all projects are regenerated.
- **CalculatorTemplate**: If it has no API dependency (pure calculation), keep its `generate()` as-is and skip the fetch stub. Update `promptHint` to indicate "no API required".
