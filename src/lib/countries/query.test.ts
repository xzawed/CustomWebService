import { describe, it, expect } from 'vitest';
import { filterCountries, findCountryByCode } from './query';
import type { Country } from './types';

function make(partial: Partial<Country> & Pick<Country, 'cca2' | 'cca3'>): Country {
  return {
    name: { common: partial.cca3, official: partial.cca3, ko: null },
    ccn3: null,
    capital: null,
    region: 'Asia',
    subregion: null,
    flag: '',
    flagSvg: null,
    currencies: {},
    languages: {},
    area: null,
    latlng: [],
    callingCode: null,
    tld: null,
    ...partial,
  };
}

const COUNTRIES: Country[] = [
  make({ cca2: 'KR', cca3: 'KOR', name: { common: 'South Korea', official: 'Republic of Korea', ko: '한국' }, region: 'Asia', subregion: 'Eastern Asia' }),
  make({ cca2: 'JP', cca3: 'JPN', name: { common: 'Japan', official: 'Japan', ko: '일본' }, region: 'Asia', subregion: 'Eastern Asia' }),
  make({ cca2: 'FR', cca3: 'FRA', name: { common: 'France', official: 'French Republic', ko: '프랑스' }, region: 'Europe', subregion: 'Western Europe' }),
];

describe('filterCountries', () => {
  it('필터 없으면 전체 반환', () => {
    expect(filterCountries(COUNTRIES, {})).toHaveLength(3);
  });

  it('region으로 필터(대소문자 무시)', () => {
    expect(filterCountries(COUNTRIES, { region: 'asia' }).map((c) => c.cca2)).toEqual(['KR', 'JP']);
  });

  it('subregion도 region 필터에 매칭', () => {
    expect(filterCountries(COUNTRIES, { region: 'Western Europe' }).map((c) => c.cca2)).toEqual(['FR']);
  });

  it('search로 common 이름 substring 검색', () => {
    expect(filterCountries(COUNTRIES, { search: 'kor' }).map((c) => c.cca2)).toEqual(['KR']);
  });

  it('search로 한국어 이름 검색', () => {
    expect(filterCountries(COUNTRIES, { search: '일본' }).map((c) => c.cca2)).toEqual(['JP']);
  });

  it('search로 코드 정확 일치 검색', () => {
    expect(filterCountries(COUNTRIES, { search: 'fra' }).map((c) => c.cca2)).toEqual(['FR']);
  });

  it('region+search 동시 적용', () => {
    expect(filterCountries(COUNTRIES, { region: 'asia', search: 'japan' }).map((c) => c.cca2)).toEqual(['JP']);
  });
});

describe('findCountryByCode', () => {
  it('cca2로 조회(대소문자 무시)', () => {
    expect(findCountryByCode(COUNTRIES, 'kr')?.cca3).toBe('KOR');
  });

  it('cca3로 조회', () => {
    expect(findCountryByCode(COUNTRIES, 'JPN')?.cca2).toBe('JP');
  });

  it('미존재 코드는 null', () => {
    expect(findCountryByCode(COUNTRIES, 'XX')).toBeNull();
  });

  it('빈 코드는 null', () => {
    expect(findCountryByCode(COUNTRIES, '  ')).toBeNull();
  });
});
