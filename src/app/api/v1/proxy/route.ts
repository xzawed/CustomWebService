import dns from 'dns/promises';
import {
  createCatalogRepository,
  createProjectRepository,
  createUserApiKeyRepository,
} from '@/repositories/factory';
import { decryptApiKey } from '@/lib/encryption';
import { getAuthUser } from '@/lib/auth/index';
import { getClientIp } from '@/lib/auth/rateLimit';
import { resolveProxyContext, isProxyContextError } from '@/lib/proxy/resolveProxyContext';
import { checkSiteRateLimit } from '@/lib/proxy/siteRateLimit';
import { proxyCache, buildCacheKey } from '@/lib/cache/proxyCache';
import {
  RATE_LIMIT_PER_MIN,
  RATE_LIMIT_WINDOW_MS,
  MAX_CONCURRENT_RATE_LIMIT_USERS,
} from '@/lib/config/rateLimit';

// 인메모리 Rate Limit: 사용자당 분당 RATE_LIMIT_PER_MIN회 (기본 60회).
//
// LRUMap을 쓰지 않는다 — 활성 사용자 수가 상한을 넘으면 **살아 있는 윈도의 카운터가
// evict되어** 그 사용자의 다음 요청이 count:1로 다시 시작한다. 즉 동시 사용자가 많을수록
// 한도가 무력화된다. 만료 버킷만 정리하고, 자리가 없으면 새 키를 거부(=차단)한다.
// site 리미터(src/lib/proxy/siteRateLimit.ts)와 동일한 원칙.
const proxyRateLimit = new Map<string, { count: number; resetAt: number }>();

function checkProxyRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = proxyRateLimit.get(userId);
  if (entry && now < entry.resetAt) {
    if (entry.count >= RATE_LIMIT_PER_MIN) return false;
    entry.count++;
    return true;
  }

  if (!entry && proxyRateLimit.size >= MAX_CONCURRENT_RATE_LIMIT_USERS) {
    for (const [key, bucket] of proxyRateLimit) {
      if (now >= bucket.resetAt) proxyRateLimit.delete(key);
    }
    // 만료분을 정리해도 자리가 없으면 활성 카운터를 버리는 대신 차단한다.
    if (proxyRateLimit.size >= MAX_CONCURRENT_RATE_LIMIT_USERS) return false;
  }

  proxyRateLimit.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
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
  let bare = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname;

  // IPv4-mapped IPv6(::ffff:127.0.0.1, ::ffff:169.254.169.254)를 IPv4로 정규화한다.
  // 정규화 없이는 IPv4 패턴에도 IPv6 패턴에도 걸리지 않아 사설/메타데이터 주소가 통과한다.
  // Node의 dns.lookup이 매핑 형식을 돌려줄 수 있으므로 실제 도달 가능한 우회 경로다.
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(bare);
  if (mapped) bare = mapped[1];
  // 16진 표기(::ffff:7f00:1)도 동일하게 취급 — 매핑 대역 자체를 차단한다.
  if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/i.test(bare)) return true;

  if (BLOCKED_HOSTS.has(bare)) return true;
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

/**
 * 파라미터 형식만 검증한다.
 * 인증·인가는 resolveProxyContext가, 레이트리밋은 모드 판정 후 handleProxy가 담당한다.
 */
function validateParams(request: Request): ValidatedRequest | Response {
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
  const allowedHost = new URL(api.baseUrl).hostname;

  let targetUrl: URL;
  try {
    const path = proxyPath.startsWith('/') ? proxyPath : `/${proxyPath}`;
    targetUrl = new URL(path, api.baseUrl);
  } catch {
    return error400('유효하지 않은 경로입니다.');
  }

  // Enforce same host as registered base URL and block private networks
  if (targetUrl.hostname !== allowedHost || isPrivateHost(targetUrl.hostname)) {
    return errorResponse(403, 'FORBIDDEN', '허용되지 않은 대상입니다.');
  }

  // DNS rebinding defense: resolve hostname and verify the resolved IP is not private.
  // Prevents an attacker from registering a public hostname that later DNS-rebinds to
  // an internal address (e.g. 169.254.169.254 AWS metadata service).
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
  cfg: {
    param_name?: string;
    param_in?: string;
    env_var?: string;
    prefix?: string;
    header_prefix?: string;
  },
  keyOwnerId: string | null,
  headers: Record<string, string>,
  targetUrl: URL,
): Promise<{ usedPersonalKey: boolean }> {
  let resolvedKey: string | undefined;
  let usedPersonalKey = false;

  // 1) 키 소유자의 개인 API 키 조회.
  //    소유자는 resolveProxyContext가 결정한다 — site 모드는 Host로 확정된 게시
  //    프로젝트의 오너, app 모드는 소유권이 검증된 호출자 본인. 이전에는 클라이언트가
  //    보낸 projectId로 아무 사용자의 키나 복호화할 수 있었다(H-1).
  if (keyOwnerId) {
    try {
      const userKey = await createUserApiKeyRepository().findByUserAndApi(keyOwnerId, apiId);
      if (userKey?.encryptedKey) {
        try {
          resolvedKey = decryptApiKey(userKey.encryptedKey);
          usedPersonalKey = true;
        } catch { /* skip */ }
      }
    } catch { /* 조회 실패 시 플랫폼 키로 폴백 */ }
  }

  // 2) 플랫폼 공용 키 (환경변수) — 플랫폼 핵심 시크릿은 접근 차단
  if (!resolvedKey && cfg.env_var) {
    const SENSITIVE_ENV_VARS = new Set([
      'ANTHROPIC_API_KEY', 'GITHUB_TOKEN', 'RAILWAY_TOKEN',
      'ADMIN_API_KEY', 'ENCRYPTION_KEY',
      'AUTH_SECRET', 'ADMIN_PASSWORD_HASH',
    ]);
    if (!SENSITIVE_ENV_VARS.has(cfg.env_var)) {
      resolvedKey = process.env[cfg.env_var];
    }
  }

  if (resolvedKey && cfg.param_name) {
    // 카탈로그 auth_config의 인증 스킴 prefix(카카오 "KakaoAK ", Unsplash "Client-ID ")를 적용한다.
    // keyCheck.resolvePrefix와 동일한 우선순위(prefix → header_prefix). 단일 소스 중복을 피하려
    // 인라인하되, env/사용자 키 값에 이미 prefix가 포함된 경우 이중 적용을 방지한다.
    const prefix = cfg.prefix ?? cfg.header_prefix ?? '';
    const injectedValue =
      prefix && !resolvedKey.startsWith(prefix) ? `${prefix}${resolvedKey}` : resolvedKey;
    if (cfg.param_in === 'header') {
      // 가능하면 헤더 주입을 선호한다 (URL에 키가 남지 않음).
      headers[cfg.param_name] = injectedValue;
    } else {
      // param_in='query': 업스트림 API가 쿼리 파라미터 인증만 지원하는 경우(예: 기상청/
      // OpenWeather의 serviceKey·appid). 이 경우 키가 요청 URL에 포함되어 업스트림 서버의
      // 액세스 로그에 남을 수 있다(쿼리 인증 API의 구조적 한계, 우리 측에서 제거 불가).
      // 우리 측 방어: 이 URL은 fetch에만 사용되고 로깅/에러 메시지/응답 헤더로 노출되지 않는다
      // (proxy 라우트에 targetUrl 로깅 없음 확인). 키는 복호화된 평문이므로 헤더 인증이
      // 가능한 카탈로그 항목은 param_in='header'로 등록하는 것을 권장한다.
      targetUrl.searchParams.set(cfg.param_name, injectedValue);
    }
  }

  return { usedPersonalKey };
}

function resolveContentType(rawContentType: string): string {
  const isTextType = /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded))/.test(rawContentType);
  return isTextType && !rawContentType.toLowerCase().includes('charset')
    ? `${rawContentType}; charset=utf-8`
    : rawContentType;
}

async function handleProxy(request: Request, method: 'GET' | 'POST'): Promise<Response> {
  const validated = validateParams(request);
  if (validated instanceof Response) return validated;
  const { apiId, proxyPath, searchParams } = validated;

  // 인가 판정 — site(익명·Host 바인딩) / app(세션·소유권 강제) 단일 진입점.
  const projectRepo = createProjectRepository();
  const ctx = await resolveProxyContext(request, apiId, {
    getAuthUser,
    findProjectBySlug: (slug) => projectRepo.findBySlug(slug),
    findProjectById: (id) => projectRepo.findById(id),
    getProjectApiIds: (id) => projectRepo.getProjectApiIds(id),
    rootDomain: process.env.NEXT_PUBLIC_ROOT_DOMAIN,
  });
  if (isProxyContextError(ctx)) {
    return errorResponse(ctx.error.status, ctx.error.code, ctx.error.message);
  }

  // 모드별 레이트리밋 — 익명 site는 IP+projectId, 세션 app은 기존 userId 버킷.
  if (ctx.mode === 'site') {
    const limit = checkSiteRateLimit(getClientIp(request), ctx.project.id);
    if (!limit.allowed) {
      return Response.json(
        {
          success: false,
          error: { code: 'RATE_LIMITED', message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
        },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } },
      );
    }
  } else if (!checkProxyRateLimit(ctx.user.id)) {
    return errorResponse(429, 'RATE_LIMITED', '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.');
  }

  // Look up API using service role (bypasses RLS — read-only, catalog is semi-public)
  const catalogRepo = createCatalogRepository();

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

  // Forward all query params except our own; track forwarded params for cache key
  const ownParams = new Set(['apiId', 'proxyPath', 'projectId']);
  const forwardedParams = new URLSearchParams();
  for (const [key, value] of searchParams.entries()) {
    if (!ownParams.has(key)) {
      targetUrl.searchParams.set(key, value);
      forwardedParams.set(key, value);
    }
  }

  // Inject API key — 키 소유자는 인가 컨텍스트가 결정한다(클라이언트 입력 아님).
  // 캐시 판정이 usedPersonalKey에 의존하므로 캐시 조회보다 먼저 수행한다.
  const headers: Record<string, string> = {
    'User-Agent': 'CustomWebService-Proxy/1.0',
    Accept: 'application/json',
  };

  let usedPersonalKey = false;
  if (api.authType === 'api_key') {
    const cfg = api.authConfig as {
      param_name?: string;
      param_in?: string;
      env_var?: string;
      prefix?: string;
      header_prefix?: string;
    };
    ({ usedPersonalKey } = await resolveApiKey(apiId, cfg, ctx.project?.userId ?? null, headers, targetUrl));
  }

  // Cache 사용 여부 — GET + cacheTtlSeconds 설정 + **개인 키 미사용**인 경우만.
  //
  // buildCacheKey는 apiId:proxyPath:params뿐이라 키 신원이 들어가지 않는다. 익명 사이트
  // 모드에서 오너의 개인 키로 받은 응답을 캐시하면 같은 항목이 다른 테넌트에게 서빙된다.
  // 캐시 키에 소유자를 넣는 대신 개인 키 경로는 캐시를 건너뛴다(가장 단순하고 안전).
  const cacheTtlMs =
    method === 'GET' && !usedPersonalKey && api.cacheTtlSeconds != null && api.cacheTtlSeconds > 0
      ? api.cacheTtlSeconds * 1000
      : null;

  if (cacheTtlMs !== null) {
    const cacheKey = buildCacheKey(apiId, proxyPath, forwardedParams);
    const cached = proxyCache.get(cacheKey);
    if (cached) {
      return new Response(cached.body, {
        status: cached.status,
        headers: {
          'Content-Type': cached.contentType,
          'Cache-Control': `public, max-age=${api.cacheTtlSeconds!}`,
          'X-Proxy-Api-Id': apiId,
          'X-Cache': 'HIT',
        },
      });
    }
  }

  // Forward the request
  const { upstream, error: fetchError } = await fetchUpstream(targetUrl, method, headers, request);
  if (fetchError) return fetchError;

  const rawContentType = upstream.headers.get('content-type') ?? 'application/json';
  const body = await upstream.text();
  const resolvedContentType = resolveContentType(rawContentType);

  // 2xx 응답만 캐시 저장 (오류 응답은 캐시하지 않음)
  if (cacheTtlMs !== null && upstream.status >= 200 && upstream.status < 300) {
    const cacheKey = buildCacheKey(apiId, proxyPath, forwardedParams);
    proxyCache.set(cacheKey, { body, contentType: resolvedContentType, status: upstream.status }, cacheTtlMs);
  }

  return new Response(body, {
    status: upstream.status,
    headers: {
      'Content-Type': resolvedContentType,
      'Cache-Control': cacheTtlMs !== null ? `public, max-age=${api.cacheTtlSeconds!}` : 'no-store',
      'X-Proxy-Api-Id': apiId,
      ...(cacheTtlMs !== null ? { 'X-Cache': 'MISS' } : {}),
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
