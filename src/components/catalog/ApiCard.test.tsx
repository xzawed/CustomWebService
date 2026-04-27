// @vitest-environment happy-dom
import { vi, describe, it, expect } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import { ApiCard } from './ApiCard';
import type { ApiCatalogItem } from '@/types/api';

const baseApi: ApiCatalogItem = {
  id: 'api-1',
  name: '날씨 API',
  description: '실시간 날씨 정보를 제공합니다',
  category: 'weather',
  baseUrl: 'https://api.weather.example.com',
  authType: 'api_key',
  authConfig: {},
  rateLimit: '100',
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

describe('ApiCard', () => {
  it('API 이름과 설명을 렌더링한다', () => {
    renderComponent(
      <ApiCard api={baseApi} isSelected={false} onSelect={vi.fn()} onDetail={vi.fn()} />,
    );
    expect(screen.getByText('날씨 API')).toBeTruthy();
    expect(screen.getByText('실시간 날씨 정보를 제공합니다')).toBeTruthy();
  });

  it('미선택 상태에서 aria-pressed가 false다', () => {
    const { container } = renderComponent(
      <ApiCard api={baseApi} isSelected={false} onSelect={vi.fn()} onDetail={vi.fn()} />,
    );
    expect(container.querySelector('[aria-pressed]')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('선택 상태에서 aria-pressed가 true다', () => {
    const { container } = renderComponent(
      <ApiCard api={baseApi} isSelected={true} onSelect={vi.fn()} onDetail={vi.fn()} />,
    );
    expect(container.querySelector('[aria-pressed]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('카드 클릭 시 onSelect가 호출된다', () => {
    const onSelect = vi.fn();
    const { container } = renderComponent(
      <ApiCard api={baseApi} isSelected={false} onSelect={onSelect} onDetail={vi.fn()} />,
    );
    fireEvent.click(container.querySelector<HTMLElement>('[aria-pressed]')!);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('상세 버튼 클릭 시 onDetail이 호출되고 onSelect는 호출되지 않는다', () => {
    const onSelect = vi.fn();
    const onDetail = vi.fn();
    renderComponent(
      <ApiCard api={baseApi} isSelected={false} onSelect={onSelect} onDetail={onDetail} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '상세 보기' }));
    expect(onDetail).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('authType "api_key" → "API Key" 뱃지 표시', () => {
    renderComponent(
      <ApiCard api={baseApi} isSelected={false} onSelect={vi.fn()} onDetail={vi.fn()} />,
    );
    expect(screen.getByText('API Key')).toBeTruthy();
  });

  it('authType "none" → "키 불필요" 뱃지 표시', () => {
    renderComponent(
      <ApiCard api={{ ...baseApi, authType: 'none' }} isSelected={false} onSelect={vi.fn()} onDetail={vi.fn()} />,
    );
    expect(screen.getByText('키 불필요')).toBeTruthy();
  });

  it('rateLimit이 있을 때 "100/min" 뱃지가 표시된다', () => {
    renderComponent(
      <ApiCard api={baseApi} isSelected={false} onSelect={vi.fn()} onDetail={vi.fn()} />,
    );
    expect(screen.getByText('100/min')).toBeTruthy();
  });

  it('rateLimit이 null일 때 "/min" 뱃지가 없다', () => {
    renderComponent(
      <ApiCard api={{ ...baseApi, rateLimit: null }} isSelected={false} onSelect={vi.fn()} onDetail={vi.fn()} />,
    );
    expect(screen.queryByText(/\/min/)).toBeNull();
  });
});
