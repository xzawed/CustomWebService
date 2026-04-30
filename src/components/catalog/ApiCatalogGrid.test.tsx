// @vitest-environment happy-dom
import { vi, describe, it, expect } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import { ApiCatalogGrid } from './ApiCatalogGrid';
import type { ApiCatalogItem } from '@/types/api';

function makeApi(id: string, name: string): ApiCatalogItem {
  return {
    id,
    name,
    description: `${name} 설명`,
    category: 'general',
    baseUrl: 'https://api.example.com',
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

describe('ApiCatalogGrid', () => {
  it('빈 결과일 때 empty state 메시지를 표시한다', () => {
    renderComponent(
      <ApiCatalogGrid apis={[]} selectedIds={[]} onSelect={vi.fn()} onDetail={vi.fn()} />,
    );
    expect(screen.getByText('검색 결과가 없습니다')).toBeTruthy();
    expect(screen.getByText('다른 키워드로 검색해보세요')).toBeTruthy();
  });

  it('API 목록을 ApiCard로 모두 렌더링한다', () => {
    const apis = [makeApi('a', '날씨 API'), makeApi('b', '환율 API'), makeApi('c', '뉴스 API')];
    renderComponent(
      <ApiCatalogGrid apis={apis} selectedIds={[]} onSelect={vi.fn()} onDetail={vi.fn()} />,
    );
    expect(screen.getByText('날씨 API')).toBeTruthy();
    expect(screen.getByText('환율 API')).toBeTruthy();
    expect(screen.getByText('뉴스 API')).toBeTruthy();
  });

  it('selectedIds에 포함된 카드는 aria-pressed=true다', () => {
    const apis = [makeApi('a', 'A'), makeApi('b', 'B')];
    const { container } = renderComponent(
      <ApiCatalogGrid apis={apis} selectedIds={['a']} onSelect={vi.fn()} onDetail={vi.fn()} />,
    );
    const pressed = container.querySelectorAll('[aria-pressed="true"]');
    const unpressed = container.querySelectorAll('[aria-pressed="false"]');
    expect(pressed.length).toBe(1);
    expect(unpressed.length).toBe(1);
  });

  it('카드 클릭 시 onSelect가 해당 API로 호출된다', () => {
    const onSelect = vi.fn();
    const apis = [makeApi('a', '날씨 API')];
    renderComponent(
      <ApiCatalogGrid apis={apis} selectedIds={[]} onSelect={onSelect} onDetail={vi.fn()} />,
    );
    fireEvent.click(screen.getByText('날씨 API'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(apis[0]);
  });

  it('빈 배열일 때 그리드 컨테이너를 렌더링하지 않는다', () => {
    const { container } = renderComponent(
      <ApiCatalogGrid apis={[]} selectedIds={[]} onSelect={vi.fn()} onDetail={vi.fn()} />,
    );
    expect(container.querySelector('.grid')).toBeNull();
  });
});
