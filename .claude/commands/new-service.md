프로젝트의 기존 아키텍처 패턴을 따라 새로운 기능의 전체 스택을 생성하세요.

기능명: $ARGUMENTS

## 생성 대상 (순서대로)

### 1. TypeScript 타입 정의
- `src/types/` 에 타입 파일 생성 (또는 기존 파일에 추가)
- DB 스네이크케이스 ↔ 앱 카멜케이스 매핑 타입 포함

### 2. Repository 클래스
- `src/repositories/` 에 생성
- `BaseRepository<T>` 패턴 상속
- Supabase 클라이언트 사용, RLS 고려
- 스네이크케이스 ↔ 카멜케이스 변환 포함

### 3. Service 클래스
- `src/services/` 에 생성
- Repository 조합하여 비즈니스 로직 구현
- 입력 유효성 검증 (Zod 스키마)
- 적절한 도메인 이벤트 emit (`@/lib/events`)
- `@/lib/utils/errors`의 커스텀 에러 클래스 사용

### 4. API Route Handler
- `src/app/api/v1/{기능명}/route.ts` 에 생성
- 인증 체크 → Zod 유효성 검증 → Service 호출 패턴
- `X-Correlation-Id` 헤더 지원
- `handleApiError()` 유틸리티로 에러 응답

### 5. 테스트 파일
- Service 단위 테스트 (`*.test.ts`)
- API 통합 테스트 (`src/__tests__/` 또는 co-located)

## 참고 파일 (기존 패턴 확인용)
- `src/services/ProjectService.ts` — Service 패턴
- `src/repositories/ProjectRepository.ts` — Repository 패턴
- `src/app/api/v1/projects/route.ts` — API Route 패턴
- `src/types/index.ts` — 타입 정의 패턴
