'use client';

import { useState, useRef, useEffect } from 'react';
import { Palette } from 'lucide-react';
import { THEMES, useThemeStore } from '@/stores/themeStore';

export function ThemeSelector() {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useThemeStore();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="테마 색상 변경"
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all"
        style={{
          color: open ? 'var(--accent-primary)' : 'var(--text-secondary)',
          background: open ? 'var(--ghost-hover-bg)' : 'transparent',
        }}
        onMouseEnter={(e) => {
          if (!open) {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--ghost-hover-bg)';
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }
        }}
      >
        {/* Live swatch of current theme */}
        <span
          className="block h-4 w-4 rounded-full flex-shrink-0"
          style={{
            background: current.swatch,
            boxShadow: '0 0 0 2px var(--border)',
          }}
        />
        <Palette className="h-4 w-4 hidden sm:block" />
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-16px)] overflow-hidden rounded-2xl p-4 animate-fade-in"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-xl)',
            zIndex: 100,
          }}
        >
          {/* Header */}
          <p
            className="mb-3 text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            테마 선택
          </p>

          {/* Swatches grid */}
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((t) => {
              const isActive = theme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTheme(t.id);
                    setOpen(false);
                  }}
                  className="group flex flex-col items-center gap-2 rounded-xl p-3 transition-all"
                  style={{
                    background: isActive ? 'var(--ghost-hover-bg)' : 'transparent',
                    border: `1px solid ${isActive ? 'var(--accent-primary)' : 'var(--border)'}`,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLButtonElement).style.background =
                        'var(--ghost-hover-bg)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive)
                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                  }}
                >
                  {/* Color circle */}
                  <span
                    className="block h-10 w-10 rounded-full shadow-md transition-transform group-hover:scale-110"
                    style={{ background: t.swatch }}
                  />
                  {/* Label */}
                  <span
                    className="text-xs font-semibold"
                    style={{
                      color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    }}
                  >
                    {t.label}
                  </span>
                  {/* Desc */}
                  <span
                    className="text-center leading-tight"
                    style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: '1.3' }}
                  >
                    {t.desc}
                  </span>
                  {/* Active dot */}
                  {isActive && (
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: 'var(--accent-primary)' }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
