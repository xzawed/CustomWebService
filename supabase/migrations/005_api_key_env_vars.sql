-- 005_api_key_env_vars.sql
-- API 키가 필요한 카탈로그 항목에 환경변수 이름(env_var)을 auth_config에 추가.
-- 프록시 라우트(/api/v1/proxy)가 이 값을 읽어 process.env에서 실제 키를 주입한다.
--
-- 명명 규칙: API_KEY_<영문+숫자 대문자 슬러그>
-- 한국어 전용 이름처럼 영문이 없는 경우 UUID 앞 8자리를 사용.

UPDATE api_catalog
SET auth_config = COALESCE(auth_config, '{}'::jsonb) ||
  jsonb_build_object(
    'env_var',
    'API_KEY_' || COALESCE(
      -- 영문·숫자만 남기고 공백→언더스코어, 앞뒤 언더스코어 제거
      NULLIF(
        regexp_replace(
          upper(
            regexp_replace(
              regexp_replace(name, '[^A-Za-z0-9 ]', '', 'g'),
              '\s+', '_', 'g'
            )
          ),
          '^_+|_+$', '', 'g'
        ),
        ''
      ),
      -- 영문이 전혀 없는 이름(한국어 전용)은 UUID 앞 8자리 사용
      upper(left(replace(id::text, '-', ''), 8))
    )
  )
WHERE auth_type = 'api_key'
  AND (auth_config IS NULL OR auth_config->>'env_var' IS NULL);

-- 결과 확인용 (실행 후 참고)
-- SELECT name, auth_config->>'env_var' AS env_var FROM api_catalog WHERE auth_type = 'api_key' ORDER BY name;
