import { getDbProvider } from '@/lib/config/providers';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth/index';
import { createProjectService } from '@/services/factory';
import { AuthRequiredError, handleApiError, jsonResponse } from '@/lib/utils/errors';
import { z } from 'zod/v4';

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  context: z.string().min(50).max(2000),
  apiIds: z.array(z.string().uuid()).min(1).max(5),
  organizationId: z.string().uuid().optional(),
  designPreferences: z
    .object({
      mood: z.enum(['auto', 'light', 'dark', 'warm', 'colorful', 'minimal']),
      audience: z.enum(['general', 'business', 'youth', 'premium']),
      layoutPreference: z.enum(['auto', 'dashboard', 'gallery', 'feed', 'landing', 'tool']),
    })
    .optional(),
});

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();

    const supabase = getDbProvider() === 'supabase' ? await createClient() : undefined;
    const service = createProjectService(supabase);
    const projects = await service.getByUserId(user.id);

    return jsonResponse({ success: true, data: projects });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();

    const body = await request.json();
    const validated = createProjectSchema.parse(body);

    const supabase = getDbProvider() === 'supabase' ? await createClient() : undefined;
    const service = createProjectService(supabase);
    const project = await service.create(user.id, validated);

    return jsonResponse({ success: true, data: project }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
