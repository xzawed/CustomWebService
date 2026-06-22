import countriesData from '@/data/countries.json';
import { filterCountries } from '@/lib/countries/query';
import type { Country } from '@/lib/countries/types';

// 쿼리 필터(region/search)에 의존하므로 동적. 정적 데이터라 명시적 장기 캐시.
export const dynamic = 'force-dynamic';

const COUNTRIES = countriesData as Country[];

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** GET /api/v1/countries — 전체 목록(+ ?region=, ?search= 선택 필터). 공개 키리스 CORS 엔드포인트. */
export function GET(request: Request): Response {
  const url = new URL(request.url);
  const region = url.searchParams.get('region');
  const search = url.searchParams.get('search');

  const result = filterCountries(COUNTRIES, { region, search });

  return Response.json(result, {
    headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=86400' },
  });
}
