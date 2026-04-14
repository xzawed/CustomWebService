# 디버깅 가이드

## 자주 발생하는 문제와 해결 방법

### 1. 미리보기 NOT_FOUND

**증상**: 코드 생성 완료 후 미리보기에서 `NOT_FOUND` 에러
**확인 파일**: `src/app/api/v1/preview/[projectId]/route.ts`
**원인 가능성**:
- RLS 정책으로 인해 서비스 클라이언트가 아닌 사용자 클라이언트로 조회
- 프로젝트 상태 업데이트 실패 (compensating rollback 발동)
- CodeRepository에서 최신 버전 조회 실패

**디버깅 순서**:
1. Supabase 대시보드에서 해당 프로젝트 ID로 직접 조회
2. `generated_codes` 테이블에 해당 프로젝트의 레코드 존재 여부 확인
3. RLS 정책 확인 (preview는 인증된 사용자만 접근 가능)

### 2. CSP 차단

**증상**: 페이지는 로드되지만 CDN 리소스(Tailwind, Chart.js 등)가 차단됨
**확인 파일**: `middleware.ts`, `site/[slug]/route.ts`, `preview/[projectId]/route.ts`
**핵심 규칙**: CSP 헤더가 2중 적용되면 둘 다 적용됨 (더 엄격한 쪽)

### 3. 서브도메인 라우팅 실패

**증상**: `slug.xzawed.xyz`에서 404
**확인 파일**: `src/middleware.ts`
**확인 사항**:
- `NEXT_PUBLIC_ROOT_DOMAIN` 환경변수 설정
- middleware에서 Host 헤더 감지 로직
- `/site/[slug]` rewrite 경로

### 4. AI 생성 실패

**증상**: SSE 스트림에서 error 이벤트
**확인 순서**:
1. `ANTHROPIC_API_KEY` (또는 `XAI_API_KEY`) 환경변수 설정 확인
2. `AI_PROVIDER` 환경변수 확인 (기본값: `claude`)
3. API 제공자의 상태 페이지 확인
4. 레이트리밋 확인 (`MAX_DAILY_GENERATIONS`)

### 5. 레이트리밋 관련

**증상**: 429 에러 또는 생성 불가
**메커니즘**: `UPDATE WHERE count < limit RETURNING` (원자적)
**보상 트랜잭션**: 생성 실패 시 `decrementDailyLimit()` 호출

## 파이프라인 검증 체크리스트

코드 수정 후 반드시 3가지 경로를 모두 확인:

- [ ] 미리보기: `/api/v1/preview/[projectId]`
- [ ] 게시 (직접 URL): `/site/[slug]`
- [ ] 게시 (서브도메인): `slug.xzawed.xyz`
