# 데이터베이스 설계 (Database Design)

## 사용 DB: Supabase (PostgreSQL)
- 무료 티어: 500MB 저장소, 2GB 대역폭, 50K MAU

---

## ERD (Entity Relationship Diagram)

```
┌─────────────┐       ┌──────────────────┐       ┌─────────────────┐
│   users     │       │  organizations   │       │  memberships    │
├─────────────┤       ├──────────────────┤       ├─────────────────┤
│ id (PK)     │──┐    │ id (PK)          │──┐    │ id (PK)         │
│ email       │  │    │ name             │  │    │ user_id (FK)    │
│ name        │  │    │ slug             │  │    │ organization_id │
│ avatar_url  │  │    │ plan             │  │    │ role            │
│ preferences │  │    │ settings         │  │    │ created_at      │
│ created_at  │  │    │ created_at       │  │    └─────────────────┘
│ updated_at  │  │    │ updated_at       │  │
└─────────────┘  │    └──────────────────┘  │
                 │                          │
┌────────────────▼──────────────────────────▼────┐
│   projects                                     │
├────────────────────────────────────────────────┤
│ id (PK)                                        │
│ user_id (FK → users)                           │
│ organization_id (FK → organizations, nullable) │
│ name, context, status                          │
│ deploy_url, deploy_platform, repo_url          │
│ preview_url, metadata, current_version         │
│ created_at, updated_at                         │
└──────────┬─────────────────────────────────────┘
           │
    ┌──────┴──────┐     ┌───────────────────┐
    │ project_apis│     │   api_catalog     │
    ├─────────────┤     ├───────────────────┤
    │ id (PK)     │     │ id (PK)           │
    │ project_id  │────>│ name, description │
    │ api_id (FK) │     │ category, base_url│
    │ config      │     │ auth_type/config  │
    │ created_at  │     │ rate_limit, tags  │
    └─────────────┘     │ api_version       │
                        │ cors_supported    │
                        │ requires_proxy    │
                        │ deprecated_at     │
                        │ successor_id      │
                        │ changelog         │
                        │ credit_required   │
                        │ icon_url, docs_url│
                        │ endpoints         │
                        │ is_active         │
                        └───────────────────┘

┌──────────────────┐  ┌──────────────────┐
│ generated_codes  │  │ user_api_keys    │
├──────────────────┤  ├──────────────────┤
│ id (PK)          │  │ id (PK)          │
│ project_id (FK)  │  │ user_id (FK)     │
│ version          │  │ api_id (FK)      │
│ code_html/css/js │  │ encrypted_key    │
│ framework        │  │ created_at       │
│ ai_provider      │  │ updated_at       │
│ ai_model         │  └──────────────────┘
│ ai_prompt_used   │
│ generation_time  │  ┌──────────────────┐
│ token_usage      │  │ event_log        │
│ dependencies     │  ├──────────────────┤
│ metadata         │  │ id (PK)          │
│ created_at       │  │ event_type       │
└──────────────────┘  │ payload          │
                      │ user_id (FK)     │
┌──────────────────┐  │ project_id (FK)  │
│ feature_flags    │  │ created_at       │
├──────────────────┤  └──────────────────┘
│ id (PK)          │
│ flag_name        │
│ enabled          │
│ description      │
│ rules            │
│ updated_at       │
└──────────────────┘
```

---

## 테이블 정의

### 1. users (사용자)
```sql
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  avatar_url TEXT,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
- Supabase Auth와 연동, 소셜 로그인 지원
- `preferences`: 언어, 테마 등 사용자 설정 (JSONB)
- 첫 로그인 시 `auth.uid()`를 ID로 사용하여 자동 생성

### 2. organizations (조직)
```sql
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  plan VARCHAR(50) NOT NULL DEFAULT 'free',
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
- 멀티 테넌시 지원을 위한 조직 단위
- `plan`: free, pro 등 요금제 구분
- `settings`: 조직별 설정 (JSONB)

### 3. memberships (조직-사용자 매핑)
```sql
CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, organization_id)
);
```
- `role`: owner, admin, member, viewer 중 하나

### 4. api_catalog (API 카탈로그)
```sql
CREATE TABLE IF NOT EXISTS api_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  base_url TEXT NOT NULL,
  auth_type VARCHAR(50) NOT NULL DEFAULT 'none',
  auth_config JSONB DEFAULT '{}'::jsonb,
  rate_limit VARCHAR(100),
  changelog JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  icon_url TEXT,
  docs_url TEXT,
  endpoints JSONB DEFAULT '[]'::jsonb,
  tags TEXT[],
  api_version VARCHAR(50),
  deprecated_at TIMESTAMPTZ,
  successor_id UUID REFERENCES api_catalog(id) ON DELETE SET NULL,
  cors_supported BOOLEAN NOT NULL DEFAULT true,
  requires_proxy BOOLEAN NOT NULL DEFAULT false,
  credit_required INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
- `changelog`: API 변경 이력 (JSONB 배열)
- `api_version`: API 버전 관리
- `deprecated_at`: 폐기 예정일, `successor_id`: 대체 API 참조
- `cors_supported`: CORS 지원 여부
- `requires_proxy`: 프록시 필요 여부
- `credit_required`: 출처 표기 필요 여부

#### endpoints JSONB 구조 예시
```json
[
    {
        "path": "/weather",
        "method": "GET",
        "description": "현재 날씨 조회",
        "params": [
            {"name": "q", "type": "string", "required": true, "description": "도시명"},
            {"name": "units", "type": "string", "required": false, "description": "단위 (metric/imperial)"}
        ],
        "response_example": {"temp": 20, "description": "맑음"}
    }
]
```

### 5. projects (프로젝트 / 생성된 서비스)
```sql
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  context TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  deploy_url TEXT,
  deploy_platform VARCHAR(100),
  repo_url TEXT,
  preview_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  current_version INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
- `status`: draft → generating → generated → deploying → deployed → failed
- `organization_id`: 조직 프로젝트 지원 (nullable)
- `metadata`: 프로젝트 추가 정보 (JSONB)
- `current_version`: 현재 활성 버전 (롤백 지원)

### 6. project_apis (프로젝트-API 매핑)
```sql
CREATE TABLE IF NOT EXISTS project_apis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  api_id UUID NOT NULL REFERENCES api_catalog(id) ON DELETE CASCADE,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, api_id)
);
```

### 7. generated_codes (생성된 코드)
```sql
CREATE TABLE IF NOT EXISTS generated_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INT NOT NULL,
  code_html TEXT,
  code_css TEXT,
  code_js TEXT,
  framework VARCHAR(50) NOT NULL DEFAULT 'vanilla',
  ai_provider VARCHAR(100),
  ai_model VARCHAR(100),
  ai_prompt_used TEXT,
  generation_time_ms INT,
  token_usage JSONB DEFAULT '{}'::jsonb,
  dependencies TEXT[],
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, version)
);
```
- `ai_provider`, `ai_model`: 사용된 AI 정보 추적
- `generation_time_ms`: 생성 소요 시간 (밀리초)
- `token_usage`: 토큰 사용량 (JSONB)
- `dependencies`: 외부 라이브러리 의존성

### 8. user_api_keys (사용자 API 키)
```sql
CREATE TABLE IF NOT EXISTS user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  api_id UUID NOT NULL REFERENCES api_catalog(id) ON DELETE CASCADE,
  encrypted_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, api_id)
);
```
- 사용자가 직접 발급받은 API 키를 암호화 저장

### 9. event_log (이벤트 로그)
```sql
CREATE TABLE IF NOT EXISTS event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
- 도메인 이벤트 감사 로그
- `event_type`: CODE_GENERATED, DEPLOYMENT_COMPLETED 등 9종

### 10. feature_flags (피처 플래그)
```sql
CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_name VARCHAR(100) NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  rules JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
- 7개 기본 플래그: enable_dark_mode, enable_code_viewer, enable_ollama_fallback, enable_template_system, enable_multi_language, enable_team_features, enable_advanced_prompt
- `rules`: 조건부 활성화 규칙 (JSONB)

---

## 인덱스

```sql
-- users
CREATE INDEX idx_users_email ON users(email);

-- organizations
CREATE INDEX idx_organizations_slug ON organizations(slug);

-- memberships
CREATE INDEX idx_memberships_user_id ON memberships(user_id);
CREATE INDEX idx_memberships_organization_id ON memberships(organization_id);

-- api_catalog
CREATE INDEX idx_api_catalog_category ON api_catalog(category);
CREATE INDEX idx_api_catalog_is_active ON api_catalog(is_active);
CREATE INDEX idx_api_catalog_tags ON api_catalog USING GIN(tags);
CREATE INDEX idx_api_catalog_auth_type ON api_catalog(auth_type);
CREATE INDEX idx_api_catalog_successor_id ON api_catalog(successor_id);

-- projects
CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_organization_id ON projects(organization_id);
CREATE INDEX idx_projects_status ON projects(status);

-- project_apis
CREATE INDEX idx_project_apis_project_id ON project_apis(project_id);
CREATE INDEX idx_project_apis_api_id ON project_apis(api_id);

-- generated_codes
CREATE INDEX idx_generated_codes_project_id ON generated_codes(project_id);
CREATE INDEX idx_generated_codes_version ON generated_codes(project_id, version);

-- user_api_keys
CREATE INDEX idx_user_api_keys_user_id ON user_api_keys(user_id);
CREATE INDEX idx_user_api_keys_api_id ON user_api_keys(api_id);

-- event_log
CREATE INDEX idx_event_log_event_type ON event_log(event_type);
CREATE INDEX idx_event_log_user_id ON event_log(user_id);
CREATE INDEX idx_event_log_project_id ON event_log(project_id);
CREATE INDEX idx_event_log_created_at ON event_log(created_at);
CREATE INDEX idx_event_log_payload ON event_log USING GIN(payload);

-- feature_flags
CREATE INDEX idx_feature_flags_flag_name ON feature_flags(flag_name);
CREATE INDEX idx_feature_flags_enabled ON feature_flags(enabled);
```

---

## RLS (Row Level Security) 정책

전체 10개 테이블에 RLS 활성화, 테이블별 정책:

```sql
-- users: 자신의 프로필만 조회/수정/생성
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own profile" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert their own profile" ON users FOR INSERT WITH CHECK (auth.uid() = id);

-- organizations: 멤버만 조회, admin/owner만 수정, 인증 사용자 생성 가능
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- memberships: 자신의 멤버십 조회, 같은 조직 멤버 조회, admin/owner 관리
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

-- api_catalog: 활성 API는 누구나 조회, service_role만 관리
ALTER TABLE api_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active APIs" ON api_catalog FOR SELECT USING (is_active = true);

-- projects: 자신의 프로젝트 CRUD + 조직 프로젝트 조회
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- project_apis: 자신의 프로젝트에 속한 매핑만 접근
ALTER TABLE project_apis ENABLE ROW LEVEL SECURITY;

-- generated_codes: 자신의 프로젝트 코드만 조회/생성
ALTER TABLE generated_codes ENABLE ROW LEVEL SECURITY;

-- user_api_keys: 자신의 API 키만 접근
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

-- event_log: 자신의 이벤트 조회/생성, service_role 전체 관리
ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;

-- feature_flags: 누구나 조회, service_role만 관리
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
```

---

## 트리거

```sql
-- updated_at 자동 갱신 (users, organizations, api_catalog, projects, user_api_keys, feature_flags)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```
