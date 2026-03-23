import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white py-8">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-gray-500">
            &copy; {new Date().getFullYear()} CustomWebService. All rights reserved.
          </p>
          <nav className="flex gap-6">
            <Link href="/catalog" className="text-sm text-gray-500 hover:text-gray-700">
              API 카탈로그
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              GitHub
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
