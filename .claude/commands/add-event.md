EventBus 시스템에 새로운 도메인 이벤트를 추가하세요.

이벤트 설명: $ARGUMENTS

## 구현 절차

### 1. 이벤트 타입 정의
- `src/lib/events/` 내 이벤트 타입 파일 확인
- 새 이벤트 타입 상수 추가 (예: `PROJECT_ARCHIVED`, `USER_UPGRADED`)
- 이벤트 페이로드 TypeScript 인터페이스 정의

### 2. 이벤트 발행 (Publisher)
- 해당 Service 클래스에서 적절한 시점에 `EventBus.emit()` 호출
- 이벤트 페이로드에 필수 컨텍스트 포함:
  - `userId`, `correlationId`
  - 도메인 관련 데이터 (projectId, action 등)

### 3. 이벤트 구독 (Subscriber) — 필요시
- `EventRepository`를 통한 `platform_events` 테이블 영속화
- 추가 사이드 이펙트 리스너 구현 (알림, 통계 등)

### 4. 참고 파일
- `src/lib/events/EventBus.ts` — EventBus 구현
- `src/lib/events/EventRepository.ts` — 이벤트 영속화
- `src/services/ProjectService.ts` — 이벤트 발행 예시
- `src/types/` — 이벤트 타입 정의
