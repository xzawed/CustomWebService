// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAuthStore } from '@/stores/authStore';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  useSession: vi.fn(),
  authJsSignOut: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  supabaseSignOut: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('next-auth/react', () => ({
  useSession: mocks.useSession,
  signOut: mocks.authJsSignOut,
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signOut: mocks.supabaseSignOut,
    },
  }),
}));

import { useAuth } from './useAuth';

describe('useAuth', () => {
  const originalProvider = process.env.NEXT_PUBLIC_AUTH_PROVIDER;

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ user: null, isLoading: true, isAuthenticated: false });
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    mocks.useSession.mockReturnValue(undefined);
    process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'supabase';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_AUTH_PROVIDER = originalProvider;
  });

  it('Supabase 모드에서 SessionProvider가 없어도 기본 인증 상태를 반환한다', async () => {
    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('Auth.js 모드에서 next-auth 세션을 사용자 상태로 매핑한다', () => {
    process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'authjs';
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

    expect(result.current.isLoading).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toMatchObject({
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      avatarUrl: 'https://example.com/avatar.png',
    });
  });
});
