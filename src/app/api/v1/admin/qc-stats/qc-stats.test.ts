import { describe, it, expect, vi, beforeEach } from 'vitest';

// 레포는 factory를 통해 주입된다(provider-무관). vi.hoisted로 mock 팩토리에서 참조한다.
const { codeRepo, eventRepo } = vi.hoisted(() => ({
  codeRepo: { findMetadataByDateRange: vi.fn() },
  eventRepo: { countByTypeSince: vi.fn(), findPayloadsByTypeSince: vi.fn() },
}));

vi.mock('@/lib/config/providers', () => ({ getDbProvider: vi.fn(() => 'supabase') }));
vi.mock('@/repositories/factory', () => ({
  createCodeRepository: vi.fn(() => codeRepo),
  createEventRepository: vi.fn(() => eventRepo),
}));
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: vi.fn().mockResolvedValue({}) }));

vi.mock('@/lib/utils/adminAuth', () => ({
  adminCorsHeaders: {},
  verifyAdminKey: vi.fn(),
  withAdminCors: vi.fn().mockImplementation((res: Response) => res),
}));

import { GET } from './route';

function makeRequest(search = '') {
  return new Request(`http://localhost/api/v1/admin/qc-stats${search}`);
}

describe('GET /api/v1/admin/qc-stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    codeRepo.findMetadataByDateRange.mockResolvedValue([]);
    eventRepo.countByTypeSince.mockResolvedValue(0);
    eventRepo.findPayloadsByTypeSince.mockResolvedValue([]);
  });

  it('days 파라미터 미설정 시 정상 응답한다', async () => {
    const response = await GET(makeRequest());
    expect(response.status).toBe(200);
  });

  it('days=abc (NaN) 시 기본값 7일을 사용하여 정상 응답한다', async () => {
    const response = await GET(makeRequest('?days=abc'));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.period.days).toBe(7);
  });

  it('days=-5 (음수) 시 기본값 7일을 사용하여 정상 응답한다', async () => {
    const response = await GET(makeRequest('?days=-5'));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.period.days).toBe(7);
  });

  it('days=0 시 기본값 7일을 사용한다', async () => {
    const response = await GET(makeRequest('?days=0'));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.period.days).toBe(7);
  });

  it('days=14 (유효값) 시 해당 기간을 사용한다', async () => {
    const response = await GET(makeRequest('?days=14'));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.period.days).toBe(14);
  });

  it('집계 메서드가 STAGE_SKIPPED/QUALITY_LOOP payload를 반영한다', async () => {
    codeRepo.findMetadataByDateRange.mockResolvedValue([
      { metadata: { structuralScore: 80, mobileScore: 70 } },
    ]);
    eventRepo.countByTypeSince.mockImplementation(async (type: string) =>
      type === 'CODE_GENERATION_FAILED' ? 2 : 0,
    );
    eventRepo.findPayloadsByTypeSince.mockImplementation(async (type: string) =>
      type === 'STAGE_SKIPPED'
        ? [{ stage: 'stage2' }, { stage: 'stage3' }, { stage: 'stage2' }]
        : [{ iterations: 2, improved: true }],
    );

    const response = await GET(makeRequest());
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.failureCount).toBe(2);
    expect(json.data.stage2SkipCount).toBe(2);
    expect(json.data.stage3SkipCount).toBe(1);
    expect(json.data.avgQualityLoopIterations).toBe(2);
    expect(json.data.qualityLoopImprovementRate).toBe(1);
  });

  it('집계 쿼리 에러 시 0 메트릭으로 은폐하지 않고 500을 반환한다', async () => {
    eventRepo.countByTypeSince.mockRejectedValueOnce(new Error('db down'));
    const response = await GET(makeRequest());
    expect(response.status).toBe(500);
  });
});
