# AI 코드 생성 파이프라인

> **최종 업데이트:** 2026-04-17

## 1. 개요

사용자가 선택한 API와 입력한 컨텍스트를 기반으로 AI가 웹서비스 코드를 자동 생성하는 핵심 엔진 설계.

---

## 2. 코드 생성 파이프라인

### 2.1 3단계 생성 파이프라인

| 단계 | 진행률 | 목적 | 허용 편집 | QC |
|---|---|---|---|---|
| Stage 1 | 0→30% | 구조 + 실제 API 호출 구현 | HTML/CSS/JS 전부 | 정적 QC |
| Stage 2 (기능 검증) | 30→65% | fetch 버그·placeholder 수정 | JS 로직, 이벤트 핸들러, fetch, 데이터 바인딩 | 정적 QC + Fast Playwright QC |
| Stage 3 (디자인 폴리시) | 65→90% | 디자인·레이아웃 완성 | CSS/HTML 문구 (JS 변경 금지) | 정적 QC + Deep Playwright QC |

- DB에는 **Stage 3 결과물만** 저장
- Stage 2는 **조건부 실행**: `fetchCallCount === 0`, `placeholderCount > 0`, 또는 Fast QC 실패 시에만 수행. 모두 통과 시 Stage 1 코드를 그대로 Stage 3으로 전달 (LLM 호출 절감)
- Stage 3도 **조건부 실행**: `structuralScore >= 80 && mobileScore >= 70 && fetchCallCount > 0 && placeholderCount === 0 && !needsStage2` 조건 충족 시 스킵. Stage 1/2 결과가 충분히 고품질이면 디자인 폴리시 단계 생략

### 2.2 데이터 흐름

```
[입력]                    [처리]                      [출력]

선택된 API 목록    →  1. Stage 1: 구조 + API 호출  →  HTML 파일
API 상세 정보      →  2. 정적 QC + Fast QC         →  CSS 파일
사용자 컨텍스트    →  3. Stage 2: 기능 검증·수정    →  JS 파일
exampleCall 필드   →  4. Stage 3: 디자인 폴리시     →  설정 파일
                   →  5. 저장 + Deep QC + 알림
```

---

## 3. 프롬프트 엔지니어링

### 3.1 시스템 프롬프트

`src/lib/ai/promptBuilder.ts`의 `buildSystemPrompt(templateHint?)` 함수가 생성. 결과는 모듈 레벨에 캐싱된다.

**주요 규칙 (실제 구현 기준):**
1. Vercel, Linear, Spotify 수준의 완성도 — 비개발자가 보기에도 완성형 UI
2. **실제 API를 호출하고 응답을 파싱해 화면에 바인딩** — 하드코딩 배열·목 데이터 금지
3. 모든 API 호출은 `exampleCall` 또는 proxy URL(`/api/v1/proxy`)을 사용
4. Placeholder 금지 문자열: `홍길동`, `김철수`, `test@example.com`, `Loading...`, `준비 중`, `구현 예정`, `Sample Data`, `Lorem ipsum`
5. 레이아웃은 가로 방향 flex/grid 기본 (수직 스택 금지)
6. 모든 UI 텍스트 한국어

**필수 CDN (항상 포함):**
- Tailwind CSS CDN
- Pretendard Variable 폰트
- Font Awesome 6.5

**조건부 CDN:**
- Chart.js — 차트/시각화가 있을 때만
- Leaflet — 지도가 있을 때만

**서비스 유형별 자동 추론:** API 카테고리와 컨텍스트 키워드로 10가지 레이아웃 패턴 중 최적 선택 (뉴스/날씨/금융/쇼핑 등)

**템플릿 가이던스 (templateHint 있을 때 추가):**
```
[템플릿 가이던스]
{templateHint — 최대 2000자}
위의 레이아웃 구조를 반드시 따르세요. 위에 명시된 섹션 구성과
UI 패턴은 필수 사항입니다. 이 구조 안에서 콘텐츠와 API 통합 내용을 채워주세요.
```

### 3.2 사용자 프롬프트 구성

```
## 선택된 API 목록

### API 1: {{API 이름}}
- Base URL: {{base_url}}
- 인증 방식: {{auth_type}}
- 주요 엔드포인트:
{{#각 엔드포인트}}
  - {{method}} {{path}}: {{description}}
    파라미터: {{params}}
    응답 예시: {{response_example}}
    {{#exampleCall}}
    ✅ 실제 동작 예제:
    {{exampleCall}}
    {{/exampleCall}}
{{/각 엔드포인트}}

### API 2: {{API 이름}}
...

## 사용자 요청
{{사용자가 입력한 컨텍스트}}

## 생성 요구사항
위 API들을 활용하여 사용자 요청에 맞는 웹서비스를 생성해주세요.
다음 형식으로 코드를 반환해주세요:

### HTML
```html
(HTML 코드)
```

### CSS
```css
(CSS 코드)
```

### JavaScript
```javascript
(JavaScript 코드)
```
```

### 3.3 Stage 2 기능 검증 프롬프트

Stage 1 출력 코드 + 정적 QC 리포트를 입력받아 fetch 버그·placeholder·스키마 불일치만 수정:
```
## Stage 1 생성 코드
{{stage1_code}}

## 품질 검사 결과
fetchCallCount: {{n}}
placeholderCount: {{n}}
{{#issues}}[이슈 목록]{{/issues}}

JS 로직·이벤트 핸들러·fetch·데이터 바인딩만 수정하세요. 디자인·레이아웃은 건드리지 않습니다.
```

### 3.4 재생성 프롬프트 (수정 요청 시)
```
## 이전 생성 코드
{{이전 버전 코드}}

## 사용자 수정 요청
{{수정 피드백}}

위 피드백을 반영하여 코드를 수정해주세요.
변경된 부분만이 아니라 전체 코드를 반환해주세요.
```

---

## 4. 코드 검증 & 후처리

### 4.1 보안 검증
```typescript
interface SecurityCheck {
    // XSS 방지: innerHTML 대신 textContent 사용 확인
    checkXSS(code: string): ValidationResult;

    // eval() 사용 금지
    checkEval(code: string): ValidationResult;

    // API 키 노출 확인
    checkApiKeyExposure(code: string): ValidationResult;

    // 외부 스크립트 안전성 확인
    checkExternalScripts(code: string): ValidationResult;
}
```

### 4.2 기능 검증
```typescript
interface FunctionalCheck {
    // HTML 유효성
    validateHTML(html: string): ValidationResult;

    // CSS 문법 검사
    validateCSS(css: string): ValidationResult;

    // JS 문법 검사
    validateJS(js: string): ValidationResult;

    // API 엔드포인트 호출 형식 확인
    validateApiCalls(js: string, apis: ApiInfo[]): ValidationResult;
}
```

### 4.3 후처리
1. **API 키 플레이스홀더 변환**: `{{API_KEY}}` → 환경변수 참조
2. **코드 포맷팅**: Prettier 적용
3. **최적화**: 미사용 CSS 제거, JS minify (배포 시)
4. **메타 태그 추가**: title, description, viewport, og 태그

---

## 5. 생성 코드 구조

AI는 HTML·CSS·JS를 별도 블록으로 생성하고, `assembleHtml(html, css, js)` (`src/lib/ai/codeParser.ts`)가 **단일 index.html 파일**로 조립한다.

```
DB 저장 구조 (code_versions 테이블):
├── html      # CSS·JS가 인라인으로 합쳐진 완성형 index.html
├── css       # AI 원본 CSS (별도 저장)
├── js        # AI 원본 JS (별도 저장)
└── metadata  # QC 점수, templateId, 생성 시각 등
```

서빙 시 `/site/[slug]/route.ts`가 DB에서 html 컬럼을 읽어 `text/html`로 직접 응답한다.

---

## 6. AI Provider 구현

### 현재 구현
- **Claude API (Anthropic)** — 기본 Provider
  - 구현: `src/providers/ai/ClaudeProvider.ts`
  - 팩토리: `AiProviderFactory.create()`, `AiProviderFactory.createForTask()`
  - 모델: **`claude-opus-4-6`** (기본), 태스크별 최적 모델 자동 선택
  - 환경변수 오버라이드: `AI_MODEL_GENERATION` (코드 생성), `AI_MODEL_SUGGESTION` (slug 제안) — 허용 목록(`claude-*`) 검증 후 적용

### Provider 인터페이스 (`src/providers/ai/IAiProvider.ts`)
- `generateCode(prompt)` — 단일 응답 생성
- `generateCodeStream(prompt, onChunk)` — SSE 스트리밍 생성 (`AiStreamResult = AiResponse`)
- `AiPrompt.extendedThinking?: boolean` — Extended Thinking 활성화 플래그

### ClaudeProvider 재시도 전략 (`withRetry`)
- `generateCode` / `generateCodeStream` 모두 `withRetry()` 헬퍼로 래핑
- HTTP 429·500·502·503·504 또는 네트워크 에러 시 최대 2회 지수 백오프 재시도 (1초→2초)
- 재시도 불가 에러는 즉시 throw

### 성능 최적화 (현재 적용 중)

**Prompt Caching**
- 시스템 프롬프트에 `cache_control: { type: 'ephemeral' }` 적용 (`buildSystemParam()` in `ClaudeProvider.ts`)
- Anthropic 5분 캐시 TTL — 동일 시스템 프롬프트 반복 호출 시 Cache Read 단가($1.50/MTok) 적용
- Stage 1 시스템 프롬프트(~7K 토큰)가 주로 캐시됨

**Extended Thinking (조건부)**
- `shouldUseExtendedThinking(apis, context)` 함수로 사용 여부 결정:
  - **API 3개 이상** 또는 **컨텍스트 500자 이상** → ET 활성화 (복잡한 요구사항)
  - 그 외 → Opus only (빠르고 저렴)
- Stage 1 및 Quality Loop에 동일 조건 적용
- `budget_tokens: 32000` — Thinking 토큰 최대 허용량
- Thinking 활성화 시 `temperature: 1` 필수 (Anthropic API 요구사항)
- Thinking 토큰은 출력 단가($75/MTok)로 청구

**조건부 Stage 1 Fast QC 스킵**
- 정적 분석에서 이미 Stage 2가 필요함이 확정된 경우(`fetchCallCount === 0` 또는 `placeholderCount > 0`) Fast QC를 생략
- 결과가 어차피 Stage 2로 진행되므로 Playwright 실행 비용 절감

**slug fire-and-forget**
- `suggestSlugs()` 호출을 `void (async () => { ... })()` 비동기 패턴으로 전환
- 슬러그 제안 실패가 생성 완료를 블로킹하지 않음

### 확장 방법
1. `IAiProvider` 구현 클래스 추가
2. `AiProviderFactory`에 등록
3. 환경변수로 활성화

---

## 7. 템플릿 시스템 (Phase A-2 완료)

자주 요청되는 서비스 유형에 대한 공식 템플릿 10개를 제공하여 AI 생성 품질 향상.  
**하이브리드 방식**: 템플릿이 레이아웃/구조를 정의하고, AI가 그 구조 안에서 API 통합과 데이터 표시 방식을 채운다.

### 구현 구조
- `src/templates/ICodeTemplate.ts` — 인터페이스 (id, matchScore, generate → TemplateOutput)
- `src/templates/TemplateRegistry.ts` — 등록/조회/매칭 (singleton, `get(id)`, `findBestMatch(apis)`)
- 각 템플릿의 `generate()` 반환값 중 `promptHint`가 AI 시스템 프롬프트에 주입됨

### templateId → promptHint 주입 흐름
```
빌더 TemplateSelector 클릭
  → setTemplate(id) → contextStore.selectedTemplate
  → POST /api/v1/generate { projectId, templateId? }
  → templateRegistry.get(templateId)?.generate(ctx).promptHint
  → buildSystemPrompt(templateHint)
      → 시스템 프롬프트 끝에 [템플릿 가이던스] 블록 추가 (max 2000자)
  → AI 생성 (레이아웃 구조 강제 반영)
```

### promptHint 형식
```
Layout: [레이아웃 이름]
Required sections (in order): [섹션1], [섹션2], ...
UI patterns: [패턴 설명]
Must include: [필수 요소]
Avoid: [제외할 요소]
```

### 등록된 템플릿 11개
| ID | 클래스 | 레이아웃 | 적합한 API 카테고리 |
|----|--------|---------|-------------------|
| `dashboard` | DashboardTemplate | data-dashboard | 날씨, 금융, 통계, 뉴스 |
| `calculator` | CalculatorTemplate | input-result-tool | 환율, 단위, 계산 |
| `gallery` | GalleryTemplate | masonry-gallery | 이미지, 사진, 미디어 |
| `info-lookup` | InfoLookupTemplate | search-detail | 날씨, 인물, 장소, 사전 |
| `map-service` | MapServiceTemplate | map-sidebar | 지도, 위치, 장소 |
| `content-feed` | ContentFeedTemplate | vertical-feed | 뉴스, 블로그, 콘텐츠 |
| `comparison` | ComparisonTemplate | two-column-comparison | 비교, 환율, 주식 |
| `timeline` | TimelineTemplate | vertical-timeline | 이벤트, 일정, 역사 |
| `news-curator` | NewsCuratorTemplate | news-grid-curator | 뉴스, 미디어, 기사 |
| `quiz` | QuizTemplate | quiz-flow | 퀴즈, 교육, 학습 |
| `profile` | ProfileTemplate | profile-portfolio | 프로필, 포트폴리오, GitHub |

---

## 8. 생성 제한

| 항목 | 제한 |
|------|------|
| 프로젝트당 최대 API 수 | 5개 |
| 컨텍스트 최소 길이 | 50자 |
| 컨텍스트 최대 길이 | 2,000자 |
| 일일 생성 횟수 (사용자당) | 10회 |
| 재생성 횟수 (프로젝트당) | 5회 |
| 생성 타임아웃 | 3분 |

---

## 9. QC 통합 위치

코드 생성 완료 후 `docs/guides/qc-process.md`의 QC 파이프라인이 자동 실행된다.

생성 흐름:
1. Stage 1 → `codeValidator.validateAll()` (보안 차단) → `evaluateQuality()` (품질 점수, fetchCallCount 포함)
2. **조건부**: fetchCallCount=0, placeholderCount>0, 또는 Fast QC 실패 시에만 Stage 2 기능 검증 실행. 통과 시 Stage 1 코드 직행
3. **조건부**: `structuralScore >= 80 && mobileScore >= 70 && fetchCallCount > 0 && placeholderCount === 0 && !needsStage2` 충족 시 Stage 3 스킵
4. Stage 3 디자인 폴리시 실행 → DB 저장 → 비동기 Deep QC
5. **best-effort**: `void (async () => { suggestSlugs(...) })()` — slug 제안 실패가 완료를 블로킹하지 않음

`exampleCall` 흐름: DB JSONB(endpoints 배열) → `catalogRepository.parseEndpoints()` → `ApiEndpoint.exampleCall` → 사용자 프롬프트 `✅ 실제 동작 예제` 블록 → AI Stage 1 생성

**파이프라인 파일 구조** (`src/lib/ai/`):

| 파일 | 역할 |
|------|------|
| `generationPipeline.ts` | 오케스트레이터 (~120줄) — generate/regenerate 공통 진입점 |
| `stageRunner.ts` | `runStage1()` / `runStage2Function()` / `runStage3()` — SSE + AI 호출 + 파싱 |
| `generationSaver.ts` | DB 저장, slug 제안(fire-and-forget), 버전 정리, Deep QC, 상태 갱신, SSE complete |
| `qualityLoop.ts` | `shouldRetryGeneration()` + `runQualityLoop()` (최대 3회, best-of-n 반환) |
| `generationTracker.ts` | 서버 메모리 진행 상태 싱글톤 (모바일 폴링 fallback용) |

`handlePipelineFailure()` (generationPipeline.ts 내부): Rate Limit 복구, 실패 이벤트 발행(`eventBus.emit`), Tracker 실패 표시

**이벤트 흐름**: 생성 성공/실패 시 `eventBus.emit()` → `eventPersister` 구독자가 자동으로 `platform_events` 테이블에 기록 (수동 `persistAsync` 이중 호출 없음)

---

## 10. 모바일 백그라운드 생성 지원

모바일에서 다른 앱으로 전환 시 브라우저가 탭을 백그라운드로 만들어 SSE 연결이 끊어지는 문제를 SSE + 폴링 이중 구조로 해결한다.

### 서버: GenerationTracker (`src/lib/ai/generationTracker.ts`)
- 싱글톤 Map으로 진행 상태를 메모리에 보관 (**상태별 차등 TTL**: `generating` 30분 / `completed`·`failed` 10분 자동 만료)
- `generationPipeline.ts`에서 SSE 이벤트 전송과 동시에 Tracker도 업데이트
- SSE가 끊겨도 서버 파이프라인은 계속 실행 (isCancelled 체크 제거)

```typescript
generationTracker.start(projectId, userId);
generationTracker.updateProgress(projectId, 30, 'stage1', 'Stage 1 완료');
generationTracker.complete(projectId, { projectId, version: 1 });
generationTracker.fail(projectId, '에러 메시지');
```

### 클라이언트: SSE + 폴링 Fallback
```
SSE 스트림 시작
  → visibilitychange 이벤트 리스너 등록
  → 탭 복귀 감지 시: reader.cancel() + pollForCompletion() 전환
  → 스트림 에러 감지 시 (sseErrorEvent=false): pollForCompletion() 전환
  → SSE error 이벤트 (sseErrorEvent=true): 에러 전파
```

폴링은 `/api/v1/generate/status/:projectId`를 1초 간격, 최대 120회 호출.
