export type AuthTokenType = 'email_verify' | 'password_reset';

export interface IAuthTokenRepository {
  create(userId: string, tokenHash: string, type: AuthTokenType, expiresAt: string): Promise<void>;
  /**
   * 유효(미소비·미만료)한 토큰을 **원자적으로** 소비하고 userId를 반환한다.
   * 조건에 맞는 행이 없으면 null.
   *
   * 조회 → 소비 2단계로 나누면 두 await 사이에 다른 요청이 끼어들어 같은 토큰이
   * 두 번 소비될 수 있다(비밀번호 재설정 링크 재사용). 단일 문으로 유지할 것.
   */
  consumeValid(tokenHash: string, type: AuthTokenType, now: string): Promise<string | null>;
  invalidateByUserAndType(userId: string, type: AuthTokenType, now: string): Promise<void>;
}
