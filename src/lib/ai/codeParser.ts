import DOMPurify from 'isomorphic-dompurify';

// Allow Alpine.js (x-*), Vue binding shorthand (:*), and event shorthand (@*) attributes
DOMPurify.addHook('uponSanitizeAttribute', (_el, data) => {
  if (/^(x-|:|@)/.test(data.attrName)) data.forceKeepAttr = true;
});

export interface ParsedCode {
  html: string;
  css: string;
  js: string;
}

export function parseGeneratedCode(aiResponse: string): ParsedCode {
  const html = extractCodeBlock(aiResponse, 'html');
  const css = extractCodeBlock(aiResponse, 'css');
  const js = extractCodeBlock(aiResponse, 'javascript') || extractCodeBlock(aiResponse, 'js');

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
 * Post-process image tags: add lazy loading, decoding, and dimensions for picsum.photos.
 * First 2 images skip lazy loading (above the fold).
 */
function optimizeImages(html: string): string {
  let imgIndex = 0;
  return html.replace(/<img\s([^>]*?)>/gi, (match, attrs: string) => {
    imgIndex++;
    let newAttrs = attrs;

    // Add loading="lazy" for images after the first 2 (above the fold)
    if (imgIndex > 2 && !/\bloading\s*=/i.test(newAttrs)) {
      newAttrs += ' loading="lazy"';
    }

    // Add decoding="async"
    if (!/\bdecoding\s*=/i.test(newAttrs)) {
      newAttrs += ' decoding="async"';
    }

    // Extract width/height from image URL patterns
    if (/picsum\.photos/i.test(newAttrs)) {
      const sizeMatch = newAttrs.match(/picsum\.photos\/(?:seed\/[^/]+\/)?(\d+)\/(\d+)/i);
      if (sizeMatch) {
        if (!/\bwidth\s*=/i.test(newAttrs)) {
          newAttrs += ` width="${sizeMatch[1]}"`;
        }
        if (!/\bheight\s*=/i.test(newAttrs)) {
          newAttrs += ` height="${sizeMatch[2]}"`;
        }
      }
    } else if (/images\.unsplash\.com/i.test(newAttrs) || /source\.unsplash\.com/i.test(newAttrs)) {
      // Extract width/height from Unsplash URL: ?w=600&h=400 or /600x400/
      const unsplashWH = newAttrs.match(/[?&]w=(\d+)&h=(\d+)/i) ||
        newAttrs.match(/source\.unsplash\.com\/(\d+)x(\d+)/i);
      if (unsplashWH) {
        if (!/\bwidth\s*=/i.test(newAttrs)) {
          newAttrs += ` width="${unsplashWH[1]}"`;
        }
        if (!/\bheight\s*=/i.test(newAttrs)) {
          newAttrs += ` height="${unsplashWH[2]}"`;
        }
      }
    }

    return `<img ${newAttrs}>`;
  });
}

export function assembleHtml(parsed: ParsedCode): string {
  const safeCss = parsed.css ? sanitizeCss(parsed.css) : '';

  // Sanitize AI-generated HTML. ADD_TAGS is intentionally empty: script/style/link are
  // all omitted to prevent DOM-based attacks (SonarQube S8479). CSS comes from parsed.css
  // and Alpine.js is injected by buildHeadInjections() after sanitization.
  const isFullDoc = parsed.html.includes('</head>');
  const safeHtml = DOMPurify.sanitize(parsed.html, {
    WHOLE_DOCUMENT: isFullDoc,
    FORCE_BODY: !isFullDoc,
  });

  // If HTML is a full document, inject additional CSS and JS
  if (safeHtml.includes('</head>')) {
    let assembled = safeHtml;

    // Ensure charset=UTF-8 is declared — AI sometimes omits it or uses a different encoding
    const hasCharset =
      /<meta\s[^>]*charset/i.test(assembled) ||
      /<meta\s[^>]*http-equiv\s*=\s*["']?content-type/i.test(assembled);
    if (!hasCharset) {
      const headIdx = assembled.indexOf('<head>');
      if (headIdx !== -1) {
        assembled =
          assembled.slice(0, headIdx + '<head>'.length) +
          '\n  <meta charset="UTF-8">' +
          assembled.slice(headIdx + '<head>'.length);
      }
    }

    // Ensure viewport meta is present for responsive design
    const hasViewport = /<meta[^>]*name\s*=\s*["']viewport["']/i.test(assembled);
    if (!hasViewport) {
      const charsetMatch = assembled.match(/<meta[^>]*charset[^>]*>/i);
      if (charsetMatch) {
        const insertIdx = assembled.indexOf(charsetMatch[0]) + charsetMatch[0].length;
        assembled =
          assembled.slice(0, insertIdx) +
          '\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
          assembled.slice(insertIdx);
      } else {
        const headIdx = assembled.indexOf('<head>');
        if (headIdx !== -1) {
          assembled =
            assembled.slice(0, headIdx + '<head>'.length) +
            '\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
            assembled.slice(headIdx + '<head>'.length);
        }
      }
    }

    // Inject Alpine.js CDN before </head> (skip if already present)
    if (!assembled.includes('alpinejs')) {
      const alpineTag =
        '  <script defer src="https://unpkg.com/alpinejs@3.14.8/dist/cdn.min.js"></script>';
      const headCloseForAlpine = assembled.lastIndexOf('</head>');
      assembled =
        assembled.slice(0, headCloseForAlpine) +
        alpineTag +
        '\n' +
        assembled.slice(headCloseForAlpine);
    }

    // Inject favicon, OG tags, CSS variables, and print stylesheet before </head>
    const headCloseIdx = assembled.lastIndexOf('</head>');
    assembled =
      assembled.slice(0, headCloseIdx) +
      buildHeadInjections(assembled, safeCss) +
      '\n' +
      assembled.slice(headCloseIdx);

    if (parsed.js) {
      const bodyIdx = assembled.lastIndexOf('</body>');
      if (bodyIdx !== -1) {
        assembled =
          assembled.slice(0, bodyIdx) +
          `<script>\n${parsed.js}\n</script>\n` +
          assembled.slice(bodyIdx);
      } else {
        assembled += `<script>\n${parsed.js}\n</script>`;
      }
    }

    // Post-process images for lazy loading and dimensions
    assembled = optimizeImages(assembled);

    return assembled;
  }

  // Build complete HTML document
  const title = extractTitle(safeHtml) || 'Generated Service';
  const headInjections = buildHeadInjections('', safeCss);
  const alpineScript = safeHtml.includes('alpinejs')
    ? ''
    : '  <script defer src="https://unpkg.com/alpinejs@3.14.8/dist/cdn.min.js"></script>\n';

  let doc = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${headInjections}
${alpineScript}</head>
<body>
${safeHtml}
  <script>
${parsed.js}
  </script>
</body>
</html>`;

  // Post-process images for lazy loading and dimensions
  doc = optimizeImages(doc);

  return doc;
}
