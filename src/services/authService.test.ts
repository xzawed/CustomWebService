import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService } from './authService';
import type { IUserRepository } from '@/repositories/interfaces';
import type { User } from '@/types/user';

vi.mock('@/lib/events/eventBus', () => ({
  eventBus: { emit: vi.fn() },
}));

const mockDbUser: User = {
  id: 'user-1',
  email: 'test@test.com',
  name: 'Test User',
  avatarUrl: null,
  preferences: {},
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const mockAuthUser = {
  id: 'user-1',
  email: 'test@test.com',
  user_metadata: { full_name: 'Test User' },
};

function makeSupabase(authUser: typeof mockAuthUser | null = mockAuthUser) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: authUser } }),
      signOut: vi.fn().mockResolvedValue({}),
    },
  };
}

function makeUserRepo(dbUser: User | null = mockDbUser): IUserRepository {
  return {
    findById: vi.fn().mockResolvedValue(dbUser),
    createWithAuthId: vi.fn().mockResolvedValue(mockDbUser),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as unknown as IUserRepository;
}

describe('AuthService.getCurrentUser()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('인증된 사용자가 없으면 null을 반환한다', async () => {
    const supabase = makeSupabase(null);
    const userRepo = makeUserRepo();
    const service = new AuthService(supabase as never, userRepo);

    const result = await service.getCurrentUser();
    expect(result).toBeNull();
  });

  it('DB에 기존 유저가 있으면 DB 유저를 반환한다', async () => {
    const supabase = makeSupabase();
    const userRepo = makeUserRepo(mockDbUser);
    const service = new AuthService(supabase as never, userRepo);

    const result = await service.getCurrentUser();
    expect(result).toEqual(mockDbUser);
    expect(userRepo.createWithAuthId).not.toHaveBeenCalled();
  });

  it('첫 로그인이면 createWithAuthId를 호출하고 USER_SIGNED_UP 이벤트를 발행한다', async () => {
    const supabase = makeSupabase();
    const userRepo = makeUserRepo(null); // DB에 없음
    const service = new AuthService(supabase as never, userRepo);

    const { eventBus } = await import('@/lib/events/eventBus');
    const result = await service.getCurrentUser();

    expect(userRepo.createWithAuthId).toHaveBeenCalledWith('user-1', expect.objectContaining({
      email: 'test@test.com',
      name: 'Test User',
    }));
    expect(eventBus.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'USER_SIGNED_UP' }));
    expect(result).toEqual(mockDbUser);
  });

  it('동시 첫 로그인 경합(23505)이면 기존 유저를 조회하여 반환한다', async () => {
    const supabase = makeSupabase();
    const userRepo = makeUserRepo(null);
    // 첫 번째 findById → null, 두 번째 findById → mockDbUser (경합 후 생성된 레코드)
    vi.mocked(userRepo.findById)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(mockDbUser);
    vi.mocked(userRepo.createWithAuthId).mockRejectedValue({ code: '23505' });

    const service = new AuthService(supabase as never, userRepo);
    const result = await service.getCurrentUser();

    expect(result).toEqual(mockDbUser);
    expect(userRepo.findById).toHaveBeenCalledTimes(2);
  });

  it('23505 외 에러는 그대로 re-throw한다', async () => {
    const supabase = makeSupabase();
    const userRepo = makeUserRepo(null);
    vi.mocked(userRepo.createWithAuthId).mockRejectedValue(new Error('DB connection failed'));

    const service = new AuthService(supabase as never, userRepo);

    await expect(service.getCurrentUser()).rejects.toThrow('DB connection failed');
  });
});

describe('AuthService.signOut()', () => {
  it('supabase.auth.signOut()을 호출한다', async () => {
    const supabase = makeSupabase();
    const userRepo = makeUserRepo();
    const service = new AuthService(supabase as never, userRepo);

    await service.signOut();
    expect(supabase.auth.signOut).toHaveBeenCalledOnce();
  });
});
