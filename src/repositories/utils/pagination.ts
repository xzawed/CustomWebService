export interface PaginationOptions {
  page?: number;
  limit?: number;
}

export interface NormalizedPagination {
  offset: number;
  limit: number;
}

export function normalizePagination(options: PaginationOptions): NormalizedPagination {
  const page = options.page ?? 1;
  const limit = options.limit ?? 20;
  return { offset: (page - 1) * limit, limit };
}
