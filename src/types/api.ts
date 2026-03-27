export type ApiAuthType = 'none' | 'api_key' | 'oauth';

export interface ApiEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  description: string;
  params: ApiParam[];
  responseExample: Record<string, unknown>;
}

export interface ApiParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
  defaultValue?: string;
}

export interface ApiCatalogItem {
  id: string;
  name: string;
  description: string;
  category: string;
  baseUrl: string;
  authType: ApiAuthType;
  authConfig: Record<string, unknown>;
  rateLimit: string | null;
  isActive: boolean;
  iconUrl: string | null;
  docsUrl: string | null;
  endpoints: ApiEndpoint[];
  tags: string[];
  apiVersion: string | null;
  deprecatedAt: string | null;
  successorId: string | null;
  corsSupported: boolean;
  requiresProxy: boolean;
  creditRequired: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  key: string;
  label: string;
  icon: string;
  count: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
  nextCursor?: string;
}

export interface CatalogSearchParams {
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
}
