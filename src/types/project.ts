import type { ApiCatalogItem } from './api';

export type ProjectStatus =
  | 'draft'
  | 'generating'
  | 'generated'
  | 'deploying' // 기존 Railway 배포 이력 호환용 (S6에서 제거)
  | 'deployed' // 기존 호환용 (S6에서 'published'로 통합)
  | 'published' // 서브도메인으로 게시됨
  | 'unpublished' // 게시 취소
  | 'failed';

export type DesignMood = 'auto' | 'light' | 'dark' | 'warm' | 'colorful' | 'minimal';
export type DesignAudience = 'general' | 'business' | 'youth' | 'premium';
export type DesignLayout = 'auto' | 'dashboard' | 'gallery' | 'feed' | 'landing' | 'tool';

export interface DesignPreferences {
  mood: DesignMood;
  audience: DesignAudience;
  layoutPreference: DesignLayout;
}

export interface Project {
  id: string;
  userId: string;
  organizationId: string | null;
  name: string;
  context: string;
  status: ProjectStatus;
  deployUrl: string | null;
  deployPlatform: string | null;
  repoUrl: string | null;
  previewUrl: string | null;
  metadata: ProjectMetadata;
  currentVersion: number;
  apis: ApiCatalogItem[];
  slug: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMetadata {
  tags?: string[];
  isPublic?: boolean;
  viewCount?: number;
  lastDeployedAt?: string;
  deployHistory?: DeployHistoryEntry[];
}

export interface DeployHistoryEntry {
  version: number;
  deployedAt: string;
  platform: string;
  url: string;
}

export interface GeneratedCode {
  id: string;
  projectId: string;
  version: number;
  codeHtml: string;
  codeCss: string;
  codeJs: string;
  framework: 'vanilla' | 'react' | 'next';
  aiProvider: string | null;
  aiModel: string | null;
  aiPromptUsed: string | null;
  generationTimeMs: number | null;
  tokenUsage: { input: number; output: number } | null;
  dependencies: string[];
  metadata: CodeMetadata;
  createdAt: string;
}

export interface CodeMetadata {
  qualityScore?: number;
  securityCheckPassed?: boolean;
  hasResponsive?: boolean;
  hasDarkMode?: boolean;
  externalLibs?: string[];
  userFeedback?: string | null;
  validationErrors?: string[];
  // evaluateQuality fields (Phase 2)
  structuralScore?: number;
  hasSemanticHtml?: boolean;
  hasMockData?: boolean;
  hasInteraction?: boolean;
  hasResponsiveClasses?: boolean;
  hasFooter?: boolean;
  hasImgAlt?: boolean;
  details?: string[];
  // Mobile quality fields
  mobileScore?: number;
  hasAdequateResponsive?: boolean;
  noFixedOverflow?: boolean;
  hasImageProtection?: boolean;
  hasMobileNav?: boolean;
  // Phase 6 fields
  apiCategories?: string[];
  inferredTheme?: string;
  inferredLayout?: string;
  qualityLoopUsed?: boolean;
}

export interface CreateProjectInput {
  name: string;
  context: string;
  apiIds: string[];
  organizationId?: string;
  designPreferences?: DesignPreferences;
}
