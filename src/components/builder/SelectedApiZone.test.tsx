// @vitest-environment happy-dom
import { vi, describe, it, expect } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import SelectedApiZone from './SelectedApiZone';
import type { ApiCatalogItem } from '@/types/api';

function makeApi(id: string, name: string): ApiCatalogItem {
  return {
    id,
    name,
    description: '',
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

describe('SelectedApiZone', () => {
  it('빈 상태에서 안내 문구와 maxCount를 표시한다', () => {
    renderComponent(
      <SelectedApiZone selectedApis={[]} onRemove={vi.fn()} onClear={vi.fn()} maxCount={5} />,
    );
    expect(screen.getByText(/API를 선택하세요/)).toBeTruthy();
    expect(screen.getByText(/최대 5개/)).toBeTruthy();
  });

  it('선택된 API 이름을 모두 표시한다', () => {
    const apis = [makeApi('a', '날씨 API'), makeApi('b', '환율 API')];
    renderComponent(
      <SelectedApiZone selectedApis={apis} onRemove={vi.fn()} onClear={vi.fn()} maxCount={5} />,
    );
    expect(screen.getByText('날씨 API')).toBeTruthy();
    expect(screen.getByText('환율 API')).toBeTruthy();
  });

  it('현재 선택 수와 최대 수를 (n/max) 형태로 표시한다', () => {
    const apis = [makeApi('a', 'A'), makeApi('b', 'B'), makeApi('c', 'C')];
    renderComponent(
      <SelectedApiZone selectedApis={apis} onRemove={vi.fn()} onClear={vi.fn()} maxCount={5} />,
    );
    expect(screen.getByText(/선택된 API \(3\/5\)/)).toBeTruthy();
  });

  it('전체 해제 버튼 클릭 시 onClear가 호출된다', () => {
    const onClear = vi.fn();
    renderComponent(
      <SelectedApiZone
        selectedApis={[makeApi('a', 'A')]}
        onRemove={vi.fn()}
        onClear={onClear}
        maxCount={5}
      />,
    );
    fireEvent.click(screen.getByText('전체 해제'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('각 칩의 X 버튼 클릭 시 onRemove가 해당 id로 호출된다', () => {
    const onRemove = vi.fn();
    const apis = [makeApi('a', 'A'), makeApi('b', 'B')];
    const { container } = renderComponent(
      <SelectedApiZone
        selectedApis={apis}
        onRemove={onRemove}
        onClear={vi.fn()}
        maxCount={5}
      />,
    );
    const removeButtons = container.querySelectorAll('span button');
    expect(removeButtons.length).toBe(2);
    fireEvent.click(removeButtons[0]!);
    expect(onRemove).toHaveBeenCalledWith('a');
    fireEvent.click(removeButtons[1]!);
    expect(onRemove).toHaveBeenCalledWith('b');
  });
});
