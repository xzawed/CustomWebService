import { createClient, createServiceClient } from '@/lib/supabase/server';
import { encryptApiKey, maskApiKey, decryptApiKey } from '@/lib/encryption';
import { CatalogRepository } from '@/repositories/catalogRepository';
import { z } from 'zod';

const SaveKeySchema = z.object({
  apiId: z.string().uuid(),
  apiKey: z.string().min(1).max(500),
});

/** GET /api/v1/user-api-keys — 내가 등록한 API 키 목록 (마스킹) */
export async function GET(): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ success: false, error: { code: 'AUTH_REQUIRED', message: '로그인이 필요합니다.' } }, { status: 401 });

  const { data, error } = await supabase
    .from('user_api_keys')
    .select('id, api_id, encrypted_key, is_verified, verified_at, created_at')
    .eq('user_id', user.id);

  if (error) return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } }, { status: 500 });

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

  return Response.json({ success: true, data: items });
}

/** POST /api/v1/user-api-keys — API 키 저장 (신규 또는 업데이트) */
export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ success: false, error: { code: 'AUTH_REQUIRED', message: '로그인이 필요합니다.' } }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: { code: 'INVALID_INPUT', message: '요청 형식이 올바르지 않습니다.' } }, { status: 400 });
  }

  const parsed = SaveKeySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ success: false, error: { code: 'INVALID_INPUT', message: '입력값이 올바르지 않습니다.' } }, { status: 400 });
  }

  const { apiId, apiKey } = parsed.data;

  // API 존재 확인
  const svcClient = await createServiceClient();
  const catalogRepo = new CatalogRepository(svcClient);
  const api = await catalogRepo.findById(apiId);
  if (!api || !api.isActive) {
    return Response.json({ success: false, error: { code: 'NOT_FOUND', message: '해당 API를 찾을 수 없습니다.' } }, { status: 404 });
  }

  let encryptedKey: string;
  try {
    encryptedKey = encryptApiKey(apiKey.trim());
  } catch {
    return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: '키 저장 중 오류가 발생했습니다.' } }, { status: 500 });
  }

  // 사용자 UUID(auth) → users 테이블 id 조회
  const { data: userRow } = await supabase.from('users').select('id').eq('id', user.id).single();
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

  if (error) return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } }, { status: 500 });

  return Response.json({ success: true, data: { message: 'API 키가 저장되었습니다.' } });
}

/** DELETE /api/v1/user-api-keys?apiId=xxx — API 키 삭제 */
export async function DELETE(request: Request): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ success: false, error: { code: 'AUTH_REQUIRED', message: '로그인이 필요합니다.' } }, { status: 401 });

  const apiId = new URL(request.url).searchParams.get('apiId');
  if (!apiId) return Response.json({ success: false, error: { code: 'INVALID_INPUT', message: 'apiId가 필요합니다.' } }, { status: 400 });

  const { error } = await supabase
    .from('user_api_keys')
    .delete()
    .eq('user_id', user.id)
    .eq('api_id', apiId);

  if (error) return Response.json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } }, { status: 500 });

  return Response.json({ success: true, data: { message: 'API 키가 삭제되었습니다.' } });
}
