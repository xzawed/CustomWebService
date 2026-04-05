import { createClient } from '@/lib/supabase/server';
import { GalleryService } from '@/services/galleryService';
import { AuthRequiredError, ValidationError, handleApiError, jsonResponse } from '@/lib/utils/errors';
import { z } from 'zod/v4';

const idSchema = z.string().uuid();

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  _request: Request,
  { params }: RouteContext
): Promise<Response> {
  try {
    const { id } = await params;
    if (!idSchema.safeParse(id).success) throw new ValidationError('유효하지 않은 프로젝트 ID입니다.');

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthRequiredError();

    const service = new GalleryService(supabase);
    const result = await service.likeProject(id, user.id);

    return jsonResponse({ success: true, data: result });
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
    if (!idSchema.safeParse(id).success) throw new ValidationError('유효하지 않은 프로젝트 ID입니다.');

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthRequiredError();

    const service = new GalleryService(supabase);
    const result = await service.unlikeProject(id, user.id);

    return jsonResponse({ success: true, data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
