import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t py-8" style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">
              <span className="gradient-text">Custom</span>
              <span className="text-slate-400">WebService</span>
            </span>
            <span className="text-xs text-slate-600">
              &copy; {new Date().getFullYear()}
            </span>
          </div>
          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            <Link href="/catalog" className="text-xs text-slate-500 transition-colors hover:text-slate-300">
              API 카탈로그
            </Link>
            <Link href="/terms" className="text-xs text-slate-500 transition-colors hover:text-slate-300">
              이용약관
            </Link>
            <Link href="/privacy" className="text-xs text-slate-500 transition-colors hover:text-slate-300">
              개인정보처리방침
            </Link>
            <Link href="/disclaimer" className="text-xs text-slate-500 transition-colors hover:text-slate-300">
              면책 조항
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-500 transition-colors hover:text-slate-300"
            >
              GitHub
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
