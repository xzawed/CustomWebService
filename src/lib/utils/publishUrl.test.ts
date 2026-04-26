import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildPublishUrl } from './publishUrl';

describe('buildPublishUrl()', () => {
  const originalEnv = process.env.NEXT_PUBLIC_ROOT_DOMAIN;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
    } else {
      process.env.NEXT_PUBLIC_ROOT_DOMAIN = originalEnv;
    }
  });

  it('NEXT_PUBLIC_ROOT_DOMAIN이 없으면 /site/{slug}를 반환한다', () => {
    delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;

    const result = buildPublishUrl('my-app');
    expect(result).toBe('/site/my-app');
  });

  it('rootDomain이 localhost이면 /site/{slug}를 반환한다', () => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';

    const result = buildPublishUrl('my-app');
    expect(result).toBe('/site/my-app');
  });

  it('rootDomain이 127.0.0.1이면 /site/{slug}를 반환한다', () => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = '127.0.0.1:3000';

    const result = buildPublishUrl('my-app');
    expect(result).toBe('/site/my-app');
  });

  it('프로덕션 도메인이면 https://{slug}.{rootDomain}을 반환한다', () => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'xzawed.xyz';

    const result = buildPublishUrl('my-app');
    expect(result).toBe('https://my-app.xzawed.xyz');
  });

  it('프로덕션 도메인에서 slug가 그대로 서브도메인에 포함된다', () => {
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'example.com';

    const result = buildPublishUrl('cool-project-abc123');
    expect(result).toBe('https://cool-project-abc123.example.com');
  });
});
