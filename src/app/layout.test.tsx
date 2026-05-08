import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers({ 'x-nonce': 'nonce-1' })),
}));

vi.mock('@/providers/ThemeProvider', () => ({
  ThemeProvider: function MockThemeProvider({ children }: { children: React.ReactNode }) {
    return <div data-testid="theme-provider">{children}</div>;
  },
}));

vi.mock('next-auth/react', () => ({
  SessionProvider: function MockSessionProvider({ children }: { children: React.ReactNode }) {
    return <div data-testid="session-provider">{children}</div>;
  },
}));

import RootLayout from './layout';

function getBodyChild(tree: React.ReactElement<{ children: React.ReactNode }>): React.ReactElement {
  const htmlChildren = React.Children.toArray(tree.props.children);
  const body = htmlChildren.find(
    (child): child is React.ReactElement<{ children: React.ReactNode }> =>
      React.isValidElement(child) && child.type === 'body',
  );

  if (!body || !React.isValidElement(body.props.children)) {
    throw new Error('RootLayout body child was not a React element');
  }

  return body.props.children;
}

describe('RootLayout auth provider wiring', () => {
  const originalProvider = process.env.NEXT_PUBLIC_AUTH_PROVIDER;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'supabase';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_AUTH_PROVIDER = originalProvider;
  });

  it('Supabase 모드에서는 Auth.js SessionProvider를 렌더링하지 않는다', async () => {
    const bodyChild = getBodyChild(await RootLayout({ children: <main>콘텐츠</main> }));

    expect((bodyChild.type as { name?: string }).name).toBe('MockThemeProvider');
  });

  it('Auth.js 모드에서는 SessionProvider를 렌더링한다', async () => {
    process.env.NEXT_PUBLIC_AUTH_PROVIDER = 'authjs';

    const bodyChild = getBodyChild(await RootLayout({ children: <main>콘텐츠</main> }));

    expect((bodyChild.type as { name?: string }).name).toBe('MockSessionProvider');
  });
});
