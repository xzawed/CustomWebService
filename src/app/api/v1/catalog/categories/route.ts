import { createClient } from '@/lib/supabase/server';
import { CatalogService } from '@/services/catalogService';
import { handleApiError } from '@/lib/utils/errors';

export async function GET() {
  try {
    const supabase = await createClient();
    const service = new CatalogService(supabase);
    const categories = await service.getCategories();

    return Response.json({ success: true, data: categories });
  } catch (error) {
    return handleApiError(error);
  }
}
