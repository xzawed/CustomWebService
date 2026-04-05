import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { GalleryRepository } from '@/repositories/galleryRepository';
import { AuthRequiredError, ValidationError, handleApiError } from '@/lib/utils/errors';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  _request: Request,
  { params }: RouteContext
): Promise<Response> {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) throw new ValidationError('유효하지 않은 프로젝트 ID입니다.');

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthRequiredError();

    const repo = new GalleryRepository(supabase);
    const { liked, newCount } = await repo.toggleLike(id, user.id);

    return NextResponse.json({ success: true, data: { liked, likesCount: newCount } });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: RouteContext
): Promise<Response> {
  try {
    const { id } = await params;
    if (!UUID_RE.test(id)) throw new ValidationError('유효하지 않은 프로젝트 ID입니다.');

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthRequiredError();

    const repo = new GalleryRepository(supabase);
    const { liked, newCount } = await repo.toggleLike(id, user.id);

    return NextResponse.json({ success: true, data: { liked, likesCount: newCount } });
  } catch (error) {
    return handleApiError(error);
  }
}
