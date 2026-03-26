import type { SupabaseClient } from '@supabase/supabase-js';
import { ProjectRepository } from '@/repositories/projectRepository';
import { CodeRepository } from '@/repositories/codeRepository';
import {
  DeployProviderFactory,
  type DeployPlatform,
} from '@/providers/deploy/DeployProviderFactory';
import { assembleHtml } from '@/lib/ai/codeParser';
import { eventBus } from '@/lib/events/eventBus';
import { NotFoundError, ValidationError, DeployError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';
import type { FileEntry } from '@/providers/deploy/IDeployProvider';

export class DeployService {
  private projectRepo: ProjectRepository;
  private codeRepo: CodeRepository;

  constructor(private supabase: SupabaseClient) {
    this.projectRepo = new ProjectRepository(supabase);
    this.codeRepo = new CodeRepository(supabase);
  }

  async deploy(
    projectId: string,
    userId: string,
    platform: DeployPlatform = 'railway',
    onProgress?: (progress: number, message: string) => void
  ): Promise<{ deployUrl: string; repoUrl?: string }> {
    const project = await this.projectRepo.findById(projectId);
    if (!project || project.userId !== userId) {
      throw new NotFoundError('프로젝트', projectId);
    }

    const code = await this.codeRepo.findByProject(projectId);
    if (!code) {
      throw new ValidationError('생성된 코드가 없습니다.');
    }

    eventBus.emit({ type: 'DEPLOYMENT_STARTED', payload: { projectId, platform } });

    onProgress?.(10, '배포 준비 중...');
    await this.projectRepo.update(projectId, { status: 'deploying' } as Partial<typeof project>);

    try {
      const provider = DeployProviderFactory.create(platform);

      // Step 1: Create project/repo
      onProgress?.(20, 'GitHub 저장소 생성 중...');
      const repoName = projectId.slice(0, 8);
      const { projectId: deployProjectId, repoUrl } = await provider.createProject(repoName);

      // Step 2: Push generated code files
      onProgress?.(40, '코드 업로드 중...');
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
      onProgress?.(60, '환경 설정 중...');
      await provider.setEnvironment(deployProjectId, {});

      // Step 4: Deploy
      onProgress?.(70, `${platform}에 배포 중...`);
      const result = await provider.deploy(deployProjectId);

      if (result.status === 'error') {
        throw new DeployError('배포에 실패했습니다.');
      }

      onProgress?.(90, '배포 마무리 중...');

      const deployUrl = result.url;

      await this.supabase
        .from('projects')
        .update({
          status: 'deployed',
          deploy_url: deployUrl,
          deploy_platform: platform,
          repo_url: repoUrl ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId);

      eventBus.emit({
        type: 'DEPLOYMENT_COMPLETED',
        payload: { projectId, url: deployUrl, platform },
      });

      logger.info('Deployment completed', { projectId, platform, deployUrl });

      return { deployUrl, repoUrl };
    } catch (error) {
      await this.supabase
        .from('projects')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId);

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
