import type { IProjectRepository, ICodeRepository } from '@/repositories/interfaces';
import {
  DeployProviderFactory,
  type DeployPlatform,
} from '@/providers/deploy/DeployProviderFactory';
import { assembleHtml } from '@/lib/ai/codeParser';
import { eventBus } from '@/lib/events/eventBus';
import { NotFoundError, ValidationError, DeployError } from '@/lib/utils/errors';
import { assertOwner } from '@/lib/auth/authorize';
import { logger } from '@/lib/utils/logger';
import type { FileEntry } from '@/providers/deploy/IDeployProvider';
import { t } from '@/lib/i18n';

export class DeployService {
  constructor(
    private projectRepo: IProjectRepository,
    private codeRepo: ICodeRepository
  ) {}

  async deploy(
    projectId: string,
    userId: string,
    platform: DeployPlatform = 'railway',
    onProgress?: (progress: number, message: string) => void
  ): Promise<{ deployUrl: string; repoUrl?: string }> {
    const project = await this.projectRepo.findById(projectId);
    if (!project) throw new NotFoundError(t('project.notFound'), projectId);
    assertOwner(project, userId);

    const code = await this.codeRepo.findByProject(projectId);
    if (!code) {
      throw new ValidationError(t('deploy.validation.noCode'));
    }

    eventBus.emit({ type: 'DEPLOYMENT_STARTED', payload: { projectId, platform } });

    const previousStatus = project.status;
    onProgress?.(10, t('deploy.progress.preparing'));
    await this.projectRepo.update(projectId, { status: 'deploying' } as Partial<typeof project>);

    try {
      const provider = DeployProviderFactory.create(platform);

      // Step 1: Create project/repo
      onProgress?.(20, t('deploy.progress.creatingRepo'));
      const repoName = projectId.slice(0, 8);
      const { projectId: deployProjectId, repoUrl } = await provider.createProject(repoName);

      // Step 2: Push generated code files
      onProgress?.(40, t('deploy.progress.uploading'));
      const fullHtml = assembleHtml({ html: code.codeHtml, css: code.codeCss, js: code.codeJs });
      const files: FileEntry[] = [{ path: 'index.html', content: fullHtml }];
      if (code.codeCss) {
        files.push({ path: 'styles.css', content: code.codeCss });
      }
      if (code.codeJs) {
        files.push({ path: 'script.js', content: code.codeJs });
      }
      await provider.pushFiles(deployProjectId, files);

      // Step 3: Set environment variables if needed
      onProgress?.(60, t('deploy.progress.configuring'));
      await provider.setEnvironment(deployProjectId, {});

      // Step 4: Deploy
      onProgress?.(70, t('deploy.progress.deploying', { platform }));
      const result = await provider.deploy(deployProjectId);

      if (result.status === 'error') {
        throw new DeployError();
      }

      onProgress?.(90, t('deploy.progress.finalizing'));

      const deployUrl = result.url;

      await this.projectRepo.update(projectId, {
        status: 'deployed',
        deployUrl,
        deployPlatform: platform,
        repoUrl: repoUrl ?? null,
      } as Parameters<typeof this.projectRepo.update>[1]);

      eventBus.emit({
        type: 'DEPLOYMENT_COMPLETED',
        payload: { projectId, url: deployUrl, platform },
      });

      logger.info('Deployment completed', { projectId, platform, deployUrl });

      return { deployUrl, repoUrl };
    } catch (error) {
      // Restore the previous status so user can retry deployment
      await this.projectRepo.update(projectId, {
        status: previousStatus,
      } as Parameters<typeof this.projectRepo.update>[1]);

      eventBus.emit({
        type: 'DEPLOYMENT_FAILED',
        payload: {
          projectId,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      });

      throw error;
    }
  }
}
