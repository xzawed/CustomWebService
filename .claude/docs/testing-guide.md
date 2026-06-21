# 테스트 가이드

## 테스트 구조

```
src/
├── __tests__/           # 통합 테스트 (API routes, services, lib)
│   ├── api/             # API 라우트 테스트 (19개 파일)
│   │   ├── admin.test.ts
│   │   ├── admin-debug.test.ts
│   │   ├── admin-keys-verify.test.ts
│   │   ├── admin-test-generation.test.ts
│   │   ├── catalog.test.ts
│   │   ├── deploy.test.ts
│   │   ├── generate.test.ts
│   │   ├── health.test.ts
│   │   ├── preview.test.ts
│   │   ├── projects.test.ts
│   │   ├── projects-publish.test.ts
│   │   ├── projects-rollback.test.ts
│   │   ├── projects-slug-check.test.ts
│   │   ├── proxy.test.ts
│   │   ├── site.test.ts
│   │   ├── suggest-apis.test.ts
│   │   ├── suggest-context.test.ts
│   │   ├── suggest-modification.test.ts
│   │   └── suggest-preferences.test.ts
│   ├── repositories/    # 리포지토리 테스트
│   │   ├── catalogRepository.test.ts
│   │   ├── codeRepository.test.ts
│   │   ├── eventRepository.test.ts
│   │   ├── drizzleCatalogRepository.test.ts
│   │   ├── drizzleCodeRepository.test.ts
│   │   ├── drizzleEventRepository.test.ts
│   │   ├── drizzleProjectRepository.test.ts
│   │   ├── drizzleRateLimitRepository.test.ts
│   │   ├── drizzleUserApiKeyRepository.test.ts
│   │   └── drizzleUserRepository.test.ts
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
    ├── ai/              # 대표 예시 — 실제 18개 *.test.ts
    │   ├── codeParser.test.ts
    │   ├── codeValidator.test.ts
    │   ├── qualityLoop.test.ts
    │   ├── qualityLoop.adoption.test.ts
    │   ├── categoryDesignMap.test.ts
    │   ├── slugSuggester.test.ts
    │   ├── autoFix.test.ts
    │   ├── featureExtractor.test.ts
    │   ├── generationPipeline.test.ts
    │   ├── generationSaver.test.ts
    │   ├── generationTracker.test.ts
    │   ├── placeholderPatterns.test.ts
    │   ├── preferencesRecommender.test.ts
    │   ├── sseWriter.test.ts
    │   ├── stageRunner.test.ts
    │   └── promptBuilder.test.ts
    ├── catalog/         # 🩺 카탈로그 헬스체크·키 검증 (신규)
    │   ├── healthCheck.test.ts
    │   └── keyCheck.test.ts
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
pnpm keys:verify       # 플랫폼 API 키 검증 (배포 런타임 전용)
pnpm catalog:healthcheck  # DB 기반 카탈로그 라이브 헬스체크
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
