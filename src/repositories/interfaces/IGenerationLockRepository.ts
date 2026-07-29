export interface GenerationLock {
  projectId: string;
  userId: string;
  /** ISO8601 UTC — 최초 획득 시각. heartbeat로 갱신되지 않는다(총 점유 시간 관측용). */
  acquiredAt: string;
  /** ISO8601 UTC — 마지막 생존 신호. stale 판정 기준. */
  heartbeatAt: string;
}

/**
 * 프로젝트별 생성 락. 같은 projectId로 파이프라인이 동시에 두 번 도는 것을 막는다.
 *
 * 인메모리 tracker가 락을 겸하던 구조에서는 TTL·size cap으로 엔트리가 사라지면 락도 함께
 * 사라졌다. 저장소를 DB로 옮겨 프로세스 재시작·엔트리 소멸을 넘어 유지되게 한다.
 *
 * `staleMs`를 정책으로 내장하지 않고 인자로 받는다 — `IRateLimitRepository`가 `limit`을
 * 인자로 받는 것과 같은 이유로, 정책은 호출부(config)에 두고 레포는 저장만 담당한다.
 */
export interface IGenerationLockRepository {
  /**
   * 원자적으로 락을 획득한다. 유효한 락이 이미 있으면 false.
   * 마지막 heartbeat가 `staleMs`를 넘긴 락은 탈취할 수 있다 — 크래시된 파이프라인이
   * 프로젝트를 영구히 잠그지 않게 하는 안전장치다.
   */
  acquire(projectId: string, userId: string, staleMs: number): Promise<boolean>;

  /** 생존 신호. 락이 없으면 false(유실을 성공으로 위장하지 않는다). */
  heartbeat(projectId: string): Promise<boolean>;

  /** 해제. 없는 락에도 안전하다(finally 경로에서 호출되므로 멱등해야 한다). */
  release(projectId: string): Promise<void>;

  /** 유효한(stale이 아닌) 락 보유 여부. */
  isHeld(projectId: string, staleMs: number): Promise<boolean>;

  /** 진단용 조회 — stale 락도 그대로 반환한다. */
  find(projectId: string): Promise<GenerationLock | null>;
}
