import { describe, it, expect } from 'vitest';
import { GET as listGET, OPTIONS as listOPTIONS } from '@/app/api/v1/countries/route';
import { GET as codeGET, OPTIONS as codeOPTIONS } from '@/app/api/v1/countries/[code]/route';

function listReq(query = '') {
  return new Request(`http://localhost/api/v1/countries${query}`);
}

describe('GET /api/v1/countries', () => {
  it('전체 국가 목록을 배열로 반환한다', async () => {
    const res = listGET(listReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(200);
    const kr = body.find((c: { cca2: string }) => c.cca2 === 'KR');
    expect(kr.name.ko).toBe('한국');
    expect(kr.flagSvg).toBe('https://flagcdn.com/kr.svg');
  });

  it('CORS + 캐시 헤더를 포함한다', () => {
    const res = listGET(listReq());
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Cache-Control')).toContain('max-age=');
  });

  it('?region= 으로 필터한다(대소문자 무시)', async () => {
    const res = listGET(listReq('?region=asia'));
    const body = await res.json();
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((c: { region: string }) => c.region === 'Asia')).toBe(true);
  });

  it('?search= 로 이름 검색한다', async () => {
    const res = listGET(listReq('?search=South Korea'));
    const body = await res.json();
    expect(body.some((c: { cca2: string }) => c.cca2 === 'KR')).toBe(true);
  });

  it('OPTIONS는 204 + CORS 헤더', () => {
    const res = listOPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('GET /api/v1/countries/[code]', () => {
  it('cca2 코드로 단건 조회', async () => {
    const res = await codeGET(new Request('http://localhost/api/v1/countries/KR'), {
      params: Promise.resolve({ code: 'KR' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cca3).toBe('KOR');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('소문자 cca3 코드로 조회(대소문자 무시)', async () => {
    const res = await codeGET(new Request('http://localhost/api/v1/countries/kor'), {
      params: Promise.resolve({ code: 'kor' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cca2).toBe('KR');
  });

  it('미존재 코드는 404', async () => {
    const res = await codeGET(new Request('http://localhost/api/v1/countries/ZZ'), {
      params: Promise.resolve({ code: 'ZZ' }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('ZZ');
  });

  it('OPTIONS는 204 + CORS 헤더', () => {
    const res = codeOPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });
});
