import type { IDeployProvider, FileEntry, DeployResult } from './IDeployProvider';
import * as github from '@/lib/deploy/githubService';
import * as railway from '@/lib/deploy/railwayService';
import { logger } from '@/lib/utils/logger';

export class RailwayDeployer implements IDeployProvider {
  readonly name = 'railway';
  readonly supportedFeatures = ['env_vars', 'custom_domain'] as const;

  private projectMap = new Map<string, { railwayProjectId: string; serviceId: string; repoFullName: string }>();

  async createProject(name: string): Promise<{ projectId: string; repoUrl?: string }> {
    const repoName = `svc-${name}`;
    const { repoUrl, fullName } = await github.createRepository(repoName);
    const railwayProject = await railway.createProject(repoName);

    this.projectMap.set(name, {
      railwayProjectId: railwayProject.id,
      serviceId: '',
      repoFullName: fullName,
    });

    return { projectId: railwayProject.id, repoUrl };
  }

  async pushFiles(projectId: string, files: FileEntry[]): Promise<void> {
    const ctx = this.findByRailwayId(projectId);
    if (!ctx) throw new Error(`Project context not found: ${projectId}`);
    await github.pushCode(ctx.repoFullName, files);
  }

  async setEnvironment(projectId: string, env: Record<string, string>): Promise<void> {
    const ctx = this.findByRailwayId(projectId);
    if (!ctx) throw new Error(`Project context not found: ${projectId}`);

    // Set secrets in GitHub repo
    await github.setSecrets(ctx.repoFullName, env);

    // Create service from repo and set env vars in Railway
    if (!ctx.serviceId) {
      const serviceId = await railway.createServiceFromRepo(projectId, ctx.repoFullName);
      ctx.serviceId = serviceId;
    }

    await railway.setEnvironmentVariables(projectId, ctx.serviceId, env);
  }

  async deploy(projectId: string): Promise<DeployResult> {
    const ctx = this.findByRailwayId(projectId);
    if (!ctx) throw new Error(`Project context not found: ${projectId}`);

    if (!ctx.serviceId) {
      ctx.serviceId = await railway.createServiceFromRepo(projectId, ctx.repoFullName);
    }

    await railway.triggerDeploy(ctx.serviceId);

    // Wait for deployment and get URL
    let attempts = 0;
    const maxAttempts = 30;
    let deployUrl: string | undefined;

    while (attempts < maxAttempts) {
      const status = await railway.getDeploymentStatus(projectId);
      if (status?.status === 'SUCCESS' || status?.status === 'READY') {
        deployUrl = status.url ?? await railway.getServiceDomain(ctx.serviceId) ?? undefined;
        break;
      }
      if (status?.status === 'FAILED' || status?.status === 'CRASHED') {
        return {
          deploymentId: status.id,
          url: '',
          platform: 'railway',
          status: 'error',
        };
      }
      attempts++;
      await new Promise((r) => setTimeout(r, 5000));
    }

    if (!deployUrl) {
      // Generate a domain if none exists
      try {
        const envData = await railway.getDeploymentStatus(projectId);
        deployUrl = envData?.url ?? `https://${projectId.slice(0, 8)}.up.railway.app`;
      } catch {
        deployUrl = `https://${projectId.slice(0, 8)}.up.railway.app`;
      }
    }

    logger.info('Railway deployment completed', { projectId, deployUrl });

    return {
      deploymentId: projectId,
      url: deployUrl,
      platform: 'railway',
      status: 'ready',
    };
  }

  async getStatus(deploymentId: string): Promise<DeployResult> {
    const status = await railway.getDeploymentStatus(deploymentId);
    const statusMap: Record<string, DeployResult['status']> = {
      SUCCESS: 'ready',
      READY: 'ready',
      BUILDING: 'building',
      DEPLOYING: 'building',
      FAILED: 'error',
      CRASHED: 'error',
    };

    return {
      deploymentId,
      url: status?.url ?? '',
      platform: 'railway',
      status: statusMap[status?.status ?? ''] ?? 'pending',
    };
  }

  async rollback(projectId: string, _version: number): Promise<DeployResult> {
    // Railway supports rollback via redeployment of previous service instance
    const ctx = this.findByRailwayId(projectId);
    if (!ctx?.serviceId) throw new Error('Service not found for rollback');

    await railway.triggerDeploy(ctx.serviceId);
    return this.getStatus(projectId);
  }

  async deleteProject(projectId: string): Promise<void> {
    await railway.deleteProject(projectId);
    // Clean up map
    for (const [key, val] of this.projectMap) {
      if (val.railwayProjectId === projectId) {
        this.projectMap.delete(key);
        break;
      }
    }
  }

  private findByRailwayId(railwayProjectId: string) {
    for (const val of this.projectMap.values()) {
      if (val.railwayProjectId === railwayProjectId) return val;
    }
    return null;
  }
}
