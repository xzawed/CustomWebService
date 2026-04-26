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
