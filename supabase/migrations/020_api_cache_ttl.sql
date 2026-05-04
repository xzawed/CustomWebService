-- Migration 020: api_catalog에 cache_ttl_seconds 컬럼 추가
-- 기상청처럼 응답이 수 시간 동안 변하지 않는 API에 서버 사이드 캐시 TTL 지정용.
-- NULL = 캐싱 비활성화 (기존 동작 유지)

ALTER TABLE api_catalog
  ADD COLUMN IF NOT EXISTS cache_ttl_seconds INTEGER DEFAULT NULL;

-- 기상청 단기예보: 3시간(10800초) TTL — 3시간 단위 예보라 더 빠른 갱신 불필요
UPDATE api_catalog
  SET cache_ttl_seconds = 10800
  WHERE name = '기상청 단기예보';

-- 기상청 중기예보: 6시간(21600초) TTL — 3~10일 전망은 6시간마다 업데이트
UPDATE api_catalog
  SET cache_ttl_seconds = 21600
  WHERE name = '기상청 중기예보';
