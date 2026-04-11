import type { IProjectRepository, ICatalogRepository, ICodeRepository } from '@/repositories/interfaces';
import { AiProviderFactory } from '@/providers/ai/AiProviderFactory';
import { buildSystemPrompt, buildUserPrompt } from '@/lib/ai/promptBuilder';
import { parseGeneratedCode } from '@/lib/ai/codeParser';
import { validateAll } from '@/lib/ai/codeValidator';
import { eventBus } from '@/lib/events/eventBus';
import { NotFoundError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type { GeneratedCode } from '@/types/project';

export class GenerationService {
  constructor(
    private projectRepo: IProjectRepository,
    private catalogRepo: ICatalogRepository,
    private codeRepo: ICodeRepository
  ) {}

  async generate(
    projectId: string,
    userId: string,
    onProgress?: (progress: number, message: string) => void
  ): Promise<GeneratedCode> {
    const project = await this.projectRepo.findById(projectId);
    if (!project || project.userId !== userId) {
      throw new NotFoundError('프로젝트', projectId);
    }

    // Get APIs
    const apiIds = await this.projectRepo.getProjectApiIds(projectId);
    const apis = await this.catalogRepo.findByIds(apiIds);

    onProgress?.(10, 'API 분석 중...');

    // Build prompt and generate
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(apis, project.context, project.id);

    onProgress?.(30, '코드 생성 중...');

    const provider = AiProviderFactory.createForTask('generation');
    const response = await provider.generateCode({
      system: systemPrompt,
      user: userPrompt,
    });

    onProgress?.(70, '디자인 적용 중...');

    const parsed = parseGeneratedCode(response.content);

    onProgress?.(90, '코드 검증 중...');

    const validation = validateAll(parsed.html, parsed.css, parsed.js);
    const nextVersion = await this.codeRepo.getNextVersion(projectId);

    const code = await this.codeRepo.create({
      projectId,
      version: nextVersion,
      codeHtml: parsed.html,
      codeCss: parsed.css,
      codeJs: parsed.js,
      framework: 'vanilla',
      aiProvider: response.provider,
      aiModel: response.model,
      aiPromptUsed: userPrompt,
      generationTimeMs: response.durationMs,
      tokenUsage: response.tokensUsed,
      dependencies: [],
      metadata: {
        securityCheckPassed: validation.passed,
        validationErrors: [...validation.errors, ...validation.warnings],
      },
    } as Omit<GeneratedCode, 'id' | 'createdAt'>);

    // C2: Update project status — compensating rollback if update fails after code was saved
    try {
      await this.projectRepo.update(projectId, { status: 'generated' } as Partial<typeof project>);
    } catch (updateError) {
      logger.error('Project status update failed, rolling back code record', {
        codeId: code.id,
        projectId,
      });
      try {
        await this.codeRepo.delete(code.id);
      } catch (deleteErr) {
        logger.error('Compensating rollback failed — orphaned code record', {
          codeId: code.id,
          deleteErr,
        });
      }
      throw updateError;
    }

    eventBus.emit({
      type: 'CODE_GENERATED',
      payload: {
        projectId,
        version: nextVersion,
        provider: response.provider,
        durationMs: response.durationMs,
      },
    });

    logger.info('Code generated', { projectId, version: nextVersion, provider: response.provider });

    return code;
  }
}
