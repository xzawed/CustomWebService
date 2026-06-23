// AUTH_PROVIDER=local 미들웨어용 edge-safe 설정.
//
// 미들웨어(Edge 런타임)는 node:crypto를 끌어오는 local-auth-config(전체 설정)를 import할 수 없다.
// 세션 검증(JWT 읽기)에는 Credentials authorize(scrypt)가 필요 없으므로, authorize 없는 stub
// provider만 둔 edge 설정을 별도로 만든다. 동일 AUTH_SECRET·동일 base 콜백을 공유하므로,
// 전체 설정이 로그인 시 발급한 JWT 쿠키를 이 설정의 auth()가 검증할 수 있다.
//
// "Edge 임포트 위반 0" — 이 모듈의 정적 import 체인에는 Node 전용 모듈이 없다.
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { localAuthBaseConfig } from '@/lib/auth/local-auth-base';

export const { auth } = NextAuth({
  ...localAuthBaseConfig,
  // verification 전용 stub — 미들웨어는 로그인을 수행하지 않으므로 authorize는 호출되지 않는다.
  // (실제 자격증명 검증은 Node 런타임의 local-auth-config에만 존재한다.)
  providers: [Credentials({ authorize: () => null })],
});
