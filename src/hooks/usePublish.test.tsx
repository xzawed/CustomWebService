// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePublish } from './usePublish';

function makeJsonResponse(body: unknown, ok: boolean, status = ok ? 200 : 400): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

function makeInvalidJsonResponse(ok: boolean, status = 400): Response {
  return {
    ok,
    status,
    json: async () => {
      throw new SyntaxError('Unexpected token');
    },
  } as unknown as Response;
}

describe('usePublish', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('publish', () => {
    it('200 성공 시 본문을 반환하고 isLoading은 false로 끝난다', async () => {
      const payload = { data: { published: true, slug: 'my-app' } };
      fetchMock.mockResolvedValue(makeJsonResponse(payload, true, 200));

      const { result } = renderHook(() => usePublish());
      let returned: unknown;

      await act(async () => {
        returned = await result.current.publish('proj-1', 'my-app');
      });

      expect(returned).toEqual(payload);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(fetchMock).toHaveBeenCalledWith('/api/v1/projects/proj-1/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: 'my-app' }),
      });
    });

    it('400 + message 본문이면 해당 메시지를 error에 담고 throw한다', async () => {
      fetchMock.mockResolvedValue(
        makeJsonResponse({ message: '슬러그가 이미 사용 중입니다.' }, false, 400),
      );

      const { result } = renderHook(() => usePublish());

      await act(async () => {
        await expect(result.current.publish('proj-1')).rejects.toThrow(
          '슬러그가 이미 사용 중입니다.',
        );
      });

      expect(result.current.error).toBe('슬러그가 이미 사용 중입니다.');
      expect(result.current.isLoading).toBe(false);
    });

    it('유효하지 않은 JSON 에러 본문은 기본 메시지 게시에 실패했습니다. 로 폴백한다', async () => {
      fetchMock.mockResolvedValue(makeInvalidJsonResponse(false, 400));

      const { result } = renderHook(() => usePublish());

      await act(async () => {
        await expect(result.current.publish('proj-1')).rejects.toThrow('게시에 실패했습니다.');
      });

      expect(result.current.error).toBe('게시에 실패했습니다.');
      expect(result.current.isLoading).toBe(false);
    });

    it('fetch 거부(네트워크 오류) 시 메시지를 기록하고 isLoading은 false다', async () => {
      fetchMock.mockRejectedValue(new Error('Failed to fetch'));

      const { result } = renderHook(() => usePublish());

      await act(async () => {
        await expect(result.current.publish('proj-1')).rejects.toThrow('Failed to fetch');
      });

      expect(result.current.error).toBe('Failed to fetch');
      expect(result.current.isLoading).toBe(false);
    });

    it('slug 없이 publish하면 Content-Type·body를 생략한다', async () => {
      fetchMock.mockResolvedValue(makeJsonResponse({ ok: true }, true));

      const { result } = renderHook(() => usePublish());

      await act(async () => {
        await result.current.publish('proj-2');
      });

      expect(fetchMock).toHaveBeenCalledWith('/api/v1/projects/proj-2/publish', {
        method: 'POST',
        headers: {},
        body: undefined,
      });
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('unpublish', () => {
    it('200 성공 시 본문을 반환하고 isLoading은 false로 끝난다', async () => {
      const payload = { data: { published: false } };
      fetchMock.mockResolvedValue(makeJsonResponse(payload, true, 200));

      const { result } = renderHook(() => usePublish());
      let returned: unknown;

      await act(async () => {
        returned = await result.current.unpublish('proj-9');
      });

      expect(returned).toEqual(payload);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(fetchMock).toHaveBeenCalledWith('/api/v1/projects/proj-9/publish', {
        method: 'DELETE',
      });
    });

    it('400 + message 본문이면 해당 메시지를 error에 담고 throw한다', async () => {
      fetchMock.mockResolvedValue(
        makeJsonResponse({ message: '게시되지 않은 프로젝트입니다.' }, false, 400),
      );

      const { result } = renderHook(() => usePublish());

      await act(async () => {
        await expect(result.current.unpublish('proj-9')).rejects.toThrow(
          '게시되지 않은 프로젝트입니다.',
        );
      });

      expect(result.current.error).toBe('게시되지 않은 프로젝트입니다.');
      expect(result.current.isLoading).toBe(false);
    });

    it('유효하지 않은 JSON 에러 본문은 기본 메시지 게시 취소에 실패했습니다. 로 폴백한다', async () => {
      fetchMock.mockResolvedValue(makeInvalidJsonResponse(false, 500));

      const { result } = renderHook(() => usePublish());

      await act(async () => {
        await expect(result.current.unpublish('proj-9')).rejects.toThrow(
          '게시 취소에 실패했습니다.',
        );
      });

      expect(result.current.error).toBe('게시 취소에 실패했습니다.');
      expect(result.current.isLoading).toBe(false);
    });

    it('fetch 거부(네트워크 오류) 시 메시지를 기록하고 isLoading은 false다', async () => {
      fetchMock.mockRejectedValue(new TypeError('NetworkError'));

      const { result } = renderHook(() => usePublish());

      await act(async () => {
        await expect(result.current.unpublish('proj-9')).rejects.toThrow('NetworkError');
      });

      expect(result.current.error).toBe('NetworkError');
      expect(result.current.isLoading).toBe(false);
    });
  });
});
