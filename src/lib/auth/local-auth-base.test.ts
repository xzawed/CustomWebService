import { describe, it, expect } from 'vitest';
import { localAuthBaseConfig } from './local-auth-base';

/**
 * 공유 base 설정의 JWT 무상태 콜백 검증.
 * (NextAuth 인스턴스 자체는 통합 영역 — 여기서는 순수 콜백 로직만 단위 검증한다.)
 */
describe('localAuthBaseConfig callbacks', () => {
  const jwt = localAuthBaseConfig.callbacks.jwt;
  const session = localAuthBaseConfig.callbacks.session;

  it('jwt: 로그인 시 user.id를 token.sub에 고정한다', async () => {
    const token = await jwt({ token: {}, user: { id: 'admin-1' } } as never);
    expect(token.sub).toBe('admin-1');
  });

  it('jwt: 후속 요청(user 없음)은 기존 token을 보존한다', async () => {
    const token = await jwt({ token: { sub: 'existing' }, user: undefined } as never);
    expect(token.sub).toBe('existing');
  });

  it('session: token.sub를 session.user.id로 매핑한다', async () => {
    const s = await session({ session: { user: {} }, token: { sub: 'admin-1' } } as never);
    expect(s.user.id).toBe('admin-1');
  });

  it('JWT 무상태 세션 전략을 사용한다', () => {
    expect(localAuthBaseConfig.session.strategy).toBe('jwt');
  });
});
