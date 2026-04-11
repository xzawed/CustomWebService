// ⚠️  이 파일은 모듈 초기화 시 getDb()를 호출합니다 (DrizzleAdapter).
// AUTH_PROVIDER=authjs 환경에서만 동적 import로 로드되어야 합니다.
// 정적 import 시 Supabase 모드에서 예외가 발생합니다.
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import GitHub from 'next-auth/providers/github';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { getDb } from '@/lib/db/connection';
import * as schema from '@/lib/db/schema';

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(getDb(), {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
    }),
  ],
  callbacks: {
    session({ session, user }) {
      // 데이터베이스 사용자 ID를 세션에 항상 포함
      session.user.id = user.id;
      return session;
    },
  },
});
