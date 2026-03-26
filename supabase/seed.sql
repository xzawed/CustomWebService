-- seed.sql
-- CustomWebService seed data
-- 총 55개 API + 7개 피처 플래그

-- ============================================================
-- FEATURE FLAGS
-- ============================================================

INSERT INTO feature_flags (flag_name, enabled, description, rules) VALUES
  ('enable_dark_mode', true, 'Enable dark mode UI theme toggle', '{"default": true}'::jsonb),
  ('enable_code_viewer', true, 'Enable the code viewer panel for generated output', '{"default": true}'::jsonb),
  ('enable_ollama_fallback', false, 'Fall back to local Ollama models when cloud AI is unavailable', '{"models": ["llama3", "codellama"]}'::jsonb),
  ('enable_template_system', false, 'Enable project templates for quick start', '{"categories": ["dashboard", "landing", "widget"]}'::jsonb),
  ('enable_multi_language', false, 'Enable multi-language UI support (i18n)', '{"supported": ["ko", "en", "ja"]}'::jsonb),
  ('enable_team_features', false, 'Enable team collaboration and organization features', '{"min_plan": "pro"}'::jsonb),
  ('enable_advanced_prompt', false, 'Enable advanced prompt engineering options for code generation', '{"max_tokens": 4096}'::jsonb);

-- ============================================================
-- API CATALOG
-- ============================================================
-- 카테고리: weather, finance, data, entertainment, image, utility, fun, science, news, social, dictionary, location, transport, realestate, tourism, lifestyle

-- ────────────────────────────────────────
-- [날씨] weather
-- ────────────────────────────────────────

-- 1. Open-Meteo
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Open-Meteo',
  '전 세계 날씨 예보. 위치만 입력하면 시간별·일별 날씨를 바로 알려줘요. 가입 없이 무료로 사용할 수 있어요.',
  'weather',
  'https://api.open-meteo.com',
  'none',
  600,
  true,
  'https://open-meteo.com/en/docs',
  '[{"method": "GET", "path": "/v1/forecast", "description": "좌표로 날씨 예보 조회", "parameters": {"latitude": "number", "longitude": "number", "hourly": "string", "daily": "string"}}]'::jsonb,
  ARRAY['weather', 'forecast', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- 2. OpenWeatherMap
INSERT INTO api_catalog (name, description, category, base_url, auth_type, auth_config, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy, credit_required) VALUES
(
  'OpenWeatherMap',
  '현재 날씨, 5일 예보, 대기질 정보를 제공해요. 무료 가입 후 API 키를 발급받아 사용합니다.',
  'weather',
  'https://api.openweathermap.org',
  'api_key',
  '{"param_name": "appid", "param_in": "query"}'::jsonb,
  60,
  true,
  'https://openweathermap.org/api',
  '[{"method": "GET", "path": "/data/2.5/weather", "description": "도시명 또는 좌표로 현재 날씨 조회", "parameters": {"q": "string", "lat": "number", "lon": "number", "units": "string"}}]'::jsonb,
  ARRAY['weather', 'forecast', 'api-key'],
  'v2.5',
  true,
  false,
  0
);

-- 3. WeatherAPI.com
INSERT INTO api_catalog (name, description, category, base_url, auth_type, auth_config, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'WeatherAPI.com',
  '14일 예보 + 일출·일몰 시각을 알려줘요. 월 100만 호출 무료. 캠핑·야외 활동 계획에 유용합니다.',
  'weather',
  'https://api.weatherapi.com',
  'api_key',
  '{"param_name": "key", "param_in": "query"}'::jsonb,
  500,
  true,
  'https://www.weatherapi.com/docs/',
  '[{"method": "GET", "path": "/v1/forecast.json", "description": "날씨 예보 조회 (최대 14일)", "parameters": {"q": "string", "days": "number"}}]'::jsonb,
  ARRAY['weather', 'forecast', 'astronomy', 'api-key'],
  'v1',
  true,
  false
);

-- 4. 기상청 단기예보
INSERT INTO api_catalog (name, description, category, base_url, auth_type, auth_config, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  '기상청 단기예보',
  '우리 동네 날씨 예보. 기온, 비, 눈, 바람, 습도를 3시간 단위로 알려줘요. 공공데이터포털 무료 가입 후 사용.',
  'weather',
  'http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0',
  'api_key',
  '{"param_name": "serviceKey", "param_in": "query"}'::jsonb,
  300,
  true,
  'https://www.data.go.kr/data/15084084/openapi.do',
  '[{"method": "GET", "path": "/getVilageFcst", "description": "동네 예보 조회 (3시간 단위)", "parameters": {"base_date": "string", "base_time": "string", "nx": "number", "ny": "number"}}]'::jsonb,
  ARRAY['weather', 'korea', '공공데이터', 'api-key'],
  'v2.0',
  false,
  true
);

-- 5. 기상청 중기예보
INSERT INTO api_catalog (name, description, category, base_url, auth_type, auth_config, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  '기상청 중기예보',
  '3~10일 후 날씨 전망. 이번 주 비가 올지, 기온이 어떨지 미리 확인할 수 있어요.',
  'weather',
  'http://apis.data.go.kr/1360000/MidFcstInfoService',
  'api_key',
  '{"param_name": "serviceKey", "param_in": "query"}'::jsonb,
  300,
  true,
  'https://www.data.go.kr/data/15059468/openapi.do',
  '[{"method": "GET", "path": "/getMidTa", "description": "중기 기온 예보 조회", "parameters": {"regId": "string", "tmFc": "string"}}]'::jsonb,
  ARRAY['weather', 'korea', '공공데이터', 'api-key'],
  'v1',
  false,
  true
);

-- ────────────────────────────────────────
-- [환경] environment
-- ────────────────────────────────────────

-- 6. 에어코리아 대기오염
INSERT INTO api_catalog (name, description, category, base_url, auth_type, auth_config, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  '에어코리아 대기오염정보',
  '우리 동네 미세먼지(PM2.5, PM10), 오존 수치를 실시간으로 보여줘요. 외출 전 확인하면 좋아요.',
  'weather',
  'http://apis.data.go.kr/B552584/ArpltnInforInqireSvc',
  'api_key',
  '{"param_name": "serviceKey", "param_in": "query"}'::jsonb,
  300,
  true,
  'https://www.data.go.kr/data/15073861/openapi.do',
  '[{"method": "GET", "path": "/getMsrstnAcctoRltmMesureDnsty", "description": "측정소별 실시간 대기질 조회", "parameters": {"stationName": "string", "dataTerm": "string"}}]'::jsonb,
  ARRAY['weather', 'air-quality', 'korea', '공공데이터', 'api-key'],
  'v1',
  false,
  true
);

-- ────────────────────────────────────────
-- [금융] finance
-- ────────────────────────────────────────

-- 7. Frankfurter
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Frankfurter',
  '유럽중앙은행 기준 환율 조회. 30개국 통화를 실시간으로 변환할 수 있어요. 여행 환율 계산기에 딱!',
  'finance',
  'https://api.frankfurter.app',
  'none',
  300,
  true,
  'https://www.frankfurter.app/docs/',
  '[{"method": "GET", "path": "/latest", "description": "최신 환율 조회", "parameters": {"from": "string", "to": "string"}}, {"method": "GET", "path": "/{date}", "description": "특정 날짜 환율 조회", "parameters": {"date": "string"}}]'::jsonb,
  ARRAY['finance', 'currency', 'exchange-rate', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- 8. ExchangeRate-API
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'ExchangeRate-API',
  '150개국 환율 조회. 가입 없이 바로 사용 가능해요. 원화(KRW) 포함 모든 통화 지원.',
  'finance',
  'https://open.er-api.com',
  'none',
  50,
  true,
  'https://www.exchangerate-api.com/docs/free',
  '[{"method": "GET", "path": "/v6/latest/{currency}", "description": "기준 통화 대비 전체 환율 조회", "parameters": {"currency": "string"}}]'::jsonb,
  ARRAY['finance', 'currency', 'exchange-rate', 'free', 'no-auth'],
  'v6',
  true,
  false
);

-- 9. CoinGecko
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'CoinGecko',
  '비트코인, 이더리움 등 18,000개 암호화폐 실시간 시세를 조회할 수 있어요.',
  'finance',
  'https://api.coingecko.com',
  'none',
  30,
  true,
  'https://docs.coingecko.com/reference/introduction',
  '[{"method": "GET", "path": "/api/v3/simple/price", "description": "코인 가격 조회", "parameters": {"ids": "string", "vs_currencies": "string"}}, {"method": "GET", "path": "/api/v3/coins/list", "description": "지원 코인 전체 목록"}]'::jsonb,
  ARRAY['finance', 'crypto', 'cryptocurrency', 'free'],
  'v3',
  true,
  false
);

-- 10. CoinDesk BPI
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'CoinDesk BPI',
  '비트코인 실시간 시세(달러·유로·파운드)를 한 줄로 조회. 가장 간단한 비트코인 가격 API.',
  'finance',
  'https://api.coindesk.com',
  'none',
  300,
  true,
  'https://www.coindesk.com/coindesk-api',
  '[{"method": "GET", "path": "/v1/bpi/currentprice.json", "description": "비트코인 현재 가격 (USD/GBP/EUR)"}]'::jsonb,
  ARRAY['finance', 'crypto', 'bitcoin', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- 11. 한국은행 경제통계
INSERT INTO api_catalog (name, description, category, base_url, auth_type, auth_config, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  '한국은행 경제통계 (ECOS)',
  '기준금리, 환율, GDP, 소비자물가 등 한국 경제 지표. 경제 뉴스에 나오는 수치를 직접 조회할 수 있어요.',
  'finance',
  'https://ecos.bok.or.kr/api',
  'api_key',
  '{"param_name": "authkey", "param_in": "path"}'::jsonb,
  300,
  true,
  'https://ecos.bok.or.kr/api/#/',
  '[{"method": "GET", "path": "/StatisticSearch/{authkey}/json/kr/1/10/{statCode}", "description": "통계 항목 조회", "parameters": {"statCode": "string", "startDate": "string", "endDate": "string"}}]'::jsonb,
  ARRAY['finance', 'economy', 'korea', 'api-key'],
  'v1',
  false,
  true
);

-- ────────────────────────────────────────
-- [데이터·정보] data
-- ────────────────────────────────────────

-- 12. REST Countries
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'REST Countries',
  '250개 나라의 수도, 인구, 국기, 언어, 통화 정보. 여행 준비나 세계 퀴즈 만들기에 딱!',
  'data',
  'https://restcountries.com',
  'none',
  500,
  true,
  'https://restcountries.com/',
  '[{"method": "GET", "path": "/v3.1/all", "description": "전체 나라 목록"}, {"method": "GET", "path": "/v3.1/name/{name}", "description": "나라 이름으로 검색", "parameters": {"name": "string"}}]'::jsonb,
  ARRAY['data', 'countries', 'geography', 'free', 'no-auth'],
  'v3.1',
  true,
  false
);

-- 13. Open Library
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Open Library',
  '전 세계 도서 검색. 책 제목이나 저자로 검색하면 표지, 출판 정보를 알려줘요.',
  'data',
  'https://openlibrary.org',
  'none',
  100,
  true,
  'https://openlibrary.org/developers/api',
  '[{"method": "GET", "path": "/search.json", "description": "도서 검색", "parameters": {"q": "string", "title": "string", "author": "string"}}]'::jsonb,
  ARRAY['data', 'books', 'library', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- 14. Wikipedia
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Wikipedia',
  '위키피디아 문서 요약과 검색. 궁금한 것을 검색하면 짧은 요약문을 보여줘요. 한국어도 지원.',
  'data',
  'https://ko.wikipedia.org/api/rest_v1',
  'none',
  200,
  true,
  'https://en.wikipedia.org/api/rest_v1/',
  '[{"method": "GET", "path": "/page/summary/{title}", "description": "문서 요약 조회", "parameters": {"title": "string"}}, {"method": "GET", "path": "/page/random/summary", "description": "랜덤 문서 요약"}]'::jsonb,
  ARRAY['data', 'wikipedia', 'encyclopedia', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- 15. Random User
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Random User',
  '가짜 사용자 프로필 자동 생성. 이름, 사진, 주소, 이메일 등 테스트 데이터를 만들 때 유용해요.',
  'data',
  'https://randomuser.me',
  'none',
  500,
  true,
  'https://randomuser.me/documentation',
  '[{"method": "GET", "path": "/api/", "description": "랜덤 사용자 프로필 생성", "parameters": {"results": "number", "gender": "string", "nat": "string"}}]'::jsonb,
  ARRAY['data', 'users', 'mock', 'free', 'no-auth'],
  'v1.4',
  true,
  false
);

-- 16. JSONPlaceholder
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'JSONPlaceholder',
  '가짜 게시글, 댓글, 할일 목록, 사진 앨범 데이터. 연습용 또는 프로토타입 만들 때 유용해요.',
  'data',
  'https://jsonplaceholder.typicode.com',
  'none',
  500,
  true,
  'https://jsonplaceholder.typicode.com/guide/',
  '[{"method": "GET", "path": "/posts", "description": "게시글 목록"}, {"method": "GET", "path": "/todos", "description": "할일 목록"}, {"method": "GET", "path": "/users", "description": "사용자 목록"}]'::jsonb,
  ARRAY['data', 'mock', 'placeholder', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- ────────────────────────────────────────
-- [엔터테인먼트] entertainment
-- ────────────────────────────────────────

-- 17. PokéAPI
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'PokéAPI',
  '포켓몬 도감. 1,000마리 이상 포켓몬의 능력치, 타입, 이미지를 확인할 수 있어요.',
  'entertainment',
  'https://pokeapi.co',
  'none',
  300,
  true,
  'https://pokeapi.co/docs/v2',
  '[{"method": "GET", "path": "/api/v2/pokemon/{id_or_name}", "description": "포켓몬 상세 정보", "parameters": {"id_or_name": "string"}}, {"method": "GET", "path": "/api/v2/pokemon", "description": "포켓몬 목록", "parameters": {"limit": "number", "offset": "number"}}]'::jsonb,
  ARRAY['entertainment', 'pokemon', 'games', 'free', 'no-auth'],
  'v2',
  true,
  false
);

-- 18. JokeAPI
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'JokeAPI',
  '카테고리별 랜덤 유머. 프로그래밍 개그, 아재 개그 등 분위기 전환에 딱이에요.',
  'entertainment',
  'https://v2.jokeapi.dev',
  'none',
  120,
  true,
  'https://jokeapi.dev/',
  '[{"method": "GET", "path": "/joke/{category}", "description": "카테고리별 랜덤 유머 조회", "parameters": {"category": "string", "type": "string", "lang": "string"}}]'::jsonb,
  ARRAY['entertainment', 'jokes', 'humor', 'free', 'no-auth'],
  'v2',
  true,
  false
);

-- 19. Open Trivia DB
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Open Trivia DB',
  '4,000개 이상 퀴즈 문제. 난이도와 카테고리를 골라서 퀴즈 게임을 만들 수 있어요.',
  'entertainment',
  'https://opentdb.com',
  'none',
  50,
  true,
  'https://opentdb.com/api_config.php',
  '[{"method": "GET", "path": "/api.php", "description": "퀴즈 문제 가져오기", "parameters": {"amount": "number", "category": "number", "difficulty": "string"}}]'::jsonb,
  ARRAY['entertainment', 'trivia', 'quiz', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- 20. SpaceX API
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'SpaceX API',
  'SpaceX 로켓 발사 기록, 우주선, 승무원, 발사대 정보. 우주 덕후라면 필수!',
  'entertainment',
  'https://api.spacexdata.com',
  'none',
  300,
  true,
  'https://github.com/r-spacex/SpaceX-API',
  '[{"method": "GET", "path": "/v4/launches/latest", "description": "최근 발사 정보"}, {"method": "GET", "path": "/v4/rockets", "description": "로켓 목록"}, {"method": "GET", "path": "/v4/crew", "description": "승무원 정보"}]'::jsonb,
  ARRAY['entertainment', 'space', 'spacex', 'free', 'no-auth'],
  'v4',
  true,
  false
);

-- 21. Bored API
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Bored API',
  '"심심할 때 뭐 할까?" 랜덤 활동 추천. 혼자·함께할 수 있는 활동을 알려줘요.',
  'entertainment',
  'https://bored-api.appbrewery.com',
  'none',
  300,
  true,
  'https://bored-api.appbrewery.com/',
  '[{"method": "GET", "path": "/random", "description": "랜덤 활동 추천"}, {"method": "GET", "path": "/filter", "description": "조건별 활동 필터", "parameters": {"type": "string", "participants": "number"}}]'::jsonb,
  ARRAY['entertainment', 'activity', 'boredom', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- ────────────────────────────────────────
-- [이미지] image
-- ────────────────────────────────────────

-- 22. Lorem Picsum
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Lorem Picsum',
  '랜덤 고화질 사진 생성. URL에 크기만 넣으면 예쁜 사진이 나와요. 배경 이미지로 딱!',
  'image',
  'https://picsum.photos',
  'none',
  300,
  true,
  'https://picsum.photos/',
  '[{"method": "GET", "path": "/{width}/{height}", "description": "지정 크기 랜덤 이미지", "parameters": {"width": "number", "height": "number"}}, {"method": "GET", "path": "/v2/list", "description": "이미지 목록 조회"}]'::jsonb,
  ARRAY['image', 'placeholder', 'photos', 'free', 'no-auth'],
  'v2',
  true,
  false
);

-- 23. Dog API
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Dog API',
  '120종 강아지 사진 20,000장. 품종별로 귀여운 강아지 사진을 볼 수 있어요.',
  'image',
  'https://dog.ceo',
  'none',
  300,
  true,
  'https://dog.ceo/dog-api/',
  '[{"method": "GET", "path": "/api/breeds/image/random", "description": "랜덤 강아지 사진"}, {"method": "GET", "path": "/api/breed/{breed}/images", "description": "품종별 사진 목록", "parameters": {"breed": "string"}}]'::jsonb,
  ARRAY['image', 'dogs', 'animals', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- 24. The Cat API
INSERT INTO api_catalog (name, description, category, base_url, auth_type, auth_config, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'The Cat API',
  '랜덤 고양이 사진과 품종 정보. 집사라면 매일 다른 고양이 사진으로 힐링하세요.',
  'image',
  'https://api.thecatapi.com',
  'api_key',
  '{"param_name": "x-api-key", "param_in": "header"}'::jsonb,
  100,
  true,
  'https://docs.thecatapi.com/',
  '[{"method": "GET", "path": "/v1/images/search", "description": "랜덤 고양이 사진 검색", "parameters": {"limit": "number", "breed_ids": "string"}}]'::jsonb,
  ARRAY['image', 'cats', 'animals', 'api-key'],
  'v1',
  true,
  false
);

-- 25. NASA APOD
INSERT INTO api_catalog (name, description, category, base_url, auth_type, auth_config, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'NASA 오늘의 천문 사진',
  'NASA가 매일 선정한 우주 사진 + 해설. DEMO_KEY로 가입 없이 바로 사용 가능해요.',
  'image',
  'https://api.nasa.gov',
  'api_key',
  '{"param_name": "api_key", "param_in": "query", "default_key": "DEMO_KEY"}'::jsonb,
  30,
  true,
  'https://api.nasa.gov/',
  '[{"method": "GET", "path": "/planetary/apod", "description": "오늘의 천문 사진 조회", "parameters": {"api_key": "string", "date": "string"}}]'::jsonb,
  ARRAY['image', 'space', 'nasa', 'astronomy', 'api-key'],
  'v1',
  true,
  false
);

-- 26. Unsplash
INSERT INTO api_catalog (name, description, category, base_url, auth_type, auth_config, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Unsplash',
  '전문 사진작가들의 고퀄리티 무료 사진 검색. 풍경, 음식, 사람 등 모든 주제를 검색할 수 있어요.',
  'image',
  'https://api.unsplash.com',
  'api_key',
  '{"param_name": "Authorization", "param_in": "header", "prefix": "Client-ID "}'::jsonb,
  50,
  true,
  'https://unsplash.com/documentation',
  '[{"method": "GET", "path": "/photos/random", "description": "랜덤 사진 조회"}, {"method": "GET", "path": "/search/photos", "description": "키워드 사진 검색", "parameters": {"query": "string"}}]'::jsonb,
  ARRAY['image', 'photos', 'stock', 'api-key'],
  'v1',
  true,
  false
);

-- ────────────────────────────────────────
-- [재미·이름 분석] fun
-- ────────────────────────────────────────

-- 27. Agify.io
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Agify.io',
  '이름을 입력하면 예상 나이를 알려줘요. 친구 이름으로 테스트하면 재미있어요!',
  'fun',
  'https://api.agify.io',
  'none',
  100,
  true,
  'https://agify.io/',
  '[{"method": "GET", "path": "/", "description": "이름으로 나이 예측", "parameters": {"name": "string", "country_id": "string"}}]'::jsonb,
  ARRAY['fun', 'name', 'prediction', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- 28. Genderize.io
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Genderize.io',
  '이름을 입력하면 성별을 예측해줘요. 확률까지 함께 알려줍니다.',
  'fun',
  'https://api.genderize.io',
  'none',
  100,
  true,
  'https://genderize.io/',
  '[{"method": "GET", "path": "/", "description": "이름으로 성별 예측", "parameters": {"name": "string", "country_id": "string"}}]'::jsonb,
  ARRAY['fun', 'name', 'prediction', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- 29. Nationalize.io
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Nationalize.io',
  '이름을 입력하면 어느 나라 이름인지 알려줘요. "Jihyun"은 한국, "Yuki"는 일본!',
  'fun',
  'https://api.nationalize.io',
  'none',
  100,
  true,
  'https://nationalize.io/',
  '[{"method": "GET", "path": "/", "description": "이름으로 국적 예측", "parameters": {"name": "string"}}]'::jsonb,
  ARRAY['fun', 'name', 'prediction', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- 30. Quotable
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Quotable',
  '명언·격언 랜덤 표시. 오늘의 한마디, 동기부여 화면을 만들 때 좋아요.',
  'fun',
  'https://api.quotable.kurocode.com',
  'none',
  300,
  true,
  'https://github.com/lukePeavey/quotable',
  '[{"method": "GET", "path": "/quotes/random", "description": "랜덤 명언 조회"}, {"method": "GET", "path": "/quotes", "description": "명언 목록 (태그·저자 필터)", "parameters": {"tags": "string", "author": "string"}}]'::jsonb,
  ARRAY['fun', 'quotes', 'inspiration', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- 31. Cat Facts
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Cat Facts',
  '랜덤 고양이 상식 한 줄. "고양이는 하루 16시간을 자요" 같은 재미있는 사실을 알려줘요.',
  'fun',
  'https://catfact.ninja',
  'none',
  300,
  true,
  'https://catfact.ninja/',
  '[{"method": "GET", "path": "/fact", "description": "랜덤 고양이 상식"}, {"method": "GET", "path": "/facts", "description": "고양이 상식 목록", "parameters": {"limit": "number"}}]'::jsonb,
  ARRAY['fun', 'cats', 'facts', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- 32. Numbers API
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Numbers API',
  '숫자에 대한 재밌는 사실. "42는 생명, 우주, 모든 것의 답이다" 같은 이야기를 들려줘요.',
  'fun',
  'http://numbersapi.com',
  'none',
  300,
  true,
  'http://numbersapi.com/',
  '[{"method": "GET", "path": "/{number}", "description": "숫자에 대한 사실 조회", "parameters": {"number": "number"}}, {"method": "GET", "path": "/random/trivia", "description": "랜덤 숫자 사실"}]'::jsonb,
  ARRAY['fun', 'numbers', 'trivia', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- 33. icanhazdadjoke
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'icanhazdadjoke',
  '아재 개그 무한 생성기. 영어 유머 연습용으로도 좋아요. 매번 다른 개그가 나와요.',
  'fun',
  'https://icanhazdadjoke.com',
  'none',
  300,
  true,
  'https://icanhazdadjoke.com/api',
  '[{"method": "GET", "path": "/", "description": "랜덤 아재 개그 (Accept: application/json 헤더 필요)"}]'::jsonb,
  ARRAY['fun', 'jokes', 'dad-jokes', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- ────────────────────────────────────────
-- [유틸리티] utility
-- ────────────────────────────────────────

-- 34. QR Code Generator
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'QR Code Generator',
  '텍스트나 URL을 QR코드 이미지로 변환. 명함, 링크 공유에 유용해요.',
  'utility',
  'https://api.qrserver.com',
  'none',
  300,
  true,
  'https://goqr.me/api/',
  '[{"method": "GET", "path": "/v1/create-qr-code/", "description": "QR코드 이미지 생성", "parameters": {"data": "string", "size": "string", "color": "string"}}]'::jsonb,
  ARRAY['utility', 'qr-code', 'generator', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- 35. Open Notify
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Open Notify',
  '국제우주정거장(ISS) 실시간 위치 + 지금 우주에 있는 사람 수. 우주 덕후라면 필수!',
  'utility',
  'http://api.open-notify.org',
  'none',
  60,
  true,
  'http://open-notify.org/Open-Notify-API/',
  '[{"method": "GET", "path": "/iss-now.json", "description": "ISS 현재 위치"}, {"method": "GET", "path": "/astros.json", "description": "우주 체류 인원 목록"}]'::jsonb,
  ARRAY['utility', 'space', 'iss', 'nasa', 'free', 'no-auth'],
  'v1',
  false,
  true
);

-- 36. Sunrise-Sunset
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Sunrise-Sunset',
  '원하는 위치의 일출·일몰 시각 조회. 캠핑, 낚시, 사진 촬영 계획 세울 때 유용해요.',
  'utility',
  'https://api.sunrise-sunset.org',
  'none',
  300,
  true,
  'https://sunrise-sunset.org/api',
  '[{"method": "GET", "path": "/json", "description": "일출·일몰 시각 조회", "parameters": {"lat": "number", "lng": "number", "date": "string"}}]'::jsonb,
  ARRAY['utility', 'sunrise', 'sunset', 'astronomy', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- 37. IP-API
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'IP-API',
  '내 IP 주소로 현재 위치(나라, 도시, 좌표, 시간대)를 자동 확인. 위치 기반 서비스의 시작점.',
  'utility',
  'http://ip-api.com',
  'none',
  45,
  true,
  'https://ip-api.com/docs/',
  '[{"method": "GET", "path": "/json/{ip}", "description": "IP 주소 위치 조회", "parameters": {"ip": "string"}}]'::jsonb,
  ARRAY['utility', 'ip', 'geolocation', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- 38. BigDataCloud
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'BigDataCloud',
  'IP 주소나 좌표로 주소 역검색. 가입 없이 브라우저에서 바로 현재 위치의 주소를 알 수 있어요.',
  'utility',
  'https://api.bigdatacloud.net',
  'none',
  300,
  true,
  'https://www.bigdatacloud.com/docs/api/free-reverse-geocode-to-city-api',
  '[{"method": "GET", "path": "/data/reverse-geocode-client", "description": "좌표 → 주소 변환 (클라이언트 전용)", "parameters": {"latitude": "number", "longitude": "number"}}]'::jsonb,
  ARRAY['utility', 'geocoding', 'location', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- ────────────────────────────────────────
-- [사전·번역] dictionary
-- ────────────────────────────────────────

-- 39. Free Dictionary API
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Free Dictionary API',
  '영어 단어 뜻, 발음, 유의어, 반의어 + 발음 음성까지 제공. 영어 공부할 때 유용해요.',
  'dictionary',
  'https://api.dictionaryapi.dev',
  'none',
  300,
  true,
  'https://dictionaryapi.dev/',
  '[{"method": "GET", "path": "/api/v2/entries/en/{word}", "description": "영어 단어 검색", "parameters": {"word": "string"}}]'::jsonb,
  ARRAY['dictionary', 'english', 'definition', 'free', 'no-auth'],
  'v2',
  true,
  false
);

-- 40. LibreTranslate
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'LibreTranslate',
  '오픈소스 번역 API. 30개 이상 언어를 무료로 번역할 수 있어요. 한국어도 지원.',
  'dictionary',
  'https://libretranslate.com',
  'none',
  20,
  true,
  'https://libretranslate.com/docs/',
  '[{"method": "POST", "path": "/translate", "description": "텍스트 번역", "parameters": {"q": "string", "source": "string", "target": "string"}}, {"method": "GET", "path": "/languages", "description": "지원 언어 목록"}]'::jsonb,
  ARRAY['dictionary', 'translation', 'multilingual', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- ────────────────────────────────────────
-- [뉴스] news
-- ────────────────────────────────────────

-- 41. Hacker News API
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Hacker News API',
  'IT·스타트업 뉴스 실시간 조회. 실리콘밸리에서 가장 핫한 기술 소식을 모아볼 수 있어요.',
  'news',
  'https://hacker-news.firebaseio.com',
  'none',
  500,
  true,
  'https://github.com/HackerNews/API',
  '[{"method": "GET", "path": "/v0/topstories.json", "description": "인기 뉴스 ID 목록 (최대 500개)"}, {"method": "GET", "path": "/v0/item/{id}.json", "description": "뉴스 상세 조회", "parameters": {"id": "number"}}]'::jsonb,
  ARRAY['news', 'tech', 'hacker-news', 'free', 'no-auth'],
  'v0',
  true,
  false
);

-- 42. Spaceflight News API
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Spaceflight News API',
  '우주·항공 관련 뉴스 기사 검색. 로켓 발사, 우주 탐사 소식을 모아볼 수 있어요.',
  'news',
  'https://api.spaceflightnewsapi.net',
  'none',
  300,
  true,
  'https://api.spaceflightnewsapi.net/v4/docs/',
  '[{"method": "GET", "path": "/v4/articles/", "description": "우주 뉴스 기사 목록", "parameters": {"limit": "number", "search": "string"}}]'::jsonb,
  ARRAY['news', 'space', 'spaceflight', 'free', 'no-auth'],
  'v4',
  true,
  false
);

-- 43. NewsAPI.org
INSERT INTO api_catalog (name, description, category, base_url, auth_type, auth_config, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'NewsAPI.org',
  '전 세계 8만개 뉴스 매체 헤드라인 검색. 키워드, 나라별로 뉴스를 모아볼 수 있어요. 일 100회 무료.',
  'news',
  'https://newsapi.org',
  'api_key',
  '{"param_name": "apiKey", "param_in": "query"}'::jsonb,
  100,
  true,
  'https://newsapi.org/docs',
  '[{"method": "GET", "path": "/v2/top-headlines", "description": "국가별 헤드라인 뉴스", "parameters": {"country": "string", "category": "string"}}, {"method": "GET", "path": "/v2/everything", "description": "키워드 뉴스 검색", "parameters": {"q": "string"}}]'::jsonb,
  ARRAY['news', 'headlines', 'api-key'],
  'v2',
  false,
  true
);

-- ────────────────────────────────────────
-- [교통] transport (한국)
-- ────────────────────────────────────────

-- 44. 서울시 버스 도착정보
INSERT INTO api_catalog (name, description, category, base_url, auth_type, auth_config, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  '서울시 버스 도착정보',
  '서울 버스 실시간 도착 시간. 정류장 이름으로 검색하면 몇 분 후 버스가 오는지 알려줘요.',
  'transport',
  'http://ws.bus.go.kr/api/rest',
  'api_key',
  '{"param_name": "serviceKey", "param_in": "query"}'::jsonb,
  300,
  true,
  'https://www.data.go.kr/data/15000314/openapi.do',
  '[{"method": "GET", "path": "/arrive/getArrInfoByRouteAll", "description": "노선별 도착 정보 조회", "parameters": {"busRouteId": "string"}}]'::jsonb,
  ARRAY['transport', 'bus', 'seoul', 'korea', '공공데이터', 'api-key'],
  'v1',
  false,
  true
);

-- 45. 서울시 지하철 도착정보
INSERT INTO api_catalog (name, description, category, base_url, auth_type, auth_config, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  '서울시 지하철 실시간 도착정보',
  '서울 지하철 실시간 도착 예정 시간. 역 이름만 입력하면 다음 열차까지 남은 시간을 알려줘요.',
  'transport',
  'http://swopenAPI.seoul.go.kr/api/subway',
  'api_key',
  '{"param_name": "KEY", "param_in": "path"}'::jsonb,
  300,
  true,
  'https://data.seoul.go.kr/dataList/OA-12764/F/1/datasetView.do',
  '[{"method": "GET", "path": "/{KEY}/json/realtimeStationArrival/0/5/{stationName}", "description": "역별 실시간 도착 정보", "parameters": {"stationName": "string"}}]'::jsonb,
  ARRAY['transport', 'subway', 'metro', 'seoul', 'korea', 'api-key'],
  'v1',
  false,
  true
);

-- 46. TAGO 전국 대중교통
INSERT INTO api_catalog (name, description, category, base_url, auth_type, auth_config, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'TAGO 전국 대중교통',
  '전국 버스 노선, 정류장, 도착 정보. 서울 외 지방 도시의 버스 정보도 조회할 수 있어요.',
  'transport',
  'http://apis.data.go.kr/1613000',
  'api_key',
  '{"param_name": "serviceKey", "param_in": "query"}'::jsonb,
  300,
  true,
  'https://www.data.go.kr/data/15098529/openapi.do',
  '[{"method": "GET", "path": "/BusSttnInfoInqireService/getSttnNoList", "description": "정류장 검색", "parameters": {"sttnNm": "string"}}]'::jsonb,
  ARRAY['transport', 'bus', 'nationwide', 'korea', '공공데이터', 'api-key'],
  'v1',
  false,
  true
);

-- 47. ODsay 대중교통
INSERT INTO api_catalog (name, description, category, base_url, auth_type, auth_config, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'ODsay 대중교통 길찾기',
  '전국 대중교통 길찾기. 출발지·도착지를 입력하면 버스·지하철 환승 경로를 알려줘요.',
  'transport',
  'https://api.odsay.com/v1/api',
  'api_key',
  '{"param_name": "apiKey", "param_in": "query"}'::jsonb,
  300,
  true,
  'https://lab.odsay.com/',
  '[{"method": "GET", "path": "/searchPubTransPathT", "description": "대중교통 길찾기", "parameters": {"SX": "number", "SY": "number", "EX": "number", "EY": "number"}}]'::jsonb,
  ARRAY['transport', 'transit', 'route', 'korea', 'api-key'],
  'v1',
  false,
  true
);

-- ────────────────────────────────────────
-- [부동산] realestate (한국)
-- ────────────────────────────────────────

-- 48. 아파트 실거래가
INSERT INTO api_catalog (name, description, category, base_url, auth_type, auth_config, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  '아파트 실거래가 (국토교통부)',
  '국토교통부 공식 아파트 매매 가격. 우리 동네 아파트가 얼마에 거래됐는지 확인할 수 있어요.',
  'realestate',
  'http://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev',
  'api_key',
  '{"param_name": "serviceKey", "param_in": "query"}'::jsonb,
  300,
  true,
  'https://www.data.go.kr/data/15126469/openapi.do',
  '[{"method": "GET", "path": "/getRTMSDataSvcAptTradeDev", "description": "아파트 매매 실거래가 조회", "parameters": {"LAWD_CD": "string", "DEAL_YMD": "string"}}]'::jsonb,
  ARRAY['realestate', 'apartment', 'price', 'korea', '공공데이터', 'api-key'],
  'v1',
  false,
  true
);

-- ────────────────────────────────────────
-- [관광] tourism (한국)
-- ────────────────────────────────────────

-- 49. 한국관광공사 TourAPI
INSERT INTO api_catalog (name, description, category, base_url, auth_type, auth_config, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  '한국관광공사 TourAPI',
  '전국 관광지, 맛집, 숙박, 축제 정보. 여행 계획 세울 때 지역별 볼거리·먹거리를 찾아보세요.',
  'tourism',
  'http://apis.data.go.kr/B551011/KorService1',
  'api_key',
  '{"param_name": "serviceKey", "param_in": "query"}'::jsonb,
  300,
  true,
  'https://api.visitkorea.or.kr/',
  '[{"method": "GET", "path": "/areaBasedList1", "description": "지역 기반 관광지 목록", "parameters": {"areaCode": "string", "contentTypeId": "string"}}, {"method": "GET", "path": "/searchKeyword1", "description": "키워드 검색", "parameters": {"keyword": "string"}}]'::jsonb,
  ARRAY['tourism', 'travel', 'korea', '공공데이터', 'api-key'],
  'v1',
  false,
  true
);

-- ────────────────────────────────────────
-- [생활] lifestyle (한국)
-- ────────────────────────────────────────

-- 50. 공휴일 API
INSERT INTO api_catalog (name, description, category, base_url, auth_type, auth_config, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  '공휴일 정보 (한국천문연구원)',
  '대한민국 공휴일, 기념일, 24절기 정보. 달력 앱이나 D-day 계산기 만들 때 필수!',
  'lifestyle',
  'http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService',
  'api_key',
  '{"param_name": "serviceKey", "param_in": "query"}'::jsonb,
  300,
  true,
  'https://www.data.go.kr/data/15012690/openapi.do',
  '[{"method": "GET", "path": "/getRestDeInfo", "description": "공휴일 조회", "parameters": {"solYear": "string", "solMonth": "string"}}]'::jsonb,
  ARRAY['lifestyle', 'holiday', 'calendar', 'korea', '공공데이터', 'api-key'],
  'v1',
  false,
  true
);

-- 51. 서울 열린데이터
INSERT INTO api_catalog (name, description, category, base_url, auth_type, auth_config, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  '서울 열린데이터광장',
  '서울시 인구, 주차장, 문화행사, 와이파이 핫스팟 등 5,000개 데이터셋. 서울 생활에 유용한 정보 가득.',
  'lifestyle',
  'http://openapi.seoul.go.kr:8088',
  'api_key',
  '{"param_name": "KEY", "param_in": "path"}'::jsonb,
  300,
  true,
  'https://data.seoul.go.kr/',
  '[{"method": "GET", "path": "/{KEY}/json/{serviceName}/1/5/", "description": "서울시 공공데이터 조회", "parameters": {"serviceName": "string"}}]'::jsonb,
  ARRAY['lifestyle', 'seoul', 'opendata', 'korea', 'api-key'],
  'v1',
  false,
  true
);

-- 52. 국립중앙도서관
INSERT INTO api_catalog (name, description, category, base_url, auth_type, auth_config, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  '국립중앙도서관 도서 검색',
  '국내 도서 검색. 도서관 소장 여부, 서지 정보를 확인할 수 있어요. 책 읽기 좋아하는 분께 추천.',
  'lifestyle',
  'https://www.nl.go.kr/NL/search/openApi',
  'api_key',
  '{"param_name": "key", "param_in": "query"}'::jsonb,
  300,
  true,
  'https://www.nl.go.kr/NL/contents/N31101030700.do',
  '[{"method": "GET", "path": "/sas498", "description": "도서 검색", "parameters": {"kwd": "string"}}]'::jsonb,
  ARRAY['lifestyle', 'books', 'library', 'korea', 'api-key'],
  'v1',
  false,
  true
);

-- ────────────────────────────────────────
-- [지도·위치] location (한국)
-- ────────────────────────────────────────

-- 53. 카카오 로컬
INSERT INTO api_catalog (name, description, category, base_url, auth_type, auth_config, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  '카카오 로컬 (지도·장소 검색)',
  '한국 주소 검색, 좌표 변환, 장소 검색. "강남역 맛집" 같은 키워드로 주변 장소를 찾을 수 있어요.',
  'location',
  'https://dapi.kakao.com',
  'api_key',
  '{"param_name": "Authorization", "param_in": "header", "prefix": "KakaoAK "}'::jsonb,
  300,
  true,
  'https://developers.kakao.com/docs/latest/ko/local/dev-guide',
  '[{"method": "GET", "path": "/v2/local/search/keyword.json", "description": "키워드 장소 검색", "parameters": {"query": "string"}}, {"method": "GET", "path": "/v2/local/search/address.json", "description": "주소 검색", "parameters": {"query": "string"}}]'::jsonb,
  ARRAY['location', 'map', 'kakao', 'korea', 'api-key'],
  'v2',
  true,
  false
);

-- 54. 네이버 지도
INSERT INTO api_catalog (name, description, category, base_url, auth_type, auth_config, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  '네이버 지도 (Geocoding)',
  '한국 지도 표시, 주소↔좌표 변환, 길찾기. 월 6만 건 무료. 한국 주소 체계에 최적화되어 있어요.',
  'location',
  'https://naveropenapi.apigw.ntruss.com',
  'api_key',
  '{"param_name": "X-NCP-APIGW-API-KEY-ID", "param_in": "header"}'::jsonb,
  300,
  true,
  'https://api.ncloud-docs.com/docs/ai-naver-mapsgeocoding',
  '[{"method": "GET", "path": "/map-geocode/v2/geocode", "description": "주소 → 좌표 변환", "parameters": {"query": "string"}}, {"method": "GET", "path": "/map-reversegeocode/v2/gc", "description": "좌표 → 주소 변환", "parameters": {"coords": "string"}}]'::jsonb,
  ARRAY['location', 'map', 'naver', 'korea', 'api-key'],
  'v2',
  false,
  true
);

-- ────────────────────────────────────────
-- [과학] science
-- ────────────────────────────────────────

-- 55. Sunrise-Sunset (이미 36번에 포함 → 이 번호는 skip)
-- 총 55개 = 기존 15 + 신규 40 (번호 정리: 1~54)
