import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RailwayDeployer } from './RailwayDeployer';
import * as github from '@/lib/deploy/githubService';
import * as railway from '@/lib/deploy/railwayService';
import { DeployError } from '@/lib/utils/errors';
import type { FileEntry } from './IDeployProvider';

vi.mock('@/lib/deploy/githubService', () => ({
  createRepository: vi.fn(),
  pushCode: vi.fn(),
  setSecrets: vi.fn(),
}));

vi.mock('@/lib/deploy/railwayService', () => ({
  createProject: vi.fn(),
  createServiceFromRepo: vi.fn(),
  setEnvironmentVariables: vi.fn(),
  triggerDeploy: vi.fn(),
  getDeploymentStatus: vi.fn(),
  getServiceDomain: vi.fn(),
  deleteProject: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const mockGithub = vi.mocked(github);
const mockRailway = vi.mocked(railway);

describe('RailwayDeployer', () => {
  let deployer: RailwayDeployer;

  beforeEach(() => {
    deployer = new RailwayDeployer();
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────
  // createProject
  // ─────────────────────────────────────────────
  describe('createProject()', () => {
    it("이름 앞에 'svc-'를 붙여 createRepository와 railway.createProject를 호출한다", async () => {
      mockGithub.createRepository.mockResolvedValue({
        repoUrl: 'https://github.com/org/svc-my-app',
        fullName: 'org/svc-my-app',
      });
      mockRailway.createProject.mockResolvedValue({ id: 'rail-proj-1', name: 'svc-my-app' });

      const result = await deployer.createProject('my-app');

      expect(mockGithub.createRepository).toHaveBeenCalledWith('svc-my-app');
      expect(mockRailway.createProject).toHaveBeenCalledWith('svc-my-app');
      expect(result.projectId).toBe('rail-proj-1');
      expect(result.repoUrl).toBe('https://github.com/org/svc-my-app');
    });

    it('railway.createProject가 반환한 id를 projectId로 반환한다', async () => {
      mockGithub.createRepository.mockResolvedValue({
        repoUrl: 'https://github.com/org/svc-demo',
        fullName: 'org/svc-demo',
      });
      mockRailway.createProject.mockResolvedValue({ id: 'unique-rail-id', name: 'svc-demo' });

      const result = await deployer.createProject('demo');

      expect(result.projectId).toBe('unique-rail-id');
    });
  });

  // ─────────────────────────────────────────────
  // pushFiles
  // ─────────────────────────────────────────────
  describe('pushFiles()', () => {
    const files: FileEntry[] = [{ path: 'index.html', content: '<h1>Hello</h1>' }];

    it('컨텍스트가 없으면 Error를 던진다', async () => {
      await expect(deployer.pushFiles('unknown-project-id', files)).rejects.toThrow(
        'Project context not found: unknown-project-id'
      );
    });

    it('createProject 후 railwayProjectId로 github.pushCode를 호출한다', async () => {
      mockGithub.createRepository.mockResolvedValue({
        repoUrl: 'https://github.com/org/svc-myapp',
        fullName: 'org/svc-myapp',
      });
      mockRailway.createProject.mockResolvedValue({ id: 'rail-id-1', name: 'svc-myapp' });
      mockGithub.pushCode.mockResolvedValue(undefined);

      await deployer.createProject('myapp');
      await deployer.pushFiles('rail-id-1', files);

      expect(mockGithub.pushCode).toHaveBeenCalledWith('org/svc-myapp', files);
    });
  });

  // ─────────────────────────────────────────────
  // setEnvironment
  // ─────────────────────────────────────────────
  describe('setEnvironment()', () => {
    const setupProject = async (name = 'testapp') => {
      mockGithub.createRepository.mockResolvedValue({
        repoUrl: 'https://github.com/org/svc-testapp',
        fullName: 'org/svc-testapp',
      });
      mockRailway.createProject.mockResolvedValue({ id: 'rail-proj-env', name: 'svc-testapp' });
      await deployer.createProject(name);
    };

    it('컨텍스트가 없으면 Error를 던진다', async () => {
      await expect(
        deployer.setEnvironment('nonexistent', { KEY: 'val' })
      ).rejects.toThrow('Project context not found: nonexistent');
    });

    it('serviceId가 없으면 createServiceFromRepo를 호출하고 serviceId를 저장한다', async () => {
      await setupProject();
      mockGithub.setSecrets.mockResolvedValue(undefined);
      mockRailway.createServiceFromRepo.mockResolvedValue('service-id-1');
      mockRailway.setEnvironmentVariables.mockResolvedValue(undefined);

      await deployer.setEnvironment('rail-proj-env', { KEY: 'value' });

      expect(mockRailway.createServiceFromRepo).toHaveBeenCalledWith(
        'rail-proj-env',
        'org/svc-testapp'
      );
      expect(mockRailway.setEnvironmentVariables).toHaveBeenCalledWith(
        'rail-proj-env',
        'service-id-1',
        { KEY: 'value' }
      );
    });

    it('serviceId가 이미 있으면 createServiceFromRepo를 재호출하지 않는다', async () => {
      await setupProject();
      mockGithub.setSecrets.mockResolvedValue(undefined);
      mockRailway.createServiceFromRepo.mockResolvedValue('service-id-1');
      mockRailway.setEnvironmentVariables.mockResolvedValue(undefined);
      mockRailway.triggerDeploy.mockResolvedValue('deployment-id');
      mockRailway.getDeploymentStatus.mockResolvedValue({ id: 'd-1', status: 'SUCCESS', url: 'https://app.railway.app' });

      // 첫 번째 호출로 serviceId 초기화
      await deployer.setEnvironment('rail-proj-env', { KEY: 'value' });
      vi.clearAllMocks();
      mockGithub.setSecrets.mockResolvedValue(undefined);
      mockRailway.setEnvironmentVariables.mockResolvedValue(undefined);

      // 두 번째 호출 — createServiceFromRepo 재호출 없어야 함
      await deployer.setEnvironment('rail-proj-env', { KEY2: 'value2' });

      expect(mockRailway.createServiceFromRepo).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────
  // deploy
  // ─────────────────────────────────────────────
  describe('deploy()', () => {
    const setupProjectWithService = async () => {
      mockGithub.createRepository.mockResolvedValue({
        repoUrl: 'https://github.com/org/svc-deploy',
        fullName: 'org/svc-deploy',
      });
      mockRailway.createProject.mockResolvedValue({ id: 'rail-deploy-id', name: 'svc-deploy' });
      mockRailway.createServiceFromRepo.mockResolvedValue('service-deploy-id');
      await deployer.createProject('deploy');
    };

    it('컨텍스트가 없으면 Error를 던진다', async () => {
      await expect(deployer.deploy('nonexistent-id')).rejects.toThrow(
        'Project context not found: nonexistent-id'
      );
    });

    it('SUCCESS 상태 즉시 반환 → DeployResult를 반환한다', async () => {
      await setupProjectWithService();
      mockGithub.setSecrets.mockResolvedValue(undefined);
      mockRailway.setEnvironmentVariables.mockResolvedValue(undefined);
      mockRailway.triggerDeploy.mockResolvedValue('depl-id-1');
      mockRailway.getDeploymentStatus.mockResolvedValue({
        id: 'depl-id-1',
        status: 'SUCCESS',
        url: 'https://my-service.railway.app',
      });

      const result = await deployer.deploy('rail-deploy-id');

      expect(mockRailway.triggerDeploy).toHaveBeenCalledWith('service-deploy-id');
      expect(result).toEqual({
        deploymentId: 'rail-deploy-id',
        url: 'https://my-service.railway.app',
        platform: 'railway',
        status: 'ready',
      });
    });

    it('READY 상태도 DeployResult를 반환한다', async () => {
      await setupProjectWithService();
      mockRailway.triggerDeploy.mockResolvedValue('depl-id-2');
      mockRailway.getDeploymentStatus.mockResolvedValue({
        id: 'depl-id-2',
        status: 'READY',
        url: 'https://ready-service.railway.app',
      });

      const result = await deployer.deploy('rail-deploy-id');

      expect(result.status).toBe('ready');
      expect(result.url).toBe('https://ready-service.railway.app');
    });

    it('url이 없으면 getServiceDomain으로 URL을 가져온다', async () => {
      await setupProjectWithService();
      mockRailway.triggerDeploy.mockResolvedValue('depl-id-3');
      mockRailway.getDeploymentStatus.mockResolvedValue({
        id: 'depl-id-3',
        status: 'SUCCESS',
        url: undefined,
      });
      mockRailway.getServiceDomain.mockResolvedValue('https://domain-service.railway.app');

      const result = await deployer.deploy('rail-deploy-id');

      expect(mockRailway.getServiceDomain).toHaveBeenCalledWith('service-deploy-id');
      expect(result.url).toBe('https://domain-service.railway.app');
    });

    it('FAILED 상태 → DeployError를 던진다', async () => {
      await setupProjectWithService();
      mockRailway.triggerDeploy.mockResolvedValue('depl-id-4');
      mockRailway.getDeploymentStatus.mockResolvedValue({
        id: 'depl-id-4',
        status: 'FAILED',
        url: undefined,
      });

      await expect(deployer.deploy('rail-deploy-id')).rejects.toThrow(DeployError);
    });

    it('CRASHED 상태 → DeployError를 던진다', async () => {
      await setupProjectWithService();
      mockRailway.triggerDeploy.mockResolvedValue('depl-id-5');
      mockRailway.getDeploymentStatus.mockResolvedValue({
        id: 'depl-id-5',
        status: 'CRASHED',
        url: undefined,
      });

      await expect(deployer.deploy('rail-deploy-id')).rejects.toThrow(DeployError);
    });

    it('serviceId가 없으면 createServiceFromRepo를 호출한다', async () => {
      // 서비스 ID 없이 새 deployer 인스턴스에서 createProject만 수행
      mockGithub.createRepository.mockResolvedValue({
        repoUrl: 'https://github.com/org/svc-noservice',
        fullName: 'org/svc-noservice',
      });
      mockRailway.createProject.mockResolvedValue({ id: 'rail-noservice-id', name: 'svc-noservice' });
      await deployer.createProject('noservice');

      mockRailway.createServiceFromRepo.mockResolvedValue('new-service-id');
      mockRailway.triggerDeploy.mockResolvedValue('depl-id-6');
      mockRailway.getDeploymentStatus.mockResolvedValue({
        id: 'depl-id-6',
        status: 'SUCCESS',
        url: 'https://new.railway.app',
      });

      await deployer.deploy('rail-noservice-id');

      expect(mockRailway.createServiceFromRepo).toHaveBeenCalledWith(
        'rail-noservice-id',
        'org/svc-noservice'
      );
    });
  });

  // ─────────────────────────────────────────────
  // getStatus
  // ─────────────────────────────────────────────
  describe('getStatus()', () => {
    it('SUCCESS → ready 상태를 반환한다', async () => {
      mockRailway.getDeploymentStatus.mockResolvedValue({
        id: 'd-1',
        status: 'SUCCESS',
        url: 'https://app.railway.app',
      });

      const result = await deployer.getStatus('proj-1');

      expect(result).toEqual({
        deploymentId: 'proj-1',
        url: 'https://app.railway.app',
        platform: 'railway',
        status: 'ready',
      });
    });

    it('READY → ready 상태를 반환한다', async () => {
      mockRailway.getDeploymentStatus.mockResolvedValue({ id: 'd-2', status: 'READY', url: 'https://r.app' });

      const result = await deployer.getStatus('proj-2');

      expect(result.status).toBe('ready');
    });

    it('BUILDING → building 상태를 반환한다', async () => {
      mockRailway.getDeploymentStatus.mockResolvedValue({ id: 'd-3', status: 'BUILDING', url: undefined });

      const result = await deployer.getStatus('proj-3');

      expect(result.status).toBe('building');
    });

    it('DEPLOYING → building 상태를 반환한다', async () => {
      mockRailway.getDeploymentStatus.mockResolvedValue({ id: 'd-4', status: 'DEPLOYING', url: undefined });

      const result = await deployer.getStatus('proj-4');

      expect(result.status).toBe('building');
    });

    it('FAILED → error 상태를 반환한다', async () => {
      mockRailway.getDeploymentStatus.mockResolvedValue({ id: 'd-5', status: 'FAILED', url: undefined });

      const result = await deployer.getStatus('proj-5');

      expect(result.status).toBe('error');
    });

    it('CRASHED → error 상태를 반환한다', async () => {
      mockRailway.getDeploymentStatus.mockResolvedValue({ id: 'd-6', status: 'CRASHED', url: undefined });

      const result = await deployer.getStatus('proj-6');

      expect(result.status).toBe('error');
    });

    it('알 수 없는 상태 → pending을 반환한다', async () => {
      mockRailway.getDeploymentStatus.mockResolvedValue({ id: 'd-7', status: 'UNKNOWN_STATUS', url: undefined });

      const result = await deployer.getStatus('proj-7');

      expect(result.status).toBe('pending');
    });

    it('null 반환 → url은 빈 문자열, status는 pending', async () => {
      mockRailway.getDeploymentStatus.mockResolvedValue(null);

      const result = await deployer.getStatus('proj-8');

      expect(result.url).toBe('');
      expect(result.status).toBe('pending');
    });
  });

  // ─────────────────────────────────────────────
  // rollback
  // ─────────────────────────────────────────────
  describe('rollback()', () => {
    it('serviceId가 없으면 Error를 던진다', async () => {
      await expect(deployer.rollback('nonexistent', 1)).rejects.toThrow(
        'Service not found for rollback'
      );
    });

    it('serviceId가 있으면 triggerDeploy를 호출하고 getStatus 결과를 반환한다', async () => {
      // 프로젝트 생성 + 서비스 설정
      mockGithub.createRepository.mockResolvedValue({
        repoUrl: 'https://github.com/org/svc-rollback',
        fullName: 'org/svc-rollback',
      });
      mockRailway.createProject.mockResolvedValue({ id: 'rail-rollback-id', name: 'svc-rollback' });
      await deployer.createProject('rollback');

      mockGithub.setSecrets.mockResolvedValue(undefined);
      mockRailway.createServiceFromRepo.mockResolvedValue('service-rollback-id');
      mockRailway.setEnvironmentVariables.mockResolvedValue(undefined);
      await deployer.setEnvironment('rail-rollback-id', {});

      mockRailway.triggerDeploy.mockResolvedValue('depl-rb-1');
      mockRailway.getDeploymentStatus.mockResolvedValue({
        id: 'depl-rb-1',
        status: 'READY',
        url: 'https://rollback.railway.app',
      });

      const result = await deployer.rollback('rail-rollback-id', 1);

      expect(mockRailway.triggerDeploy).toHaveBeenCalledWith('service-rollback-id');
      expect(result.status).toBe('ready');
    });
  });

  // ─────────────────────────────────────────────
  // deleteProject
  // ─────────────────────────────────────────────
  describe('deleteProject()', () => {
    it('railway.deleteProject를 호출한다', async () => {
      mockRailway.deleteProject.mockResolvedValue(undefined);

      await deployer.deleteProject('proj-to-delete');

      expect(mockRailway.deleteProject).toHaveBeenCalledWith('proj-to-delete');
    });

    it('createProject로 등록된 프로젝트를 삭제한 후 projectMap에서도 제거된다', async () => {
      mockGithub.createRepository.mockResolvedValue({
        repoUrl: 'https://github.com/org/svc-delete-me',
        fullName: 'org/svc-delete-me',
      });
      mockRailway.createProject.mockResolvedValue({ id: 'rail-del-id', name: 'svc-delete-me' });
      await deployer.createProject('delete-me');

      mockRailway.deleteProject.mockResolvedValue(undefined);
      await deployer.deleteProject('rail-del-id');

      // 삭제 후 pushFiles 시 컨텍스트 없음
      await expect(
        deployer.pushFiles('rail-del-id', [])
      ).rejects.toThrow('Project context not found: rail-del-id');
    });
  });
});
