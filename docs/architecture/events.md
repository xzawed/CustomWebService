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
    }
  | {
      type: 'STAGE2_FALLBACK_USED';
      payload: { projectId: string; error: string };
    }
  | {
      type: 'STAGE3_FALLBACK_USED';
      payload: { projectId: string; error: string };
    }
  | {
      type: 'STAGE_SKIPPED';
      payload: { projectId: string; stage: 'stage2' | 'stage3'; reason: string };
    }
  | {
      type: 'QUALITY_LOOP_COMPLETED';
      payload: {
        projectId: string;
        iterations: number;
        improved: boolean;
        finalStructuralScore: number;
        finalMobileScore: number;
      };
    };

export type DomainEventType = DomainEvent['type'];
```

---

## EventBus 클래스

```typescript
// src/lib/events/eventBus.ts

type EventHandler = (event: DomainEvent) => void | Promise<void>;

class EventBus {
  private handlers: EventHandler[] = [];

  // 구독 등록 — 반환값(unsubscribe 함수)으로 구독 해제
  on(handler: EventHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter(h => h !== handler);
    };
  }

  // 모든 등록된 핸들러에 이벤트 발행 (fire-and-forget, 에러 격리)
  emit(event: DomainEvent): void {
    for (const handler of this.handlers) {
      Promise.resolve(handler(event)).catch((err) => {
        logger.warn('EventBus handler error', { type: event.type, error: err });
      });
    }
  }
}

export const eventBus = new EventBus();
```

**특징:**
- 모든 핸들러가 모든 이벤트를 수신 (이벤트 타입 필터링 없음 — 핸들러 내부에서 `event.type` 분기)
- 핸들러 실행 중 예외가 발생해도 나머지 핸들러는 계속 실행됨 (Promise + catch 에러 격리)
- `on()` 반환값(unsubscribe 함수)으로 메모리 누수 없이 구독 취소 가능

> **주의:** 이전 문서에 기술된 `on(type, handler)` 타입별 구독, `off()`, `onAll()` 메서드는 현재 구현에 존재하지 않습니다. 이벤트 타입 필터링은 핸들러 내부에서 직접 처리해야 합니다.

---

## 활용 예시

```typescript
// 분석 이벤트 구독 (핵심 로직 수정 없이 추가)
// 핸들러 내부에서 event.type으로 분기
const unsubscribe = eventBus.on((event) => {
  if (event.type === 'CODE_GENERATED') {
    analytics.track('code_generated', event.payload);
  }
});

// 알림 구독
eventBus.on((event) => {
  if (event.type === 'DEPLOYMENT_FAILED') {
    notificationService.send(event.payload.projectId, '배포에 실패했습니다.');
  }
});

// 모니터링 구독
eventBus.on((event) => {
  if (event.type === 'API_QUOTA_WARNING') {
    logger.warn('API quota warning', event.payload);
  }
});

// 구독 해제
unsubscribe(); // on() 반환값을 호출하면 구독 취소
```

---

## EventRepository (감사 로그)

모든 도메인 이벤트는 `platform_events` 테이블에 비동기 영속화됨.  
**파일:** `src/repositories/eventRepository.ts`

**현재 표준 패턴:** `eventPersister`(`src/lib/events/eventPersister.ts`)가 `eventBus`를 구독하여 모든 `DomainEvent`를 자동으로 `platform_events`에 기록합니다. 서버 시작 시 `registerEventPersister()`를 1회 호출하면 이후 모든 `eventBus.emit()` 호출이 자동으로 DB에 기록됩니다.

**레거시 패턴 (직접 호출 — 현재 사용하지 않음):**
```typescript
// ⚠️ 레거시 — eventPersister 도입 이전 방식. 현재는 사용하지 않음.
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

---

## 정확도 가시화 이벤트 (2026-04-30 ADR)

생성 파이프라인의 정확도 게이트 효율성을 시계열로 측정하기 위해 추가된 이벤트:

| 이벤트 | 발행처 | 용도 |
|--------|--------|------|
| `STAGE2_FALLBACK_USED` | `generationPipeline.ts` Stage 2 catch | Stage 2 기능 검증 실패 시 Stage 1 결과로 폴백한 빈도 추적 |
| `STAGE3_FALLBACK_USED` | `generationPipeline.ts` Stage 3 catch | Stage 3 디자인 폴리시 실패 시 Stage 2 결과로 폴백한 빈도 추적 |
| `STAGE_SKIPPED` | `generationPipeline.ts` Stage 2/3 skip 분기 | Stage 2/3 진입 없이 통과된 비율(파이프라인 효율성) — `payload.stage`로 'stage2'/'stage3' 구분 |
| `QUALITY_LOOP_COMPLETED` | `qualityLoop.ts` 종료 직후 (loop 미진입 포함, `iterations=0`으로도 발행) | Quality Loop 평균 반복 횟수, 개선 성공률, 최종 점수 분포 |

이 이벤트들은 `eventPersister`가 `platform_events` 테이블에 자동 영속화하며,
Admin QC Stats API(`/api/v1/admin/qc-stats`)가 이를 집계해 운영 지표로 노출합니다.
