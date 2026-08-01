/**
 * Raw HTTP helper that sets `Host` explicitly.
 *
 * Playwright's `request` API may overwrite Host from the URL, so subdomain
 * rewrite tests must not rely on it. Always hit 127.0.0.1 and pass Host.
 */
import http from 'node:http';

export interface HostRequestOptions {
  /** Hostname for the Host header (e.g. e2e-fixture.xzawed.xyz). */
  host: string;
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Default 127.0.0.1 */
  address?: string;
  /** Default 3000 */
  port?: number;
  timeoutMs?: number;
}

export interface HostResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  /** Raw header list — preserves duplicate header names (CSP double-apply). */
  rawHeaders: string[];
  body: string;
}

export function requestWithHost(options: HostRequestOptions): Promise<HostResponse> {
  const {
    host,
    path,
    method = 'GET',
    headers = {},
    body,
    address = '127.0.0.1',
    port = 3000,
    timeoutMs = 30_000,
  } = options;

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: address,
        port,
        path,
        method,
        headers: {
          ...headers,
          host,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer | string) => {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            rawHeaders: res.rawHeaders,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`requestWithHost timeout after ${timeoutMs}ms`));
    });
    req.on('error', reject);

    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

/** Count occurrences of a header name in the rawHeaders array (case-insensitive). */
export function countHeader(rawHeaders: string[], name: string): number {
  const target = name.toLowerCase();
  let count = 0;
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (rawHeaders[i].toLowerCase() === target) count += 1;
  }
  return count;
}

/** Collect all values for a header name from rawHeaders (case-insensitive). */
export function getHeaderValues(rawHeaders: string[], name: string): string[] {
  const target = name.toLowerCase();
  const values: string[] = [];
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (rawHeaders[i].toLowerCase() === target) values.push(rawHeaders[i + 1]);
  }
  return values;
}
