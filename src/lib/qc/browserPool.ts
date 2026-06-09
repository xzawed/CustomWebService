import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { logger } from '@/lib/utils/logger';

const _qcMaxPages = Number.parseInt(process.env.QC_MAX_CONCURRENT_PAGES ?? '', 10);
const MAX_CONCURRENT_PAGES = Number.isNaN(_qcMaxPages) || _qcMaxPages <= 0 ? 2 : _qcMaxPages;

export function isQcEnabled(): boolean {
  return process.env.ENABLE_RENDERING_QC === 'true';
}

// --- Semaphore ---

let activePages = 0;
const waitQueue: Array<(value: boolean) => void> = [];

async function acquireSemaphore(timeoutMs = 10000): Promise<boolean> {
  if (activePages < MAX_CONCURRENT_PAGES) {
    activePages++;
    return true;
  }
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      // Remove from queue and return false (timeout)
      const idx = waitQueue.indexOf(resolve);
      if (idx !== -1) waitQueue.splice(idx, 1);
      resolve(false);
    }, timeoutMs);
    waitQueue.push((value: boolean) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

function releaseSemaphore(): void {
  const next = waitQueue.shift();
  if (next) {
    next(true);
  } else {
    activePages--;
  }
}

// --- Browser singleton ---

let browserInstance: Browser | null = null;
// 동시 첫 호출이 각자 chromium.launch()를 실행해 여러 브라우저를 띄우고 싱글톤 참조를 덮어쓰며
// 하나를 누수시키는 경쟁을 막기 위해, 진행 중인 launch promise를 공유한다.
let browserLaunchPromise: Promise<Browser> | null = null;

async function launchChromium(): Promise<Browser> {
  logger.info('[QC] Launching Chromium browser');
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  return chromium.launch({
    headless: true,
    ...(executablePath && { executablePath }),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
}

async function getBrowser(): Promise<Browser | null> {
  if (!isQcEnabled()) return null;

  try {
    if (browserInstance && browserInstance.isConnected()) {
      return browserInstance;
    }

    // Close stale instance if disconnected
    if (browserInstance && !browserInstance.isConnected()) {
      logger.warn('[QC] Browser disconnected, resetting pool');
      // Reset semaphore — all orphaned pages are gone
      activePages = 0;
      waitQueue.forEach(resolve => resolve(false)); // browser crashed — waiters did not acquire
      waitQueue.length = 0;
      try {
        await browserInstance.close();
      } catch {
        // ignore errors on stale close
      }
      browserInstance = null;
    }

    // 진행 중인 launch가 있으면 그 promise를 공유(중복 실행 방지). 실패 시 promise를 비워 재시도 허용.
    browserLaunchPromise ??= launchChromium().finally(() => {
      browserLaunchPromise = null;
    });
    browserInstance = await browserLaunchPromise;
    return browserInstance;
  } catch (err) {
    logger.error('[QC] Failed to launch browser', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// --- Public API ---

export async function getPage(): Promise<Page | null> {
  if (!isQcEnabled()) return null;

  const acquired = await acquireSemaphore(10000);
  if (!acquired) {
    logger.warn('[QC] Browser pool semaphore timeout — possible deadlock');
    return null;
  }

  try {
    const browser = await getBrowser();
    if (!browser) {
      releaseSemaphore();
      return null;
    }

    const context: BrowserContext = await browser.newContext();
    const page: Page = await context.newPage();
    return page;
  } catch (err) {
    releaseSemaphore(); // Ensure semaphore is released on error
    logger.error('[QC] Failed to create page', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function releasePage(page: Page): Promise<void> {
  try {
    const context = page.context();
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  } catch {
    // Page/context may already be closed after crash
  } finally {
    releaseSemaphore();
  }
}

export async function shutdown(): Promise<void> {
  if (browserInstance) {
    try {
      await browserInstance.close();
      logger.info('[QC] Browser shut down');
    } catch (err) {
      logger.warn('[QC] Error during browser shutdown', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      browserInstance = null;
    }
  }
}

process.on('exit', () => {
  void shutdown();
});

process.on('SIGTERM', () => {
  void shutdown();
});

process.on('SIGINT', () => {
  void shutdown();
});
