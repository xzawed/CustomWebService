import { describe, it, expect, beforeEach } from 'vitest';
import type { User } from '@/types/user';
import { useAuthStore } from './authStore';

const sampleUser: User = {
  id: 'user-1',
  email: 'test@example.com',
  name: '테스트',
  avatarUrl: null,
  preferences: {},
  passwordHash: null,
  emailVerified: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('useAuthStore', () => {
  beforeEach(() => {
    // replace=true 금지 — 액션 함수가 덮어써져 사라진다
    useAuthStore.setState({
      user: null,
      isLoading: true,
      isAuthenticated: false,
    });
  });

  it('초기 상태는 로딩 중·미인증이다', () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isLoading).toBe(true);
    expect(state.isAuthenticated).toBe(false);
  });

  it('setUser(user)는 인증 상태로 전환하고 isLoading을 false로 둔다', () => {
    useAuthStore.getState().setUser(sampleUser);

    const state = useAuthStore.getState();
    expect(state.user).toEqual(sampleUser);
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it('setUser(null)은 미인증으로 전환한다', () => {
    useAuthStore.getState().setUser(sampleUser);
    useAuthStore.getState().setUser(null);

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  it('setLoading은 isLoading만 갱신한다', () => {
    useAuthStore.getState().setUser(sampleUser);
    useAuthStore.getState().setLoading(true);

    const state = useAuthStore.getState();
    expect(state.isLoading).toBe(true);
    expect(state.user).toEqual(sampleUser);
    expect(state.isAuthenticated).toBe(true);
  });
});
