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
| ClaudeProvider | @anthropic-ai/sdk | claude-opus-4-7, claude-haiku-4-5 | 기본 |
| GrokProvider | OpenAI SDK (xAI baseURL) | grok-4 | 롤백용 |

## 용도별 모델 분리

`AiProviderFactory.createForTask(task)`:

| 태스크 | 모델 | 용도 |
|--------|------|------|
| `generation` | Claude Opus 4.7 | 웹페이지 코드 생성 |
| `suggestion` | Claude Haiku 4.5 | 컨텍스트 아이디어 제안 |

Grok 사용 시 태스크 구분 없이 동일 인스턴스 반환.

## 호출 지점

| 파일 | 메서드 | 태스크 |
|------|--------|--------|
| `lib/ai/generationPipeline.ts` | `createForTask('generation')` | 코드 생성 파이프라인 |
| `app/api/v1/suggest-context/route.ts` | `createForTask('suggestion')` | 컨텍스트 아이디어 제안 |
| `app/api/v1/suggest-apis/route.ts` | `createForTask('suggestion')` | API 추천 |
| `app/api/v1/health/route.ts` | `createForTask('suggestion')` | 헬스체크 AI 가용성 확인 |
| `lib/ai/slugSuggester.ts` | `createForTask('suggestion')` | slug 추천 |

## 환경변수

- `ANTHROPIC_API_KEY` — Claude 사용 시 필수
- `AI_PROVIDER` — `claude` (기본, 현재 유일한 활성 provider)
- `AI_MODEL_GENERATION` — 코드 생성 모델 오버라이드 (기본: `claude-opus-4-7`)
- `AI_MODEL_SUGGESTION` — 추천 모델 오버라이드 (기본: `claude-haiku-4-5`)

## 리트라이 정책

- 최대 2회 재시도
- 지수 백오프 (1초, 2초)
- 재시도 대상: HTTP 429, 500, 502, 503, 504, 네트워크 오류
