import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/providers/ThemeProvider';

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
    <html lang="ko" data-theme="sky">
      <head>
        <meta charSet="utf-8" />
        {/* Pretendard Variable — Korean-optimized web font via jsDelivr CDN */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        {/* Prevent flash of wrong theme by applying saved theme before hydration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=JSON.parse(localStorage.getItem('cws-theme')||'{}');var t=s.state&&s.state.theme;if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="noise min-h-screen antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
