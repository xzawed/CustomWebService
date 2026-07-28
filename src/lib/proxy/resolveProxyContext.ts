import type { Project } from '@/types/project';
import type { AuthUser } from '@/lib/auth/types';
import { isValidSlug } from '@/lib/utils/slugify';
import { assertOwner } from '@/lib/auth/authorize';

/**
 * 프록시 요청의 인가 컨텍스트.
 *
 * 인증·인가 판단이 라우트 여러 곳에 흩어져 있으면 한쪽만 고쳐 구멍이 남는다 —
 * 개인 API 키 해석부가 소유권을 확인하지 않아 로그인한 아무나 남의 키를 쓸 수 있던 것이
 * 그 사례다(H-1). 판단을 이 모듈 하나로 모으고 라우트는 결과만 소비한다.
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

/** 판정 결과가 오류인지 좁힌다. */
export function isProxyContextError(
  value: ProxyContext | ProxyContextError,
): value is ProxyContextError {
  return 'error' in value;
}

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
  // 인가 판단에 필요한 조회가 실패하면 **fail closed** 한다. 폴백해서 진행하면
  // 소유권을 확인하지 못한 채 키를 쓰게 된다(H-1의 실패 양상). 통제되지 않은 예외로
  // 500을 내는 대신 명시적 404로 막는다.
  try {
    return await resolve(request, apiId, deps);
  } catch {
    return NOT_FOUND;
  }
}

async function resolve(
  request: Request,
  apiId: string,
  deps: ProxyContextDeps,
): Promise<ProxyContext | ProxyContextError> {
  const url = new URL(request.url);
  const host = request.headers.get('host') ?? url.host;
  const slug = extractSiteSlug(host, deps.rootDomain);

  // 1) Host가 게시 사이트를 가리키면 그것이 권위 — 클라이언트 projectId는 보지 않는다.
  //    사용자 입력이 인가 근거가 되지 않게 하는 것이 핵심이다.
  if (slug) {
    const project = await deps.findProjectBySlug(slug);
    if (!project || project.status !== 'published') return NOT_FOUND;
    return buildSiteContext(project, apiId, deps);
  }

  const user = await deps.getAuthUser();
  const projectId = url.searchParams.get('projectId');

  // 2) apex + 세션 → app 모드(소유권 강제)
  //    user.id 타입 가드 — 타입상 string(non-nullable)이지만 인증 정보가 손상되면
  //    런타임에 다른 타입이 들어올 수 있다. 레이트리밋 Map에 잘못된 키가 등록되거나
  //    소유권 비교가 예상과 다르게 동작하므로 세션 없음으로 취급한다.
  if (user?.id && typeof user.id === 'string') {
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
