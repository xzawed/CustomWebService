import type { IBaseRepository } from './IBaseRepository';
import type { GeneratedCode, CodeMetadata } from '@/types/project';

export interface ICodeRepository extends IBaseRepository<GeneratedCode> {
  findByProject(projectId: string, version?: number): Promise<GeneratedCode | null>;
  /** 프로젝트의 모든 코드 버전(version 오름차순). 없으면 빈 배열. */
  findAllByProject(projectId: string): Promise<GeneratedCode[]>;
  countByProject(projectId: string): Promise<number>;
  pruneOldVersions(projectId: string, keepCount: number): Promise<void>;
  getNextVersion(projectId: string): Promise<number>;
  /** `from`(포함) 이후 생성 코드의 메타데이터 목록 — QC 통계 집계용. DB 오류 시 throw. */
  findMetadataByDateRange(from: Date): Promise<Array<{ metadata: CodeMetadata; createdAt: string }>>;
}
