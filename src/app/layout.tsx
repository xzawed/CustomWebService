import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CustomWebService - 무료 API로 나만의 웹서비스 만들기',
  description:
    '무료 API를 골라 담고, 원하는 서비스를 설명하면, AI가 웹서비스를 만들어 바로 배포해주는 플랫폼',
  openGraph: {
    title: 'CustomWebService',
    description: '무료 API 기반 맞춤형 웹서비스 자동 생성 플랫폼',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
