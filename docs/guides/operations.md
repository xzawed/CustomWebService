# 운영 가이드

> **최종 업데이트:** 2026-04-12

---

## 1. 모니터링

### 모니터링 항목

| 항목 | 도구 | 주기 |
|------|------|------|
| 사이트 가동 여부 | UptimeRobot | 5분 |
| 에러 추적 | Sentry | 실시간 |
| API 응답 시간 | Railway Observability | 실시간 |
| DB 사용량 | Supabase Dashboard | 일간 |
| 무료 한도 사용률 | 수동 확인 | 주간 |

### 알림 설정

| 이벤트 | 알림 채널 | 대상 |
|--------|-----------|------|
| 사이트 다운 | Email | 운영자 |
| 에러 급증 | Sentry Email | 운영자 |
| 무료 한도 80% 도달 | Email | 운영자 |
| 생성 서비스 장애 | 대시보드 표시 | 사용자 |

### 주간 모니터링 체크리스트

매주 월요일에 확인:

| # | 확인 항목 | 확인 위치 |
|---|-----------|-----------|
| 1 | Railway 크레딧 사용률 | Railway Dashboard → Usage |
| 2 | Railway 프로젝트 수 | Railway Dashboard → Projects |
| 3 | Railway 실행 시간 사용률 | Railway Dashboard → Usage |
| 4 | Supabase DB 용량 | Supabase Dashboard → Database → Size |
| 5 | Supabase 대역폭 | Supabase Dashboard → Usage |
| 6 | GitHub Actions 사용 시간 | GitHub → Settings → Billing → Actions |
| 7 | Claude API 사용량 | Anthropic Console → Usage |
| 8 | Sentry 이벤트 수 | Sentry Dashboard → Stats |

### `/api/v1/health` 엔드포인트

UptimeRobot에서 5분마다 호출 → Supabase 일시정지 방지 겸용:

```json
{
  "status": "healthy",
  "timestamp": "2026-03-20T12:00:00Z",
  "checks": {
    "database": "ok",
    "ai_api": "ok",
    "deployment": "ok"
  },
  "limits": {
    "db_usage_mb": 45,
    "db_limit_mb": 500,
    "daily_generations": 23,
    "daily_generation_limit": 1500,
    "active_projects": 87,
    "project_limit": 200
  }
}
```

---

## 2. 트러블슈팅

### 사이트 접속 불가

1. Railway Dashboard → Deployments 탭에서 최신 배포 상태 확인
2. "Active" (초록색)이 아니면 이전 배포로 롤백 (Rollback 버튼)
3. Cloudflare DNS가 Railway URL을 정상 가리키는지 확인

### 로그인 후 대시보드로 이동하지 않음

Supabase Dashboard → Authentication → URL Configuration에서 Redirect URLs 확인:
- `https://xzawed.xyz/callback` 이 목록에 있어야 함

### 카탈로그에 API가 15개만 보임

seed.sql을 아직 실행하지 않은 것. Supabase SQL Editor에서 `supabase/seed.sql`을 실행하세요.

### DB 연동 기능 전체 실패 (Supabase 일시정지)

```
증상: 모든 DB 연동 기능 실패
긴급 대응:
1. Supabase Dashboard → 프로젝트 → "Restore" 클릭 (수 분 소요)
2. UptimeRobot Health Check가 정상 설정되었는지 확인
3. 재발 방지: /api/v1/health 엔드포인트 호출 주기 확인
```

> Supabase Free 플랜은 7일간 비활성 시 자동 일시정지됩니다.  
> UptimeRobot에서 `/api/v1/health`를 5분마다 호출하여 방지합니다.

### DNS 변경 후 사이트가 안 열림

1. 5~10분 기다린 후 다시 시도
2. 브라우저 캐시 지우기 (Ctrl+Shift+Delete)
3. 시크릿 모드로 시도
4. 24시간이 지나도 안 되면 DNS 설정 재확인

### 서브도메인(`slug.xzawed.xyz`) 404 에러

- Cloudflare에 `*` 와일드카드 CNAME 레코드가 있는지 확인
- Railway에 `*.xzawed.xyz` 커스텀 도메인이 추가되어 있는지 확인
- `NEXT_PUBLIC_ROOT_DOMAIN=xzawed.xyz` 환경변수가 설정되어 있는지 확인

---

## 3. 무료 티어 한도 관리

### 서비스별 무료 한도 상세

#### Railway (플랫폼 호스팅)

| 항목 | 무료 한도 | 주의사항 |
|------|-----------|---------|
| 크레딧 | $5 / 월 | 실행 시간 + 리소스 사용량 기준 |
| 실행 시간 | 500시간 / 월 | Trial 플랜 기준 |
| 메모리 | 512 MB | 기본 서비스 크기 |
| 프로젝트 수 | 무제한 | 크레딧 한도 내 |
| 팀 멤버 | 1명 (Trial) | 개인 계정만 |

**위험 시나리오:** 월 $5 크레딧 소진 시 서비스 중단

**대응 방안:**
```
크레딧 관리:
├── 비활성 서비스 자동 정리 (90일 미사용)
├── 사용자당 최대 서비스 5개 제한
└── 한도 도달 시 GitHub Pages로 대체 배포

리소스 관리:
├── 코드 생성 로직 최적화 (프롬프트 간결화)
├── 생성 결과 캐싱 (유사 요청 재사용)
└── 비피크 시간대 생성 유도
```

#### Supabase (데이터베이스)

| 항목 | 무료 한도 | 주의사항 |
|------|-----------|---------|
| 데이터베이스 | 500 MB | generated_codes 테이블이 주 소비 |
| 대역폭 | 5 GB / 월 | API 호출 빈도에 비례 |
| Storage | 1 GB | 현재 미사용 예정 |
| Edge Functions | 500,000 호출 / 월 | 현재 미사용 예정 |
| Auth MAU | 50,000 | 충분 |
| Realtime | 200 동시 접속 | 충분 |
| 일시정지 | 7일 비활성 시 자동 일시정지 | **주의: 주기적 활성화 필요** |

**위험 시나리오:**
- `generated_codes` 테이블의 코드 데이터가 500MB를 초과
- 7일간 사용자가 없으면 DB 자동 일시정지

**대응 방안:**
```
DB 용량 관리:
├── generated_codes: 프로젝트당 최신 3버전만 보관
├── 90일 이상 미사용 프로젝트의 코드 자동 삭제
├── 코드 데이터 압축 저장 (gzip)
└── 월간 용량 모니터링 쿼리 실행

일시정지 방지:
├── UptimeRobot으로 5분마다 Health Check 호출
└── /api/v1/health 엔드포인트 구현 (DB 조회 포함)
```

**용량 모니터링 쿼리:**
```sql
-- 테이블별 용량 확인
SELECT
  schemaname || '.' || tablename AS table_name,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS total_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname || '.' || tablename) DESC;

-- generated_codes 테이블 행 수 및 평균 크기
SELECT
  COUNT(*) AS total_rows,
  pg_size_pretty(AVG(LENGTH(code_html) + LENGTH(code_css) + LENGTH(code_js))::bigint) AS avg_code_size,
  pg_size_pretty(pg_total_relation_size('generated_codes')) AS total_table_size
FROM generated_codes;
```

#### Claude API (AI 코드 생성)

| 항목 | 주의사항 |
|------|---------|
| 크레딧 | 사용량 기반 과금 — 크레딧 소진 시 생성 불가 |
| RPM (분당 요청) | API 플랜에 따라 상이 — 동시 사용자 제한 |

**대응 방안:**
```
요청 관리:
├── 사용자당 일일 10회 생성 제한
├── 생성 요청 큐잉 (동시 요청 제한)
├── 429 에러 시 자동 재시도 (exponential backoff)
└── 유사 요청 캐싱 (동일 API+유사 컨텍스트)

폴백 전략:
├── 한도 초과 시 "잠시 후 다시 시도" 안내 + 예상 대기 시간
└── 재시도 로직 (지수 백오프, 최대 3회)
```

#### GitHub

| 항목 | 무료 한도 | 주의사항 |
|------|-----------|---------|
| 저장소 수 | 무제한 | |
| Actions 시간 | 2,000분 / 월 | CI/CD 파이프라인 |
| API 요청 | 5,000 / 시간 (인증) | 서비스 배포 시 소비 |

#### 기타 서비스

| 서비스 | 무료 한도 | 예상 사용량 | 여유도 |
|--------|-----------|------------|--------|
| Sentry | 5,000 이벤트 / 월 | ~500 | ✅ 충분 |
| UptimeRobot | 50 모니터 | ~10 | ✅ 충분 |
| Resend | 100 이메일 / 일, 3,000 / 월 | ~10/일 | ✅ 충분 |

### 한도 초과 시 긴급 대응 매뉴얼

#### Railway 크레딧 초과
```
증상: 사이트 접근 불가 (서비스 중단)
긴급 대응:
1. Railway Dashboard에서 크레딧 사용량 확인
2. 다음 달 1일 크레딧 초기화까지 대기
   또는
3. 정적 페이지를 GitHub Pages로 임시 전환
4. 이미지/정적 파일 CDN으로 분리 검토
```

#### Supabase 용량 초과
```
증상: DB 쓰기 실패, 서비스 생성 불가
긴급 대응:
1. 오래된 generated_codes 삭제
   DELETE FROM generated_codes WHERE created_at < NOW() - INTERVAL '90 days';
2. 비활성 프로젝트 정리
3. 용량 재확인
```

#### Claude API 한도 초과
```
증상: 코드 생성 요청 시 429 에러
긴급 대응:
1. RPM 초과: 1분 대기 후 자동 재시도
2. 크레딧 초과: "생성 한도에 도달했습니다" 안내
3. Anthropic Console에서 사용량 확인 및 크레딧 충전
```

### 비용 발생 방지 안전장치

| 서비스 | 주의사항 |
|--------|---------|
| **Railway** | Trial(무료) 플랜 — ⚠️ 유료 플랜으로 업그레이드하지 않도록 주의 |
| **Supabase** | Free 플랜은 자동 과금 없음 — ⚠️ "Upgrade" 버튼 클릭 주의 |
| **Claude API** | 사용량 기반 — Anthropic Console에서 사용량 주기적 확인 |
| **GitHub** | Free 플랜 Actions 초과 시 자동 중단 — ⚠️ Spending limit: $0 확인 |

### 사용량 예측 (100명 DAU 기준)

| 항목 | 일일 | 월간 | 한도 | 여유 |
|------|------|------|------|------|
| DB 읽기 (100명 × 20쿼리 × 2KB) | 4MB | 120MB | 5GB | ✅ |
| 코드 생성 (100명 × 2회) | 200회 | 6,000회 | API 플랜 기준 | ✅ |
| DB 쓰기 (200회 × 20KB) | 4MB | 120MB | 500MB | ⚠️ |
| 배포 | 100회 | 3,000프로젝트 | 크레딧 기반 | ⚠️ |

**병목 지점:**
1. **Supabase DB 용량** (500MB): 약 4개월 후 한도 도달 → 정리 정책 필수
2. **Railway 크레딧** ($5/월): 사용량에 따라 한도 도달 → 비활성 정리 필수
3. **Claude API**: 동시 요청 과다 시 병목 → 큐잉 필수

---

## 4. 관리자 API

```bash
# QC 통계 조회
GET /api/v1/admin/qc-stats
Authorization: Bearer ${ADMIN_API_KEY}

# 수동 QC 트리거
POST /api/v1/admin/qc-trigger
Authorization: Bearer ${ADMIN_API_KEY}
```
