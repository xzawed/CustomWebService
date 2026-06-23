// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAuthStore } from '@/stores/authStore';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  useSession: vi.fn(),
  authJsSignOut: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('next-auth/react', () => ({
  useSession: mocks.useSession,
  signOut: mocks.authJsSignOut,
}));

import { useAuth } from './useAuth';

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: null, isLoading: true, isAuthenticated: false });
    mocks.useSession.mockReturnValue({ data: null, status: 'unauthenticated' });
    mocks.authJsSignOut.mockResolvedValue(undefined);
  });

  it('인증된 next-auth 세션을 사용자 상태로 매핑한다', async () => {
    mocks.useSession.mockReturnValue({
      data: {
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          image: 'https://example.com/avatar.png',
        },
      },
      status: 'authenticated',
    });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.user).toMatchObject({
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      avatarUrl: 'https://example.com/avatar.png',
    });
  });

  it('미인증 세션이면 사용자 상태를 비운다', async () => {
    mocks.useSession.mockReturnValue({ data: null, status: 'unauthenticated' });

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('로딩 중에는 사용자 상태를 변경하지 않는다', () => {
    mocks.useSession.mockReturnValue({ data: null, status: 'loading' });

    const { result } = renderHook(() => useAuth());

    // loading 상태에서는 setUser가 호출되지 않아 초기 store 값(isLoading: true)이 유지된다
    expect(result.current.isLoading).toBe(true);
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('signOut은 next-auth signOut을 callbackUrl과 함께 호출하고 라우팅한다', async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signOut();
    });

    expect(mocks.authJsSignOut).toHaveBeenCalledWith({ callbackUrl: '/' });
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(mocks.push).toHaveBeenCalledWith('/');
  });
});
