/**
 * 자체 호스팅 국가 데이터 API의 큐레이티드 스키마 + mledoze 원본의 부분 타입.
 * 데이터 출처: mledoze/countries (ODbL). 상세: docs/superpowers/specs/2026-06-22-country-data-api-design.md
 */

/** 카탈로그·생성 사이트에 노출되는 큐레이티드 국가 객체. */
export interface Country {
  name: { common: string; official: string; ko: string | null };
  cca2: string;
  cca3: string;
  ccn3: string | null;
  capital: string | null;
  region: string;
  subregion: string | null;
  flag: string;
  flagSvg: string | null;
  currencies: Record<string, { name: string; symbol: string | null }>;
  languages: Record<string, string>;
  area: number | null;
  latlng: number[];
  callingCode: string | null;
  tld: string | null;
}

/** mledoze countries.json 원본 중 우리가 읽는 필드만(부분). */
export interface RawCountry {
  name?: { common?: string; official?: string };
  translations?: { kor?: { common?: string } };
  cca2?: string;
  cca3?: string;
  ccn3?: string;
  capital?: string[];
  region?: string;
  subregion?: string;
  flag?: string;
  currencies?: Record<string, { name?: string; symbol?: string }>;
  languages?: Record<string, string>;
  area?: number;
  latlng?: number[];
  idd?: { root?: string; suffixes?: string[] };
  tld?: string[];
}
