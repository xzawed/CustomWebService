# DB/Auth Provider 이중화 아키텍처

> **최종 업데이트:** 2026-04-11  
> **구현 상태:** 완료 (224/224 테스트 통과, 타입 에러 0)  
> **브랜치:** `feat/db-provider-migration`

---

## 개요

환경변수(`DB_PROVIDER`, `AUTH_PROVIDER`) 하나로 **Supabase ↔ 온프레미스 PostgreSQL**을 전환할 수 있는 이중 provider 아키텍처. Supabase 요금 절감 및 장애 시 예비 서버 운용을 목적으로 도입.

### 핵심 원칙
- **기본값 불변**: `DB_PROVIDER=supabase`(기본) 모드에서 기존 코드 경로 100% 보존
- **격리**: 각 provider 구현체는 인터페이스를 통해서만 참조 (정적 import 금지)
- **Factory 패턴**: Route Handler는 구현체를 직접 알지 못하고 팩토리 함수만 호출

---

## 환경변수

| 변수 | 값 | 필수 조건 | 설명 |
|------|----|----------|------|
| `DB_PROVIDER` | `supabase` (기본) \| `postgres` | 항상 | DB 구현체 선택 |
| `AUTH_PROVIDER` | `supabase` (기본) \| `authjs` | 항상 | Auth 구현체 선택 |
| `NEXT_PUBLIC_AUTH_PROVIDER` | `supabase` (기본) \| `authjs` | 항상 | 클라이언트 컴포넌트용 빌드 타임 상수 |
| `DATABASE_URL` | PostgreSQL 연결 문자열 | `DB_PROVIDER=postgres` 시 필수 | 온프레미스 DB URL |
| `AUTH_SECRET` | 임의 시크릿 | `AUTH_PROVIDER=authjs` 시 필수 | NextAuth 세션 서명 키 |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth 자격증명 | `AUTH_PROVIDER=authjs` 시 필수 | |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth 자격증명 | `AUTH_PROVIDER=authjs` 시 필수 | |

---

## 아키텍처 레이어

```
Route Handler
    │
    ├── getAuthUser()          ← lib/auth/index.ts (provider 무관 통합)
    │       ├── supabase 모드: getSupabaseAuthUser()  (정적 import 가능)
    │       └── authjs 모드:  getAuthJsUser()          (동적 import 필수)
    │
    └── createXxxService(supabase?)  ← services/factory.ts
            │
            └── createXxxRepository(supabase?)  ← repositories/factory.ts
                    ├── supabase 모드: SupabaseXxxRepository(supabase)
                    └── postgres 모드: DrizzleXxxRepository(getDb())
```

---

## DB 추상화 (Repository 패턴)

### 인터페이스 위치
`src/repositories/interfaces/` — 9개 인터페이스

| 인터페이스 | Supabase 구현체 | Drizzle 구현체 |
|-----------|----------------|---------------|
| `IProjectRepository` | `ProjectRepository` | `DrizzleProjectRepository` |
| `IUserRepository` | `UserRepository` | `DrizzleUserRepository` |
| `ICodeRepository` | `CodeRepository` | `DrizzleCodeRepository` |
| `ICatalogRepository` | `CatalogRepository` | `DrizzleCatalogRepository` |
| `IOrganizationRepository` | `OrganizationRepository` | `DrizzleOrganizationRepository` |
| `IEventRepository` | `EventRepository` | `DrizzleEventRepository` |
| `IRateLimitRepository` | `RateLimitRepository` | `DrizzleRateLimitRepository` |
| `IUserApiKeyRepository` | `UserApiKeyRepository` | `DrizzleUserApiKeyRepository` |

### Repository 팩토리 패턴

```typescript
// src/repositories/factory.ts
export async function createProjectRepository(
  supabase?: SupabaseClient
): Promise<IProjectRepository> {
  if (getDbProvider() === 'postgres') {
    return new DrizzleProjectRepository(getDb());
  }
  return new ProjectRepository(supabase!);
}
```

### Drizzle 연결

`src/lib/db/connection.ts` — `pg.Pool` 싱글턴 + `drizzle(pool)` 래핑

```typescript
// DB_PROVIDER=postgres일 때만 활성화
// DATABASE_URL 미설정 시 startup에서 에러 throw
export function getDb(): DrizzleDb { ... }
```

---

## Auth 추상화

### 통합 팩토리

```typescript
// src/lib/auth/index.ts
export async function getAuthUser(): Promise<AuthUser | null> {
  const provider = getAuthProvider();
  if (provider === 'authjs') {
    // 동적 import 필수 — authjs-config.ts는 module-level에서 getDb() 호출
    const { getAuthJsUser } = await import('@/lib/auth/authjs-auth');
    return getAuthJsUser();
  }
  return getSupabaseAuthUser();
}
```

### ⚠️ 동적 Import 규칙 (중요)

`authjs-config.ts`와 `authjs-auth.ts`는 **절대 정적 import 금지**.

**이유:** `authjs-config.ts`는 모듈 최상위 레벨에서 `getDb()`를 호출. `DB_PROVIDER=supabase`(기본) 환경에서 정적으로 import되면 `DATABASE_URL` 미설정으로 즉시 crash.

```typescript
// ✅ 올바른 방법
const { getAuthJsUser } = await import('@/lib/auth/authjs-auth');

// ❌ 금지
import { getAuthJsUser } from '@/lib/auth/authjs-auth';
```

### AuthUser 인터페이스

```typescript
// src/lib/auth/types.ts
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}
```

### Auth.js (NextAuth v5) 설정

- **어댑터:** `@auth/drizzle-adapter` — 세션을 동일 PostgreSQL에 저장
- **OAuth:** Google + GitHub
- **테이블:** `account`, `session`, `verificationToken` (Drizzle 스키마에 포함)
- **세션:** JWT 전략

---

## 인가 (Authorization)

### Supabase 모드
Row Level Security(RLS) 정책이 DB 레벨에서 처리.

### postgres 모드
`assertOwner()`가 애플리케이션 레벨에서 소유권 검증.

```typescript
// src/lib/auth/authorize.ts
export function assertOwner(
  resource: { userId: string },
  requestingUserId: string
): void {
  if (resource.userId !== requestingUserId) {
    throw new ForbiddenError();
  }
}
```

Service 레이어에서 사용:
```typescript
const project = await this.projectRepo.findById(projectId);
assertOwner(project, userId);  // RLS 대체
```

---

## 온프레미스 마이그레이션

### Drizzle Kit (권장)
```bash
# 스키마 자동 push
DATABASE_URL=postgresql://... npx drizzle-kit push

# 마이그레이션 파일 생성 후 적용
DATABASE_URL=postgresql://... npx drizzle-kit generate
DATABASE_URL=postgresql://... npx drizzle-kit migrate
```

### 수동 SQL
`supabase/migrations/postgres/001_initial_schema.sql` — 8개 Supabase 마이그레이션 통합본. RLS 정책, `auth.uid()`, `auth.users` FK 제거됨. Auth.js 테이블 포함.

---

## Provider 감지 및 캐싱

```typescript
// src/lib/config/providers.ts
let _cachedDbProvider: 'supabase' | 'postgres' | null = null;

export function getDbProvider(): 'supabase' | 'postgres' {
  if (_cachedDbProvider) return _cachedDbProvider;
  // 환경변수 읽기 + 유효성 검증
  _cachedDbProvider = ...;
  return _cachedDbProvider;
}

// 테스트 격리용
export function _resetProviderCache(): void {
  _cachedDbProvider = null;
  _cachedAuthProvider = null;
}
```

테스트에서 반드시 `beforeEach(() => _resetProviderCache())` 호출.

---

## 클라이언트 컴포넌트

`NEXT_PUBLIC_AUTH_PROVIDER` 빌드 타임 상수로 분기:

```typescript
// src/hooks/useAuth.ts
const isAuthJs = process.env.NEXT_PUBLIC_AUTH_PROVIDER === 'authjs';

export function useAuth() {
  const supabaseAuth = useSupabaseAuth(); // AUTH_PROVIDER=supabase 시만 활성
  const authjsAuth = useAuthJsAuth();     // AUTH_PROVIDER=authjs 시만 활성
  return isAuthJs ? authjsAuth : supabaseAuth;
}
```

`SessionProvider`는 `AUTH_PROVIDER=authjs`일 때만 `layout.tsx`에 포함:
```tsx
// src/app/layout.tsx
{NEXT_PUBLIC_AUTH_PROVIDER === 'authjs' ? (
  <SessionProvider>{children}</SessionProvider>
) : children}
```

---

## API Route 패턴

모든 API Route는 아래 패턴을 따름:

```typescript
export async function POST(request: Request): Promise<Response> {
  const user = await getAuthUser();          // provider 무관
  if (!user) throw new AuthRequiredError();

  const provider = getDbProvider();
  const supabase = provider === 'supabase'   // 1회 호출, 캐시
    ? await createClient()
    : undefined;

  const service = createProjectService(supabase); // 팩토리
  // ...
}
```

---

## 구현 현황 (2026-04-11)

| 항목 | 상태 |
|------|------|
| DB 인터페이스 9개 | ✅ 완료 |
| Drizzle 구현체 8개 | ✅ 완료 |
| Repository 팩토리 | ✅ 완료 |
| Auth.js 설정 | ✅ 완료 |
| getAuthUser() 통합 | ✅ 완료 |
| Service 팩토리 | ✅ 완료 |
| API Route 전환 (14개+) | ✅ 완료 |
| middleware 분기 | ✅ 완료 |
| useAuth 분기 | ✅ 완료 |
| assertOwner() | ✅ 완료 |
| 온프레미스 SQL | ✅ 완료 |
| 테스트 (224개) | ✅ 전체 통과 |
| 타입 검사 | ✅ 에러 0 |
