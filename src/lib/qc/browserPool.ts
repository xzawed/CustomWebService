import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { logger } from '@/lib/utils/logger';

const MAX_CONCURRENT_PAGES = 2;

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
      waitQueue.forEach(resolve => resolve(true)); // unblock waiters
      waitQueue.length = 0;
      try {
        await browserInstance.close();
      } catch {
        // ignore errors on stale close
      }
      browserInstance = null;
    }

    logger.info('[QC] Launching Chromium browser');
    browserInstance = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    });
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
