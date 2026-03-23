import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GenerationService } from './generationService'
import { RateLimitError, NotFoundError } from '@/lib/utils/errors'

vi.mock('@/repositories/projectRepository', () => ({
  ProjectRepository: vi.fn().mockImplementation(() => ({
    findById: vi.fn(),
    getProjectApiIds: vi.fn(),
    countTodayGenerations: vi.fn(),
    update: vi.fn(),
  })),
}))

vi.mock('@/repositories/catalogRepository', () => ({
  CatalogRepository: vi.fn().mockImplementation(() => ({
    findByIds: vi.fn(),
  })),
}))

vi.mock('@/repositories/codeRepository', () => ({
  CodeRepository: vi.fn().mockImplementation(() => ({
    getNextVersion: vi.fn(),
    create: vi.fn(),
  })),
}))

vi.mock('@/providers/ai/AiProviderFactory', () => ({
  AiProviderFactory: {
    create: vi.fn().mockReturnValue({
      generateCode: vi.fn().mockResolvedValue({
        content: '```html\n<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width"><title>Test</title></head><body><p>test</p></body></html>\n```\n```css\nbody{}\n```\n```javascript\nconst x=1\n```',
        provider: 'grok',
        model: 'grok-3-mini',
        durationMs: 1000,
        tokensUsed: { prompt: 100, completion: 200 },
      }),
    }),
  },
}))

vi.mock('@/lib/events/eventBus', () => ({
  eventBus: { emit: vi.fn() },
}))

const makeSupabase = () => ({} as never)

describe('GenerationService.checkDailyLimit()', () => {
  let service: GenerationService
  let projectRepo: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    service = new GenerationService(makeSupabase())
    const { ProjectRepository } = await import('@/repositories/projectRepository')
    projectRepo = (ProjectRepository as ReturnType<typeof vi.fn>).mock.results[0].value
  })

  it('일일 한도(10회)를 초과하면 RateLimitError를 던진다', async () => {
    projectRepo.countTodayGenerations.mockResolvedValue(10)
    await expect(service.checkDailyLimit('user-1')).rejects.toThrow(RateLimitError)
  })

  it('한도 미만이면 통과한다', async () => {
    projectRepo.countTodayGenerations.mockResolvedValue(9)
    await expect(service.checkDailyLimit('user-1')).resolves.toBeUndefined()
  })
})

describe('GenerationService.generate()', () => {
  let service: GenerationService
  let projectRepo: ReturnType<typeof vi.fn>
  let catalogRepo: ReturnType<typeof vi.fn>
  let codeRepo: ReturnType<typeof vi.fn>

  const mockProject = {
    id: 'proj-1',
    userId: 'user-1',
    context: '실시간 날씨를 보여주는 대시보드를 만들어주세요.',
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    service = new GenerationService(makeSupabase())
    const { ProjectRepository } = await import('@/repositories/projectRepository')
    const { CatalogRepository } = await import('@/repositories/catalogRepository')
    const { CodeRepository } = await import('@/repositories/codeRepository')
    projectRepo = (ProjectRepository as ReturnType<typeof vi.fn>).mock.results[0].value
    catalogRepo = (CatalogRepository as ReturnType<typeof vi.fn>).mock.results[0].value
    codeRepo = (CodeRepository as ReturnType<typeof vi.fn>).mock.results[0].value

    projectRepo.findById.mockResolvedValue(mockProject)
    projectRepo.getProjectApiIds.mockResolvedValue(['api-1'])
    projectRepo.update.mockResolvedValue(mockProject)
    catalogRepo.findByIds.mockResolvedValue([{ id: 'api-1', name: '날씨 API', baseUrl: 'https://api.weather.com', authType: 'none', endpoints: [] }])
    codeRepo.getNextVersion.mockResolvedValue(1)
    codeRepo.create.mockResolvedValue({ id: 'code-1', version: 1, projectId: 'proj-1' })
  })

  it('존재하지 않는 프로젝트면 NotFoundError를 던진다', async () => {
    projectRepo.findById.mockResolvedValue(null)
    await expect(service.generate('missing', 'user-1')).rejects.toThrow(NotFoundError)
  })

  it('타인의 프로젝트면 NotFoundError를 던진다', async () => {
    projectRepo.findById.mockResolvedValue({ ...mockProject, userId: 'user-2' })
    await expect(service.generate('proj-1', 'user-1')).rejects.toThrow(NotFoundError)
  })

  it('정상 생성 시 onProgress 콜백이 호출된다', async () => {
    const onProgress = vi.fn()
    await service.generate('proj-1', 'user-1', onProgress)
    expect(onProgress).toHaveBeenCalledWith(10, expect.any(String))
    expect(onProgress).toHaveBeenCalledWith(30, expect.any(String))
    expect(onProgress).toHaveBeenCalledWith(70, expect.any(String))
    expect(onProgress).toHaveBeenCalledWith(90, expect.any(String))
  })

  it('정상 생성 시 code가 DB에 저장된다', async () => {
    await service.generate('proj-1', 'user-1')
    expect(codeRepo.create).toHaveBeenCalledOnce()
  })

  it('정상 생성 시 CODE_GENERATED 이벤트가 발행된다', async () => {
    const { eventBus } = await import('@/lib/events/eventBus')
    await service.generate('proj-1', 'user-1')
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'CODE_GENERATED' })
    )
  })
})
