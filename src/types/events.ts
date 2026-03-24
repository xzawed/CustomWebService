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
  | { type: 'PROJECT_DELETED'; payload: { projectId: string } }
  | {
      type: 'PROJECT_PUBLISHED';
      payload: { projectId: string; userId: string; slug: string };
    }
  | { type: 'PROJECT_UNPUBLISHED'; payload: { projectId: string; userId: string } }
  | {
      type: 'API_QUOTA_WARNING';
      payload: { service: string; usage: number; limit: number };
    };

export type DomainEventType = DomainEvent['type'];
