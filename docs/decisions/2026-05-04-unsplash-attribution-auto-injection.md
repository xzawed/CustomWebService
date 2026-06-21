# ADR: Unsplash Attribution 자동 주입 (2026-05-04, PR #102)

## 배경

AI가 생성하는 HTML에는 무료 이미지 소스로 Unsplash(`source.unsplash.com`, `images.unsplash.com`)가 자주 사용된다. Unsplash의 이용 약관(API Guidelines)은 Unsplash 이미지를 사용하는 경우 출처를 표시(Attribution)할 것을 요구한다.

```
Photos provided by Unsplash (https://unsplash.com)
```

그러나 AI가 생성한 HTML에는 귀속 문구가 포함되지 않거나, 포함되더라도 스타일이 일관되지 않은 문제가 있었다. AI에게 귀속 문구 삽입을 프롬프트로 지시하는 방식에는 다음과 같은 한계가 있다:

- AI가 지시를 누락하거나 다른 형식으로 삽입할 가능성
- 스타일이 생성마다 달라져 일관성 없는 사용자 경험
- 귀속 문구 삽입 여부를 시스템이 검증할 수 없음

파이프라인 수준에서 결정론적으로 처리하는 것이 더 신뢰성 높다는 판단 아래, 코드 파서 레이어에서 자동 주입하는 방식을 채택했다.

---

## 결정 사항

### 결정 1: `injectUnsplashAttribution()` in `codeParser.ts`

`codeParser.ts`의 HTML 후처리 단계에서 Unsplash URL 감지 시 귀속 문구를 자동으로 삽입한다.

**감지 방식**: `/unsplash\.com/i` 정규식 — 다음 모든 패턴을 포괄:
- `<img src="https://images.unsplash.com/photo-...">`
- `<img src="https://source.unsplash.com/...">`
- Alpine.js `:src="'https://images.unsplash.com/...'"` 동적 바인딩
- CSS `background-image: url('https://images.unsplash.com/...')` 인라인 스타일
- JavaScript 문자열 내 URL

Unsplash URL이 없는 HTML은 함수가 원본 그대로 반환하며 성능 영향이 최소화된다.

---

### 결정 2: 삽입 위치 — `</body>` 직전

`html.lastIndexOf('</body>')` 를 사용하여 항상 `</body>` 태그 바로 앞에 삽입한다.

`indexOf` 대신 `lastIndexOf`를 사용하는 이유:
- AI가 생성한 HTML에는 드물게 `</body>` 태그가 중첩되거나 잘못된 위치에 나타날 수 있음
- `lastIndexOf`는 실제 문서의 마지막 `</body>` 위치를 보장하여 항상 body 끝에 삽입됨

`</body>` 태그가 없는 HTML의 경우: 원본을 그대로 반환한다(삽입하지 않음). `</body>` 없이 끝에 강제 삽입하면 HTML 구조가 더 손상될 수 있으므로, 이 경우는 안전하게 건너뛴다.

---

### 결정 3: 귀속 문구 스타일

```html
<div class="text-[10px] text-gray-400 py-3 text-center">
  Photos by <a href="https://unsplash.com" target="_blank" rel="noopener noreferrer" class="underline">Unsplash</a>
</div>
```

**스타일 선택 근거**:
- `text-[10px]`: Unsplash 요구사항을 준수하면서 콘텐츠 방해 최소화. 법적 의무 표기이므로 숨기지 않되 비침습적으로 처리
- `text-gray-400`: 배경과 구분되지만 사용자 콘텐츠보다 시각적으로 후순위
- `py-3`: 하단 여백 확보로 귀속 문구가 스크롤 없이 가려지지 않도록 처리
- `text-center`: 좌우 정렬에 관계없이 중앙 배치로 일관성 유지

**보안 속성**: Unsplash 링크에 `target="_blank" rel="noopener noreferrer"` 적용 — AI가 생성한 HTML은 다른 사용자에게 서브도메인으로 서빙되므로 보안 표준 준수 필수

**Tailwind 의존성**: AI가 생성하는 HTML은 대부분 Tailwind CDN을 포함하도록 프롬프트되어 있으므로 Tailwind 클래스 사용이 안전하다. 만약 Tailwind가 없는 경우에도 브라우저 기본 스타일이 적용되어 귀속 문구는 정상 표시된다.

---

### 결정 4: 중복 방지

`codeParser.ts`의 두 진입점에서 각 1회만 호출된다:
- `processFullDocument()`: 완전한 HTML 문서 처리 시 호출
- `buildFromFragment()`: HTML 단편 조합 시 호출

두 경로 모두 동일한 `injectUnsplashAttribution()` 함수를 호출하므로 이중 삽입 위험이 없다.

---

### 결정 5: 프롬프트 업데이트 (`promptBuilder.ts`)

AI에게 귀속 문구를 직접 삽입하지 말도록 명시적으로 안내한다:

> "Unsplash 이미지를 사용하는 경우 귀속 문구를 직접 HTML에 삽입하지 마세요. 시스템이 자동으로 처리합니다."

**이유**: 프롬프트 업데이트 없이 자동 주입만 구현하면 AI가 귀속 문구를 직접 삽입하는 동시에 시스템도 삽입하여 중복이 발생할 수 있다. 프롬프트와 구현을 함께 업데이트하여 일관된 동작을 보장한다.

---

## AI 직접 삽입을 선택하지 않은 이유

| 기준 | AI 직접 삽입 | 파이프라인 자동 주입 (채택) |
|------|-------------|---------------------------|
| 일관성 | 생성마다 달라질 수 있음 | 항상 동일한 형식 보장 |
| 신뢰성 | AI가 누락하거나 다른 위치에 삽입 가능 | 100% 삽입 보장 (감지 시) |
| 검증 가능성 | 시스템 레벨 검증 어려움 | 함수 단위 테스트 가능 |
| 프롬프트 길이 | 상세 지침 필요 → 프롬프트 길이 증가 | 간단한 금지 지침만 필요 |

파이프라인 수준의 결정론적 처리가 이용 약관 준수 측면에서 더 신뢰성 높다.

---

## 결과 및 영향

### 긍정적 영향

- **이용 약관 준수 자동화**: 개발자가 귀속 문구를 별도로 고려하지 않아도 Unsplash 이용 약관 자동 준수
- **일관된 사용자 경험**: 모든 생성 서비스에서 동일한 위치, 동일한 스타일로 귀속 문구 표시
- **보안 표준 준수**: `rel="noopener noreferrer"` 자동 적용

### 한계 및 주의사항

- **다른 이미지 소스**: 현재 Unsplash만 처리. Pexels, Pixabay 등 다른 무료 이미지 소스도 귀속이 필요한 경우 별도 처리 필요
- **Tailwind 없는 HTML**: Tailwind CDN이 없는 HTML에서는 클래스가 적용되지 않지만 귀속 문구 텍스트 자체는 정상 표시됨
- **빌더 미리보기**: 미리보기 경로(`preview/[projectId]/route.ts`)와 게시 경로(`site/[slug]/route.ts`) 모두 `codeParser.ts`를 통하므로 양쪽에 동일하게 적용됨
- **이미 게시된 서비스**: `site/[slug]/route.ts`는 서빙 시마다 DB의 raw 파트(`codeHtml`, `codeCss`, `codeJs`)를 `assembleHtml()`로 재조합하므로, `injectUnsplashAttribution()`이 기존 서비스에도 자동 적용됨. 별도 마이그레이션 불필요

---

## 관련 파일

- `src/lib/ai/codeParser.ts` — `injectUnsplashAttribution()` 함수 구현, `processFullDocument()`·`buildFromFragment()` 호출 추가
- `src/lib/ai/promptBuilder.ts` — AI 귀속 문구 직접 삽입 금지 지침 추가
- `src/lib/ai/codeParser.test.ts` — `injectUnsplashAttribution()` 단위 테스트 추가
