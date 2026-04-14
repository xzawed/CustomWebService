프로젝트 전체 검증 파이프라인을 순서대로 실행하세요:

1. `pnpm lint` — ESLint 검사
2. `pnpm type-check` — TypeScript 타입 검사
3. `pnpm test` — 전체 테스트 실행

각 단계에서 실패가 발생하면 해당 파일과 라인 정보를 포함하여 보고하세요.
모든 단계가 통과하면 결과를 요약하세요.
