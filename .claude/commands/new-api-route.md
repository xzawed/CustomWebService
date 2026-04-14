프로젝트의 기존 패턴을 따라 새로운 API v1 라우트를 생성하세요:

- 라우트 핸들러: `src/app/api/v1/$ARGUMENTS/route.ts`
- 기존 라우트(`src/app/api/v1/projects/route.ts` 등)를 참고하여 동일한 패턴 적용
- 인증 + 유효성 검증 → Service 호출 패턴 준수
- `X-Correlation-Id` 헤더 지원
- `@/lib/utils/errors`의 커스텀 에러 클래스로 에러 처리
- 필요시 레이트리밋 적용
