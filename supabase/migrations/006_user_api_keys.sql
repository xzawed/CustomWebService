-- 006_user_api_keys.sql
-- user_api_keys 테이블에 검증 상태 컬럼 추가.
-- (테이블 자체는 001_initial_schema.sql에 이미 존재)

ALTER TABLE user_api_keys
  ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- 프록시에서 (user_id + api_id) 조회 최적화
CREATE INDEX IF NOT EXISTS idx_user_api_keys_lookup
  ON user_api_keys (user_id, api_id);
