# 개발 가이드

> **최종 업데이트:** 2026-04-12

---

## 1. 개발 환경 설정

### 필수 도구
- Node.js 20+, pnpm 최신 버전

### 설치 및 실행
```bash
pnpm install
cp .env.example .env.local   # 환경변수 설정 (docs/reference/env-vars.md 참조)
pnpm dev                      # Turbopack 개발 서버 시작
```

---

## 2. 코딩 컨벤션

### 파일/폴더 네이밍

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

### 코드 스타일

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

### Import 순서

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

### 에러 처리 패턴

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

## 3. 아키텍처 레이어 규칙

- **Route Handler** → 인증 확인(`getAuthUser`) + Zod 검증 + Service 호출만
- **Service** → 비즈니스 로직, Factory 함수로 Repository 주입
- **Repository** → DB CRUD만, 비즈니스 판단 없음

### Service/Repository 생성 패턴 (Factory 패턴 필수)

```typescript
// ✅ 올바른 방식
import { createProjectService, createRateLimitService } from '@/services/factory';
import { createCodeRepository } from '@/repositories/factory';

const projectService = createProjectService(supabase);
const codeRepo = createCodeRepository(supabase);

// ❌ 금지 — 테스트 불가, Provider 전환 불가
const service = new ProjectService(supabase);
```

---

## 4. 테스트 작성 가이드

### 통합 테스트 (API Routes) — 모킹 패턴

```typescript
// vi.mock을 파일 상단에 선언 (호이스팅됨)
vi.mock('@/services/factory', () => ({
  createProjectService: vi.fn(),
  createRateLimitService: vi.fn(),
}));
vi.mock('@/repositories/factory', () => ({
  createCodeRepository: vi.fn(),
}));
vi.mock('@/lib/auth/index', () => ({
  getAuthUser: vi.fn(),
}));

// 각 테스트에서 동적 import 사용
const { POST } = await import('@/app/api/v1/your-route/route');
```

### 테스트 파일 위치

- 소스 파일 옆 co-located: `src/lib/foo/bar.test.ts`
- 통합 테스트: `src/__tests__/api/`
- 테스트 헬퍼/설정: `src/test/`

### 품질 채점 기준 (코드 생성 테스트 시)

| 점수 | 기준 |
|------|------|
| 5 | 코드 복사 → 바로 동작, 디자인 우수, 에러 처리 완벽 |
| 4 | 경미한 수정으로 동작, 디자인 양호 |
| 3 | 일부 수정 필요하지만 구조는 올바름 |
| 2 | 상당한 수정 필요, 일부 기능 누락 |
| 1 | 동작하지 않거나 요청과 무관한 결과 |

**최소 합격 기준: 평균 3.5점 이상**

---

## 5. 주요 명령어

```bash
pnpm dev              # 개발 서버 (Turbopack)
pnpm build            # 프로덕션 빌드
pnpm test             # 전체 테스트
pnpm test:coverage    # 커버리지 리포트
pnpm type-check       # TypeScript 검사
pnpm lint             # ESLint
pnpm lint:fix         # ESLint 자동 수정
pnpm format           # Prettier 포맷팅
```
