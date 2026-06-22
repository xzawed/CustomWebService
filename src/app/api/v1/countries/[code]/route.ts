import countriesData from '@/data/countries.json';
import { findCountryByCode } from '@/lib/countries/query';
import type { Country } from '@/lib/countries/types';

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

/** GET /api/v1/countries/{code} — cca2/cca3 코드(대소문자 무시) 단건. 미존재 시 404. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params;
  const country = findCountryByCode(COUNTRIES, code);

  if (!country) {
    return Response.json(
      { error: `Country not found: ${code}` },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  return Response.json(country, {
    headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=86400' },
  });
}
