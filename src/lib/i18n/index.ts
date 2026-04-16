import ko from './ko';
import type { MessageKey } from './types';

export { type MessageKey };

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  let msg: string = ko[key];
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      msg = msg.replace(`{${k}}`, String(v));
    }
  }
  return msg;
}
