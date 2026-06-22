import type { Country, RawCountry } from './types';

/** mledoze idd({ root, suffixes })를 단일 국가번호 문자열로 변환. suffix 1개면 결합, 아니면 root만. */
function toCallingCode(idd: RawCountry['idd']): string | null {
  if (!idd?.root) return null;
  if (idd.suffixes && idd.suffixes.length === 1) return `${idd.root}${idd.suffixes[0]}`;
  return idd.root;
}

/** mledoze 원본 1건을 큐레이티드 Country로 변환. */
export function toCuratedCountry(raw: RawCountry): Country {
  const cca2 = raw.cca2 ?? '';
  const currencies: Country['currencies'] = {};
  for (const [code, v] of Object.entries(raw.currencies ?? {})) {
    currencies[code] = { name: v?.name ?? '', symbol: v?.symbol ?? null };
  }
  return {
    name: {
      common: raw.name?.common ?? '',
      official: raw.name?.official ?? '',
      ko: raw.translations?.kor?.common ?? null,
    },
    cca2,
    cca3: raw.cca3 ?? '',
    ccn3: raw.ccn3 ?? null,
    capital: raw.capital?.[0] ?? null,
    region: raw.region ?? '',
    subregion: raw.subregion || null,
    flag: raw.flag ?? '',
    flagSvg: cca2 ? `https://flagcdn.com/${cca2.toLowerCase()}.svg` : null,
    currencies,
    languages: raw.languages ?? {},
    area: typeof raw.area === 'number' ? raw.area : null,
    latlng: Array.isArray(raw.latlng) ? raw.latlng : [],
    callingCode: toCallingCode(raw.idd),
    tld: raw.tld?.[0] ?? null,
  };
}

/** 원본 배열을 큐레이티드 배열로 변환. cca2/cca3가 없는 항목은 제외하고 common 이름순 정렬. */
export function toCuratedCountries(raws: RawCountry[]): Country[] {
  return raws
    .map(toCuratedCountry)
    .filter((c) => c.cca2 !== '' && c.cca3 !== '')
    .sort((a, b) => a.name.common.localeCompare(b.name.common));
}
