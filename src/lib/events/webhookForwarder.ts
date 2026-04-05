import crypto from 'crypto';
import { eventBus } from '@/lib/events/eventBus';
import type { DomainEvent } from '@/types/events';
import { logger } from '@/lib/utils/logger';

const FORWARD_TIMEOUT_MS = 5000; // Issue 1.3: increased from 3s
const MAX_RETRIES = 3;
const FAILURE_RESET_MS = 5 * 60 * 1000; // 5 minutes

// Issue 1.2 + 8.1: treat empty string as undefined
const webhookUrl = process.env.N8N_WEBHOOK_URL || undefined;
const webhookSecret = process.env.N8N_WEBHOOK_SECRET || undefined;

if (process.env.N8N_WEBHOOK_SECRET === '') {
  logger.warn('N8N_WEBHOOK_SECRET is empty string — treating as disabled');
}

// Deduplication: skip same type+projectId within 5 seconds
const recentEvents = new Map<string, number>();
const DEDUP_WINDOW_MS = 5000;

function getDedupeKey(event: DomainEvent): string {
  const projectId = 'payload' in event && typeof event.payload === 'object' && event.payload !== null && 'projectId' in event.payload
    ? (event.payload as { projectId?: string }).projectId ?? ''
    : '';
  return `${event.type}:${projectId}`;
}

function isDuplicate(event: DomainEvent): boolean {
  const key = getDedupeKey(event);
  const now = Date.now();
  const lastSeen = recentEvents.get(key);
  if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) return true;
  recentEvents.set(key, now);
  // Clean old entries periodically
  if (recentEvents.size > 100) {
    for (const [k, t] of recentEvents) {
      if (now - t > DEDUP_WINDOW_MS) recentEvents.delete(k);
    }
  }
  return false;
}

function createSignature(payload: string): string {
  if (!webhookSecret) return '';
  return `sha256=${crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex')}`;
}

// 외부 연결 상태 추적 — 연속 실패 시 내부 QC 강화 모드 활성화
let consecutiveFailures = 0;
let lastFailureTime = 0;
const MAX_FAILURES_FOR_STRICT = 3;

export function isExternalAvailable(): boolean {
  // Issue 1.5: auto-reset after 5 minutes of no failures
  if (consecutiveFailures > 0 && Date.now() - lastFailureTime > FAILURE_RESET_MS) {
    consecutiveFailures = 0;
  }
  return webhookUrl !== undefined && consecutiveFailures < MAX_FAILURES_FOR_STRICT;
}

async function forwardEvent(event: DomainEvent, attempt = 0): Promise<void> {
  if (!webhookUrl) return;
  if (attempt === 0 && isDuplicate(event)) return;

  const body = JSON.stringify({
    type: event.type,
    payload: event.payload,
    timestamp: new Date().toISOString(),
  });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const sig = createSignature(body);
  if (sig) headers['X-Webhook-Signature'] = sig;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (response.ok) {
      consecutiveFailures = 0;
    } else {
      lastFailureTime = Date.now();
      consecutiveFailures++;
      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        setTimeout(() => forwardEvent(event, attempt + 1).catch(() => {}), delay);
      }
      logger.warn('Webhook forward HTTP error', {
        type: event.type,
        status: response.status,
        attempt,
        consecutiveFailures,
      });
    }
  } catch (err) {
    lastFailureTime = Date.now();
    consecutiveFailures++;
    if (attempt < MAX_RETRIES) {
      const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      setTimeout(() => forwardEvent(event, attempt + 1).catch(() => {}), delay);
    }
    logger.warn('Webhook forward failed', {
      type: event.type,
      error: err instanceof Error ? err.message : String(err),
      attempt,
      consecutiveFailures,
    });
  }
}

export function initWebhookForwarder(): void {
  if (!webhookUrl) {
    logger.info('N8N_WEBHOOK_URL not set, webhook forwarder disabled');
    return;
  }
  eventBus.onAll((event) => {
    // Fire-and-forget — never block the main flow
    forwardEvent(event).catch(() => {});
  });
  logger.info('Webhook forwarder initialized', { target: webhookUrl });
}
