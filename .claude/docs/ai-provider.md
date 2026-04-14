# AI Provider 시스템

## 구조

```
IAiProvider (인터페이스)
├── generateCode(prompt) → AiResponse
├── generateCodeStream(prompt, onChunk) → AiStreamResult
└── checkAvailability() → { available, remainingQuota? }
```

## Provider 목록

| Provider | SDK | 모델 | 상태 |
|----------|-----|------|------|
| ClaudeProvider | @anthropic-ai/sdk | claude-sonnet-4-6, claude-haiku-4-5 | 기본 |
| GrokProvider | OpenAI SDK (xAI baseURL) | grok-4 | 롤백용 |

## 용도별 모델 분리

`AiProviderFactory.createForTask(task)`:

| 태스크 | 모델 | 용도 |
|--------|------|------|
| `generation` | Claude Sonnet 4.6 | 웹페이지 코드 생성 |
| `suggestion` | Claude Haiku 4.5 | 컨텍스트 아이디어 제안 |

Grok 사용 시 태스크 구분 없이 동일 인스턴스 반환.

## 호출 지점

| 파일 | 메서드 | 태스크 |
|------|--------|--------|
| `app/api/v1/generate/route.ts` | `createForTask('generation')` | 코드 생성 |
| `app/api/v1/suggest-context/route.ts` | `createForTask('suggestion')` | 아이디어 제안 |
| `services/generationService.ts` | `createForTask('generation')` | 서비스 레이어 생성 |

## 환경변수

- `ANTHROPIC_API_KEY` — Claude 사용 시 필수
- `XAI_API_KEY` — Grok 사용 시 필수
- `AI_PROVIDER` — `claude` (기본) | `grok`

## 리트라이 정책

- 최대 2회 재시도
- 지수 백오프 (1초, 2초)
- 재시도 대상: HTTP 429, 500, 502, 503, 504, 네트워크 오류
