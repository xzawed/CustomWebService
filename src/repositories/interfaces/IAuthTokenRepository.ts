export type AuthTokenType = 'email_verify' | 'password_reset';

export interface IAuthTokenRepository {
  create(userId: string, tokenHash: string, type: AuthTokenType, expiresAt: string): Promise<void>;
  findValidByHash(
    tokenHash: string,
    type: AuthTokenType,
    now: string,
  ): Promise<{ id: string; userId: string } | null>;
  consume(id: string, now: string): Promise<void>;
  invalidateByUserAndType(userId: string, type: AuthTokenType, now: string): Promise<void>;
}
