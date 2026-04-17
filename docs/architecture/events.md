# 이벤트 시스템

> **파일:** `src/lib/events/eventBus.ts`  
> **패턴:** EventBus (발행/구독) + EventRepository (감사 로그 영속화)

---

## 도메인 이벤트 타입

`DomainEvent` 타입은 **`src/types/events.ts`** 에 정의되어 있으며, `eventBus.ts`가 `@/types/events`에서 임포트합니다.

```typescript
// src/types/events.ts

export type DomainEvent =
  | { type: 'USER_SIGNED_UP'; payload: { userId: string } }
  | {
      type: 'PROJECT_CREATED';
      payload: { projectId: string; userId: string; apiCount: number };
    }
  | {
      type: 'CODE_GENERATED';
      payload: {
        projectId: string;
        version: number;
        provider: string;
        durationMs: number;
      };
    }
  | {
      type: 'CODE_GENERATION_FAILED';
      payload: { projectId: string; error: string; provider: string };
    }
  | {
      type: 'DEPLOYMENT_STARTED';
      payload: { projectId: string; platform: string };
    }
  | {
      type: 'DEPLOYMENT_COMPLETED';
      payload: { projectId: string; url: string; platform: string };
    }
  | {
      type: 'DEPLOYMENT_FAILED';
      payload: { projectId: string; error: string };
    }
  | { type: 'PROJECT_DELETED'; payload: { projectId: string } }
  | {
      type: 'PROJECT_PUBLISHED';
      payload: { projectId: string; userId: string; slug: string };
    }
  | { type: 'PROJECT_UNPUBLISHED'; payload: { projectId: string; userId: string } }
  | {
      type: 'API_QUOTA_WARNING';
      payload: { service: string; usage: number; limit: number };
    }
  | {
      type: 'QC_REPORT_COMPLETED';
      payload: {
        projectId: string;
        overallScore: number;
        passed: boolean;
        checks: Array<{ name: string; passed: boolean; score: number }>;
        isDeep: boolean;
      };
    }
  | {
      type: 'QC_REPORT_FAILED';
      payload: { projectId: string; stage: 'fast' | 'deep'; error: string };
    };

export type DomainEventType = DomainEvent['type'];
```

---

## EventBus 클래스

```typescript
// src/lib/events/eventBus.ts

class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  emit(event: DomainEvent): void { ... }
  on<T extends DomainEventType>(
    type: T,
    handler: EventHandler<Extract<DomainEvent, { type: T }>>
  ): () => void { ... }   // 구독 해제 함수 반환
  onAll(handler: EventHandler): () => void { ... }  // 와일드카드 구독
  off(type: DomainEventType | '*', handler: EventHandler): void { ... }
}

export const eventBus = new EventBus();
```

**특징:**
- 핸들러 실행 중 예외가 발생해도 나머지 핸들러는 계속 실행됨 (격리된 try/catch)
- `on()` 반환값(구독 해제 함수)으로 메모리 누수 없이 구독 취소 가능
- `onAll()` 로 모든 이벤트를 와일드카드 구독 가능

---

## 활용 예시

```typescript
// 분석 이벤트 구독 (핵심 로직 수정 없이 추가)
eventBus.on('CODE_GENERATED', (event) => {
  analytics.track('code_generated', event.payload);
});

// 알림 구독
eventBus.on('DEPLOYMENT_FAILED', (event) => {
  notificationService.send(event.payload.projectId, '배포에 실패했습니다.');
});

// 모니터링 구독
eventBus.on('API_QUOTA_WARNING', (event) => {
  logger.warn('API quota warning', event.payload);
});

// 구독 해제
const unsubscribe = eventBus.on('CODE_GENERATED', handler);
unsubscribe(); // 구독 취소
```

---

## EventRepository (감사 로그)

모든 도메인 이벤트는 `event_log` 테이블에 비동기 영속화됨.  
**파일:** `src/repositories/eventRepository.ts`  
**사용 예시:**
```typescript
const eventRepo = createEventRepository();
eventRepo.persistAsync(event); // 실패해도 메인 흐름 차단 안 함
```

---

## 서비스 레이어에서 이벤트 발행 예시

```typescript
// GenerationService 내부 (코드 생성 완료 후)
eventBus.emit({
  type: 'CODE_GENERATED',
  payload: {
    projectId,
    version,
    provider: aiProvider.name,
    durationMs,
  },
});
```

이벤트는 핵심 비즈니스 로직(저장, 상태 변경)이 완료된 후 발행하여,
구독자(분석, 알림, 모니터링)가 메인 흐름에 영향을 주지 않도록 합니다.
