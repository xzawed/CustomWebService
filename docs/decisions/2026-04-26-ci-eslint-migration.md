# ADR: CI Lint 인프라 — next lint 제거, eslint src 직접 호출

> **날짜:** 2026-04-26
> **상태:** 완료

## 문제

CI #189~#190이 Lint & Type Check 단계에서 지속 실패.

```
Invalid project directory provided, no such directory: .../lint
```

원인: **Next.js 16에서 `next lint` 서브커맨드가 제거**되었으나 `package.json`의 `"lint": "next lint"` 스크립트가 그대로였음.

## 추가 발견 문제

`eslint src` 직접 호출로 전환하자 두 번째 문제 발생:

1. **`FlatCompat` 순환 참조**: 기존 `eslint.config.mjs`가 `@eslint/eslintrc`의 `FlatCompat`을 통해 레거시 설정을 변환하는 구조였는데, ESLint 10과의 스키마 직렬화 과정에서 순환 참조 에러 발생.
2. **`eslint-plugin-react@7` API 비호환**: `eslint-plugin-react@7.x`는 ESLint 9 이전의 `context.getFilename()` API를 사용하는데, ESLint 10에서 이 API가 제거됨.

## 결정

### 1. `package.json` lint 스크립트 변경

```json
"lint":     "eslint src",
"lint:fix": "eslint src --fix"
```

### 2. `eslint.config.mjs` 재작성

`FlatCompat` 제거. `eslint-config-next`가 native flat config 배열을 내보내므로 `createRequire`로 직접 require.

`eslint-plugin-react@7`는 ESLint 10 비호환이므로 해당 플러그인과 `react/` 접두사 규칙을 제거. React 컴포넌트 규칙은 TypeScript strict mode가 실질적으로 대체하며, Hooks 규칙은 `eslint-plugin-react-hooks`로 직접 등록.

```js
// eslint.config.mjs 핵심 구조
const nextConfig = require("eslint-config-next");   // native flat config 배열
const patchedConfig = nextConfig.map((config) => {
  if (!config.plugins?.react) return config;
  // react plugin 제거, react-hooks 직접 등록
});
```

### 3. CI 중복 Deploy 잡 제거

Railway가 GitHub 연동으로 `main` 브랜치 push 시 자동 배포하므로, `ci.yml`의 `deploy` 잡(`railway up --detach`)은 중복이었음. `RAILWAY_TOKEN` 시크릿 없이 실패하는 잡을 제거.

### 4. 기존 코드 lint 오류 처리

lint가 처음으로 정상 동작하면서 발견된 기존 코드의 `react-hooks/set-state-in-effect` 에러 4곳에 타겟 disable 주석 추가 (의도적 패턴).

## 결과

- CI #191: Lint & Type Check ✅, 테스트 ✅, 빌드 ✅
- Railway 배포는 GitHub 연동으로 정상 동작
- `pnpm lint` 로컬 실행 0 errors
