import type { SupabaseClient } from '@supabase/supabase-js';
import { UserRepository } from '@/repositories/userRepository';
import { eventBus } from '@/lib/events/eventBus';
import type { User } from '@/types/organization';

export class AuthService {
  private userRepo: UserRepository;

  constructor(private supabase: SupabaseClient) {
    this.userRepo = new UserRepository(supabase);
  }

  async getCurrentUser(): Promise<User | null> {
    const {
      data: { user: authUser },
    } = await this.supabase.auth.getUser();

    if (!authUser) return null;

    const dbUser = await this.userRepo.findById(authUser.id);
    if (dbUser) return dbUser;

    // First login — create user record with auth.uid() as id
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
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
  }
}
