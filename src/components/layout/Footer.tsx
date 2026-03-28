import Link from 'next/link';

export function Footer() {
  return (
    <footer
      className="border-t py-8"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}
    >
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">
              <span className="gradient-text">Custom</span>
              <span style={{ color: 'var(--text-muted)' }}>WebService</span>
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              &copy; {new Date().getFullYear()}
            </span>
          </div>
          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            {[
              { href: '/catalog', label: 'API 카탈로그' },
              { href: '/terms', label: '이용약관' },
              { href: '/privacy', label: '개인정보처리방침' },
              { href: '/disclaimer', label: '면책 조항' },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-xs transition-colors"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent-primary)')
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-muted)')
                }
              >
                {link.label}
              </Link>
            ))}
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs transition-colors"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--accent-primary)')
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-muted)')
              }
            >
              GitHub
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
