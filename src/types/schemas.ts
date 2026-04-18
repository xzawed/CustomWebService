import { z } from 'zod/v4';
import { t } from '@/lib/i18n';

// ── 재사용 단위 ──────────────────────────────────────────────────────────────
export const projectIdSchema = z.string().uuid({ error: t('error.validation') });
export const slugSchema = z.string().min(1).max(63);

// ── 프로젝트 ─────────────────────────────────────────────────────────────────
export const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  context: z.string().min(50).max(2000),
  apiIds: z.array(z.string().uuid()).min(1).max(5),
  organizationId: z.string().uuid().optional(),
  designPreferences: z
    .object({
      mood: z.enum(['auto', 'light', 'dark', 'warm', 'colorful', 'minimal']),
      audience: z.enum(['general', 'business', 'youth', 'premium']),
      layoutPreference: z.enum(['auto', 'dashboard', 'feed', 'landing', 'tool']),
    })
    .optional(),
});

export const rollbackSchema = z.object({
  version: z.number().int().min(1),
});

export const slugCheckSchema = z.object({
  slug: z.string().min(1),
});

export const publishSchema = z.object({
  slug: z.string().optional(),
});

// ── 코드 생성 ─────────────────────────────────────────────────────────────────
export const generateSchema = z.object({
  projectId: z.string().uuid(),
  templateId: z.string().optional(),
});

export const regenerateSchema = z.object({
  projectId: z.string().uuid({ error: t('error.validation') }),
  feedback: z.string().trim().min(1).max(5000),
});

// ── AI 제안 ───────────────────────────────────────────────────────────────────
export const suggestModificationSchema = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().trim().max(500).optional(),
});

export const suggestApisSchema = z.object({
  // contextMinLength=50, contextMaxLength=2000 (features config 기본값과 동기화)
  context: z.string().trim().min(50).max(2000),
});

export const suggestContextSchema = z.object({
  apis: z
    .array(
      z.object({
        name: z.string().max(200),
        description: z.string().max(500),
        category: z.string().max(100),
      }),
    )
    .min(1)
    .max(5),
});

// ── 배포 ──────────────────────────────────────────────────────────────────────
export const deploySchema = z.object({
  projectId: z.string().uuid(),
  platform: z.enum(['railway', 'github_pages']).default('railway'),
});

// ── 사용자 API 키 ─────────────────────────────────────────────────────────────
export const saveKeySchema = z.object({
  apiId: z.string().uuid(),
  apiKey: z.string().min(1).max(500),
});

// ── 생성 옵션 추천 ─────────────────────────────────────────────────────────────
export const suggestPreferencesSchema = z.object({
  context: z.string().trim().min(20).max(2000),
  apiIds: z.array(z.string().uuid()).min(1).max(5),
});

// ── 관리자 ────────────────────────────────────────────────────────────────────
export const triggerQcSchema = z.object({
  projectId: z.string().min(1),
});
