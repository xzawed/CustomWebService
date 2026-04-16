import { getDbProvider } from '@/lib/config/providers';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/auth/index';
import { createProjectRepository, createCodeRepository } from '@/repositories/factory';
import { eventBus } from '@/lib/events/eventBus';
import {
  AuthRequiredError,
  NotFoundError,
  ValidationError,
  handleApiError,
} from '@/lib/utils/errors';
import { rollbackSchema } from '@/types/schemas';
import { logger } from '@/lib/utils/logger';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id: projectId } = await params;
    const user = await getAuthUser();
    if (!user) throw new AuthRequiredError();

    const supabase = getDbProvider() === 'supabase' ? await createClient() : undefined;

    // Verify ownership
    const projectRepo = createProjectRepository(supabase);
    const project = await projectRepo.findById(projectId);
    if (!project || project.userId !== user.id) {
      throw new NotFoundError('프로젝트', projectId);
    }

    // Parse target version from body
    let targetVersion: number;
    try {
      const body = await request.json();
      const parsed = rollbackSchema.parse(body);
      targetVersion = parsed.version;
    } catch (err) {
      if (err instanceof SyntaxError) {
        return handleApiError(new ValidationError('잘못된 요청 형식입니다.'));
      }
      throw err;
    }

    // Verify the target version exists
    const codeRepo = createCodeRepository(supabase);
    const targetCode = await codeRepo.findByProject(projectId, targetVersion);
    if (!targetCode) {
      throw new NotFoundError('코드 버전', `${targetVersion}`);
    }

    // Create a new version with the content of the target version (rollback = new version with old content)
    const nextVersion = await codeRepo.getNextVersion(projectId);
    const rolledBackCode = await codeRepo.create({
      projectId,
      version: nextVersion,
      codeHtml: targetCode.codeHtml,
      codeCss: targetCode.codeCss,
      codeJs: targetCode.codeJs,
      framework: targetCode.framework,
      aiProvider: targetCode.aiProvider,
      aiModel: targetCode.aiModel,
      aiPromptUsed: targetCode.aiPromptUsed,
      generationTimeMs: null,
      tokenUsage: null,
      dependencies: targetCode.dependencies,
      metadata: {
        ...(targetCode.metadata ?? {}),
        rolledBackFrom: targetVersion,
      },
    } as Omit<typeof targetCode, 'id' | 'createdAt'>);

    // Update project status
    await projectRepo.update(projectId, { status: 'generated' } as Partial<typeof project>);

    eventBus.emit({
      type: 'CODE_GENERATED',
      payload: {
        projectId,
        version: nextVersion,
        provider: 'rollback',
        durationMs: 0,
      },
    });

    logger.info('Project rolled back', {
      projectId,
      fromVersion: targetVersion,
      newVersion: nextVersion,
    });

    return Response.json({
      success: true,
      data: {
        projectId,
        version: rolledBackCode.version,
        rolledBackFrom: targetVersion,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
