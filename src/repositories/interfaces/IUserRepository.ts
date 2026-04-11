import type { IBaseRepository } from './IBaseRepository';
import type { User } from '@/types/organization';

export interface IUserRepository extends IBaseRepository<User> {
  createWithAuthId(authId: string, input: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User>;
  findByEmail(email: string): Promise<User | null>;
}
