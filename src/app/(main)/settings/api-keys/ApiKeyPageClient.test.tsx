// @vitest-environment happy-dom
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderComponent, screen, fireEvent, waitFor } from '@/test/helpers/component';
import type { ApiCatalogItem } from '@/types/api';

vi.mock('@/components/settings/ApiKeyCard', () => ({
  ApiKeyCard: ({
    api,
    savedKey,
    onSave,
    onDelete,
  }: {
    api: ApiCatalogItem;
    savedKey: { apiId: string; maskedKey: string; isVerified: boolean } | undefined;
    onSave: (apiId: string, key: string) => Promise<void>;
    onDelete: (apiId: string) => Promise<void>;
  }) => (
    <div data-testid={`api-key-card-${api.id}`}>
      <span>{api.name}</span>
      {savedKey && <span data-testid={`masked-key-${api.id}`}>{savedKey.maskedKey}</span>}
      {/* errors are caught to avoid unhandled rejections in tests */}
      <button onClick={() => onSave(api.id, 'new-key').catch(() => {})}>save-{api.id}</button>
      <button onClick={() => onDelete(api.id).catch(() => {})}>delete-{api.id}</button>
    </div>
  ),
}));

import { ApiKeyPageClient } from './ApiKeyPageClient';

function makeApi(id: string, name: string): ApiCatalogItem {
  return {
    id,
    name,
    description: `${name} 설명`,
    category: 'data',
    baseUrl: 'https://example.com',
    authType: 'api_key',
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
  makeApi('api-1', '날씨 API'),
  makeApi('api-2', '금융 API'),
];

describe('ApiKeyPageClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('초기에 API 카드 목록이 렌더링된다', () => {
    renderComponent(<ApiKeyPageClient apis={apis} initialSavedKeys={[]} />);
    expect(screen.getByTestId('api-key-card-api-1')).toBeTruthy();
    expect(screen.getByTestId('api-key-card-api-2')).toBeTruthy();
    expect(screen.getByText('날씨 API')).toBeTruthy();
    expect(screen.getByText('금융 API')).toBeTruthy();
  });

  it('apis가 빈 배열이면 빈 상태 메시지를 표시한다', () => {
    renderComponent(<ApiKeyPageClient apis={[]} initialSavedKeys={[]} />);
    expect(screen.getByText('등록 가능한 API가 없습니다.')).toBeTruthy();
  });

  it('initialSavedKeys가 있으면 maskedKey가 카드에 전달된다', () => {
    renderComponent(
      <ApiKeyPageClient
        apis={[apis[0]]}
        initialSavedKeys={[{ apiId: 'api-1', maskedKey: 'sk-1***', isVerified: true }]}
      />
    );
    expect(screen.getByTestId('masked-key-api-1').textContent).toBe('sk-1***');
  });

  it('handleSave 성공 시 fetch POST가 호출되고 savedKeys 상태가 갱신된다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderComponent(<ApiKeyPageClient apis={[apis[0]]} initialSavedKeys={[]} />);

    fireEvent.click(screen.getByText('save-api-1'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/user-api-keys',
        expect.objectContaining({ method: 'POST' })
      );
    });

    // 저장 후 maskedKey 표시 확인 — 'new-key' → 'new-' + '*'.repeat(16)
    await waitFor(() => {
      expect(screen.getByTestId('masked-key-api-1')).toBeTruthy();
    });
  });

  it('handleDelete 성공 시 fetch DELETE가 호출되고 해당 key가 제거된다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    renderComponent(
      <ApiKeyPageClient
        apis={[apis[0]]}
        initialSavedKeys={[{ apiId: 'api-1', maskedKey: 'enc-***', isVerified: false }]}
      />
    );

    expect(screen.getByTestId('masked-key-api-1')).toBeTruthy();

    fireEvent.click(screen.getByText('delete-api-1'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/user-api-keys?apiId=api-1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    await waitFor(() => {
      expect(screen.queryByTestId('masked-key-api-1')).toBeNull();
    });
  });

  it('handleSave 실패 시 fetch가 호출되고 savedKeys 상태는 변경되지 않는다', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: '저장 실패' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderComponent(<ApiKeyPageClient apis={[apis[0]]} initialSavedKeys={[]} />);

    // 카드 클릭 — mock에서 catch() 처리되므로 unhandled rejection 없음
    fireEvent.click(screen.getByText('save-api-1'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/user-api-keys',
        expect.objectContaining({ method: 'POST' })
      );
    });

    // 실패 시 maskedKey가 추가되지 않아야 함
    expect(screen.queryByTestId('masked-key-api-1')).toBeNull();
  });
});
