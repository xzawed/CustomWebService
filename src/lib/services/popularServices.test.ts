import { describe, it, expect } from 'vitest';
import {
  CURATED_SERVICES,
  pickTopIds,
  computePopularServices,
  resolveCuratedServices,
} from './popularServices';

describe('CURATED_SERVICES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(CURATED_SERVICES)).toBe(true);
    expect(CURATED_SERVICES.length).toBeGreaterThan(0);
  });

  it('every item has required fields', () => {
    for (const item of CURATED_SERVICES) {
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('title');
      expect(item).toHaveProperty('description');
      expect(item).toHaveProperty('context');
      expect(item).toHaveProperty('apiNames');
      expect(item).toHaveProperty('category');
    }
  });
});

describe('pickTopIds', () => {
  it('returns [] for empty usage rows', () => {
    expect(pickTopIds([], 5)).toEqual([]);
  });

  it('returns the most frequent id when topN is 1', () => {
    const rows = [
      { apiId: 'a', context: '' },
      { apiId: 'b', context: '' },
      { apiId: 'a', context: '' },
    ];
    expect(pickTopIds(rows, 1)).toEqual(['a']);
  });

  it('returns top 2 ids sorted by frequency descending', () => {
    const rows = [
      { apiId: 'a', context: '' },
      { apiId: 'b', context: '' },
      { apiId: 'a', context: '' },
    ];
    expect(pickTopIds(rows, 2)).toEqual(['a', 'b']);
  });
});

describe('computePopularServices', () => {
  it('returns [] for empty inputs', () => {
    expect(computePopularServices([], [])).toEqual([]);
  });

  it('returns one service with correct shape for a single usage row', () => {
    const rows = [{ apiId: 'api1', context: 'ctx' }];
    const details = [{ id: 'api1', name: 'Test API', description: 'desc', category: 'cat' }];
    const result = computePopularServices(rows, details);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('popular-api1');
    expect(result[0].title).toBe('Test API 활용 서비스');
    expect(result[0].usageCount).toBe(1);
  });

  it('filters out APIs that have no usage rows', () => {
    const rows = [{ apiId: 'api1', context: 'ctx' }];
    const details = [
      { id: 'api1', name: 'Test API', description: 'desc', category: 'cat' },
      { id: 'api2', name: 'Other API', description: null, category: null },
    ];
    const result = computePopularServices(rows, details);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('popular-api1');
  });
});

describe('resolveCuratedServices', () => {
  it('returns an array with same length as CURATED_SERVICES', () => {
    const result = resolveCuratedServices(new Map());
    expect(result).toHaveLength(CURATED_SERVICES.length);
  });

  it('returns apiIds: [] when name map is empty', () => {
    const result = resolveCuratedServices(new Map());
    for (const service of result) {
      expect(service.apiIds).toEqual([]);
    }
  });

  it('resolves OpenWeatherMap id when provided in the name map', () => {
    const nameToIdMap = new Map([['openweathermap', 'api-owm']]);
    const result = resolveCuratedServices(nameToIdMap);
    const weatherItem = result.find((s) =>
      CURATED_SERVICES.find(
        (c) => c.id === s.id && c.apiNames.some((n) => n.toLowerCase() === 'openweathermap')
      )
    );
    expect(weatherItem).toBeDefined();
    expect(weatherItem!.apiIds).toContain('api-owm');
  });
});

/**
 * `/api/v1/popular-services` 라우트에는 **현재 도달 불가능한 방어 분기가 둘** 있다.
 * 그 자체는 문제가 아니지만, "왜 도달 불가인가"가 이 헬퍼들의 성질에 달려 있어서
 * 여기서 고정하지 않으면 규칙이 바뀌어도 아무도 모른 채 가드만 남는다.
 *
 * 아래 테스트가 깨지면 **라우트의 해당 가드가 살아난다는 뜻**이므로,
 * 그때는 라우트 쪽 동작을 실제 입력으로 다시 검증해야 한다.
 */
describe('라우트 가드를 무력화하는 불변조건 (깨지면 라우트를 재검토할 것)', () => {
  it('computePopularServices 의 id 와 curated id 는 네임스페이스가 서로소다', () => {
    const usageRows = [
      { apiId: 'api-a', context: 'ctx' },
      { apiId: 'api-b', context: 'ctx' },
    ];
    const details = [
      { id: 'api-a', name: 'A', description: null, category: null },
      { id: 'api-b', name: 'B', description: null, category: null },
    ];

    const popular = computePopularServices(usageRows, details);
    expect(popular.length).toBeGreaterThan(0);
    expect(popular.every((s) => s.id.startsWith('popular-'))).toBe(true);
    expect(CURATED_SERVICES.every((c) => c.id.startsWith('curated-'))).toBe(true);

    // 두 집합이 겹치지 않으므로 라우트의 existingIds 중복 스킵 가드는 절대 발동하지 않는다.
    const curatedIds = new Set(CURATED_SERVICES.map((c) => c.id));
    expect(popular.some((s) => curatedIds.has(s.id))).toBe(false);
  });

  it('pickTopIds 는 비어 있지 않은 입력에 대해 절대 빈 배열을 반환하지 않는다', () => {
    // 라우트의 `topIds.length > 0` 가드가 항상 참인 이유다.
    expect(pickTopIds([{ apiId: 'only', context: 'c' }], 5)).toHaveLength(1);
    expect(
      pickTopIds(
        [
          { apiId: 'x', context: 'c' },
          { apiId: 'x', context: 'c' },
        ],
        5
      ).length
    ).toBeGreaterThanOrEqual(1);
  });
});
