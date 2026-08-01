> **체크리스트 only.** 스택·라우트 규약 진실원은 루트 `CLAUDE.md` + `docs/architecture/system-spec.md` (+ API 목록 `docs/reference/api-endpoints.md`). 이 파일에 아키텍처를 다시 쓰지 말 것.

기존 패턴으로 API v1 라우트를 추가한다.

경로 인자: $ARGUMENTS → `src/app/api/v1/$ARGUMENTS/route.ts`

## 체크리스트

- [ ] 핸들러 위치: `src/app/api/v1/<path>/route.ts` (App Router)
- [ ] 흐름: 인증(`getAuthUser`) → (필요 시) `assertEmailVerified` / `assertOwner` → Zod 입력 검증 → Service 호출 → `jsonResponse` / 커스텀 에러
- [ ] 에러: `@/lib/utils/errors` (`AppError` 계층) — 스택 트레이스·내부 메시지 미노출
- [ ] `X-Correlation-Id` 지원 (기존 라우트·미들웨어 패턴)
- [ ] 레이트리밋이 필요하면 기존 생성/추천/프록시/auth 패턴 중 **맞는 것** 재사용 (새 Map을 임의 추가하지 말 것)
- [ ] 이메일 게이트가 필요한 쓰기·AI 경로는 `assertEmailVerified(user.id)` (`verifiedGuard.ts`)
- [ ] 테스트: `src/__tests__/api/` 권장 + 필요 시 `vitest.config.ts` `coverage.include`에 라우트 경로 추가
- [ ] 문서: 공개 계약이면 `docs/reference/api-endpoints.md` 동시 갱신

참고 라우트: `src/app/api/v1/projects/route.ts`, `src/app/api/v1/generate/route.ts`, `src/app/api/v1/suggest-apis/route.ts`
