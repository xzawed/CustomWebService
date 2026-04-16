import type { ApiCatalogItem } from '@/types/api';

/**
 * Parses a raw JSONB endpoints array from DB into typed ApiCatalogItem endpoints.
 * Handles both snake_case DB columns and camelCase code paths.
 */
export function parseEndpoints(raw: unknown): ApiCatalogItem['endpoints'] {
  if (!Array.isArray(raw)) return [];
  return raw.map((ep: Record<string, unknown>) => {
    // DB의 parameters(객체) → params(배열) 변환
    let params: ApiCatalogItem['endpoints'][0]['params'] = [];
    if (Array.isArray(ep.params)) {
      params = ep.params;
    } else if (
      ep.parameters &&
      typeof ep.parameters === 'object' &&
      !Array.isArray(ep.parameters)
    ) {
      params = Object.entries(ep.parameters as Record<string, string>).map(([name, type]) => ({
        name,
        type,
        required: false,
        description: '',
      }));
    }
    return {
      path: (ep.path as string) ?? '',
      method: (ep.method as 'GET' | 'POST' | 'PUT' | 'DELETE') ?? 'GET',
      description: (ep.description as string) ?? '',
      params,
      responseExample:
        (ep.response_example as Record<string, unknown>) ??
        (ep.responseExample as Record<string, unknown>) ??
        {},
      exampleCall: (ep.example_call as string | undefined) ?? (ep.exampleCall as string | undefined) ?? undefined,
      responseDataPath: (ep.response_data_path as string | undefined) ?? (ep.responseDataPath as string | undefined) ?? undefined,
      requestHeaders: (ep.request_headers as Record<string, string> | undefined) ?? (ep.requestHeaders as Record<string, string> | undefined) ?? undefined,
    };
  });
}
