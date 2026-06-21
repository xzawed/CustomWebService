-- =============================================================================
-- 플랫폼 키 미설정(빈 값) API 7개 비활성화 SQL
-- 생성일: 2026-06-21
-- 배경: 배포 런타임 진단(GET /api/v1/admin/keys-verify)에서 7개 키 의존 API의
--       auth_config.env_var가 모두 process.env 미설정(빈 값)으로 확인됨.
--       Railway 변수는 이름만 존재하고 값이 비어 있음(sealed 아님 — 배포에 미주입).
--       → 키 없이 제공되어 사용자가 선택 시 401 실패. 플랫폼 신뢰도 원칙 위반.
-- 조치: 실제 키 확보 전까지 is_active=false. 데이터는 보존(재활성화 대비).
--
-- 영향: 활성 30 → 23 (모두 키 불필요·즉시 사용 가능). 비활성 18 → 25.
-- 재활성화: 실제 키를 Railway env(API_KEY_*)에 입력 후 is_active=true로 복원하고
--           /admin/keys-verify로 유효성(및 프록시 prefix 적용 여부) 재검증.
--
-- 실행: Supabase SQL 에디터 (이미 프로덕션 적용됨 — 기록/재현용)
-- =============================================================================

UPDATE api_catalog
SET is_active = false,
    last_verification_note = '2026-06-21 비활성화: 플랫폼 env 키 미설정(빈 값) — /admin/keys-verify로 7개 전부 MISSING 확인. 키 의존 API가 키 없이 제공되어 401 실패. 실제 키 확보 시 재활성화.',
    updated_at = NOW()
WHERE id IN (
  '2a31bfbe-2ce0-43c0-8a9f-c1ce7bf7235d', -- Unsplash (API_KEY_UNSPLASH)
  '15b51435-de0d-4c53-854c-dfcf08f4bcac', -- 공휴일 정보 (API_KEY_15B51435)
  'f1ec6f97-2e13-4e9a-9a73-18738f7164b2', -- 카카오 로컬 (API_KEY_F1EC6F97)
  'bda9be95-bb3b-4f30-b1da-c304445b7c3c', -- 아파트 실거래가 (API_KEY_BDA9BE95)
  '2937a35f-806e-402c-98c3-d0261e1ad2f4', -- 카카오 검색 (API_KEY_F1EC6F97)
  '7cb8f428-e284-4eee-944a-af47274662d2', -- 기상청 단기예보 (API_KEY_7CB8F428)
  '00412c2b-6c17-4b23-9a3d-46b7004285e4'  -- 기상청 중기예보 (API_KEY_00412C2B)
);

-- 확인
SELECT count(*) FILTER (WHERE is_active) AS active,
       count(*) FILTER (WHERE NOT is_active) AS inactive
FROM api_catalog;
