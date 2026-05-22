# 보안 감사 발견 항목 수정 ADR

**날짜:** 2026-05-23  
**PR:** [#129](https://github.com/xzawed/CustomWebService/pull/129) (C-1·H-2·H-3·H-4·H-9), [#131](https://github.com/xzawed/CustomWebService/pull/131) (H-5·H-6·H-7·H-8·H-10·H-11)  
**상태:** 완료

---

## 배경

전체 코드 품질 감사에서 발견된 보안 취약점 11건(CRITICAL 1건, HIGH 10건)을 우선순위에 따라 두 PR로 나눠 수정.

---

## 수정 항목 (PR #129 — C-1·H-2~H-4·H-9)

### C-1 (CRITICAL): iframe sandbox allow-same-origin 제거

**파일:** `src/app/(main)/preview/[projectId]/page.tsx`

`allow-scripts + allow-same-origin` 조합은 iframe sandbox를 완전히 우회한다. 악성 생성 코드가 부모 DOM에 접근하거나 세션 토큰을 탈취할 수 있었음.

**수정:** `sandbox="allow-scripts allow-same-origin"` → `sandbox="allow-scripts"`

`allow-same-origin`을 제거해도 동일 출처 fetch는 불가능하나, 생성 코드는 어차피 `/api/v1/proxy`를 통해 외부 API를 호출하므로 기능에 영향 없음.

---

### H-2 (HIGH): 프록시 환경변수 denylist

**파일:** `src/app/api/v1/proxy/route.ts`

`process.env[cfg.env_var]` 직접 조회 시 Supabase Service Role Key, Anthropic API Key 등 서버 시크릿을 노출할 수 있었음. DB 쓰기 권한 탈취 시 공격자가 임의의 환경변수를 읽는 경로.

**수정:** 접근 차단 denylist 추가:
```ts
const ENV_VAR_DENYLIST = new Set([
  'SUPABASE_SERVICE_ROLE_KEY',
  'ANTHROPIC_API_KEY',
  'ENCRYPTION_KEY',
  'ADMIN_API_KEY',
  'GITHUB_TOKEN',
  'RAILWAY_TOKEN',
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'JWT_SECRET',
  'SESSION_SECRET',
]);
```
denylist 항목 조회 시 404 반환.

---

### H-3 (HIGH): generationTracker.start() TOCTOU 레이스 제거

**파일:** `src/app/api/v1/generate/route.ts`, `src/app/api/v1/generate/regenerate/route.ts`, `src/lib/ai/generationPipeline.ts`

기존 구현은 `isGenerating` 체크 후 `ReadableStream` 생성 중에 `tracker.start()`를 호출했다. `await`가 포함된 구간에서 두 요청이 동시에 체크를 통과하면 하나의 프로젝트에 중복 생성이 시작될 수 있었음.

**수정:** `tracker.start()`를 `isGenerating` 체크 직후, `ReadableStream` 생성 전으로 이동. JavaScript 단일 스레드 특성 덕분에 이 구간에 `await`가 없으면 원자적 동작이 보장됨.

---

### H-4 (HIGH): quality loop 결과물 보안 재검증

**파일:** `src/lib/ai/generationPipeline.ts`

quality loop가 새 코드를 생성했을 때(`qualityLoopUsed=true`) 해당 코드가 보안 검증(`validateAll`)을 거치지 않고 저장됐음. `eval()` 사용, `document.cookie` 접근 등 악성 패턴이 삽입된 코드가 프로덕션에 게시될 수 있었음.

**수정:** `qualityLoopUsed === true`일 때 `validateAll()`을 재실행. 검증 실패 시 저장하지 않고 SSE error 이벤트를 전송하며 일일 한도를 복원.

---

### H-9 (HIGH): suggest-context·suggest-modification 일일 rate limit 추가

**파일:** `src/app/api/v1/suggest-context/route.ts`, `src/app/api/v1/suggest-modification/route.ts`

두 엔드포인트가 인증은 있으나 rate limit 없이 Anthropic API를 무제한 호출 가능했음. 비용 및 할당량 고갈 위험.

**수정:** `createRateLimitService()`를 통해 일일 생성 한도(`checkAndIncrementDailyLimit`)를 적용.

---

## 수정 항목 (PR #131 — H-5~H-8·H-10~H-11)

### H-5 (HIGH): connect-src CSP 와일드카드 제거

**파일:** `src/lib/constants/cdn.ts`

사용자 페이지 CSP의 `connect-src *`는 `http:` 프로토콜을 포함한 모든 외부 서버로의 연결을 허용. 평문 HTTP exfiltration 경로.

**수정:** `connect-src *` → `connect-src 'self' https: wss:`

생성된 코드는 `fetch('/api/v1/proxy?...')` 형태로 동일 출처를 통해 외부 API를 호출하므로 기능에 영향 없음.

---

### H-6 (HIGH): ENCRYPTION_KEY 빈 문자열 처리

**파일:** `src/lib/encryption.ts`

기존 구현은 `process.env.ENCRYPTION_KEY ?? ''`로 읽어 빈 문자열을 32바이트 체크로만 걸렀음. 빈 문자열(0바이트)이면 "32바이트 미만" 에러를 던졌지만, 환경변수 미설정 상황과 구분이 불명확했음.

**수정:** `!raw` 조건으로 빈 문자열·undefined 모두 "환경변수가 설정되지 않았습니다" 에러로 통일. 32바이트 초과 시 경고 후 앞 32바이트만 사용하는 동작 명시.

---

### H-7 (HIGH): AbortError 재시도 방지

**파일:** `src/providers/ai/ClaudeProvider.ts`

`isRetryableError()`에서 `AbortError`를 별도로 처리하지 않아 클라이언트가 요청을 취소해도 내부적으로 최대 2회 재시도가 발생했음. 불필요한 Anthropic API 비용 및 할당량 소모.

**수정:** `isRetryableError()` 최상단에 `if (error instanceof Error && error.name === 'AbortError') return false` 추가.

---

### H-8 (HIGH): RePromptPanel 폴링 루프 언마운트 누수

**파일:** `src/components/builder/RePromptPanel.tsx`

`pollForRegeneration()`은 컴포넌트가 언마운트된 후에도 최대 120초(120회 × 1초) 동안 계속 실행됐음. `setStatus`, `setProgress` 등 state 업데이트가 언마운트된 컴포넌트에 호출되는 메모리 누수.

**수정:** `mountedRef = useRef(true)` + `useEffect` cleanup으로 언마운트 시 `mountedRef.current = false`. 폴링 루프 각 반복 시작 시 `if (!mountedRef.current) return` 조기 종료.

---

### H-10 (HIGH): 암호화 번들 클라이언트 노출 제거

**파일:** `src/app/(main)/settings/api-keys/ApiKeyPageClient.tsx`, `src/app/(main)/settings/api-keys/page.tsx`

`'use client'` 컴포넌트에서 `decryptApiKey`를 직접 임포트. SSR 시 서버에서만 실행되나 `ENCRYPTION_KEY`를 사용하는 암호화 번들이 클라이언트 JavaScript로 전송됐음. ENCRYPTION_KEY 자체는 노출되지 않지만 암호화 알고리즘·포맷이 클라이언트에 공개됨.

**수정:** `toMasked()` 함수(decryptApiKey + maskApiKey 호출)를 서버 컴포넌트 `page.tsx`로 이동. 클라이언트에는 이미 마스킹된 `SavedKey[]`만 전달. `ApiKeyPageClient`에서 `@/lib/encryption` 의존성 완전 제거.

---

### H-11 (HIGH): qc-stats NaN/음수 days 가드

**파일:** `src/app/api/v1/admin/qc-stats/route.ts`

`?days=abc`(NaN) 또는 `?days=-5`(음수) 입력 시 날짜 계산이 `Infinity` 또는 미래 시점이 되어 의도치 않은 쿼리 범위가 생성됐음.

**수정:**
```ts
const daysRaw = parseInt(url.searchParams.get('days') ?? '7', 10);
const days = Number.isNaN(daysRaw) || daysRaw <= 0 ? 7 : daysRaw;
```
NaN 또는 0 이하 입력 시 기본값 7로 폴백.

---

## 테스트 영향

- 총 1776개 테스트 통과
- 신규 테스트:
  - `generationPipeline.integration.test.ts`: quality loop 재검증 케이스 2개 추가
  - `suggest-context.test.ts`, `suggest-modification.test.ts`: rate limit 의존성 모킹 추가
  - `ClaudeProvider.test.ts`: AbortError 즉시 throw 케이스 추가
  - `qc-stats.test.ts`: NaN/음수/유효값 5개 케이스 신규 작성
- SonarCloud `new_coverage` ≥ 80%, Codecov patch ≥ 86.47% 통과
