// @vitest-environment happy-dom
import { vi, describe, it, expect, afterEach } from 'vitest';
import { renderComponent, screen, fireEvent } from '@/test/helpers/component';
import { ApiDetailModal } from './ApiDetailModal';
import type { ApiCatalogItem } from '@/types/api';

afterEach(() => {
  document.body.style.overflow = '';
});

const api: ApiCatalogItem = {
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
  endpoints: [
    {
      path: '/current',
      method: 'GET',
      description: '현재 날씨 조회',
      params: [],
      responseExample: { temperature: 20 },
    },
  ],
  tags: ['날씨', 'korea'],
  apiVersion: null,
  deprecatedAt: null,
  successorId: null,
  corsSupported: true,
  requiresProxy: false,
  creditRequired: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('ApiDetailModal', () => {
  it('isOpen=false일 때 아무것도 렌더링되지 않는다', () => {
    const { container } = renderComponent(
      <ApiDetailModal api={api} isOpen={false} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('api=null일 때 아무것도 렌더링되지 않는다', () => {
    const { container } = renderComponent(
      <ApiDetailModal api={null} isOpen={true} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('API 이름과 설명이 렌더링된다', () => {
    renderComponent(<ApiDetailModal api={api} isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('날씨 API')).toBeTruthy();
    expect(screen.getByText('실시간 날씨 정보를 제공합니다')).toBeTruthy();
  });

  it('엔드포인트 경로와 설명이 렌더링된다', () => {
    renderComponent(<ApiDetailModal api={api} isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('/current')).toBeTruthy();
    expect(screen.getByText('현재 날씨 조회')).toBeTruthy();
  });

  it('ESC 키로 onClose가 호출된다', () => {
    const onClose = vi.fn();
    renderComponent(<ApiDetailModal api={api} isOpen={true} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop 클릭으로 onClose가 호출된다', () => {
    const onClose = vi.fn();
    renderComponent(<ApiDetailModal api={api} isOpen={true} onClose={onClose} />);
    fireEvent.click(document.querySelector<HTMLElement>('[role="presentation"]')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('isOpen=false 상태에서는 ESC 키로 onClose가 호출되지 않는다', () => {
    const onClose = vi.fn();
    renderComponent(<ApiDetailModal api={api} isOpen={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('required=true 파라미터에는 * 표시가 렌더링된다', () => {
    const apiWithRequiredParam: typeof api = {
      ...api,
      endpoints: [
        {
          path: '/current',
          method: 'GET',
          description: '현재 날씨 조회',
          params: [
            { name: 'city', type: 'string', required: true, description: '도시명' },
            { name: 'units', type: 'string', required: false, description: '단위' },
          ],
          responseExample: {},
        },
      ],
    };
    renderComponent(<ApiDetailModal api={apiWithRequiredParam} isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('city')).toBeTruthy();
    // required=true 파라미터에 * 표시
    expect(screen.getByText('*')).toBeTruthy();
    expect(screen.getByText('units')).toBeTruthy();
  });

  it('onSelect 콜백이 있을 때 "선택하기" 버튼 클릭 시 onSelect와 onClose가 호출된다', () => {
    const onClose = vi.fn();
    const onSelect = vi.fn();
    renderComponent(
      <ApiDetailModal api={api} isOpen={true} onClose={onClose} onSelect={onSelect} isSelected={false} />
    );
    const selectBtn = screen.getByText('선택하기');
    expect(selectBtn).toBeTruthy();
    fireEvent.click(selectBtn);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(api);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('isSelected=true일 때 "선택됨" 버튼이 표시된다', () => {
    renderComponent(
      <ApiDetailModal api={api} isOpen={true} onClose={vi.fn()} onSelect={vi.fn()} isSelected={true} />
    );
    expect(screen.getByText('선택됨')).toBeTruthy();
  });
});
