import { http, HttpResponse } from 'msw';

export const handlers = [
  // 자동 fetch를 내는 컴포넌트 테스트(예: 미래의 PreviewFrame iframe·폴링)가 MSW에 도달할 때
  // onUnhandledRequest:'error'로 빨갛게 죽지 않도록 안전한 기본 응답을 제공한다.
  // 현재 어떤 테스트도 이 경로를 실제로 타지 않으며, 향후 추가될 때를 위한 예방적 핸들러다.
  // (origin은 happy-dom 기본 http://localhost:3000 — 와일드카드 `*`로 매칭)
  http.get('*/api/v1/preview/:projectId', () =>
    HttpResponse.html('<!DOCTYPE html><html lang="ko"><body>preview</body></html>'),
  ),
  http.get('*/api/v1/generate/status/:projectId', ({ params }) =>
    HttpResponse.json({ projectId: params.projectId, status: 'completed' }),
  ),

  // 회원가입 API mock
  http.post('*/api/v1/auth/signup', () =>
    HttpResponse.json({ success: true, data: { message: 'ok' } }, { status: 201 }),
  ),

  // 이메일 인증 API mock
  http.post('*/api/v1/auth/verify-email', () =>
    HttpResponse.json({ success: true, data: {} }),
  ),

  // 비밀번호 찾기 API mock
  http.post('*/api/v1/auth/forgot-password', () =>
    HttpResponse.json({ success: true, data: {} }),
  ),

  // 비밀번호 재설정 API mock
  http.post('*/api/v1/auth/reset-password', () =>
    HttpResponse.json({ success: true, data: {} }),
  ),

  // 이메일 인증 상태 API mock (기본: 미인증)
  http.get('*/api/v1/auth/status', () =>
    HttpResponse.json({ success: true, data: { verified: false } }),
  ),

  // 인증 메일 재발송 API mock
  http.post('*/api/v1/auth/resend-verification', () =>
    HttpResponse.json({ success: true, data: {} }),
  ),

  // Resend 이메일 API mock
  http.post('https://api.resend.com/emails', () =>
    HttpResponse.json({ id: 'mock-email-id' }, { status: 200 }),
  ),

  // Anthropic Claude API mock
  http.post('https://api.anthropic.com/v1/messages', () => {
    return HttpResponse.json({
      id: 'mock-msg-id',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: `### HTML
\`\`\`html
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><title>Test</title></head>
<body><h1>테스트 페이지</h1></body>
</html>
\`\`\`

### CSS
\`\`\`css
body { font-family: sans-serif; }
\`\`\`

### JavaScript
\`\`\`javascript
console.log('loaded');
\`\`\``,
        },
      ],
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 200 },
    });
  }),
];
