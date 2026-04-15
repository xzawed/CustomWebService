-- =============================================================================
-- 골든셋 API Backfill SQL
-- 생성일: 2026-04-16
-- 목적: 검증된 6개 API에 exampleCall, responseDataPath를 추가하고
--       verification_status = 'verified'로 업데이트
--
-- 실행 방법: Supabase SQL 에디터에서 전체 실행
-- 주의: endpoints JSONB의 기존 필드는 jsonb_array_elements로 병합 — 기존 데이터 손실 없음
-- =============================================================================

-- --------------------------------------------------------
-- 1. Random User API
--    id: 6890346f-fa79-483c-bce2-f841ad3420fd
--    검증 엔드포인트: GET /api/
--    responseDataPath: results
-- --------------------------------------------------------
UPDATE api_catalog
SET
  verification_status = 'verified',
  verified_at = NOW(),
  last_verification_note = '2026-04-16 자동 검증 통과',
  endpoints = (
    SELECT jsonb_agg(
      CASE
        WHEN ep->>'path' = '/api/'
        THEN ep
          || jsonb_build_object(
               'example_call',
               'const res = await fetch(''/api/v1/proxy?apiId=6890346f-fa79-483c-bce2-f841ad3420fd&proxyPath=%2Fapi%2F'');' || E'\n'
               || 'const data = await res.json();' || E'\n'
               || 'const items = data.results; // [{name, email, picture, location, ...}]'
             )
          || jsonb_build_object('response_data_path', 'results')
        ELSE ep
      END
    )
    FROM jsonb_array_elements(endpoints) AS ep
  )
WHERE id = '6890346f-fa79-483c-bce2-f841ad3420fd';

-- --------------------------------------------------------
-- 2. JSONPlaceholder
--    id: 04e79764-c27c-46d8-b63c-2794fbe5a3f7
--    검증 엔드포인트: GET /posts, GET /todos, GET /users
--    responseDataPath: 없음 (direct array)
-- --------------------------------------------------------
UPDATE api_catalog
SET
  verification_status = 'verified',
  verified_at = NOW(),
  last_verification_note = '2026-04-16 자동 검증 통과',
  endpoints = (
    SELECT jsonb_agg(
      CASE
        WHEN ep->>'path' = '/posts'
        THEN ep
          || jsonb_build_object(
               'example_call',
               'const res = await fetch(''/api/v1/proxy?apiId=04e79764-c27c-46d8-b63c-2794fbe5a3f7&proxyPath=%2Fposts'');' || E'\n'
               || 'const items = await res.json(); // [{id, userId, title, body}]'
             )
        WHEN ep->>'path' = '/todos'
        THEN ep
          || jsonb_build_object(
               'example_call',
               'const res = await fetch(''/api/v1/proxy?apiId=04e79764-c27c-46d8-b63c-2794fbe5a3f7&proxyPath=%2Ftodos'');' || E'\n'
               || 'const items = await res.json(); // [{id, userId, title, completed}]'
             )
        WHEN ep->>'path' = '/users'
        THEN ep
          || jsonb_build_object(
               'example_call',
               'const res = await fetch(''/api/v1/proxy?apiId=04e79764-c27c-46d8-b63c-2794fbe5a3f7&proxyPath=%2Fusers'');' || E'\n'
               || 'const items = await res.json(); // [{id, name, username, email, address, phone, website, company}]'
             )
        ELSE ep
      END
    )
    FROM jsonb_array_elements(endpoints) AS ep
  )
WHERE id = '04e79764-c27c-46d8-b63c-2794fbe5a3f7';

-- --------------------------------------------------------
-- 3. PokéAPI
--    id: 02cea7ab-d89a-4e51-b9c5-32ed0fd00338
--    검증 엔드포인트: GET /api/v2/pokemon
--    responseDataPath: results
-- --------------------------------------------------------
UPDATE api_catalog
SET
  verification_status = 'verified',
  verified_at = NOW(),
  last_verification_note = '2026-04-16 자동 검증 통과',
  endpoints = (
    SELECT jsonb_agg(
      CASE
        WHEN ep->>'path' = '/api/v2/pokemon'
        THEN ep
          || jsonb_build_object(
               'example_call',
               'const res = await fetch(''/api/v1/proxy?apiId=02cea7ab-d89a-4e51-b9c5-32ed0fd00338&proxyPath=%2Fapi%2Fv2%2Fpokemon'');' || E'\n'
               || 'const data = await res.json();' || E'\n'
               || 'const items = data.results; // [{name, url}]'
             )
          || jsonb_build_object('response_data_path', 'results')
        ELSE ep
      END
    )
    FROM jsonb_array_elements(endpoints) AS ep
  )
WHERE id = '02cea7ab-d89a-4e51-b9c5-32ed0fd00338';

-- --------------------------------------------------------
-- 4. Open Notify (ISS)
--    id: 9a04cd18-15bb-4424-a4f1-10ddf728749b
--    검증 엔드포인트: GET /iss-now.json, GET /astros.json
--    /iss-now.json → responseDataPath: 없음 (단일 객체)
--    /astros.json  → responseDataPath: people
-- --------------------------------------------------------
UPDATE api_catalog
SET
  verification_status = 'verified',
  verified_at = NOW(),
  last_verification_note = '2026-04-16 자동 검증 통과',
  endpoints = (
    SELECT jsonb_agg(
      CASE
        WHEN ep->>'path' = '/iss-now.json'
        THEN ep
          || jsonb_build_object(
               'example_call',
               'const res = await fetch(''/api/v1/proxy?apiId=9a04cd18-15bb-4424-a4f1-10ddf728749b&proxyPath=%2Fiss-now.json'');' || E'\n'
               || 'const data = await res.json();' || E'\n'
               || '// data.iss_position.latitude, data.iss_position.longitude'
             )
        WHEN ep->>'path' = '/astros.json'
        THEN ep
          || jsonb_build_object(
               'example_call',
               'const res = await fetch(''/api/v1/proxy?apiId=9a04cd18-15bb-4424-a4f1-10ddf728749b&proxyPath=%2Fastros.json'');' || E'\n'
               || 'const data = await res.json();' || E'\n'
               || 'const items = data.people; // [{name, craft}]'
             )
          || jsonb_build_object('response_data_path', 'people')
        ELSE ep
      END
    )
    FROM jsonb_array_elements(endpoints) AS ep
  )
WHERE id = '9a04cd18-15bb-4424-a4f1-10ddf728749b';

-- --------------------------------------------------------
-- 5. Hacker News API
--    id: de8f5375-22dc-4573-9a64-2903c150fece
--    검증 엔드포인트: GET /v0/topstories.json
--    responseDataPath: 없음 (direct integer array)
-- --------------------------------------------------------
UPDATE api_catalog
SET
  verification_status = 'verified',
  verified_at = NOW(),
  last_verification_note = '2026-04-16 자동 검증 통과',
  endpoints = (
    SELECT jsonb_agg(
      CASE
        WHEN ep->>'path' = '/v0/topstories.json'
        THEN ep
          || jsonb_build_object(
               'example_call',
               'const res = await fetch(''/api/v1/proxy?apiId=de8f5375-22dc-4573-9a64-2903c150fece&proxyPath=%2Fv0%2Ftopstories.json'');' || E'\n'
               || 'const storyIds = await res.json(); // [integer IDs]' || E'\n'
               || '// 개별 기사: /api/v1/proxy?apiId=...&proxyPath=/v0/item/STORY_ID.json'
             )
        ELSE ep
      END
    )
    FROM jsonb_array_elements(endpoints) AS ep
  )
WHERE id = 'de8f5375-22dc-4573-9a64-2903c150fece';

-- --------------------------------------------------------
-- 6. Spaceflight News API
--    id: 8461e4de-ba6d-4a4d-ae24-35bd7c47c0c7
--    검증 엔드포인트: GET /v4/articles/
--    responseDataPath: results
-- --------------------------------------------------------
UPDATE api_catalog
SET
  verification_status = 'verified',
  verified_at = NOW(),
  last_verification_note = '2026-04-16 자동 검증 통과',
  endpoints = (
    SELECT jsonb_agg(
      CASE
        WHEN ep->>'path' = '/v4/articles/' OR ep->>'path' = '/v4/articles'
        THEN ep
          || jsonb_build_object(
               'example_call',
               'const res = await fetch(''/api/v1/proxy?apiId=8461e4de-ba6d-4a4d-ae24-35bd7c47c0c7&proxyPath=%2Fv4%2Farticles%2F'');' || E'\n'
               || 'const data = await res.json();' || E'\n'
               || 'const items = data.results; // [{id, title, url, imageUrl, newsSite, summary, publishedAt}]'
             )
          || jsonb_build_object('response_data_path', 'results')
        ELSE ep
      END
    )
    FROM jsonb_array_elements(endpoints) AS ep
  )
WHERE id = '8461e4de-ba6d-4a4d-ae24-35bd7c47c0c7';

-- --------------------------------------------------------
-- 검증: 업데이트된 행 확인
-- --------------------------------------------------------
SELECT
  id,
  name,
  verification_status,
  verified_at,
  last_verification_note,
  jsonb_array_length(endpoints) AS endpoint_count
FROM api_catalog
WHERE id IN (
  '6890346f-fa79-483c-bce2-f841ad3420fd',
  '04e79764-c27c-46d8-b63c-2794fbe5a3f7',
  '02cea7ab-d89a-4e51-b9c5-32ed0fd00338',
  '9a04cd18-15bb-4424-a4f1-10ddf728749b',
  'de8f5375-22dc-4573-9a64-2903c150fece',
  '8461e4de-ba6d-4a4d-ae24-35bd7c47c0c7'
)
ORDER BY name;
