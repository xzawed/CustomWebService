import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth/index';
import { getDbProvider } from '@/lib/config/providers';
import { createClient } from '@/lib/supabase/server';
import { createCatalogRepository } from '@/repositories/factory';
import { ApiKeyPageClient } from './ApiKeyPageClient';

export const metadata = { title: '내 API 키 관리' };

export default async function ApiKeysPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const supabase = getDbProvider() === 'supabase' ? await createClient() : undefined;

  // api_key 인증이 필요한 API 목록 조회
  const catalogRepo = createCatalogRepository(supabase);
  const { items: allApis } = await catalogRepo.findMany({ isActive: true }, { limit: 100 });
  const apiKeyApis = allApis.filter((api) => api.authType === 'api_key');

  // 사용자가 이미 등록한 키 목록 (Supabase 전용 직접 조회)
  let savedKeys: { api_id: string; encrypted_key: string; is_verified: boolean | null }[] = [];
  if (supabase) {
    const { data } = await supabase
      .from('user_api_keys')
      .select('api_id, encrypted_key, is_verified')
      .eq('user_id', user.id);
    savedKeys = data ?? [];
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">내 API 키 관리</h1>
        <p className="mt-2 text-slate-400 leading-relaxed">
          아래 API 키를 등록하면 생성된 서비스에서 실제 데이터를 바로 보여줄 수 있어요.
          <br />
          <span className="text-cyan-400">발급 방법</span> 버튼을 누르면 단계별 안내를 볼 수 있어요.
        </p>
      </div>

      <ApiKeyPageClient
        apis={apiKeyApis}
        initialSavedKeys={savedKeys.map((k) => ({
          apiId: k.api_id,
          encryptedKey: k.encrypted_key,
          isVerified: k.is_verified ?? false,
        }))}
      />
    </div>
  );
}
