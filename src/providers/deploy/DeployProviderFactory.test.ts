import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeployProviderFactory } from './DeployProviderFactory';
import { RailwayDeployer } from './RailwayDeployer';
import { GithubPagesDeployer } from './GithubPagesDeployer';

vi.mock('./RailwayDeployer', () => {
  const MockRailwayDeployer = vi.fn(function (this: Record<string, unknown>) {
    this.name = 'railway';
    this.supportedFeatures = ['env_vars', 'custom_domain', 'serverless'];
  });
  return { RailwayDeployer: MockRailwayDeployer };
});

vi.mock('./GithubPagesDeployer', () => {
  const MockGithubPagesDeployer = vi.fn(function (this: Record<string, unknown>) {
    this.name = 'github_pages';
    this.supportedFeatures = ['static_only'];
  });
  return { GithubPagesDeployer: MockGithubPagesDeployer };
});

describe('DeployProviderFactory', () => {
  beforeEach(() => {
    // static 캐시 초기화 (private이지만 인덱스 접근으로 우회)
    (DeployProviderFactory as unknown as { providers: Map<string, unknown> })['providers'] = new Map();
    vi.clearAllMocks();
  });

  describe('create()', () => {
    it("'railway' 플랫폼 → RailwayDeployer 인스턴스를 반환한다", () => {
      const provider = DeployProviderFactory.create('railway');
      expect(provider.name).toBe('railway');
      expect(RailwayDeployer).toHaveBeenCalledTimes(1);
    });

    it("'github_pages' 플랫폼 → GithubPagesDeployer 인스턴스를 반환한다", () => {
      const provider = DeployProviderFactory.create('github_pages');
      expect(provider.name).toBe('github_pages');
      expect(GithubPagesDeployer).toHaveBeenCalledTimes(1);
    });

    it('기본값(인수 없음)은 railway를 사용한다', () => {
      const provider = DeployProviderFactory.create();
      expect(provider.name).toBe('railway');
    });

    it('같은 플랫폼을 두 번 create()하면 캐싱된 동일 인스턴스를 반환한다', () => {
      const p1 = DeployProviderFactory.create('railway');
      const p2 = DeployProviderFactory.create('railway');
      expect(p1).toBe(p2);
      // 생성자는 한 번만 호출되어야 함
      expect(RailwayDeployer).toHaveBeenCalledTimes(1);
    });

    it('서로 다른 플랫폼은 서로 다른 인스턴스를 반환한다', () => {
      const p1 = DeployProviderFactory.create('railway');
      const p2 = DeployProviderFactory.create('github_pages');
      expect(p1).not.toBe(p2);
    });

    it('알 수 없는 플랫폼은 Error를 던진다', () => {
      expect(() =>
        DeployProviderFactory.create('unknown' as never)
      ).toThrow('Unknown deploy platform: unknown');
    });
  });

  describe('getSupportedPlatforms()', () => {
    it("['railway', 'github_pages']를 반환한다", () => {
      expect(DeployProviderFactory.getSupportedPlatforms()).toEqual(['railway', 'github_pages']);
    });
  });
});
