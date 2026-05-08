// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderComponent, screen } from '@/test/helpers/component';

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ 'x-nonce': 'nonce-1' })),
}));

vi.mock('@/providers/ThemeProvider', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="theme-provider">{children}</div>
  ),
}));

vi.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="session-provider">{children}</div>
  ),
}));

import RootLayout from './layout';

describe('RootLayout auth provider wiring', () => {
  const originalProvider = process.env.NEXT_PUBLIC_AUTH_PROVIDER;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'supabase';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_AUTH_PROVIDER = originalProvider;
  });

  it('Supabase 모드에서는 Auth.js SessionProvider를 렌더링하지 않는다', async () => {
    renderComponent(await RootLayout({ children: <main>콘텐츠</main> }));

    expect(screen.getByTestId('theme-provider')).toBeTruthy();
    expect(screen.queryByTestId('session-provider')).toBeNull();
  });

  it('Auth.js 모드에서는 SessionProvider를 렌더링한다', async () => {
    process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'authjs';

    renderComponent(await RootLayout({ children: <main>콘텐츠</main> }));

    expect(screen.getByTestId('session-provider')).toBeTruthy();
  });
});
