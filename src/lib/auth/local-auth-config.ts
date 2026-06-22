// AUTH_PROVIDER=local 전용 — Auth.js v5 Credentials + JWT 무상태 세션 (DB 어댑터 없음).
//
// authjs-config(OAuth+DrizzleAdapter)와 달리 module-load 시 getDb()를 호출하지 않으므로
// Node 전용 DB 그래프를 끌어오지 않는다. 그래도 getAuthUser/미들웨어에서 동적 import로
// 로드해 정적 체인을 끊는다(일관성·안전).
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verifyAdminCredentials } from '@/lib/auth/adminCredentials';

export const { auth, handlers, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
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
  callbacks: {
    jwt({ token, user }) {
      // 로그인 시 관리자 id를 토큰 subject에 고정 (이후 요청은 토큰만으로 신원 확인 — 무상태)
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
