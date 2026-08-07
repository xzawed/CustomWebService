# ADR: 공개 회원가입 + 다중 사용자 인증 전환

> **언제 읽나**: signup/verify-email/forgot-password, authorize+scrypt, auth_tokens, assertEmailVerified, Resend(EMAIL_FROM/RESEND_API_KEY), assertOwner 를 손댈 때

- **날짜:** 2026-06-24
- **상태:** 채택됨 (구현 완료)
- **현재 시제 흐름도:** [docs/architecture/auth.md](../architecture/auth.md) (설계 spec은 본 ADR에 흡수 후 삭제 — 2026-08-07)

---

## 배경

SQLite 컷오버(P8.2, 2026-06-23)로 인증 방식이 "셀프호스트 단일 관리자"로 단순화되었다. 이 방식은 env 변수 한 쌍(`ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`)과 고정 사용자 ID(`ADMIN_USER_ID`)로 단일 계정만 허용한다. 문제:

1. **다중 계정 불가**: 팀원이나 추가 사용자를 위한 가입 경로가 없다.
2. **env 자격증명 불편**: 비밀번호 변경 시 해시 재생성(`pnpm admin:hash`) + Railway env 재배포 필요.
3. **데이터 격리 미흡**: 단일 사용자이므로 소유권 검증이 있어도 계정 간 격리는 의미가 없었다.
4. **서비스 확장 불가**: AI 노코드 플랫폼으로서 다수 사용자가 자기 서비스를 관리하는 모델이 필요하다.

---

## 결정

**A안 채택**: 기존 Auth.js v5 Credentials + scrypt + 무상태 JWT 스택을 유지하고, `authorize` 함수만 env 한 쌍 비교에서 **DB 조회 + 사용자별 해시 검증**으로 교체한다.

### 구체적 변경

1. **`users` 테이블에 `password_hash` 컬럼 추가** — scrypt `"salt:hash"` (hex) 형식.
2. **`auth_tokens` 테이블 신설** — `email_verify`(24h) / `password_reset`(1h) 토큰. SHA-256 해시만 저장, 원문은 이메일 링크에만 노출. 일회성(`consumed_at`).
3. **`authorize` 교체** — `userRepo.findByEmail(email)` + `verifyPassword(password, user.password_hash)`. 성공 시 실제 `user.id` 반환(고정 `getAdminUserId()` 제거).
4. **공개 인증 API** — `POST /api/v1/auth/{signup, verify-email, resend-verification, forgot-password, reset-password}`. per-IP 레이트리밋, Zod 검증.
5. **이메일 발송** — Resend(`RESEND_API_KEY`, `EMAIL_FROM`). 미설정 시 no-op 콘솔 폴백(로컬/테스트 호환).
6. **이메일 인증 게이트** — `assertEmailVerified()` — generate/regenerate/deploy에서 `email_verified IS NULL` 시 403.
7. **소유권 격리 강화** — projectId 수용 경로 전수 `assertOwner` 적용. 공개 사이트 서빙(`/site/[slug]`)은 격리 예외.
8. **제거** — `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_USER_ID`, `ADMIN_NAME`, `seedAdminUser`, `adminCredentials.ts`, `pnpm admin:hash`, `scripts/hashAdminPassword.ts`.
9. **유지** — `ADMIN_API_KEY`(진단 엔드포인트 보호 — 사용자 인증과 별개), scrypt 유틸 재사용.

---

## 대안 고려

### A안 — (채택) Auth.js Credentials + scrypt + 무상태 JWT 유지, authorize만 DB 조회로 교체

기존 인증 스택(Auth.js v5 Credentials, scrypt 해시, JWT 무상태 세션)을 그대로 유지하면서 `authorize` 함수만 env 한 쌍(`ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`) 비교에서 `users` 테이블 DB 조회 + 사용자별 해시 검증으로 교체한다. 변경 범위를 최소화하면서 다중 계정과 공개 회원가입을 지원하는 방향이다.

### B안: Auth.js DB 어댑터 재도입 (드리즐 어댑터)

- `@auth/drizzle-adapter`를 사용해 Auth.js 기본 `users`/`accounts`/`sessions`/`verificationToken` 테이블을 복원한다.
- **기각 이유**: 컷오버로 막 제거한 DB 어댑터를 재도입하면 세션·계정 테이블 관리 복잡성이 다시 증가한다. JWT 무상태 방식의 단순성을 포기하게 된다. 토큰·이메일 흐름을 어댑터에 의존하면 커스텀 제어가 어렵다.

### C안: 외부 관리형 인증 (Clerk, Auth0, Supabase Auth)

- 외부 SaaS 인증 서비스를 도입해 회원가입·이메일 인증·소셜 로그인을 위임한다.
- **기각 이유**: 비용최소 원칙 위반(월 $0 → $25+). 셀프호스트 원칙에 배치. 외부 SaaS 의존성 추가는 Supabase 제거와 역방향이다.

---

## 결과 / 영향

### 긍정적

- 누구나 공개 회원가입으로 플랫폼을 사용할 수 있다.
- env 관리 단순화 — `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH` 제거, 비밀번호 변경은 `/forgot-password`로 자기서비스화.
- 계정별 완전 데이터 격리(프로젝트·생성 코드·API 키) — 소유권 검증이 실제 의미를 갖게 됨.
- 이메일 인증 게이트로 스팸 생성 남용 억제.
- Resend no-op 폴백으로 이메일 없이 로컬/테스트 환경 동작 가능.

### 알려진 한계

- **비밀번호 재설정 후 세션**: 무상태 JWT라 기존 세션 즉시 무효화 불가. V1은 reset 토큰 일회성 처리만 하고 타 세션 강제 로그아웃 미지원.
- **인메모리 per-IP 레이트리밋**: 서버 재시작 시 초기화. 단일 인스턴스 전제 — 멀티 인스턴스 전환 시 Redis 등 외부 저장소 필요.
- **인증 신선도 비용**: `assertEmailVerified`가 매 생성 요청마다 DB 1회 read. 고빈도 아닌 생성 연산에서 무방.
- **이메일 enumeration — 의도된 비대칭**: `forgot-password`는 존재 여부와 무관하게 **항상 generic 200**(노출 방지)이지만, `signup` 중복은 **명시적 409**("이미 가입된 이메일")를 반환한다. 가입 UX를 우선하고 signup 쪽 enumeration 위험은 낮다고 판단한 트레이드오프다. **"일관성"을 이유로 둘을 같은 정책으로 통일하지 말 것** — 한쪽만 보고 고치면 의도가 사라진다.

### 프로덕션 초기화 절차

기존 단일 관리자 시드 데이터가 있는 프로덕션 DB는 1회성 클린 리셋 필요. 당시 절차(역사): [docs/archive/guides/sqlite-cutover-runbook.md §6](../archive/guides/sqlite-cutover-runbook.md).

---

## 파일 목록 (신규/수정/제거)

**신규:**
- `src/app/api/v1/auth/signup/route.ts`, `verify-email/route.ts`, `resend-verification/route.ts`, `forgot-password/route.ts`, `reset-password/route.ts`
- `src/app/(auth)/signup/page.tsx`, `verify-email/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx`
- `src/lib/email/emailService.ts` (+ Resend provider)
- `src/lib/auth/tokens.ts` (auth_tokens 발급/검증/소비)
- `src/lib/auth/password.ts` (hashPassword/verifyPassword)
- `src/lib/auth/verifiedGuard.ts` (assertEmailVerified)
- `src/lib/auth/rateLimit.ts` (per-IP 인증 스로틀)
- `src/services/authService.ts` (signup/verify/reset 비즈니스 로직)
- `src/repositories/sqlite/SqliteAuthTokenRepository.ts`

**수정:**
- `src/lib/db/sqlite/schema.ts` — `password_hash` 컬럼, `auth_tokens` 테이블
- `src/lib/db/sqlite/bootstrap.ts` — `seedAdminUser` 호출 제거
- `src/lib/auth/local-auth-config.ts` — `authorize` DB 조회로 교체
- generate/regenerate/deploy/preview/status/삭제 라우트 — `assertOwner` + `assertEmailVerified`

**제거:**
- `src/lib/db/sqlite/seedAdmin.ts`
- `src/lib/auth/adminCredentials.ts` (env 비교 로직. scrypt 유틸은 `password.ts`로 이동)
- `scripts/hashAdminPassword.ts`
