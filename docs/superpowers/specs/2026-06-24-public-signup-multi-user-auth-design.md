<!-- DOC_STATUS: HISTORICAL | completed: 2026-06-24 | superseded_by: docs/architecture/auth.md -->
# 공개 회원가입 + 다중 사용자 인증 설계

- **작성일**: 2026-06-24
- **상태**: 설계 승인됨 (구현 계획 대기)
- **배경**: SQLite 컷오버(P8.2)로 인증이 "셀프호스트 단일 관리자"(env `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH` 한 쌍 비교)로 축소됨. 다중 계정 로그인/회원가입이 불가능. 본 설계는 이를 **공개 셀프서비스 회원가입 + 계정별 완전 데이터 격리** 모델로 전환한다.
- **관련 ADR(예정)**: `docs/decisions/2026-06-24-public-signup-multi-user-auth.md`

---

## 1. 목표와 결정 사항

사용자 확정 요구사항:

1. **공개 셀프서비스 회원가입** — 누구나 이메일+비밀번호로 가입·로그인
2. **계정별 완전 데이터 격리** — 각 사용자는 자기 프로젝트·게시 사이트만 관리
3. **이메일 인증 + 비밀번호 재설정** — 외부 이메일 제공자(Resend) 도입
4. **관리자 개념 제거 — 완전 평등** — env `ADMIN_*` 인증 경로 제거, 모든 사용자는 평등한 DB 계정
5. **기존 프로덕션 데이터 깨끗하게 초기화** — 마이그레이션 없이 리셋
6. **미인증 사용자**: 로그인·둘러보기는 가능, **생성/재생성/배포는 차단**(인증 후 해제)

### 비목표 (YAGNI)

- 조직/팀/멀티테넌시(이미 제거됨), 역할(role)/권한 등급, 관리자 대시보드
- OAuth/소셜 로그인, 매직링크
- 재설정 후 타 세션 강제 로그아웃(무상태 JWT 한계 — §6 참조)

### 채택 접근법 (A안)

기존 **Auth.js v5 Credentials + scrypt + 무상태 JWT** 스택을 유지하고, `authorize`만 env 한 쌍 비교에서 **DB 조회 + 사용자별 hash 검증**으로 교체한다. DB 어댑터 재도입(B안)이나 외부 관리형 인증(C안)은 셀프호스트·비용최소 원칙에 배치되어 기각.

---

## 2. 데이터 모델

### 2.1 `users` 테이블 — 컬럼 1개 추가

`src/lib/db/sqlite/schema.ts`의 `users`에 추가:

- `password_hash TEXT` — scrypt `"salt:hash"`(hex) 형식. 기존 `hashPassword`/`verifyPassword`(`src/lib/auth/adminCredentials.ts`) 재사용. nullable(향후 확장 대비)이나 Credentials 계정은 필수.

기존 컬럼 재사용:
- `email TEXT NOT NULL UNIQUE` — 로그인 식별자 (이미 UNIQUE)
- `email_verified TEXT` — **이미 존재**. 인증 완료 시각(ISO) 저장, `null`이면 미인증

### 2.2 `auth_tokens` 테이블 신설

이메일 인증과 비밀번호 재설정 토큰을 단일 테이블로 공용 관리:

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | text PK (uuid) | |
| `user_id` | text NOT NULL → `users.id` | FK |
| `token_hash` | text NOT NULL | 토큰 원문의 SHA-256 해시 (**원문 미저장**) |
| `type` | text NOT NULL | `'email_verify'` \| `'password_reset'` |
| `expires_at` | text NOT NULL | 만료 ISO8601 |
| `consumed_at` | text NULL | 일회성 사용 표시(null=미사용) |
| `created_at` | text | 생성 시각 |

- 인덱스: `token_hash` (조회 키)
- 토큰 발급: 랜덤 32바이트 → base64url 인코딩이 **원문**(이메일 링크에만 노출), DB엔 SHA-256 해시 저장
- 만료: `email_verify` 24시간 / `password_reset` 1시간
- 일회성: 사용 시 `consumed_at` 기록

### 2.3 마이그레이션

- drizzle 스키마에 `password_hash` 컬럼 + `auth_tokens` 테이블 추가 → migrator가 기동 시 반영
- 기존 `verificationToken`/`account`/`session` 테이블은 부재(JWT 전략 유지) — 재도입하지 않음

---

## 3. 인증 흐름

레이어: Route Handler(`/api/v1/auth/*`) → Service → Repository → SQLite. 모든 라우트 Zod 검증.

### 3.1 회원가입 — `POST /api/v1/auth/signup`

1. Zod 검증: 유효한 이메일, 비밀번호 ≥ 8자
2. per-IP 레이트리밋
3. 이메일 중복 확인 → 중복 시 `409 Conflict`("이미 가입된 이메일")
4. scrypt 해시 → `users` 삽입(`email_verified=null`, `password_hash=…`)
5. `email_verify` 토큰 발급(해시 저장) → 인증 메일 발송(링크 `/verify-email?token=…`)
6. 응답: 성공 + "메일 확인" 안내. 가입 직후 **미인증 상태로 로그인 가능**

### 3.2 로그인 — Auth.js Credentials `authorize` 교체

`src/lib/auth/local-auth-config.ts`의 `authorize`:

1. `userRepo.findByEmail(email)` → 없으면 `null`
2. `verifyPassword(password, user.password_hash)` → 불일치 `null`
3. 일치 시 `{ id: user.id, email, name }` 반환 — **실제 `user.id`** (고정 `getAdminUserId()` 제거)
4. JWT `token.sub = user.id` → `session.user.id` (base/edge 설정 무변경)

미인증 여부는 로그인을 막지 않음(§4.2에서 생성 시점 체크).

### 3.3 이메일 인증 — `/verify-email` 페이지 + `POST /api/v1/auth/verify-email`

1. 토큰 SHA-256 해시 → `auth_tokens` 조회(`type=email_verify`, `consumed_at IS NULL`, 미만료)
2. 유효 시 `users.email_verified=now` + 토큰 `consumed_at=now`
3. 대시보드로 리다이렉트(성공 메시지)
4. 재발송: `POST /api/v1/auth/resend-verification`(authed, per-IP·per-user 레이트리밋)

### 3.4 비밀번호 재설정

- `POST /api/v1/auth/forgot-password` `{email}`:
  - 사용자 존재 시 `password_reset` 토큰 발급·메일(`/reset-password?token=…`)
  - **항상 generic 200** 응답(이메일 존재 여부 노출 방지)
- `POST /api/v1/auth/reset-password` `{token, newPassword}`:
  - 토큰 검증(type=password_reset, 미소비, 미만료) → Zod 비번 검증
  - `password_hash` 교체 → 토큰 `consumed_at` + **동일 user의 다른 미소비 reset 토큰 무효화**

---

## 4. 데이터 격리 & 인증 게이트

### 4.1 데이터 격리 (계정별 완전 격리)

**자동으로 따라오는 부분** — 세션이 실제 `user.id`를 담으므로:
- `projectService.getProjects()` → `findByUserId(user.id)` (이미 그렇게 구현됨)
- `user-api-keys` 라우트·설정 페이지 → `findAllByUser(user.id)` (이미 격리)
- `user_daily_limits` → user별 카운터 (이미 격리)

**보강 필요 — 소유권 검증**: `findById(projectId)`는 소유자를 가리지 않으므로, **projectId를 받아 동작하는 모든 경로**에 `assertOwner(project, user.id)`(`src/lib/auth/authorize.ts`) 추가:
- 프로젝트 상세/편집 조회
- `generate/regenerate`, `deploy`, 삭제, `preview/[projectId]`, `generate/status/[projectId]`
- 편집기용 생성 코드 조회

타 사용자 리소스 접근 시 `ForbiddenError`(403). SQLite엔 RLS가 없으므로 **이 앱 레벨 검증이 격리의 보안 경계**다. 구현 시 projectId 수용 경로를 전수 나열·검증한다(배포 품질 원칙: cross-cutting 영향 추적).

**공개 사이트 서빙은 공개 유지**: `/site/[slug]`(게시된 서브도메인)와 공개 프리뷰는 **누구나 열람** — 격리는 "관리/편집"에만 적용, "게시물 열람"엔 미적용(노코드 플랫폼 정상 동작).

### 4.2 인증 게이트 (미인증 = 생성·배포 차단)

`generate` / `regenerate` / `deploy` 라우트 가드:

1. 세션 `user.id`로 현재 사용자 DB 조회
2. `email_verified === null` 이면 → **403 "이메일 인증이 필요합니다"**(i18n)
3. 인증됨이면 통과

> **신선도**: 인증 여부는 JWT에 캐시하지 않고 **생성 시점 DB 조회**로 확인. JWT는 무상태라 인증 완료 후 재로그인 전까지 갱신되지 않기 때문. 생성은 고빈도가 아니어서 DB 1회 read 비용 무방.

UI: 미인증 사용자 대시보드에 **인증 배너 + 재발송 버튼** 노출.

---

## 5. 이메일 발송

`src/lib/email/` — provider 뒤에 인터페이스를 두어 교체·테스트 용이:

- `emailService.ts` — `sendVerificationEmail(to, link)`, `sendPasswordResetEmail(to, link)`
- **provider: Resend** (`resend` npm, 무료 티어 3k/월). env: `RESEND_API_KEY`, `EMAIL_FROM`(예: `noreply@xzawed.xyz`)
- **dev/test transport**: `RESEND_API_KEY` 미설정 시 콘솔 로그 no-op transport 폴백 → 로컬이 이메일 없이 동작. 테스트는 MSW로 Resend 엔드포인트 모킹
- 메일 본문: 간단한 HTML 템플릿(인증/재설정 링크 + 만료 안내), i18n 한국어
- **사용자 작업(런북 명시)**: 도메인 발신을 위해 Resend에 `xzawed.xyz` 도메인 인증(SPF/DKIM) 필요. 미설정 시 Resend 테스트 발신자로 임시 동작

---

## 6. 보안 / 남용 방지

- **토큰**: 랜덤 32바이트(base64url) · DB엔 SHA-256 해시만 · 일회성(`consumed_at`) · 만료(verify 24h/reset 1h)
- **비밀번호**: scrypt(기존 `adminCredentials.ts` 유틸) · Zod 최소 8자
- **레이트리밋**(기존 인메모리 Map 패턴, 단일 인스턴스 전제 — `generationTracker`와 동일 제약): `signup` · `forgot-password` · `resend-verification` → **per-IP** 스로틀
- **생성 비용 게이트**: 미인증 차단 + 기존 per-user 일일 생성 한도(`MAX_DAILY_GENERATIONS`)가 자동 적용 → 인증 후에도 무제한 생성 불가
- **이메일 enumeration**:
  - `forgot-password`는 generic 200(노출 방지)
  - `signup` 중복은 명시적 409("이미 가입된 이메일") — 가입 UX 우선, enumeration 위험 낮음으로 판단 (트레이드오프 명시)
- **재설정 후 세션**: 무상태 JWT라 기존 세션 즉시 무효화 불가 → V1은 reset 토큰 일회성 처리만 하고 **"타 세션 강제 로그아웃 미지원"을 알려진 한계로 문서화**

---

## 7. 제거 & 정리

**제거**:
- `verifyAdminCredentials`의 env 한 쌍 비교 로직 → DB 조회로 교체
- `seedAdminUser`(관리자 1행 시드, `src/lib/db/sqlite/seedAdmin.ts`) 제거 + bootstrap 호출 제거
- 인증 경로의 `getAdminUserId()` 고정 id 제거(실제 `user.id` 사용)
- env `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` / `ADMIN_USER_ID` 제거
- `pnpm admin:hash`(`scripts/hashAdminPassword.ts`) 제거 또는 회원가입용 유틸로 재배치

**유지**:
- `hashPassword`/`verifyPassword`/scrypt 유틸 → 회원가입·재설정에서 재사용(파일 위치는 `src/lib/auth/`로 정리 가능)
- `ADMIN_API_KEY`(진단 엔드포인트 qc-stats·keys-verify·trigger-qc 보호용 — 사용자 인증과 무관, 그대로 유지)

**프로덕션 초기화**(깨끗한 리셋) — 자동 아님, **백업 게이트가 있는 1회성 운영 절차**(런북 기재):
1. 현재 `/data/app.db` 백업
2. `users` / `projects` / `project_apis` / `generated_codes` / `user_api_keys` / `user_daily_limits` / `platform_events` 비우기 (`api_catalog`·`feature_flags`는 보존)
3. 신규 DB는 빈 상태로 시작 → **첫 회원가입이 첫 사용자**

> ⚠️ 게시된 사이트(`slug.xzawed.xyz`)가 다운됨 — 배포 전 사용자 최종 확인 후 실행.

---

## 8. 테스트 전략

- **단위**: 토큰 발급/검증/만료/일회성, `emailService`(모킹), signup·verify·reset·login 서비스, `assertOwner` 가드, 미인증 게이트
- **통합**: signup→verify→login→generate 전체 흐름 · 미인증 생성 차단(403) · 비번 재설정 · **격리(사용자 A가 B 프로젝트 접근 시 403)** · 이메일 중복(409)
- **컴포넌트**: signup/forgot/reset 페이지 (MSW Resend 핸들러 추가 — `src/test/mocks/handlers.ts`, `onUnhandledRequest:'error'` 대응)
- **E2E**: 회원가입 + 로그인 플로우

---

## 9. 에러 처리

기존 커스텀 에러 클래스(`@/lib/utils/errors`) 재사용:

- `ValidationError`(400) — Zod 검증 실패
- `ForbiddenError`(403) — 소유권 위반 / 미인증 생성 시도
- `NotFoundError`(404)
- `ConflictError`(409) — 이메일 중복 (없으면 추가)
- 토큰 무효/만료 → 명확한 사용자 메시지(i18n)

모든 인증 라우트는 `/api/v1/*` 패턴 + Zod 검증 → Service → Repository 레이어 준수.

---

## 10. 영향받는 파일 (개략)

**신규**:
- `src/app/api/v1/auth/signup/route.ts`, `verify-email/route.ts`, `resend-verification/route.ts`, `forgot-password/route.ts`, `reset-password/route.ts`
- `src/app/(auth)/signup/page.tsx`, `verify-email/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx`
- `src/lib/email/emailService.ts` (+ provider)
- `src/lib/auth/tokens.ts` (토큰 발급/검증)
- `src/services/authService.ts` (signup/verify/reset 비즈니스 로직)
- `src/repositories/sqlite/SqliteAuthTokenRepository.ts` + 인터페이스 + factory 배선

**수정**:
- `src/lib/db/sqlite/schema.ts` (`password_hash`, `auth_tokens`)
- `src/lib/auth/local-auth-config.ts` (`authorize` DB 조회)
- `src/lib/auth/adminCredentials.ts` (env 비교 제거, scrypt 유틸 유지/정리)
- `src/lib/db/sqlite/bootstrap.ts` (`seedAdminUser` 호출 제거)
- `src/app/(auth)/login/page.tsx` (회원가입·비번찾기 링크 추가)
- generate/regenerate/deploy/preview/status/삭제 라우트 (`assertOwner` + 인증 게이트)
- 대시보드 (미인증 배너)
- `src/test/mocks/handlers.ts` (Resend 핸들러)

**제거**:
- `src/lib/db/sqlite/seedAdmin.ts`, `scripts/hashAdminPassword.ts`(또는 재배치)

**문서**: `CLAUDE.md`, `docs/architecture/auth.md`·`overview.md`·`database.md`, `docs/reference/env-vars.md`, 신규 ADR, 컷오버 런북 갱신
</content>
</invoke>
