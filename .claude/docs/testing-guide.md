# 테스트 가이드

## 테스트 구조

```
src/
├── __tests__/           # 통합 테스트 (API routes, services, lib)
│   ├── api/             # API 라우트 테스트 (11개 파일)
│   │   ├── generate.test.ts
│   │   ├── deploy.test.ts
│   │   ├── preview.test.ts
│   │   ├── projects.test.ts
│   │   ├── projects-publish.test.ts
│   │   ├── projects-rollback.test.ts
│   │   ├── projects-slug-check.test.ts
│   │   ├── suggest-apis.test.ts
│   │   ├── suggest-context.test.ts
│   │   ├── proxy.test.ts
│   │   ├── admin.test.ts
│   │   └── health.test.ts
│   ├── repositories/    # 리포지토리 테스트
│   │   ├── codeRepository.test.ts
│   │   ├── eventRepository.test.ts
│   │   └── catalogRepository.test.ts
│   ├── services/        # 서비스 테스트
│   │   └── rateLimitService.test.ts
│   └── lib/
│       ├── ai/
│       │   ├── generationPipeline.test.ts
│       │   └── promptBuilder.test.ts
│       ├── correlationId.test.ts
│       └── db/
│           └── failover.test.ts
├── providers/ai/        # Co-located 단위 테스트
│   ├── ClaudeProvider.test.ts
│   └── AiProviderFactory.test.ts
├── services/            # Co-located 단위 테스트
│   ├── projectService.test.ts
│   └── deployService.test.ts
└── lib/
    ├── ai/
    │   ├── codeParser.test.ts
    │   ├── codeValidator.test.ts
    │   ├── qualityLoop.test.ts
    │   ├── categoryDesignMap.test.ts
    │   ├── slugSuggester.test.ts
    │   └── promptBuilder.test.ts
    ├── auth/
    │   └── authorize.test.ts
    ├── config/
    │   └── providers.test.ts
    ├── qc/
    │   └── renderingQc.test.ts
    └── utils/
        ├── errors.test.ts
        └── encryption.test.ts
```

## 명령어

```bash
pnpm test              # 전체 테스트 실행
pnpm test:unit         # 단위 테스트 (lib, providers)
pnpm test:integration  # 통합 테스트 (API routes)
pnpm test:coverage     # 커버리지 리포트
```

## 테스트 패턴

### Mock 규칙
- 외부 서비스 (Supabase, AI API): 항상 mock
- 내부 모듈: `vi.mock()` 사용
- AiProviderFactory mock 시 `create`와 `createForTask` 모두 포함 필수
- `vi.mock()` factory 안에서 top-level 변수 참조 금지 (hoisting 문제)

### 환경변수 테스트
```typescript
const originalEnv = process.env;
beforeEach(() => { process.env = { ...originalEnv }; });
afterEach(() => { process.env = originalEnv; });
```

### 싱글톤 캐시 초기화
```typescript
// AiProviderFactory의 static Map 초기화
AiProviderFactory.clearCache();

// DB/Auth provider 감지 캐시 초기화
_resetProviderCache();
```

## 검증 파이프라인

코드 변경 후 순서대로 실행:
1. `pnpm type-check` — TypeScript 타입 검증
2. `pnpm test` — 전체 테스트
3. `pnpm build` — 프로덕션 빌드 (환경변수 필요)
