# 인증/인가 아키텍처

> **최종 업데이트:** 2026-06-24 (공개 회원가입 + 다중 사용자 인증 도입)
> **인증:** Auth.js v5 (NextAuth) — Credentials + JWT 무상태 세션. 공개 셀프서비스 회원가입, 이메일 인증 게이트, DB 사용자별 scrypt 검증.

> 과거의 Supabase Auth / OAuth(Google·GitHub) / Auth.js OAuth(`authjs`) 경로는 [SQLite 컷오버 ADR](../decisions/2026-06-23-sqlite-cutover-and-supabase-removal.md)로 제거됨. 과거의 env 단일 관리자(`ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`) 방식은 [다중 사용자 인증 ADR](../decisions/2026-06-24-public-signup-multi-user-auth.md)로 전환됨. 본 문서는 현행 `local` 스택만 기술한다.

---

## 1. 회원가입 흐름

```
[/signup] 이메일/비밀번호 폼
    │
    ▼ POST /api/v1/auth/signup
[Route Handler] Zod 검증 → per-IP 레이트리밋
    │
    ▼ AuthService.signup(email, password)
    ├── 이메일 중복 확인 → 409 Conflict
    ├── scrypt hashPassword → users 행 삽입 (email_verified=null)
    ├── email_verify 토큰 발급 (SHA-256 해시 → auth_tokens)
    └── emailService.sendVerificationEmail(to, link) → Resend / no-op fallback
    │
    ▼ 201 Created + "메일 확인" 안내
[사용자] 미인증 상태로 즉시 로그인 가능 (생성·배포는 차단)
```

---

## 2. 로그인 흐름 (Credentials + JWT)

```
[/login] 이메일/비밀번호 폼 (Credentials)
    │
    ▼ signIn('credentials', { email, password, redirect: false })   (next-auth/react)
[/api/auth/[...nextauth]] → local-auth-config.handlers
    │
    ▼ authorize(): userRepo.findByEmail(email) → verifyPassword(password, user.password_hash)
    │   - DB 사용자 조회 + scrypt 검증 (사용자별 해시)
    │   - 일치 시 { id: user.id, email, name } 반환 (실제 users.id)
    ▼ JWT 발급 → 쿠키(JWE) 설정 (무상태, DB 어댑터 없음)
    │   - token.sub = user.id
    │
    ▼ window.location.assign(redirect ?? '/dashboard')
[Middleware] enforceAuthGate() → 보호 경로에서 local-auth-edge auth()로 JWT 검증
```

- **다중 사용자**: 비밀번호는 `scrypt` 해시(`"salt:hash"` hex 형식)로 `users.password_hash` 컬럼에 저장. 회원가입 시 자동 생성.
- **무상태 JWT**: Auth.js v5 기본(어댑터 없음). 세션 DB 테이블 없음. 비밀번호 재설정 후 기존 세션 즉시 무효화 불가(알려진 한계).
- **OAuth 콜백 없음**: `(auth)/callback` 라우트는 제거됨.

---

## 3. 이메일 인증 흐름

```
[이메일] 인증 링크 /verify-email?token=<랜덤32바이트base64url>
    │
    ▼ POST /api/v1/auth/verify-email { token }
[Route Handler] token SHA-256 해시 → auth_tokens 조회
    ├── type=email_verify, consumed_at IS NULL, 미만료(24h) 확인
    ├── users.email_verified = now()
    └── auth_tokens.consumed_at = now() (일회성 소비)
    │
    ▼ 성공 → 대시보드 리다이렉트
```

재발송: `POST /api/v1/auth/resend-verification` (인증된 세션 + per-IP·per-user 레이트리밋)

---

## 4. 비밀번호 재설정 흐름

```
[/forgot-password] 이메일 입력
    │
    ▼ POST /api/v1/auth/forgot-password { email }
    ├── 사용자 존재 시 password_reset 토큰 발급 → emailService.sendPasswordResetEmail
    └── 항상 generic 200 (이메일 존재 여부 노출 방지)

[이메일] 재설정 링크 /reset-password?token=<랜덤32바이트base64url>
    │
    ▼ POST /api/v1/auth/reset-password { token, newPassword }
    ├── 토큰 검증(type=password_reset, 미소비, 미만료 1h)
    ├── Zod 비번 검증 (≥8자)
    ├── scrypt 재해시 → users.password_hash 교체
    └── 토큰 consumed_at + 동일 user의 미소비 reset 토큰 일괄 무효화
```

---

## 5. 이메일 인증 게이트 (생성·재생성·배포 차단)

```typescript
// src/lib/auth/verifiedGuard.ts
export async function assertEmailVerified(user: AuthUser): Promise<void> {
  const dbUser = await userRepo.findById(user.id);
  if (!dbUser?.email_verified) throw new ForbiddenError('EMAIL_NOT_VERIFIED');
}
```

- **generate / regenerate / deploy** 라우트에서 세션 인증 후 `assertEmailVerified` 추가 호출
- 미인증 시 → **403 "이메일 인증이 필요합니다"** (i18n)
- **신선도**: JWT에 인증 여부를 캐시하지 않고 **생성 시점 DB 조회** — JWT 무상태 한계 우회
- UI: 대시보드에 인증 배너 + 재발송 버튼 노출

---

## 6. Edge-safe 분할 설정

미들웨어는 Edge 런타임에서 실행되므로 `node:crypto`(scrypt) 의존을 끌어오면 안 된다. 설정을 3파일로 분할한다:

| 파일 | 런타임 | 역할 |
|------|--------|------|
| `lib/auth/local-auth-base.ts` | 공유(edge-safe) | JWT/세션 콜백·세션 전략 (node:crypto 미의존) |
| `lib/auth/local-auth-config.ts` | Node | base + Credentials `authorize`(DB 조회 + scrypt). 라우트 핸들러·`getLocalAuthUser`가 동적 import |
| `lib/auth/local-auth-edge.ts` | Edge | base + stub Credentials provider(authorize 없음). 미들웨어 JWT 검증용 |

> **동적 import**: `getAuthUser`(서버)와 미들웨어는 config를 정적 import하지 않고 동적 import해, Node 전용 그래프가 정적 Edge 번들로 유입되지 않게 한다.

---

## 7. Provider 추상화 (단일 스택)

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
| `AUTH_TRUST_HOST` | ✅(프록시 뒤) | `true` — 커스텀 도메인에서 `/api/auth/*` 500 방지 |
| `NEXT_PUBLIC_AUTH_PROVIDER` | 빌드타임 | `local` (클라이언트 인라인. 단일 스택이라 사실상 상수) |
| `RESEND_API_KEY` | 선택 | Resend 이메일 API 키. 미설정 시 no-op 콘솔 폴백(이메일 미발송) |
| `EMAIL_FROM` | 선택 | 발신자 주소 (예: `noreply@xzawed.xyz`). `RESEND_API_KEY` 설정 시 필수 |

> **제거된 변수**: `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_USER_ID`, `ADMIN_NAME` — 다중 사용자 전환으로 env 단일 관리자 경로 완전 제거.
> **유지**: `ADMIN_API_KEY`(진단 엔드포인트 `/api/v1/admin/*` 보호용 — 사용자 인증과 무관).
> 
> 부팅 시 `seedAdminUser`는 **제거됨**. 신규 환경은 `/signup`으로 첫 사용자를 생성한다.

---

## 8. 클라이언트 세션 (useAuth / SessionProvider)

- `app/layout.tsx`는 **항상 `<SessionProvider>`(next-auth/react)를 마운트**한다.
- `hooks/useAuth.ts`는 `useSession()`으로 세션을 읽어 `useAuthStore`에 동기화하고 `signOut`을 제공한다.
  - 컴포넌트(예: `Header`)는 `useAuthStore`에서 `user`/`isAuthenticated`를 읽고, `useAuth()`에서 `signOut`을 받는다.
  - `signOut()` → next-auth `signOut({ callbackUrl: '/' })` + 스토어 초기화.

---

## 9. 서버사이드 인증 (API Routes)

```typescript
import { getAuthUser } from '@/lib/auth/index';

const user = await getAuthUser();
if (!user) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
```

직접 세션 API 호출 금지 — `getAuthUser()`만 사용(테스트 모킹·일관성).

---

## 10. 권한 검증 (소유권 + 이메일 인증)

```typescript
import { assertOwner } from '@/lib/auth/authorize';
assertOwner(project, user.id);   // 불일치 시 ForbiddenError (403)
```

```typescript
import { assertEmailVerified } from '@/lib/auth/verifiedGuard';
await assertEmailVerified(user);  // email_verified=null 시 ForbiddenError (403 EMAIL_NOT_VERIFIED)
```

**파일:** `src/lib/auth/authorize.ts`, `src/lib/auth/verifiedGuard.ts`

SQLite에는 Row Level Security가 없다. **앱 레벨 소유권 검증이 격리의 보안 경계**다.
- `findById(projectId)` 단순 조회는 소유자를 가리지 않으므로, projectId를 받아 동작하는 모든 경로에 `assertOwner` 적용 필수.
- 공개 사이트 서빙(`/site/[slug]`)·공개 프리뷰는 `assertOwner` 적용 대상 외(게시물 열람은 공개).

---

## 11. 미들웨어 게이팅

`src/middleware.ts`의 `enforceAuthGate(request)`:

- 보호 경로(`/builder`·`/dashboard`·`/preview`)에서만 동작.
- `local-auth-edge`의 `auth()`로 JWT 세션 확인 → 미인증 시 `/login?redirect=<path>`로 307.
- 동적 import로 Edge 안전성 유지.

---

## 12. 인증 라우트 목록

| 경로 | 메서드 | 설명 |
|------|--------|------|
| `/api/v1/auth/signup` | POST | 이메일+비밀번호 회원가입 |
| `/api/v1/auth/verify-email` | POST | 이메일 인증 토큰 소비 |
| `/api/v1/auth/resend-verification` | POST | 인증 메일 재발송 (인증 필요) |
| `/api/v1/auth/forgot-password` | POST | 비밀번호 재설정 이메일 발송 |
| `/api/v1/auth/reset-password` | POST | 비밀번호 재설정 토큰 소비 |

Auth.js 기본 경로: `/api/auth/[...nextauth]` (로그인·로그아웃·세션 조회)
