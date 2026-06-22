import { createClient } from '@supabase/supabase-js';
import { getDbProvider } from '@/lib/config/providers';
import { createCatalogService } from '@/services/factory';

/**
 * 공개 카탈로그의 활성 API 개수 — 랜딩/마케팅 카피의 **단일 진실원천**(DB api_catalog is_active=true·미폐기).
 *
 * - 하드코딩 드리프트 방지: 숫자를 코드에 박지 않고 DB에서 읽는다.
 * - 쿠키 미사용(anon 공개 읽기)이라 호출 페이지를 정적/ISR로 유지할 수 있다.
 *   (캐시는 호출 측 페이지의 `revalidate`(ISR)로 처리 — 홈 DB 부하를 막는다.)
 * - 조회 실패 시 0을 반환한다(호출 측에서 폴백 처리해 홈 렌더가 깨지지 않게 한다).
 */
export async function getActiveApiCount(): Promise<number> {
  try {
    const provider = getDbProvider();
    let supabase;
    if (provider === 'supabase') {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !anonKey) return 0;
      supabase = createClient(url, anonKey);
    }
    return await createCatalogService(supabase).countActive();
  } catch {
    return 0;
  }
}
