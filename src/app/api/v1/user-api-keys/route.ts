import { createClient, createServiceClient } from '@/lib/supabase/server';
import { encryptApiKey, maskApiKey, decryptApiKey } from '@/lib/encryption';
import { CatalogRepository } from '@/repositories/catalogRepository';
import { AuthRequiredError, ValidationError, handleApiError, jsonResponse } from '@/lib/utils/errors';
import { z } from 'zod/v4';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SaveKeySchema = z.object({
  apiId: z.string().uuid(),
  apiKey: z.string().min(1).max(500),
});

/** GET /api/v1/user-api-keys — 내가 등록한 API 키 목록 (마스킹) */
export async function GET(): Promise<Response> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthRequiredError();

    const { data, error } = await supabase
      .from('user_api_keys')
      .select('id, api_id, encrypted_key, is_verified, verified_at, created_at')
      .eq('user_id', user.id);

    if (error) throw error;

    const items = (data ?? []).map((row) => {
      let maskedKey = '****';
      try {
        maskedKey = maskApiKey(decryptApiKey(row.encrypted_key));
      } catch {
        // 복호화 실패 시 마스킹된 기본값 반환
      }
      return {
        id: row.id,
        apiId: row.api_id,
        maskedKey,
        isVerified: row.is_verified,
        verifiedAt: row.verified_at,
        createdAt: row.created_at,
      };
    });

    return jsonResponse({ success: true, data: items });
  } catch (error) {
    return handleApiError(error);
  }
}

/** POST /api/v1/user-api-keys — API 키 저장 (신규 또는 업데이트) */
export async function POST(request: Request): Promise<Response> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthRequiredError();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError('요청 형식이 올바르지 않습니다.');
    }

    const parsed = SaveKeySchema.safeParse(body);
    if (!parsed.success) {
      throw new ValidationError('입력값이 올바르지 않습니다.');
    }

    const { apiId, apiKey } = parsed.data;

    const svcClient = await createServiceClient();
    const catalogRepo = new CatalogRepository(svcClient);
    const api = await catalogRepo.findById(apiId);
    if (!api || !api.isActive) {
      return jsonResponse(
        { success: false, error: { code: 'NOT_FOUND', message: '해당 API를 찾을 수 없습니다.' } },
        { status: 404 }
      );
    }

    let encryptedKey: string;
    try {
      encryptedKey = encryptApiKey(apiKey.trim());
    } catch {
      throw new Error('키 암호화 중 오류가 발생했습니다.');
    }

    const { data: userRow } = await supabase
      .from('users')
      .select('id')
      .eq('id', user.id)
      .single();
    const userId = userRow?.id ?? user.id;

    const { error } = await supabase.from('user_api_keys').upsert(
      {
        user_id: userId,
        api_id: apiId,
        encrypted_key: encryptedKey,
        is_verified: false,
        verified_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,api_id' }
    );

    if (error) throw error;

    return jsonResponse({ success: true, data: { message: 'API 키가 저장되었습니다.' } });
  } catch (error) {
    return handleApiError(error);
  }
}

/** DELETE /api/v1/user-api-keys?apiId=xxx — API 키 삭제 */
export async function DELETE(request: Request): Promise<Response> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthRequiredError();

    const apiId = new URL(request.url).searchParams.get('apiId');
    if (!apiId) throw new ValidationError('apiId가 필요합니다.');
    if (!UUID_RE.test(apiId)) throw new ValidationError('유효하지 않은 API ID 형식입니다.');

    const { error } = await supabase
      .from('user_api_keys')
      .delete()
      .eq('user_id', user.id)
      .eq('api_id', apiId);

    if (error) throw error;

    return jsonResponse({ success: true, data: { message: 'API 키가 삭제되었습니다.' } });
  } catch (error) {
    return handleApiError(error);
  }
}
