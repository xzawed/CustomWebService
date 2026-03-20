-- seed.sql
-- CustomWebService seed data

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

-- 1. Weather: Open-Meteo
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Open-Meteo',
  'Free weather forecast API with hourly and daily data. No API key required.',
  'weather',
  'https://api.open-meteo.com',
  'none',
  600,
  true,
  'https://open-meteo.com/en/docs',
  '[{"method": "GET", "path": "/v1/forecast", "description": "Get weather forecast by coordinates", "parameters": {"latitude": "number", "longitude": "number", "hourly": "string", "daily": "string"}}]'::jsonb,
  ARRAY['weather', 'forecast', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- 2. Weather: OpenWeatherMap
INSERT INTO api_catalog (name, description, category, base_url, auth_type, auth_config, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy, credit_required) VALUES
(
  'OpenWeatherMap',
  'Weather data API including current weather, forecasts, and historical data. Requires free API key.',
  'weather',
  'https://api.openweathermap.org',
  'api_key',
  '{"param_name": "appid", "param_in": "query"}'::jsonb,
  60,
  true,
  'https://openweathermap.org/api',
  '[{"method": "GET", "path": "/data/2.5/weather", "description": "Get current weather by city or coordinates", "parameters": {"q": "string", "lat": "number", "lon": "number", "units": "string"}}]'::jsonb,
  ARRAY['weather', 'forecast', 'api-key'],
  'v2.5',
  true,
  false,
  0
);

-- 3. Finance: Frankfurter
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Frankfurter',
  'Free currency exchange rate API powered by European Central Bank data.',
  'finance',
  'https://api.frankfurter.app',
  'none',
  300,
  true,
  'https://www.frankfurter.app/docs/',
  '[{"method": "GET", "path": "/latest", "description": "Get latest exchange rates", "parameters": {"from": "string", "to": "string"}}, {"method": "GET", "path": "/{date}", "description": "Get historical rates for a specific date", "parameters": {"date": "string"}}]'::jsonb,
  ARRAY['finance', 'currency', 'exchange-rate', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- 4. Finance: CoinGecko
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'CoinGecko',
  'Comprehensive cryptocurrency data API. Free tier available with rate limits.',
  'finance',
  'https://api.coingecko.com',
  'none',
  30,
  true,
  'https://docs.coingecko.com/reference/introduction',
  '[{"method": "GET", "path": "/api/v3/simple/price", "description": "Get price of coins in target currencies", "parameters": {"ids": "string", "vs_currencies": "string"}}, {"method": "GET", "path": "/api/v3/coins/list", "description": "List all supported coins with id, name, and symbol"}]'::jsonb,
  ARRAY['finance', 'crypto', 'cryptocurrency', 'free'],
  'v3',
  true,
  false
);

-- 5. Data: REST Countries
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'REST Countries',
  'Get information about countries via a RESTful API. No authentication required.',
  'data',
  'https://restcountries.com',
  'none',
  500,
  true,
  'https://restcountries.com/',
  '[{"method": "GET", "path": "/v3.1/all", "description": "Get all countries"}, {"method": "GET", "path": "/v3.1/name/{name}", "description": "Search countries by name", "parameters": {"name": "string"}}, {"method": "GET", "path": "/v3.1/alpha/{code}", "description": "Get country by ISO code", "parameters": {"code": "string"}}]'::jsonb,
  ARRAY['data', 'countries', 'geography', 'free', 'no-auth'],
  'v3.1',
  true,
  false
);

-- 6. Data: Open Library
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Open Library',
  'Open Library provides free access to book data. Search by title, author, ISBN, and more.',
  'data',
  'https://openlibrary.org',
  'none',
  100,
  true,
  'https://openlibrary.org/developers/api',
  '[{"method": "GET", "path": "/search.json", "description": "Search for books", "parameters": {"q": "string", "title": "string", "author": "string"}}, {"method": "GET", "path": "/api/books", "description": "Get book data by identifier", "parameters": {"bibkeys": "string", "format": "string"}}]'::jsonb,
  ARRAY['data', 'books', 'library', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- 7. Entertainment: PokeAPI
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'PokeAPI',
  'RESTful API for Pokemon data. All the Pokemon data you will ever need in one place.',
  'entertainment',
  'https://pokeapi.co',
  'none',
  300,
  true,
  'https://pokeapi.co/docs/v2',
  '[{"method": "GET", "path": "/api/v2/pokemon/{id_or_name}", "description": "Get Pokemon by ID or name", "parameters": {"id_or_name": "string"}}, {"method": "GET", "path": "/api/v2/pokemon", "description": "List Pokemon with pagination", "parameters": {"limit": "number", "offset": "number"}}]'::jsonb,
  ARRAY['entertainment', 'pokemon', 'games', 'free', 'no-auth'],
  'v2',
  true,
  false
);

-- 8. Entertainment: JokeAPI
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'JokeAPI',
  'A REST API that serves uniformly and well-formatted jokes. Supports filtering by category and type.',
  'entertainment',
  'https://v2.jokeapi.dev',
  'none',
  120,
  true,
  'https://jokeapi.dev/',
  '[{"method": "GET", "path": "/joke/{category}", "description": "Get a random joke by category (Any, Programming, Misc, Dark, Pun, Spooky, Christmas)", "parameters": {"category": "string", "type": "string", "lang": "string"}}]'::jsonb,
  ARRAY['entertainment', 'jokes', 'humor', 'free', 'no-auth'],
  'v2',
  true,
  false
);

-- 9. Entertainment: Open Trivia DB
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Open Trivia DB',
  'Free trivia questions database. Get random trivia questions by category, difficulty, and type.',
  'entertainment',
  'https://opentdb.com',
  'none',
  50,
  true,
  'https://opentdb.com/api_config.php',
  '[{"method": "GET", "path": "/api.php", "description": "Get trivia questions", "parameters": {"amount": "number", "category": "number", "difficulty": "string", "type": "string"}}]'::jsonb,
  ARRAY['entertainment', 'trivia', 'quiz', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- 10. Image: Lorem Picsum
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Lorem Picsum',
  'The Lorem Ipsum for photos. Easy to use, stylish placeholders with various options.',
  'image',
  'https://picsum.photos',
  'none',
  300,
  true,
  'https://picsum.photos/',
  '[{"method": "GET", "path": "/{width}/{height}", "description": "Get a random image with specific dimensions", "parameters": {"width": "number", "height": "number"}}, {"method": "GET", "path": "/v2/list", "description": "List available images with pagination", "parameters": {"page": "number", "limit": "number"}}]'::jsonb,
  ARRAY['image', 'placeholder', 'photos', 'free', 'no-auth'],
  'v2',
  true,
  false
);

-- 11. Image: Dog API
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Dog API',
  'Free API for random dog images. Browse by breed with sub-breed support.',
  'image',
  'https://dog.ceo',
  'none',
  300,
  true,
  'https://dog.ceo/dog-api/',
  '[{"method": "GET", "path": "/api/breeds/image/random", "description": "Get a single random dog image"}, {"method": "GET", "path": "/api/breed/{breed}/images", "description": "Get all images for a breed", "parameters": {"breed": "string"}}]'::jsonb,
  ARRAY['image', 'dogs', 'animals', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- 12. Utility: QR Code (goqr.me)
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'QR Code Generator (goqr.me)',
  'Free QR code generation API. Create QR codes with customizable size, color, and format.',
  'utility',
  'https://api.qrserver.com',
  'none',
  300,
  true,
  'https://goqr.me/api/',
  '[{"method": "GET", "path": "/v1/create-qr-code/", "description": "Generate a QR code image", "parameters": {"data": "string", "size": "string", "color": "string", "bgcolor": "string", "format": "string"}}]'::jsonb,
  ARRAY['utility', 'qr-code', 'generator', 'free', 'no-auth'],
  'v1',
  true,
  false
);

-- 13. Utility: Open Notify
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Open Notify',
  'Open source project to provide a simple API for some of NASA''s data. ISS location and astronauts in space.',
  'utility',
  'http://api.open-notify.org',
  'none',
  60,
  true,
  'http://open-notify.org/Open-Notify-API/',
  '[{"method": "GET", "path": "/iss-now.json", "description": "Get the current location of the International Space Station"}, {"method": "GET", "path": "/astros.json", "description": "Get the number and names of people currently in space"}]'::jsonb,
  ARRAY['utility', 'space', 'iss', 'nasa', 'free', 'no-auth'],
  'v1',
  false,
  true
);

-- 14. Social: Hacker News
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Hacker News API',
  'Official Hacker News API powered by Firebase. Access stories, comments, polls, and user data.',
  'social',
  'https://hacker-news.firebaseio.com',
  'none',
  500,
  true,
  'https://github.com/HackerNews/API',
  '[{"method": "GET", "path": "/v0/topstories.json", "description": "Get up to 500 top story IDs"}, {"method": "GET", "path": "/v0/item/{id}.json", "description": "Get item (story, comment, poll) by ID", "parameters": {"id": "number"}}, {"method": "GET", "path": "/v0/newstories.json", "description": "Get up to 500 new story IDs"}]'::jsonb,
  ARRAY['social', 'news', 'tech', 'hacker-news', 'free', 'no-auth'],
  'v0',
  true,
  false
);

-- 15. News: Spaceflight News
INSERT INTO api_catalog (name, description, category, base_url, auth_type, rate_limit, is_active, docs_url, endpoints, tags, api_version, cors_supported, requires_proxy) VALUES
(
  'Spaceflight News API',
  'Free API providing spaceflight-related news articles, blogs, and reports from various sources.',
  'news',
  'https://api.spaceflightnewsapi.net',
  'none',
  300,
  true,
  'https://api.spaceflightnewsapi.net/v4/docs/',
  '[{"method": "GET", "path": "/v4/articles/", "description": "Get spaceflight news articles with pagination and filtering", "parameters": {"limit": "number", "offset": "number", "search": "string"}}, {"method": "GET", "path": "/v4/articles/{id}/", "description": "Get a single article by ID", "parameters": {"id": "number"}}]'::jsonb,
  ARRAY['news', 'space', 'spaceflight', 'free', 'no-auth'],
  'v4',
  true,
  false
);
