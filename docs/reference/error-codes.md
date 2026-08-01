# 에러 코드 레퍼런스

> **경로:** `src/lib/utils/errors.ts`

---

## 커스텀 에러 클래스

| 클래스 | 에러 코드 | HTTP Status | 기본 메시지 | 사용 상황 |
|--------|----------|-------------|------------|----------|
| `AppError` | 커스텀 | 500 (기본) | - | 모든 커스텀 에러의 베이스 클래스 |
| `NotFoundError` | `NOT_FOUND` | 404 | `{resource}({id})을(를) 찾을 수 없습니다.` | 리소스 조회 실패 시 |
| `ValidationError` | `INVALID_INPUT` | 400 | 커스텀 메시지 | 입력값 유효성 검증 실패 시 |
| `AuthRequiredError` | `AUTH_REQUIRED` | 401 | `로그인이 필요합니다.` | 인증되지 않은 요청 시 |
| `ForbiddenError` | `FORBIDDEN` | 403 | `접근 권한이 없습니다.` | 권한 없는 리소스 접근 시 |
| `RateLimitError` | `RATE_LIMITED` | 429 | `요청 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.` | 일일 생성 한도 초과 시 |
| `ConflictError` | `CONFLICT` | 409 | `이미 존재하는 리소스입니다.` | 이메일 중복 가입 등 리소스 충돌 시 |
| `EmailNotVerifiedError` | `EMAIL_NOT_VERIFIED` | 403 | `이메일 인증이 필요합니다. 받은 편지함을 확인해주세요.` | 미인증 사용자의 생성·게시 등 차단 시 |
| `GenerationError` | `GENERATION_FAILED` | 500 | `코드 생성에 실패했습니다.` | AI 코드 생성 파이프라인 실패 시 |

> `DeployError` / `DEPLOY_FAILED` 는 외부 배포 스택 제거(2026-08-01)로 삭제됨. [ADR](../decisions/2026-08-01-remove-external-deploy-stack.md)

### handleApiError()가 처리하는 추가 케이스

| 오류 유형 | 에러 코드 | HTTP Status | 설명 |
|----------|----------|-------------|------|
| `ZodError` | `INVALID_INPUT` | 400 | Zod 스키마 검증 실패 |
| `code`+`message` plain object (Error 인스턴스 아님) | `DATABASE_ERROR` | 500 | 일반 DB/드라이버 오류 형태 — `code`·`message` 필드를 가진 plain object 분기 (Supabase 전용 아님) |
| 미처리 `Error` / 기타 | `INTERNAL_ERROR` | 500 | 프로덕션에서는 내부 상세 정보 노출 안 함 |

### Admin API 전용 에러 코드 (직접 반환, `handleApiError` 미경유)

| 에러 코드 | HTTP Status | 발생 위치 | 설명 |
|----------|-------------|----------|------|
| `QC_DISABLED` | 400 | `trigger-qc` | `ENABLE_RENDERING_QC` 환경변수 미설정 |
| `NOT_FOUND` | 404 | `trigger-qc` | 해당 프로젝트의 생성된 코드 없음 |
| `UPSTREAM_ERROR` | 502 | `proxy` | 외부 API 서버 연결 실패 또는 타임아웃 |
| `FORBIDDEN` | 403 | `proxy` | SSRF 방지 — 허용되지 않은 대상 호스트 |

---

## Route Handler 에러 처리 패턴

```typescript
import { RateLimitError, NotFoundError, ValidationError, ForbiddenError } from '@/lib/utils/errors';

try {
  // service call
} catch (error) {
  if (error instanceof RateLimitError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 429 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 403 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 404 });
  }
  if (error instanceof ValidationError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
  logger.error('Unexpected error', { error });
  return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다' }, { status: 500 });
}
```

> **권장 패턴:** Route Handler에서 직접 catch하는 대신 `handleApiError(error)`를 사용하면 모든 에러 유형을 표준 형식으로 일괄 처리할 수 있습니다.

```typescript
import { handleApiError } from '@/lib/utils/errors';

export async function POST(request: Request): Promise<Response> {
  try {
    // ...
  } catch (error) {
    return handleApiError(error);
  }
}
```

---

## 표준 응답 형식

```typescript
// 성공
{ "success": true, "data": T }

// 실패 (handleApiError() 표준 형식 — error는 객체)
{ "success": false, "error": { "code": "ERROR_CODE", "message": "..." } }
```

> **참고:** `handleApiError()`(`src/lib/utils/errors.ts`)는 모든 에러를 위 객체 형식(`error.code` + `error.message`)으로 반환합니다. 위 "Route Handler 에러 처리 패턴"의 수동 `catch` 예시는 `error: error.message`(문자열)를 사용하는 레거시 패턴이므로, 신규 라우트는 `handleApiError(error)` 사용을 권장합니다. `jsonResponse()` 유틸리티는 항상 `Content-Type: application/json; charset=utf-8` 헤더를 포함합니다.
