-- =============================================================================
-- REST Countries 폐기(deprecate) SQL
-- 생성일: 2026-06-21
-- 목적: REST Countries v3.1 전 엔드포인트가 deprecated 되어 사용 불가.
--       (HTTP 200이나 본문이 deprecation 에러 객체, legacy.json으로 301 + 경로 stripping)
--       무료 키리스 대체가 없어(v5는 유료·키 필요) 카탈로그에서 비활성화한다.
--
-- 라이브 검증(2026-06-21): /v3.1/name/korea, /v3.1/alpha/KR, /v3.1/all 모두
--   → 301 https://files-03.restcountries.com/countries.00/legacy.json
--   → HTTP 200 {"success":false,"errors":[{"message":"This API version has been deprecated..."}]}
--
-- 권장 대체: 오픈 데이터셋(mledoze/countries)을 번들/셀프호스트 후 자체 캐시 프록시로 서빙.
--           국가 데이터는 준-정적이므로 주기적 갱신으로 충분.
--
-- 실행 방법: Supabase SQL 에디터에서 실행 (이미 프로덕션에 적용됨 — 기록/재현용)
-- 롤백: is_active=true, deprecated_at=NULL, verification_status='unverified' 로 복원
-- =============================================================================

UPDATE api_catalog
SET
  is_active = false,
  deprecated_at = NOW(),
  verification_status = 'broken',
  last_verification_note = '2026-06-21 라이브 검증: v3.1 전 엔드포인트(name/alpha/all) deprecated. HTTP 200이나 본문이 deprecation 에러 객체이며 legacy.json으로 301(경로 stripping). 무료 키리스 대체 없음(v5는 유료·키 필요). 권장 대체: mledoze/countries 데이터셋 번들/셀프호스트.',
  updated_at = NOW()
WHERE name = 'REST Countries';

-- 확인
SELECT id, name, is_active, verification_status, deprecated_at, last_verification_note
FROM api_catalog
WHERE name = 'REST Countries';
