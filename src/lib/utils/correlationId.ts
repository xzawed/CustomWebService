import { randomUUID } from 'crypto';

const HEADER_NAME = 'x-correlation-id';

/**
 * Extracts the correlation ID from a Request's headers, or generates a new one.
 * Used to trace a single request across logs, events, and downstream services.
 */
export function getCorrelationId(request?: Request): string {
  if (request) {
    const fromHeader = request.headers.get(HEADER_NAME);
    if (fromHeader) return fromHeader;
  }
  return randomUUID();
}

/**
 * Attaches a correlation ID header to a Headers object (or creates one).
 */
export function setCorrelationId(headers: Headers, correlationId: string): void {
  headers.set(HEADER_NAME, correlationId);
}

export { HEADER_NAME as CORRELATION_ID_HEADER };
