import crypto from 'crypto';
import { eventBus } from '@/lib/events/eventBus';
import type { DomainEvent } from '@/types/events';
import { logger } from '@/lib/utils/logger';

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET;
const FORWARD_TIMEOUT_MS = 3000;

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
  if (!N8N_WEBHOOK_SECRET) return '';
  return `sha256=${crypto.createHmac('sha256', N8N_WEBHOOK_SECRET).update(payload).digest('hex')}`;
}

async function forwardEvent(event: DomainEvent): Promise<void> {
  if (!N8N_WEBHOOK_URL) return;
  if (isDuplicate(event)) return;

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
    await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (err) {
    logger.warn('Webhook forward failed', {
      type: event.type,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export function initWebhookForwarder(): void {
  if (!N8N_WEBHOOK_URL) {
    logger.info('N8N_WEBHOOK_URL not set, webhook forwarder disabled');
    return;
  }
  eventBus.onAll((event) => {
    // Fire-and-forget — never block the main flow
    forwardEvent(event).catch(() => {});
  });
  logger.info('Webhook forwarder initialized', { target: N8N_WEBHOOK_URL });
}
