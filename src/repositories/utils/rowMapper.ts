import { toSnake } from './caseConverter';

export function toDatabaseRow(model: Partial<Record<string, unknown>>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(model)) {
    if (key === 'id' || key === 'createdAt' || key === 'updatedAt') continue;
    result[toSnake(key)] = value;
  }
  return result;
}
