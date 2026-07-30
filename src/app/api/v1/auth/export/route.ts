import { getAuthUser } from '@/lib/auth/index';
import { enforceRateLimit } from '@/lib/auth/routeHelpers';
import {
  createCodeRepository,
  createProjectRepository,
  createUserApiKeyRepository,
  createUserRepository,
} from '@/repositories/factory';
import type { GeneratedCode, Project } from '@/types/project';
import { AuthRequiredError, handleApiError, jsonResponse } from '@/lib/utils/errors';

/** 계정 데이터 내보내기 스키마 버전 — 필드 추가·제거 시 증가. */
const EXPORT_SCHEMA_VERSION = 1 as const;

function exportFilename(now: Date): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `customwebservice-export-${yyyy}-${mm}-${dd}.json`;
}

function projectMetadata(project: Project): Omit<Project, 'apis'> {
  // 도메인 Project.apis는 조인 결과용 빈 배열이 흔해 내보내기에서는 제외하고
  // projectApis(project_apis 테이블)로 대체한다.
  const { apis: _apis, ...rest } = project;
  return rest;
}

function mapGeneratedCode(code: GeneratedCode): {
  id: string;
  projectId: string;
  version: number;
  codeHtml: string;
  codeCss: string;
  codeJs: string;
  framework: GeneratedCode['framework'];
  aiProvider: string | null;
  aiModel: string | null;
  aiPromptUsed: string | null;
  generationTimeMs: number | null;
  tokenUsage: GeneratedCode['tokenUsage'];
  dependencies: string[];
  metadata: GeneratedCode['metadata'];
  createdAt: string;
} {
  return {
    id: code.id,
    projectId: code.projectId,
    version: code.version,
    codeHtml: code.codeHtml,
    codeCss: code.codeCss,
    codeJs: code.codeJs,
    framework: code.framework,
    aiProvider: code.aiProvider,
    aiModel: code.aiModel,
    aiPromptUsed: code.aiPromptUsed,
    generationTimeMs: code.generationTimeMs,
    tokenUsage: code.tokenUsage,
    dependencies: code.dependencies,
    metadata: code.metadata,
    createdAt: code.createdAt,
  };
}

/**
 * GET /api/v1/auth/export — 현재 사용자 데이터 JSON 다운로드.
 * 이메일 인증 불필요(자기 데이터 열람). passwordHash·API 키 원문/암호문은 제외.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const sessionUser = await getAuthUser();
    if (!sessionUser) throw new AuthRequiredError();

    // resend-verification과 동일: prefix에 userId를 넣어 사용자별 한도 + IP 버킷.
    enforceRateLimit(request, `export:${sessionUser.id}`, 3, 60 * 60 * 1000);

    const dbUser = await createUserRepository().findById(sessionUser.id);
    if (!dbUser) throw new AuthRequiredError();

    const projectRepo = createProjectRepository();
    const codeRepo = createCodeRepository();
    const keyRepo = createUserApiKeyRepository();

    const projects = await projectRepo.findByUserId(sessionUser.id);

    const projectsOut = await Promise.all(
      projects.map(async (project) => {
        const [projectApis, generatedCodes] = await Promise.all([
          projectRepo.getProjectApiLinks(project.id),
          codeRepo.findAllByProject(project.id),
        ]);
        return {
          ...projectMetadata(project),
          projectApis,
          generatedCodes: generatedCodes.map(mapGeneratedCode),
        };
      }),
    );

    // user_api_keys: 메타데이터만. 공유/로그된 export 파일에 키 재료를 넣지 않는다.
    // ciphertext(encryptedKey)는 사용자에게 쓸모없고, 복호화 평문은 유출 면이 커서 둘 다 제외.
    const keyRows = await keyRepo.findAllByUser(sessionUser.id);
    const userApiKeys = keyRows.map((row) => ({
      apiId: row.apiId,
      isVerified: row.isVerified,
      createdAt: row.createdAt,
    }));

    const now = new Date();
    const payload = {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        avatarUrl: dbUser.avatarUrl,
        preferences: dbUser.preferences,
        emailVerified: dbUser.emailVerified,
        createdAt: dbUser.createdAt,
        updatedAt: dbUser.updatedAt,
      },
      projects: projectsOut,
      userApiKeys,
    };

    return jsonResponse(
      { success: true, data: payload },
      {
        headers: {
          'Content-Disposition': `attachment; filename="${exportFilename(now)}"`,
        },
      },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
