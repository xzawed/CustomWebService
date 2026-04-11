import type { QueryOptions } from '@/repositories/base/BaseRepository';

export interface IBaseRepository<T extends { id: string }> {
  findById(id: string): Promise<T | null>;
  findMany(filter?: Record<string, unknown>, options?: QueryOptions): Promise<{ items: T[]; total: number }>;
  create(input: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  update(id: string, input: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
  count(filter?: Record<string, unknown>): Promise<number>;
}
