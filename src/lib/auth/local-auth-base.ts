// AUTH_PROVIDER=local 공유 설정 — edge-safe (node:crypto 등 Node 전용 모듈 미의존).
//
// 전체 설정(local-auth-config, Node 런타임 — Credentials authorize가 scrypt 사용)과
// 미들웨어용 edge 설정(local-auth-edge)이 이 base를 공유한다. 동일 AUTH_SECRET·동일 JWT
// 콜백을 사용하므로, 전체 설정이 로그인 시 발급한 JWT를 edge 설정이 미들웨어에서 검증할 수 있다.
//
// JWT 무상태 세션: 로그인 시 관리자 id를 token.sub에 고정 → 이후 요청은 토큰만으로 신원 확인.
import type { NextAuthConfig } from 'next-auth';

// providers는 각 config(전체/edge)가 채우므로 base에서는 생략한다(Omit).
export const localAuthBaseConfig = {
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies Omit<NextAuthConfig, 'providers'>;
