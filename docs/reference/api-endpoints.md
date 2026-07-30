# API v1 엔드포인트 레퍼런스

> **Base URL (개발):** http://localhost:3000/api/v1  
> **Base URL (프로덕션):** https://xzawed.xyz/api/v1  
> **인증:** Supabase 세션 쿠키 필요 (공개 엔드포인트 표시됨)

---

## Base URL
```
개발: http://localhost:3000/api/v1
프로덕션: https://<railway-domain>/api/v1
```

## 공통 응답 형식
```typescript
// 성공
{
    "success": true,
    "data": T,
    "message": "성공 메시지"
}

// 실패
{
    "success": false,
    "error": {
        "code": "ERROR_CODE",
        "message": "에러 메시지"
    }
}
```

---

## 1. API 카탈로그 (Catalog)

### GET /api/v1/catalog
API 카탈로그 전체 조회

**Query Parameters:**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| category | string | N | 카테고리 필터 |
| search | string | N | 검색어 |
| page | number | N | 페이지 (기본 1) |
| limit | number | N | 페이지 크기 (기본 20, 최대 100) |

**Response:**
```json
{
    "success": true,
    "data": {
        "items": [
            {
                "id": "uuid",
                "name": "OpenWeatherMap",
                "description": "현재 날씨, 5일 예보, 대기질",
                "category": "weather",
                "baseUrl": "https://api.openweathermap.org",
                "authType": "api_key",
                "rateLimit": "1000/day",
                "isActive": true,
                "iconUrl": "/icons/openweathermap.svg",
                "docsUrl": "https://openweathermap.org/api",
                "endpoints": [...],
                "tags": ["weather", "forecast"]
            }
        ],
        "total": 23,
        "page": 1,
        "totalPages": 2
    }
}
```

### GET /api/v1/catalog/:id
특정 API 상세 조회

**Response:**
```json
{
    "success": true,
    "data": {
        "id": "uuid",
        "name": "OpenWeatherMap",
        "description": "현재 날씨, 5일 예보, 대기질",
        "category": "weather",
        "baseUrl": "https://api.openweathermap.org",
        "authType": "api_key",
        "creditRequired": null,
        "endpoints": [...]
    }
}
```

| 상태코드 | 설명 |
|---------|------|
| 200 | 성공 |
| 404 | 해당 ID의 API를 찾을 수 없음 |

### GET /api/v1/catalog/categories
카테고리 목록 조회

**Response:**
```json
{
    "success": true,
    "data": [
        { "key": "weather", "label": "날씨", "count": 1, "icon": "🌤" },
        { "key": "news", "label": "뉴스", "count": 2, "icon": "📰" },
        { "key": "finance", "label": "금융/환율", "count": 2, "icon": "💱" }
    ]
}
```

---

## 2. 프로젝트 (Projects)

### POST /api/v1/projects
새 프로젝트 생성

**Request Body:**
```json
{
    "name": "여행자 환율 계산기",
    "context": "여행자를 위한 환율 계산기를 만들고 싶어요...",
    "apiIds": ["uuid-1", "uuid-2"]
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "id": "project-uuid",
        "name": "여행자 환율 계산기",
        "status": "draft",
        "apis": [...],
        "createdAt": "2026-03-20T00:00:00Z"
    }
}
```

### GET /api/v1/projects
내 프로젝트 목록 조회

### GET /api/v1/projects/:id
프로젝트 상세 조회

### DELETE /api/v1/projects/:id
프로젝트 삭제

### POST /api/v1/projects/:id/rollback
특정 버전으로 롤백 (기존 버전의 코드를 새 버전으로 복사)

**Request Body:**
```json
{
    "version": 2
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "projectId": "uuid",
        "version": 3,
        "rolledBackFrom": 2
    }
}
```

### POST /api/v1/projects/:id/publish
생성된 서비스를 서브도메인으로 게시

> 최초 게시 시 `slug`를 직접 지정할 수 있습니다. 미제공 시 자동 생성됩니다. 재게시는 기존 slug를 유지합니다.

**Request Body (선택):**
```json
{
    "slug": "my-weather-app"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `slug` | string | N | 최초 게시 시 사용할 slug. 미제공 시 AI 추천 또는 자동 생성. 충돌 시 `-2`, `-3` suffix 자동 부여 |

**Response:**
```json
{
    "success": true,
    "data": {
        "id": "uuid",
        "status": "published",
        "slug": "my-weather-app",
        "publishedAt": "2026-03-28T00:00:00Z"
    },
    "qcWarnings": ["콘솔 에러 감지: ReferenceError"]
}
```

> `qcWarnings` 필드는 렌더링 QC(`ENABLE_RENDERING_QC=true`)에서 경고가 발생한 경우에만 조건부 포함됩니다. 경고가 없으면 이 필드 자체가 응답에 포함되지 않습니다.

### POST /api/v1/projects/:id/slug/check
slug 가용성 실시간 검증 (PublishDialog에서 커스텀 입력 시 사용)

**Request Body:**
```json
{
    "slug": "my-weather-app"
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "available": true
    }
}
```

사용 불가한 경우:
```json
{
    "success": true,
    "data": {
        "available": false,
        "reason": "taken"
    }
}
```

| `reason` 값 | 설명 |
|-------------|------|
| `invalid` | 형식 오류 (길이, 문자, 예약어) |
| `reserved` | 시스템 예약 slug |
| `taken` | 다른 프로젝트가 사용 중 |

| 상태 코드 | 설명 |
|-----------|------|
| 200 | 검증 완료 (available true/false) |
| 400 | 요청 형식 오류 |
| 401 | 미인증 |
| 403 | 프로젝트 소유자가 아님 |

---

### DELETE /api/v1/projects/:id/publish
게시 취소 (서비스를 비공개로 전환)

**Response:**
```json
{
    "success": true,
    "data": {
        "id": "uuid",
        "status": "unpublished"
    }
}
```

---

## 3. 코드 생성 (Generate)

### POST /api/v1/generate
웹서비스 코드 생성 요청

**Request Body:**
```json
{
    "projectId": "project-uuid",
    "templateId": "dashboard"
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `projectId` | string | Y | 생성 대상 프로젝트 UUID |
| `templateId` | string | N | 템플릿 ID (없으면 기존 categoryDesignMap 동작 유지) |

**templateId 값:** `dashboard` \| `calculator` \| `gallery` \| `info-lookup` \| `map-service` \| `content-feed` \| `comparison` \| `timeline` \| `news-curator` \| `quiz` \| `profile`

**Response (SSE - Server-Sent Events):**
```
event: progress
data: {"progress": 10, "message": "API 분석 중..."}

event: progress
data: {"progress": 30, "message": "코드 생성 중..."}

event: progress
data: {"progress": 70, "message": "코드 파싱 중..."}

event: progress
data: {"progress": 90, "message": "코드 검증 중..."}

event: complete
data: {"projectId": "uuid", "version": 1, "previewUrl": "/api/v1/preview/uuid"}

event: error
data: {"message": "코드 생성에 실패했습니다."}
```

### GET /api/v1/generate/status/:projectId
생성 진행 상태 조회 (모바일 백그라운드 폴링용)

**Auth:** 필수

> SSE 스트림이 끊겼을 때(모바일 탭 전환 등) 클라이언트가 1초 간격으로 폴링하여 생성 완료를 확인합니다.

**Response:**
```json
{
    "success": true,
    "data": {
        "status": "generating",
        "progress": 45,
        "message": "Stage 2 기능 검증 중..."
    }
}
```

완료 시:
```json
{
    "success": true,
    "data": {
        "status": "completed",
        "result": { "projectId": "uuid", "version": 1 }
    }
}
```

| `status` 값 | 설명 |
|-------------|------|
| `generating` | 진행 중 (progress, message 포함) |
| `completed` | 완료 (result.version 포함, 또는 tracker miss 시 DB에서 코드 존재 확인) |
| `failed` | 실패 (error 메시지 포함) |
| `not_found` | 해당 프로젝트 생성 기록 없음 (tracker + DB 모두 미존재). **소유권 불일치 시에도 `not_found` 반환** — 보안 목적 정보 노출 방지 |

| 상태코드 | 설명 |
|---------|------|
| 200 | 성공 |
| 401 | 인증 필요 |

---

### POST /api/v1/generate/regenerate
코드 재생성 (수정 요청)

**Auth:** 필수

**Request Body:**
```json
{
    "projectId": "project-uuid",
    "feedback": "색상을 더 밝게 해주세요. 그래프도 추가해주세요."
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `projectId` | string | Y | 재생성 대상 프로젝트 UUID |
| `feedback` | string | Y | 수정 요청 내용 (1~5,000자) |

**Response (SSE):**
```
event: progress
data: {"progress": 10, "message": "피드백 분석 중..."}

event: progress
data: {"progress": 30, "message": "코드 수정 중..."}

event: complete
data: {"projectId": "uuid", "version": 2, "previewUrl": "/api/v1/preview/uuid"}

event: error
data: {"message": "재생성에 실패했습니다."}
```

> 프로젝트당 최대 `maxRegenerationsPerProject`(기본 5회) 재생성 가능. 재생성도 일일 생성 횟수에 포함됩니다.

### POST /api/v1/suggest-context
선택된 API 기반 AI 서비스 아이디어 추천

> 빌더 스텝 1(API 선택) → 스텝 2(서비스 설명) 전환 시 자동 호출

**Auth:** 필수

**Request Body:**
```json
{
    "apis": [
        {
            "name": "OpenWeatherMap",
            "description": "현재 날씨, 5일 예보, 대기질",
            "category": "weather"
        }
    ]
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "suggestions": [
            "실시간 날씨 대시보드를 만들고 싶어요. 현재 기온, 습도, 풍속을 시각적으로 보여주고...",
            "여행지별 날씨를 한눈에 비교할 수 있는 앱을 만들어 주세요...",
            "미세먼지와 자외선 지수를 함께 보여주는 오늘의 외출 도우미..."
        ]
    }
}
```

| 상태코드 | 설명 |
|---------|------|
| 200 | 성공 (파싱 실패 시에도 200 + suggestions: []) |
| 400 | apis 누락 또는 잘못된 형식 |
| 401 | 인증 필요 |

---

## 4. 미리보기 (Preview)

### GET /api/v1/preview/:projectId
생성된 코드 미리보기용 HTML 반환

**Query Parameters:**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| version | number | N | 코드 버전 (기본 최신, 1 이상의 정수) |

| 상태코드 | 설명 |
|---------|------|
| 200 | 성공 (text/html) |
| 400 | version 파라미터가 1 미만이거나 정수가 아님 |
| 401 | 인증 필요 |
| 404 | 프로젝트 또는 코드 없음 |

---

## 5. 배포 (Deploy)

### POST /api/v1/deploy
생성된 서비스 배포

**Request Body:**
```json
{
    "projectId": "project-uuid",
    "platform": "railway",
    "version": 1
}
```

**Response (SSE):**
```
event: progress
data: {"progress": 10, "message": "GitHub 저장소 생성 중..."}

event: progress
data: {"progress": 50, "message": "코드 업로드 중..."}

event: progress
data: {"progress": 80, "message": "배포 중..."}

event: complete
data: {"projectId": "uuid", "deployUrl": "https://svc-abc12345.up.railway.app", "repoUrl": "https://github.com/...", "platform": "railway"}

event: error
data: {"message": "배포에 실패했습니다."}
```

> **Rate Limit**: 사용자당 일일 `MAX_DEPLOY_PER_DAY`회 (기본 5회). 초과 시 429 `RATE_LIMITED` 반환.

> **참고**: `GET /api/v1/deploy/:projectId/status`는 미구현 상태입니다. 프로젝트 상태는 `GET /api/v1/projects/:id`로 확인하세요.

---

## 6. 공개 사이트 서빙 (Public Site)

### GET /site/:slug
게시된 서비스를 공개 URL로 서빙

> **인증 불필요** — 누구나 접근 가능한 공개 엔드포인트

**URL 구조:** `https://<app-domain>/site/<slug>`

**동작:**
- slug 유효성 검사 → 예약어 차단
- 프로젝트 조회 → `published` 상태 확인
- 최신 생성 코드를 완성된 HTML로 조합하여 반환
- 미게시 상태면 "준비 중" 안내 페이지 반환 (HTTP 200)
- 존재하지 않는 slug는 404 페이지 반환

| 상태코드 | 설명 |
|---------|------|
| 200 | 성공 (게시된 사이트 HTML) |
| 200 | 미게시 상태 ("준비 중" 안내 페이지) |
| 400 | 잘못된 slug 형식 (예약어·빈 slug 등) |
| 404 | 해당 slug의 프로젝트 없음 |

**Response:** `text/html` (완성된 웹 애플리케이션)

**Response Headers:**
```
Content-Type: text/html; charset=utf-8
Cache-Control: public, s-maxage=60, stale-while-revalidate=300
Content-Security-Policy: (허용된 외부 스크립트/스타일만)
X-Frame-Options: DENY
```

---

## 7. 헬스체크 (Health)

### GET /api/v1/health
서비스 상태 및 한도 사용률 조회

> **인증 불필요** — 기본 상태(`status`, `timestamp`)는 누구나 조회 가능  
> **상세 정보** — `?detailed=true` + `Authorization: Bearer {ADMIN_API_KEY}` 헤더 필요

**기본 응답 (인증 없거나 `detailed` 미지정):**
```json
{
    "status": "ok",
    "timestamp": "2026-03-28T00:00:00Z"
}
```

**상세 응답 (`?detailed=true` + `ADMIN_API_KEY` 인증 시):**
```json
{
    "status": "healthy",
    "timestamp": "2026-03-28T00:00:00Z",
    "checks": {
        "database": "ok",
        "aiProvider": "claude",
        "ai": "ok",
        "deploy": "ok"
    },
    "usage": {
        "todayGenerations": 42,
        "totalProjects": 150,
        "totalUsers": 30,
        "limits": {
            "maxDailyGenerationsPerUser": 10,
            "maxApisPerProject": 5,
            "maxProjectsPerUser": 20
        }
    },
    "failover": { "enabled": true, "state": "closed" }
}
```

**status 값:**
- `healthy`: 모든 서비스 정상
- `degraded`: AI 또는 배포 서비스 미설정 (환경변수 누락)
- `unhealthy`: 데이터베이스 연결 실패

---

## 8. 인증 (Auth)

Auth.js Credentials + JWT. 세션 쿠키 필요(공개 엔드포인트 제외). 가입·인증·재설정 라우트는 `/api/v1/auth/*` 및 `/api/auth/*`(Auth.js 핸들러).

### GET /api/v1/auth/export
현재 로그인 사용자의 계정 데이터를 JSON으로 내보낸다 (`#221`).

**인증:** 필요 (`getAuthUser` — DB 행 존재 확인). **이메일 인증은 요구하지 않음.**

**레이트리밋:** 사용자당 3회/시간 (`export:{userId}` + 클라이언트 IP, auth 인메모리 리미터).

**Response headers:**
- `Content-Disposition: attachment; filename="customwebservice-export-YYYY-MM-DD.json"` (UTC 날짜)

**Response body (`data`):**
```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-07-30T12:00:00.000Z",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": null,
    "avatarUrl": null,
    "preferences": {},
    "emailVerified": "2026-06-01T00:00:00.000Z",
    "createdAt": "…",
    "updatedAt": "…"
  },
  "projects": [
    {
      "id": "uuid",
      "userId": "uuid",
      "name": "…",
      "context": "…",
      "status": "generated",
      "…": "프로젝트 메타 전체",
      "projectApis": [{ "apiId": "uuid", "config": {} }],
      "generatedCodes": [
        {
          "version": 1,
          "codeHtml": "…",
          "codeCss": "…",
          "codeJs": "…",
          "framework": "vanilla",
          "aiModel": "…",
          "aiPromptUsed": "…",
          "tokenUsage": { "input": 0, "output": 0 },
          "dependencies": [],
          "metadata": {}
        }
      ]
    }
  ],
  "userApiKeys": [
    { "apiId": "uuid", "isVerified": true, "createdAt": "…" }
  ]
}
```

**포함하지 않음:** `passwordHash`, `auth_tokens`, `generation_locks`, `user_daily_limits`, API 키 ciphertext/평문(`encryptedKey` 등). `userApiKeys`는 메타데이터만.

| 상태 | 코드 | 설명 |
|------|------|------|
| 200 | — | 내보내기 JSON |
| 401 | `AUTH_REQUIRED` | 미인증·삭제된 세션 |
| 429 | `RATE_LIMITED` | 시간당 한도 초과 |

---


## 9. 에러 코드

| 코드 | HTTP Status | 설명 |
|------|-------------|------|
| AUTH_REQUIRED | 401 | 인증 필요 |
| FORBIDDEN | 403 | 권한 없음 |
| NOT_FOUND | 404 | 리소스 없음 |
| INVALID_INPUT | 400 | 입력값 오류 (Zod 스키마 검증 실패 포함) |
| CONTEXT_TOO_SHORT | 400 | 컨텍스트 50자 미만 |
| CONTEXT_TOO_LONG | 400 | 컨텍스트 2000자 초과 |
| MAX_APIS_EXCEEDED | 400 | API 최대 선택 수 초과 |
| GENERATION_FAILED | 500 | 코드 생성 실패 |
| DEPLOY_FAILED | 500 | 배포 실패 |
| RATE_LIMITED | 429 | 요청 횟수 초과 |
| INTERNAL_ERROR | 500 | 처리되지 않은 서버 오류 |

> **참고**: Zod 스키마 검증 실패(`ZodError`)는 `INVALID_INPUT` 코드로 400 응답을 반환합니다.
> `handleApiError()` 유틸리티가 `AppError`, `ZodError`, 일반 `Error` 모두를 표준 형식으로 변환합니다.

---

## 10. AI 추천 (Suggest)

### POST /api/v1/suggest-apis
서비스 설명 기반 API 추천

**Auth required**: Yes

**Request Body:**
```json
{
    "context": "만들고 싶은 서비스 설명 (50~2000자)"
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "recommendations": [
            {
                "api": { "id": "uuid", "name": "OpenWeatherMap", ... },
                "reason": "날씨 데이터 제공에 최적"
            }
        ]
    }
}
```

| 상태코드 | 설명 |
|---------|------|
| 200 | 성공 (파싱 실패 시에도 200 + recommendations: []) |
| 400 | context 누락 또는 길이 제한 위반 |
| 401 | 인증 필요 |
| 429 | 일일 한도 초과 |

### POST /api/v1/suggest-modification
기존 프로젝트 수정 아이디어 추천

**Auth required**: Yes

**Request Body:**
```json
{
    "projectId": "project-uuid",
    "prompt": "부분적인 수정 방향 힌트 (선택, 최대 500자)"
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "suggestions": [
            "UI 개선 제안...",
            "기능 추가 제안...",
            "데이터 시각화 제안..."
        ]
    }
}
```

### POST /api/v1/suggest-preferences
선택된 API와 컨텍스트 기반 UI 디자인 선호도 추천

> 빌더 스텝 2(서비스 설명 입력) 완료 후 자동 호출. API-컨텍스트 연관성 분석 + 최적 레이아웃/색상/컴포넌트 패턴 추천

**Auth required**: Yes

**Request Body:**
```json
{
    "context": "서비스 설명 (50~2000자)",
    "apiIds": ["uuid1", "uuid2"]
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `context` | string | Y | 서비스 설명 (50~2000자) |
| `apiIds` | string[] | Y | 선택된 API UUID 목록 |

**Response:**
```json
{
    "success": true,
    "data": {
        "relevanceScore": 85,
        "templateId": "dashboard",
        "designMood": "modern",
        "designAudience": "general",
        "designLayout": "data-dashboard",
        "resolutionOptions": []
    }
}
```

| 상태코드 | 설명 |
|---------|------|
| 200 | 성공 |
| 400 | context/apiIds 누락 또는 길이 제한 위반 |
| 401 | 인증 필요 |
| 429 | 일일 한도 초과 |

---

## 11. 인기 서비스 (Popular Services)

### GET /api/v1/popular-services
인기 서비스 템플릿 목록 조회 (실사용 데이터 기반 + 큐레이션 폴백)

**Auth required**: Yes

**Response:**
```json
{
    "success": true,
    "data": {
        "services": [
            {
                "id": "popular-uuid",
                "title": "실시간 날씨 대시보드",
                "description": "...",
                "context": "...",
                "apiNames": ["OpenWeatherMap"],
                "apiIds": ["uuid"],
                "category": "weather",
                "usageCount": 42
            }
        ],
        "source": "usage"
    }
}
```

`source` 값: `usage` (실사용 데이터) | `mixed` (실사용 + 큐레이션 혼합)

---

## 12. 사용자 API 키 (User API Keys)

### GET /api/v1/user-api-keys
내 API 키 목록 조회 (마스킹 처리)

**Auth required**: Yes

### POST /api/v1/user-api-keys
API 키 저장 (신규 등록 또는 업데이트)

**Auth required**: Yes

**Request Body:**
```json
{
    "apiId": "uuid",
    "apiKey": "your-api-key"
}
```

### DELETE /api/v1/user-api-keys?apiId=:apiId
API 키 삭제

**Auth required**: Yes

---

## 13. 외부 API 프록시 (Proxy)

### GET /api/v1/proxy
### POST /api/v1/proxy

생성된 웹서비스가 외부 API를 호출할 때 CORS 우회 및 API 키 주입을 위한 서버사이드 프록시

> **보안:** SSRF 방지를 위해 등록된 `baseUrl` 범위 내에서만 요청 허용. 사설 IP 및 루프백 주소 차단.

**Auth required**: Yes (`getAuthUser()` — 미인증 시 401 반환)

**Rate Limit**: 사용자당 분당 60회 (인메모리, 초과 시 429)

**응답 캐시 (서버사이드)**:
특정 API에 `cache_ttl_seconds`가 설정된 경우 GET 응답이 서버 메모리에 캐시됩니다.

| 헤더 | 값 | 설명 |
|------|-----|------|
| `X-Cache` | `HIT` | 캐시에서 응답 반환 |
| `X-Cache` | `MISS` | 업스트림에서 응답 후 캐시 저장 |
| `Cache-Control` | `public, max-age={ttl}` | 캐시됨 (`cache_ttl_seconds` 설정된 API) |
| `Cache-Control` | `no-store` | 캐시 미사용 |

> POST 요청, 4xx/5xx 응답, `cache_ttl_seconds=null` API는 캐시하지 않습니다.
> 캐시 키: `apiId:proxyPath:sortedParams` (서버 주입 인증 파라미터 제외)

**Query Parameters:**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| apiId | string (UUID) | Y | 카탈로그 API ID |
| proxyPath | string | Y | 대상 API 경로 (예: `/weather?q=Seoul`) |
| projectId | string (UUID) | N | 프로젝트 ID (사용자 개인 키 조회용) |

---

## 14. 관리자 API (Admin)

> `Authorization: Bearer {ADMIN_API_KEY}` 헤더 필수. 일반 사용자 접근 불가.

### GET /api/v1/admin/qc-stats
QC 통계 조회

**Query Parameters:**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| days | number | N | 조회 기간 (기본 7일) |

**Response:**
```json
{
    "success": true,
    "data": {
        "period": { "from": "2026-04-05", "to": "2026-04-12", "days": 7 },
        "totalGenerations": 150,
        "failureCount": 8,
        "realSuccessRate": 0.95,
        "avgStructuralScore": 8.5,
        "avgMobileScore": 7.2,
        "avgRenderingQcScore": 6.8,
        "qcPassRate": 0.85,
        "qualityLoopUsageRate": 0.32,
        "deepQcFailedCount": 5,
        "stage3FallbackCount": 3,
        "stage3FallbackRate": 0.02,
        "stage2SkipCount": 90,
        "stage3SkipCount": 60,
        "stage2SkipRate": 0.6,
        "stage3SkipRate": 0.4,
        "avgQualityLoopIterations": 0.45,
        "qualityLoopImprovementRate": 0.78,
        "commonFailures": [
            { "check": "contrast", "failCount": 12, "rate": 0.08 }
        ]
    }
}
```

**응답 필드:**
| 필드 | 타입 | 설명 |
|------|------|------|
| `period` | object | 조회 기간 (`from`, `to`, `days`) |
| `totalGenerations` | number | 기간 내 완료된 생성 건수 |
| `failureCount` | number | 기간 내 생성 실패 횟수 (`CODE_GENERATION_FAILED` 이벤트 집계) |
| `realSuccessRate` | number | 실제 성공률 = 성공 생성 / 전체 시도 (0.0 ~ 1.0) |
| `avgStructuralScore` | number | 평균 구조 QC 점수 |
| `avgMobileScore` | number | 평균 모바일 QC 점수 |
| `avgRenderingQcScore` | number | 평균 렌더링 QC 점수 |
| `qcPassRate` | number | QC 통과율 (0.0 ~ 1.0) |
| `qualityLoopUsageRate` | number | Quality Loop 사용률 (`metadata.qualityLoopUsed` boolean 집계, 0.0 ~ 1.0) |
| `deepQcFailedCount` | number | Deep QC 실패 건수 |
| `stage3FallbackCount` | number | Stage 3 디자인 폴리시 실패 → Stage 2 폴백 횟수 (`STAGE3_FALLBACK_USED` 이벤트 집계) |
| `stage3FallbackRate` | number | Stage 3 폴백 비율 = `stage3FallbackCount / (totalGenerations + failureCount)` |
| `stage2SkipCount` | number | Stage 2 기능 검증 스킵 횟수 (Stage 1 품질 충분 시) |
| `stage3SkipCount` | number | Stage 3 디자인 폴리시 스킵 횟수 (점수 충분 + Stage 2 불필요) |
| `stage2SkipRate` | number | Stage 2 스킵 비율 = `stage2SkipCount / totalGenerations` |
| `stage3SkipRate` | number | Stage 3 스킵 비율 = `stage3SkipCount / totalGenerations` |
| `avgQualityLoopIterations` | number | Quality Loop 평균 반복 횟수 (loop 미진입 시 0 포함, `QUALITY_LOOP_COMPLETED` 이벤트 평균) |
| `qualityLoopImprovementRate` | number | Quality Loop 개선 성공률 = `improved=true` 이벤트 수 / 전체 `QUALITY_LOOP_COMPLETED` 이벤트 수 |
| `commonFailures` | array | 빈도 상위 실패 체크 목록 |

### POST /api/v1/admin/trigger-qc
특정 프로젝트에 대한 수동 QC 실행 (`ENABLE_RENDERING_QC=true` 필요)

**Request Body:**
```json
{
    "projectId": "project-uuid"
}
```

**에러 응답 형식:** 표준 `{ success: false, error: { code, message } }`

| 에러 코드 | HTTP | 설명 |
|-----------|------|------|
| `QC_DISABLED` | 400 | `ENABLE_RENDERING_QC`가 활성화되지 않음 |
| `NOT_FOUND` | 404 | 해당 프로젝트의 생성된 코드 없음 |
| `INVALID_INPUT` | 400 | `projectId` 누락 |

### POST /api/v1/admin/test-generation
관리자 전용 생성 파이프라인 부하/안정성 테스트 엔드포인트. 인증된 사용자 세션 없이 `ADMIN_API_KEY`만으로 전체 코드 생성 파이프라인(Stage1·2·3 + Quality Loop)을 한 번 실행하고 결과를 JSON으로 반환합니다.

> 일일 생성 한도(`MAX_DAILY_GENERATIONS`)·프로젝트 수 한도(`MAX_PROJECTS_PER_USER`)를 우회합니다. 일반 사용자 흐름 검증이 아닌, 관리자가 수동/스크립트 호출로 안정성을 측정하는 용도입니다.

**Request:**
```http
POST /api/v1/admin/test-generation
Authorization: Bearer <ADMIN_API_KEY>
Content-Type: application/json
```

**Request Body:**
```json
{
  "userId": "11111111-...",
  "apiIds": ["uuid1", "uuid2", "uuid3"],
  "context": "선택 사항. 사용자 서비스 설명 (20~2000자, 기본값 있음)",
  "projectName": "선택 사항. 기본값: [자동테스트] YYYY-MM-DD HH:MM:SS",
  "cleanup": true
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `userId` | UUID | ✅ | 테스트 프로젝트의 소유자 (DB에 존재하는 사용자) |
| `apiIds` | UUID[] | ✅ | 카탈로그 API ID 3~5개 |
| `context` | string | ❌ | 서비스 설명 (20~2000자) |
| `projectName` | string | ❌ | 프로젝트 이름 (1~100자) |
| `cleanup` | boolean | ❌ | `true`(기본)면 파이프라인 완료 후 프로젝트 자동 삭제. `false`면 보존 |

**성공 응답 (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "projectId": "uuid",
    "cleanedUp": true,
    "durationMs": 92345,
    "apiIds": ["..."],
    "complete": {
      "projectId": "uuid",
      "version": 1,
      "previewUrl": "/api/v1/preview/uuid",
      "qcResult": { "score": 82, "passed": true, "issues": [] }
    },
    "progressEvents": [{"step": "analyzing", "progress": 5, "message": "..."}]
  }
}
```

**파이프라인 실패 응답 (HTTP 200, success: false):**
```json
{
  "success": false,
  "data": {
    "projectId": "uuid",
    "cleanedUp": true,
    "durationMs": 4567,
    "apiIds": ["..."],
    "error": { "message": "Stage 1 실패: ..." },
    "progressEvents": [...]
  }
}
```

**에러 응답 형식:** 표준 `{ success: false, error: { code, message } }`

| 에러 코드 | HTTP | 설명 |
|-----------|------|------|
| `FORBIDDEN` | 403 | `Authorization` 누락 / 잘못된 `ADMIN_API_KEY` / IP 분당 한도 초과 |
| `INVALID_INPUT` | 400 | Zod 검증 실패 (`apiIds` 3개 미만, UUID 형식 오류, 길이 초과 등) |

**연관 스크립트:** [scripts/runGenerationLoadTest.ts](../../scripts/runGenerationLoadTest.ts) — 골든셋 API 무작위 조합으로 N회 반복 호출하여 성공률·평균 응답 시간 집계.

### GET /api/v1/admin/debug
주요 npm 패키지의 모듈 로드 상태와 **AI 모델 해석 결과**를 진단합니다. standalone 배포 후 500 오류 원인 규명(패키지 누락 여부)과, `AI_MODEL_*` env가 실제로 적용됐는지 확인에 사용합니다.

> **`models` 필드를 왜 보는가**: 허용목록(`ALLOWED_CLAUDE_MODELS`)에 없는 env 값은 경고 로그 한 줄만 남기고 **조용히 기본값으로 폴백**한다. env 값만 봐서는 실제 적용 모델을 알 수 없어, 2026-07-10에 `AI_MODEL_GENERATION`이 밀려 구모델로 돌던 것을 뒤늦게 발견한 적이 있다. **모델을 바꾼 뒤에는 이 엔드포인트로 `fellBack: false`를 확인할 것.**

**Request:**
```http
GET /api/v1/admin/debug
Authorization: Bearer <ADMIN_API_KEY>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "nodeVersion": "v20.x.x",
    "platform": "linux",
    "arch": "x64",
    "nodeEnv": "production",
    "models": {
      "generation": { "env": "claude-opus-5", "resolved": "claude-opus-5", "fellBack": false },
      "suggestion": { "env": "claude-haiku-4-5", "resolved": "claude-haiku-4-5", "fellBack": false }
    },
    "modules": {
      "playwright-core": "ok",
      "@anthropic-ai/sdk": "ok",
      "drizzle-orm": "ok",
      "drizzle-orm/node-postgres": "ok",
      "pg": "ok"
    }
  }
}
```

| `models.<task>` 필드 | 의미 |
|---|---|
| `env` | `AI_MODEL_*` env 원본 값. 미설정이면 `null` |
| `resolved` | **실제로 적용되는 모델** |
| `fellBack` | `true`면 env를 지정했는데 허용목록에 없어 무시되고 기본값이 쓰이는 중 — `AiProviderFactory.ts`의 `ALLOWED_CLAUDE_MODELS`를 고쳐야 한다 |

모듈 로드 실패 시 해당 모듈 값이 `"FAIL: Cannot find module '...'"` 형태로 반환됩니다.

| 에러 코드 | HTTP | 설명 |
|-----------|------|------|
| `FORBIDDEN` | 403 | `Authorization` 헤더 누락 또는 잘못된 `ADMIN_API_KEY` |

### GET /api/v1/admin/keys-verify
"플랫폼 키 의존" API(`auth_type=api_key` + `auth_config.env_var`, `default_key` 없음)의 키 유효성을 **배포 런타임의 env 키로 실제 인증 요청을 보내** 검증합니다. Railway sealed 변수는 배포 런타임에만 주입되므로 이 진단은 **반드시 배포 환경에서** 실행돼야 합니다(로컬 `railway run`은 sealed 미주입). 키 값은 응답에 노출되지 않습니다. 검증 로직은 [src/lib/catalog/keyCheck.ts](../../src/lib/catalog/keyCheck.ts).

**Request:**
```http
GET /api/v1/admin/keys-verify
Authorization: Bearer <ADMIN_API_KEY>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "generatedAt": "2026-06-21T...",
    "summary": { "total": 6, "valid": 6, "invalid": 0, "missing": 0, "rateLimited": 0, "needsPrefixFix": [] },
    "results": [
      { "name": "카카오 로컬 (지도·장소 검색)", "envVar": "API_KEY_F1EC6F97", "verdict": "VALID", "httpStatus": 200, "detail": "인증 성공" }
    ]
  }
}
```

- `verdict`: `VALID` / `INVALID`(키 거부·만료) / `MISSING`(env 미설정) / `RATE_LIMITED` / `ERROR` / `NO_ENDPOINT`
- `needsPrefixFix`: raw 주입은 401이지만 prefix(`KakaoAK `/`Client-ID `) 적용 시 성공한 API 목록 — 프록시가 prefix를 적용해야 함을 의미

| 에러 코드 | HTTP | 설명 |
|-----------|------|------|
| `FORBIDDEN` | 403 | `Authorization` 헤더 누락 또는 잘못된 `ADMIN_API_KEY` |

### POST /api/v1/admin/verify-catalog
활성 카탈로그 각 API의 GET 엔드포인트를 **배포 런타임에서 실제 호출**해 라이브 검증하고 `verification_status`를 갱신합니다(P5.2 — 컷오버로 제거된 CI cron의 대체). `working/degraded → verified`, `broken → broken`만, 그리고 **현재 값과 다를 때만** DB를 갱신하며, `key_gated`(키 의존 401/403)·`unknown`(예상치 못한 4xx)은 자동 판정 불가로 **기존 값을 보존**합니다(일시 장애·키 부재로 인한 오판 방지). 무인 스케줄러가 아닌 관리자 트리거 방식이라 플래핑·무인 outbound가 없습니다. 로직: [src/lib/catalog/verifyRunner.ts](../../src/lib/catalog/verifyRunner.ts).

**Request:**
```http
POST /api/v1/admin/verify-catalog
Authorization: Bearer <ADMIN_API_KEY>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "generatedAt": "2026-06-25T...",
    "summary": { "checked": 36, "updated": 2, "unchanged": 30, "skipped": 4 },
    "results": [
      { "id": "...", "name": "JSONPlaceholder", "previous": "unverified", "health": "working", "next": "verified", "updated": true }
    ]
  }
}
```

- `health`: `working` / `degraded`(느림·429) / `broken`(네트워크 실패·5xx·키리스 401·2xx 에러본문) / `key_gated`(키 의존 401/403) / `unknown`(예상치 못한 4xx)
- `next`: 매핑된 `verification_status`(`verified`/`broken`) 또는 `null`(보존). `updated`: 실제 DB 변경 여부
- `skipped`: 자동 판정 불가(`next=null` — key_gated/unknown/GET 엔드포인트 없음)

| 에러 코드 | HTTP | 설명 |
|-----------|------|------|
| `FORBIDDEN` | 403 | `Authorization` 헤더 누락 또는 잘못된 `ADMIN_API_KEY` |

### GET /api/v1/admin/catalog-dump
프로덕션 `api_catalog` **전체 행(활성·비활성 포함)** 을 시드 동기화 diff용으로 덤프합니다. 공개 `GET /api/v1/catalog`는 활성 행만 반환하므로, 비활성(키 의존) 행까지 포함한 전체 파리티 검증에 사용합니다. `auth_config` 등 민감 필드는 제외한 **안전 투영**(id·name·category·authType·isActive·verificationStatus·verifiedAt·deprecatedAt·successorId·requiresProxy·apiVersion)만 반환하는 **읽기 전용** 진단입니다. 배포 런타임 전용(프로덕션 SQLite 읽기).

**Request:**
```http
GET /api/v1/admin/catalog-dump
Authorization: Bearer <ADMIN_API_KEY>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "generatedAt": "2026-06-29T...",
    "summary": { "total": 61, "active": 36, "inactive": 25, "byVerificationStatus": { "verified": 30, "broken": 1, "key_gated": 24 } },
    "items": [
      { "id": "...", "name": "Countries (Self-hosted)", "category": "data", "authType": "none", "isActive": true, "verificationStatus": "verified", "verifiedAt": "2026-06-22T...", "deprecatedAt": null, "successorId": null, "requiresProxy": false, "apiVersion": "v1" }
    ]
  }
}
```

| 에러 코드 | HTTP | 설명 |
|-----------|------|------|
| `FORBIDDEN` | 403 | `Authorization` 헤더 누락 또는 잘못된 `ADMIN_API_KEY` |

---

### GET /api/v1/admin/site-proxy-stats
게시 사이트 프록시(익명 site 모드)의 **프로젝트별 사용량**을 반환합니다. site 모드는 익명 방문자가 프로젝트 오너의 API 키로 업스트림을 호출하므로 레이트리밋이 유일한 방어선인데, 한도 초과가 429 응답으로만 나타나 **어느 프로젝트가 얼마나 소진되고 있는지 알 수 없었습니다.** 기본값(20/120)도 실사용 데이터 없이 정한 값이라 조정 근거가 필요합니다.

집계는 `siteRateLimit`의 **인메모리 카운터**라 프로세스 재시작 시 초기화됩니다(레이트리밋 자체와 동일한 단일 인스턴스 전제). `since`가 집계 시작 시각입니다.

**Request:**
```http
GET /api/v1/admin/site-proxy-stats?limit=50
Authorization: Bearer <ADMIN_API_KEY>
```

| 쿼리 | 기본값 | 설명 |
|------|--------|------|
| `limit` | `50` | 호출량 상위 N개 프로젝트만 반환. 0·음수·비정수는 기본값 폴백 |

**Response:**
```json
{
  "success": true,
  "data": {
    "since": "2026-07-29T10:00:00.000Z",
    "limits": { "perIpPerMin": 20, "perProjectPerMin": 120 },
    "trackedProjects": 3,
    "returnedProjects": 3,
    "truncated": false,
    "projects": [
      { "projectId": "...", "allowed": 842, "blockedByIp": 12, "blockedByProject": 0 }
    ],
    "note": "인메모리 집계 — 프로세스 재시작 시 초기화된다(단일 인스턴스 전제)."
  }
}
```

| 필드 | 의미 |
|------|------|
| `blockedByIp` | IP+projectId 버킷(20/분)에 걸린 횟수. 한 방문자의 과속 — 정상 트래픽에서도 나올 수 있음 |
| `blockedByProject` | **프로젝트 전역 버킷(120/분)** 에 걸린 횟수. 분산 IP로도 우회되지 않는 실질 상한이므로 **0이 아니면 오남용 또는 한도 부족** 신호 |
| `truncated` | 추적 용량(`MAX_SITE_RATE_LIMIT_BUCKETS`) 초과로 집계에서 빠진 프로젝트가 있음 |
| `returnedProjects` vs `trackedProjects` | `limit`으로 잘린 개수와 전체 개수. 다르면 상위 N개만 본 것 |

프로젝트 전역 한도에 도달하면 `logger.warn('Site proxy project limit reached')`가 **버킷당 윈도 1회** 남습니다(봇이 두드릴 때 로그 폭발 방지).

| 에러 코드 | HTTP | 설명 |
|-----------|------|------|
| `FORBIDDEN` | 403 | `Authorization` 헤더 누락 또는 잘못된 `ADMIN_API_KEY` |
