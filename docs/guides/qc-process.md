# QC 표준 프로세스

> 모든 코드 생성, 재생성, 수정, 개선 작업에 동일하게 적용되는 품질 검증 표준.

## 프로세스 요약

```
생성/수정 → 보안 검증 → 코드 품질 평가 → 렌더링 QC → 이슈 발견 시 수정 계획 → 재생성 → 재검증 → 저장 → Deep QC → 배포 경고
```

---

## 1. 표준 QC 파이프라인

모든 코드 변경(생성, 재생성, 수정)은 아래 단계를 **동일하게** 거친다.

### Step 1: 보안 검증 (차단)

| 체크 | 결과 | 동작 |
|------|------|------|
| eval() 사용 | 에러 | **즉시 차단** |
| 하드코딩된 API 키 | 에러 | **즉시 차단** |
| innerHTML 할당 | 경고 | 기록 후 진행 |
| document.write() | 경고 | 기록 후 진행 |

**담당**: `codeValidator.validateAll()` → `validateSecurity()`  
**파일**: `src/lib/ai/codeValidator.ts`

### Step 2: 코드 품질 평가 (점수)

16개 정적 체크로 0-100 점수 산출:

| 영역 | 체크 항목 |
|------|----------|
| 구조 | 시맨틱 HTML, 푸터, 그리드/플렉스 레이아웃 |
| API 바인딩 | fetch 호출 존재(+1), JSON 파싱(+1), placeholder 없음(+1) |
| 반응형 | 반응형 클래스 존재, 밀도 8개+, 모바일 네비게이션 패턴 |
| 안전성 | 위험한 고정 너비 없음, 이미지 오버플로우 보호 |
| 품질 | 이미지 alt, 트랜지션/애니메이션, 한국어 텍스트 |

**주요 메트릭**: `fetchCallCount`, `hasProxyCall`, `hasJsonParse`, `placeholderCount`  
**결과**: `structuralScore` (0-100), `mobileScore` (0-100)  
**담당**: `codeValidator.evaluateQuality()`

### Step 3: 렌더링 QC — Fast (인라인, 3초)

Playwright headless Chromium으로 실제 렌더링 검증:

| 체크 | 뷰포트 | 통과 기준 |
|------|--------|----------|
| JS 콘솔 에러 | 375px | 에러 0개 |
| 가로 스크롤 | 375px | scrollWidth ≤ clientWidth |
| 푸터 가시성 | 375px | `<footer>` 존재 + visible |
| 레이아웃 겹침 | 375px | header/main/footer 비겹침 |
| **placeholder 없음** | 375px | DOM 텍스트에 placeholder 문자열 미존재 |

**통과 기준**: overallScore ≥ 60  
**타임아웃**: 3초 (초과 시 경고 후 진행)  
**환경변수**: `ENABLE_RENDERING_QC=true`  
**담당**: `renderingQc.runFastQc()`

### Step 4: 이슈 판단 → 자동 재생성 (최대 3회)

아래 조건 중 하나라도 해당하면 자동 재생성:

| 조건 | 임계값 |
|------|--------|
| fetch 호출 없음 | fetchCallCount === 0 |
| placeholder 존재 | placeholderCount > 0 |
| 구조 점수 미달 | structuralScore < 60 |
| 모바일 점수 미달 | mobileScore < 60 |
| JS 콘솔 에러 감지 | consoleErrors.passed === false |
| 가로 스크롤 감지 | horizontalScroll.passed === false |
| 푸터 미존재 | footerVisible.passed === false |
| 레이아웃 겹침 | noLayoutOverlap.passed === false |

**수정 프롬프트에 포함되는 정보**:
- 코드 레벨 이슈 목록 (details)
- 렌더링 QC 실패 항목 (QcReport.checks)
- 24개 구체적 수정 지침

**담당**: `qualityLoop.shouldRetryGeneration()`, `buildQualityImprovementPrompt()`

### Step 5: 재생성 코드 재검증

재생성된 코드에 대해 **Step 2 + Step 3을 다시 실행**:
- `evaluateQuality()` 재실행
- `runFastQc()` 재실행
- 코드 점수 OR QC 점수가 개선되면 채택, 아니면 원본 유지

### Step 6: 저장

최선 버전을 DB에 저장. 메타데이터에 포함:
- 14개 품질 메트릭
- Fast QC 결과 (score, passed, checks)
- 카테고리/테마/레이아웃 추론
- qualityLoopUsed 플래그

### Step 7: 렌더링 QC — Deep (비동기, 10초)

저장 후 비동기로 심층 검증 실행:

| 체크 | 뷰포트 | 통과 기준 |
|------|--------|----------|
| Fast QC 5개 | 375px | 위와 동일 (placeholder 체크 포함) |
| 이미지 로딩 | 전체 | 모든 `<img>` naturalWidth > 0 |
| 터치 타겟 | 전체 | 버튼/링크 44px 이상 |
| 반응형 브레이크포인트 | 375/768/1280 | 가로 스크롤 없음 |
| 접근성 | 전체 | h1 존재, 제목 순서, main 존재 |
| **인터랙티브 동작** | 전체 | 버튼 클릭 → DOM 변화 감지 |
| **네트워크 활동** | 전체 | 외부 API 요청 1건 이상 캡처 |
| **로딩 상태 해소** | 전체 | 로딩 스켈레톤이 3초 이내 사라짐 |

**결과**: DB 메타데이터 업데이트 (Fast QC 결과를 덮어씀)  
**통과 기준**: overallScore ≥ 50

### Step 8: 사용자 알림

- **SSE complete 이벤트**: Fast QC 결과 포함 (score, passed, 실패 항목)
- **게시 시**: QC 미통과 경고를 API 응답에 포함

---

## 2. 적용 범위

| 작업 유형 | Step 1 | Step 2 | Step 3 | Step 4 | Step 5 | Step 6 | Step 7 | Step 8 |
|----------|--------|--------|--------|--------|--------|--------|--------|--------|
| **신규 생성** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **재생성** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **게시** | — | — | — | — | — | — | — | ✅ 경고 |

---

## 3. 임계값 설정

| 항목 | 값 | 환경변수 | 설명 |
|------|-----|---------|------|
| 구조 품질 임계값 | 60 | — | structuralScore 미달 시 재생성 |
| 모바일 품질 임계값 | 60 | — | mobileScore 미달 시 재생성 |
| Fast QC 통과 | 60 | — | 4개 체크 평균 60점 이상 |
| Deep QC 통과 | 50 | — | 8개 체크 평균 50점 이상 (Fast QC 실패 시에만 실행) |
| Fast QC 타임아웃 | 3초 | — | 초과 시 null 반환, 진행 |
| Deep QC 타임아웃 | 10초 | — | 초과 시 null 반환, 진행 |
| 렌더링 QC 활성화 | **true** | `ENABLE_RENDERING_QC` | Railway에서 활성화됨 (2026-04-15) |
| 최대 재생성 횟수 | 3회 | — | 품질 루프 최대 3회 |

---

## 4. 파일 참조

| 역할 | 파일 |
|------|------|
| 보안/품질 검증 | `src/lib/ai/codeValidator.ts` |
| 품질 루프/재시도 | `src/lib/ai/qualityLoop.ts` |
| 브라우저 풀 | `src/lib/qc/browserPool.ts` |
| 체크 함수 8개 | `src/lib/qc/qcChecks.ts` |
| Fast/Deep QC 오케스트레이터 | `src/lib/qc/renderingQc.ts` |
| 생성 파이프라인 | `src/app/api/v1/generate/route.ts` |
| 재생성 파이프라인 | `src/app/api/v1/generate/regenerate/route.ts` |
| 게시 라우트 | `src/app/api/v1/projects/[id]/publish/route.ts` |
| QC 타입 | `src/types/qc.ts` |
| 메타데이터 타입 | `src/types/project.ts` (CodeMetadata) |

---

## 5. Railway에서 렌더링 QC 활성화 방법

현재 `ENABLE_RENDERING_QC=false` (기본값). Railway에서 활성화하려면:

**1. Dockerfile 수정** — Playwright Chromium 의존성 설치:

```dockerfile
# Stage 3: Production runner — node:20-alpine → node:20-slim으로 변경 후 추가
FROM node:20-slim AS runner
RUN apt-get update && apt-get install -y \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2 \
    && rm -rf /var/lib/apt/lists/*
# ... 이후 기존 Dockerfile 내용 동일
```

**2. Chromium 설치** — 빌더 스테이지에서 실행:
```dockerfile
RUN npx playwright install chromium --with-deps
```

**3. Railway 메모리 확인** — Chromium 실행 시 인스턴스당 ~300MB 추가 필요. 현재 Railway 무료 티어(512MB) 에서는 **메모리 부족 우려**. 유료 플랜($5/월 이상) 전환 후 활성화 권장.

**4. 환경변수 설정**: Railway Dashboard → Variables → `ENABLE_RENDERING_QC=true`

---

## 6. 변경 이력

| 날짜 | 변경 |
|------|------|
| 2026-04-04 | 초안 작성 — Phase 1(코드 레벨) + Phase 2(렌더링 QC) + 격차 해소 |
| 2026-04-05 | 임계값 40→60, 재시도 최대 2회, Deep QC 조건부 실행, 푸터/레이아웃 체크 추가 |
| 2026-04-12 | Railway 활성화 가이드 추가 (Dockerfile 수정 방법, 메모리 요구사항) |
| 2026-04-14 | 품질 대개편: API 바인딩 메트릭 추가(fetchCallCount/hasProxyCall/hasJsonParse/placeholderCount), Fast QC +1 체크(placeholder), Deep QC +3 체크(인터랙티브/네트워크/로딩), 최대 재생성 2→3회 |
| 2026-04-15 | 버그 수정: "Stage" → "Step" 용어 통일 (생성 파이프라인의 Stage 1/2/3과 혼동 방지), ENABLE_RENDERING_QC Railway 활성화 |
