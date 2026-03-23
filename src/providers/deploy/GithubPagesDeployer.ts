import type { IDeployProvider, FileEntry, DeployResult } from './IDeployProvider';
import * as github from '@/lib/deploy/githubService';
import { logger } from '@/lib/utils/logger';

export class GithubPagesDeployer implements IDeployProvider {
  readonly name = 'github_pages';
  readonly supportedFeatures = ['static_only'] as const;

  private repoMap = new Map<string, string>(); // projectId -> repoFullName

  async createProject(name: string): Promise<{ projectId: string; repoUrl?: string }> {
    const repoName = `svc-${name}`;
    const { repoUrl, fullName } = await github.createRepository(repoName);

    this.repoMap.set(name, fullName);

    return { projectId: fullName, repoUrl };
  }

  async pushFiles(projectId: string, files: FileEntry[]): Promise<void> {
    const repoFullName = this.resolveRepo(projectId);
    await github.pushCode(repoFullName, files);
  }

  async setEnvironment(projectId: string, env: Record<string, string>): Promise<void> {
    const repoFullName = this.resolveRepo(projectId);
    await github.setSecrets(repoFullName, env);
  }

  async deploy(projectId: string): Promise<DeployResult> {
    const repoFullName = this.resolveRepo(projectId);

    const pagesUrl = await github.enableGithubPages(repoFullName, 'main', '/');

    logger.info('GitHub Pages deployment completed', { repoFullName, pagesUrl });

    return {
      deploymentId: repoFullName,
      url: pagesUrl,
      platform: 'github_pages',
      status: 'ready',
    };
  }

  async getStatus(deploymentId: string): Promise<DeployResult> {
    // GitHub Pages doesn't have a real-time status API;
    // once enabled, it's considered ready
    return {
      deploymentId,
      url: `https://${deploymentId.split('/')[0]}.github.io/${deploymentId.split('/')[1]}`,
      platform: 'github_pages',
      status: 'ready',
    };
  }

  async rollback(projectId: string, _version: number): Promise<DeployResult> {
    // GitHub Pages doesn't support native rollback;
    // re-push previous version code to trigger rebuild
    logger.warn('GitHub Pages rollback requires re-pushing code', { projectId });
    return this.getStatus(projectId);
  }

  async deleteProject(projectId: string): Promise<void> {
    // Deleting the repo is destructive; just log for now
    logger.warn('GitHub Pages project deletion not implemented (requires repo deletion)', {
      projectId,
    });
  }

  private resolveRepo(projectId: string): string {
    // projectId may be the repoFullName itself or a key
    if (projectId.includes('/')) return projectId;
    const fullName = this.repoMap.get(projectId);
    if (!fullName) throw new Error(`Repo not found for project: ${projectId}`);
    return fullName;
  }
}
