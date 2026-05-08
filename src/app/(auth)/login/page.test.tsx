// @vitest-environment happy-dom
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderComponent, screen, fireEvent, waitFor } from '@/test/helpers/component';

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signInWithOAuth: vi.fn(),
}));

vi.mock('next-auth/react', () => ({
  signIn: mocks.signIn,
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithOAuth: mocks.signInWithOAuth,
    },
  }),
}));

import LoginPage from './page';

function setWindowUrl(url: string): void {
  (window as unknown as { happyDOM: { setURL: (nextUrl: string) => void } }).happyDOM.setURL(url);
}

describe('LoginPage OAuth redirect', () => {
  const originalProvider = process.env.NEXT_PUBLIC_AUTH_PROVIDER;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'supabase';
    mocks.signInWithOAuth.mockResolvedValue({ error: null });
    setWindowUrl('https://customwebservice-production.up.railway.app/login');
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_AUTH_PROVIDER = originalProvider;
  });

  it('Supabase OAuth redirectTo는 현재 origin의 /callback을 사용한다', async () => {
    renderComponent(<LoginPage />);

    fireEvent.click(screen.getByText('Google로 계속하기'));

    await waitFor(() => {
      expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: 'https://customwebservice-production.up.railway.app/callback',
        },
      });
    });
  });

  it('보호 경로 redirect 파라미터를 callback next로 전달한다', async () => {
    setWindowUrl('https://xzawed.xyz/login?redirect=/builder');
    renderComponent(<LoginPage />);

    fireEvent.click(screen.getByText('GitHub로 계속하기'));

    await waitFor(() => {
      expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'github',
        options: {
          redirectTo: 'https://xzawed.xyz/callback?next=%2Fbuilder',
        },
      });
    });
  });

  it('외부 redirect 파라미터는 callback에 전달하지 않는다', async () => {
    setWindowUrl('https://xzawed.xyz/login?redirect=https://evil.example');
    renderComponent(<LoginPage />);

    fireEvent.click(screen.getByText('Google로 계속하기'));

    await waitFor(() => {
      expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: 'https://xzawed.xyz/callback',
        },
      });
    });
  });

  it('Auth.js 모드에서는 next-auth signIn을 사용한다', async () => {
    process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'authjs';
    renderComponent(<LoginPage />);

    fireEvent.click(screen.getByText('Google로 계속하기'));

    await waitFor(() => {
      expect(mocks.signIn).toHaveBeenCalledWith('google', { callbackUrl: '/dashboard' });
    });
    expect(mocks.signInWithOAuth).not.toHaveBeenCalled();
  });
});
