export interface ParsedCode {
  html: string;
  css: string;
  js: string;
}

export function parseGeneratedCode(aiResponse: string): ParsedCode {
  const html = extractCodeBlock(aiResponse, 'html');
  const css = extractCodeBlock(aiResponse, 'css');
  const js =
    extractCodeBlock(aiResponse, 'javascript') || extractCodeBlock(aiResponse, 'js');

  return { html, css, js };
}

function extractCodeBlock(text: string, language: string): string {
  const regex = new RegExp(`\`\`\`${language}\\s*\\n([\\s\\S]*?)\`\`\``, 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

export function assembleHtml(parsed: ParsedCode): string {
  // If HTML already contains <style> and <script>, return as-is
  if (parsed.html.includes('<style>') && parsed.html.includes('<script>')) {
    return parsed.html;
  }

  // If HTML is a full document, inject CSS and JS
  if (parsed.html.includes('</head>')) {
    let assembled = parsed.html;

    if (parsed.css) {
      assembled = assembled.replace(
        '</head>',
        `<style>\n${parsed.css}\n</style>\n</head>`
      );
    }

    if (parsed.js) {
      assembled = assembled.replace(
        '</body>',
        `<script>\n${parsed.js}\n</script>\n</body>`
      );
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
${parsed.css}
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
