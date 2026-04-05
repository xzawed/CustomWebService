import { createClient } from '@/lib/supabase/server';
import { GalleryService } from '@/services/galleryService';
import { handleApiError, jsonResponse } from '@/lib/utils/errors';
import { z } from 'zod/v4';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  category: z.string().optional(),
  sortBy: z.enum(['popular', 'newest']).default('newest'),
  search: z
    .string()
    .max(200)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      page: searchParams.get('page') ?? undefined,
      pageSize: searchParams.get('pageSize') ?? undefined,
      category: searchParams.get('category') ?? undefined,
      sortBy: searchParams.get('sortBy') ?? undefined,
      search: searchParams.get('search') ?? undefined,
    });

    const supabase = await createClient();

    // Auth is optional — unauthenticated users can browse the gallery
    let currentUserId: string | undefined;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      currentUserId = user?.id;
    } catch {
      // Not authenticated — continue without user context
    }

    const service = new GalleryService(supabase);
    const galleryPage = await service.getGallery(
      { category: params.category, sortBy: params.sortBy, search: params.search },
      { page: params.page, pageSize: params.pageSize, currentUserId }
    );

    return jsonResponse({ success: true, data: galleryPage });
  } catch (error) {
    return handleApiError(error);
  }
}
