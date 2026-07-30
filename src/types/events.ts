export type DomainEvent =
  | { type: 'USER_SIGNED_UP'; payload: { userId: string } }
  | {
      type: 'PROJECT_CREATED';
      payload: { projectId: string; userId: string; apiCount: number };
    }
  | {
      type: 'CODE_GENERATED';
      payload: {
        projectId: string;
        version: number;
        provider: string;
        durationMs: number;
      };
    }
  | {
      type: 'CODE_GENERATION_FAILED';
      payload: { projectId: string; error: string; provider: string };
    }
  | {
      type: 'DEPLOYMENT_STARTED';
      payload: { projectId: string; platform: string };
    }
  | {
      type: 'DEPLOYMENT_COMPLETED';
      payload: { projectId: string; url: string; platform: string };
    }
  | {
      type: 'DEPLOYMENT_FAILED';
      payload: { projectId: string; error: string };
    }
  | { type: 'PROJECT_DELETED'; payload: { deletedProjectId: string } }
  // deletedUserId — persist()가 payload.userId를 user_id FK로 추출하므로
  // 삭제 직후 userId를 쓰면 FK 위반으로 감사 로그가 유실된다(PROJECT_DELETED 동일 함정).
  | { type: 'USER_DELETED'; payload: { deletedUserId: string } }
  | {
      type: 'PROJECT_PUBLISHED';
      payload: { projectId: string; userId: string; slug: string };
    }
  | { type: 'PROJECT_UNPUBLISHED'; payload: { projectId: string; userId: string } }
  | {
      type: 'API_QUOTA_WARNING';
      payload: { service: string; usage: number; limit: number };
    }
  | {
      type: 'QC_REPORT_COMPLETED';
      payload: {
        projectId: string;
        overallScore: number;
        passed: boolean;
        checks: Array<{ name: string; passed: boolean; score: number }>;
        isDeep: boolean;
      };
    }
  | {
      type: 'QC_REPORT_FAILED';
      payload: { projectId: string; stage: 'fast' | 'deep'; error: string };
    }
  | {
      type: 'STAGE2_FALLBACK_USED';
      payload: { projectId: string; error: string };
    }
  | {
      type: 'STAGE3_FALLBACK_USED';
      payload: { projectId: string; error: string };
    }
  | {
      type: 'STAGE_SKIPPED';
      payload: { projectId: string; stage: 'stage2' | 'stage3'; reason: string };
    }
  | {
      type: 'QUALITY_LOOP_COMPLETED';
      payload: {
        projectId: string;
        iterations: number;
        improved: boolean;
        finalStructuralScore: number;
        finalMobileScore: number;
      };
    };

export type DomainEventType = DomainEvent['type'];
