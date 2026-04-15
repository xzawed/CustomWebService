export function buildPublishUrl(slug: string): string {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  if (!rootDomain) return `/site/${slug}`;
  const isLocalhost = rootDomain.includes('localhost') || rootDomain.includes('127.0.0.1');
  if (isLocalhost) return `/site/${slug}`;
  return `https://${slug}.${rootDomain}`;
}
