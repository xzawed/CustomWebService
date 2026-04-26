import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GithubPagesDeployer } from './GithubPagesDeployer';
import * as github from '@/lib/deploy/githubService';
import type { FileEntry } from './IDeployProvider';

vi.mock('@/lib/deploy/githubService', () => ({
  createRepository: vi.fn(),
  pushCode: vi.fn(),
  setSecrets: vi.fn(),
  enableGithubPages: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const mockGithub = vi.mocked(github);

describe('GithubPagesDeployer', () => {
  let deployer: GithubPagesDeployer;

  beforeEach(() => {
    deployer = new GithubPagesDeployer();
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────
  // createProject
  // ─────────────────────────────────────────────
  describe('createProject()', () => {
    it("이름 앞에 'svc-'를 붙여 createRepository를 호출한다", async () => {
      mockGithub.createRepository.mockResolvedValue({
        repoUrl: 'https://github.com/org/svc-my-app',
        fullName: 'org/svc-my-app',
      });

      const result = await deployer.createProject('my-app');

      expect(mockGithub.createRepository).toHaveBeenCalledWith('svc-my-app');
      expect(result.projectId).toBe('org/svc-my-app');
      expect(result.repoUrl).toBe('https://github.com/org/svc-my-app');
    });

    it('projectId가 fullName으로 설정된다', async () => {
      mockGithub.createRepository.mockResolvedValue({
        repoUrl: 'https://github.com/myorg/svc-demo',
        fullName: 'myorg/svc-demo',
      });

      const result = await deployer.createProject('demo');
      expect(result.projectId).toBe('myorg/svc-demo');
    });
  });

  // ─────────────────────────────────────────────
  // pushFiles
  // ─────────────────────────────────────────────
  describe('pushFiles()', () => {
    const files: FileEntry[] = [{ path: 'index.html', content: '<h1>Hello</h1>' }];

    it('projectId가 "/" 포함 → 그대로 repoFullName으로 사용한다', async () => {
      mockGithub.pushCode.mockResolvedValue(undefined);

      await deployer.pushFiles('org/repo', files);

      expect(mockGithub.pushCode).toHaveBeenCalledWith('org/repo', files);
    });

    it('projectId가 "/" 미포함이고 repoMap에 없으면 Error를 던진다', async () => {
      await expect(deployer.pushFiles('unknown-project', files)).rejects.toThrow(
        'Repo not found for project: unknown-project'
      );
    });

    it('createProject 후 반환된 name 키로 pushFiles가 동작한다', async () => {
      mockGithub.createRepository.mockResolvedValue({
        repoUrl: 'https://github.com/org/svc-myapp',
        fullName: 'org/svc-myapp',
      });
      mockGithub.pushCode.mockResolvedValue(undefined);

      // createProject는 name을 키로 repoMap에 저장
      await deployer.createProject('myapp');
      await deployer.pushFiles('myapp', files);

      expect(mockGithub.pushCode).toHaveBeenCalledWith('org/svc-myapp', files);
    });
  });

  // ─────────────────────────────────────────────
  // setEnvironment
  // ─────────────────────────────────────────────
  describe('setEnvironment()', () => {
    it('github.setSecrets를 올바른 인수로 호출한다', async () => {
      mockGithub.setSecrets.mockResolvedValue(undefined);
      const env = { DB_URL: 'postgres://...' };

      await deployer.setEnvironment('org/repo', env);

      expect(mockGithub.setSecrets).toHaveBeenCalledWith('org/repo', env);
    });
  });

  // ─────────────────────────────────────────────
  // deploy
  // ─────────────────────────────────────────────
  describe('deploy()', () => {
    it('github.enableGithubPages를 호출하고 DeployResult를 반환한다', async () => {
      mockGithub.enableGithubPages.mockResolvedValue('https://org.github.io/repo');

      const result = await deployer.deploy('org/repo');

      expect(mockGithub.enableGithubPages).toHaveBeenCalledWith('org/repo', 'main', '/');
      expect(result).toEqual({
        deploymentId: 'org/repo',
        url: 'https://org.github.io/repo',
        platform: 'github_pages',
        status: 'ready',
      });
    });
  });

  // ─────────────────────────────────────────────
  // getStatus
  // ─────────────────────────────────────────────
  describe('getStatus()', () => {
    it("유효한 'org/repo' 형식 → URL을 계산해서 반환한다", async () => {
      const result = await deployer.getStatus('myorg/myrepo');

      expect(result).toEqual({
        deploymentId: 'myorg/myrepo',
        url: 'https://myorg.github.io/myrepo',
        platform: 'github_pages',
        status: 'ready',
      });
    });

    it("잘못된 형식('just-repo') → Error를 던진다", async () => {
      await expect(deployer.getStatus('just-repo')).rejects.toThrow('잘못된 deploymentId 형식');
    });

    it('빈 문자열 → Error를 던진다', async () => {
      await expect(deployer.getStatus('')).rejects.toThrow('잘못된 deploymentId 형식');
    });

    it("슬래시만 있는 문자열('org/') → Error를 던진다", async () => {
      await expect(deployer.getStatus('org/')).rejects.toThrow('잘못된 deploymentId 형식');
    });

    it("'/repo' 형식 → Error를 던진다", async () => {
      await expect(deployer.getStatus('/repo')).rejects.toThrow('잘못된 deploymentId 형식');
    });
  });

  // ─────────────────────────────────────────────
  // rollback
  // ─────────────────────────────────────────────
  describe('rollback()', () => {
    it('logger.warn을 호출하고 getStatus 결과를 반환한다', async () => {
      const { logger } = await import('@/lib/utils/logger');

      const result = await deployer.rollback('org/repo', 1);

      expect(logger.warn).toHaveBeenCalled();
      expect(result).toEqual({
        deploymentId: 'org/repo',
        url: 'https://org.github.io/repo',
        platform: 'github_pages',
        status: 'ready',
      });
    });
  });

  // ─────────────────────────────────────────────
  // deleteProject
  // ─────────────────────────────────────────────
  describe('deleteProject()', () => {
    it('logger.warn을 호출하고 void를 반환한다', async () => {
      const { logger } = await import('@/lib/utils/logger');

      await deployer.deleteProject('org/repo');

      expect(logger.warn).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // resolveRepo (private — pushFiles/deploy를 통해 간접 테스트)
  // ─────────────────────────────────────────────
  describe('resolveRepo() (간접 테스트)', () => {
    it('"/" 포함 projectId → 그대로 사용', async () => {
      mockGithub.pushCode.mockResolvedValue(undefined);
      await deployer.pushFiles('some-org/some-repo', []);
      expect(mockGithub.pushCode).toHaveBeenCalledWith('some-org/some-repo', []);
    });

    it('"/" 미포함이고 repoMap 없으면 Error', async () => {
      await expect(deployer.pushFiles('no-slash-id', [])).rejects.toThrow(
        'Repo not found for project: no-slash-id'
      );
    });

    it('createProject 후 반환된 fullName을 repoMap에서 조회한다', async () => {
      mockGithub.createRepository.mockResolvedValue({
        repoUrl: 'https://github.com/testorg/svc-bar',
        fullName: 'testorg/svc-bar',
      });
      mockGithub.pushCode.mockResolvedValue(undefined);

      await deployer.createProject('bar');
      await deployer.pushFiles('bar', []);

      expect(mockGithub.pushCode).toHaveBeenCalledWith('testorg/svc-bar', []);
    });
  });
});
