import { sql } from 'drizzle-orm';
import { toSnake } from './caseConverter';

/**
 * Builds a Drizzle WHERE condition from a plain object filter.
 * Converts camelCase keys to snake_case column names.
 */
export function buildConditions(filter?: Record<string, unknown>) {
  if (!filter) return undefined;

  const conditions = Object.entries(filter)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      const col = toSnake(key);
      return sql`${sql.identifier(col)} = ${value}`;
    });

  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];

  return sql.join(conditions, sql` AND `);
}
