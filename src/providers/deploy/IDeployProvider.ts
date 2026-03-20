export interface FileEntry {
  path: string;
  content: string;
}

export interface DeployResult {
  deploymentId: string;
  url: string;
  platform: string;
  status: 'pending' | 'building' | 'ready' | 'error';
}

export interface IDeployProvider {
  readonly name: string;
  readonly supportedFeatures: ('env_vars' | 'custom_domain' | 'serverless' | 'static_only')[];

  createProject(name: string): Promise<{ projectId: string; repoUrl?: string }>;
  pushFiles(projectId: string, files: FileEntry[]): Promise<void>;
  setEnvironment(projectId: string, env: Record<string, string>): Promise<void>;
  deploy(projectId: string): Promise<DeployResult>;
  getStatus(deploymentId: string): Promise<DeployResult>;
  rollback(projectId: string, version: number): Promise<DeployResult>;
  deleteProject(projectId: string): Promise<void>;
}
