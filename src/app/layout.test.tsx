import { describe, it, expect, vi } from 'vitest';
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
  it('항상 Auth.js(local) SessionProvider로 children을 감싼다', async () => {
    const bodyChild = getBodyChild(await RootLayout({ children: <main>콘텐츠</main> }));

    expect((bodyChild.type as { name?: string }).name).toBe('MockSessionProvider');
  });

  it('SessionProvider 안에 ThemeProvider가 중첩된다', async () => {
    const bodyChild = getBodyChild(
      await RootLayout({ children: <main>콘텐츠</main> }),
    ) as React.ReactElement<{ children: React.ReactNode }>;

    const inner = bodyChild.props.children;
    if (!React.isValidElement(inner)) {
      throw new Error('SessionProvider child was not a React element');
    }

    expect((inner.type as { name?: string }).name).toBe('MockThemeProvider');
  });
});

describe('RootLayout 종료 공지 배선', () => {
  it('ThemeProvider 안에서 children보다 먼저 종료 공지 배너를 렌더한다', async () => {
    const sessionProvider = getBodyChild(
      await RootLayout({ children: <main>콘텐츠</main> }),
    ) as React.ReactElement<{ children: React.ReactNode }>;

    const themeProvider = sessionProvider.props.children;
    if (!React.isValidElement<{ children: React.ReactNode }>(themeProvider)) {
      throw new Error('SessionProvider child was not a React element');
    }

    // 배너를 <body> 직속으로 넣으면 getBodyChild의 단일 자식 전제가 깨진다.
    // ThemeProvider 안 첫 자식이라는 위치 자체가 계약이므로 순서까지 고정한다.
    const [first] = React.Children.toArray(themeProvider.props.children);
    if (!React.isValidElement(first)) {
      throw new Error('ThemeProvider had no element children');
    }

    expect((first.type as { name?: string }).name).toBe('ShutdownBanner');
  });
});
