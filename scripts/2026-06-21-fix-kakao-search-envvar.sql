-- =============================================================================
-- 카카오 검색 env_var 정정 SQL
-- 생성일: 2026-06-21
-- 문제: 카카오 검색(id 2937a35f-...)의 auth_config.env_var가 'API_KEY_KAKAO'였으나
--       Railway production에 해당 변수가 존재하지 않음 → 프록시가 키를 못 찾아 401 → 검색 깨짐.
-- 조치: 카카오 로컬과 동일한 키 변수(API_KEY_F1EC6F97)로 정정 (ADR: 카카오 로컬·검색 동일 키).
--
-- ⚠️ 별도 이슈: 프록시(resolveApiKey)가 auth_config의 prefix/header_prefix("KakaoAK ")를
--    적용하지 않고 raw 값을 주입한다. 키 값에 prefix가 포함돼야 동작 — /api/v1/admin/keys-verify
--    진단으로 확인 후 프록시 수정 여부 결정.
--
-- 실행: Supabase SQL 에디터 (이미 프로덕션 적용됨 — 기록/재현용)
-- 롤백: env_var를 'API_KEY_KAKAO'로 되돌림
-- =============================================================================

UPDATE api_catalog
SET auth_config = jsonb_set(auth_config, '{env_var}', '"API_KEY_F1EC6F97"'),
    last_verification_note = '2026-06-21 env_var 정정: API_KEY_KAKAO(미존재) → API_KEY_F1EC6F97(카카오 로컬과 동일 키, ADR 근거). 프록시 prefix 미적용 이슈는 별도 진단 필요',
    updated_at = NOW()
WHERE id = '2937a35f-806e-402c-98c3-d0261e1ad2f4';

SELECT name, auth_config FROM api_catalog WHERE id = '2937a35f-806e-402c-98c3-d0261e1ad2f4';
