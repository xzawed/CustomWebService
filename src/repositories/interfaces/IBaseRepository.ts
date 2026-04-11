/** 목록 조회 옵션 */
export interface QueryOptions {
  page?: number;
  limit?: number;
  cursor?: string;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

export interface IBaseRepository<T extends { id: string }> {
  findById(id: string): Promise<T | null>;
  findMany(filter?: Record<string, unknown>, options?: QueryOptions): Promise<{ items: T[]; total: number }>;
  create(input: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  update(id: string, input: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
  count(filter?: Record<string, unknown>): Promise<number>;
}
