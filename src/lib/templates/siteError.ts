export function notFoundHtml(slug: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>사이트를 찾을 수 없습니다</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f9fafb;
      color: #111827;
    }
    .container { text-align: center; padding: 2rem; max-width: 480px; }
    .code { font-size: 5rem; font-weight: 800; color: #e5e7eb; line-height: 1; }
    h1 { font-size: 1.5rem; font-weight: 700; margin: 1rem 0 0.5rem; }
    p { color: #6b7280; font-size: 0.95rem; line-height: 1.6; }
    .slug { font-family: monospace; background: #f3f4f6; padding: 0.2em 0.5em; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="code">404</div>
    <h1>사이트를 찾을 수 없습니다</h1>
    <p><span class="slug">${escapeHtml(slug)}</span> 주소의 사이트가 존재하지 않거나 삭제되었습니다.</p>
  </div>
</body>
</html>`;
}

export function preparingHtml(slug: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="10" />
  <title>준비 중 — ${escapeHtml(slug)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f9fafb;
      color: #111827;
    }
    .container { text-align: center; padding: 2rem; max-width: 480px; }
    .spinner {
      width: 48px; height: 48px;
      border: 4px solid #e5e7eb;
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 1.5rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; }
    p { color: #6b7280; font-size: 0.95rem; line-height: 1.6; }
    .note { margin-top: 1rem; font-size: 0.8rem; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h1>사이트 준비 중</h1>
    <p>곧 이용 가능합니다. 잠시만 기다려 주세요.</p>
    <p class="note">10초 후 자동으로 새로고침됩니다.</p>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
