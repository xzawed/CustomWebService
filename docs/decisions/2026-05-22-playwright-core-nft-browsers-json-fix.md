# playwright-core browsers.json nft 추적 실패 수정

**Status**: Accepted  
**Date**: 2026-05-22  
**PR**: #125, #127

---

## Context

Next.js standalone 빌드(`output: 'standalone'`)는 Node File Tracer(nft)를 사용하여 런타임에 필요한 파일만 `.next/standalone`으로 복사한다. nft는 정적 `require()`/`import` 구문을 파싱해서 의존 파일을 추적하지만, **동적으로 계산된 경로는 추적하지 못한다**.

`playwright-core` 패키지의 `coreBundle.js`는 내부적으로 다음 패턴으로 `browsers.json`을 로드한다:

```js
require(path.join(__dirname, '..', 'browsers.json'))
```

이 패턴은 문자열 리터럴이 아닌 `path.join()` 호출이므로 nft의 정적 분석 대상에서 제외된다. 결과적으로 `.next/standalone/node_modules/playwright-core/` 아래에 `browsers.json`이 복사되지 않고, 런타임에 `playwright-core` 모듈을 초기화할 때 파일을 찾지 못해 모듈 로드가 실패한다.

이 문제는 generate/regenerate 라우트(`/api/v1/generate`, `/api/v1/regenerate`)가 Quality Loop 단계에서 `browserPool`을 통해 `playwright-core`를 초기화할 때 터진다. 결과적으로 두 라우트 모두 HTTP 500을 반환하게 된다.

### 영향 범위

- **기간**: 2026-05-15 ~ 2026-05-22 (7일간 프로덕션 500 오류 지속)
- **영향 기능**: 코드 생성 및 재생성 전체 (Quality Loop가 비활성화되지 않는 한)
- **이전 수정과의 관계**: PR #94에서 `executablePath`를 명시적으로 전달하는 수정이 이루어졌으나, `executablePath`가 가리키는 실행 파일이 있어도 `browsers.json` 누락으로 인해 `playwright-core` 모듈 자체가 초기화에 실패하는 별개의 문제였다.

---

## Root Cause

```
playwright-core/lib/coreBundle.js
  └── require(path.join(__dirname, '..', 'browsers.json'))   ← 동적 경로
        │
        └── nft 정적 분석 범위 밖
              │
              └── .next/standalone에 browsers.json 미복사
                    │
                    └── 런타임 모듈 초기화 실패 → HTTP 500
```

nft가 동적 `require`를 추적하지 못하는 것은 Next.js 및 Vercel의 알려진 한계다. 해결 방법은 크게 두 가지다:

1. **nft output traces에 파일을 수동 등록** (`next.config.ts`의 `outputFileTracingIncludes`)
2. **Dockerfile에서 빌드 후 해당 파일을 직접 복사**

본 프로젝트는 Dockerfile 기반 Railway 배포를 사용하므로 Dockerfile 방식이 더 직관적이고 검증하기 쉽다.

---

## Decision

### PR #125: Dockerfile에 browsers.json 직접 복사 단계 추가

nft가 복사한 `coreBundle.js`의 실제 위치를 런타임에 탐지하여, 같은 디렉터리의 상위(`..`) 경로에 `browsers.json`을 복사한다.

```dockerfile
# playwright-core의 browsers.json을 standalone에 수동 복사
# (nft는 coreBundle.js 내의 동적 require 경로를 추적하지 못함)
RUN set -e; \
    BUNDLE=$(find .next/standalone/node_modules -path "*/playwright-core/lib/coreBundle.js" -print -quit); \
    if [ -n "$BUNDLE" ]; then \
      DEST_DIR=$(dirname "$BUNDLE"); \
      SRC=$(find node_modules -path "*/playwright-core/browsers.json" -print -quit); \
      if [ -n "$SRC" ]; then \
        cp "$SRC" "$DEST_DIR/../browsers.json"; \
      fi; \
    fi
```

복사 로직을 `find`로 경로를 동적으로 탐지하는 이유는 Next.js 버전이나 nft 동작 변경에 따라 `coreBundle.js`의 실제 복사 위치가 달라질 수 있기 때문이다.

### PR #127: 복사 검증 단계 추가 (silent failure 방지)

복사가 실패했을 때 빌드가 성공적으로 완료되는 silent failure를 방지하기 위해, 복사 결과를 검증하는 단계를 추가한다.

```dockerfile
# 복사 검증: browsers.json이 없으면 빌드 실패
RUN set -e; \
    BUNDLE=$(find .next/standalone/node_modules -path "*/playwright-core/lib/coreBundle.js" -print -quit); \
    if [ -n "$BUNDLE" ]; then \
      DEST_DIR=$(dirname "$BUNDLE"); \
      if [ ! -f "$DEST_DIR/../browsers.json" ]; then \
        echo "ERROR: browsers.json not found at $DEST_DIR/../browsers.json"; \
        exit 1; \
      fi; \
      echo "OK: browsers.json verified at $DEST_DIR/../browsers.json"; \
    fi
```

---

## Consequences

### 긍정적

- generate/regenerate 라우트의 HTTP 500 오류 해소
- `playwright-core` 버전 업그레이드 시에도 `find`로 경로를 동적으로 탐지하므로 재작업 불필요
- 검증 단계로 인해 동일 문제가 재발하면 빌드 단계에서 즉시 감지됨

### 트레이드오프

- Dockerfile이 복잡해진다. 이 로직의 목적을 주석으로 명시하지 않으면 유지보수 시 혼동 가능하다.
- `playwright-core`의 내부 파일 구조(`browsers.json` 위치)가 바뀌면 복사가 실패할 수 있다. 검증 단계가 이를 빌드 시점에 감지한다.

---

## 재발 방지

### 유사 패턴 탐지 원칙

다음 조건이 모두 해당하는 패키지는 standalone 빌드 후 누락 파일을 확인해야 한다:

1. Node.js 런타임에서 초기화 시 파일 시스템 접근
2. `path.join(__dirname, ...)` 또는 `path.resolve(...)` 패턴의 동적 `require`
3. 접근 대상 파일이 `.js` 확장자가 아닌 경우 (`.json`, `.node`, 바이너리 등)

### 수정 시도 이력 (PR #119 ~ #125)

| PR | 시도 내용 | 결과 |
|----|----------|------|
| #119 | `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 환경변수 수정 | 실패 — executablePath와 무관한 문제 |
| #120 | playwright-core 버전 다운그레이드 | 실패 — 버전 무관 |
| #121 | `next.config.ts` outputFileTracingIncludes 추가 | 부분 성공 — 경로 패턴 불일치로 미적용 |
| #122 | outputFileTracingIncludes 경로 패턴 수정 | 실패 — nft가 glob 패턴을 다르게 해석 |
| #123 | 빌드 후 browsers.json 복사 (하드코딩 경로) | 실패 — nft 복사 위치가 예상과 다름 |
| #124 | `find`로 coreBundle.js 위치 동적 탐지 후 복사 | 성공 — 단 검증 없음 |
| #125 | #124 방식 유지 + 로그 개선 | 프로덕션 검증 완료 |
| #127 | 복사 검증 단계 추가 | 빌드 실패 조기 감지 보장 |

### 향후 고려사항

- `ENABLE_RENDERING_QC=false` 환경변수로 playwright-core 초기화 자체를 건너뛸 수 있다. 긴급 장애 시 이 방법으로 즉시 Quality Loop를 비활성화하면 피해를 줄일 수 있다.
- Next.js standalone 빌드 후 `node_modules` 크기를 모니터링하여 예상 외 파일 누락을 조기에 감지하는 CI 검증 추가를 검토한다.
