> **체크리스트 only.** 스택 진실원은 루트 `CLAUDE.md` + `docs/architecture/system-spec.md`. 명령 존재 여부는 `package.json` `scripts`가 정본.

프로젝트 검증 파이프라인을 **순서대로** 실행한다.

1. `pnpm lint` — ESLint (`eslint src`)
2. `pnpm type-check` — `tsc --noEmit`
3. `pnpm test` — 전체 Vitest (`vitest run`)

선택(변경 범위에 따라):

- `pnpm test:unit` — lib · providers · services · repositories
- `pnpm test:integration` — `src/__tests__/api` · `src/app/api`
- 서빙/CSP 변경 시: `/verify-csp`, `/verify-serving` 체크리스트 또는 `pnpm test:e2e` (env 불필요 · `pnpm build` 선행)

각 단계 실패 시 파일·라인·에러 메시지를 보고하고 다음 단계로 넘기지 말 것.  
전부 통과 시 명령별 결과만 짧게 요약.
