import dns from 'dns/promises';
import { createServiceClient } from '@/lib/supabase/server';
import { getDbProvider } from '@/lib/config/providers';
import { createCatalogRepository } from '@/repositories/factory';
import { decryptApiKey } from '@/lib/encryption';
import { getAuthUser } from '@/lib/auth/index';
import { LRUMap } from '@/lib/utils/lruMap';
import {
  RATE_LIMIT_PER_MIN,
  RATE_LIMIT_WINDOW_MS,
  MAX_CONCURRENT_RATE_LIMIT_USERS,
} from '@/lib/config/rateLimit';

// 인메모리 Rate Limit: 사용자당 분당 RATE_LIMIT_PER_MIN회 (기본 60회)
// LRUMap으로 활성 사용자 MAX_CONCURRENT_RATE_LIMIT_USERS 초과 시 가장 오래된
// 항목 자동 evict (Railway 단일 인스턴스 메모리 누적 방지).
const proxyRateLimit = new LRUMap<string, { count: number; resetAt: number }>(MAX_CONCURRENT_RATE_LIMIT_USERS);

function checkProxyRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = proxyRateLimit.get(userId);
  if (!entry || now >= entry.resetAt) {
    proxyRateLimit.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_PER_MIN) return false;
  entry.count++;
  return true;
}

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
  // URL 표준에서 IPv6는 대괄호로 감싸짐 (e.g. [fe80::1]) — 패턴 검사 전 제거
  const bare = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;
  return PRIVATE_IP_PATTERNS.some((p) => p.test(bare));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const runtime = 'nodejs';

export async function GET(request: Request): Promise<Response> {
  return handleProxy(request, 'GET');
}

export async function POST(request: Request): Promise<Response> {
  return handleProxy(request, 'POST');
}

interface ValidatedRequest {
  apiId: string;
  proxyPath: string;
  searchParams: URLSearchParams;
}

async function validateRequest(request: Request): Promise<ValidatedRequest | Response> {
  const user = await getAuthUser();
  if (!user) {
    return errorResponse(401, 'AUTH_REQUIRED', '로그인이 필요합니다.');
  }

  // user.id 가드 — 타입상 string(non-nullable)이지만 런타임에서 인증 정보 손상 시
  // null/undefined가 들어올 수 있다. rate limit Map에 잘못된 키('null', 'undefined')가
  // 등록되거나 RLS 우회 시도가 가능해지므로 401로 즉시 차단.
  if (!user.id || typeof user.id !== 'string') {
    return errorResponse(401, 'AUTH_REQUIRED', '로그인이 필요합니다.');
  }

  if (!checkProxyRateLimit(user.id)) {
    return errorResponse(429, 'RATE_LIMITED', '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
  }

  const { searchParams } = new URL(request.url);
  const apiId = searchParams.get('apiId');
  const proxyPath = searchParams.get('proxyPath');

  if (!apiId || !proxyPath) {
    return error400('apiId와 proxyPath가 필요합니다.');
  }
  if (!UUID_RE.test(apiId)) {
    return error400('유효하지 않은 API ID입니다.');
  }
  if (proxyPath.includes('..') || /\/\//.test(proxyPath)) {
    return error400('유효하지 않은 경로입니다.');
  }

  return { apiId, proxyPath, searchParams };
}

interface UpstreamSuccess {
  upstream: globalThis.Response;
  error: null;
}
interface UpstreamError {
  upstream: null;
  error: Response;
}
type UpstreamResult = UpstreamSuccess | UpstreamError;

async function fetchUpstream(
  targetUrl: URL,
  method: 'GET' | 'POST',
  headers: Record<string, string>,
  request: Request,
): Promise<UpstreamResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  try {
    const upstream = await fetch(targetUrl.toString(), {
      method,
      headers,
      redirect: 'error', // Prevent SSRF via open redirects
      signal: controller.signal,
      ...(method === 'POST'
        ? {
            body: await request.text(),
            headers: { ...headers, 'Content-Type': 'application/json' },
          }
        : {}),
    });
    return { upstream, error: null };
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      return { upstream: null, error: error502('외부 API 응답 시간이 초과되었습니다 (30초).') };
    }
    return { upstream: null, error: error502('외부 API 서버에 연결할 수 없습니다.') };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function buildSafeTargetUrl(
  api: { baseUrl: string },
  proxyPath: string,
): Promise<URL | Response> {
  let targetUrl: URL;
  try {
    const path = proxyPath.startsWith('/') ? proxyPath : `/${proxyPath}`;
    targetUrl = new URL(path, api.baseUrl);
  } catch {
    return error400('유효하지 않은 경로입니다.');
  }

  const allowedHost = new URL(api.baseUrl).hostname;
  if (targetUrl.hostname !== allowedHost || isPrivateHost(targetUrl.hostname)) {
    return errorResponse(403, 'FORBIDDEN', '허용되지 않은 대상입니다.');
  }

  try {
    const { address: resolvedIp } = await dns.lookup(allowedHost, { verbatim: false });
    if (isPrivateHost(resolvedIp)) {
      return errorResponse(403, 'FORBIDDEN', '허용되지 않은 대상입니다.');
    }
  } catch {
    return errorResponse(403, 'FORBIDDEN', '허용되지 않은 대상입니다.');
  }

  return targetUrl;
}

async function resolveApiKey(
  apiId: string,
  cfg: { param_name?: string; param_in?: string; env_var?: string },
  supabase: Awaited<ReturnType<typeof createServiceClient>> | undefined,
  searchParams: URLSearchParams,
  headers: Record<string, string>,
  targetUrl: URL,
): Promise<void> {
  let resolvedKey: string | undefined;

  // 1) 프로젝트 오너의 개인 API 키 조회 (projectId가 있을 때, Supabase 모드만)
  const projectId = searchParams.get('projectId');
  if (supabase && projectId && UUID_RE.test(projectId)) {
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

function resolveContentType(rawContentType: string): string {
  const isTextType = /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded))/.test(rawContentType);
  return isTextType && !rawContentType.toLowerCase().includes('charset')
    ? `${rawContentType}; charset=utf-8`
    : rawContentType;
}

async function handleProxy(request: Request, method: 'GET' | 'POST'): Promise<Response> {
  // 인증·레이트리밋·파라미터 검증
  const validated = await validateRequest(request);
  if (validated instanceof Response) return validated;
  const { apiId, proxyPath, searchParams } = validated;

  // Look up API using service role (bypasses RLS — read-only, catalog is semi-public)
  const supabase = getDbProvider() === 'supabase' ? await createServiceClient() : undefined;
  const catalogRepo = createCatalogRepository(supabase);

  let api;
  try {
    api = await catalogRepo.findById(apiId);
  } catch {
    return error502('API 정보를 조회할 수 없습니다.');
  }

  if (!api || !api.isActive) {
    return error404('API를 찾을 수 없습니다.');
  }

  // Build target URL — only allow the registered base URL (SSRF + DNS rebinding prevention)
  const urlOrError = await buildSafeTargetUrl(api, proxyPath);
  if (urlOrError instanceof Response) return urlOrError;
  const targetUrl = urlOrError;

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
    await resolveApiKey(apiId, cfg, supabase, searchParams, headers, targetUrl);
  }

  // Forward the request
  const { upstream, error: fetchError } = await fetchUpstream(targetUrl, method, headers, request);
  if (fetchError) return fetchError;

  const rawContentType = upstream.headers.get('content-type') ?? 'application/json';
  const body = await upstream.text();

  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': resolveContentType(rawContentType),
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
