'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useAuth } from '@/hooks/useAuth';
import { Menu, X, LogOut, User as UserIcon } from 'lucide-react';

const NAV_LINKS = [
  { href: '/catalog', label: '카탈로그' },
  { href: '/builder', label: '빌더' },
  { href: '/dashboard', label: '대시보드' },
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
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        {/* Logo */}
        <Link href="/" className="text-xl font-bold text-gray-900">
          <span className="text-blue-600">Custom</span>WebService
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => {
            if (link.href !== '/catalog' && !isAuthenticated) return null;
            const isActive = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
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
                className="flex items-center gap-2 rounded-full p-1 hover:bg-gray-100"
              >
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.name ?? ''}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100">
                    <UserIcon className="h-4 w-4 text-blue-600" />
                  </div>
                )}
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  <div className="border-b border-gray-100 px-4 py-2">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {user.name ?? user.email}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {user.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={signOut}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <LogOut className="h-4 w-4" />
                    로그아웃
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              로그인
            </Link>
          )}

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="md:hidden"
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6 text-gray-700" />
            ) : (
              <Menu className="h-6 w-6 text-gray-700" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileMenuOpen && (
        <nav className="border-t border-gray-100 bg-white px-4 pb-4 md:hidden">
          {NAV_LINKS.map((link) => {
            if (link.href !== '/catalog' && !isAuthenticated) return null;
            const isActive = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block py-2 text-sm font-medium ${
                  isActive ? 'text-blue-600' : 'text-gray-600'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
