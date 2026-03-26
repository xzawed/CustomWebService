const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

export const RESERVED_SLUGS = new Set([
  'www',
  'api',
  'admin',
  'login',
  'logout',
  'signup',
  'register',
  'auth',
  'callback',
  'site',
  'app',
  'mail',
  'smtp',
  'ftp',
  'ssh',
  'dashboard',
  'builder',
  'settings',
  'profile',
  'help',
  'support',
  'blog',
  'docs',
  'status',
  'health',
  'static',
  'assets',
  'cdn',
]);

export function toSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // 발음 기호 제거
    .replace(/[^a-z0-9\s-]/g, '') // 영문/숫자/공백/하이픈만 유지
    .trim()
    .replace(/[\s_]+/g, '-') // 공백/언더스코어 → 하이픈
    .replace(/-+/g, '-') // 연속 하이픈 → 단일
    .replace(/^-|-$/g, ''); // 앞뒤 하이픈 제거
}

export function generateSlug(projectName: string, projectId: string): string {
  const idSuffix = projectId.replace(/-/g, '').slice(0, 6);
  const base = toSlug(projectName).slice(0, 43); // 최대 43자 + 하이픈 + 6자 = 50자

  if (base.length >= 2) {
    return `${base}-${idSuffix}`;
  }
  // 프로젝트 이름이 ASCII로 변환 불가한 경우 ID만 사용
  return `project-${idSuffix}`;
}

export function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug) && !RESERVED_SLUGS.has(slug);
}
