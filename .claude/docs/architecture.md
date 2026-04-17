# 아키텍처 개요

## 레이어 구조

```
Client (Browser)
  ↓
Next.js App Router (src/app/)
  ↓
Route Handler (API Routes: /api/v1/*)
  ↓
Service Layer (src/services/)
  ↓
Repository Layer (src/repositories/)
  ↓
Supabase (PostgreSQL + RLS)
```

## AI 생성 파이프라인

```
사용자 요청
  ↓
POST /api/v1/generate (SSE 스트리밍)
  ├── AuthService.getCurrentUser()
  ├── RateLimitService.checkAndIncrementDailyLimit()
  ├── ProjectService.getById() + getProjectApiIds()
  ├── CatalogService.getByIds()
  ├── buildSystemPrompt() + buildUserPrompt()
  ├── AiProviderFactory.createForTask('generation')
  │   └── ClaudeProvider.generateCodeStream() [Opus 4.7]
  ├── parseGeneratedCode()
  ├── validateAll() (보안 검증)
  ├── CodeRepository.create()
  └── ProjectService.updateStatus('generated')
```

## 서빙 파이프라인 (3가지 경로)

| 경로 | URL | 파일 |
|------|-----|------|
| 미리보기 | `/api/v1/preview/[projectId]` | `src/app/api/v1/preview/[projectId]/route.ts` |
| 게시 (직접) | `/site/[slug]` | `src/app/site/[slug]/route.ts` |
| 게시 (서브도메인) | `slug.xzawed.xyz` | middleware rewrite → `/site/[slug]` |

## AI Provider 구조

```
IAiProvider (인터페이스)
  ├── ClaudeProvider (기본) — @anthropic-ai/sdk
  │   ├── generation: claude-opus-4-7
  │   └── suggestion: claude-haiku-4-5
  └── GrokProvider (롤백용) — OpenAI SDK (xAI baseURL)

AiProviderFactory
  ├── create(type?) — 단일 Provider 반환
  ├── createForTask(task) — 용도별 모델 분리
  └── getBestAvailable() — 가용한 Provider 자동 선택
```

## 컨텍스트 제안 파이프라인

```
POST /api/v1/suggest-context
  ├── Auth 확인
  ├── API 목록 수신 (최대 5개)
  ├── AiProviderFactory.createForTask('suggestion')
  │   └── ClaudeProvider.generateCode() [Haiku 4.5]
  └── JSON 배열 파싱 → 3가지 아이디어 반환
```

## 주요 인프라

- **DB**: Supabase PostgreSQL + Row Level Security
- **Auth**: Supabase Auth (Google, GitHub OAuth)
- **배포**: Railway (Dockerfile, standalone output)
- **도메인**: xzawed.xyz (가비아 → Railway)
- **서브도메인**: *.xzawed.xyz → middleware Host 감지
