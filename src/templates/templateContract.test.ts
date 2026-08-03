import { describe, it, expect } from 'vitest';
import { templateRegistry } from './TemplateRegistry';
import type { ICodeTemplate, TemplateOutput } from './ICodeTemplate';
import type { ApiCatalogItem, ApiEndpoint } from '@/types/api';

// ---------------------------------------------------------------------------
// 픽스처 — ApiCatalogItem 실타입에 맞춘 최소 유효 객체
// ---------------------------------------------------------------------------

function makeEndpoint(overrides: Partial<ApiEndpoint> = {}): ApiEndpoint {
  return {
    path: '/data',
    method: 'GET',
    description: 'sample endpoint',
    params: [],
    responseExample: {},
    ...overrides,
  };
}

function makeApi(overrides: Partial<ApiCatalogItem> = {}): ApiCatalogItem {
  return {
    id: 'aaaabbbb-cccc-dddd-eeee-ffffffffffff',
    name: 'Sample API',
    description: '샘플 설명',
    category: 'general',
    baseUrl: 'https://api.example.com',
    authType: 'none',
    authConfig: {},
    rateLimit: null,
    isActive: true,
    iconUrl: null,
    docsUrl: null,
    endpoints: [makeEndpoint()],
    tags: [],
    apiVersion: null,
    deprecatedAt: null,
    successorId: null,
    corsSupported: true,
    requiresProxy: false,
    creditRequired: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/** 템플릿이 선언한 카테고리와 무관한 API (matchScore 낮은 쪽 시나리오) */
function makeUnrelatedApi(): ApiCatalogItem {
  return makeApi({
    id: '11111111-2222-3333-4444-555555555555',
    name: 'Unrelated Space API',
    category: 'zzzz-unrelated-category-xyz',
  });
}

/**
 * supportedApiCategories[0] 을 카테고리로 쓰는 매칭 API.
 * 빈 배열이면 폴백 카테고리 사용.
 */
function makeMatchingApi(template: ICodeTemplate): ApiCatalogItem {
  const category =
    template.supportedApiCategories.length > 0
      ? template.supportedApiCategories[0]
      : 'general';
  return makeApi({
    id: '66666666-7777-8888-9999-aaaaaaaaaaaa',
    name: `${template.id} Matching API`,
    category,
  });
}

/** 키 인증이 필요한 API */
function makeAuthApi(): ApiCatalogItem {
  return makeApi({
    id: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
    name: 'Auth Required API',
    authType: 'api_key',
    authConfig: { header: 'X-Api-Key' },
    requiresProxy: true,
    endpoints: [makeEndpoint({ path: '/secure' })],
  });
}

/** responseDataPath 가 있는 API */
function makeDataPathApi(): ApiCatalogItem {
  return makeApi({
    id: 'cccccccc-dddd-eeee-ffff-000000000000',
    name: 'Data Path API',
    endpoints: [makeEndpoint({ path: '/search', responseDataPath: 'photos.results' })],
  });
}

/**
 * 선택 필드가 없거나 null 인 API.
 * 템플릿이 optional chaining 없이 접근하면 누수/throw 가 난다.
 */
function makeSparseApi(): ApiCatalogItem {
  return makeApi({
    id: 'dddddddd-eeee-ffff-0000-111111111111',
    name: 'Sparse API',
    description: '',
    rateLimit: null,
    iconUrl: null,
    docsUrl: null,
    apiVersion: null,
    deprecatedAt: null,
    successorId: null,
    creditRequired: null,
    cacheTtlSeconds: null,
    verificationStatus: null,
    verifiedAt: null,
    lastVerificationNote: null,
    tags: [],
    endpoints: [
      {
        path: '/sparse',
        method: 'GET',
        description: '',
        params: [],
        responseExample: {},
        // exampleCall · responseDataPath · requestHeaders 의도적 미설정
      },
    ],
  });
}

function collectOutputStrings(output: TemplateOutput): Array<{ field: string; value: string }> {
  return [
    { field: 'html', value: output.html },
    { field: 'css', value: output.css },
    { field: 'js', value: output.js },
    { field: 'promptHint', value: output.promptHint },
  ];
}

/**
 * 누수 플레이스홀더 탐지 (보간 사고 탐지용).
 *
 * 관측 기반 조정 (단언 약화가 아니라 "누수" 의미에 맞춤):
 * - `typeof X !== 'undefined'` / `=== 'undefined'` 는 런타임 가드 — map-service js 에 의도적 존재.
 *   이 패턴을 제거한 뒤에 남는 `undefined` 만 누수로 본다.
 * - 리터럴 `null` 은 거의 모든 템플릿의 js·promptHint 에 의도적으로 있음
 *   (Alpine 상태 `error: null`, `let activeTag = null` 등). 전 필드 금지 시 11종 전부 실패하므로
 *   **html/css 에만** `null` 부분문자열을 금지한다 (보간 누수 시 마크업에 박힘).
 * - 클라이언트 템플릿 리터럴 `${encodeURIComponent(path)}` 등은 dashboard 등에서 의도적 —
 *   닫히지 않은 `${` 와 `${undefined}`/`${null}` 형태만 잡는다.
 */
function findLeaks(field: string, value: string): string[] {
  const leaks: string[] = [];

  // typeof 가드 제거 후 undefined 잔존 여부
  const withoutTypeofGuards = value
    .replace(/typeof\s+[A-Za-z_$][\w$]*\s*!==?\s*['"]undefined['"]/g, '')
    .replace(/typeof\s+[A-Za-z_$][\w$]*\s*===?\s*['"]undefined['"]/g, '');
  if (withoutTypeofGuards.includes('undefined')) {
    leaks.push('undefined');
  }

  if (value.includes('[object Object]')) {
    leaks.push('[object Object]');
  }

  // 깨진/미해결 보간: 닫히지 않음, 또는 값이 undefined|null 로 박힌 형태
  if (/\$\{[^}]*$/.test(value) || /\$\{\s*(undefined|null)\s*\}/.test(value)) {
    leaks.push('unresolved ${');
  }

  // null: html/css 만 (js·promptHint 는 의도적 null 키워드 범람 — 위 주석)
  if ((field === 'html' || field === 'css') && value.includes('null')) {
    leaks.push('null');
  }

  return leaks;
}

// ---------------------------------------------------------------------------
// 계약 스위트 — registry.list() 로 구동 (하드코딩 id 목록 금지)
// ---------------------------------------------------------------------------

describe('템플릿 계약 (ICodeTemplate · 등록된 전체)', () => {
  const templates = templateRegistry.list();

  it('레지스트리에 템플릿이 1개 이상 등록되어 있다', () => {
    expect(templates.length).toBeGreaterThan(0);
  });

  // supportedApiCategories 빈 배열: 현재 11종 모두 비어 있지 않음.
  // 인터페이스상 string[] 이므로 빈 배열은 타입상 허용 — 메타데이터 검사에서는 배열 여부만 단언.

  describe('메타데이터', () => {
    it.each(templates.map((t) => [t.id, t] as const))(
      '"%s" — id/name/description/category 가 비어 있지 않은 문자열이고 supportedApiCategories 는 string[]',
      (_id, template) => {
        expect(typeof template.id).toBe('string');
        expect(template.id.length).toBeGreaterThan(0);

        expect(typeof template.name).toBe('string');
        expect(template.name.length).toBeGreaterThan(0);

        expect(typeof template.description).toBe('string');
        expect(template.description.length).toBeGreaterThan(0);

        expect(typeof template.category).toBe('string');
        expect(template.category.length).toBeGreaterThan(0);

        expect(Array.isArray(template.supportedApiCategories)).toBe(true);
        // 빈 배열 허용 여부: 타입상 허용. 현재 등록분에는 빈 배열 없음(관측).
        for (const cat of template.supportedApiCategories) {
          expect(typeof cat).toBe('string');
        }
      },
    );
  });

  describe('id 유일성 · 조회 일관성', () => {
    it('list() 길이와 등록 id 집합 크기가 같고, get(id) 가 동일 인스턴스를 반환한다', () => {
      const ids = templates.map((t) => t.id);
      const unique = new Set(ids);

      // Map 키 중복 시 조용히 덮어써 list 길이가 줄어들거나 id 가 사라짐
      expect(unique.size).toBe(templates.length);

      for (const template of templates) {
        const fetched = templateRegistry.get(template.id);
        expect(fetched).toBe(template);
      }
    });
  });

  describe('matchScore 범위 (0..1 · 유한 · non-NaN)', () => {
    /**
     * 관측: 현재 11종 모두 `apis.length > 0 ? matching/total : 0` 패턴이라
     * 빈 배열이면 0. 보편 불변으로 단언하지 않고 0..1 범위만 강제한다.
     */
    it.each(templates.map((t) => [t.id, t] as const))(
      '"%s" — 빈 배열 / 무관 카테고리 / 지원 카테고리 모두 0..1 유한 수',
      (_id, template) => {
        const emptyScore = template.matchScore([]);
        const unrelatedScore = template.matchScore([makeUnrelatedApi()]);
        const matchingScore = template.matchScore([makeMatchingApi(template)]);

        for (const [label, score] of [
          ['empty', emptyScore],
          ['unrelated', unrelatedScore],
          ['matching', matchingScore],
        ] as const) {
          expect(Number.isFinite(score), `${label} score 는 유한해야 함 (got ${String(score)})`).toBe(
            true,
          );
          expect(Number.isNaN(score), `${label} score 는 NaN 이 아니어야 함`).toBe(false);
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(1);
        }
      },
    );
  });

  describe('generate 견고성 · 출력 형태 · 누수 부재', () => {
    type GenerateCase = {
      label: string;
      apis: ApiCatalogItem[];
    };

    function buildCases(template: ICodeTemplate): GenerateCase[] {
      return [
        { label: 'API 없음', apis: [] },
        { label: 'authType none', apis: [makeApi()] },
        { label: '키 인증 필요', apis: [makeAuthApi()] },
        { label: 'responseDataPath 설정', apis: [makeDataPathApi()] },
        // 라벨에 "null"/"undefined" 금지 — userContext 로 html 에 들어가 누수 검사 오탐
        { label: '선택 필드 부재', apis: [makeSparseApi()] },
        // 매칭 카테고리 API 한 건 — generate 가 카테고리에 의존해도 통과
        { label: '지원 카테고리 API', apis: [makeMatchingApi(template)] },
      ];
    }

    it.each(templates.map((t) => [t.id, t] as const))(
      '"%s" — 모든 컨텍스트에서 throw 하지 않고 출력 형태·누수 계약을 만족한다',
      (_id, template) => {
        for (const { label, apis } of buildCases(template)) {
          let output: TemplateOutput | undefined;
          expect(() => {
            output = template.generate({
              apis,
              userContext: `계약 테스트 · ${template.id} · ${label}`,
              templateId: template.id,
            });
          }, `generate 가 throw 함 (${label})`).not.toThrow();

          expect(output, `generate 결과가 정의되어야 함 (${label})`).toBeDefined();
          if (output === undefined) {
            return;
          }

          expect(typeof output.html, `html 타입 (${label})`).toBe('string');
          expect(typeof output.css, `css 타입 (${label})`).toBe('string');
          expect(typeof output.js, `js 타입 (${label})`).toBe('string');
          expect(typeof output.promptHint, `promptHint 타입 (${label})`).toBe('string');
          expect(output.promptHint.length, `promptHint 비어 있지 않음 (${label})`).toBeGreaterThan(
            0,
          );

          for (const { field, value } of collectOutputStrings(output)) {
            const leaks = findLeaks(field, value);
            expect(
              leaks,
              `${field} 에 누수 플레이스홀더 발견 (${label}): ${leaks.join(', ')}`,
            ).toEqual([]);
          }
        }
      },
    );
  });
});
