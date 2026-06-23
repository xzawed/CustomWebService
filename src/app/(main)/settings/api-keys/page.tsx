import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth/index';
import { getDbProvider } from '@/lib/config/providers';
import { createClient } from '@/lib/supabase/server';
import { createCatalogRepository, createUserApiKeyRepository } from '@/repositories/factory';
import { decryptApiKey, maskApiKey } from '@/lib/encryption';
import { ApiKeyPageClient } from './ApiKeyPageClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: '내 API 키 관리' };

export default async function ApiKeysPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const supabase = getDbProvider() === 'supabase' ? await createClient() : undefined;

  // api_key 인증이 필요한 API 목록 조회
  const catalogRepo = createCatalogRepository(supabase);
  const { items: allApis } = await catalogRepo.findMany({ isActive: true }, { limit: 100 });
  const apiKeyApis = allApis.filter((api) => api.authType === 'api_key');

  // 사용자가 이미 등록한 키 목록 (모든 provider — 레포 경유)
  const savedKeys = await createUserApiKeyRepository(supabase).findAllByUser(user.id);

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
        initialSavedKeys={savedKeys.map((k) => {
          let maskedKey = '****';
          try { maskedKey = maskApiKey(decryptApiKey(k.encryptedKey)); } catch { /* 복호화 실패 시 기본값 */ }
          return { apiId: k.apiId, maskedKey, isVerified: k.isVerified };
        })}
      />
    </div>
  );
}
