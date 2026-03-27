import { createClient } from '@/lib/supabase/server';
import { ProjectService } from '@/services/projectService';
import { AuthService } from '@/services/authService';
import { AuthRequiredError, handleApiError } from '@/lib/utils/errors';
import { z } from 'zod/v4';

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  context: z.string().min(50).max(2000),
  apiIds: z.array(z.string().uuid()).min(1).max(5),
  organizationId: z.string().uuid().optional(),
});

export async function GET() {
  try {
    const supabase = await createClient();
    const authService = new AuthService(supabase);
    const user = await authService.getCurrentUser();
    if (!user) throw new AuthRequiredError();

    const service = new ProjectService(supabase);
    const projects = await service.getByUserId(user.id);

    return Response.json({ success: true, data: projects });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const authService = new AuthService(supabase);
    const user = await authService.getCurrentUser();
    if (!user) throw new AuthRequiredError();

    const body = await request.json();
    const validated = createProjectSchema.parse(body);

    const service = new ProjectService(supabase);
    const project = await service.create(user.id, validated);

    return Response.json({ success: true, data: project }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
