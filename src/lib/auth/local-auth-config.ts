// AUTH_PROVIDER=local 전용 — Auth.js v5 Credentials + JWT 무상태 세션 (DB 어댑터 없음).
//
// authjs-config(OAuth+DrizzleAdapter)와 달리 module-load 시 getDb()를 호출하지 않으므로
// Node 전용 DB 그래프를 끌어오지 않는다. 그래도 getAuthUser/미들웨어에서 동적 import로
// 로드해 정적 체인을 끊는다(일관성·안전).
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verifyAdminCredentials } from '@/lib/auth/adminCredentials';
import { localAuthBaseConfig } from '@/lib/auth/local-auth-base';

// 전체 설정(Node 런타임) — Credentials authorize가 scrypt(node:crypto)를 사용하므로 edge 불가.
// 라우트 핸들러(/api/auth/[...nextauth])와 서버 측 getLocalAuthUser가 이 설정을 동적 import한다.
// 세션 전략·JWT 콜백은 edge 설정과 동일한 localAuthBaseConfig를 공유한다(JWT 호환).
export const { auth, handlers, signIn, signOut } = NextAuth({
  ...localAuthBaseConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? credentials.email : '';
        const password = typeof credentials?.password === 'string' ? credentials.password : '';
        const user = verifyAdminCredentials(email, password);
        if (!user) return null;
        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
});
