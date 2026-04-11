# CustomWebService — 플랫폼 기술명세서 v1.0

> **작성일**: 2026-03-28
> **상태**: 승인됨
> **대상**: 개발자, 운영자

---

## 목차

1. [개요 및 비전](#1-개요-및-비전)
2. [현재 아키텍처 평가](#2-현재-아키텍처-평가)
3. [Phase 1: 핵심 안정성 개선](#3-phase-1-핵심-안정성-개선)
4. [Phase 2: 플랫폼 기반 구축](#4-phase-2-플랫폼-기반-구축)
5. [Phase 3: 대규모 확장](#5-phase-3-대규모-확장)
6. [데이터베이스 스키마 변경사항](#6-데이터베이스-스키마-변경사항)
7. [테스트 전략](#7-테스트-전략)
8. [운영 절차](#8-운영-절차)

---

## 1. 개요 및 비전

### 1.1 서비스 설명

CustomWebService는 사용자가 무료 API를 선택하고 자연어로 서비스를 설명하면 AI가 웹서비스를 자동 생성·배포하는 플랫폼입니다.

### 1.2 최종 목표

단일 페이지 생성 도구에서 **멀티 페이지 웹 플랫폼**으로 확장:

```
현재                          목표
─────────────────────         ──────────────────────────────
단순 생성 도구              → 완전한 웹 플랫폼
1명 사용자 관점             → 팀/조직 지원
단일 생성 흐름              → Marketplace + 템플릿 생태계
기본 보안                   → 프로덕션 수준 보안
로컬 이벤트버스             → 영속적 감사 로그
레이스 컨디션 있는 RateLimit → 원자적 RateLimit
```

### 1.3 플랫폼 로드맵 (예정 페이지)

```
app/
├── (public)/
│   ├── /                    ← 랜딩 (현재)
│   ├── /catalog             ← API 카탈로그 (현재)
│   ├── /explore             ← 공개 서비스 탐색 (신규)
│   └── /showcase/[slug]     ← 서비스 공개 소개 (신규)
│
├── (auth)/
│   └── /login               ← 로그인 (현재)
│
├── (main)/
│   ├── /builder             ← 빌더 (현재)
│   ├── /dashboard           ← 프로젝트 목록 (현재)
│   ├── /dashboard/[id]      ← 프로젝트 상세 (현재)
│   ├── /settings/api-keys   ← API 키 관리 (현재)
│   ├── /templates           ← 시작점 템플릿 (신규)
│   ├── /analytics/[id]      ← 서비스 통계 (신규)
│   └── /team                ← 팀/조직 관리 (신규)
│
└── (admin)/
    └── /admin               ← 플랫폼 관리자 (신규)
```

---

## 2. 현재 아키텍처 평가

### 2.1 강점 (유지)

| 항목 | 상태 | 비고 |
|------|------|------|
| 레이어드 아키텍처 | ✅ 양호 | Service → Repository → DB 분리 명확 |
| TypeScript strict | ✅ 양호 | noEmit 통과, any 미사용 |
| 커스텀 에러 계층 | ✅ 양호 | AppError 파생 6개 클래스 |
| AI 추상화 | ✅ 양호 | IAiProvider 인터페이스, 교체 가능 |
| 배포 추상화 | ✅ 양호 | IDeployProvider 인터페이스 |
| SSE 스트리밍 | ✅ 양호 | 장기 작업에 적합 |
| 보안 헤더 | ✅ 양호 | CSP, HSTS, SSRF 방지 |

### 2.2 개선 필요 사항 (우선순위 순)

| # | 문제 | 심각도 | Phase |
|---|------|--------|-------|
| 1 | 레이트리밋 경쟁 조건 | 🔴 Critical | 1 |
| 2 | 인메모리 이벤트버스 (서버 재시작 시 유실) | 🔴 Critical | 1 |
| 3 | 코드 버전 무제한 누적 | 🟡 Medium | 1 |
| 4 | 요청 추적 (Correlation ID) 없음 | 🟡 Medium | 1 |
| 5 | 외부 서비스 장애 대응 없음 | 🟡 Medium | 2 |
| 6 | RBAC 미활성 (타입만 정의됨) | 🟡 Medium | 2 |
| 7 | E2E 테스트 없음 | 🟢 Low | 2 |
| 8 | Redis 캐시 없음 (10만+ 사용자) | 🟢 Low | 3 |

---

## 3. Phase 1: 핵심 안정성 개선

> **기간**: 2026-03-28
> **목표**: 프로덕션 수준의 안정성 확보

### 3.1 원자적 레이트리밋 (Atomic Rate Limiting)

#### 문제

```typescript
// 현재: 두 요청이 동시에 COUNT 조회 → 둘 다 limit 미만으로 판단 → 둘 다 통과
const count = await repo.countTodayGenerations(userId); // SELECT COUNT(*)
if (count >= limit) throw RateLimitError;               // 각자 10회 미만
// ... 이후 두 요청 모두 DB 저장 → limit 초과
```

#### 해결책: PostgreSQL Atomic Test-and-Set

```sql
-- user_daily_limits 테이블 + try_increment_daily_generation() 함수
-- UPDATE WHERE count < limit RETURNING count
-- 행이 반환되지 않으면 = 한도 초과
```

#### 새로운 흐름

```
POST /api/v1/generate
  1. checkAndIncrementDailyLimit() → 원자적 증가 or RateLimitError
  2. SSE 스트림 시작
  3. AI 코드 생성
  4. 성공 → 완료
  5. 실패 → decrementDailyLimit() 보상 트랜잭션
```

#### 변경 파일

- `supabase/migrations/007_atomic_rate_limit.sql` (신규)
- `src/services/rateLimitService.ts` (수정)
- `src/repositories/projectRepository.ts` (수정)
- `src/app/api/v1/generate/route.ts` (수정)
- `src/app/api/v1/generate/regenerate/route.ts` (수정)

### 3.2 이벤트 영속성 (Persistent Events)

#### 문제

```typescript
// 현재: 인메모리만. 서버 재시작 시 모든 이벤트 유실.
// 감사 로그, 통계, 알림에 사용 불가.
eventBus.emit({ type: 'CODE_GENERATED', payload: {...} });
```

#### 해결책: DB 병렬 영속화 (Fire-and-Forget)

```typescript
// 기존 인메모리 핸들러 유지 + DB 비동기 저장 추가
// 메인 흐름을 차단하지 않음 (await 없음)
eventBus.emit(event);
eventRepo.persist(event, context).catch(err => logger.error(...));
```

#### platform_events 테이블 구조

```sql
id UUID, type TEXT, payload JSONB,
user_id UUID, project_id UUID, created_at TIMESTAMPTZ
```

#### 변경 파일

- `supabase/migrations/008_platform_events.sql` (신규)
- `src/repositories/eventRepository.ts` (신규)
- `src/services/generationService.ts` (수정)
- `src/services/projectService.ts` (수정)

### 3.3 코드 버전 관리 정책

#### 문제

```typescript
// 현재: 버전 상한 없음 → 프로젝트당 수백 버전 가능 → storage 비대화
async getNextVersion(projectId: string): Promise<number>
```

#### 해결책: 최대 10버전 유지, 초과 시 가장 오래된 것 자동 삭제

```typescript
// features.ts에 maxCodeVersionsPerProject: 10 추가
// 신규 버전 저장 후 pruneOldVersions() 호출
```

#### 변경 파일

- `src/lib/config/features.ts` (수정 — `maxCodeVersionsPerProject` 필드 추가)
- `src/repositories/codeRepository.ts` (수정 — `countByProject()`, `pruneOldVersions()` 추가)
- `src/app/api/v1/generate/route.ts` (수정 — 저장 후 prune 호출)
- `src/app/api/v1/generate/regenerate/route.ts` (수정 — 저장 후 prune 호출)

### 3.4 요청 추적 (Correlation ID)

#### 목적

- 요청 단위 로그 추적 (분산 디버깅 가능)
- 에러 발생 시 해당 요청의 전체 로그 조회 가능
- 클라이언트에 X-Correlation-Id 반환 → 사용자 문의 시 추적

#### 구현

```
요청 인입 (middleware)
  → X-Correlation-Id 헤더 생성 (UUID v4)
  → 요청 헤더로 전달

API Route
  → 헤더에서 correlationId 읽기
  → logger.info(msg, { correlationId, ... })

응답
  → X-Correlation-Id 헤더 포함
```

#### 변경 파일

- `src/lib/utils/correlationId.ts` (신규 — `getCorrelationId()`, `setCorrelationId()`)
- `src/middleware.ts` (수정 — 모든 응답에 X-Correlation-Id 헤더 주입)
- `src/lib/utils/logger.ts` (수정 — `correlationId` 필드 지원, `withCorrelationId()` 팩토리)

---

## 4. Phase 2: 플랫폼 기반 구축

> **기간**: 추후 스프린트
> **목표**: 팀 기능 및 신뢰성 강화

### 4.1 외부 서비스 Circuit Breaker

```typescript
// AI Provider, Deploy Provider에 retry + 지수 백오프 적용
// 3회 재시도: 2s → 4s → 8s 대기
// 모든 재시도 실패 시 명확한 에러 메시지
```

### 4.2 RBAC 활성화

```typescript
// 현재: project.userId === user.id 단순 비교
// 목표: permission('project:write', user, project) 함수 기반
// Organization → Member → Role(owner/editor/viewer) 계층 활성화
```

### 4.3 Marketplace 기반

```sql
-- projects 테이블에 is_public BOOLEAN 컬럼 추가
-- project_likes 테이블 추가 (좋아요)
-- project_forks 테이블 추가 (포크)
```

---

## 5. Phase 3: 대규모 확장

> **조건**: MAU 10만 이상 도달 시

### 5.1 Redis 캐시 레이어

- 인기 API 카탈로그 (TTL: 1시간)
- 레이트리밋 카운터 (Redis Sorted Set)
- 세션 캐시

### 5.2 분산 레이트리밋

- Redis `INCR` + `EXPIRE` 슬라이딩 윈도우
- 인스턴스 간 공유 상태

### 5.3 백그라운드 작업 큐

- BullMQ (Redis 기반) 또는 Supabase pg_background
- 코드 생성을 HTTP 연결에서 분리

---

## 6. 데이터베이스 스키마 변경사항

### 6.1 신규 테이블: user_daily_limits

```sql
CREATE TABLE user_daily_limits (
  user_id     UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_date  DATE    NOT NULL DEFAULT CURRENT_DATE,
  generation_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);
```

**용도**: 원자적 레이트리밋 카운터
**인덱스**: `(usage_date)` — 오래된 행 정리용
**마이그레이션**: `007_atomic_rate_limit.sql`

### 6.2 신규 테이블: platform_events

```sql
CREATE TABLE platform_events (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type       TEXT        NOT NULL,
  payload    JSONB       NOT NULL DEFAULT '{}',
  user_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  project_id UUID        REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**용도**: 도메인 이벤트 감사 로그
**인덱스**: `(user_id, created_at)`, `(project_id, created_at)`, `(type, created_at)`
**마이그레이션**: `008_platform_events.sql`

### 6.3 신규 DB 함수

| 함수 | 반환 | 설명 |
|------|------|------|
| `try_increment_daily_generation(user_id, limit)` | BOOLEAN | 원자적 증가, 한도 초과 시 false |
| `decrement_daily_generation(user_id)` | void | 실패 시 보상 감소 |

---

## 7. 테스트 전략

### 7.1 테스트 피라미드

```
           E2E (Playwright) — Phase 2 추가 예정
          /   핵심 사용자 플로우 5개
         /
        통합 테스트 (Vitest + Supabase mock)
       /    API Route 전체 흐름
      /     레이트리밋 경계값 테스트
     /
    단위 테스트 (Vitest + vi.mock)
   /    Service, Repository, Utility 각 메서드
  /     Happy path + Error path 모두
```

### 7.2 Phase 1 테스트 현황 (완료)

| 파일 | 테스트 수 | 상태 |
|------|-----------|------|
| `rateLimitService.test.ts` | 9 | ✅ 통과 |
| `codeRepository.test.ts` | 9 | ✅ 통과 |
| `eventRepository.test.ts` | 8 | ✅ 통과 |
| `correlationId.test.ts` | 7 | ✅ 통과 |
| `generate.test.ts` (통합) | 8 | ✅ 통과 |
| 기존 테스트 합계 | 95 | ✅ 전체 통과 |
| **전체** | **136** | ✅ **전체 통과** |

### 7.3 테스트 커버리지 목표

| 계층 | 목표 |
|------|------|
| Services | 80% |
| Repositories | 70% |
| Utils/Lib | 90% |
| API Routes | 60% |

---

## 8. 운영 절차

### 8.1 마이그레이션 실행 순서

```bash
# Supabase 대시보드 또는 CLI로 순서대로 실행
# 1. 원자적 레이트리밋
supabase db push  # 또는 대시보드 SQL 에디터에서 실행

# 파일 순서:
# 007_atomic_rate_limit.sql
# 008_platform_events.sql
```

> ⚠️ **주의**: 007은 기존 `count_today_generations()` 함수와 병존합니다.
> 기존 함수는 제거하지 않음 (하위 호환 유지).

### 8.2 배포 전 체크리스트

- [x] `npx tsc --noEmit` 통과 (2026-03-28)
- [x] `npm test` 전체 통과 — 15 파일, 136 테스트 (2026-03-28)
- [ ] 마이그레이션 파일 Supabase에 적용 완료
- [ ] Railway 환경변수 확인 (추가 사항 없음)
- [ ] 헬스체크 엔드포인트 정상 응답

### 8.3 롤백 계획

```sql
-- 007 롤백
DROP TABLE IF EXISTS user_daily_limits;
DROP FUNCTION IF EXISTS try_increment_daily_generation;
DROP FUNCTION IF EXISTS decrement_daily_generation;

-- 008 롤백
DROP TABLE IF EXISTS platform_events;
```

> 코드 롤백은 이전 Git 커밋으로 revert.
> `count_today_generations()` 함수는 유지되므로 기존 `RateLimitService` 코드도 정상 동작.

---

*문서 버전 이력*

| 버전 | 날짜 | 변경 내용 |
|------|------|-----------|
| 1.0 | 2026-03-28 | 최초 작성 (Phase 1 명세 포함) |
| 1.1 | 2026-03-28 | Phase 1 구현 완료: 원자적 RateLimit, 이벤트 영속성, 버전 정책, Correlation ID, 단위/통합 테스트 136개, TypeScript 통과 |
