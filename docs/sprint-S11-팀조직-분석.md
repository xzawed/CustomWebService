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

## S11 테스트 계획

### 단위 테스트 (Unit Tests)

#### `src/services/organizationService.test.ts` — 신규 (S11-1, S11-3)
```
describe('OrganizationService')
├── describe('create')
│   ├── it('조직을 생성하고 생성자를 owner로 추가한다')
│   ├── it('중복 slug에 ConflictError를 던진다')
│   └── it('잘못된 slug 형식에 ValidationError를 던진다')
├── describe('addMember')
│   ├── it('이메일로 사용자를 찾아 멤버로 추가한다')
│   ├── it('이미 멤버인 사용자에 ConflictError를 던진다')
│   ├── it('존재하지 않는 이메일에 NotFoundError를 던진다')
│   └── it('viewer는 멤버를 추가할 수 없다 (ForbiddenError)')
├── describe('removeMember')
│   ├── it('admin이 member를 제거할 수 있다')
│   ├── it('owner는 제거할 수 없다')
│   └── it('member가 다른 member를 제거할 수 없다')
├── describe('changeRole')
│   ├── it('owner가 member를 admin으로 변경할 수 있다')
│   └── it('admin이 owner 역할을 부여할 수 없다')
└── describe('checkPermission')
    ├── it('owner는 모든 동작에 true를 반환한다')
    ├── it('admin은 설정 변경에 true를 반환한다')
    ├── it('member는 프로젝트 생성에 true를 반환한다')
    ├── it('viewer는 프로젝트 조회에만 true를 반환한다')
    └── it('비멤버에 false를 반환한다')
```
예상 테스트 수: **16개**

#### `src/services/analyticsService.test.ts` — 신규 (S11-4)
```
describe('AnalyticsService')
├── describe('getOverview')
│   ├── it('기간 내 생성 건수를 집계한다')
│   ├── it('성공률을 올바르게 계산한다')
│   ├── it('프로바이더별 분포를 반환한다')
│   ├── it('일별 추이 데이터를 반환한다')
│   └── it('데이터 없는 기간에 0을 반환한다')
├── describe('getTopApis')
│   ├── it('사용 빈도 순으로 API 목록을 반환한다')
│   └── it('최대 N개만 반환한다')
└── describe('getTokenUsage')
    ├── it('프로바이더별 토큰 합계를 반환한다')
    └── it('입력/출력 토큰을 분리하여 집계한다')
```
예상 테스트 수: **9개**

#### `src/services/projectService.test.ts` — 추가 케이스 (S11-2)
```
describe('ProjectService — 조직 프로젝트')
├── it('organizationId를 포함하여 프로젝트를 생성한다')
├── it('조직 비멤버의 프로젝트 생성을 거부한다')
├── it('viewer의 조직 프로젝트 생성을 거부한다')
└── it('조직 프로젝트 삭제 시 member 역할을 확인한다')
```
예상 테스트 수: **4개**

### 통합 테스트 (Integration Tests)

#### `src/__tests__/api/organizations.test.ts` — 신규
```
describe('조직 API')
├── describe('POST /api/v1/organizations')
│   ├── it('조직을 생성하고 201을 반환한다')
│   ├── it('중복 slug에 409를 반환한다')
│   └── it('미인증 시 401을 반환한다')
├── describe('GET /api/v1/organizations')
│   ├── it('내가 속한 조직 목록을 반환한다')
│   └── it('미소속 조직은 포함하지 않는다')
├── describe('PATCH /api/v1/organizations/:orgId')
│   ├── it('admin이 조직 정보를 수정한다')
│   └── it('member가 수정 시 403을 반환한다')
└── describe('DELETE /api/v1/organizations/:orgId')
    ├── it('owner가 조직을 삭제한다')
    └── it('admin이 삭제 시 403을 반환한다')
```
예상 테스트 수: **9개**

#### `src/__tests__/api/members.test.ts` — 신규
```
describe('멤버 관리 API')
├── describe('POST /api/v1/organizations/:orgId/members')
│   ├── it('admin이 멤버를 초대한다')
│   ├── it('member가 초대 시 403을 반환한다')
│   └── it('이미 멤버인 사용자 초대 시 409를 반환한다')
├── describe('DELETE /api/v1/organizations/:orgId/members/:memberId')
│   ├── it('admin이 member를 제거한다')
│   └── it('owner 제거 시 400을 반환한다')
└── describe('PATCH /api/v1/organizations/:orgId/members/:memberId')
    ├── it('owner가 역할을 변경한다')
    └── it('admin→owner 변경 시 400을 반환한다')
```
예상 테스트 수: **7개**

#### `src/__tests__/api/analytics.test.ts` — 신규
```
describe('GET /api/v1/analytics')
├── it('7일 기간 분석 데이터를 반환한다')
├── it('30일 기간 분석 데이터를 반환한다')
├── it('period 파라미터 없으면 7일 기본값을 사용한다')
├── it('미인증 시 401을 반환한다')
└── it('응답에 generation, tokens, projects, apis 섹션을 포함한다')
```
예상 테스트 수: **5개**

### 코드 품질 검토 체크리스트

#### 정적 분석
- [ ] `pnpm lint` — 경고/에러 0건
- [ ] `pnpm type-check` — 컴파일 에러 0건
- [ ] `pnpm format:check` — 포맷 위반 0건

#### 코드 리뷰 포인트
- [ ] 조직 삭제 시 CASCADE로 모든 관련 데이터(멤버십, 프로젝트)가 정리되는가
- [ ] owner 양도 없이 owner가 탈퇴하면 어떻게 되는가 (방지 로직 확인)
- [ ] 분석 쿼리에 인덱스가 활용되는가 (EXPLAIN 확인)
- [ ] 분석 API 응답 시간이 2초 이내인가 (대용량 데이터 대비)
- [ ] RLS 정책이 조직 간 데이터 격리를 보장하는가
- [ ] 역할 변경 시 기존 세션이 즉시 반영되는가

#### 보안
- [ ] 멤버 초대 시 이메일 열거 공격(enumeration attack)에 안전한가
- [ ] 조직 설정 API에 admin/owner만 접근 가능한가
- [ ] 분석 API가 타인의 데이터를 노출하지 않는가
- [ ] 멤버 목록에 민감 정보(이메일 전체)가 노출되지 않는가

#### 테스트 커버리지 목표
- [ ] 신규 코드 라인 커버리지 **85% 이상**
- [ ] 신규 테스트 **50개 이상** 추가 (누적 247개 → 297개)

---

## S11 완료 조건 종합

- [ ] 조직 생성/관리/멤버 초대 동작
- [ ] 조직 프로젝트 공유 + 역할별 접근 제어
- [ ] 분석 대시보드에서 주요 지표 확인
- [ ] 빌드 통과, 기존 기능 회귀 없음
