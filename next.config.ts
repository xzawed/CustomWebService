import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // playwright-core: rendering QC 전용(ENABLE_RENDERING_QC=true).
  // better-sqlite3: 네이티브 모듈(DB_PROVIDER=sqlite). 둘 다 webpack 번들 금지 —
  // standalone 모드가 node_modules로 복사하고, 네이티브 .node 바인딩이 보존된다.
  serverExternalPackages: ['playwright-core', 'better-sqlite3'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'xzawed.xyz' },
      { protocol: 'https', hostname: '*.xzawed.xyz' },
    ],
  },
};

export default nextConfig;
