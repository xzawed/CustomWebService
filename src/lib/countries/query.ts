import type { Country } from './types';

/** region(또는 subregion) 정확 일치 + name(common/official/ko)·코드 substring 검색으로 필터. 둘 다 대소문자 무시. */
export function filterCountries(
  countries: Country[],
  opts: { region?: string | null; search?: string | null },
): Country[] {
  let result = countries;

  const region = opts.region?.trim().toLowerCase();
  if (region) {
    result = result.filter(
      (c) => c.region.toLowerCase() === region || c.subregion?.toLowerCase() === region,
    );
  }

  const search = opts.search?.trim().toLowerCase();
  if (search) {
    result = result.filter(
      (c) =>
        c.name.common.toLowerCase().includes(search) ||
        c.name.official.toLowerCase().includes(search) ||
        (c.name.ko?.toLowerCase().includes(search) ?? false) ||
        c.cca2.toLowerCase() === search ||
        c.cca3.toLowerCase() === search,
    );
  }

  return result;
}

/** cca2 또는 cca3 코드로 단건 조회(대소문자 무시). 없으면 null. */
export function findCountryByCode(countries: Country[], code: string): Country | null {
  const c = code.trim().toLowerCase();
  if (!c) return null;
  return (
    countries.find((x) => x.cca2.toLowerCase() === c || x.cca3.toLowerCase() === c) ?? null
  );
}
