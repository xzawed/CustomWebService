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
    // @ts-ignore
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
