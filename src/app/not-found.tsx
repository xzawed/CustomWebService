import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6" style={{ background: 'var(--bg-base)' }}>
      <p className="gradient-text text-7xl font-extrabold">404</p>
      <h1 className="mt-4 text-xl font-bold text-white">
        페이지를 찾을 수 없습니다
      </h1>
      <p className="mt-2 text-sm text-slate-400">
        요청하신 페이지가 존재하지 않거나 이동되었습니다.
      </p>
      <div className="mt-8 flex gap-3">
        <Link href="/" className="btn-primary">
          홈으로 가기
        </Link>
        <Link href="/catalog" className="btn-secondary">
          API 카탈로그
        </Link>
      </div>
    </div>
  );
}
