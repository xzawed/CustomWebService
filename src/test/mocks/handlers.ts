import { http, HttpResponse } from 'msw';

export const handlers = [
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
      model: 'claude-sonnet-4-6-20250514',
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 200 },
    });
  }),
];
