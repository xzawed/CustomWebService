import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// Each importBrowserPool() registers 3 signal handlers (exit/SIGTERM/SIGINT).
// With many tests, accumulated listeners can exceed the default limit of 10.
// Raise the limit for this test file to avoid MaxListeners warnings.
process.setMaxListeners(50);

// Shared mock objects — module-level so vi.mock factory can reference them
const mockContext = {
  newPage: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
};

const mockBrowser = {
  isConnected: vi.fn().mockReturnValue(true),
  newContext: vi.fn().mockResolvedValue(mockContext),
  close: vi.fn().mockResolvedValue(undefined),
};

const mockPage = {
  close: vi.fn().mockResolvedValue(undefined),
  context: vi.fn().mockReturnValue(mockContext),
};

mockContext.newPage.mockResolvedValue(mockPage);

// Mutable launch fn so individual tests can override it
const chromiumLaunchMock = vi.fn().mockResolvedValue(mockBrowser);

vi.mock('playwright-core', () => ({
  chromium: {
    launch: (...args: unknown[]) => chromiumLaunchMock(...args),
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('browserPool', () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    // Reset mock implementations to defaults
    chromiumLaunchMock.mockResolvedValue(mockBrowser);
    mockBrowser.isConnected.mockReturnValue(true);
    mockBrowser.newContext.mockResolvedValue(mockContext);
    mockBrowser.close.mockResolvedValue(undefined);
    mockContext.newPage.mockResolvedValue(mockPage);
    mockContext.close.mockResolvedValue(undefined);
    mockPage.close.mockResolvedValue(undefined);
    mockPage.context.mockReturnValue(mockContext);
  });

  // Helper to dynamically import the module with fresh state
  async function importBrowserPool() {
    return await import('./browserPool');
  }

  describe('isQcEnabled()', () => {
    it('returns false when ENABLE_RENDERING_QC is not set', async () => {
      delete process.env.ENABLE_RENDERING_QC;
      const { isQcEnabled } = await importBrowserPool();
      expect(isQcEnabled()).toBe(false);
    });

    it('returns false when ENABLE_RENDERING_QC is "false"', async () => {
      process.env.ENABLE_RENDERING_QC = 'false';
      const { isQcEnabled } = await importBrowserPool();
      expect(isQcEnabled()).toBe(false);
    });

    it('returns true when ENABLE_RENDERING_QC is "true"', async () => {
      process.env.ENABLE_RENDERING_QC = 'true';
      const { isQcEnabled } = await importBrowserPool();
      expect(isQcEnabled()).toBe(true);
    });
  });

  describe('getPage()', () => {
    it('returns null when QC is disabled', async () => {
      process.env.ENABLE_RENDERING_QC = 'false';
      const { getPage } = await importBrowserPool();
      const page = await getPage();
      expect(page).toBeNull();
    });

    it('launches browser and returns page when QC is enabled', async () => {
      process.env.ENABLE_RENDERING_QC = 'true';
      const { getPage } = await importBrowserPool();

      const page = await getPage();

      expect(page).toBe(mockPage);
      expect(chromiumLaunchMock).toHaveBeenCalledTimes(1);
      expect(mockBrowser.newContext).toHaveBeenCalledTimes(1);
      expect(mockContext.newPage).toHaveBeenCalledTimes(1);
    });

    it('returns null when browser launch fails', async () => {
      process.env.ENABLE_RENDERING_QC = 'true';
      chromiumLaunchMock.mockRejectedValueOnce(new Error('launch failed'));

      const { getPage } = await importBrowserPool();
      const page = await getPage();

      expect(page).toBeNull();
    });

    it('returns null when page creation fails', async () => {
      process.env.ENABLE_RENDERING_QC = 'true';
      mockContext.newPage.mockRejectedValueOnce(new Error('page creation failed'));

      const { getPage } = await importBrowserPool();
      const page = await getPage();

      expect(page).toBeNull();
    });

    it('reuses existing connected browser instance on second call', async () => {
      process.env.ENABLE_RENDERING_QC = 'true';
      const { getPage } = await importBrowserPool();

      // First call launches browser
      await getPage();
      // Second call should reuse the browser (isConnected returns true)
      await getPage();

      // launch should only be called once, but newContext twice
      expect(chromiumLaunchMock).toHaveBeenCalledTimes(1);
      expect(mockBrowser.newContext).toHaveBeenCalledTimes(2);
    });

    it('동시 첫 호출 시 브라우저를 한 번만 실행한다 (launch 경쟁 제거)', async () => {
      process.env.ENABLE_RENDERING_QC = 'true';
      const { getPage } = await importBrowserPool();

      // 두 호출을 동시에 시작 — 공유 launch promise가 없으면 각자 chromium.launch()를 실행해 두 번 호출됨
      const [page1, page2] = await Promise.all([getPage(), getPage()]);

      expect(page1).toBe(mockPage);
      expect(page2).toBe(mockPage);
      expect(chromiumLaunchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('releasePage()', () => {
    it('closes page and context', async () => {
      process.env.ENABLE_RENDERING_QC = 'true';
      const { getPage, releasePage } = await importBrowserPool();

      const page = await getPage();
      expect(page).toBe(mockPage);

      await releasePage(mockPage as unknown as Parameters<typeof releasePage>[0]);

      expect(mockPage.close).toHaveBeenCalledTimes(1);
      expect(mockContext.close).toHaveBeenCalledTimes(1);
    });

    it('does not throw even when page.close throws', async () => {
      process.env.ENABLE_RENDERING_QC = 'true';
      mockPage.close.mockRejectedValueOnce(new Error('close failed'));

      const { getPage, releasePage } = await importBrowserPool();

      const page = await getPage();
      expect(page).not.toBeNull();

      await expect(
        releasePage(mockPage as unknown as Parameters<typeof releasePage>[0])
      ).resolves.toBeUndefined();
    });

    it('releases semaphore allowing a new page to be acquired after fill', async () => {
      process.env.ENABLE_RENDERING_QC = 'true';
      const { getPage, releasePage } = await importBrowserPool();

      // Fill semaphore (MAX defaults to 2)
      const page1 = await getPage();
      const page2 = await getPage();
      expect(page1).not.toBeNull();
      expect(page2).not.toBeNull();

      // Release one slot
      await releasePage(mockPage as unknown as Parameters<typeof releasePage>[0]);

      // Now should be able to get another page without timeout
      const page3 = await getPage();
      expect(page3).not.toBeNull();
    });
  });

  describe('shutdown()', () => {
    it('closes browser instance when called', async () => {
      process.env.ENABLE_RENDERING_QC = 'true';
      const { getPage, shutdown } = await importBrowserPool();

      // Launch browser by getting a page
      await getPage();

      await shutdown();

      expect(mockBrowser.close).toHaveBeenCalledTimes(1);
    });

    it('does nothing when no browser instance exists', async () => {
      process.env.ENABLE_RENDERING_QC = 'true';
      const { shutdown } = await importBrowserPool();

      // shutdown without ever launching browser
      await expect(shutdown()).resolves.toBeUndefined();
      expect(mockBrowser.close).not.toHaveBeenCalled();
    });

    it('handles browser.close() throwing gracefully', async () => {
      process.env.ENABLE_RENDERING_QC = 'true';
      mockBrowser.close.mockRejectedValueOnce(new Error('close error'));

      const { getPage, shutdown } = await importBrowserPool();

      await getPage();

      // Should not throw even when browser.close() throws
      await expect(shutdown()).resolves.toBeUndefined();
    });
  });

  describe('browser crash recovery (isConnected=false)', () => {
    it('disconnected browser is replaced on next getPage() call', async () => {
      process.env.ENABLE_RENDERING_QC = 'true';
      const { getPage } = await importBrowserPool();

      await getPage();
      expect(chromiumLaunchMock).toHaveBeenCalledTimes(1);

      // Simulate crash: next isConnected() check returns false
      mockBrowser.isConnected.mockReturnValue(false);

      const page2 = await getPage();
      expect(page2).not.toBeNull();
      expect(chromiumLaunchMock).toHaveBeenCalledTimes(2); // re-launched
    });

    it('crash while waiters are queued — all queued callers receive null without deadlock', async () => {
      process.env.ENABLE_RENDERING_QC = 'true';
      delete process.env.QC_MAX_CONCURRENT_PAGES; // MAX = 2
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });

      try {
        const { getPage } = await importBrowserPool();

        // Fill semaphore (2 slots)
        await getPage();
        await getPage();

        // Third caller queues — will block until semaphore or timeout
        const p3 = getPage();

        // Simulate browser crash — getBrowser() will drain waitQueue with resolve(false)
        mockBrowser.isConnected.mockReturnValue(false);

        // Advance past semaphore timeout so queued caller resolves
        await vi.advanceTimersByTimeAsync(11_000);

        const page3 = await p3;
        expect(page3).toBeNull(); // resolved (not deadlocked)
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('semaphore timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns null when MAX_CONCURRENT_PAGES slots are occupied and timeout elapses', async () => {
      process.env.ENABLE_RENDERING_QC = 'true';
      delete process.env.QC_MAX_CONCURRENT_PAGES; // ensure default of 2

      const { getPage } = await importBrowserPool();

      // Acquire MAX_CONCURRENT_PAGES (2) slots without releasing
      const page1Promise = getPage();
      const page2Promise = getPage();

      // Flush microtasks so the semaphore slots are actually acquired
      const [page1, page2] = await Promise.all([page1Promise, page2Promise]);
      expect(page1).not.toBeNull();
      expect(page2).not.toBeNull();

      // Now try a third — it will queue and timeout
      const page3Promise = getPage();

      // Advance past the 10000ms timeout
      vi.advanceTimersByTime(11000);

      const page3 = await page3Promise;
      expect(page3).toBeNull();
    });
  });

  describe('process signal handlers', () => {
    it('registers exit, SIGTERM, and SIGINT handlers on module load', async () => {
      // Record listener counts before import
      const exitCountBefore = process.listenerCount('exit');
      const sigtermCountBefore = process.listenerCount('SIGTERM');
      const sigintCountBefore = process.listenerCount('SIGINT');

      await importBrowserPool();

      // After import, counts should have increased by 1 each
      expect(process.listenerCount('exit')).toBe(exitCountBefore + 1);
      expect(process.listenerCount('SIGTERM')).toBe(sigtermCountBefore + 1);
      expect(process.listenerCount('SIGINT')).toBe(sigintCountBefore + 1);
    });
  });

  describe('process signal handlers — safe invocation', () => {
    it('SIGTERM 방출이 예외 없이 처리된다', async () => {
      // shutdown() is safe even with no browser — just verify no uncaught exceptions
      await importBrowserPool();
      await expect(
        new Promise<void>((resolve) => {
          process.emit('SIGTERM');
          setTimeout(resolve, 10);
        })
      ).resolves.toBeUndefined();
    });

    it('SIGINT 방출이 예외 없이 처리된다', async () => {
      await importBrowserPool();
      await expect(
        new Promise<void>((resolve) => {
          process.emit('SIGINT');
          setTimeout(resolve, 10);
        })
      ).resolves.toBeUndefined();
    });

    it('SIGTERM 수신 시 브라우저가 닫힌다', async () => {
      process.env.ENABLE_RENDERING_QC = 'true';
      const { getPage } = await importBrowserPool();

      // Launch a browser
      await getPage();
      expect(chromiumLaunchMock).toHaveBeenCalledTimes(1);

      // Emit SIGTERM — triggers the shutdown handler registered at module load
      process.emit('SIGTERM');

      // Allow async shutdown to complete
      await new Promise((r) => setTimeout(r, 10));

      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('SIGINT 수신 시 브라우저가 닫힌다', async () => {
      process.env.ENABLE_RENDERING_QC = 'true';
      const { getPage } = await importBrowserPool();

      await getPage();
      expect(chromiumLaunchMock).toHaveBeenCalledTimes(1);

      process.emit('SIGINT');
      await new Promise((r) => setTimeout(r, 10));

      expect(mockBrowser.close).toHaveBeenCalled();
    });
  });
});
