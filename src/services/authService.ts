import type { IUserRepository, IAuthTokenRepository } from '@/repositories/interfaces';
import { hashPassword } from '@/lib/auth/password';
import {
  issueToken,
  verifyAndConsumeToken,
  EMAIL_VERIFY_TTL_MS,
  PASSWORD_RESET_TTL_MS,
} from '@/lib/auth/tokens';
import { ConflictError, ValidationError } from '@/lib/utils/errors';

export interface EmailSender {
  sendVerificationEmail(to: string, verifyUrl: string): Promise<void>;
  sendPasswordResetEmail(to: string, resetUrl: string): Promise<void>;
}

export class AuthService {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly tokenRepo: IAuthTokenRepository,
    private readonly email: EmailSender,
  ) {}

  async signup(email: string, password: string, baseUrl: string): Promise<{ userId: string }> {
    const existing = await this.userRepo.findByEmail(email);
    if (existing) throw new ConflictError('이미 가입된 이메일입니다.');

    const user = await this.userRepo.create({
      email,
      name: null,
      avatarUrl: null,
      preferences: {},
      passwordHash: hashPassword(password),
      emailVerified: null,
    });

    await this.sendVerify(user.id, email, baseUrl);
    return { userId: user.id };
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await verifyAndConsumeToken(this.tokenRepo, token, 'email_verify');
    if (!userId) throw new ValidationError('유효하지 않거나 만료된 링크입니다.');
    await this.userRepo.update(userId, { emailVerified: new Date().toISOString() });
  }

  async resendVerification(userId: string, baseUrl: string): Promise<void> {
    const user = await this.userRepo.findById(userId);
    if (!user || user.emailVerified) return; // 이미 인증됐거나 미존재 → no-op
    await this.sendVerify(user.id, user.email, baseUrl);
  }

  async requestPasswordReset(email: string, baseUrl: string): Promise<void> {
    const user = await this.userRepo.findByEmail(email);
    if (!user) return; // enumeration 방지: 조용히 성공
    await this.tokenRepo.invalidateByUserAndType(user.id, 'password_reset', new Date().toISOString());
    const raw = await issueToken(this.tokenRepo, user.id, 'password_reset', PASSWORD_RESET_TTL_MS);
    await this.email.sendPasswordResetEmail(user.email, `${baseUrl}/reset-password?token=${raw}`);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const userId = await verifyAndConsumeToken(this.tokenRepo, token, 'password_reset');
    if (!userId) throw new ValidationError('유효하지 않거나 만료된 링크입니다.');
    await this.userRepo.update(userId, { passwordHash: hashPassword(newPassword) });
    await this.tokenRepo.invalidateByUserAndType(userId, 'password_reset', new Date().toISOString());
  }

  private async sendVerify(userId: string, email: string, baseUrl: string): Promise<void> {
    const raw = await issueToken(this.tokenRepo, userId, 'email_verify', EMAIL_VERIFY_TTL_MS);
    await this.email.sendVerificationEmail(email, `${baseUrl}/verify-email?token=${raw}`);
  }
}
