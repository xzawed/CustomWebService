import { http, HttpResponse } from 'msw'

export const handlers = [
  // xAI Grok API mock
  http.post('https://api.x.ai/v1/chat/completions', () => {
    return HttpResponse.json({
      id: 'mock-id',
      choices: [
        {
          message: {
            role: 'assistant',
            content: `\`\`\`html
<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><title>Test</title></head>
<body><h1>테스트 페이지</h1></body>
</html>
\`\`\`
\`\`\`css
body { font-family: sans-serif; }
\`\`\`
\`\`\`javascript
console.log('loaded');
\`\`\``,
          },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
    })
  }),
]
