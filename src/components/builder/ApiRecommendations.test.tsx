// @vitest-environment happy-dom
import { vi, describe, it, expect } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import ApiRecommendations, { type ApiRecommendation } from './ApiRecommendations';
import type { ApiCatalogItem } from '@/types/api';

function makeApi(id: string, name: string): ApiCatalogItem {
  return {
    id,
    name,
    description: `${name} 설명`,
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
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

const recommendations: ApiRecommendation[] = [
  { api: makeApi('api-1', '날씨 API'), reason: '날씨 정보가 핵심 기능입니다' },
  { api: makeApi('api-2', '금융 API'), reason: '환율 정보가 필요합니다' },
];

describe('ApiRecommendations', () => {
  it('isLoading=true일 때 로딩 메시지가 표시된다', () => {
    renderComponent(
      <ApiRecommendations
        recommendations={[]}
        isLoading={true}
        selectedIds={[]}
        onSelect={vi.fn()}
        onDeselect={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText('AI가 서비스에 적합한 API를 찾고 있습니다...')).toBeTruthy();
  });

  it('hasError=true일 때 에러 메시지와 재시도 버튼이 표시된다', () => {
    renderComponent(
      <ApiRecommendations
        recommendations={[]}
        isLoading={false}
        hasError={true}
        selectedIds={[]}
        onSelect={vi.fn()}
        onDeselect={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText('API 추천에 실패했습니다. 아래에서 직접 API를 추가해주세요.')).toBeTruthy();
    expect(screen.getByRole('button', { name: '재시도' })).toBeTruthy();
  });

  it('재시도 버튼 클릭 시 onRefresh가 호출된다', () => {
    const onRefresh = vi.fn();
    renderComponent(
      <ApiRecommendations
        recommendations={[]}
        isLoading={false}
        hasError={true}
        selectedIds={[]}
        onSelect={vi.fn()}
        onDeselect={vi.fn()}
        onRefresh={onRefresh}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '재시도' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('recommendations=[] (non-error)일 때 빈 상태 메시지가 표시된다', () => {
    renderComponent(
      <ApiRecommendations
        recommendations={[]}
        isLoading={false}
        selectedIds={[]}
        onSelect={vi.fn()}
        onDeselect={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText('적합한 API를 찾지 못했습니다. 아래에서 직접 추가하거나 서비스 설명을 수정해보세요.')).toBeTruthy();
  });

  it('추천 API 이름이 렌더링된다', () => {
    renderComponent(
      <ApiRecommendations
        recommendations={recommendations}
        isLoading={false}
        selectedIds={[]}
        onSelect={vi.fn()}
        onDeselect={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText('날씨 API')).toBeTruthy();
    expect(screen.getByText('금융 API')).toBeTruthy();
  });

  it('추천 이유가 렌더링된다', () => {
    renderComponent(
      <ApiRecommendations
        recommendations={recommendations}
        isLoading={false}
        selectedIds={[]}
        onSelect={vi.fn()}
        onDeselect={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText('날씨 정보가 핵심 기능입니다')).toBeTruthy();
  });

  it('미선택 API의 + 버튼 클릭 시 onSelect가 호출된다', () => {
    const onSelect = vi.fn();
    renderComponent(
      <ApiRecommendations
        recommendations={recommendations}
        isLoading={false}
        selectedIds={[]}
        onSelect={onSelect}
        onDeselect={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    // "다시 추천" 텍스트를 가진 버튼 제외, 나머지(+ 아이콘만 있는) 버튼들
    const iconOnlyButtons = screen.getAllByRole('button').filter(
      (b) => b.textContent?.trim() === '',
    );
    fireEvent.click(iconOnlyButtons[0]); // api-1의 토글 버튼
    expect(onSelect).toHaveBeenCalledWith(recommendations[0].api);
  });

  it('선택된 API의 버튼 클릭 시 onDeselect가 api.id와 함께 호출된다', () => {
    const onDeselect = vi.fn();
    renderComponent(
      <ApiRecommendations
        recommendations={recommendations}
        isLoading={false}
        selectedIds={['api-1']}
        onSelect={vi.fn()}
        onDeselect={onDeselect}
        onRefresh={vi.fn()}
      />,
    );
    const iconOnlyButtons = screen.getAllByRole('button').filter(
      (b) => b.textContent?.trim() === '',
    );
    fireEvent.click(iconOnlyButtons[0]); // api-1 (selected) → onDeselect
    expect(onDeselect).toHaveBeenCalledWith('api-1');
  });
});
