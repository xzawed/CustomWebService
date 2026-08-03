import { z } from 'zod/v4';
import { t } from '@/lib/i18n';

// ── 재사용 단위 ──────────────────────────────────────────────────────────────
export const projectIdSchema = z.string().uuid({ error: t('error.validation') });

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

// ── 사용자 API 키 ─────────────────────────────────────────────────────────────
export const saveKeySchema = z.object({
  apiId: z.string().uuid(),
  // trim()을 min() 앞에 두어 공백만 있는 키('   ')가 통과 후 빈 문자열로 저장되는 것을 막는다.
  apiKey: z.string().trim().min(1).max(500),
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

/**
 * 킬스위치 토글. **알려진 플래그만 허용한다** — 오타로 만들어진 행은 아무도 읽지 않으면서
 * "스위치를 내렸다"는 착각만 남긴다. 인시던트 중엔 그게 제일 위험하다.
 */
export const setFeatureFlagSchema = z.object({
  flag: z.enum(['enable_generation', 'enable_signup']),
  enabled: z.boolean(),
});

/**
 * 카탈로그 활성화. `apiIds` 생략 시 "키 검증을 통과한 비활성 API 전부"가 대상이다.
 * 실제 활성화 여부는 **라이브 키 검증 결과**가 결정하며 이 스키마는 대상 선택만 한다.
 */
export const activateCatalogSchema = z.object({
  apiIds: z.array(z.string().min(1)).optional(),
  /** true면 검증만 하고 활성화하지 않는다(무엇이 켜질지 먼저 보기 위한 것). */
  dryRun: z.boolean().optional(),
});

// ── 인증 ──────────────────────────────────────────────────────────────────────
// z.string().email()는 Zod v4에서 deprecated → z.string().trim().toLowerCase().pipe(z.email()) 사용
const emailField = z.string().trim().toLowerCase().pipe(z.email());

export const signupSchema = z.object({
  email: emailField,
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다.'),
});

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다.'),
});
