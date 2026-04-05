# Sprint 10 — 다국어 지원 완성 · 멀티 프레임워크 코드 생성

> 기반 문서: `docs/20_확장성_분석_및_로드맵.md` F7, F11
> 선행 조건: S9 완료 (프롬프트 템플릿 시스템)
> 예상 기간: 3~4주
> 목표: 글로벌 사용자 대응 + 다양한 프레임워크 코드 출력 지원

---

## 진행 현황

| 태스크 | 목표 | 상태 |
|--------|------|------|
| S10-1 | i18n 인프라 완성 | ⏳ 대기 |
| S10-2 | UI 텍스트 전체 i18n 키 전환 | ⏳ 대기 |
| S10-3 | 프롬프트 다국어화 | ⏳ 대기 |
| S10-4 | 프레임워크 선택 UI | ⏳ 대기 |
| S10-5 | 프레임워크별 코드 파서/밸리데이터 | ⏳ 대기 |

---

## S10-1. i18n 인프라 완성

### 배경

`src/lib/i18n/index.ts` 구조 존재, ko/en 로케일 파일 일부 작성됨.
`enable_multi_language` 피처 플래그 존재 (현재 false).

### 구현 내용

**1) 로케일 파일 확장**

**수정 파일:** `src/lib/i18n/locales/ko.json`, `en.json`

주요 네임스페이스:
```json
{
  "common": {
    "save": "저장",
    "cancel": "취소",
    "delete": "삭제",
    "loading": "로딩 중..."
  },
  "header": {
    "catalog": "API 카탈로그",
    "builder": "빌더",
    "dashboard": "대시보드"
  },
  "builder": {
    "step1_title": "API 선택",
    "step2_title": "서비스 설명",
    "step3_title": "생성 & 결과",
    "context_placeholder": "예: 여행자를 위한 환율 계산기를 만들고 싶어요...",
    "generate_button": "생성하기"
  },
  "catalog": { ... },
  "dashboard": { ... },
  "legal": { ... }
}
```

**2) 언어 선택기 컴포넌트**

**신규 파일:** `src/components/layout/LanguageSelector.tsx`

- Header 우측에 배치 (🌐 아이콘 + 드롭다운)
- 선택된 언어를 localStorage + users.preferences에 저장
- `enable_multi_language = false` 시 숨김

**3) i18n 훅 개선**

**수정 파일:** `src/lib/i18n/index.ts`

```typescript
// 현재: 기본 번역 함수
// 개선: React Context + useTranslation 훅
export function useTranslation() {
  const locale = useLocale();  // localStorage → users.preferences → 브라우저 언어
  return {
    t: (key: string) => getTranslation(locale, key),
    locale,
    setLocale,
  };
}
```

### 완료 조건
- [ ] ko/en 로케일 파일에 전체 UI 텍스트 포함
- [ ] 언어 전환 시 즉시 UI 반영 (새로고침 불필요)
- [ ] 선택 언어 localStorage + DB 저장

---

## S10-2. UI 텍스트 전체 i18n 키 전환

### 구현 내용

**수정 대상 (하드코딩 한국어 텍스트 → i18n 키):**

| 파일 | 주요 변경 |
|------|----------|
| `src/app/page.tsx` | 랜딩 히어로 텍스트, CTA, 설명 |
| `src/components/layout/Header.tsx` | 네비게이션 라벨 |
| `src/components/layout/Footer.tsx` | 링크 텍스트 |
| `src/components/builder/StepIndicator.tsx` | 단계 라벨 |
| `src/components/builder/ContextInput.tsx` | 레이블, 플레이스홀더, 가이드 |
| `src/components/builder/GuideQuestions.tsx` | 가이드 질문 텍스트 |
| `src/components/builder/TemplateSelector.tsx` | 템플릿 이름/설명 |
| `src/components/builder/GenerationProgress.tsx` | 진행 메시지 |
| `src/components/catalog/ApiSearchBar.tsx` | 검색 플레이스홀더 |
| `src/components/catalog/CategoryTabs.tsx` | 카테고리 라벨 |
| `src/components/dashboard/ProjectCard.tsx` | 상태 라벨, 버튼 |
| `src/components/dashboard/ProjectGrid.tsx` | 빈 상태 메시지 |
| `src/app/(main)/terms/page.tsx` | 법적 페이지 (ko/en 분기) |
| `src/app/(main)/privacy/page.tsx` | 법적 페이지 |
| `src/app/(main)/disclaimer/page.tsx` | 법적 페이지 |
| `src/app/error.tsx` | 에러 메시지 |
| `src/app/not-found.tsx` | 404 메시지 |

**패턴:**
```tsx
// 변경 전
<h1>무료 API를 골라 담고...</h1>

// 변경 후
const { t } = useTranslation();
<h1>{t('landing.hero_title')}</h1>
```

### 완료 조건
- [ ] 모든 사용자 노출 텍스트가 i18n 키 사용
- [ ] 영어 전환 시 전체 UI 영어 표시
- [ ] 하드코딩된 한국어 텍스트 잔존 없음 (grep 확인)

---

## S10-3. 프롬프트 다국어화

### 배경

S9-5에서 프롬프트 템플릿 시스템 구축 완료. 언어별 프롬프트 분기 가능.

### 구현 내용

**1) 영어 시스템 프롬프트 작성**

**위치:** `prompt_templates` 테이블

- 한국어 프롬프트의 영어 번역 + 코드 주석 영어 지시
- 사용자 언어 설정에 따라 해당 언어 프롬프트 로드

**2) 사용자 프롬프트 언어 연동**

**수정 파일:** `src/lib/ai/promptBuilder.ts`

- `buildUserPrompt(apis, context, language)` — language 파라미터 추가
- 생성 코드 내 주석, 라벨, placeholder도 해당 언어로 생성

**3) 생성 서비스 연동**

**수정 파일:** `src/services/generationService.ts`

- 사용자 프로필의 `preferences.language` 참조
- 프롬프트 빌더에 언어 전달

### 완료 조건
- [ ] 영어 사용자 → 영어 주석/라벨의 코드 생성
- [ ] 한국어 사용자 → 기존과 동일
- [ ] 프롬프트 변경 시 DB 수정만으로 반영

---

## S10-4. 프레임워크 선택 UI

### 배경

`generated_codes.framework` 컬럼 존재 (현재 항상 'vanilla').
vanilla, react, next 3종 지원 예정.

### 구현 내용

**1) FrameworkSelector 컴포넌트**

**신규 파일:** `src/components/builder/FrameworkSelector.tsx`

```
┌─ 출력 프레임워크 ──────────────────────────────┐
│                                               │
│  [HTML/CSS/JS]    [React]    [Next.js]        │
│   ✓ 선택됨         ○          ○               │
│                                               │
│  HTML/CSS/JS: 단일 파일, 즉시 실행 가능         │
│  React: JSX + CSS, Create React App 호환      │
│  Next.js: App Router + Server Components      │
│                                               │
└───────────────────────────────────────────────┘
```

**2) generationStore 확장**

**수정 파일:** `src/stores/generationStore.ts`

- `selectedFramework: 'vanilla' | 'react' | 'next'` 상태 추가 (기본값: 'vanilla')

**3) 빌더 Step2 연결**

**수정 파일:** `src/app/(main)/builder/page.tsx`

- Step2에 FrameworkSelector 배치 (모델 선택 아래)

**4) 생성 API 확장**

**수정 파일:** `src/app/api/v1/generate/route.ts`

- 요청 body에 `framework?: string` 파라미터 추가

### 완료 조건
- [ ] 빌더에서 3종 프레임워크 선택 가능
- [ ] 선택된 프레임워크가 생성 요청에 전달됨
- [ ] generated_codes.framework에 올바른 값 저장

---

## S10-5. 프레임워크별 코드 파서/밸리데이터

### 구현 내용

**1) 프레임워크별 시스템 프롬프트**

**위치:** `prompt_templates` 테이블 (S9-5에서 구축)

```
vanilla: "순수 HTML/CSS/JS로 작성하세요. <script> 태그 내에..."
react:   "React 함수형 컴포넌트로 작성하세요. JSX, useState, useEffect 사용..."
next:    "Next.js App Router 기반으로 작성하세요. Server Component 기본..."
```

**2) 코드 파서 분기**

**수정 파일:** `src/lib/ai/codeParser.ts`

```typescript
export function parseGeneratedCode(response: string, framework: string) {
  switch(framework) {
    case 'vanilla': return parseVanillaCode(response);  // 기존 로직
    case 'react':   return parseReactCode(response);    // JSX 추출
    case 'next':    return parseNextCode(response);     // page.tsx + layout 추출
  }
}
```

- React: JSX + CSS 추출, export default 확인
- Next.js: page.tsx + layout.tsx + globals.css 추출

**3) 밸리데이터 분기**

**수정 파일:** `src/lib/ai/codeValidator.ts`

- React: JSX 구문 검증, import 확인, hooks 규칙 확인
- Next.js: 'use client' 디렉티브 확인, metadata export 확인
- 공통: 보안 검증 (eval, 하드코딩 API 키) 유지

**4) 미리보기 분기**

**수정 파일:** `src/app/api/v1/preview/[projectId]/route.ts`

- vanilla: 기존 HTML 직접 서빙
- react/next: Babel standalone으로 브라우저 내 변환 후 렌더링

### 완료 조건
- [ ] vanilla 프레임워크: 기존과 동일하게 동작
- [ ] react 프레임워크: JSX 코드 생성 + 미리보기
- [ ] next 프레임워크: App Router 구조 코드 생성
- [ ] 프레임워크별 보안 검증 동작
- [ ] 서브도메인 게시는 vanilla만 지원 (react/next는 다운로드)

---

## S10 테스트 계획

### 단위 테스트 (Unit Tests)

#### `src/lib/i18n/i18n.test.ts` — 신규 (S10-1)
```
describe('i18n')
├── describe('getTranslation')
│   ├── it('한국어 키를 올바르게 반환한다')
│   ├── it('영어 키를 올바르게 반환한다')
│   ├── it('중첩된 키(common.save)를 올바르게 반환한다')
│   ├── it('존재하지 않는 키에 키 자체를 반환한다')
│   └── it('지원되지 않는 로케일에 영어 폴백을 사용한다')
├── describe('useTranslation hook')
│   ├── it('현재 로케일의 번역을 반환한다')
│   └── it('setLocale()이 로케일을 변경하고 리렌더를 트리거한다')
└── describe('로케일 감지')
    ├── it('localStorage 설정을 우선한다')
    ├── it('localStorage 없으면 users.preferences를 사용한다')
    └── it('둘 다 없으면 브라우저 언어를 사용한다')
```
예상 테스트 수: **10개**

#### `src/lib/i18n/locale-completeness.test.ts` — 신규 (S10-2)
```
describe('로케일 파일 완전성')
├── it('ko.json과 en.json의 키 구조가 동일하다')
├── it('모든 ko.json 키에 대응하는 en.json 키가 존재한다')
├── it('빈 값("")인 번역이 없다')
└── it('{{변수}} 플레이스홀더가 양쪽 로케일에서 일치한다')
```
예상 테스트 수: **4개**

#### `src/lib/ai/promptBuilder.test.ts` — 추가 케이스 (S10-3)
```
describe('promptBuilder 다국어')
├── it('language=ko 시 한국어 시스템 프롬프트를 반환한다')
├── it('language=en 시 영어 시스템 프롬프트를 반환한다')
├── it('buildUserPrompt()에 language가 반영된다')
└── it('지원되지 않는 언어에 영어 폴백을 사용한다')
```
예상 테스트 수: **4개**

#### `src/lib/ai/codeParser.test.ts` — 추가 케이스 (S10-5)
```
describe('codeParser 멀티 프레임워크')
├── describe('parseReactCode')
│   ├── it('JSX 코드블록을 추출한다')
│   ├── it('CSS 모듈 코드를 추출한다')
│   ├── it('export default 확인한다')
│   └── it('JSX 없는 응답에 에러를 반환한다')
├── describe('parseNextCode')
│   ├── it('page.tsx 코드를 추출한다')
│   ├── it('layout.tsx 코드를 추출한다')
│   └── it('use client 디렉티브를 감지한다')
└── describe('parseVanillaCode')
    └── it('기존 로직과 동일하게 동작한다')
```
예상 테스트 수: **8개**

#### `src/lib/ai/codeValidator.test.ts` — 추가 케이스 (S10-5)
```
describe('codeValidator 멀티 프레임워크')
├── describe('React 검증')
│   ├── it('hooks 규칙 위반을 감지한다 (조건부 useState)')
│   ├── it('dangerouslySetInnerHTML 사용 시 경고한다')
│   └── it('올바른 React 코드를 통과시킨다')
├── describe('Next.js 검증')
│   ├── it('Server Component에서 useState 사용 시 에러를 반환한다')
│   └── it('올바른 Next.js 코드를 통과시킨다')
└── describe('공통 보안 검증')
    └── it('프레임워크와 무관하게 eval() 사용을 감지한다')
```
예상 테스트 수: **6개**

### 통합 테스트 (Integration Tests)

#### `src/__tests__/integration/i18n.test.ts` — 신규
```
describe('i18n 통합')
├── it('한국어 로케일에서 전체 페이지가 한국어로 표시된다')
├── it('영어 로케일에서 전체 페이지가 영어로 표시된다')
└── it('로케일 변경 후 새로고침해도 유지된다')
```
예상 테스트 수: **3개**

#### `src/__tests__/api/generate-framework.test.ts` — 신규
```
describe('POST /api/v1/generate — framework 선택')
├── it('framework=vanilla 시 HTML/CSS/JS를 생성한다')
├── it('framework=react 시 JSX/CSS를 생성한다')
├── it('framework=next 시 page.tsx를 생성한다')
├── it('잘못된 framework 값에 400을 반환한다')
└── it('framework 미지정 시 vanilla를 기본으로 사용한다')
```
예상 테스트 수: **5개**

### 코드 품질 검토 체크리스트

#### 정적 분석
- [ ] `pnpm lint` — 경고/에러 0건
- [ ] `pnpm type-check` — 컴파일 에러 0건
- [ ] `pnpm format:check` — 포맷 위반 0건

#### 코드 리뷰 포인트
- [ ] i18n 키가 하드코딩 문자열 없이 모든 UI 텍스트를 커버하는가
- [ ] ko.json과 en.json의 키 구조가 정확히 일치하는가
- [ ] 프레임워크별 시스템 프롬프트가 충분히 구체적인가
- [ ] React/Next.js 파서가 다양한 AI 응답 형식에 대응하는가
- [ ] 미리보기 iframe에서 React 코드가 Babel 변환 후 정상 렌더되는가
- [ ] 법적 페이지(terms, privacy, disclaimer)도 다국어 분기되는가

#### 보안
- [ ] i18n 키에 사용자 입력이 포함되지 않는가 (XSS 방지)
- [ ] React 코드 생성 시 dangerouslySetInnerHTML 사용을 차단하는가
- [ ] 미리보기의 Babel standalone이 샌드박스 외부 접근을 허용하지 않는가

#### 테스트 커버리지 목표
- [ ] 신규 코드 라인 커버리지 **80% 이상**
- [ ] 신규 테스트 **40개 이상** 추가 (누적 207개 → 247개)

---

## S10 완료 조건 종합

- [ ] 한국어/영어 UI 전환 정상 동작
- [ ] 언어별 AI 프롬프트 분기
- [ ] 3종 프레임워크 코드 생성 및 미리보기
- [ ] 빌드 통과, 기존 기능 회귀 없음
