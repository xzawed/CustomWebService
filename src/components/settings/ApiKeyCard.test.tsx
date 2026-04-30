// @vitest-environment happy-dom
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { renderComponent, screen, fireEvent, waitFor } from '@/test/helpers/component';
import type { ApiCatalogItem } from '@/types/api';

vi.mock('@/lib/apiKeyGuides', () => ({
  getApiKeyGuide: () => ({ title: 'Mock Guide', steps: ['step1'], notes: [] }),
  getDefaultGuide: () => ({ title: 'Default Guide', steps: [], notes: [] }),
}));

vi.mock('./ApiKeyGuideModal', () => ({
  ApiKeyGuideModal: ({ apiName, onClose }: { apiName: string; onClose: () => void }) => (
    <div data-testid="guide-modal">
      Guide for {apiName}
      <button onClick={onClose}>close-modal</button>
    </div>
  ),
}));

import { ApiKeyCard } from './ApiKeyCard';

const baseApi: ApiCatalogItem = {
  id: 'api-1',
  name: '날씨 API',
  description: '실시간 날씨 정보',
  category: 'weather',
  baseUrl: 'https://api.weather.example.com',
  authType: 'api_key',
  authConfig: {},
  rateLimit: null,
  isActive: true,
  iconUrl: null,
  docsUrl: 'https://docs.example.com',
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

describe('ApiKeyCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('키 미등록 상태', () => {
    it('API 이름·설명·입력 폼을 노출하고 "등록됨" 배지는 숨긴다', () => {
      renderComponent(
        <ApiKeyCard api={baseApi} savedKey={undefined} onSave={vi.fn()} onDelete={vi.fn()} />,
      );
      expect(screen.getByText('날씨 API')).toBeTruthy();
      expect(screen.getByText('실시간 날씨 정보')).toBeTruthy();
      expect(screen.getByPlaceholderText('API 키를 여기에 붙여넣으세요')).toBeTruthy();
      expect(screen.queryByText('등록됨')).toBeNull();
    });

    it('빈 입력 상태로 저장 시 에러 메시지 표시 + onSave 미호출', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderComponent(
        <ApiKeyCard api={baseApi} savedKey={undefined} onSave={onSave} onDelete={vi.fn()} />,
      );
      fireEvent.click(screen.getByText('저장하기'));
      await waitFor(() => {
        expect(screen.getByText('키를 입력해 주세요.')).toBeTruthy();
      });
      expect(onSave).not.toHaveBeenCalled();
    });

    it('키 입력 + 저장 클릭 시 onSave가 trim된 값으로 호출된다', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderComponent(
        <ApiKeyCard api={baseApi} savedKey={undefined} onSave={onSave} onDelete={vi.fn()} />,
      );
      const input = screen.getByPlaceholderText('API 키를 여기에 붙여넣으세요') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '  my-secret-key  ' } });
      fireEvent.click(screen.getByText('저장하기'));
      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith('api-1', 'my-secret-key');
      });
    });

    it('input에서 Enter 키 입력 시 저장이 트리거된다', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      renderComponent(
        <ApiKeyCard api={baseApi} savedKey={undefined} onSave={onSave} onDelete={vi.fn()} />,
      );
      const input = screen.getByPlaceholderText('API 키를 여기에 붙여넣으세요');
      fireEvent.change(input, { target: { value: 'sk-1234' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith('api-1', 'sk-1234');
      });
    });

    it('onSave가 reject되면 실패 메시지를 표시한다', async () => {
      const onSave = vi.fn().mockRejectedValue(new Error('boom'));
      renderComponent(
        <ApiKeyCard api={baseApi} savedKey={undefined} onSave={onSave} onDelete={vi.fn()} />,
      );
      fireEvent.change(
        screen.getByPlaceholderText('API 키를 여기에 붙여넣으세요'),
        { target: { value: 'k' } },
      );
      fireEvent.click(screen.getByText('저장하기'));
      await waitFor(() => {
        expect(screen.getByText('저장에 실패했습니다. 다시 시도해 주세요.')).toBeTruthy();
      });
    });
  });

  describe('키 등록 상태', () => {
    const savedKey = { apiId: 'api-1', maskedKey: 'sk-****-1234', isVerified: true };

    it('"등록됨" 배지와 maskedKey를 표시한다', () => {
      renderComponent(
        <ApiKeyCard api={baseApi} savedKey={savedKey} onSave={vi.fn()} onDelete={vi.fn()} />,
      );
      expect(screen.getByText('등록됨')).toBeTruthy();
      expect(screen.getByText('sk-****-1234')).toBeTruthy();
    });

    it('"변경" 클릭 시 입력 폼이 노출된다', () => {
      renderComponent(
        <ApiKeyCard api={baseApi} savedKey={savedKey} onSave={vi.fn()} onDelete={vi.fn()} />,
      );
      expect(screen.queryByPlaceholderText('API 키를 여기에 붙여넣으세요')).toBeNull();
      fireEvent.click(screen.getByText('변경'));
      expect(screen.getByPlaceholderText('API 키를 여기에 붙여넣으세요')).toBeTruthy();
      expect(screen.getByText('취소')).toBeTruthy();
    });

    it('"취소" 클릭 시 입력 폼이 닫힌다', () => {
      renderComponent(
        <ApiKeyCard api={baseApi} savedKey={savedKey} onSave={vi.fn()} onDelete={vi.fn()} />,
      );
      fireEvent.click(screen.getByText('변경'));
      fireEvent.click(screen.getByText('취소'));
      expect(screen.queryByPlaceholderText('API 키를 여기에 붙여넣으세요')).toBeNull();
    });

    it('삭제 확인 거부 시 onDelete 미호출', () => {
      const confirmFn = vi.fn().mockReturnValue(false);
      vi.stubGlobal('confirm', confirmFn);
      const onDelete = vi.fn().mockResolvedValue(undefined);
      renderComponent(
        <ApiKeyCard api={baseApi} savedKey={savedKey} onSave={vi.fn()} onDelete={onDelete} />,
      );
      fireEvent.click(screen.getByLabelText('키 삭제'));
      expect(confirmFn).toHaveBeenCalled();
      expect(onDelete).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('삭제 확인 수락 시 onDelete가 apiId로 호출된다', async () => {
      vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
      const onDelete = vi.fn().mockResolvedValue(undefined);
      renderComponent(
        <ApiKeyCard api={baseApi} savedKey={savedKey} onSave={vi.fn()} onDelete={onDelete} />,
      );
      fireEvent.click(screen.getByLabelText('키 삭제'));
      await waitFor(() => {
        expect(onDelete).toHaveBeenCalledWith('api-1');
      });
      vi.unstubAllGlobals();
    });
  });

  describe('가이드 모달', () => {
    it('"발급 방법" 클릭 시 모달이 열리고 닫기 버튼으로 닫힌다', () => {
      renderComponent(
        <ApiKeyCard api={baseApi} savedKey={undefined} onSave={vi.fn()} onDelete={vi.fn()} />,
      );
      expect(screen.queryByTestId('guide-modal')).toBeNull();
      fireEvent.click(screen.getByLabelText('발급 방법 보기'));
      expect(screen.getByTestId('guide-modal')).toBeTruthy();
      expect(screen.getByText('Guide for 날씨 API')).toBeTruthy();

      fireEvent.click(screen.getByText('close-modal'));
      expect(screen.queryByTestId('guide-modal')).toBeNull();
    });
  });
});
