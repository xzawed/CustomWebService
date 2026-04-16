const TTL_GENERATING_MS = 30 * 60 * 1000; // 30분 — 생성 중 상태는 더 오래 유지
const TTL_TERMINAL_MS = 10 * 60 * 1000;  // 10분 — completed/failed
const CLEANUP_INTERVAL_MS = 60 * 1000; // 60초

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
  private readonly entries = new Map<string, TrackerEntry>();
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
    if (!entry) return;

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
