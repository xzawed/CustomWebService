# Grok → Claude API 전환 설계

## 개요

AI 코드 생성 및 컨텍스트 제안에 사용하는 AI Provider를 Grok(xAI)에서 Claude(Anthropic)로 점진적으로 전환한다.

- **전환 방식**: 점진적 — Claude를 기본값으로 추가하되 Grok 코드는 롤백용으로 유지
- **SDK**: Anthropic 공식 SDK (`@anthropic-ai/sdk`)
- **모델 분리**: 코드 생성 → Sonnet 4.6, 컨텍스트 제안 → Haiku 4.5
- **프롬프트**: 기존 프롬프트 그대로 유지 (모델 무관 도메인 지침)

## 1. ClaudeProvider

**파일**: `src/providers/ai/ClaudeProvider.ts`

- `@anthropic-ai/sdk`의 `Anthropic` 클라이언트 사용
- 생성자: `(apiKey: string, model = 'claude-sonnet-4-6-20250514')`
- `IAiProvider` 인터페이스 구현 (변경 없음)

| 메서드 | 구현 |
|--------|------|
| `generateCode()` | `client.messages.create()` → `AiResponse` |
| `generateCodeStream()` | `client.messages.stream()` → `onChunk` 콜백 |
| `checkAvailability()` | 최소 토큰 요청으로 헬스체크 |

- 리트라이: 2회 재시도, 지수 백오프 (429, 5xx 대응)
- 기본 파라미터: `temperature: 0.7`, `max_tokens: 32000`

## 2. AiProviderFactory 변경

**파일**: `src/providers/ai/AiProviderFactory.ts`

- `AiProviderType`에 `'claude'` 추가
- `create()` 메서드에 `case 'claude'` 분기 추가 (`ANTHROPIC_API_KEY` 사용)
- 기본값: `'grok'` → `'claude'`
- **새 메서드**: `createForTask(task: 'generation' | 'suggestion')`
  - `'generation'` → Sonnet 4.6 (`create('claude')`)
  - `'suggestion'` → Haiku 4.5 (별도 인스턴스)
  - 캐시 키: `'claude:generation'`, `'claude:suggestion'`
  - Grok 사용 시 태스크 구분 없이 기존 `create('grok')` 반환

## 3. 호출부 변경

| 파일 | 변경 |
|------|------|
| `src/app/api/v1/generate/route.ts` | `create()` → `createForTask('generation')` |
| `src/app/api/v1/suggest-context/route.ts` | `create()` → `createForTask('suggestion')` |
| `src/services/generationService.ts` | `create()` → `createForTask('generation')` |

프롬프트, 파싱, 검증 로직은 모두 그대로 유지.

## 4. 환경변수

| 변수 | 용도 | 비고 |
|------|------|------|
| `ANTHROPIC_API_KEY` | Claude API 키 | 신규 추가 |
| `AI_PROVIDER` | 기본 Provider | 기본값 `'claude'`로 변경 |
| `XAI_API_KEY` | Grok API 키 | 기존 유지 (롤백용) |

## 5. 테스트

- **신규**: `ClaudeProvider.test.ts` — Anthropic SDK mock, 전체 메서드 + 리트라이 테스트
- **수정**: `AiProviderFactory.test.ts` — claude 타입, createForTask(), 기본값 변경
- **유지**: GrokProvider, promptBuilder, codeParser, codeValidator 테스트 변경 없음

## 6. 영향 범위

- `IAiProvider` 인터페이스: 변경 없음
- GrokProvider: 변경 없음
- 프롬프트 시스템: 변경 없음
- 서빙 파이프라인 (middleware, site route, preview route): 영향 없음
- CSP/보안 헤더: 영향 없음
