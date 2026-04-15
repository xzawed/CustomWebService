import { getDbProvider } from '@/lib/config/providers';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth/index';
import { createProjectRepository } from '@/repositories/factory';
import {
  AuthRequiredError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  handleApiError,
  jsonResponse,
} from '@/lib/utils/errors';
import { isValidSlug, RESERVED_SLUGS } from '@/lib/utils/slugify';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;

    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError('요청 본문을 파싱할 수 없습니다.');
    }

    const slug =
      body && typeof body === 'object' && 'slug' in body
        ? (body as Record<string, unknown>).slug
        : undefined;

    if (!slug || typeof slug !== 'string') {
      throw new ValidationError('slug가 필요합니다.');
    }

    const supabase = getDbProvider() === 'supabase' ? await createClient() : undefined;
    const repo = createProjectRepository(supabase);

    const project = await repo.findById(id);
    if (!project) throw new NotFoundError('프로젝트', id);
    if (project.userId !== user.id) throw new ForbiddenError();

    // 형식/예약어 검사
    if (!isValidSlug(slug)) {
      if (RESERVED_SLUGS.has(slug)) {
        return jsonResponse({ success: true, data: { available: false, reason: 'reserved' } });
      }
      return jsonResponse({ success: true, data: { available: false, reason: 'invalid' } });
    }

    // 중복 검사 (자기 자신 제외)
    const existing = await repo.findBySlug(slug);
    if (existing && existing.id !== id) {
      return jsonResponse({ success: true, data: { available: false, reason: 'taken' } });
    }

    return jsonResponse({ success: true, data: { available: true } });
  } catch (error) {
    return handleApiError(error);
  }
}
