import { LRUMap } from '@/lib/utils/lruMap';
import { logger } from '@/lib/utils/logger';

const TTL_GENERATING_MS = 30 * 60 * 1000; // 30분 — 생성 중 상태는 더 오래 유지
const TTL_TERMINAL_MS = 10 * 60 * 1000;  // 10분 — completed/failed
const CLEANUP_INTERVAL_MS = 60 * 1000; // 60초
const MAX_TRACKER_ENTRIES = 10_000; // size cap — TTL 외 안전망 (Railway 단일 인스턴스 메모리 보호)

export interface TrackerEntry {
  userId: string;
  status: 'generating' | 'completed' | 'failed';
  progress: number; // 0-100
  step: string; // e.g. 'stage1_generating'
  message: string; // 한국어 진행 메시지
  startedAt: number; // Date.now()
  updatedAt: number; // Date.now()
  result?: {
    projectId: string;
    version: number;
    previewUrl: string;
    qcResult?: unknown;
  };
  error?: string;
}

class GenerationTracker {
  private readonly entries = new LRUMap<string, TrackerEntry>(MAX_TRACKER_ENTRIES);
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, CLEANUP_INTERVAL_MS);
  }

  start(projectId: string, userId: string): void {
    const now = Date.now();
    this.entries.set(projectId, {
      userId,
      status: 'generating',
      progress: 0,
      step: 'initializing',
      message: '생성 준비 중...',
      startedAt: now,
      updatedAt: now,
    });
  }

  updateProgress(
    projectId: string,
    progress: number,
    step: string,
    message: string,
  ): void {
    const entry = this.entries.get(projectId);
    if (!entry) return;

    entry.progress = progress;
    entry.step = step;
    entry.message = message;
    entry.updatedAt = Date.now();
  }

  complete(projectId: string, result: TrackerEntry['result']): void {
    const entry = this.entries.get(projectId);
    if (!entry) {
      // 엔트리가 TTL(생성 중 30분) 또는 size cap으로 사라진 뒤 완료된 경우.
      // 상태 폴링이 이 프로젝트를 not_found로 보고하게 되므로(코드는 저장됐는데도)
      // 조용히 넘기지 않고 남긴다. 근본 해결은 외부 저장소 기반 durable lock이며
      // 단일 인스턴스 인메모리 구조에서는 관측만 가능하다.
      logger.warn('Generation completed but tracker entry was already gone', { projectId });
      return;
    }

    entry.status = 'completed';
    entry.progress = 100;
    entry.step = 'completed';
    entry.message = '생성이 완료되었습니다.';
    entry.result = result;
    entry.updatedAt = Date.now();
  }

  fail(projectId: string, error: string): void {
    const entry = this.entries.get(projectId);
    if (!entry) return;

    entry.status = 'failed';
    entry.step = 'failed';
    entry.message = '생성 중 오류가 발생했습니다.';
    entry.error = error;
    entry.updatedAt = Date.now();
  }

  get(projectId: string): TrackerEntry | undefined {
    return this.entries.get(projectId);
  }

  isGenerating(projectId: string): boolean {
    const entry = this.entries.get(projectId);
    return entry !== undefined && entry.status === 'generating';
  }

  stopCleanup(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [projectId, entry] of this.entries) {
      const ttl = entry.status === 'generating' ? TTL_GENERATING_MS : TTL_TERMINAL_MS;
      if (now - entry.updatedAt > ttl) {
        this.entries.delete(projectId);
      }
    }
  }
}

export const generationTracker = new GenerationTracker();

export function stopCleanup(): void {
  generationTracker.stopCleanup();
}
