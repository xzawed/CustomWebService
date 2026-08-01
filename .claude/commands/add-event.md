> **체크리스트 only.** 스택·불변조건 진실원은 루트 `CLAUDE.md` + `docs/architecture/system-spec.md` (+ 이벤트 상세 `docs/architecture/events.md`). 이 파일에 아키텍처를 다시 쓰지 말 것.

EventBus에 새 도메인 이벤트를 추가한다.

이벤트 설명: $ARGUMENTS

## 체크리스트

### 1. 타입 정의
- [ ] `src/types/events.ts`의 `DomainEvent` 유니온에 `type` + `payload` 추가
- [ ] **삭제 이벤트 payload 키 규칙** (system-spec / 타입 주석):  
  - `PROJECT_DELETED` → `deletedProjectId` (**`projectId`/`userId` 금지** — `persist`가 `payload.userId`를 `user_id` FK로 쓰면 삭제 직후 FK 위반으로 감사 로그 유실)  
  - `USER_DELETED` → `deletedUserId` (동일 함정)
- [ ] 그 외 이벤트는 기존 패턴대로 `userId` / `projectId` 등 컨텍스트 포함

### 2. 발행
- [ ] Service(또는 해당 레이어)에서 `eventBus.emit({ type, payload })` 호출  
  - 구현: `src/lib/events/eventBus.ts` (싱글톤 `eventBus`)
- [ ] 실패해도 비즈니스 트랜잭션을 깨지 않는지 확인 (핸들러 에러는 EventBus가 격리)

### 3. 영속화
- [ ] `registerEventPersister()`가 부팅에 등록돼 있으면 **전체 이벤트**가 자동 DB 기록된다 (`src/lib/events/eventPersister.ts` → `IEventRepository` / SqliteEventRepository)
- [ ] 별도 사이드 이펙트(알림·통계)가 필요하면 `eventBus.on(...)` 구독 추가 — 모듈 레벨 `registered` 플래그는 테스트 시 `vi.resetModules()` 격리

### 4. 검증
- [ ] 관련 단위 테스트 (emit payload 키, persister FK 안전)
- [ ] `pnpm test` (또는 해당 파일 스코프) 통과

### 참고 경로 (존재 확인 후 열 것)
- `src/types/events.ts`
- `src/lib/events/eventBus.ts`
- `src/lib/events/eventPersister.ts`
- `src/repositories/sqlite/SqliteEventRepository.ts`
- 발행 예시: `src/services/` 하위 기존 `eventBus.emit` 호출
