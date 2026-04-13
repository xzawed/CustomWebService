import type { SupabaseClient } from '@supabase/supabase-js';
import type { IUserRepository } from '@/repositories/interfaces';
import { eventBus } from '@/lib/events/eventBus';
import type { User } from '@/types/user';

export class AuthService {
  constructor(
    private supabase: SupabaseClient,
    private userRepo: IUserRepository
  ) {}

  async getCurrentUser(): Promise<User | null> {
    const {
      data: { user: authUser },
    } = await this.supabase.auth.getUser();

    if (!authUser) return null;

    const dbUser = await this.userRepo.findById(authUser.id);
    if (dbUser) return dbUser;

    // First login — create user record with auth.uid() as id
    // Use upsert-style error handling to handle race condition (concurrent first logins)
    try {
      const newUser = await this.userRepo.createWithAuthId(authUser.id, {
        email: authUser.email ?? '',
        name:
          (authUser.user_metadata?.full_name as string) ??
          (authUser.user_metadata?.name as string) ??
          null,
        avatarUrl: (authUser.user_metadata?.avatar_url as string) ?? null,
        preferences: {},
      } as Omit<User, 'id' | 'createdAt' | 'updatedAt'>);

      eventBus.emit({ type: 'USER_SIGNED_UP', payload: { userId: newUser.id } });

      return newUser;
    } catch (err) {
      // Duplicate key (23505): another request already created the record — fetch it
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: unknown }).code === '23505'
      ) {
        const existing = await this.userRepo.findById(authUser.id);
        if (existing) return existing;
      }
      throw err;
    }
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
  }
}
