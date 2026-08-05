# 생성 락을 인메모리 tracker에서 SQLite로 분리 (2026-07-29)

> **언제 읽나**: generationLock·generation_locks 테이블, GENERATION_LOCK_HEARTBEAT_MS/STALE_MS, generate/regenerate 중복 차단, generationTracker 역할 분리를 손댈 때 — 인메모리 락 eviction 이 이중 생성·토큰 이중청구를 허용

## 상태

승인됨 — 구현 완료 ([#198](https://github.com/xzawed/CustomWebService/issues/198))

## 배경

`generationTracker`는 진행률 표시와 **중복 생성 차단**을 겸하고 있었다. 저장소는 모듈 레벨
`LRUMap(10_000)`이고 TTL은 `generating` 30분 / terminal 10분이다.

엔트리가 TTL 또는 size cap으로 사라지면 `isGenerating()`이 `false`를 돌려준다. 즉
**락의 실체가 사라지면 락이 열린다.** 결과:

1. 같은 `projectId`로 두 번째 파이프라인이 시작될 수 있다 — Opus/ET 호출이 중복되어
   **토큰이 이중 청구**되고, 두 파이프라인이 같은 `getNextVersion()`을 받아
   한쪽이 `UNIQUE(project_id, version)` 위반으로 실패한다
2. 프로세스가 재시작되면 진행 중이던 락이 통째로 사라진다

PR #196은 `complete()` 유실 시 `logger.warn`을 남겨 **관측만** 가능하게 했다. 근본 원인은
그대로였다 — 같은 구조 안에서는 고칠 수 없다. TTL을 늘리면 크래시된 파이프라인이 프로젝트를
영구히 잠그고, 없애면 메모리가 무한 증가한다.

> 검수 이력: Grok이 최초에 "`isGenerating` 체크와 `start()` 사이 TOCTOU"로 보고했으나 해당
> 구간에 `await`이 없어 **오탐으로 철회**됐다. 실제 메커니즘은 이 eviction/TTL 경로다.

## 결정

**락 책임만 DB로 분리한다.** tracker는 진행률 표시 전용으로 남긴다(이슈의 방안 A).

### 1. `generation_locks` 테이블

```sql
CREATE TABLE generation_locks (
  project_id   TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  acquired_at  TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL
);
```

**FK를 두지 않았다.** 수명이 짧은 운영 상태이고, `project_id` FK가 있으면 스테일 락이 남은
프로젝트의 삭제가 FK 위반으로 실패한다(`admin/test-generation`의 cleanup 경로가 실제로 그렇다).
무결성은 stale 만료와 release가 담당한다.

시각은 다른 테이블과 같은 ISO8601 UTC 문자열이다 — 고정 폭이라 `heartbeat_at < ?` 사전식
비교가 곧 시간 비교다.

### 2. 원자적 획득 — 단일 문 test-and-set

```sql
INSERT INTO generation_locks (project_id, user_id, acquired_at, heartbeat_at)
VALUES (?, ?, ?, ?)
ON CONFLICT(project_id) DO UPDATE SET ...
  WHERE generation_locks.heartbeat_at < ?   -- stale한 락만 탈취
RETURNING project_id
```

better-sqlite3는 동기 API이고 SQLite는 한 시점에 writer가 1개다. 단일 문이므로 조회와 획득
사이에 끼어들 틈이 없다 — `SqliteRateLimitRepository`의
`UPDATE ... WHERE count < limit RETURNING`과 **같은 검증된 패턴**이다.

획득 실패는 "0행 반환"으로 나타난다: 유효한 락이 있으면 `DO UPDATE`의 `WHERE`가 거짓이 되어
아무 행도 갱신되지 않고 `RETURNING`도 비어 있다.

### 3. heartbeat — 크래시가 프로젝트를 영구히 잠그지 않게

파이프라인이 도는 동안 `GENERATION_LOCK_HEARTBEAT_MS`(기본 30초)마다 `heartbeat_at`을 갱신한다.
프로세스가 죽으면 신호가 멈추고 `GENERATION_LOCK_STALE_MS`(기본 5분) 후 다른 요청이 탈취한다.

**진행률 갱신 지점에 얹지 않고 독립 타이머를 쓴다** — 파이프라인은 Stage 사이에 수십 초씩 AI
응답을 기다리므로 간격이 들쭉날쭉해진다. 타이머는 `.unref()`되어 종료를 막지 않는다
(backup/retention 스케줄러와 동일 원칙).

**`stale > heartbeat`는 강제한다.** 작거나 같으면 살아 있는 파이프라인이 다음 신호 전에 스스로
만료되어 중복 파이프라인이 다시 열린다. 잘못된 조합은 `heartbeat × 2`로 교정하고 경고를 남긴다 —
조용히 폴백하면 운영자가 값을 바꿨는데 적용되지 않은 이유를 알 수 없다.

### 4. 수명주기 배치

| 단계 | 위치 | 이유 |
|------|------|------|
| 획득 | 라우트 (`generate` · `regenerate` · `admin/test-generation`) | 409를 **스트림 시작 전에** 반환해야 한다 |
| heartbeat 시작·중지 | `runGenerationPipeline` | 파이프라인 수명과 정확히 일치 |
| 해제 | `runGenerationPipeline`의 `finally` | 성공·실패 무관하게 반드시 해제 |

`finally`에서 **heartbeat를 먼저 멈추고 해제한다.** 순서가 뒤집히면 방금 해제한 락에 대해
heartbeat가 한 번 더 돌아 무의미한 경고 로그가 남는다.

해제는 **던지지 않는다** — `finally`에서 예외가 나면 파이프라인의 원래 오류를 덮어버린다.
해제에 실패해도 stale 만료가 백스톱이다.

### 5. `isGenerating()` 제거

tracker에서 아예 없앴다. 남겨두면 누군가 다시 게이트로 쓴다. 자리에 이유를 적은 주석을 남기고,
`generationTracker.test.ts`가 **이 메서드가 존재하지 않음을 단언**해 회귀를 고정한다.

## 트레이드오프

**획득 실패는 fail-closed다.** DB 조회가 실패하면 던져서 500을 낸다 — 폴백해서 진행하면
중복 파이프라인을 막지 못한다. 생성을 시작하지 못하는 쪽이 토큰을 이중으로 태우는 것보다 낫다.

**라우트가 획득하고 파이프라인이 해제한다.** 수명주기가 두 모듈에 걸친다. 라우트가 락을 잡은 뒤
파이프라인 진입 전에 죽으면(스트림 생성 실패·클라이언트 조기 절단) 락이 stale까지 남는다.
기존 tracker의 30분 TTL보다 6배 짧으므로 순 개선이며, 이 창을 없애려면 SSE 스트림 구조 자체를
바꿔야 해서 비용이 이득을 넘는다.

**`retention.ts` 정리 대상에 넣지 않았다.** 행은 `project_id`로 유일하고 정상 경로에서
해제되므로 상한이 **프로젝트 수**다. 트래픽에 선형 비례하는 `platform_events`와 성격이 다르다.
(생성 도중 프로젝트가 삭제되면 행 1개가 고아로 남지만 같은 `project_id`가 다시 나오면 덮어쓴다.)

**멀티 인스턴스**로 가면 이 락은 그대로 유효하다 — 단일 writer SQLite가 공유 볼륨을 전제로
하므로 이 부분은 Redis 전환 시에도 인터페이스(`IGenerationLockRepository`)만 바꾸면 된다.

## 범위 밖

상태 폴링의 `not_found` 오보(이슈의 방안 C)는 **이미 해소되어 있었다** —
`/api/v1/generate/status/[projectId]`가 tracker 미스 시 DB의 최신 코드로 완료를 판정한다.
이번 변경은 중복 파이프라인(문제 2)만 다룬다.

## 검증

| 항목 | 결과 |
|------|------|
| `pnpm type-check` | 통과 |
| `pnpm test` | **171 파일 / 2114 테스트 통과** (기존 2073 + 신규 41) |

TDD로 작성했고 모든 신규 테스트가 구현 전에 실패하는 것을 확인했다.

신규 테스트가 고정하는 것:

- **원자적 획득** — 유효한 락이 있으면 두 번째 획득 실패(본인 재획득 포함), 프로젝트 간 독립
- **stale 경계** — 경계 직전엔 탈취 불가, 넘으면 탈취 가능하고 소유자·획득 시각이 교체됨
- **heartbeat** — 계속 보내면 stale 경계를 넘겨도 유지, 중지하면 만료, 락이 없으면 `false`,
  `acquired_at`은 갱신하지 않음(총 점유 시간 관측)
- **내구성** — 레포 인스턴스를 교체해도(프로세스 재시작 대응) 판정이 일관됨
- **오류 격리** — 해제·heartbeat가 던져도 밖으로 새지 않음(unhandledRejection 방지)
- **수명주기** — 성공·실패 양쪽에서 해제되고, heartbeat 중지가 해제보다 **먼저** 일어남
- **회귀 고정** — `generationTracker.isGenerating`이 존재하지 않음

## 관련 문서

- [검수 MEDIUM 발견 항목 수정 ADR](2026-07-29-medium-audit-findings.md) — M-5 절(관측만 추가한 이전 단계)
- [SQLite 컷오버 ADR](2026-06-23-sqlite-cutover-and-supabase-removal.md)
- [환경변수 목록](../reference/env-vars.md) — `GENERATION_LOCK_*`
