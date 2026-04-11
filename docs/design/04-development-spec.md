# 개발명세서 (Development Specification)

## 1. 개발 환경 설정

### 1.1 필수 도구
| 도구 | 버전 | 용도 |
|------|------|------|
| Node.js | 20.x LTS | 런타임 |
| pnpm | 9.x | 패키지 매니저 |
| Git | 최신 | 버전 관리 |
| VS Code | 최신 | IDE (권장) |

### 1.2 VS Code 권장 확장
- ESLint
- Prettier
- Tailwind CSS IntelliSense
- TypeScript Importer
- GitLens

### 1.3 프로젝트 초기화 명령
```bash
# Next.js 프로젝트 생성
pnpm create next-app@latest custom-web-service \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd custom-web-service

# 핵심 의존성 설치
pnpm add @supabase/supabase-js @supabase/ssr zustand @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities react-hook-form @hookform/resolvers zod lucide-react

# AI SDK (xAI Grok - OpenAI 호환)
pnpm add openai

# 개발 의존성
pnpm add -D @types/node prettier eslint-config-prettier

# 테스트 의존성
pnpm add -D vitest@^2 @vitejs/plugin-react@^4
pnpm add -D @testing-library/react @testing-library/user-event
pnpm add -D msw happy-dom
```

> **참고**: shadcn/ui는 미설치 상태입니다. 컴포넌트는 Tailwind CSS로 직접 구현되어 있습니다.

### 1.4 환경변수 (.env.local)
```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI - xAI Grok
XAI_API_KEY=

# GitHub - 생성 서비스 배포용
GITHUB_TOKEN=
GITHUB_ORG=

# Railway - 생성 서비스 배포용
RAILWAY_TOKEN=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## 2. 코딩 컨벤션

### 2.1 파일/폴더 네이밍
| 대상 | 규칙 | 예시 |
|------|------|------|
| 컴포넌트 파일 | PascalCase | `ApiCard.tsx` |
| 페이지 파일 | kebab-case (Next.js 규칙) | `page.tsx`, `layout.tsx` |
| 훅 파일 | camelCase, `use` 접두사 | `useApiCatalog.ts` |
| 유틸리티 파일 | camelCase | `formatDate.ts` |
| 타입 파일 | camelCase | `apiTypes.ts` |
| 스토어 파일 | camelCase | `builderStore.ts` |
| 상수 파일 | camelCase | `categories.ts` |
| API Route | kebab-case 디렉토리 | `api/catalog/route.ts` |

### 2.2 코드 스타일
```typescript
// 컴포넌트 - 함수 선언 + default export
export default function ApiCard({ api, onSelect }: ApiCardProps) {
  // 훅은 최상단
  const [isOpen, setIsOpen] = useState(false);

  // 이벤트 핸들러는 handle 접두사
  const handleSelect = () => {
    onSelect(api.id);
  };

  return (
    <div>...</div>
  );
}

// Props 타입은 컴포넌트 위에 정의
interface ApiCardProps {
  api: ApiCatalogItem;
  onSelect: (id: string) => void;
  isSelected?: boolean;
}
```

### 2.3 Import 순서
```typescript
// 1. React/Next.js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 2. 외부 라이브러리
import { useDraggable } from '@dnd-kit/core';

// 3. 내부 모듈 (절대 경로)
import { Button } from '@/components/ui/button';
import { useBuilderStore } from '@/stores/builderStore';
import type { ApiCatalogItem } from '@/types/api';

// 4. 상대 경로 (같은 도메인 컴포넌트)
import ApiCardBadge from './ApiCardBadge';
```

### 2.4 에러 처리 패턴
```typescript
// API Route 에러 처리
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Zod 검증
    const validated = createProjectSchema.parse(body);

    // 비즈니스 로직
    const result = await createProject(validated);

    return Response.json({ success: true, data: result });
  } catch (error) {
    // handleApiError가 AppError, ZodError, 일반 Error를 모두 처리
    return handleApiError(error);
  }
}
// handleApiError: AppError → statusCode, ZodError → 400, 그 외 → 500
```

---

## 3. 컴포넌트 상세 명세

### 3.1 공통 레이아웃

#### `src/app/layout.tsx` - 루트 레이아웃
```typescript
// 역할: HTML 기본 구조, 폰트 로드, 글로벌 프로바이더
// 포함: Toaster, AuthProvider, ThemeProvider(선택)
```

#### `src/components/layout/Header.tsx`
```typescript
interface HeaderProps {
  // Props 없음 - 내부적으로 auth 상태 확인
}

// 표시 요소:
// - 로고 (클릭 → /)
// - 네비게이션: [카탈로그] [빌더] [대시보드] (로그인 시)
// - 우측: [로그인] 또는 [아바타 + 드롭다운(대시보드, 로그아웃)]
```

#### `src/components/layout/Footer.tsx`
```typescript
// 표시 요소: 저작권, GitHub 링크, 피드백 링크
```

---

### 3.2 API 카탈로그 컴포넌트

#### `src/components/catalog/ApiCard.tsx`
```typescript
interface ApiCardProps {
  api: ApiCatalogItem;
  isSelected: boolean;
  isDisabled: boolean;          // 장애 또는 최대 선택 도달
  onSelect: (id: string) => void;
  onDetailClick: (api: ApiCatalogItem) => void;
  draggable?: boolean;          // DnD 활성화 여부
}

// 내부 구조:
// ┌──────────────────────────────┐
// │ [체크박스] [아이콘] API이름   │
// │ 설명 텍스트 (2줄 제한)       │
// │ [카테고리뱃지] [한도] [인증]  │
// │ [자세히 보기 →]              │
// └──────────────────────────────┘

// 상태:
// - default: 기본 테두리
// - hover: 그림자 + 테두리 색상 변경
// - selected: 파란색 테두리 + 체크 표시
// - disabled: 회색 배경 + 클릭 불가
// - dragging: 반투명 + 약간 회전
```

#### `src/components/catalog/ApiCatalogGrid.tsx`
```typescript
interface ApiCatalogGridProps {
  apis: ApiCatalogItem[];
  selectedIds: string[];
  maxSelection: number;
  onSelect: (id: string) => void;
  onDetailClick: (api: ApiCatalogItem) => void;
}

// 역할: API 카드를 그리드로 배치
// 그리드: 모바일 1열, 태블릿 2열, 데스크톱 3열
// 빈 상태: "검색 결과가 없습니다" 메시지
```

#### `src/components/catalog/ApiSearchBar.tsx`
```typescript
interface ApiSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// 역할: API 검색 입력
// 기능: debounce 300ms, 클리어 버튼, 검색 아이콘
```

#### `src/components/catalog/CategoryTabs.tsx`
```typescript
interface CategoryTabsProps {
  categories: Category[];
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

// 역할: 카테고리 탭 필터
// 표시: [전체(30)] [날씨(3)] [뉴스(3)] [금융(3)] ...
// 모바일: 가로 스크롤
```

#### `src/components/catalog/ApiDetailModal.tsx`
```typescript
interface ApiDetailModalProps {
  api: ApiCatalogItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  isSelected: boolean;
}

// 역할: API 상세 정보 모달
// 표시: 기본 정보, 엔드포인트 목록, 응답 예시, 공식 문서 링크
```

---

### 3.3 빌더 컴포넌트

#### `src/components/builder/StepIndicator.tsx`
```typescript
interface StepIndicatorProps {
  currentStep: 1 | 2 | 3;
  steps: { label: string; completed: boolean }[];
}

// 역할: 상단 3단계 인디케이터
// 상태: 완료(체크마크 + 초록), 현재(파란 강조), 미완료(회색)
```

#### `src/components/builder/SelectedApiZone.tsx`
```typescript
interface SelectedApiZoneProps {
  selectedApis: ApiCatalogItem[];
  onRemove: (id: string) => void;
  maxCount: number;
}

// 역할: 선택된 API를 표시하는 드롭 존
// DnD: @dnd-kit/core의 useDroppable 사용
// 빈 상태: "API를 여기에 드래그하거나 체크하세요" + 점선 테두리
// 카드 표시: 미니 카드 (이름 + 카테고리 + X 버튼)
```

#### `src/components/builder/ContextInput.tsx`
```typescript
interface ContextInputProps {
  value: string;
  onChange: (value: string) => void;
  selectedApis: ApiCatalogItem[];
  minLength: number;          // 50
  maxLength: number;          // 2000
}

// 역할: 서비스 컨텍스트 텍스트 입력
// 기능:
// - 자동 높이 조절 textarea
// - 글자 수 카운터 (50 미만: 빨간색, 50~1800: 초록, 1800~2000: 노란색)
// - 로컬스토리지 자동 저장 (5초마다)
```

#### `src/components/builder/GuideQuestions.tsx`
```typescript
interface GuideQuestionsProps {
  onInsert: (text: string) => void;  // 질문 답변을 컨텍스트에 추가
}

// 역할: 가이드 질문 표시 (접기/펴기)
// 질문 목록: 5개 (기획서 참조)
// 각 질문 클릭 시 해당 질문 텍스트를 컨텍스트에 추가
```

#### `src/components/builder/TemplateSelector.tsx`
```typescript
interface TemplateSelectorProps {
  onSelect: (template: Template) => void;
  selectedApis: ApiCatalogItem[];
}

// 역할: 6개 템플릿 버튼 그룹
// 선택 시: 확인 모달 → 컨텍스트 텍스트 자동 채움
// API 기반 추천: 지도 API 선택 시 "지도 서비스" 템플릿 강조
```

#### `src/components/builder/ContextSuggestions.tsx` ✅ 신규 구현
```typescript
interface ContextSuggestionsProps {
  suggestions: string[];
  isLoading: boolean;
  activeIndex: number | null;
  onSelect: (suggestion: string, index: number) => void;
  onRefresh: () => void;
}

// 역할: API 선택 기반 AI 추천 컨텍스트 카드 표시
// - isLoading: 스켈레톤 로딩 3개 표시
// - 추천 3개 카드 (클릭 시 텍스트에어리아 자동 채움)
// - activeIndex: 선택된 추천 카드 하이라이트
// - 다시 생성 버튼 (onRefresh) — aria-label 포함
// - 실패 시 "다시 시도" 링크 표시
```

#### `src/components/builder/GenerationProgress.tsx`
```typescript
interface GenerationProgressProps {
  status: GenerationStatus;
  steps: GenerationStep[];
  currentStep: number;
  progress: number;           // 0~100
}

// 역할: 코드 생성 진행 상황 실시간 표시
// SSE 연동: useEffect + EventSource
// 각 단계: 아이콘 + 메시지 + 상태(대기/진행/완료)
// 프로그레스 바: 전체 진행률
```

#### `src/components/builder/PreviewFrame.tsx`
```typescript
interface PreviewFrameProps {
  projectId: string;
  version: number;
}

// 역할: 생성된 코드를 iframe으로 미리보기
// 디바이스 토글: 모바일(375px) / 태블릿(768px) / 데스크톱(100%)
// 새로고침 버튼
// sandbox 속성으로 보안 격리
```

---

### 3.4 대시보드 컴포넌트

#### `src/components/dashboard/ProjectCard.tsx`
```typescript
interface ProjectCardProps {
  project: Project;
  onOpen: (url: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

// 역할: 프로젝트 카드 (서비스명, 상태, API, URL, 통계)
// 액션 드롭다운: 열기, 수정, 재생성, 삭제
```

#### `src/components/dashboard/ProjectGrid.tsx`
```typescript
interface ProjectGridProps {
  projects: Project[];
}

// 역할: 프로젝트 카드 그리드 배치
// 빈 상태: "아직 만든 서비스가 없어요" + [첫 서비스 만들기] 버튼
// 그리드: 모바일 1열, 태블릿 2열, 데스크톱 3열
```

---

## 4. 상태 관리 명세

### 4.1 빌더 스토어 (Sprint v2에서 분리)

> **참고**: v2 아키텍처에서 단일 `builderStore.ts` 대신 도메인별 스토어로 분리되었습니다.

#### `src/stores/apiSelectionStore.ts`
```typescript
// 선택된 API 목록 관리
interface ApiSelectionState {
  selectedApis: ApiCatalogItem[];
}
interface ApiSelectionActions {
  addApi: (api: ApiCatalogItem) => void;
  removeApi: (id: string) => void;
  clearApis: () => void;
}
```

#### `src/stores/contextStore.ts`
```typescript
// 서비스 컨텍스트 및 템플릿 관리
interface ContextState {
  context: string;
  selectedTemplate: string | null;
}
interface ContextActions {
  setContext: (context: string) => void;
  setTemplate: (templateId: string) => void;
  isValid: () => boolean;   // contextMinLength 이상 여부
  reset: () => void;
}
```

#### `src/stores/generationStore.ts`
```typescript
// 코드 생성 상태 관리
interface GenerationState {
  status: 'idle' | 'generating' | 'completed' | 'failed';
  progress: number;
  currentStep: string;
  projectId: string | null;
  error: string | null;
}
interface GenerationActions {
  startGeneration: () => void;
  updateProgress: (progress: number, step: string) => void;
  completeGeneration: (projectId: string) => void;
  failGeneration: (error: string) => void;
  reset: () => void;
}
```

#### `src/stores/deployStore.ts`
```typescript
// 배포 상태 관리
interface DeployState {
  status: 'idle' | 'deploying' | 'deployed' | 'failed';
  deployUrl: string | null;
  error: string | null;
}
interface DeployActions {
  startDeploy: () => void;
  completeDeploy: (url: string) => void;
  failDeploy: (error: string) => void;
  reset: () => void;
}
```

### 4.2 인증 스토어 (`src/stores/authStore.ts`)
```typescript
interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthActions {
  setUser: (user: User | null) => void;
  signOut: () => Promise<void>;
}
```

---

## 5. API Route 명세

### 5.1 `src/app/api/v1/catalog/route.ts`
```typescript
// GET /api/v1/catalog
// Query: category?, search?, page?, limit?
// Auth: 불필요 (공개)
// Response: { success: true, data: { items: ApiCatalogItem[], total, page, totalPages } }

// 로직:
// 1. 쿼리 파라미터 파싱 (parseInt 검증, 경계값 클램핑)
// 2. Supabase에서 api_catalog 테이블 조회
//    - category 필터 (있으면)
//    - search: name, description에서 ILIKE 검색
//      (특수문자 %_\ 제거 후 빈 문자열이면 { items: [], total: 0 } 반환)
//    - is_active = true, deprecated_at IS NULL
//    - 페이지네이션
// 3. 결과 반환
```

### 5.2 `src/app/api/v1/catalog/categories/route.ts`
```typescript
// GET /api/v1/catalog/categories
// Auth: 불필요
// Response: { success: true, data: Category[] }

// 로직:
// 1. api_catalog에서 category별 GROUP BY COUNT
// 2. 카테고리 메타데이터(label, icon) 매핑
// 3. 결과 반환
```

### 5.3 `src/app/api/v1/projects/route.ts`
```typescript
// POST /api/v1/projects
// Auth: 필수
// Body: { name: string, context: string, apiIds: string[] }
// Validation: Zod schema
//   - name: 1~200자
//   - context: 50~2000자
//   - apiIds: 1~5개, 존재하는 API ID

// 로직:
// 1. 인증 확인
// 2. 입력 검증
// 3. projects 테이블에 INSERT (status: 'draft')
// 4. project_apis 테이블에 매핑 INSERT
// 5. 생성된 프로젝트 반환

// GET /api/v1/projects
// Auth: 필수
// Response: 사용자의 프로젝트 목록 (project_apis JOIN)
```

### 5.4 `src/app/api/v1/generate/route.ts`
```typescript
// POST /api/v1/generate
// Auth: 필수
// Body: { projectId: string }
// Response: SSE (Server-Sent Events)

// 로직:
// 1. 인증 확인 & 프로젝트 소유권 확인
// 2. RateLimitService.checkDailyGenerationLimit() - 이중 체크 (SSE 전 HTTP 429 조기 반환)
// 3. 프로젝트 + 선택 API 정보 조회
// 4. SSE 스트림 시작
// 5. SSE 내부 2차 rate limit 체크 (레이스 컨디션 창 축소)
// 6. 프롬프트 구성 (시스템 + 사용자)
// 7. AI API 호출 (Promise.race() + 타임아웃으로 무한 대기 방지)
// 8. 응답에서 HTML/CSS/JS 파싱 + sanitizeCss() 보안 정제
// 9. 보안 검증 수행
// 10. generated_codes 테이블에 저장
// 11. projects 상태 업데이트 (status: 'generated')
//     - 실패 시 보상 트랜잭션: codeRepo.delete(code.id)로 고아 레코드 정리
// 12. SSE complete 이벤트 전송

// SSE 이벤트 형식:
// event: progress
// data: {"progress": 10, "message": "..."}
```

### 5.5 `src/app/api/v1/deploy/route.ts`
```typescript
// POST /api/v1/deploy
// Auth: 필수
// Body: { projectId: string, platform: 'railway' | 'github_pages' }
//   - platform은 DeployProviderFactory.getSupportedPlatforms()로 유효성 검사
// Response: SSE

// 로직:
// 1. 인증 확인 & platform 유효성 검사
// 2. SSE 스트림 시작
// 3. DeployService.deploy() 호출 (진행률 콜백 포함)
//    - GitHub 저장소 생성 → 코드 Push → 플랫폼 배포
// 4. SSE complete: { projectId, deployUrl, repoUrl, platform }

// SSE 이벤트 형식:
// event: progress
// data: {"progress": 30, "message": "코드 업로드 중..."}
//
// event: complete
// data: {"projectId": "...", "deployUrl": "...", "repoUrl": "...", "platform": "railway"}
//
// event: error
// data: {"message": "..."}
```

### 5.5-b `src/app/api/v1/generate/regenerate/route.ts` ✅ 구현 완료
```typescript
// POST /api/v1/generate/regenerate
// Auth: 필수
// Body: { projectId: string, feedback: string }
// Response: SSE

// 로직:
// 1. 인증 확인
// 2. RateLimitService.checkDailyGenerationLimit() - SSE 전 이중 체크
// 3. 프로젝트 소유권 확인 + 기존 코드 조회
// 4. 재생성 횟수 제한 확인 (maxRegenerationsPerProject)
// 5. SSE 내부 2차 rate limit 체크
// 6. buildRegenerationPrompt(이전코드, feedback)로 프롬프트 구성
// 7. AI 코드 생성 (Promise.race() + 타임아웃) → 파싱 → 검증
// 8. 새 버전으로 generated_codes 저장 (metadata.userFeedback 포함)
// 9. projects 상태 'generated'로 업데이트 (실패 시 보상 트랜잭션)
// 10. CODE_GENERATED 이벤트 발행
```

### 5.5-d `src/services/rateLimitService.ts` ✅ 구현 완료
```typescript
// RateLimitService — 중앙화된 생성 횟수 제한 서비스
// 생성자: constructor(supabase: SupabaseClient)
//   - ProjectRepository를 내부 생성하여 count_today_generations() RPC 호출

// checkDailyGenerationLimit(userId: string): Promise<void>
//   - 오늘 생성 횟수 조회 (count_today_generations RPC — 단일 쿼리)
//   - maxDailyGenerations(기본 10) 초과 시 RateLimitError 발생
//   ⚠️ 레이스 컨디션 주의: 동시 요청이 동일 카운트를 읽어 한도를 초과할 수 있음.
//      완전한 방지는 pg_advisory_lock 또는 Redis 카운터가 필요하지만,
//      generate route에서 이중 체크(SSE 전 + SSE 내부)로 창을 최소화함.
```

### 5.5-c `src/app/api/v1/projects/[id]/publish/route.ts` ✅ 구현 완료
```typescript
// POST /api/v1/projects/:id/publish → 게시 (status: 'published', slug 자동 생성)
// DELETE /api/v1/projects/:id/publish → 게시 취소 (status: 'unpublished')
// Auth: 필수
```

### 5.6 `src/app/api/v1/preview/[projectId]/route.ts` ✅ 구현 완료
```typescript
// GET /api/v1/preview/:projectId
// Auth: 필수
// Query: version? (기본 최신, 1 이상 정수 — 미충족 시 ValidationError 400)
// Response: text/html (생성된 HTML 페이지)

// 로직:
// 1. 인증 확인 & 소유권 확인
// 2. version 파라미터 parseInt + isNaN 검증 (0 또는 음수 불허)
// 3. generated_codes에서 해당 버전 코드 조회
// 4. assembleHtml()로 HTML + CSS + JS를 완성된 HTML로 조합
// 5. Content-Type: text/html; charset=utf-8로 반환 (CSP, X-Frame-Options 헤더 포함)
```

### 5.7-a `src/app/site/[slug]/route.ts` ✅ 구현 완료
```typescript
// GET /site/:slug
// Auth: 불필요 (공개)
// Response: text/html (완성된 웹 애플리케이션)

// 로직:
// 1. slug 유효성 검사 (예약어 차단)
// 2. slug로 프로젝트 조회
// 3. status === 'published' 확인 (미게시 시 준비 중 안내 페이지)
// 4. 최신 generated_codes 조회
// 5. assembleHtml()로 완성된 HTML 반환
// 6. CSP 헤더 적용 (외부 API 호출 허용)
// 7. Cache-Control: public, s-maxage=60
```

### 5.7-c `src/app/api/v1/suggest-context/route.ts` ✅ 신규 구현
```typescript
// POST /api/v1/suggest-context
// Auth: 필수
// Body: { apis: Array<{ name: string; description: string; category: string }> }
//   - apis: 1~5개 (클라이언트가 이미 로드한 ApiCatalogItem 데이터 재사용)
// Response: { success: true, data: { suggestions: string[] } } — 최대 3개

// 로직:
// 1. 인증 확인
// 2. apis 배열 유효성 검사 (길이, 필드 타입, 문자열 길이 제한)
// 3. AiProviderFactory.create()로 AI 호출 (temperature 0.8, maxTokens 600)
//    - 프롬프트: 선택된 API 목록 → 서비스 아이디어 3가지 JSON 배열 요청
// 4. 응답에서 JSON 배열 추출 (/\[[\s\S]*?\]/ 정규식으로 코드블록 허용)
// 5. 파싱 실패 시 suggestions: [] 반환 (UI graceful degradation)
```

### 5.7-b `src/app/api/v1/projects/[id]/rollback/route.ts` ✅ 구현 완료
```typescript
// POST /api/v1/projects/:id/rollback
// Auth: 필수
// Body: { version: number }
// Response: { success: true, data: { projectId, version, rolledBackFrom } }

// 로직:
// 1. 인증 확인 & 소유권 확인
// 2. 대상 버전 코드 존재 확인
// 3. 대상 버전 코드를 새 버전으로 복사 (rollback = 새 버전 생성)
// 4. 프로젝트 상태를 'generated'로 업데이트
// 5. CODE_GENERATED 이벤트 발행
```

---

## 6. 커스텀 훅 명세

### `src/hooks/useApiCatalog.ts`
```typescript
// 역할: API 카탈로그 데이터 패칭 & 필터링
// 반환: { apis, categories, isLoading, error, refetch }
// 내부: useSWR 또는 React Query 패턴 (fetch + useState)
// 캐싱: 카탈로그 데이터는 10분 캐싱
```

### `src/hooks/useProjects.ts`
```typescript
// 역할: 사용자 프로젝트 목록 CRUD
// 반환: { projects, isLoading, createProject, deleteProject, refetch }
```

### `src/hooks/useGeneration.ts`
```typescript
// 역할: 코드 생성 SSE 연결 & 상태 관리
// 반환: { startGeneration, progress, status, error }
// 내부: EventSource로 SSE 연결, builderStore 상태 업데이트
```

### `src/hooks/useDeploy.ts`
```typescript
// 역할: 배포 SSE 연결 & 상태 관리
// 반환: { startDeploy, progress, status, deployUrl, error }
```

### `src/hooks/useAuth.ts`
```typescript
// 역할: Supabase Auth 상태 관리 (클라이언트 사이드)
// 반환: { user, isLoading, isAuthenticated, signOut }
// 참고: OAuth 로그인은 login/page.tsx에서 signInWithOAuth() 호출
//       사용자 레코드 생성은 callback/route.ts (서버사이드)에서 처리
```

---

## 7. 타입 정의 (`src/types/`)

### `src/types/api.ts`
```typescript
export interface ApiCatalogItem {
  id: string;
  name: string;
  description: string;
  category: string;
  baseUrl: string;
  authType: 'none' | 'api_key' | 'oauth';
  authConfig: Record<string, unknown>;
  rateLimit: string | null;
  isActive: boolean;
  iconUrl: string | null;
  docsUrl: string | null;
  endpoints: ApiEndpoint[];
  tags: string[];
  apiVersion: string | null;        // API 버전 정보
  deprecatedAt: string | null;      // 폐기 일자
  successorId: string | null;       // 후속 API ID
  corsSupported: boolean;            // CORS 지원 여부
  requiresProxy: boolean;            // 프록시 필요 여부
  creditRequired: number | null;     // 필요 크레딧 수 (null = 무료)
  createdAt: string;
  updatedAt: string;
}

export interface ApiEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  description: string;
  params: ApiParam[];
  responseExample: Record<string, unknown>;
}

export interface ApiParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
  defaultValue?: string;
}

export interface Category {
  key: string;
  label: string;
  icon: string;
  count: number;
}
```

### `src/types/project.ts`
```typescript
export type ProjectStatus =
  | 'draft'
  | 'generating'
  | 'generated'
  | 'deploying'    // 기존 Railway 배포 호환용
  | 'deployed'     // 기존 호환용
  | 'published'    // 서브도메인으로 게시됨 (/site/:slug)
  | 'unpublished'  // 게시 취소
  | 'failed';

export interface Project {
  id: string;
  userId: string;
  organizationId: string | null;
  name: string;
  context: string;
  status: ProjectStatus;
  deployUrl: string | null;
  deployPlatform: string | null;
  repoUrl: string | null;
  previewUrl: string | null;
  metadata: ProjectMetadata;
  currentVersion: number;
  apis: ApiCatalogItem[];
  slug: string | null;          // 공개 URL 슬러그 (게시 시 자동 생성)
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMetadata {
  tags?: string[];
  isPublic?: boolean;
  viewCount?: number;
  lastDeployedAt?: string;
  deployHistory?: DeployHistoryEntry[];
}

export interface DeployHistoryEntry {
  version: number;
  deployedAt: string;
  platform: string;
  url: string;
}

export interface GeneratedCode {
  id: string;
  projectId: string;
  version: number;
  codeHtml: string;
  codeCss: string;
  codeJs: string;
  framework: 'vanilla' | 'react' | 'next';
  aiProvider: string | null;        // 사용된 AI 제공자 (e.g., 'grok')
  aiModel: string | null;           // 사용된 모델명
  aiPromptUsed: string | null;      // 실제 사용된 프롬프트
  generationTimeMs: number | null;  // 생성 소요 시간 (ms)
  tokenUsage: { input: number; output: number } | null;
  dependencies: string[];           // 사용된 외부 라이브러리
  metadata: CodeMetadata;
  createdAt: string;
}

export interface CodeMetadata {
  qualityScore?: number;
  securityCheckPassed?: boolean;
  hasResponsive?: boolean;
  hasDarkMode?: boolean;
  externalLibs?: string[];
  userFeedback?: string | null;     // 재생성 시 사용자 피드백
  validationErrors?: string[];
}
```

### `src/types/generation.ts`
```typescript
export type GenerationStepType = 'analyzing' | 'generating_code' | 'styling' | 'validating';

export interface GenerationStep {
  type: GenerationStepType;
  label: string;
  icon: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface GenerationProgressEvent {
  step: GenerationStepType;
  progress: number;
  message: string;
}

export interface GenerationCompleteEvent {
  projectId: string;
  version: number;
  previewUrl: string;
}
```

---

## 8. AI 코드 생성 모듈 명세

### `src/lib/ai/promptBuilder.ts`
```typescript
// buildSystemPrompt(): string
// - 시스템 프롬프트 반환 (코드 생성 규칙)

// buildUserPrompt(apis: ApiCatalogItem[], context: string, template?: string): string
// - 선택된 API 정보 + 사용자 컨텍스트를 결합한 프롬프트 생성
// - 각 API의 엔드포인트, 파라미터, 응답 예시 포함

// buildRegenerationPrompt(previousCode: GeneratedCode, feedback: string): string
// - 이전 코드 + 수정 피드백 기반 재생성 프롬프트
```

### `src/lib/ai/codeParser.ts`
```typescript
// parseGeneratedCode(aiResponse: string): { html: string, css: string, js: string }
// - AI 응답에서 ```html ```, ```css ```, ```javascript ``` 블록 추출
// - 마크다운 코드 블록 파싱

// sanitizeCss(css: string): string
// - CSS 인젝션 공격 벡터 제거 (expression(), url(javascript:), behavior:, -moz-binding:)
// - assembleHtml() 내부에서 자동 호출

// assembleHtml(html: string, css: string, js: string): string
// - HTML/CSS/JS를 하나의 완전한 HTML 파일로 조합
// - CSS는 sanitizeCss()로 보안 정제 후 <style> 태그로 인라인 삽입
// - <script> 태그로 JS 인라인 삽입
// - meta 태그, viewport 등 추가
```

### `src/lib/ai/codeValidator.ts`
```typescript
// validateSecurity(code: string): ValidationResult[]
// - eval() 사용 금지 확인
// - innerHTML 위험 패턴 확인
// - API 키 하드코딩 확인
// - 외부 스크립트 안전성 확인

// validateFunctionality(html: string, css: string, js: string): ValidationResult[]
// - 기본 HTML 구조 확인
// - JS 문법 오류 확인 (간단한 파싱)
// - API 호출 URL 형식 확인
```

### `src/providers/ai/GrokProvider.ts`
```typescript
// generateCode(prompt: AiPrompt): Promise<AiResponse>
// - xAI Grok API 호출 (OpenAI 호환 SDK 사용)
// generateCodeStream(prompt: AiPrompt): AsyncGenerator<string>
// - 스트리밍 응답 청크를 yield
// checkAvailability(): Promise<{ available: boolean }>
// - API 가용성 확인
```

---

## 9. 배포 모듈 명세

### `src/lib/deploy/githubService.ts`
```typescript
// createRepository(name: string): Promise<{ repoUrl: string, fullName: string }>
// - GitHub API로 Organization 하위에 저장소 생성
// - 저장소 이름: `svc-{projectId의 앞 8자리}`

// pushCode(repoFullName: string, files: FileEntry[]): Promise<void>
// - 생성된 코드 파일을 저장소에 Push
// - 초기 커밋으로 생성

// setSecrets(repoFullName: string, secrets: Record<string, string>): Promise<void>
// - API 키 등을 GitHub Secrets에 설정
// ⚠️ 알려진 제한: GitHub Secrets API는 libsodium(tweetnacl) 공개키 암호화를 요구합니다.
//    현재 tweetnacl 패키지가 미설치 상태이므로 setSecrets()는 시크릿 주입을 건너뛰고
//    경고 로그를 출력합니다. 완전한 시크릿 지원이 필요하면 tweetnacl 패키지를 추가하세요.
```

### `src/lib/deploy/railwayService.ts`
```typescript
// deployProject(repoUrl: string, envVars: Record<string, string>): Promise<{ deployUrl: string }>
// - Railway API로 GitHub 저장소 연결
// - 환경변수 설정
// - 배포 트리거
// - 배포 URL 반환

// getDeploymentStatus(deploymentId: string): Promise<DeploymentStatus>
// - 배포 상태 조회
```

---

## 10. Supabase 마이그레이션

### `supabase/migrations/001_initial_schema.sql`
```sql
-- 전체 스키마 생성 (05_데이터베이스_설계.md 참조)
-- users, api_catalog, projects, project_apis, generated_codes
-- 인덱스, RLS 정책 포함
```

### `supabase/migrations/002_slug.sql`
```sql
-- projects 테이블에 slug, published_at 컬럼 추가
-- 공개 서비스 URL (site/:slug) 지원을 위한 스키마 확장
```

### `supabase/migrations/003_helpers.sql`
```sql
-- count_today_generations(p_user_id UUID) RPC 함수
--   projects와 generated_codes를 INNER JOIN하여 단일 쿼리로 오늘 생성 횟수 반환
--   (N+1 쿼리 제거 목적)
-- published 프로젝트에 대한 RLS 정책 추가
--   (비로그인 사용자도 published 상태 프로젝트 읽기 허용)
```

### `supabase/migrations/004_fix_memberships_rls.sql`
```sql
-- memberships RLS 무한 재귀 버그 수정
--
-- 문제: "Org members can view co-memberships", "Org admins can manage memberships" 정책이
--       memberships 테이블 자체를 서브쿼리로 조회 → PostgreSQL이 RLS 재평가 → 무한 재귀
--
-- 해결: SECURITY DEFINER 헬퍼 함수 2개 도입
--   - get_user_org_ids(uid UUID): 사용자가 속한 조직 ID 목록 반환 (RLS 우회)
--   - is_org_admin(uid UUID, org_id UUID): 사용자가 해당 조직의 admin/owner인지 확인 (RLS 우회)
-- 기존 재귀 정책을 DROP하고 헬퍼 함수 기반 정책으로 교체
-- organizations 테이블의 관련 정책도 동일하게 수정
```

### `supabase/seed.sql`
```sql
-- API 카탈로그 초기 데이터
-- 카테고리별 최소 2개씩, 총 54개 API 시드 데이터 (해외 39개 + 국내 15개)
-- (04_무료_API_카탈로그.md 참조)
```
