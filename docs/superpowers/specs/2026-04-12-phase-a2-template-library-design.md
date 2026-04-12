# Phase A-2 공식 템플릿 라이브러리 디자인

**날짜**: 2026-04-12  
**목적**: 빌더에서 선택한 템플릿이 AI 코드 생성에 실질적으로 반영되도록 TemplateRegistry 활성화  
**범위**: 기존 3개 템플릿 보강 + 신규 8개 추가 = 11개 전체, generate 파이프라인 연결

---

## 목표

현재 빌더 UI에 6개 템플릿 버튼이 있지만 클릭해도 context 텍스트만 삽입될 뿐, templateId가 코드 생성에 전달되지 않는다. Phase A-2에서는 TemplateRegistry를 실제로 활성화하여 "하이브리드형" 동작을 구현한다.

**하이브리드형 정의**: 템플릿이 레이아웃/구조를 정의하고, AI가 그 구조 안에서 API 통합·데이터 표시 방식을 채워 넣는다.

---

## 데이터 흐름

### 현재 (비정상)
```
빌더 Step2 → 템플릿 텍스트를 context에 삽입만 함
→ POST /api/v1/generate { projectId }  ← templateId 없음
→ categoryDesignMap → AI 생성
```

### 변경 후
```
빌더 Step2 → templateId 선택
→ POST /api/v1/generate { projectId, templateId? }
  → TemplateRegistry.get(templateId) 존재하면:
      template.promptHint → buildSystemPrompt()에 주입
      template.allowedSections → 레이아웃 지시사항 강화
  → 없으면 categoryDesignMap fallback (기존 동작 유지)
→ AI 생성
```

---

## 템플릿 목록 (11개)

### 기존 3개 — promptHint 보강

| ID | 이름 | 레이아웃 힌트 |
|----|------|--------------|
| `dashboard` | 대시보드 | 카드 그리드 + 실시간 수치 + Chart.js 차트 |
| `calculator` | 계산기/변환기 | 입력폼 + 결과 영역 + 히스토리 목록 |
| `gallery` | 갤러리 | 마소닉 그리드 + 검색바 + 라이트박스 모달 |

### 기존 UI에 있으나 구현 없음 — 신규 클래스

| ID | 이름 | 레이아웃 힌트 |
|----|------|--------------|
| `info-lookup` | 정보 조회 | 검색바 + 상세 카드 + 관련 항목 리스트 |
| `map-service` | 지도 서비스 | Leaflet 지도(좌) + 항목 사이드바(우) + 마커 |
| `content-feed` | 콘텐츠 피드 | 카드 리스트 + 카테고리 필터 탭 + 무한 스크롤 감지 |

### 신규 5개 — 새 클래스 + UI 버튼 추가

| ID | 이름 | 레이아웃 힌트 |
|----|------|--------------|
| `comparison` | 실시간 비교 | 2열 비교 카드 + 차이 강조 배지 |
| `timeline` | 타임라인/이벤트 | 세로 타임라인 + 날짜 마커 + 아이콘 |
| `news-curator` | 뉴스 큐레이터 | 헤드라인 그리드 + 소스 필터 + 태그 클라우드 |
| `quiz` | 퀴즈/인터랙티브 | 질문 카드 + 진행바 + 결과 요약 화면 |
| `profile` | 프로필/포트폴리오 | 헤더 배너 + 스탯 카드 + 활동 피드 |

---

## 변경 파일 목록

### 신규 생성
- `src/templates/InfoLookupTemplate.ts`
- `src/templates/MapServiceTemplate.ts`
- `src/templates/ContentFeedTemplate.ts`
- `src/templates/ComparisonTemplate.ts`
- `src/templates/TimelineTemplate.ts`
- `src/templates/NewsCuratorTemplate.ts`
- `src/templates/QuizTemplate.ts`
- `src/templates/ProfileTemplate.ts`

### 수정
- `src/templates/DashboardTemplate.ts` — promptHint 보강
- `src/templates/CalculatorTemplate.ts` — promptHint 보강
- `src/templates/GalleryTemplate.ts` — promptHint 보강
- `src/templates/TemplateRegistry.ts` — 11개 전체 등록
- `src/lib/ai/promptBuilder.ts` — `templateHint?: string` 파라미터 추가
- `src/app/api/v1/generate/route.ts` — `templateId?: string` 수신 + Registry 조회
- `src/components/builder/TemplateSelector.tsx` — 신규 5개 버튼 추가
- `src/stores/contextStore.ts` — `selectedTemplate`을 generate 요청 body에 포함 (이미 존재, 전달 누락만 수정)
- `src/__tests__/api/generate.test.ts` — templateId 파라미터 테스트 추가

---

## API 스키마 변경

### `POST /api/v1/generate`

```typescript
// 요청 body (변경)
interface GenerateRequest {
  projectId: string;
  templateId?: string;   // 추가 — 없으면 기존 동작 유지
}
```

---

## 프롬프트 빌더 변경

### `buildSystemPrompt(design, templateHint?)`

templateHint가 있을 경우 시스템 프롬프트 끝에 추가:

```
[Template Guidance]
{templateHint}
Strictly follow the above layout structure. The section arrangement and UI patterns
described above are mandatory. Fill in content and API integrations within this structure.
```

### `buildUserPrompt(project, apis, design, templateId?)`

templateId가 있을 경우 사용자 프롬프트에 명시:

```
Layout template: {templateName}. Use the {templateName} layout as the structural foundation.
```

---

## ICodeTemplate 인터페이스 (변경 없음)

```typescript
// src/templates/ICodeTemplate.ts — 현행 유지
interface ICodeTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  supportedApiCategories: string[];
  matchScore(apis: ApiCatalog[]): number;
  generate(context: TemplateContext): TemplateOutput;
}

interface TemplateOutput {
  html: string;
  css: string;
  js: string;
  promptHint: string;   // ← 이것을 AI 프롬프트에 주입
}
```

---

## promptHint 작성 기준

각 템플릿의 `generate()` 반환값 중 `promptHint`는 다음 형식으로 작성한다:

```
Layout: [레이아웃 이름]
Required sections (in order): [섹션1], [섹션2], [섹션3]
UI patterns: [패턴 설명]
Must include: [필수 요소]
Avoid: [제외할 요소]
```

예시 (대시보드):
```
Layout: data-dashboard
Required sections (in order): header with title, metric cards row (4 cards), 
  main chart area, secondary data table
UI patterns: card-based layout with subtle shadows, real-time update button
Must include: at least one Chart.js chart, loading skeleton states
Avoid: hero images, marketing copy, decorative illustrations
```

---

## TemplateRegistry 등록

```typescript
// src/templates/TemplateRegistry.ts — 기존 파일에 등록 코드 추가
import { DashboardTemplate } from './DashboardTemplate';
import { CalculatorTemplate } from './CalculatorTemplate';
import { GalleryTemplate } from './GalleryTemplate';
import { InfoLookupTemplate } from './InfoLookupTemplate';
import { MapServiceTemplate } from './MapServiceTemplate';
import { ContentFeedTemplate } from './ContentFeedTemplate';
import { ComparisonTemplate } from './ComparisonTemplate';
import { TimelineTemplate } from './TimelineTemplate';
import { NewsCuratorTemplate } from './NewsCuratorTemplate';
import { QuizTemplate } from './QuizTemplate';
import { ProfileTemplate } from './ProfileTemplate';

templateRegistry.register(new DashboardTemplate());
templateRegistry.register(new CalculatorTemplate());
templateRegistry.register(new GalleryTemplate());
templateRegistry.register(new InfoLookupTemplate());
templateRegistry.register(new MapServiceTemplate());
templateRegistry.register(new ContentFeedTemplate());
templateRegistry.register(new ComparisonTemplate());
templateRegistry.register(new TimelineTemplate());
templateRegistry.register(new NewsCuratorTemplate());
templateRegistry.register(new QuizTemplate());
templateRegistry.register(new ProfileTemplate());
```

---

## generate/route.ts 변경 로직

```typescript
// templateId가 있을 때만 Registry 조회
const templateHint = templateId
  ? templateRegistry.get(templateId)?.generate(templateContext).promptHint
  : undefined;

// promptBuilder에 전달
const systemPrompt = buildSystemPrompt(design, templateHint);
const userPrompt = buildUserPrompt(project, apis, design, templateId);
```

---

## 테스트 전략

기존 `generate.test.ts` 테스트는 `templateId` 없이 동작하므로 **변경 불필요**.

신규 테스트 케이스 (동일 파일에 추가):
- `templateId` 전달 시 `buildSystemPrompt`에 hint 포함 확인
- 존재하지 않는 `templateId` 전달 시 fallback 동작 (hint 없이 정상 생성)
- `templateId` 없을 때 기존 동작 유지 확인

---

## 검증 기준

- [ ] 11개 템플릿 모두 TemplateRegistry에 등록됨
- [ ] `templateId` 전달 시 시스템 프롬프트에 `[Template Guidance]` 블록 포함됨
- [ ] `templateId` 미전달 시 기존 categoryDesignMap 동작 유지
- [ ] TemplateSelector UI에 11개 버튼 모두 표시
- [ ] 기존 286개 테스트 모두 통과
- [ ] TypeScript strict mode 통과
