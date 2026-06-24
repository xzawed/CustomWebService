import React, { type ReactNode } from 'react';

interface AuthCardProps {
  subtitle?: string;
  children: ReactNode;
}

/**
 * 인증 페이지 공용 레이아웃 셸.
 * 배경·오브·글래스 카드·로고 제목을 포함하며, 페이지별 내용은 children 으로 전달한다.
 */
export default function AuthCard({ subtitle, children }: Readonly<AuthCardProps>): React.JSX.Element {
  return (
    <div
      className="relative flex min-h-screen items-center justify-center px-6"
      style={{ background: 'var(--bg-base)' }}
    >
      {/* Background orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-1/3 h-80 w-80 rounded-full bg-cyan-500/[0.06] blur-[80px]" />
        <div className="absolute -right-32 bottom-1/3 h-80 w-80 rounded-full bg-violet-500/[0.06] blur-[80px]" />
      </div>

      <div className="glass relative w-full max-w-sm rounded-2xl p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">
            <span className="gradient-text">Custom</span>
            <span style={{ color: 'var(--text-primary)' }}>WebService</span>
          </h1>
          {subtitle && <p className="mt-2 text-sm text-slate-400">{subtitle}</p>}
        </div>

        {children}
      </div>
    </div>
  );
}
