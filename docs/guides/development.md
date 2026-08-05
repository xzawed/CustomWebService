# 개발 가이드

> **언제 읽나**: 개발 환경을 새로 세팅하거나 팩토리·의존성 주입 규칙, 로컬 실행 절차를 바꿀 때

> **최종 업데이트:** 2026-08-01

---

## 1. 개발 환경 설정

### 필수 도구
- Node.js 22+ (`package.json` `engines.node: ">=22"`), pnpm 9+

### 설치 및 실행
```bash
pnpm install
cp .env.example .env.local   # 환경변수 설정 (docs/reference/env-vars.md 참조)
pnpm dev                      # Turbopack 개발 서버 시작
```

> 포맷팅은 ESLint에 통합되어 있다. `prettier`/`pnpm format` 스크립트는 없다 — `pnpm lint` / `pnpm lint:fix`로 처리.

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
| API Route | kebab-case 디렉토리 | `api/v1/projects/route.ts` |

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
import { Sparkles } from 'lucide-react';

// 3. 내부 모듈 (절대 경로 — `@/*` → `src/*`)
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
- **Service** → 비즈니스 로직. Factory로 생성 (내부에서 Repository 조립)
- **Repository** → DB CRUD만, 비즈니스 판단 없음
- **DB** → 임베디드 SQLite (`better-sqlite3` + drizzle-orm). Supabase/Postgres 경로 없음 (2026-06-23 컷오버)

### Service/Repository 생성 패턴 (무인자 Factory)

팩토리는 **인자를 받지 않는다**. 내부에서 `getSqliteDb()`로 연결을 얻는다
(`src/repositories/factory.ts`, `src/services/factory.ts`).

```typescript
// ✅ 올바른 방식
import { createProjectService, createRateLimitService } from '@/services/factory';
import { createCodeRepository } from '@/repositories/factory';

const projectService = createProjectService();
const codeRepo = createCodeRepository();

// ❌ 금지 — 팩토리를 건너뛰고 직접 생성
const service = new ProjectService(/* ... */);

// ❌ 금지 — Supabase 클라이언트 주입 (제거됨)
// createProjectService(supabase)
```

---

## 4. 테스트 작성 가이드

테스트 전략·분류별 검증 항목·모킹 패턴·실행 명령어 전체는 [testing.md](testing.md) 참조.

---

## 5. 주요 명령어

```bash
pnpm dev              # 개발 서버 (Turbopack)
pnpm build            # 프로덕션 빌드
pnpm test             # 전체 테스트
pnpm test:unit        # 단위 테스트
pnpm test:integration # 통합 테스트 (API routes)
pnpm test:coverage    # 커버리지 리포트
pnpm test:e2e         # E2E (Playwright — 실 백엔드 env 필요)
pnpm type-check       # TypeScript 검사
pnpm lint             # ESLint
pnpm lint:fix         # ESLint 자동 수정
```

```bash
# 운영/데이터 스크립트
pnpm countries:generate  # 국가 데이터(src/data/countries.json) 재생성 (tsx scripts/generateCountries.ts)
pnpm countries:check     # 쓰기 없이 업스트림 대비 드리프트 검사 (동일 0 / 어긋남 1)
```

월 1회 GitHub Actions(`.github/workflows/countries-freshness.yml`)가 `countries:check`를 돌린다.
**드리프트가 있을 때만 이슈를 1건 열고**, 없으면 조용히 성공한다(이슈·실패·알림 없음).
이슈가 이미 열려 있으면 중복 생성하지 않는다. 종료 코드는 `0` 동일 · `1` 드리프트 · `2` 업스트림 도달 실패이며,
`2`는 일시 장애로 보고 이슈를 만들지 않는다.

> 갱신 PR을 자동으로 만들지 않는 이유: 이 레포는 Actions의 PR 생성이 꺼져 있고
> (`can_approve_pull_request_reviews: false`), 켜더라도 `GITHUB_TOKEN`이 만든 PR에는 **CI가 돌지 않는다**.
> 사람이 `pnpm countries:generate` 후 평소대로 PR을 올려야 데이터 변경이 CI로 검증된다.

> 카탈로그 헬스·플랫폼 키 검증 CLI(`pnpm catalog:healthcheck` / `pnpm keys:verify`)는
> SQLite 컷오버로 제거됨. 배포 런타임에서는 관리자 엔드포인트를 사용한다:
> `GET /api/v1/admin/keys-verify`, `POST /api/v1/admin/verify-catalog` (`ADMIN_API_KEY`).
