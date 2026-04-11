# 데이터베이스 설계 v2 (Database Design - Extensible)

> v1 대비 변경사항: 멀티 테넌시, 메타데이터, API 버전 관리, 이벤트 로그, 피처 플래그 테이블 추가

## 사용 DB: Supabase (PostgreSQL)

---

## 1. ERD (확장 설계)

```
┌──────────────┐
│organizations │     ┌──────────────┐
├──────────────┤     │ memberships  │     ┌─────────────┐
│ id (PK)      │◄────┤──────────────│     │   users     │
│ name         │     │ id (PK)      │     ├─────────────┤
│ slug         │     │ org_id (FK)  │────►│ id (PK)     │
│ plan         │     │ user_id (FK) │     │ email       │
│ settings     │     │ role         │     │ name        │
│ created_at   │     │ created_at   │     │ avatar_url  │
└──────┬───────┘     └──────────────┘     │ preferences │
       │                                   │ created_at  │
       │ (선택적)                           │ updated_at  │
       │                                   └──────┬──────┘
       │                                          │
       ▼                                          ▼
┌──────────────────┐                    ┌────────────────────┐
│    projects      │                    │   user_api_keys    │
├──────────────────┤                    ├────────────────────┤
│ id (PK)          │                    │ id (PK)            │
│ user_id (FK)     │◄───────────────────│ user_id (FK)       │
│ org_id (FK) NULL │                    │ api_id (FK)        │
│ name             │                    │ encrypted_key      │
│ context          │                    │ created_at         │
│ status           │                    └────────────────────┘
│ deploy_url       │
│ deploy_platform  │     ┌──────────────────┐
│ repo_url         │     │  project_apis    │
│ preview_url      │     ├──────────────────┤
│ metadata (JSONB) │◄────│ id (PK)          │
│ created_at       │     │ project_id (FK)  │────┐
│ updated_at       │     │ api_id (FK)      │    │
└────────┬─────────┘     │ config (JSONB)   │    │
         │               │ created_at       │    │
         │               └──────────────────┘    │
         ▼                                       ▼
┌──────────────────┐                    ┌────────────────────┐
│ generated_codes  │                    │   api_catalog      │
├──────────────────┤                    ├────────────────────┤
│ id (PK)          │                    │ id (PK)            │
│ project_id (FK)  │                    │ name               │
│ version          │                    │ description        │
│ code_html        │                    │ category           │
│ code_css         │                    │ base_url           │
│ code_js          │                    │ auth_type          │
│ framework        │                    │ auth_config (JSON) │
│ ai_provider      │ ★                 │ rate_limit         │
│ ai_model         │ ★                 │ is_active          │
│ ai_prompt_used   │                    │ api_version        │ ★
│ generation_ms    │ ★                 │ deprecated_at      │ ★
│ token_usage(JSON)│ ★                 │ successor_id (FK)  │ ★
│ metadata (JSONB) │ ★                 │ icon_url           │
│ dependencies[]   │ ★                 │ docs_url           │
│ created_at       │                    │ endpoints (JSONB)  │
└──────────────────┘                    │ tags[]             │
                                        │ changelog (JSONB)  │ ★
┌──────────────────┐                    │ created_at         │
│  event_log       │ ★                 │ updated_at         │
├──────────────────┤                    └────────────────────┘
│ id (PK)          │
│ event_type       │                    ┌────────────────────┐
│ payload (JSONB)  │                    │  feature_flags     │ ★
│ user_id (FK)     │                    ├────────────────────┤
│ project_id (FK)  │                    │ id (PK)            │
│ created_at       │                    │ flag_name          │
└──────────────────┘                    │ enabled            │
                                        │ rules (JSONB)      │
                                        │ updated_at         │
                                        └────────────────────┘
★ = v2에서 추가된 항목
```

---

## 2. 테이블 정의

### 2.1 users (사용자) - 수정
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100),
    avatar_url TEXT,
    preferences JSONB DEFAULT '{}',        -- ★ 사용자 설정 (언어, 테마 등)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

> **중요**: `users.id`는 Supabase Auth의 `auth.uid()`와 동일해야 합니다.
> OAuth 콜백(`callback/route.ts`)에서 `UserRepository.createWithAuthId(authId, ...)`를 통해
> `auth.uid()`를 `id`로 명시 지정하여 생성합니다. 이는 `projects.user_id → users.id` FK 참조와
> RLS 정책(`auth.uid() = id`)의 정합성을 보장합니다.

**preferences 구조:**
```json
{
  "language": "ko",
  "theme": "light",
  "defaultDeployPlatform": "railway",
  "emailNotifications": true
}
```

### 2.2 organizations (조직) - ★ 신규
```sql
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan VARCHAR(20) DEFAULT 'free',          -- free, pro, enterprise
    settings JSONB DEFAULT '{}',              -- 조직별 설정
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug ON organizations(slug);
```

**settings 구조:**
```json
{
  "maxProjects": 50,
  "maxMembersCount": 5,
  "allowedDeployPlatforms": ["railway", "github_pages"],
  "defaultAiProvider": "grok"
}
```

### 2.3 memberships (조직 멤버십) - ★ 신규
```sql
CREATE TABLE memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member',        -- owner, admin, member, viewer
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, organization_id)
);

CREATE INDEX idx_memberships_user ON memberships(user_id);
CREATE INDEX idx_memberships_org ON memberships(organization_id);
```

### 2.4 api_catalog (API 카탈로그) - 수정
```sql
CREATE TABLE api_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,
    base_url VARCHAR(500) NOT NULL,
    auth_type VARCHAR(20) NOT NULL DEFAULT 'none',
    auth_config JSONB DEFAULT '{}',
    rate_limit VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    icon_url VARCHAR(500),
    docs_url VARCHAR(500),
    endpoints JSONB NOT NULL DEFAULT '[]',
    tags TEXT[] DEFAULT '{}',
    -- ★ 확장성 컬럼
    api_version VARCHAR(20),                  -- API 버전
    deprecated_at TIMESTAMPTZ,                -- 폐기 일시
    successor_id UUID REFERENCES api_catalog(id),  -- 후속 API
    changelog JSONB DEFAULT '[]',             -- 변경 이력
    cors_supported BOOLEAN DEFAULT true,      -- CORS 지원 여부
    requires_proxy BOOLEAN DEFAULT false,     -- 프록시 필요 여부
    credit_required TEXT,                     -- 필수 크레딧 표시 문구
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_catalog_category ON api_catalog(category);
CREATE INDEX idx_api_catalog_active ON api_catalog(is_active);
CREATE INDEX idx_api_catalog_deprecated ON api_catalog(deprecated_at);
```

### 2.5 projects (프로젝트) - 수정
```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id),  -- ★ 조직 소속 (선택)
    name VARCHAR(200) NOT NULL,
    context TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'draft',
    deploy_url VARCHAR(500),
    deploy_platform VARCHAR(20),
    repo_url VARCHAR(500),
    preview_url VARCHAR(500),
    -- ★ 확장성 컬럼
    metadata JSONB DEFAULT '{}',              -- 유연한 메타데이터
    current_version INTEGER DEFAULT 0,        -- 현재 활성 코드 버전
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_projects_org ON projects(organization_id);
CREATE INDEX idx_projects_status ON projects(status);
```

**metadata 구조:**
```json
{
  "tags": ["환율", "여행"],
  "isPublic": false,
  "viewCount": 142,
  "lastDeployedAt": "2026-03-20T12:00:00Z",
  "deployHistory": [
    { "version": 1, "deployedAt": "...", "platform": "railway", "url": "..." }
  ]
}
```

### 2.6 generated_codes (생성 코드) - 수정
```sql
CREATE TABLE generated_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    code_html TEXT,
    code_css TEXT,
    code_js TEXT,
    framework VARCHAR(20) DEFAULT 'vanilla',
    ai_prompt_used TEXT,
    -- ★ 확장성 컬럼
    ai_provider VARCHAR(30),                  -- grok, openai, ollama
    ai_model VARCHAR(50),                     -- grok-3-mini, gpt-4o-mini
    generation_time_ms INTEGER,               -- 생성 소요 시간
    token_usage JSONB DEFAULT '{}',           -- { input: N, output: N }
    dependencies TEXT[] DEFAULT '{}',          -- ["chart.js@4.4", "leaflet@1.9"]
    metadata JSONB DEFAULT '{}',              -- 품질 점수, 보안 검사 결과 등
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, version)
);

CREATE INDEX idx_codes_project ON generated_codes(project_id);
CREATE INDEX idx_codes_provider ON generated_codes(ai_provider);
```

**metadata 구조:**
```json
{
  "qualityScore": 4.2,
  "securityCheckPassed": true,
  "hasResponsive": true,
  "hasDarkMode": false,
  "externalLibs": ["chart.js"],
  "userFeedback": null,
  "validationErrors": []
}
```

### 2.7 user_api_keys (사용자 API 키 저장) - ★ 신규
```sql
CREATE TABLE user_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    api_id UUID NOT NULL REFERENCES api_catalog(id),
    encrypted_key TEXT NOT NULL,               -- 암호화된 API 키
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, api_id)
);

CREATE INDEX idx_user_api_keys_user ON user_api_keys(user_id);
```

### 2.8 event_log (이벤트 로그) - ★ 신규
```sql
CREATE TABLE event_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,           -- PROJECT_CREATED, CODE_GENERATED 등
    payload JSONB NOT NULL DEFAULT '{}',
    user_id UUID REFERENCES users(id),
    project_id UUID REFERENCES projects(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_event_log_type ON event_log(event_type);
CREATE INDEX idx_event_log_user ON event_log(user_id);
CREATE INDEX idx_event_log_created ON event_log(created_at);

-- 90일 이상 된 로그 자동 삭제 (용량 관리)
-- Supabase Edge Function 또는 pg_cron으로 스케줄링
```

### 2.9 feature_flags (피처 플래그) - ★ 신규
```sql
CREATE TABLE feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_name VARCHAR(100) UNIQUE NOT NULL,
    enabled BOOLEAN DEFAULT false,
    description TEXT,
    rules JSONB DEFAULT '{}',                  -- 조건부 활성화 규칙
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**rules 구조:**
```json
{
  "enabledForUsers": ["user-uuid-1", "user-uuid-2"],
  "enabledForPlans": ["pro"],
  "enabledPercentage": 10,
  "enabledAfter": "2026-04-01T00:00:00Z"
}
```

**초기 플래그 시드 데이터:**
```sql
INSERT INTO feature_flags (flag_name, enabled, description) VALUES
('enable_dark_mode', false, '다크 모드 UI'),
('enable_code_viewer', true, '생성 코드 보기 기능'),
('enable_ollama_fallback', false, 'Ollama 로컬 LLM 폴백'),
('enable_template_system', true, '코드 생성 템플릿'),
('enable_multi_language', false, '다국어 지원'),
('enable_team_features', false, '팀/조직 기능'),
('enable_advanced_prompt', false, '고급 프롬프트 옵션');
```

---

## 3. RLS 정책 (확장)

```sql
-- 기존 정책 유지 + 조직 기반 정책 추가

-- organizations: 멤버만 접근
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can read org" ON organizations
    FOR SELECT USING (
        id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
    );

-- memberships: 같은 조직 멤버만 조회
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can read memberships" ON memberships
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM memberships WHERE user_id = auth.uid()
        )
    );

-- projects: 본인 OR 같은 조직 멤버
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own or org projects" ON projects
    FOR ALL USING (
        user_id = auth.uid()
        OR organization_id IN (
            SELECT organization_id FROM memberships WHERE user_id = auth.uid()
        )
    );

-- user_api_keys: 본인만
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own api keys" ON user_api_keys
    FOR ALL USING (user_id = auth.uid());

-- event_log: 본인 이벤트만 조회
ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own events" ON event_log
    FOR SELECT USING (user_id = auth.uid());

-- feature_flags: 모든 인증 사용자 읽기
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read flags" ON feature_flags
    FOR SELECT USING (auth.role() = 'authenticated');
```

---

## 4. 마이그레이션 전략

```
supabase/migrations/
├── 001_initial_schema.sql       # users, api_catalog, projects, project_apis, generated_codes
├── 002_add_organizations.sql    # organizations, memberships
├── 003_add_extensibility.sql    # metadata 컬럼, api_version, event_log
├── 004_add_feature_flags.sql    # feature_flags
├── 005_add_user_api_keys.sql    # user_api_keys
└── 006_add_indexes.sql          # 성능 인덱스 추가

supabase/
├── seed.sql                     # API 카탈로그 + 피처 플래그 초기 데이터
└── seed_dev.sql                 # 개발용 테스트 데이터
```

---

## 5. 스키마 확장 가이드

### 새 기능 추가 시 DB 변경 원칙

1. **기존 테이블 수정보다 JSONB 메타데이터 활용 우선**
   - 자주 조회되지 않는 데이터 → metadata JSONB에 추가
   - 자주 필터/정렬에 사용되는 데이터 → 정규 컬럼 추가

2. **마이그레이션은 항상 추가만 (비파괴적)**
   - ALTER TABLE ADD COLUMN (NULL 허용 또는 DEFAULT 값)
   - DROP COLUMN은 최소 1 스프린트 유예 후 실행

3. **RLS 정책은 기능 추가와 함께**
   - 새 테이블 생성 시 RLS 정책 필수
   - 조직 기반 접근 패턴 유지
