import { describe, it, expect } from 'vitest';
import {
  SITE_SCRIPT_CDNS,
  SITE_STYLE_CDNS,
  SITE_FONT_CDNS,
  SITE_CSP,
  PREVIEW_CSP,
  buildSiteCsp,
} from './cdn';

describe('CDN constants', () => {
  it('script CDNs은 모두 https로 시작한다', () => {
    for (const url of SITE_SCRIPT_CDNS) {
      expect(url.startsWith('https://')).toBe(true);
    }
  });

  it('style CDNs은 모두 https로 시작한다', () => {
    for (const url of SITE_STYLE_CDNS) {
      expect(url.startsWith('https://')).toBe(true);
    }
  });

  it('font CDNs은 모두 https로 시작한다', () => {
    for (const url of SITE_FONT_CDNS) {
      expect(url.startsWith('https://')).toBe(true);
    }
  });

  it('주요 CDN(tailwind, jsdelivr, fontawesome)이 script-src에 포함된다', () => {
    expect(SITE_SCRIPT_CDNS).toContain('https://cdn.tailwindcss.com');
    expect(SITE_SCRIPT_CDNS).toContain('https://cdn.jsdelivr.net');
    expect(SITE_SCRIPT_CDNS).toContain('https://cdnjs.cloudflare.com');
    expect(SITE_SCRIPT_CDNS).toContain('https://kit.fontawesome.com');
  });

  it('Google Fonts가 style-src와 font-src에 포함된다', () => {
    expect(SITE_STYLE_CDNS).toContain('https://fonts.googleapis.com');
    expect(SITE_FONT_CDNS).toContain('https://fonts.gstatic.com');
  });
});

describe('buildSiteCsp()', () => {
  it("frame-ancestors 'none' 옵션 적용", () => {
    const csp = buildSiteCsp("'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("frame-ancestors 'self'");
  });

  it("frame-ancestors 'self' 옵션 적용", () => {
    const csp = buildSiteCsp("'self'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("frame-ancestors 'none'");
  });

  it('Alpine.js 호환을 위해 unsafe-inline + unsafe-eval 포함 (script-src)', () => {
    const csp = buildSiteCsp("'none'");
    expect(csp).toContain("'unsafe-inline'");
    expect(csp).toContain("'unsafe-eval'");
  });

  it("default-src self / img-src 와일드카드 / connect-src https wss 포함", () => {
    const csp = buildSiteCsp("'none'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('img-src * data: blob:');
    expect(csp).toContain("connect-src 'self' https: wss:");
  });
});

describe('SITE_CSP / PREVIEW_CSP', () => {
  it('SITE_CSP는 frame-ancestors none을 사용한다 (외부 임베드 차단)', () => {
    expect(SITE_CSP).toContain("frame-ancestors 'none'");
  });

  it('PREVIEW_CSP는 frame-ancestors self를 사용한다 (메인 앱 iframe 허용)', () => {
    expect(PREVIEW_CSP).toContain("frame-ancestors 'self'");
  });

  it('SITE_CSP와 PREVIEW_CSP는 frame-ancestors만 다르고 나머지는 동일', () => {
    const siteWithoutFrame = SITE_CSP.replace(/frame-ancestors '[a-z]+'/, '');
    const previewWithoutFrame = PREVIEW_CSP.replace(/frame-ancestors '[a-z]+'/, '');
    expect(siteWithoutFrame).toBe(previewWithoutFrame);
  });
});

// CSP "내용" 검증: 단순 substring 존재가 아니라 문법·완전성을 확인하여,
// 향후 buildSiteCsp 리팩터가 빈 디렉티브·trailing 세미콜론·중복·누락을 만들면 잡아낸다.
describe('CSP 문법·완전성', () => {
  const REQUIRED_DIRECTIVES = [
    'default-src',
    'script-src',
    'style-src',
    'font-src',
    'img-src',
    'connect-src',
    'frame-ancestors',
  ];

  for (const [label, csp] of [
    ['SITE_CSP', SITE_CSP],
    ['PREVIEW_CSP', PREVIEW_CSP],
    ["buildSiteCsp('self')", buildSiteCsp("'self'")],
  ] as const) {
    describe(label, () => {
      const segments = csp.split('; ');

      it('빈 디렉티브나 dangling 세미콜론이 없다', () => {
        expect(csp).not.toMatch(/;\s*;/); // 연속 세미콜론
        expect(csp.trim()).not.toMatch(/;\s*$/); // 끝 세미콜론
        for (const seg of segments) {
          expect(seg.trim().length).toBeGreaterThan(0);
          // 각 세그먼트는 "디렉티브명 ..."로 시작해야 함
          expect(seg.trim().split(/\s+/)[0]).toMatch(/^[a-z-]+$/);
        }
      });

      it('필수 디렉티브를 모두 포함한다', () => {
        const names = segments.map((s) => s.trim().split(/\s+/)[0]);
        for (const d of REQUIRED_DIRECTIVES) {
          expect(names).toContain(d);
        }
      });

      it('중복된 디렉티브가 없다', () => {
        const names = segments.map((s) => s.trim().split(/\s+/)[0]);
        expect(new Set(names).size).toBe(names.length);
      });
    });
  }
});
