# API 설계 (Internal API Design)

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
| limit | number | N | 페이지 크기 (기본 20) |

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
        "total": 30,
        "page": 1,
        "totalPages": 2
    }
}
```

### GET /api/v1/catalog/:id
특정 API 상세 조회

### GET /api/v1/catalog/categories
카테고리 목록 조회

**Response:**
```json
{
    "success": true,
    "data": [
        { "key": "weather", "label": "날씨", "count": 3, "icon": "🌤" },
        { "key": "news", "label": "뉴스", "count": 3, "icon": "📰" },
        { "key": "finance", "label": "금융/환율", "count": 3, "icon": "💱" }
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

---

## 3. 코드 생성 (Generate)

### POST /api/v1/generate
웹서비스 코드 생성 요청

**Request Body:**
```json
{
    "projectId": "project-uuid"
}
```

**Response (SSE - Server-Sent Events):**
```
event: progress
data: {"step": "analyzing", "progress": 10, "message": "API 분석 중..."}

event: progress
data: {"step": "generating_code", "progress": 40, "message": "코드 생성 중..."}

event: progress
data: {"step": "generating_ui", "progress": 70, "message": "UI 디자인 중..."}

event: progress
data: {"step": "validating", "progress": 90, "message": "코드 검증 중..."}

event: complete
data: {"projectId": "uuid", "version": 1, "previewUrl": "/preview/uuid"}
```

### POST /api/v1/generate/regenerate
코드 재생성 (수정 요청)

**Request Body:**
```json
{
    "projectId": "project-uuid",
    "feedback": "색상을 더 밝게 해주세요. 그래프도 추가해주세요."
}
```

---

## 4. 미리보기 (Preview)

### GET /api/v1/preview/:projectId
생성된 코드 미리보기용 HTML 반환

**Query Parameters:**
| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| version | number | N | 코드 버전 (기본 최신) |

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
data: {"step": "creating_repo", "message": "GitHub 저장소 생성 중..."}

event: progress
data: {"step": "pushing_code", "message": "코드 업로드 중..."}

event: progress
data: {"step": "deploying", "message": "배포 중..."}

event: complete
data: {"deployUrl": "https://svc-abc12345.up.railway.app", "repoUrl": "https://github.com/..."}
```

### GET /api/v1/deploy/:projectId/status
배포 상태 조회

**Response:**
```json
{
    "success": true,
    "data": {
        "status": "deployed",
        "deployUrl": "https://svc-abc12345.up.railway.app",
        "platform": "railway",
        "lastDeployed": "2026-03-20T12:00:00Z"
    }
}
```

---

## 6. 인증 (Auth)

Supabase Auth 사용 - 별도 API 구현 불필요

| 기능 | 방식 |
|------|------|
| 회원가입 | Supabase `signUp()` |
| 로그인 | Supabase `signIn()` |
| 소셜 로그인 | Google, GitHub OAuth |
| 로그아웃 | Supabase `signOut()` |
| 세션 관리 | Supabase 자동 관리 |

---

## 7. 에러 코드

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
