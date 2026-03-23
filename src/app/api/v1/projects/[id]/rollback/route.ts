import { createClient } from '@/lib/supabase/server';
import { ProjectRepository } from '@/repositories/projectRepository';
import { CodeRepository } from '@/repositories/codeRepository';
import { eventBus } from '@/lib/events/eventBus';
import {
  AuthRequiredError,
  NotFoundError,
  ValidationError,
  handleApiError,
} from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id: projectId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new AuthRequiredError();

    // Verify ownership
    const projectRepo = new ProjectRepository(supabase);
    const project = await projectRepo.findById(projectId);
    if (!project || project.userId !== user.id) {
      throw new NotFoundError('프로젝트', projectId);
    }

    // Parse target version from body
    let targetVersion: number;
    try {
      const body = await request.json();
      if (typeof body.version !== 'number' || body.version < 1) {
        throw new ValidationError('유효한 버전 번호를 입력해주세요.');
      }
      targetVersion = body.version;
    } catch (err) {
      if (err instanceof SyntaxError) {
        return handleApiError(new ValidationError('잘못된 요청 형식입니다.'));
      }
      throw err;
    }

    // Verify the target version exists
    const codeRepo = new CodeRepository(supabase);
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
        ...targetCode.metadata,
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
        version: nextVersion,
        rolledBackFrom: targetVersion,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
