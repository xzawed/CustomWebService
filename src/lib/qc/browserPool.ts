import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { logger } from '@/lib/utils/logger';

const MAX_CONCURRENT_PAGES = 2;

export function isQcEnabled(): boolean {
  return process.env.ENABLE_RENDERING_QC === 'true';
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
    if (browserInstance) {
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

// --- Semaphore ---

let activePages = 0;
const waitQueue: Array<() => void> = [];

function acquireSemaphore(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (activePages < MAX_CONCURRENT_PAGES) {
      activePages++;
      resolve();
    } else {
      waitQueue.push(() => {
        activePages++;
        resolve();
      });
    }
  });
}

function releaseSemaphore(): void {
  const next = waitQueue.shift();
  if (next) {
    next();
  } else {
    activePages--;
  }
}

// --- Public API ---

export async function getPage(): Promise<Page | null> {
  if (!isQcEnabled()) return null;

  const browser = await getBrowser();
  if (!browser) return null;

  try {
    await acquireSemaphore();

    const context: BrowserContext = await browser.newContext();
    const page: Page = await context.newPage();
    return page;
  } catch (err) {
    releaseSemaphore();
    logger.error('[QC] Failed to create page', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function releasePage(page: Page): Promise<void> {
  try {
    const context = page.context();
    await context.close();
  } catch (err) {
    logger.warn('[QC] Failed to close page context', {
      error: err instanceof Error ? err.message : String(err),
    });
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
