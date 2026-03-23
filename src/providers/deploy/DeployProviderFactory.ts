import type { IDeployProvider } from './IDeployProvider';
import { RailwayDeployer } from './RailwayDeployer';
import { GithubPagesDeployer } from './GithubPagesDeployer';

export type DeployPlatform = 'railway' | 'github_pages';

export class DeployProviderFactory {
  private static providers = new Map<string, IDeployProvider>();

  static create(platform: DeployPlatform = 'railway'): IDeployProvider {
    if (this.providers.has(platform)) {
      return this.providers.get(platform)!;
    }

    let provider: IDeployProvider;

    switch (platform) {
      case 'railway':
        provider = new RailwayDeployer();
        break;
      case 'github_pages':
        provider = new GithubPagesDeployer();
        break;
      default:
        throw new Error(`Unknown deploy platform: ${platform}`);
    }

    this.providers.set(platform, provider);
    return provider;
  }

  static getSupportedPlatforms(): DeployPlatform[] {
    return ['railway', 'github_pages'];
  }
}
