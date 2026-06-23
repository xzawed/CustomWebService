# 인증/인가 아키텍처

> **최종 업데이트:** 2026-06-23 (SQLite 컷오버 + Supabase/OAuth 제거)
> **인증:** Auth.js v5 (NextAuth) — Credentials 단일 관리자 + JWT 무상태 세션. 셀프호스트 단일 사용자.

> 과거의 Supabase Auth / OAuth(Google·GitHub) / Auth.js OAuth(`authjs`) 경로는 [SQLite 컷오버 ADR](../decisions/2026-06-23-sqlite-cutover-and-supabase-removal.md)로 제거됨. 본 문서는 현행 `local` 스택만 기술한다.

---

## 1. 로그인 흐름 (Credentials + JWT)

```
[/login] 이메일/비밀번호 폼 (Credentials)
    │
    ▼ signIn('credentials', { email, password, redirect: false })   (next-auth/react)
[/api/auth/[...nextauth]] → local-auth-config.handlers
    │
    ▼ authorize(): verifyAdminCredentials(email, password)          (scrypt, timing-safe)
    │   - ADMIN_EMAIL / ADMIN_PASSWORD_HASH (env) 와 대조
    │   - 일치 시 단일 관리자 사용자({ id: ADMIN_USER_ID, email, name }) 반환
    ▼ JWT 발급 → 쿠키(JWE) 설정 (무상태, DB 어댑터 없음)
    │
    ▼ window.location.assign(redirect ?? '/dashboard')
[Middleware] enforceAuthGate() → 보호 경로에서 local-auth-edge auth()로 JWT 검증
```

- **단일 관리자**: 비밀번호는 `scrypt` 해시(`ADMIN_PASSWORD_HASH`)로 보관. `pnpm admin:hash '<비번>'`로 생성.
- **무상태 JWT**: Auth.js v5 기본(어댑터 없음). 세션 DB 테이블 없음 → 즉시 무효화 불가, 짧은 TTL/재로그인으로 완화(단일 사용자라 위험 낮음).
- **OAuth 콜백 없음**: `(auth)/callback` 라우트는 제거됨. Credentials는 콜백 왕복이 없다.

---

## 2. Edge-safe 분할 설정

미들웨어는 Edge 런타임에서 실행되므로 `node:crypto`(scrypt) 의존을 끌어오면 안 된다. 설정을 3파일로 분할한다:

| 파일 | 런타임 | 역할 |
|------|--------|------|
| `lib/auth/local-auth-base.ts` | 공유(edge-safe) | JWT/세션 콜백·세션 전략 (node:crypto 미의존) |
| `lib/auth/local-auth-config.ts` | Node | base + Credentials `authorize`(scrypt). 라우트 핸들러·`getLocalAuthUser`가 동적 import |
| `lib/auth/local-auth-edge.ts` | Edge | base + stub Credentials provider(authorize 없음). 미들웨어 JWT 검증용 |

> **동적 import**: `getAuthUser`(서버)와 미들웨어는 config를 정적 import하지 않고 동적 import해, Node 전용 그래프가 정적 Edge 번들로 유입되지 않게 한다.

---

## 3. Provider 추상화 (단일 스택)

```
Route Handler / Server Component
    │
    └── getAuthUser()                 ← lib/auth/index.ts
            └── getLocalAuthUser()    ← lib/auth/local-auth.ts (동적 import, auth() → AuthUser)
```

```typescript
// src/lib/auth/index.ts
export async function getAuthUser(): Promise<AuthUser | null> {
  const { getLocalAuthUser } = await import('@/lib/auth/local-auth');
  return getLocalAuthUser();
}
```

```typescript
// src/lib/auth/types.ts
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}
```

`getAuthProvider()`(`lib/config/providers.ts`)는 항상 `'local'`을 반환하며 `AUTH_SECRET`이 없으면 throw한다.

### 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `AUTH_SECRET` | ✅ | Auth.js JWT 세션 서명 키 |
| `AUTH_TRUST_HOST` | ✅(프록시 뒤) | `true` — 커스텀 도메인에서 `/api/auth/*` 500 방지(NextAuth v5 `UntrustedHost`) |
| `ADMIN_EMAIL` | ✅ | 단일 관리자 로그인 이메일 |
| `ADMIN_PASSWORD_HASH` | ✅ | `pnpm admin:hash`로 생성한 scrypt 해시 |
| `ADMIN_NAME` | 선택 | 관리자 표시 이름 |
| `ADMIN_USER_ID` | 선택 | 단일 관리자 `users.id` 고정값(기본 `00000000-0000-0000-0000-000000000001`). 시드 행과 일치해야 FK 동작 |
| `NEXT_PUBLIC_AUTH_PROVIDER` | 빌드타임 | `local` (클라이언트 인라인. 단일 스택이라 사실상 상수) |

> 부팅 시 `seedAdmin`(`bootstrapSqlite`)이 `users` 테이블에 단일 관리자 행을 멱등 시드한다 — `projects.user_id → users.id` FK 정합성 보장.

---

## 4. 클라이언트 세션 (useAuth / SessionProvider)

- `app/layout.tsx`는 **항상 `<SessionProvider>`(next-auth/react)를 마운트**한다.
- `hooks/useAuth.ts`는 `useSession()`으로 세션을 읽어 `useAuthStore`에 동기화하고 `signOut`을 제공한다.
  - 컴포넌트(예: `Header`)는 `useAuthStore`에서 `user`/`isAuthenticated`를 읽고, `useAuth()`에서 `signOut`을 받는다.
  - `signOut()` → next-auth `signOut({ callbackUrl: '/' })` + 스토어 초기화.

---

## 5. 서버사이드 인증 (API Routes)

```typescript
import { getAuthUser } from '@/lib/auth/index';

const user = await getAuthUser();
if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
```

직접 세션 API 호출 금지 — `getAuthUser()`만 사용(테스트 모킹·일관성).

---

## 6. 권한 검증 (소유권)

```typescript
import { assertOwner } from '@/lib/auth/authorize';
assertOwner(project, user.id);   // 불일치 시 ForbiddenError
```

**파일:** `src/lib/auth/authorize.ts`. 단일 사용자·셀프호스트이므로 실제 교차 사용자 격리 부담은 낮지만, 애플리케이션 레벨 소유권 경계로 유지한다(빈 문자열/undefined도 불일치 처리). DB 레벨 RLS는 없다(SQLite).

---

## 7. 미들웨어 게이팅

`src/middleware.ts`의 `enforceAuthGate(request)`:

- 보호 경로(`/builder`·`/dashboard`·`/preview`)에서만 동작.
- `local-auth-edge`의 `auth()`로 JWT 세션 확인 → 미인증 시 `/login?redirect=<path>`로 307.
- 동적 import로 Edge 안전성 유지. Supabase 세션 갱신(`updateSession`) 분기는 제거됨.
