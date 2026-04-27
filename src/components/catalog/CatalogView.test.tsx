// @vitest-environment happy-dom
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderComponent, screen, fireEvent, act } from '@/test/helpers/component';
import { CatalogView } from './CatalogView';
import type { ApiCatalogItem, Category } from '@/types/api';

// next/dynamic → 동기 컴포넌트로 대체 (ApiDetailModal은 CatalogView 테스트 범위 밖)
vi.mock('next/dynamic', () => ({
  default: (_fn: unknown) => () => null,
}));

function makeApi(id: string, name: string, category: string, description = ''): ApiCatalogItem {
  return {
    id,
    name,
    description: description || `${name} 설명`,
    category,
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
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

const apis: ApiCatalogItem[] = [
  makeApi('api-1', '날씨 API', 'weather', '날씨 정보를 제공합니다'),
  makeApi('api-2', '금융 API', 'finance', '금융 데이터를 제공합니다'),
];

const categories: Category[] = [
  { key: 'weather', label: '날씨', icon: '🌤', count: 1 },
  { key: 'finance', label: '금융', icon: '💰', count: 1 },
];

describe('CatalogView', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('초기에 모든 API가 렌더링된다', () => {
    renderComponent(<CatalogView initialApis={apis} categories={categories} />);
    expect(screen.getByText('날씨 API')).toBeTruthy();
    expect(screen.getByText('금융 API')).toBeTruthy();
  });

  it('카테고리 탭 클릭 시 해당 카테고리만 표시된다', () => {
    renderComponent(<CatalogView initialApis={apis} categories={categories} />);
    fireEvent.click(screen.getByRole('button', { name: '날씨 (1)' }));
    expect(screen.getByText('날씨 API')).toBeTruthy();
    expect(screen.queryByText('금융 API')).toBeNull();
  });

  it('"전체" 탭 클릭 시 모든 API가 다시 표시된다', () => {
    renderComponent(<CatalogView initialApis={apis} categories={categories} />);
    fireEvent.click(screen.getByRole('button', { name: '날씨 (1)' }));
    fireEvent.click(screen.getByRole('button', { name: '전체 (2)' }));
    expect(screen.getByText('날씨 API')).toBeTruthy();
    expect(screen.getByText('금융 API')).toBeTruthy();
  });

  it('검색어 입력 후 300ms 후 일치하는 API만 표시된다', async () => {
    renderComponent(<CatalogView initialApis={apis} categories={categories} />);
    const input = screen.getByPlaceholderText('API 이름, 설명으로 검색...');
    fireEvent.change(input, { target: { value: '날씨' } });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('날씨 API')).toBeTruthy();
    expect(screen.queryByText('금융 API')).toBeNull();
  });

  it('검색어 지우면 모든 API가 다시 표시된다', async () => {
    renderComponent(<CatalogView initialApis={apis} categories={categories} />);
    const input = screen.getByPlaceholderText('API 이름, 설명으로 검색...');
    fireEvent.change(input, { target: { value: '날씨' } });
    await act(async () => { vi.advanceTimersByTime(300); });
    fireEvent.change(input, { target: { value: '' } });
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('날씨 API')).toBeTruthy();
    expect(screen.getByText('금융 API')).toBeTruthy();
  });
});
