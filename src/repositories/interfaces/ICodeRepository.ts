import type { IBaseRepository } from './IBaseRepository';
import type { GeneratedCode } from '@/types/project';

export interface ICodeRepository extends IBaseRepository<GeneratedCode> {
  findByProject(projectId: string, version?: number): Promise<GeneratedCode | null>;
  countByProject(projectId: string): Promise<number>;
  pruneOldVersions(projectId: string, keepCount: number): Promise<void>;
  getNextVersion(projectId: string): Promise<number>;
}
