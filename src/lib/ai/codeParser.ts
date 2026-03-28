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
function sanitizeCss(css: string): string {
  return css
    // IE CSS expression injection: expression(...)
    .replace(/expression\s*\(/gi, '/* removed */(')
    // CSS url(javascript:...) XSS
    .replace(/url\s*\(\s*(['"]?\s*)javascript:/gi, 'url($1#')
    // IE behavior property
    .replace(/behavior\s*:/gi, '/* removed */:')
    // Firefox -moz-binding XSS
    .replace(/-moz-binding\s*:/gi, '/* removed */:');
}

export function assembleHtml(parsed: ParsedCode): string {
  const safeCss = parsed.css ? sanitizeCss(parsed.css) : '';

  // If HTML is a full document, inject additional CSS and JS
  if (parsed.html.includes('</head>')) {
    let assembled = parsed.html;

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

    if (safeCss) {
      const headIdx = assembled.lastIndexOf('</head>');
      assembled =
        assembled.slice(0, headIdx) +
        `<style>\n${safeCss}\n</style>\n` +
        assembled.slice(headIdx);
    }

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

    return assembled;
  }

  // Build complete HTML document
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Generated Service</title>
  <style>
${safeCss}
  </style>
</head>
<body>
${parsed.html}
  <script>
${parsed.js}
  </script>
</body>
</html>`;
}
