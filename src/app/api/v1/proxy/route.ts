import { createServiceClient } from '@/lib/supabase/server';
import { CatalogRepository } from '@/repositories/catalogRepository';

// Hosts that must never be proxied (SSRF prevention)
const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '169.254.169.254', // AWS metadata
  '100.100.100.200', // Alibaba metadata
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  return handleProxy(request, 'GET');
}

export async function POST(request: Request): Promise<Response> {
  return handleProxy(request, 'POST');
}

async function handleProxy(request: Request, method: 'GET' | 'POST'): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const apiId = searchParams.get('apiId');
  const proxyPath = searchParams.get('proxyPath');

  if (!apiId || !proxyPath) {
    return error400('apiId와 proxyPath가 필요합니다.');
  }

  if (!UUID_RE.test(apiId)) {
    return error400('유효하지 않은 API ID입니다.');
  }

  // Prevent path traversal
  if (proxyPath.includes('..') || /\/\//.test(proxyPath)) {
    return error400('유효하지 않은 경로입니다.');
  }

  // Look up API using service role (bypasses RLS — read-only, catalog is semi-public)
  const supabase = await createServiceClient();
  const catalogRepo = new CatalogRepository(supabase);

  let api;
  try {
    api = await catalogRepo.findById(apiId);
  } catch {
    return error502('API 정보를 조회할 수 없습니다.');
  }

  if (!api || !api.isActive) {
    return error404('API를 찾을 수 없습니다.');
  }

  // Build target URL — only allow the registered base URL (SSRF prevention)
  let targetUrl: URL;
  try {
    const path = proxyPath.startsWith('/') ? proxyPath : `/${proxyPath}`;
    targetUrl = new URL(path, api.baseUrl);
  } catch {
    return error400('유효하지 않은 경로입니다.');
  }

  // Enforce same host as registered base URL
  const allowedHost = new URL(api.baseUrl).hostname;
  if (targetUrl.hostname !== allowedHost || BLOCKED_HOSTS.has(targetUrl.hostname)) {
    return errorResponse(403, 'FORBIDDEN', '허용되지 않은 대상입니다.');
  }

  // Forward all query params except our own
  const ownParams = new Set(['apiId', 'proxyPath']);
  for (const [key, value] of searchParams.entries()) {
    if (!ownParams.has(key)) {
      targetUrl.searchParams.set(key, value);
    }
  }

  // Inject API key from environment variable
  const headers: Record<string, string> = {
    'User-Agent': 'CustomWebService-Proxy/1.0',
    Accept: 'application/json',
  };

  if (api.authType === 'api_key') {
    const cfg = api.authConfig as {
      param_name?: string;
      param_in?: string;
      env_var?: string;
    };
    const key = cfg.env_var ? process.env[cfg.env_var] : undefined;

    if (key && cfg.param_name) {
      if (cfg.param_in === 'header') {
        headers[cfg.param_name] = key;
      } else {
        // default: query parameter
        targetUrl.searchParams.set(cfg.param_name, key);
      }
    }
    // If no key is configured, forward anyway — the downstream API will return its own error
  }

  // Forward the request
  let upstream: globalThis.Response;
  try {
    upstream = await fetch(targetUrl.toString(), {
      method,
      headers,
      ...(method === 'POST'
        ? {
            body: await request.text(),
            headers: { ...headers, 'Content-Type': 'application/json' },
          }
        : {}),
    });
  } catch {
    return error502('외부 API 서버에 연결할 수 없습니다.');
  }

  const contentType = upstream.headers.get('content-type') ?? 'application/json';
  const body = await upstream.text();

  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      'X-Proxy-Api-Id': apiId,
    },
  });
}

function error400(message: string) {
  return errorResponse(400, 'INVALID_INPUT', message);
}

function error404(message: string) {
  return errorResponse(404, 'NOT_FOUND', message);
}

function error502(message: string) {
  return errorResponse(502, 'UPSTREAM_ERROR', message);
}

function errorResponse(status: number, code: string, message: string) {
  return Response.json({ success: false, error: { code, message } }, { status });
}
