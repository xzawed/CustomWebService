import { describe, it, expect, beforeEach } from 'vitest';
import type { ApiCatalogItem } from '@/types/api';
import { LIMITS } from '@/lib/config/features';
import { useApiSelectionStore } from './apiSelectionStore';

function makeApi(id: string): ApiCatalogItem {
  return {
    id,
    name: `API ${id}`,
    description: 'desc',
    category: 'utility',
    baseUrl: 'https://example.com',
    authType: 'none',
    authConfig: {},
    rateLimit: null,
    isActive: true,
    iconUrl: null,
    docsUrl: null,
    endpoints: [],
    tags: [],
    apiVersion: null,
    deprecatedAt: null,
    successorId: null,
    corsSupported: true,
    requiresProxy: false,
    creditRequired: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('useApiSelectionStore', () => {
  beforeEach(() => {
    // replace=true 금지 — 액션 함수가 덮어써져 사라진다
    useApiSelectionStore.setState({
      selectedApis: [],
      searchQuery: '',
      activeCategory: 'all',
    });
  });

  it('한도까지 API를 추가할 수 있다', () => {
    const store = useApiSelectionStore.getState();
    for (let i = 0; i < LIMITS.maxApisPerProject; i++) {
      store.addApi(makeApi(`api-${i}`));
    }

    expect(useApiSelectionStore.getState().selectedApis).toHaveLength(LIMITS.maxApisPerProject);
    expect(useApiSelectionStore.getState().canAddMore()).toBe(false);
  });

  it('한도 초과 추가는 무시되고 길이가 변하지 않는다', () => {
    const store = useApiSelectionStore.getState();
    for (let i = 0; i < LIMITS.maxApisPerProject; i++) {
      store.addApi(makeApi(`api-${i}`));
    }
    const lengthAtLimit = useApiSelectionStore.getState().selectedApis.length;

    store.addApi(makeApi('api-overflow'));

    expect(useApiSelectionStore.getState().selectedApis).toHaveLength(lengthAtLimit);
    expect(useApiSelectionStore.getState().selectedApis.some((a) => a.id === 'api-overflow')).toBe(
      false,
    );
  });

  it('중복 id 추가는 무시된다', () => {
    const store = useApiSelectionStore.getState();
    const api = makeApi('dup-1');
    store.addApi(api);
    store.addApi({ ...api, name: '다른 이름' });

    expect(useApiSelectionStore.getState().selectedApis).toHaveLength(1);
    expect(useApiSelectionStore.getState().selectedApis[0]?.name).toBe('API dup-1');
  });

  it('removeApi는 해당 id만 제거한다', () => {
    const store = useApiSelectionStore.getState();
    store.addApi(makeApi('a'));
    store.addApi(makeApi('b'));
    store.addApi(makeApi('c'));

    store.removeApi('b');

    const ids = useApiSelectionStore.getState().selectedApis.map((a) => a.id);
    expect(ids).toEqual(['a', 'c']);
  });

  it('clearApis는 선택 목록을 비운다', () => {
    const store = useApiSelectionStore.getState();
    store.addApi(makeApi('a'));
    store.addApi(makeApi('b'));

    store.clearApis();

    expect(useApiSelectionStore.getState().selectedApis).toEqual([]);
  });

  it('canAddMore는 한도 직전 true, 한도에서 false', () => {
    const store = useApiSelectionStore.getState();
    expect(store.canAddMore()).toBe(true);

    for (let i = 0; i < LIMITS.maxApisPerProject - 1; i++) {
      store.addApi(makeApi(`api-${i}`));
    }
    expect(useApiSelectionStore.getState().canAddMore()).toBe(true);

    store.addApi(makeApi(`api-${LIMITS.maxApisPerProject - 1}`));
    expect(useApiSelectionStore.getState().canAddMore()).toBe(false);
  });

  it('isSelected·검색어·카테고리 세터를 지원한다', () => {
    const store = useApiSelectionStore.getState();
    store.addApi(makeApi('sel'));
    expect(useApiSelectionStore.getState().isSelected('sel')).toBe(true);
    expect(useApiSelectionStore.getState().isSelected('other')).toBe(false);

    store.setSearchQuery('날씨');
    store.setActiveCategory('weather');

    const state = useApiSelectionStore.getState();
    expect(state.searchQuery).toBe('날씨');
    expect(state.activeCategory).toBe('weather');
  });
});
