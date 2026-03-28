import { createServiceClient } from '@/lib/supabase/server';
import { CatalogRepository } from '@/repositories/catalogRepository';
import { decryptApiKey } from '@/lib/encryption';

// Hosts/patterns that must never be proxied (SSRF prevention)
const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '::',
  '169.254.169.254', // AWS/GCP metadata
  '100.100.100.200', // Alibaba metadata
]);

// Private IP range regex patterns (RFC 1918 + loopback + link-local)
const PRIVATE_IP_PATTERNS = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,           // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/, // 172.16.0.0/12
  /^192\.168\.\d{1,3}\.\d{1,3}$/,               // 192.168.0.0/16
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,           // 127.0.0.0/8
  /^169\.254\.\d{1,3}\.\d{1,3}$/,               // 169.254.0.0/16 link-local
  /^0\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,             // 0.0.0.0/8
  /^(fc|fd)[0-9a-f]{2}:/i,                       // IPv6 ULA
  /^fe80:/i,                                      // IPv6 link-local
];

function isPrivateHost(hostname: string): boolean {
  if (BLOCKED_HOSTS.has(hostname)) return true;
  return PRIVATE_IP_PATTERNS.some((p) => p.test(hostname));
}

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

  // Enforce same host as registered base URL and block private networks
  const allowedHost = new URL(api.baseUrl).hostname;
  if (targetUrl.hostname !== allowedHost || isPrivateHost(targetUrl.hostname)) {
    return errorResponse(403, 'FORBIDDEN', '허용되지 않은 대상입니다.');
  }

  // Forward all query params except our own
  const ownParams = new Set(['apiId', 'proxyPath', 'projectId']);
  for (const [key, value] of searchParams.entries()) {
    if (!ownParams.has(key)) {
      targetUrl.searchParams.set(key, value);
    }
  }

  // Inject API key — 우선순위: 사용자 키 > 프로젝트 오너 키 > 플랫폼 키
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

    let resolvedKey: string | undefined;

    // 1) 프로젝트 오너의 개인 API 키 조회 (projectId가 있을 때)
    const projectId = searchParams.get('projectId');
    if (projectId && UUID_RE.test(projectId)) {
      try {
        const { data: project } = await supabase
          .from('projects')
          .select('user_id')
          .eq('id', projectId)
          .single();

        if (project?.user_id) {
          const { data: userKey } = await supabase
            .from('user_api_keys')
            .select('encrypted_key')
            .eq('user_id', project.user_id)
            .eq('api_id', apiId)
            .single();

          if (userKey?.encrypted_key) {
            try { resolvedKey = decryptApiKey(userKey.encrypted_key); } catch { /* skip */ }
          }
        }
      } catch { /* 조회 실패 시 플랫폼 키로 폴백 */ }
    }

    // 2) 플랫폼 공용 키 (환경변수)
    if (!resolvedKey && cfg.env_var) {
      resolvedKey = process.env[cfg.env_var];
    }

    if (resolvedKey && cfg.param_name) {
      if (cfg.param_in === 'header') {
        headers[cfg.param_name] = resolvedKey;
      } else {
        targetUrl.searchParams.set(cfg.param_name, resolvedKey);
      }
    }
  }

  // Forward the request
  let upstream: globalThis.Response;
  try {
    upstream = await fetch(targetUrl.toString(), {
      method,
      headers,
      redirect: 'error', // Prevent SSRF via open redirects
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
