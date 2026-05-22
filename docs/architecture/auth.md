# 인증/인가 아키텍처

> **최종 업데이트:** 2026-05-22  
> **기본 Provider:** Supabase Auth (Google, GitHub OAuth)

---

## 1. OAuth 인증 흐름

```
[사용자: Google/GitHub 로그인 클릭]
    │
    ▼ signInWithOAuth({ redirectTo: /callback })
[Supabase Auth] → Google/GitHub OAuth → 인증 완료
    │
    ▼ /callback?code=xxx  (origin 정규화: resolveRedirectOrigin() 적용)
[callback/route.ts] (서버사이드 Route Handler)
    ├── exchangeCodeForSession(code) → PKCE 코드 교환 (서버 쿠키 접근)
    ├── supabase.auth.getUser() → 인증된 사용자 정보 직접 조회
    └── 첫 로그인 시: service role client로 users 테이블에 직접 INSERT
        └── id = authUser.id (Supabase Auth ID와 동일하게 설정)
    │
    ▼ redirect origin + /dashboard  (safeRedirect()로 허용 경로 검증)
[Middleware] updateSession()
    └── 인증 쿠키 갱신 → 보호 경로 접근 허용
```

> **핵심**: OAuth 콜백은 반드시 서버사이드 Route Handler에서 처리해야 합니다.
> 클라이언트 컴포넌트에서는 PKCE code verifier 쿠키에 접근할 수 없어 세션 교환이 실패합니다.
> 첫 로그인 시 `authUser.id`를 `users.id`로 사용하여 FK 정합성을 보장합니다.

---

## 2. Auth Provider 추상화

### 환경변수

| 변수 | 값 | 필수 조건 | 설명 |
|------|----|----------|------|
| `AUTH_PROVIDER` | `supabase` (기본) \| `authjs` | 항상 | Auth 구현체 선택 |
| `NEXT_PUBLIC_AUTH_PROVIDER` | `supabase` (기본) \| `authjs` | 항상 | 클라이언트 컴포넌트용 빌드 타임 상수 |
| `AUTH_SECRET` | 임의 시크릿 | `AUTH_PROVIDER=authjs` 시 필수 | NextAuth 세션 서명 키 |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth 자격증명 | `AUTH_PROVIDER=authjs` 시 필수 | |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth 자격증명 | `AUTH_PROVIDER=authjs` 시 필수 | |

### 아키텍처 레이어 (Auth 부분)

```
Route Handler
    │
    └── getAuthUser()          ← lib/auth/index.ts (provider 무관 통합)
            ├── supabase 모드: getSupabaseAuthUser()  (정적 import 가능)
            └── authjs 모드:  getAuthJsUser()          (동적 import 필수)
```

### 통합 팩토리 구현

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

### ⚠️ 동적 Import 규칙 (중요)

`authjs-config.ts`와 `authjs-auth.ts`는 **절대 정적 import 금지**.

**이유:** `authjs-config.ts`는 모듈 최상위 레벨에서 `getDb()`를 호출. `DB_PROVIDER=supabase`(기본) 환경에서 정적으로 import되면 `DATABASE_URL` 미설정으로 즉시 crash.

```typescript
// ✅ 올바른 방법
const { getAuthJsUser } = await import('@/lib/auth/authjs-auth');

// ❌ 금지
import { getAuthJsUser } from '@/lib/auth/authjs-auth';
```

### Provider 전환 방법

`AUTH_PROVIDER` 환경변수를 `authjs`로 변경하면 Auth.js (NextAuth v5) 모드로 전환됨.

- **어댑터:** `@auth/drizzle-adapter` — 세션을 동일 PostgreSQL에 저장
- **OAuth:** Google + GitHub
- **세션:** JWT 전략

---

## 3. 서버사이드 인증 (API Routes)

모든 보호 Route에서:

```typescript
import { getAuthUser } from '@/lib/auth/index';

const user = await getAuthUser();
if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
```

**중요**: `getAuthUser()`는 `lib/auth/index.ts`의 통합 함수. Provider 무관하게 일관된 `AuthUser` 타입을 반환.  
직접 `supabase.auth.getUser()` 호출 금지 — 테스트 모킹과 Provider 전환이 불가능해짐.

---

## 4. 권한 검증 (소유권)

```typescript
import { assertOwner } from '@/lib/auth/authorize';

// 프로젝트 소유자 확인 — 불일치 시 ForbiddenError throw
assertOwner(project, user.id);
```

**파일:** `src/lib/auth/authorize.ts`  
소유자 일치 시 정상 통과. 불일치 시 `ForbiddenError` throw.  
빈 문자열이나 undefined도 불일치로 처리됨.

> **참고:** Supabase 모드에서는 Row Level Security(RLS)가 DB 레벨에서 소유권을 강제합니다.
> Postgres 모드에서는 RLS 없음 — `assertOwner()`가 애플리케이션 레벨 보안 경계입니다.

---

## 5. 첫 로그인 사용자 처리

`/callback` Route Handler에서 OAuth 완료 후 `supabase.auth.getUser()`로 인증 사용자 정보를 직접 조회한다.  
`users` 테이블에 해당 `id`가 없으면 **service role client**를 사용하여 RLS를 우회하고 직접 INSERT한다.

```
users 테이블 레코드 생성 흐름 (callback/route.ts):

1. anon client로 exchangeCodeForSession(code) → 세션 쿠키 설정
2. anon client로 supabase.auth.getUser() → authUser 획득
3. service role client 생성 (SUPABASE_SERVICE_ROLE_KEY 필요)
4. serviceClient.from('users').select().eq('id', authUser.id) → 기존 레코드 확인
5. 없으면: serviceClient.from('users').insert({ id, email, name, avatar_url, preferences: {} })
6. 성공 시: eventBus.emit({ type: 'USER_SIGNED_UP', ... })
```

**에러 처리**: INSERT 실패(중복 키 포함)는 로그만 기록하고 리다이렉트를 계속 진행한다 — 첫 로그인 직후 동시 요청 등으로 레코드가 이미 생성된 경우에도 사용자 경험을 차단하지 않는다.

**`SUPABASE_SERVICE_ROLE_KEY` 미설정 시**: 경고 로그 후 users 레코드 생성을 건너뛰고 리다이렉트한다. 이후 API 호출에서 FK 오류가 발생할 수 있으므로 반드시 설정되어야 한다.

## 6. OAuth 첫 로그인 Origin 처리 (PR #109)

Railway 환경에서 Next.js 서버는 `0.0.0.0:PORT` 또는 `[::]:PORT`로 바인딩될 수 있다. 이 경우 `request.url`의 origin이 `http://0.0.0.0:PORT`가 되어 브라우저가 해당 주소로 리다이렉트되면 실제 앱 도메인과 불일치가 발생한다.

`resolveRedirectOrigin()` 함수가 이를 처리한다:

```typescript
function resolveRedirectOrigin(requestOrigin: string): string {
  // 0.0.0.0 또는 [::] 바인딩 주소인 경우에만 NEXT_PUBLIC_APP_URL로 교체
  if (/^https?:\/\/(0\.0\.0\.0|\[::\])(?::\d+)?$/i.test(requestOrigin)) {
    return process.env.NEXT_PUBLIC_APP_URL ?? requestOrigin;
  }
  // 일반 origin(xzawed.xyz 등)은 그대로 유지 — PKCE 쿠키 도메인 불일치 방지
  return requestOrigin;
}
```

**핵심 설계 원칙**: PKCE 코드 교환 시 쿠키가 설정된 origin과 리다이렉트 origin이 일치해야 한다. 무조건 `NEXT_PUBLIC_APP_URL`로 교체하면 서브도메인 또는 다른 허용 도메인에서의 콜백이 실패할 수 있으므로, 비정상 바인딩 주소(`0.0.0.0`, `[::]`)에 대해서만 교체한다.

`safeRedirect()` 함수는 `next` 쿼리 파라미터의 경로를 허용 목록(`/dashboard`, `/builder`, `/settings`, `/projects`, `/catalog`)과 대조하여 오픈 리다이렉트를 방지한다.
