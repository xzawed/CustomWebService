# 외부 서비스 무료 한도 관리 (Free Tier Limit Management)

> 모든 인프라를 무료로 운영하기 위한 한도 관리 전략
> 한도 초과 시 서비스 장애로 직결되므로 사전 관리가 핵심

---

## 1. 서비스별 무료 한도 상세

### 1.1 Railway (플랫폼 호스팅)

| 항목 | 무료 한도 | 주의사항 |
|------|-----------|---------|
| 크레딧 | $5 / 월 | 실행 시간 + 리소스 사용량 기준 |
| 실행 시간 | 500시간 / 월 | Trial 플랜 기준 |
| 메모리 | 512 MB | 기본 서비스 크기 |
| 프로젝트 수 | 무제한 | 크레딧 한도 내 |
| 팀 멤버 | 1명 (Trial) | 개인 계정만 |

**위험 시나리오:**
- 월 $5 크레딧 소진 시 서비스 중단
- 실행 시간 500시간 초과 시 서비스 중단

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

---

### 1.2 Supabase (데이터베이스)

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

---

### 1.3 xAI Grok API (AI 코드 생성)

| 항목 | 무료 한도 (Grok) | 주의사항 |
|------|------------------|---------|
| 크레딧 | 무료 크레딧 제공 | 가입 시 제공되는 크레딧 기반 |
| RPM (분당 요청) | API 플랜에 따라 상이 | 동시 사용자 제한 |
| 모델 | grok-3-mini | 코드 생성에 최적화 |

**위험 시나리오:**
- 무료 크레딧 소진 시 생성 불가
- 동시 요청 과다 시 429 에러

**대응 방안:**
```
요청 관리:
├── 사용자당 일일 10회 생성 제한
├── 생성 요청 큐잉 (동시 요청 제한)
├── 429 에러 시 자동 재시도 (exponential backoff)
└── 유사 요청 캐싱 (동일 API+유사 컨텍스트)

폴백 전략:
├── 한도 초과 시 "잠시 후 다시 시도" 안내 + 예상 대기 시간
├── grok-3-mini 모델 우선 사용 (비용 절감)
└── Ollama 로컬 LLM 폴백 (서버 구축 시)

일일 한도 분배:
├── 사용자 생성: 크레딧 80% 배분
├── 재생성: 크레딧 15% 배분
└── 시스템 예비: 크레딧 5% 배분
```

---

### 1.4 GitHub (소스 코드 + 생성 서비스 저장소)

| 항목 | 무료 한도 | 주의사항 |
|------|-----------|---------|
| 저장소 수 | 무제한 | |
| Actions 시간 | 2,000분 / 월 | CI/CD 파이프라인 |
| Packages Storage | 500 MB | 미사용 |
| API 요청 | 5,000 / 시간 (인증) | 서비스 배포 시 소비 |

**위험 시나리오:**
- 생성 서비스 배포마다 API 호출 3~5회 → 시간당 1,000~1,600건 배포 가능
- Actions 2,000분 = 약 33시간 빌드

**대응 방안:**
```
API 호출 관리:
├── 배포 API 호출 최소화 (batch 처리)
├── Rate limit 헤더 모니터링
└── 429 시 대기 후 재시도

Actions 시간 관리:
├── CI 최적화 (캐싱, 불필요한 단계 제거)
├── PR마다 전체 빌드 대신 변경분만 검사
└── 월간 사용량 추적
```

---

### 1.5 기타 서비스

| 서비스 | 무료 한도 | 예상 사용량 | 여유도 |
|--------|-----------|------------|--------|
| Sentry | 5,000 이벤트 / 월 | ~500 | ✅ 충분 |
| UptimeRobot | 50 모니터 | ~10 | ✅ 충분 |
| Resend | 100 이메일 / 일, 3,000 / 월 | ~10/일 | ✅ 충분 |

---

## 2. 한도 모니터링 대시보드

### 2.1 주간 모니터링 체크리스트

매주 월요일에 확인:

| # | 확인 항목 | 확인 위치 | 확인 |
|---|-----------|-----------|------|
| 1 | Railway 크레딧 사용률 | Railway Dashboard → Usage | ☐ |
| 2 | Railway 프로젝트 수 | Railway Dashboard → Projects | ☐ |
| 3 | Railway 실행 시간 사용률 | Railway Dashboard → Usage | ☐ |
| 4 | Supabase DB 용량 | Supabase Dashboard → Database → Size | ☐ |
| 5 | Supabase 대역폭 | Supabase Dashboard → Usage | ☐ |
| 6 | GitHub Actions 사용 시간 | GitHub → Settings → Billing → Actions | ☐ |
| 7 | xAI Grok API 사용량 | console.x.ai → API Keys → Usage | ☐ |
| 8 | Sentry 이벤트 수 | Sentry Dashboard → Stats | ☐ |

### 2.2 자동 알림 설정

```typescript
// src/lib/monitoring/limitChecker.ts
// 주기적으로 실행하여 한도 확인 (Railway Cron 또는 UptimeRobot)

interface LimitStatus {
  service: string;
  metric: string;
  current: number;
  limit: number;
  percentage: number;
  alert: boolean;  // 80% 이상 시 true
}

// 확인 항목
const checks = [
  { service: 'supabase', metric: 'db_size_mb', limit: 500, alertAt: 0.8 },
  { service: 'grok', metric: 'daily_requests', limit: 1500, alertAt: 0.8 },
  { service: 'projects', metric: 'total_count', limit: 200, alertAt: 0.7 },
];
```

### 2.3 `/api/v1/health` 엔드포인트

```typescript
// 서비스 상태 + 한도 상태 확인용
// UptimeRobot에서 5분마다 호출 → Supabase 일시정지 방지 겸용

// GET /api/v1/health
// Response:
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

## 3. 한도 초과 시 긴급 대응 매뉴얼

### 3.1 Railway 크레딧 초과
```
증상: 사이트 접근 불가 (서비스 중단)
긴급 대응:
1. Railway Dashboard에서 크레딧 사용량 확인
2. 다음 달 1일 크레딧 초기화까지 대기
   또는
3. 정적 페이지를 GitHub Pages로 임시 전환
4. 이미지/정적 파일 CDN으로 분리 검토
```

### 3.2 Supabase 용량 초과
```
증상: DB 쓰기 실패, 서비스 생성 불가
긴급 대응:
1. 오래된 generated_codes 삭제
   DELETE FROM generated_codes WHERE created_at < NOW() - INTERVAL '90 days';
2. 비활성 프로젝트 정리
3. 용량 재확인
```

### 3.3 xAI Grok API 한도 초과
```
증상: 코드 생성 요청 시 429 에러
긴급 대응:
1. RPM 초과: 1분 대기 후 자동 재시도
2. 크레딧 초과: "생성 한도에 도달했습니다" 안내
3. 대체 모델 사용 (grok-3-mini 우선, 또는 다른 무료 API)
4. 크레딧 충전 또는 초기화 대기
```

### 3.4 Supabase 일시정지
```
증상: 모든 DB 연동 기능 실패
긴급 대응:
1. Supabase Dashboard → 프로젝트 → "Restore" 클릭 (수 분 소요)
2. UptimeRobot Health Check가 정상 설정되었는지 확인
3. 재발 방지: /api/v1/health 엔드포인트 호출 주기 확인
```

---

## 4. 비용 발생 방지 안전장치

### 4.1 Railway
- Trial(무료) 플랜은 $5 크레딧 초과 시 서비스 중단
- ⚠️ 유료 플랜으로 업그레이드 하지 않도록 주의
- 결제 수단 등록 시 요금 발생 가능 → 주의

### 4.2 Supabase
- Free 플랜은 자동 과금 없음
- ⚠️ "Upgrade" 버튼 클릭 주의
- 결제 수단 등록하지 않음

### 4.3 xAI Grok API
- 무료 크레딧은 과금 없음
- ⚠️ 유료 플랜 전환 시 과금 발생 주의
- console.x.ai에서 사용량 주기적 확인

### 4.4 GitHub
- Free 플랜에서 Actions 초과 시 자동 중단 (과금 없음)
- ⚠️ Billing settings에서 Spending limit: $0 확인

---

## 5. 사용량 예측 시뮬레이션

### 시나리오: 100명 DAU (Daily Active Users)

| 항목 | 계산 | 일일 | 월간 | 한도 | 여유 |
|------|------|------|------|------|------|
| 페이지 조회 | 100명 × 10페이지 × 500KB | 500MB | 15GB | $5 크레딧 | ✅ |
| DB 읽기 | 100명 × 20쿼리 × 2KB | 4MB | 120MB | 5GB | ✅ |
| 코드 생성 | 100명 × 2회 | 200회 | 6,000회 | 45,000회 | ✅ |
| xAI Grok API | 200회 | 200RPD | - | 크레딧 기반 | ✅ |
| DB 쓰기 | 200회 × 20KB(코드) | 4MB | 120MB | 500MB | ⚠️ |
| 배포 | 100회 | 100회 | 3,000프로젝트 | 크레딧 기반 | ⚠️ |

### 병목 지점
1. **Supabase DB 용량** (500MB): 약 4개월 후 한도 도달 → 정리 정책 필수
2. **Railway 크레딧** ($5/월): 사용량에 따라 한도 도달 → 비활성 정리 필수
3. **xAI Grok API**: 동시 요청 과다 시 병목 → 큐잉 필수
