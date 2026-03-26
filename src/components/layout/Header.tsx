'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useAuth } from '@/hooks/useAuth';
import { Menu, X, LogOut, User as UserIcon, LayoutGrid, Hammer, BarChart3 } from 'lucide-react';

const NAV_LINKS = [
  { href: '/catalog', label: '카탈로그', icon: LayoutGrid },
  { href: '/builder', label: '빌더', icon: Hammer },
  { href: '/dashboard', label: '대시보드', icon: BarChart3 },
];

export function Header() {
  const pathname = usePathname();
  const { user, isAuthenticated } = useAuthStore();
  const { signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="glass sticky top-0 z-50">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        {/* Logo */}
        <Link href="/" className="text-lg font-bold tracking-tight">
          <span className="gradient-text">Custom</span>
          <span className="text-white">WebService</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            if (link.href !== '/catalog' && !isAuthenticated) return null;
            const isActive = pathname.startsWith(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-white/[0.08] text-cyan-400'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right Side */}
        <div className="flex items-center gap-3">
          {isAuthenticated && user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen((v) => !v)}
                className="flex items-center gap-2 rounded-full p-1 transition-all hover:ring-2 hover:ring-white/10"
              >
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name ?? ''}
                    className="h-8 w-8 rounded-full object-cover ring-2 ring-white/10"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/30 to-violet-500/30 ring-2 ring-white/10">
                    <UserIcon className="h-4 w-4 text-cyan-400" />
                  </div>
                )}
              </button>

              {dropdownOpen && (
                <div className="glass absolute right-0 mt-2 w-56 overflow-hidden rounded-xl py-1" style={{ background: 'var(--bg-card)' }}>
                  <div className="border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
                    <p className="truncate text-sm font-semibold text-white">
                      {user.name ?? user.email}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {user.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={signOut}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-300 transition-colors hover:bg-white/[0.04] hover:text-white"
                  >
                    <LogOut className="h-4 w-4" />
                    로그아웃
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/login" className="btn-primary text-sm">
              로그인
            </Link>
          )}

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/[0.04] hover:text-white md:hidden"
          >
            {mobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileMenuOpen && (
        <nav className="border-t px-4 pb-4 md:hidden" style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}>
          {NAV_LINKS.map((link) => {
            if (link.href !== '/catalog' && !isAuthenticated) return null;
            const isActive = pathname.startsWith(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium ${
                  isActive ? 'text-cyan-400' : 'text-slate-400'
                }`}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
