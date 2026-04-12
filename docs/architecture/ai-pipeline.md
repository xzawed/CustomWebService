# AI 코드 생성 파이프라인

> **최종 업데이트:** 2026-04-12

## 1. 개요

사용자가 선택한 API와 입력한 컨텍스트를 기반으로 AI가 웹서비스 코드를 자동 생성하는 핵심 엔진 설계.

---

## 2. 코드 생성 파이프라인

```
[입력]                    [처리]                      [출력]

선택된 API 목록    →  1. API 분석               →  HTML 파일
API 상세 정보      →  2. 프롬프트 구성           →  CSS 파일
사용자 컨텍스트    →  3. AI 코드 생성            →  JS 파일
                   →  4. 코드 검증 & 후처리      →  설정 파일
                   →  5. 미리보기 렌더링
```

---

## 3. 프롬프트 엔지니어링

### 3.1 시스템 프롬프트
```
당신은 웹서비스 코드를 생성하는 전문 개발자 AI입니다.
사용자가 선택한 API와 서비스 설명을 기반으로 완전히 동작하는
단일 페이지 웹 애플리케이션을 생성합니다.

규칙:
1. HTML, CSS, JavaScript를 각각 분리하여 생성
2. 외부 라이브러리 최소화 (CDN 사용 가능: Chart.js, Leaflet 등)
3. 반응형 디자인 필수 적용
4. API 호출은 fetch()를 사용
5. 에러 핸들링 포함
6. 한국어 UI 기본
7. 모던하고 깔끔한 디자인
8. 접근성(a11y) 고려
9. API 키는 환경변수로 처리 ({{API_KEY_NAME}} 플레이스홀더)
10. 로딩 상태와 에러 상태 UI 포함
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

### 3.3 재생성 프롬프트 (수정 요청 시)
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

### 단일 파일 (간단한 서비스)
```
output/
├── index.html      # 메인 HTML (CSS/JS 인라인)
└── config.json     # API 키, 설정
```

### 멀티 파일 (복잡한 서비스)
```
output/
├── index.html      # 메인 HTML
├── styles.css      # 스타일
├── app.js          # 메인 로직
├── api.js          # API 호출 모듈
└── config.json     # 설정
```

---

## 6. AI Provider 구현

### 현재 구현
- **Claude API (Anthropic)** — 기본 Provider
  - 구현: `src/providers/ai/ClaudeProvider.ts`
  - 팩토리: `AiProviderFactory.create()`, `AiProviderFactory.createForTask()`
  - 모델: `claude-sonnet-4-6` (기본), 태스크별 최적 모델 자동 선택

### Provider 인터페이스 (`src/providers/ai/IAiProvider.ts`)
- `generateCode(prompt)` — 단일 응답 생성
- `generateCodeStream(prompt, onChunk)` — SSE 스트리밍 생성

### 확장 방법
1. `IAiProvider` 구현 클래스 추가
2. `AiProviderFactory`에 등록
3. 환경변수로 활성화

---

## 7. 템플릿 시스템

자주 요청되는 서비스 유형에 대한 기본 템플릿을 제공하여 AI 생성 품질 향상 및 속도 개선.

### 구현 구조
- `src/templates/ICodeTemplate.ts` - 템플릿 인터페이스 (matchScore, generate)
- `src/templates/TemplateRegistry.ts` - 템플릿 등록/조회/매칭
- 각 템플릿은 HTML/CSS/JS 골격 + AI 프롬프트 힌트를 생성

### 구현 완료 템플릿 ✅
| 템플릿 | 파일 | 설명 | 적합한 API |
|--------|------|------|-----------|
| 대시보드 | `DashboardTemplate.ts` | 데이터 시각화 대시보드 | 날씨, 금융, 통계, 뉴스 |
| 계산기 | `CalculatorTemplate.ts` | 입력 기반 계산/변환 | 환율, 단위변환 |
| 갤러리 | `GalleryTemplate.ts` | 이미지/카드 그리드 | 이미지, 사진, 미디어 |

### 빌더 UI 템플릿 (TemplateSelector.tsx)
| 템플릿 | 설명 |
|--------|------|
| 대시보드 | 데이터 시각화 대시보드 |
| 계산기/변환기 | 실시간 계산/변환 도구 |
| 정보 조회 | 검색/필터 기반 정보 표시 |
| 갤러리 | 이미지/콘텐츠 그리드 |
| 지도 서비스 | 위치 기반 정보 표시 |
| 콘텐츠 피드 | 스크롤 기반 피드 |

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

코드 생성 완료 후 `docs/guides/qc-process.md`의 8단계 QC 파이프라인이 자동 실행된다.

생성 흐름: AI 응답 수신 → `codeValidator.validateAll()` (보안 차단) → `evaluateQuality()` (품질 점수) → 기준 미달 시 재생성 → DB 저장 → 비동기 Deep QC
