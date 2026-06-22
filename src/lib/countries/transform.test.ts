import { describe, it, expect } from 'vitest';
import { toCuratedCountry, toCuratedCountries } from './transform';
import type { RawCountry } from './types';

const KR: RawCountry = {
  name: { common: 'South Korea', official: 'Republic of Korea' },
  translations: { kor: { common: '한국' } },
  cca2: 'KR',
  cca3: 'KOR',
  ccn3: '410',
  capital: ['Seoul'],
  region: 'Asia',
  subregion: 'Eastern Asia',
  flag: '🇰🇷',
  currencies: { KRW: { name: 'South Korean won', symbol: '₩' } },
  languages: { kor: 'Korean' },
  area: 100210,
  latlng: [37, 127.5],
  idd: { root: '+8', suffixes: ['2'] },
  tld: ['.kr'],
};

describe('toCuratedCountry', () => {
  it('mledoze 원본을 큐레이티드 스키마로 변환한다', () => {
    const c = toCuratedCountry(KR);
    expect(c.name).toEqual({ common: 'South Korea', official: 'Republic of Korea', ko: '한국' });
    expect(c.cca2).toBe('KR');
    expect(c.cca3).toBe('KOR');
    expect(c.ccn3).toBe('410');
    expect(c.capital).toBe('Seoul');
    expect(c.region).toBe('Asia');
    expect(c.subregion).toBe('Eastern Asia');
    expect(c.flag).toBe('🇰🇷');
    expect(c.flagSvg).toBe('https://flagcdn.com/kr.svg');
    expect(c.currencies).toEqual({ KRW: { name: 'South Korean won', symbol: '₩' } });
    expect(c.languages).toEqual({ kor: 'Korean' });
    expect(c.area).toBe(100210);
    expect(c.latlng).toEqual([37, 127.5]);
    expect(c.callingCode).toBe('+82');
    expect(c.tld).toBe('.kr');
  });

  it('한국어 번역이 없으면 name.ko는 null', () => {
    const c = toCuratedCountry({ ...KR, translations: undefined });
    expect(c.name.ko).toBeNull();
  });

  it('capital이 비어있으면 null', () => {
    expect(toCuratedCountry({ ...KR, capital: [] }).capital).toBeNull();
    expect(toCuratedCountry({ ...KR, capital: undefined }).capital).toBeNull();
  });

  it('idd suffix가 여러 개면 root만 사용한다', () => {
    const c = toCuratedCountry({ ...KR, idd: { root: '+1', suffixes: ['201', '202'] } });
    expect(c.callingCode).toBe('+1');
  });

  it('idd가 없으면 callingCode는 null', () => {
    expect(toCuratedCountry({ ...KR, idd: undefined }).callingCode).toBeNull();
  });

  it('currency symbol이 없으면 null로 보존한다', () => {
    const c = toCuratedCountry({ ...KR, currencies: { XYZ: { name: 'No Symbol Coin' } } });
    expect(c.currencies.XYZ).toEqual({ name: 'No Symbol Coin', symbol: null });
  });

  it('area가 숫자가 아니면 null', () => {
    expect(toCuratedCountry({ ...KR, area: undefined }).area).toBeNull();
  });
});

describe('toCuratedCountries', () => {
  it('cca2/cca3가 없는 항목을 제외하고 common 이름순 정렬한다', () => {
    const raws: RawCountry[] = [
      { ...KR, name: { common: 'Zedland', official: 'Z' }, cca2: 'ZD', cca3: 'ZED' },
      { ...KR, name: { common: 'Alphaland', official: 'A' }, cca2: 'AL', cca3: 'ALP' },
      { name: { common: 'NoCode', official: 'N' } }, // cca2/cca3 없음 → 제외
    ];
    const result = toCuratedCountries(raws);
    expect(result.map((c) => c.name.common)).toEqual(['Alphaland', 'Zedland']);
  });
});
