import DOMPurify from 'isomorphic-dompurify';

// Allow Alpine.js (x-*), Vue binding shorthand (:*), and event shorthand (@*) attributes
DOMPurify.addHook('uponSanitizeAttribute', (_el, data) => {
  if (/^(x-|:|@)/.test(data.attrName)) data.forceKeepAttr = true;
});

// CDN whitelist re-injection constants.
// DOMPurify strips <script src> and <link> tags by design (XSS prevention).
// These known-safe CDN tags are re-injected explicitly after sanitization —
// same pattern as Alpine.js injection. Keep URLs in sync with promptBuilder.ts.
const TAILWIND_CDN_TAG = '  <script src="https://cdn.tailwindcss.com"></script>';
const TAILWIND_CONFIG_TAG = [
  '  <script>',
  '    tailwind.config = {',
  '      theme: { extend: {',
  "        fontFamily: { pretendard: ['Pretendard Variable', 'Pretendard', 'sans-serif'] },",
  '      } },',
  '    };',
  '  </script>',
].join('\n');
const PRETENDARD_CDN_TAG = [
  '  <link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>',
  '  <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.min.css" rel="stylesheet">',
].join('\n');
const FONT_AWESOME_CDN_TAG =
  '  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">';

export interface ParsedCode {
  html: string;
  css: string;
  js: string;
}

export function ensureCharset(html: string): string {
  const hasCharset =
    /<meta\s[^>]*charset/i.test(html) ||
    /<meta\s[^>]*http-equiv\s*=\s*["']?content-type/i.test(html);
  if (hasCharset) return html;
  const headIdx = html.indexOf('<head>');
  if (headIdx === -1) return html;
  return (
    html.slice(0, headIdx + '<head>'.length) +
    '\n  <meta charset="UTF-8">' +
    html.slice(headIdx + '<head>'.length)
  );
}

export function ensureViewport(html: string): string {
  if (/<meta[^>]*name\s*=\s*["']viewport["']/i.test(html)) return html;
  const charsetMatch = /<meta[^>]*charset[^>]*>/i.exec(html);
  if (charsetMatch) {
    const insertIdx = html.indexOf(charsetMatch[0]) + charsetMatch[0].length;
    return (
      html.slice(0, insertIdx) +
      '\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
      html.slice(insertIdx)
    );
  }
  const headIdx = html.indexOf('<head>');
  if (headIdx === -1) return html;
  return (
    html.slice(0, headIdx + '<head>'.length) +
    '\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    html.slice(headIdx + '<head>'.length)
  );
}

export function injectCdnTags(html: string): string {
  const headIdx = html.lastIndexOf('</head>');
  return (
    html.slice(0, headIdx) +
    TAILWIND_CDN_TAG + '\n' +
    TAILWIND_CONFIG_TAG + '\n' +
    PRETENDARD_CDN_TAG + '\n' +
    FONT_AWESOME_CDN_TAG + '\n' +
    html.slice(headIdx)
  );
}

export function injectAlpineScript(html: string): string {
  if (html.includes('alpinejs')) return html;
  const alpineTag =
    '  <script defer src="https://unpkg.com/alpinejs@3.14.8/dist/cdn.min.js"></script>';
  const headCloseIdx = html.lastIndexOf('</head>');
  return html.slice(0, headCloseIdx) + alpineTag + '\n' + html.slice(headCloseIdx);
}

const MIN_CODE_LENGTHS = { html: 50, css: 20, js: 10 } as const;

export function parseGeneratedCode(aiResponse: string): ParsedCode {
  const html = extractCodeBlock(aiResponse, 'html');
  const css = extractCodeBlock(aiResponse, 'css');
  const js = extractCodeBlock(aiResponse, 'javascript') || extractCodeBlock(aiResponse, 'js');

  if (html.length < MIN_CODE_LENGTHS.html)
    throw new Error(`HTML 코드 블록이 너무 짧습니다 (${html.length}자, 최소 ${MIN_CODE_LENGTHS.html}자). AI 응답이 잘렸거나 코드 블록이 없습니다.`);
  if (css.length < MIN_CODE_LENGTHS.css)
    throw new Error(`CSS 코드 블록이 너무 짧습니다 (${css.length}자, 최소 ${MIN_CODE_LENGTHS.css}자).`);
  if (js.length < MIN_CODE_LENGTHS.js)
    throw new Error(`JavaScript 코드 블록이 너무 짧습니다 (${js.length}자, 최소 ${MIN_CODE_LENGTHS.js}자).`);

  return { html, css, js };
}

function extractCodeBlock(text: string, language: string): string {
  const regex = new RegExp(`\`\`\`${language}\\s*\\n([\\s\\S]*?)\`\`\``, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

/**
 * Sanitize AI-generated CSS to remove known injection attack patterns.
 * JS validation is handled separately by codeValidator.validateAll().
 */
// CSS 유니코드 이스케이프 디코딩 (\00006a → 'j' 등)
// 이스케이프 우회 공격 방지: \00006a\000061\000076... = "javascript" 패턴 전처리
function decodeCssUnicodeEscapes(css: string): string {
  return css.replaceAll(/\\([0-9a-fA-F]{1,6}) ?/g, (_, hex) =>
    String.fromCodePoint(Number.parseInt(hex, 16))
  );
}

export function sanitizeCss(css: string): string {
  // 유니코드 이스케이프를 먼저 디코딩한 후 패턴 검사 (우회 공격 차단)
  const decoded = decodeCssUnicodeEscapes(css);
  return decoded
    .replace(/expression\s*\(/gi, '/* removed */(')
    .replace(/url\s*\(\s*(['"]?\s*)javascript:/gi, 'url($1#')
    .replace(/url\s*\(\s*(['"]?\s*)data:/gi, 'url($1#')
    .replace(/url\s*\(\s*(['"]?\s*)\/\//gi, 'url($1#')  // 프로토콜 상대 URL (//evil.com/)
    .replace(/behavior\s*:/gi, '/* removed */:')
    .replace(/-moz-binding\s*:/gi, '/* removed */:')
    .replace(/-webkit-binding\s*:/gi, '/* removed */:')
    .replace(/@import\b/gi, '/* removed */');
}

/**
 * Extract <title> content from HTML string.
 */
function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim() : '';
}

/**
 * Build head injections: favicon, OG meta tags, CSS variables, print stylesheet.
 * Only injects tags that are not already present.
 */
function buildHeadInjections(html: string, safeCss: string): string {
  const parts: string[] = [];

  // Favicon — only if no existing favicon link
  if (!/<link[^>]*rel\s*=\s*["'](?:icon|shortcut icon)["']/i.test(html)) {
    parts.push(
      `<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌐</text></svg>">`
    );
  }

  // OG meta tags — only if no existing og: tags
  if (!/<meta[^>]*property\s*=\s*["']og:/i.test(html)) {
    const title = extractTitle(html) || 'Generated Service';
    parts.push(
      `<meta property="og:type" content="website">`,
      `<meta property="og:locale" content="ko_KR">`,
      `<meta property="og:title" content="${title.replace(/"/g, '&quot;')}">`
    );
  }

  // CSS custom properties + print stylesheet + mobile safety
  const cssInjection = [
    ':root {',
    '  --transition-fast: 150ms ease;',
    '  --transition-base: 300ms ease;',
    '  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);',
    '  --shadow-md: 0 4px 6px rgba(0,0,0,0.07);',
    '  --radius-lg: 1rem;',
    '  --radius-xl: 1.5rem;',
    '}',
    '@media print {',
    '  header, footer, .no-print { display: none; }',
    '  body { background: white !important; color: black !important; }',
    '}',
    '/* Mobile safety */',
    '*, *::before, *::after { box-sizing: border-box; }',
    'img, video, canvas, svg { max-width: 100%; height: auto; display: block; }',
    'body { overflow-x: hidden; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }',
    '@supports (padding: env(safe-area-inset-bottom)) {',
    '  body {',
    '    padding-left: env(safe-area-inset-left);',
    '    padding-right: env(safe-area-inset-right);',
    '    padding-bottom: env(safe-area-inset-bottom);',
    '  }',
    '}',
  ].join('\n');

  const fullCss = cssInjection + (safeCss ? '\n' + safeCss : '');
  parts.push(`<style>\n${fullCss}\n</style>`);

  return parts.join('\n');
}

/**
 * Process a single <img> tag's attributes: add lazy loading, decoding, and dimensions.
 * First 2 images (imgIndex ≤ 2) skip lazy loading (above the fold).
 */
function processImgTag(attrs: string, imgIndex: number): string {
  let newAttrs = attrs;
  if (imgIndex > 2 && !/\bloading\s*=/i.test(newAttrs)) {
    newAttrs += ' loading="lazy"';
  }
  if (!/\bdecoding\s*=/i.test(newAttrs)) {
    newAttrs += ' decoding="async"';
  }
  if (/picsum\.photos/i.test(newAttrs)) {
    const sizeMatch = /picsum\.photos\/(?:seed\/[^/]+\/)?(\d+)\/(\d+)/i.exec(newAttrs);
    if (sizeMatch) {
      if (!/\bwidth\s*=/i.test(newAttrs)) newAttrs += ` width="${sizeMatch[1]}"`;
      if (!/\bheight\s*=/i.test(newAttrs)) newAttrs += ` height="${sizeMatch[2]}"`;
    }
  } else if (/images\.unsplash\.com/i.test(newAttrs) || /source\.unsplash\.com/i.test(newAttrs)) {
    const unsplashWH =
      /[?&]w=(\d+)&h=(\d+)/i.exec(newAttrs) ||
      /source\.unsplash\.com\/(\d+)x(\d+)/i.exec(newAttrs);
    if (unsplashWH) {
      if (!/\bwidth\s*=/i.test(newAttrs)) newAttrs += ` width="${unsplashWH[1]}"`;
      if (!/\bheight\s*=/i.test(newAttrs)) newAttrs += ` height="${unsplashWH[2]}"`;
    }
  }
  return newAttrs;
}

/**
 * Post-process image tags: add lazy loading, decoding, and dimensions for picsum.photos.
 * First 2 images skip lazy loading (above the fold).
 */
function optimizeImages(html: string): string {
  let imgIndex = 0;
  return html.replace(/<img\s([^>]*?)>/gi, (_match, attrs: string) => {
    imgIndex++;
    return `<img ${processImgTag(attrs, imgIndex)}>`;
  });
}

function injectHeadExtras(html: string, safeCss: string): string {
  const headCloseIdx = html.lastIndexOf('</head>');
  return (
    html.slice(0, headCloseIdx) +
    buildHeadInjections(html, safeCss) +
    '\n' +
    html.slice(headCloseIdx)
  );
}

function injectUserScript(html: string, js: string): string {
  if (!js) return html;
  const bodyIdx = html.lastIndexOf('</body>');
  if (bodyIdx !== -1) {
    return html.slice(0, bodyIdx) + `<script>\n${js}\n</script>\n` + html.slice(bodyIdx);
  }
  return html + `<script>\n${js}\n</script>`;
}

function processFullDocument(assembled: string, safeCss: string, js: string): string {
  assembled = ensureCharset(assembled);
  assembled = ensureViewport(assembled);
  assembled = injectCdnTags(assembled);
  assembled = injectAlpineScript(assembled);
  assembled = injectHeadExtras(assembled, safeCss);
  assembled = injectUserScript(assembled, js);
  return optimizeImages(assembled);
}

function buildFromFragment(safeHtml: string, safeCss: string, js: string): string {
  const title = extractTitle(safeHtml) || 'Generated Service';
  const headInjections = buildHeadInjections('', safeCss);
  const alpineScript = safeHtml.includes('alpinejs')
    ? ''
    : '  <script defer src="https://unpkg.com/alpinejs@3.14.8/dist/cdn.min.js"></script>\n';

  const doc = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
${TAILWIND_CDN_TAG}
${TAILWIND_CONFIG_TAG}
${PRETENDARD_CDN_TAG}
${FONT_AWESOME_CDN_TAG}
  ${headInjections}
${alpineScript}</head>
<body>
${safeHtml}
${js ? `  <script>\n${js}\n  </script>\n` : ''}</body>
</html>`;

  return optimizeImages(doc);
}

export function assembleHtml(parsed: ParsedCode): string {
  const safeCss = parsed.css ? sanitizeCss(parsed.css) : '';
  const isFullDoc = parsed.html.includes('</head>');
  // Sanitize AI-generated HTML. ADD_TAGS is intentionally empty: script/style/link are
  // all omitted to prevent DOM-based attacks (SonarQube S8479). CSS comes from parsed.css
  // and Alpine.js is injected by buildHeadInjections() after sanitization.
  const safeHtml = DOMPurify.sanitize(parsed.html, {
    WHOLE_DOCUMENT: isFullDoc,
    FORCE_BODY: !isFullDoc,
  });

  if (safeHtml.includes('</head>')) {
    return processFullDocument(safeHtml, safeCss, parsed.js);
  }
  return buildFromFragment(safeHtml, safeCss, parsed.js);
}
