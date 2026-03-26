# Sprint 11 — 팀/조직 기능 · 분석 대시보드

> 기반 문서: `docs/20_확장성_분석_및_로드맵.md` F12, F13
> 선행 조건: S10 완료
> 예상 기간: 4~5주
> 목표: 멀티 테넌시 활성화 + 데이터 기반 서비스 운영

---

## 진행 현황

| 태스크 | 목표 | 상태 |
|--------|------|------|
| S11-1 | 조직 CRUD + 멤버 관리 | ⏳ 대기 |
| S11-2 | 조직 프로젝트 공유 | ⏳ 대기 |
| S11-3 | 역할 기반 접근 제어 | ⏳ 대기 |
| S11-4 | 분석 데이터 집계 API | ⏳ 대기 |
| S11-5 | 분석 대시보드 UI | ⏳ 대기 |

---

## S11-1. 조직 CRUD + 멤버 관리

### 배경

`organizations`, `memberships` 테이블 + RLS 정책 이미 구현 완료 (001_initial_schema.sql).
`organizationRepository.ts` 기본 CRUD 존재.
`enable_team_features` 피처 플래그 존재 (현재 false).

### 구현 내용

**1) 조직 관리 API**

**신규 파일:** `src/app/api/v1/organizations/route.ts`

```
POST /api/v1/organizations
  body: { name, slug }
  → 조직 생성 + 생성자를 owner 멤버로 자동 추가

GET /api/v1/organizations
  → 내가 속한 조직 목록
```

**신규 파일:** `src/app/api/v1/organizations/[orgId]/route.ts`

```
GET    /api/v1/organizations/:orgId          → 조직 상세
PATCH  /api/v1/organizations/:orgId          → 조직 정보 수정 (admin/owner)
DELETE /api/v1/organizations/:orgId          → 조직 삭제 (owner only)
```

**2) 멤버 관리 API**

**신규 파일:** `src/app/api/v1/organizations/[orgId]/members/route.ts`

```
GET    /api/v1/organizations/:orgId/members           → 멤버 목록
POST   /api/v1/organizations/:orgId/members           → 멤버 초대
  body: { email, role: 'admin' | 'member' | 'viewer' }
DELETE /api/v1/organizations/:orgId/members/:memberId → 멤버 제거
PATCH  /api/v1/organizations/:orgId/members/:memberId → 역할 변경
```

**3) OrganizationService 생성**

**신규 파일:** `src/services/organizationService.ts`

- 조직 생성 시 slug 유효성 검사 + 중복 확인
- 멤버 초대 시 이메일로 사용자 조회 → 없으면 대기 상태 저장
- owner는 삭제/양도 불가 (최소 1명 유지)

**4) 조직 관리 페이지**

**신규 파일:** `src/app/(main)/org/page.tsx` — 조직 목록/생성

**신규 파일:** `src/app/(main)/org/[slug]/page.tsx` — 조직 상세/멤버 관리

**신규 파일:** `src/app/(main)/org/[slug]/settings/page.tsx` — 조직 설정

**5) Header 네비게이션 추가**

**수정 파일:** `src/components/layout/Header.tsx`

- "팀" 또는 "조직" 메뉴 항목 추가 (`enable_team_features` 플래그 확인)

**6) 피처 플래그 활성화**

```sql
UPDATE feature_flags SET enabled = true WHERE flag_name = 'enable_team_features';
```

### 완료 조건
- [ ] 조직 생성/수정/삭제 동작
- [ ] 멤버 초대/제거/역할 변경 동작
- [ ] RLS 정책으로 비멤버 접근 차단
- [ ] `enable_team_features = false` 시 UI 숨김

---

## S11-2. 조직 프로젝트 공유

### 배경

`projects.organization_id` 컬럼 존재 (nullable FK → organizations).
RLS 정책에서 조직 멤버의 프로젝트 조회 이미 허용.

### 구현 내용

**1) 프로젝트 생성 시 조직 선택**

**수정 파일:** `src/app/(main)/builder/page.tsx`

- 조직에 속해 있으면 "개인 프로젝트 / 조직 프로젝트" 선택 드롭다운 표시
- 조직 선택 시 `organization_id` 포함하여 생성 요청

**수정 파일:** `src/app/api/v1/projects/route.ts`

- POST body에 `organizationId?: string` 추가
- 조직 멤버십 확인 후 프로젝트 생성

**2) 대시보드 조직별 필터**

**수정 파일:** `src/app/(main)/dashboard/page.tsx`

- "내 프로젝트" / "조직명 프로젝트" 탭 또는 필터 드롭다운
- 조직 프로젝트는 소유자 아바타/이름 표시

**수정 파일:** `src/repositories/projectRepository.ts`

- `findByOrganizationId(orgId: string)` 메서드 추가

**3) 조직 대시보드 페이지**

**수정 파일:** `src/app/(main)/org/[slug]/page.tsx`

- 조직 소속 프로젝트 그리드 표시
- 멤버 목록 사이드바

### 완료 조건
- [ ] 조직 프로젝트 생성 시 organization_id 저장
- [ ] 조직 멤버 전원이 해당 프로젝트 조회 가능
- [ ] 대시보드에서 개인/조직 프로젝트 필터링

---

## S11-3. 역할 기반 접근 제어

### 구현 내용

**역할별 권한 매트릭스:**

| 동작 | owner | admin | member | viewer |
|------|-------|-------|--------|--------|
| 조직 설정 변경 | ✅ | ✅ | ❌ | ❌ |
| 멤버 관리 | ✅ | ✅ | ❌ | ❌ |
| 프로젝트 생성 | ✅ | ✅ | ✅ | ❌ |
| 프로젝트 수정/삭제 | ✅ | ✅ | 본인만 | ❌ |
| 프로젝트 조회 | ✅ | ✅ | ✅ | ✅ |
| 코드 생성 | ✅ | ✅ | ✅ | ❌ |
| 게시/게시취소 | ✅ | ✅ | 본인만 | ❌ |

**수정 파일:** `src/services/organizationService.ts`

- `checkPermission(userId, orgId, action)` 메서드 추가
- 각 API 라우트에서 권한 확인 후 동작

**수정 파일:** `src/services/projectService.ts`

- 조직 프로젝트 수정/삭제 시 멤버 역할 확인

### 완료 조건
- [ ] viewer는 프로젝트 생성/수정 불가
- [ ] member는 본인 프로젝트만 수정/삭제 가능
- [ ] admin/owner는 모든 조직 프로젝트 관리 가능
- [ ] 권한 부족 시 403 에러 반환

---

## S11-4. 분석 데이터 집계 API

### 배경

`event_log` 테이블에 모든 도메인 이벤트 저장 중.
`generated_codes`에 `token_usage`, `generation_time_ms`, `ai_provider`, `ai_model` 저장 중.

### 구현 내용

**신규 파일:** `src/app/api/v1/analytics/route.ts`

```
GET /api/v1/analytics?period=7d
→ {
    generation: {
      total: 156,
      successRate: 0.92,
      avgTimeMs: 8200,
      byProvider: { grok: 140, openai: 16 },
      byDay: [{ date: '2026-03-20', count: 22 }, ...]
    },
    tokens: {
      totalInput: 45000,
      totalOutput: 120000,
      byProvider: { grok: { input: 40000, output: 100000 }, ... }
    },
    projects: {
      total: 45,
      published: 12,
      byStatus: { draft: 10, generated: 23, published: 12 }
    },
    apis: {
      topUsed: [{ name: 'Open-Meteo', count: 28 }, ...],
      topCombinations: [{ apis: ['Open-Meteo', 'Frankfurter'], count: 5 }, ...]
    }
  }
```

**신규 파일:** `src/services/analyticsService.ts`

- `getOverview(userId, period)` — 개인 통계
- `getOrgOverview(orgId, period)` — 조직 통계
- `getSystemOverview(period)` — 시스템 전체 (관리자)

**집계 쿼리 대상:**
- `event_log` — 이벤트 유형별 카운트, 일별 추이
- `generated_codes` — 토큰 사용량, 생성 시간, 프로바이더별 분포
- `projects` — 상태별 분포, 일별 생성 추이
- `project_apis` — API 사용 빈도, 조합 패턴

### 완료 조건
- [ ] 기간별 분석 데이터 API 동작
- [ ] 개인/조직/시스템 단위 집계 가능

---

## S11-5. 분석 대시보드 UI

### 구현 내용

**신규 파일:** `src/app/(main)/analytics/page.tsx`

```
┌─ 서비스 분석 ──────────────────────────────────────┐
│                                                   │
│  기간: [7일 ▾]  [30일]  [90일]                     │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │ 총 생성   │  │ 성공률    │  │ 평균 시간  │        │
│  │   156    │  │  92%     │  │  8.2초   │        │
│  └──────────┘  └──────────┘  └──────────┘        │
│                                                   │
│  ┌─ 일별 생성 추이 ─────────────────────────────┐  │
│  │  ██                                         │  │
│  │  ██ ██                                      │  │
│  │  ██ ██ ██    ██                             │  │
│  │  ██ ██ ██ ██ ██ ██ ██                       │  │
│  │  3/20  21  22  23  24  25  26               │  │
│  └─────────────────────────────────────────────┘  │
│                                                   │
│  ┌─ 인기 API Top 5 ──┐  ┌─ AI 모델 사용 분포 ──┐  │
│  │ 1. Open-Meteo  28 │  │ Grok  ████████ 90%  │  │
│  │ 2. Frankfurter 22 │  │ OpenAI ██     10%  │  │
│  │ 3. CoinGecko   18 │  └────────────────────┘  │
│  │ 4. REST Countries│                           │
│  │ 5. JokeAPI     12 │                           │
│  └───────────────────┘                           │
│                                                   │
│  ┌─ 토큰 사용량 ────────────────────────────────┐  │
│  │ 입력: 45,000 토큰  │  출력: 120,000 토큰     │  │
│  └─────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────┘
```

**차트 구현:**
- CSS 기반 바 차트 (외부 라이브러리 없이)
- 숫자 카드는 Tailwind 그리드

**Header 네비게이션 추가:**

**수정 파일:** `src/components/layout/Header.tsx`

- "분석" 메뉴 항목 추가

### 완료 조건
- [ ] 분석 페이지에서 기간별 통계 표시
- [ ] 일별 생성 추이 바 차트
- [ ] 인기 API, AI 모델 분포 표시
- [ ] 토큰 사용량 합계 표시

---

## S11 완료 조건 종합

- [ ] 조직 생성/관리/멤버 초대 동작
- [ ] 조직 프로젝트 공유 + 역할별 접근 제어
- [ ] 분석 대시보드에서 주요 지표 확인
- [ ] 빌드 통과, 기존 기능 회귀 없음
