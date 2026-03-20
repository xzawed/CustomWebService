import type { SupabaseClient } from '@supabase/supabase-js';
import { ProjectRepository } from '@/repositories/projectRepository';
import { CodeRepository } from '@/repositories/codeRepository';
import { eventBus } from '@/lib/events/eventBus';
import { NotFoundError, ValidationError } from '@/lib/utils/errors';
import { logger } from '@/lib/utils/logger';

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
    platform: string = 'vercel',
    onProgress?: (progress: number, message: string) => void
  ): Promise<{ deployUrl: string }> {
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

    onProgress?.(50, `${platform}에 배포 중...`);

    // TODO: Use IDeployProvider implementation when available
    const deployUrl = `https://svc-${projectId.slice(0, 8)}.vercel.app`;

    onProgress?.(90, '배포 마무리 중...');

    await this.supabase
      .from('projects')
      .update({
        status: 'deployed',
        deploy_url: deployUrl,
        deploy_platform: platform,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId);

    eventBus.emit({
      type: 'DEPLOYMENT_COMPLETED',
      payload: { projectId, url: deployUrl, platform },
    });

    logger.info('Deployment completed', { projectId, platform, deployUrl });

    return { deployUrl };
  }
}
