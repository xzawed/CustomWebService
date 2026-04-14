'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useAuth } from '@/hooks/useAuth';
import { ThemeSelector } from '@/components/ui/ThemeSelector';
import { Menu, X, LogOut, User as UserIcon, LayoutGrid, Hammer, BarChart3, Key } from 'lucide-react';

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
    <header className="glass safe-top sticky top-0 z-50">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        {/* Logo */}
        <Link href="/" className="text-lg font-bold tracking-tight">
          <span className="gradient-text">Custom</span>
          <span style={{ color: 'var(--text-primary)' }}>WebService</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => {
            const isPublic = link.href === '/catalog';
            if (!isPublic && !isAuthenticated) return null;
            const isActive = pathname.startsWith(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all"
                style={{
                  color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  background: isActive ? 'var(--ghost-hover-bg)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)';
                    (e.currentTarget as HTMLAnchorElement).style.background =
                      'var(--ghost-hover-bg)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)';
                    (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
                  }
                }}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right Side */}
        <div className="flex items-center gap-2">
          {/* Theme Selector */}
          <ThemeSelector />

          {isAuthenticated && user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen((v) => !v)}
                className="flex items-center gap-2 rounded-full p-2 transition-all"
                style={{
                  outline: dropdownOpen ? '2px solid var(--border-accent)' : 'none',
                }}
              >
                {user.avatarUrl ? (
                  <Image
                    src={user.avatarUrl}
                    alt={user.name ?? ''}
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-full object-cover"
                    style={{ boxShadow: '0 0 0 2px var(--border-accent)' }}
                  />
                ) : (
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full"
                    style={{
                      background: 'var(--grad-subtle)',
                      boxShadow: '0 0 0 2px var(--border-accent)',
                    }}
                  >
                    <UserIcon className="h-4 w-4" style={{ color: 'var(--accent-primary)' }} />
                  </div>
                )}
              </button>

              {dropdownOpen && (
                <div
                  className="absolute right-0 mt-2 w-56 max-w-[calc(100vw-32px)] overflow-hidden rounded-xl py-1 animate-fade-in"
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow-xl)',
                  }}
                >
                  <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                    <p
                      className="truncate text-sm font-semibold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {user.name ?? user.email}
                    </p>
                    <p className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
                      {user.email}
                    </p>
                  </div>
                  <Link
                    href="/settings/api-keys"
                    onClick={() => setDropdownOpen(false)}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm transition-all"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.background =
                        'var(--ghost-hover-bg)';
                      (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
                      (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)';
                    }}
                  >
                    <Key className="h-4 w-4" />
                    내 API 키 관리
                  </Link>
                  <button
                    type="button"
                    onClick={signOut}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm transition-all"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background =
                        'var(--ghost-hover-bg)';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
                    }}
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
            className="rounded-lg p-2 transition-colors md:hidden"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)')
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)')
            }
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileMenuOpen && (
        <nav
          className="border-t px-4 pb-4 md:hidden"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-surface)' }}
        >
          {NAV_LINKS.map((link) => {
            const isPublic = link.href === '/catalog';
            if (!isPublic && !isAuthenticated) return null;
            const isActive = pathname.startsWith(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium"
                style={{
                  color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                }}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
          {/* Mobile theme selector */}
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <p className="mb-2 px-3 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
              테마
            </p>
            <ThemeSelector />
          </div>
        </nav>
      )}
    </header>
  );
}
