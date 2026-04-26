import type { SupabaseClient } from '@supabase/supabase-js';
import type { IBaseRepository, QueryOptions } from '@/repositories/interfaces/IBaseRepository';
import { toSnake as toSnakeUtil, isNotFound, toDatabaseRow, normalizePagination } from '@/repositories/utils';

// Re-export for backwards compatibility
export type { QueryOptions };

export abstract class BaseRepository<T extends { id: string }> implements IBaseRepository<T> {
  constructor(
    protected supabase: SupabaseClient,
    protected tableName: string
  ) {}

  async findById(id: string): Promise<T | null> {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
    return this.toDomain(data);
  }

  async findMany(
    filter?: Record<string, unknown>,
    options: QueryOptions = {}
  ): Promise<{ items: T[]; total: number }> {
    const { orderBy = 'created_at', orderDirection = 'desc' } = options;
    const { offset, limit } = normalizePagination(options);

    let query = this.supabase.from(this.tableName).select('*', { count: 'exact' });

    if (filter) {
      for (const [key, value] of Object.entries(filter)) {
        if (value !== undefined && value !== null) {
          query = query.eq(this.toSnake(key), value);
        }
      }
    }

    query = query.order(orderBy, { ascending: orderDirection === 'asc' });
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      items: (data ?? []).map((row) => this.toDomain(row)),
      total: count ?? 0,
    };
  }

  async create(input: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T> {
    const dbData = this.toDatabase(input as Partial<T>);
    const { data, error } = await this.supabase
      .from(this.tableName)
      .insert(dbData)
      .select()
      .single();

    if (error) throw error;
    return this.toDomain(data);
  }

  async update(id: string, input: Partial<T>): Promise<T> {
    const dbData = this.toDatabase(input);
    const { data, error } = await this.supabase
      .from(this.tableName)
      .update({ ...dbData, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return this.toDomain(data);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase.from(this.tableName).delete().eq('id', id);
    if (error) throw error;
  }

  async count(filter?: Record<string, unknown>): Promise<number> {
    let query = this.supabase.from(this.tableName).select('*', { count: 'exact', head: true });

    if (filter) {
      for (const [key, value] of Object.entries(filter)) {
        if (value !== undefined && value !== null) {
          query = query.eq(this.toSnake(key), value);
        }
      }
    }

    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  }

  // Convert DB row (snake_case) to domain model (camelCase)
  protected abstract toDomain(row: Record<string, unknown>): T;

  // Convert domain model (camelCase) to DB row (snake_case)
  protected toDatabase(model: Partial<T>): Record<string, unknown> {
    return toDatabaseRow(model as Partial<Record<string, unknown>>);
  }

  protected toSnake(str: string): string {
    return toSnakeUtil(str);
  }
}
