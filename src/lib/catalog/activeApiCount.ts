import { createCatalogService } from '@/services/factory';

/**
 * 공개 카탈로그의 활성 API 개수 — 랜딩/마케팅 카피의 **단일 진실원천**(DB api_catalog is_active=true·미폐기).
 *
 * - 하드코딩 드리프트 방지: 숫자를 코드에 박지 않고 DB에서 읽는다.
 * - 임베디드 SQLite에서 직접 카운트(별도 클라이언트 불필요).
 *   (캐시는 호출 측 페이지의 `revalidate`(ISR)로 처리 — 홈 DB 부하를 막는다.)
 * - 조회 실패 시 0을 반환한다(호출 측에서 폴백 처리해 홈 렌더가 깨지지 않게 한다).
 */
export async function getActiveApiCount(): Promise<number> {
  try {
    return await createCatalogService().countActive();
  } catch {
    return 0;
  }
}
