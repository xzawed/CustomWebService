import { describe, it, expect, vi, beforeEach } from 'vitest'

// Supabase mock
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}))

// ProjectService mock
vi.mock('@/services/projectService', () => ({
  ProjectService: vi.fn().mockImplementation(() => ({
    getByUserId: vi.fn(),
    create: vi.fn(),
    getById: vi.fn(),
    delete: vi.fn(),
  })),
}))

const mockUser = { id: 'user-1', email: 'test@test.com' }
const mockProject = {
  id: 'proj-1',
  name: '테스트 프로젝트',
  userId: 'user-1',
  context: 'a'.repeat(50),
  status: 'draft',
}

function makeSupabaseMock(user: typeof mockUser | null = mockUser) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
  }
}

describe('GET /api/v1/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('비로그인 시 401을 반환한다', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock(null) as never)

    const { GET } = await import('@/app/api/v1/projects/route')
    const response = await GET()
    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('AUTH_REQUIRED')
  })

  it('로그인 시 사용자 프로젝트 목록을 반환한다', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)

    const { ProjectService } = await import('@/services/projectService')
    const mockInstance = (ProjectService as ReturnType<typeof vi.fn>).mock.results[0]?.value
      ?? { getByUserId: vi.fn().mockResolvedValue([mockProject]) }
    ;(ProjectService as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      getByUserId: vi.fn().mockResolvedValue([mockProject]),
    }))

    const { GET } = await import('@/app/api/v1/projects/route')
    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)

    void mockInstance
  })
})

describe('POST /api/v1/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  const validBody = {
    name: '날씨 앱',
    context: 'a'.repeat(50),
    apiIds: ['550e8400-e29b-41d4-a716-446655440001'],
  }

  it('비로그인 시 401을 반환한다', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock(null) as never)

    const { POST } = await import('@/app/api/v1/projects/route')
    const request = new Request('http://localhost/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify(validBody),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it('name이 없으면 400을 반환한다', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)

    const { POST } = await import('@/app/api/v1/projects/route')
    const request = new Request('http://localhost/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({ ...validBody, name: '' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('context가 50자 미만이면 400을 반환한다', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)

    const { POST } = await import('@/app/api/v1/projects/route')
    const request = new Request('http://localhost/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({ ...validBody, context: 'short' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('apiIds가 6개 이상이면 400을 반환한다', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)

    const { POST } = await import('@/app/api/v1/projects/route')
    const sixIds = Array.from(
      { length: 6 },
      (_, i) => `550e8400-e29b-41d4-a716-44665544000${i + 1}`
    )
    const request = new Request('http://localhost/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({ ...validBody, apiIds: sixIds }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('정상 요청 시 201과 프로젝트를 반환한다', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)

    const { ProjectService } = await import('@/services/projectService')
    ;(ProjectService as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      create: vi.fn().mockResolvedValue(mockProject),
    }))

    const { POST } = await import('@/app/api/v1/projects/route')
    const request = new Request('http://localhost/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify(validBody),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('proj-1')
  })
})
