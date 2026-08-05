# ADR: 프로덕션 인시던트 회고 — ET API 마이그레이션 및 연쇄 장애 (2026-05-03)

> **언제 읽나**: ClaudeProvider thinking/ET, qualityLoop 타임아웃 로그, browserPool executablePath, builder genStatus 고착, RATE_LIMIT_BYPASS_USER_IDS 를 손댈 때 — 2026-05-03 생성 전면 장애 연쇄 인시던트 회고

## 배경

2026-05-03 프로덕션 서비스(xzawed.xyz)에서 코드 생성 기능이 전면 장애 상태에 빠지는 인시던트가 발생했다. 직접 원인은 Anthropic의 Extended Thinking(ET) API 브레이킹 체인지였으나, 이를 대응하는 과정에서 기존에 잠재하고 있던 4개의 독립 문제가 연쇄적으로 드러났다.

이 문서는 각 원인의 발생 경위, 적용된 수정, 재발 방지 과제를 기록한다.

---

## 발견된 문제들

### 원인 1: Anthropic Extended Thinking API 브레이킹 체인지

**현상**: ET 활성화 조건(API 수 ≥ 3 또는 컨텍스트 ≥ 500자)에 해당하는 모든 코드 생성 요청이 실패.

**근본 원인**: Anthropic이 `claude-opus-4-7` 모델에서 Extended Thinking 활성화 방식을 변경했다. 기존 방식(`thinking: { type: 'enabled', budget_tokens: 32000 }`)이 deprecated되어 API가 오류를 반환하기 시작했다.

**영향 범위**: ET 조건을 충족하는 생성 요청 전체. 단순 요청(ET 비활성)은 정상 동작.

**관련 파일**: `src/providers/ai/ClaudeProvider.ts`

---

### 원인 2: Quality Loop 타임아웃 오설정

**현상**: Quality Loop 재시도가 AI 응답을 받기 전 매번 타임아웃으로 실패.

**근본 원인**: 운영 환경변수 `QUALITY_LOOP_ITERATION_TIMEOUT_MS=80000`(80초)이 실제 AI 응답 소요 시간(90~150초)보다 짧게 설정되어 있었다. ADR 2026-04-29에서 기본값(120,000ms)과 함께 도입된 기능이었으나, 운영 환경에 80초로 잘못 설정된 채 방치되었다.

**복합 요인**: `qualityLoop.ts`의 `logger.warn` 호출에서 `Error` 객체를 `JSON.stringify`로 직렬화할 때 `{}` 빈 객체가 출력되는 버그가 있어, 타임아웃 에러 내용이 로그에서 완전히 소실되었다. 이로 인해 문제를 조기에 발견하지 못했다.

**영향 범위**: Quality Loop가 트리거되는 모든 재시도 경로.

**관련 파일**: `src/lib/ai/qualityLoop.ts`

---

### 원인 3: Playwright executablePath 미전달 및 Alpine 폰트 의존성 누락

**현상**: 모든 QC 단계에서 `browserType.launch: Executable doesn't exist` 오류 발생.

**초기 진단 (부정확)**: "Playwright Chromium 바이너리가 미설치"로 추정했으나, Dockerfile에 `apk add chromium`이 이미 존재하고 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` 환경변수도 설정된 상태였다.

**실제 근본 원인 (2개)**:
1. `playwright-core`는 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 환경변수를 **자동으로 읽지 않는다**. `chromium.launch({ executablePath })` 옵션에 명시적으로 전달해야 하며, 미전달 시 playwright-core가 자체 다운로드 경로(`/home/nextjs/.cache/ms-playwright/chromium_headless_shell-1217/...`)를 탐색하다 실패한다.
2. Alpine 시스템 Chromium 실행에 필요한 폰트 패키지(`nss`, `freetype`, `harfbuzz`, `ttf-freefont`)가 Dockerfile에서 누락되어 렌더링 품질 저하 위험이 있었다.

**영향 범위**: Rendering QC가 활성화된 모든 생성/재생성 요청.

**관련 파일**: `src/lib/qc/browserPool.ts`, `Dockerfile`

---

### 원인 4: 빌더 페이지 생성 완료 상태 고착

**현상**: 서버 재배포 후 일부 사용자의 빌더 페이지에서 생성 버튼이 영구적으로 비활성화됨.

**근본 원인**: 재배포로 인해 `generationTracker`(인메모리 싱글톤)가 초기화되면서 진행 중이던 생성 상태가 소실되었다. 클라이언트 폴링이 DB 폴백으로 전환되어 `completed` 상태를 반환했고, `genStatus='completed'` 조건에서 생성 버튼이 숨겨지는 동시에 모드 리셋이 잠겨 UI 탈출이 불가능한 상태가 되었다.

**복합 요인**: 이 버그는 정상 운영 중에도 잠재적으로 존재하고 있었으나, 배포 전후 상태 전환 시점에 빈번하게 드러났다.

**영향 범위**: 서버 재배포 직전·직후 생성 요청을 진행하던 사용자.

**관련 파일**: `src/app/(main)/builder/page.tsx`

---

### 원인 5: 일일 생성 한도 초과 (관리자 계정)

**현상**: 관리자 계정으로 생성 요청 시 "일일 한도 초과" 오류 반환.

**근본 원인**: 인시던트 대응 과정에서 반복 테스트로 `MAX_DAILY_GENERATIONS` 한도에 도달했다. 관리자 계정도 일반 사용자와 동일한 레이트리밋 적용 대상이었고, 우회 수단이 없었다.

**영향 범위**: 반복 테스트가 필요한 인시던트 대응 및 디버깅 시나리오.

**관련 파일**: `src/services/rateLimitService.ts`

---

## 적용된 수정

### 수정 1: ET API 마이그레이션 (PR #90)

**변경 내용**: `ClaudeProvider.ts`에서 Extended Thinking 활성화 방식을 신규 API 스펙으로 전환.

- 구: `thinking: { type: 'enabled', budget_tokens: 32000 }`
- 신: `thinking: { type: 'adaptive' }` + `output_config: { effort: 'high' }`

**배포 필요**: 예 (코드 변경).

---

### 수정 2: Quality Loop 비활성화 (환경변수)

**변경 내용**: `QUALITY_LOOP_MAX_ITERATIONS=0` 환경변수 설정으로 Quality Loop 전체 비활성화.

**배포 필요**: 아니오 (Railway 환경변수 재배포 없이 반영).

**임시 조치**: 타임아웃 값 재조정 및 logger 버그 수정 후 재활성화 예정.

---

### 수정 3: Rendering QC 비활성화 (임시) → Playwright executablePath 수정 (PR #94)

**1단계 임시 조치**: `ENABLE_RENDERING_QC=false` 환경변수 설정으로 Playwright 기반 QC 즉시 비활성화.

**2단계 근본 수정 (PR #94)**:
- `src/lib/qc/browserPool.ts`: `chromium.launch()` 에 `executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 명시 전달. 환경변수 미설정 시 playwright 기본값 유지 (로컬 개발 호환).
- `src/lib/qc/browserPool.ts`: `--disable-setuid-sandbox` 인자 추가 (Alpine 비루트 컨테이너 호환).
- `Dockerfile`: `nss`, `freetype`, `harfbuzz`, `ca-certificates`, `ttf-freefont` 추가 (텍스트 렌더링 품질 보장).

**배포 필요**: 예 (PR #94 코드 변경 + Docker 이미지 재빌드).

**재활성화**: PR #94 Railway 배포 완료 후 `ENABLE_RENDERING_QC=true` 설정.

---

### 수정 4: 빌더 페이지 UX 개선 (PR #91)

**변경 내용**:
- "새로 생성하기" 버튼 추가 — `completed` 상태에서도 새 생성을 시작할 수 있는 명시적 탈출 경로 제공
- 생성 버튼의 `disabled` 조건 완화 — `completed` 상태에서 버튼을 무조건 숨기지 않도록 변경

**배포 필요**: 예 (코드 변경).

---

### 수정 5: 관리자 레이트리밋 우회 및 DB 초기화 (PR #92)

**변경 내용**:
- `RATE_LIMIT_BYPASS_USER_IDS` 환경변수 추가 — 쉼표 구분 사용자 ID 목록, 일일 생성 한도 적용 제외
- `rateLimitService.ts`에서 해당 사용자 ID 확인 로직 추가
- DB의 해당 계정 일일 생성 카운트 직접 초기화

**배포 필요**: 예 (코드 변경).

---

## 재발 방지 과제

아래 항목은 이번 인시던트에서 임시 조치(환경변수 플래그)로 우회된 상태이며, 근본 수정이 완료되어야 재활성화할 수 있다.

### [해결됨] Playwright executablePath 수정 (PR #94)

- **수정 내용**: `browserPool.ts`에서 `chromium.launch({ executablePath })` 명시 전달 + Dockerfile Alpine 폰트 의존성 추가
- **현재 상태**: PR #94 배포 후 `ENABLE_RENDERING_QC=true` 재활성화 완료
- **관련 파일**: `src/lib/qc/browserPool.ts`, `Dockerfile`

### [미해결] logger Error 직렬화 버그

- **과제**: `qualityLoop.ts` 및 전체 코드베이스의 `logger.warn/error(JSON.stringify(err))` 패턴을 `logger.warn(err.message ?? String(err))` 또는 구조화된 로깅으로 교체
- **우선순위**: 높음 — 에러 내용 소실은 디버깅을 극도로 어렵게 만든다
- **현재 상태**: 미수정. 타임아웃 버그는 환경변수로 우회되었으나 로깅 버그는 잔존

### [미해결] Quality Loop 타임아웃 값 재조정 및 재활성화

- **과제**: 운영 환경의 실제 AI 응답 시간 데이터 수집 후 `QUALITY_LOOP_ITERATION_TIMEOUT_MS` 적정값 결정 및 `QUALITY_LOOP_MAX_ITERATIONS` 재활성화
- **우선순위**: 중간 — Quality Loop 비활성화는 재생성 품질 저하를 수반함
- **현재 상태**: `QUALITY_LOOP_MAX_ITERATIONS=0`으로 비활성화 중
- **참고**: ADR 2026-04-29에 기본값 120,000ms 근거 기술됨

### [권장] ET API 변경 사전 감지 체계

- **과제**: Anthropic API changelog 구독 및 `ClaudeProvider.ts` 통합 테스트에서 ET 파라미터 형식 검증 케이스 추가
- **우선순위**: 중간 — API 브레이킹 체인지는 사전 예고 없이 발생할 수 있음

### [권장] generationTracker 배포 복원력 개선

- **과제**: 재배포 시 `generating` 상태를 DB에서 복원하거나, 클라이언트가 `generating` → `unknown` 전환 시 명시적 안내 제공
- **우선순위**: 낮음 — PR #91로 UI 탈출은 가능해졌으나, 근본적 상태 복원은 미구현
- **참고**: Railway 단일 인스턴스 전제가 유지되는 한 인메모리 방식 유지; 멀티 인스턴스 전환 시 Redis 교체 필요 (generationTracker CLAUDE.md 주의사항 참고)

---

## 교훈

### 환경변수 오설정의 장기 잠복

`QUALITY_LOOP_ITERATION_TIMEOUT_MS=80000` 설정은 ADR 2026-04-29에서 기능이 도입된 이후 오랫동안 잘못된 값으로 방치되었다. **환경변수 기본값과 운영 설정값의 주기적 감사가 필요**하다. 특히 타임아웃·한도 관련 값은 실측 데이터를 기반으로 설정하고, `docs/reference/env-vars.md`에 권장 범위를 명시해야 한다.

### 로그 손실의 연쇄 영향

`JSON.stringify(Error)` 버그로 에러 내용이 소실되지 않았다면 타임아웃 오설정을 훨씬 일찍 발견했을 것이다. **에러 객체를 문자열로 변환할 때는 반드시 `err.message`나 구조화된 포맷을 사용**해야 한다. `JSON.stringify`는 `Error` 인스턴스에서 `{}` 를 반환한다는 점은 JavaScript의 잘 알려진 함정이다.

### 환경변수 ≠ 라이브러리 설정

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` 환경변수를 설정했어도 `playwright-core`가 이를 자동으로 읽지 않는다. **라이브러리가 환경변수를 암묵적으로 읽는다고 가정하지 말고, 공식 문서에서 지원 여부를 직접 확인**해야 한다. `playwright`(풀 패키지)와 `playwright-core`(코어 패키지)는 동작 방식이 다르며, 특히 실행 경로 탐색 로직이 다르다.

환경변수 → 라이브러리 API 파라미터 전달이 필요한 경우는 코드에서 명시적으로 처리해야 한다:
```typescript
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
chromium.launch({ ...(executablePath && { executablePath }) });
```

### 인시던트 대응 계정은 레이트리밋 예외 필요

관리자 계정이 레이트리밋 적용 대상이면, 인시던트 대응 중 반복 테스트로 한도에 도달하여 대응 자체가 불가능해지는 아이러니가 발생한다. **관리자/개발자 계정에 대한 레이트리밋 우회 메커니즘은 기능 출시 전에 준비**되어야 한다.

### 임시 조치(환경변수 플래그)의 추적 관리

이번 인시던트에서 `QUALITY_LOOP_MAX_ITERATIONS=0`과 `ENABLE_RENDERING_QC=false`는 즉각적이고 효과적인 임시 조치였다. 그러나 이러한 임시 비활성화 상태가 장기간 지속되면 원래 기능이 영구 손실될 위험이 있다. **임시 조치에는 반드시 추적 이슈(GitHub Issue)를 생성하고 이 ADR에 참조 링크를 남겨야 한다**.

---

## 관련 파일

- `src/providers/ai/ClaudeProvider.ts` — ET API 마이그레이션 (원인 1 수정, PR #90)
- `src/lib/ai/qualityLoop.ts` — `resolveMaxIterations(0)` 버그 수정 (원인 2 관련, PR #93)
- `src/lib/utils/logger.ts` — Error 직렬화 버그 수정 (원인 2 관련, PR #93)
- `src/lib/qc/browserPool.ts` — Playwright executablePath 명시 전달 (원인 3 수정, PR #94)
- `Dockerfile` — Alpine 폰트 의존성 추가 (원인 3 수정, PR #94)
- `src/app/(main)/builder/page.tsx` — 생성 완료 상태 고착 수정 (원인 4 수정, PR #91)
- `src/services/rateLimitService.ts` — 관리자 레이트리밋 우회 (원인 5 수정, PR #92)
- [ADR 2026-04-29](2026-04-29-generation-success-rate-improvement.md) — Quality Loop 타임아웃 기능 도입 배경
