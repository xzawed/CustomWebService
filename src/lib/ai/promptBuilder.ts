import type { ApiCatalogItem } from '@/types/api';
import type { DesignPreferences } from '@/types/project';
import { inferDesignFromCategories } from './categoryDesignMap';
import { buildStage1SystemPromptText } from './prompts/stage1System';
import { buildStage2SystemPromptText } from './prompts/stage2System';
import { buildStage2FunctionSystemPromptText } from './prompts/stage2FunctionSystem';

// 시스템 프롬프트 모듈 레벨 캐싱 — 매 요청마다 재생성하지 않음
let cachedStage1SystemPrompt: string | null = null;
let cachedStage2SystemPrompt: string | null = null;
let cachedStage2FunctionSystemPrompt: string | null = null;

export function clearPromptCache(): void {
  cachedStage1SystemPrompt = null;
  cachedStage2SystemPrompt = null;
  cachedStage2FunctionSystemPrompt = null;
}

/**
 * Stage 1 시스템 프롬프트를 빌드합니다.
 * @param templateHint - 템플릿 가이던스 힌트 (선택)
 */
export function buildStage1SystemPrompt(templateHint?: string): string {
  const base = cachedStage1SystemPrompt ?? (cachedStage1SystemPrompt = buildStage1SystemPromptText());

  let result = base;

  if (templateHint) {
    const safeHint = templateHint.slice(0, 2000);
    result = `${result}

[템플릿 가이던스]
${safeHint}
위의 레이아웃 구조를 반드시 따르세요. 위에 명시된 섹션 구성과 UI 패턴은 필수 사항입니다. 이 구조 안에서 콘텐츠와 API 통합 내용을 채워주세요.`;
  }

  return result;
}

export function buildStage1UserPrompt(
  apis: ApiCatalogItem[],
  context: string,
  projectId?: string,
  designPreferences?: DesignPreferences
): string {
  const apiDescriptions = apis
    .map((api, i) => {
      const endpoints = api.endpoints
        .map((ep) => {
          const paramStr = JSON.stringify(ep.params);
          const responseStr = JSON.stringify(ep.responseExample).slice(0, 300);
          const exampleBlock = ep.exampleCall
            ? `\n    ★ exampleCall (그대로 사용하라):\n    \`\`\`javascript\n    ${ep.exampleCall.replace(/\n/g, '\n    ')}\n    \`\`\`\n    responseDataPath: ${ep.responseDataPath ?? '직접 탐색'}`
            : '';
          return `  - ${ep.method} ${ep.path}: ${ep.description}\n    파라미터: ${paramStr}\n    응답 예시: ${responseStr}${exampleBlock}`;
        })
        .join('\n');

      const projectParam = projectId ? `&projectId=${projectId}` : '';
      const baseUrlNote = api.baseUrl ? ` (원본 API: ${api.baseUrl})` : '';
      const callMethod = `서버 프록시 필수 (인증 방식 무관): /api/v1/proxy?apiId=${api.id}${projectParam}&proxyPath=<경로>&<파라미터>=<값>${baseUrlNote}`;

      return `### API ${i + 1}: ${api.name}
- API ID (프록시 호출 시 사용): ${api.id}
- 호출 방법: ${callMethod}
- 인증 방식: ${api.authType}
- 호출 제한: ${api.rateLimit ?? '무제한'}
- 주요 엔드포인트:
${endpoints}`;
    })
    .join('\n\n');

  // 카테고리 기반 디자인 추론
  const categories = [...new Set(apis.map((a) => a.category).filter(Boolean))];
  const inference = inferDesignFromCategories(categories);

  // 사용자 선호도 + AI 추론 결합
  const hasUserPrefs = designPreferences && (
    designPreferences.mood !== 'auto' ||
    designPreferences.audience !== 'general' ||
    designPreferences.layoutPreference !== 'auto'
  );

  const designSection = `
## 디자인 가이드

### API 분석 기반 추천
- 감지된 API 카테고리: ${categories.join(', ') || '없음'}
- 추천 서비스 유형: ${inference.description}
- 추천 테마: ${inference.theme}
- 추천 레이아웃: ${inference.layout}
- 차트 필요: ${inference.useChart ? '예 (Chart.js CDN 포함)' : '아니오 (Chart.js 불필요)'}
- 지도 필요: ${inference.useMap ? '예 (Leaflet CDN 포함)' : '아니오'}
- 이미지 키워드: ${inference.imageKeywords.join(', ')} — API 응답에 이미지가 없을 때 이 키워드로 Unsplash 이미지를 사용하라 (예: \`https://source.unsplash.com/600x400/?${inference.imageKeywords[0]}\`)
${hasUserPrefs ? `
### 사용자 선호도 (추천보다 우선)
${designPreferences.mood !== 'auto' ? `- 분위기: ${designPreferences.mood}` : ''}
${designPreferences.audience !== 'general' ? `- 대상 고객: ${designPreferences.audience}` : ''}
${designPreferences.layoutPreference !== 'auto' ? `- 레이아웃: ${designPreferences.layoutPreference}` : ''}
사용자가 명시한 선호도는 위 AI 추천보다 우선 적용하세요.` : '위 추천을 기반으로 디자인하되, 사용자 요청에 더 적합한 대안이 있으면 자율적으로 변경 가능.'}`;

  return `## 선택된 API 목록

${apiDescriptions}

## 사용자 요청
${context}
${designSection}

## 콘텐츠 범위 (절대 규칙)

이 서비스가 사용하는 API: ${apis.map((a) => a.name).join(', ')}
허용되는 UI 섹션: ${inference.allowedSections.join(', ')}

- 모든 섹션은 위 API의 데이터 도메인과 직접 관련되어야 합니다
- 허용 섹션 목록 외의 무관한 섹션 생성 금지
- 플레이스홀더("테스트", "샘플 데이터", "Lorem ipsum") 절대 사용 금지
- API 응답 필드명은 responseExample에 표시된 필드와 일치시켜 파싱할 것

## 구현 지시

### 1단계: 서비스 컨셉
- 이 서비스의 핵심 가치와 타겟 사용자를 결정
- 어울리는 디자인 테마(다크/라이트/따뜻한 톤) 선택

### 2단계: API 호출 구현 (★ 최우선)
- DOMContentLoaded에서 즉시 fetch()로 실제 API를 호출
- 로딩 중 스켈레톤 UI 표시, 응답 도착 시 실제 데이터로 DOM 갱신
- 응답 필드명은 위 API 목록의 responseExample 참고
- API 실패 시 에러 Empty State 표시 (가데이터로 대체 절대 금지)

### 3단계: 레이아웃 구현
- 고정 헤더 (backdrop-blur, 가로 flex)
- 통계 요약 카드 (grid-cols-2 lg:grid-cols-4)
- 메인 콘텐츠 카드 그리드 (grid-cols-1 sm:grid-cols-2 lg:grid-cols-3)
- 차트 섹션 (반드시 데이터가 채워진 상태로)

### 4단계: 인터랙션
- 탭 전환으로 카테고리별 필터링
- 실시간 검색 (디바운스)
- 카드 클릭 → 풍부한 상세 모달 (이미지 + 정보 + 액션)
- 좋아요/북마크 토글
- 호버 효과, 스크롤 애니메이션

### 5단계: 라이브 효과
- 통계 카운트업 애니메이션
- 차트 로드 애니메이션
- 실시간 활동 피드 또는 데이터 자동 갱신

### 코드 반환 형식

### HTML
\`\`\`html
(CDN 포함한 완전한 HTML 문서 — Tailwind 클래스로 레이아웃)
\`\`\`

### CSS
\`\`\`css
(커스텀 애니메이션, 트랜지션, 스크롤바, 글래스모피즘 등 Tailwind로 안 되는 스타일)
\`\`\`

### JavaScript
\`\`\`javascript
(API fetch 호출 + 렌더링 함수 + 이벤트 핸들러 + Chart.js 바인딩 + 에러 처리 + 라이브 갱신)
\`\`\``;
}

export function buildStage1RegenerationUserPrompt(
  previousCode: { html: string; css: string; js: string },
  feedback: string,
  apis: ApiCatalogItem[] = [],
  projectId?: string
): string {
  const apiSection = apis.length > 0
    ? `## 프로젝트에 연결된 API (반드시 활용)
${apis.map((api) => {
  // 최초 생성 프롬프트와 동일하게 projectId를 포함한다. 서브도메인은 Host로 프로젝트를
  // 확정하지만, apex의 직접 게시 URL(/site/{slug})에서는 이 파라미터가 있어야
  // 프록시가 익명 요청을 게시 사이트로 인식한다.
  const projectParam = projectId ? `&projectId=${projectId}` : '';
  const callMethod = `서버 프록시 (인증 방식 무관): /api/v1/proxy?apiId=${api.id}${projectParam}&proxyPath=<경로>`;
  return `### ${api.name} (ID: ${api.id})
- 호출 방법: ${callMethod}
- 인증: ${api.authType}`;
}).join('\n\n')}

`
    : '';

  return `${apiSection}## 이전 생성 코드

### HTML
\`\`\`html
${previousCode.html}
\`\`\`

### CSS
\`\`\`css
${previousCode.css}
\`\`\`

### JavaScript
\`\`\`javascript
${previousCode.js}
\`\`\`

## 사용자 수정 요청
${feedback}

위 피드백을 반영하여 코드를 수정해주세요.
- 수정 요청에 언급되지 않은 기존 기능은 그대로 유지하세요.
- 위에 명시된 API가 코드에 없다면 자연스럽게 통합해주세요.
- 카드/테이블 행/리스트 항목 등 모든 클릭 가능한 요소에 상세보기(모달 또는 사이드 패널)가 없다면 추가해주세요.
- 전체 코드를 반환해주세요.

다음 형식으로 코드를 반환해주세요:

### HTML
\`\`\`html
(완전한 HTML 코드)
\`\`\`

### CSS
\`\`\`css
(CSS 코드)
\`\`\`

### JavaScript
\`\`\`javascript
(JavaScript 코드)
\`\`\``;
}

// ─── Stage 2 시스템 프롬프트 ─────────────────────────────────────────────────

export function buildStage2SystemPrompt(): string {
  return cachedStage2SystemPrompt ?? (cachedStage2SystemPrompt = buildStage2SystemPromptText());
}

// ─── Stage 2 유저 프롬프트 ────────────────────────────────────────────────────

export function buildStage2UserPrompt(stage1Code: {
  html: string;
  css: string;
  js: string;
}): string {
  return `다음은 1단계에서 생성된 구조 코드입니다.
기능과 API 호출 구조는 유지하세요. 하드코딩된 mock 배열이 있다면 API fetch로 대체하세요.
디자인 시스템, 애니메이션, 마이크로 인터랙션을 강화하여 전체 코드를 반환하세요.

### HTML (1단계)
\`\`\`html
${stage1Code.html}
\`\`\`

### CSS (1단계)
\`\`\`css
${stage1Code.css}
\`\`\`

### JavaScript (1단계)
\`\`\`javascript
${stage1Code.js}
\`\`\`

다음 형식으로 전체 코드를 반환하세요:

### HTML
\`\`\`html
(완전한 HTML 코드)
\`\`\`

### CSS
\`\`\`css
(디자인 강화된 CSS — @keyframes, 스켈레톤, 리플 포함)
\`\`\`

### JavaScript
\`\`\`javascript
(기존 기능 그대로, showToast/setButtonLoading/ripple 핸들러 추가)
\`\`\``;
}

export function buildStage2RegenerationUserPrompt(
  stage1Code: { html: string; css: string; js: string },
  feedback: string,
): string {
  return `다음은 1단계에서 피드백을 반영하여 구조가 수정된 코드입니다.
기능을 유지하면서 디자인 시스템, 애니메이션, 마이크로 인터랙션을 강화하세요.
피드백(${feedback})도 디자인 관점에서 추가로 반영하세요.

### HTML (1단계)
\`\`\`html
${stage1Code.html}
\`\`\`

### CSS (1단계)
\`\`\`css
${stage1Code.css}
\`\`\`

### JavaScript (1단계)
\`\`\`javascript
${stage1Code.js}
\`\`\`

다음 형식으로 전체 코드를 반환하세요:

### HTML
\`\`\`html
(완전한 HTML 코드)
\`\`\`

### CSS
\`\`\`css
(디자인 강화된 CSS)
\`\`\`

### JavaScript
\`\`\`javascript
(기존 기능 그대로, 시각 폴리시 함수 추가)
\`\`\``;
}

// ─── Stage 2 Function Verification 시스템 프롬프트 ───────────────────────────

export function buildStage2FunctionSystemPrompt(): string {
  return cachedStage2FunctionSystemPrompt ?? (cachedStage2FunctionSystemPrompt = buildStage2FunctionSystemPromptText());
}

// ─── Stage 2 Function Verification 유저 프롬프트 ────────────────────────────

export function buildStage2FunctionUserPrompt(
  stage1Code: { html: string; css: string; js: string },
  staticQcIssues: string[],
  fastQcIssues: string[] | null,
): string {
  const issueBlock = staticQcIssues.length > 0 || (fastQcIssues && fastQcIssues.length > 0)
    ? `## 발견된 문제 (반드시 수정)\n\n${staticQcIssues.map(i => `- [정적 검사] ${i}`).join('\n')}\n${fastQcIssues ? fastQcIssues.map(i => `- [브라우저 QC] ${i}`).join('\n') : ''}\n`
    : '## 문제 없음 — 코드를 그대로 반환하세요\n\n';

  return `${issueBlock}
## 1단계 생성 코드

### HTML
\`\`\`html
${stage1Code.html}
\`\`\`

### CSS
\`\`\`css
${stage1Code.css}
\`\`\`

### JavaScript
\`\`\`javascript
${stage1Code.js}
\`\`\`

위 문제를 JavaScript 코드만 수정하여 전체 코드를 반환하세요:

### HTML
\`\`\`html
(HTML — 변경하지 말 것, 그대로 반환)
\`\`\`

### CSS
\`\`\`css
(CSS — 변경하지 말 것, 그대로 반환)
\`\`\`

### JavaScript
\`\`\`javascript
(수정된 JavaScript 코드)
\`\`\``;
}

export function buildStage2FunctionRegenerationUserPrompt(
  stage1Code: { html: string; css: string; js: string },
  staticQcIssues: string[],
  fastQcIssues: string[] | null,
  feedback: string,
): string {
  return buildStage2FunctionUserPrompt(stage1Code, staticQcIssues, fastQcIssues) +
    `\n\n## 사용자 피드백 (기능 관련 부분만 반영)\n${feedback}`;
}
