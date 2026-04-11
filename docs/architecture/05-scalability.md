# 확장성 설계 및 로드맵

> 최초 작성: 2026-03-23 (확장성 검토 보고서) / 2026-03-26 (확장성 분석 및 로드맵)
> 통합 정리: 2026-04-11

---

## 1. 현황 요약 — 이슈 식별 및 해결 상태

전체 코드베이스를 확장성/확장 용이성 관점에서 검토한 결과, **심각 7건, 보통 12건, 낮음 3건** 총 22건의 개선 필요 사항이 식별되었습니다.

> **2026-03-23 기준**: 심각(HIGH) 7건 전부, 보통(MEDIUM) 10건이 구현 완료되었습니다.

### 1.1 심각 (HIGH) — Sprint 1~2에서 반드시 반영

| # | 영역 | 이슈 | 구현 상태 |
|---|------|------|----------|
| H1 | 아키텍처 | **추상화 레이어 부재** (Repository, Service 패턴 없음) | ✅ `repositories/`, `services/` 구현 완료 |
| H2 | AI 엔진 | **AI Provider 추상화 없음** (Grok 하드코딩) | ✅ `IAiProvider`, `GrokProvider`, `AiProviderFactory` 구현 |
| H3 | 배포 | **배포 대상 추상화 없음** (Railway/Netlify 하드코딩) | ✅ `IDeployProvider`, `RailwayDeployer`, `GithubPagesDeployer`, `DeployProviderFactory` 구현 |
| H4 | API 설계 | **API 버저닝 없음** (`/api/catalog`에 버전 없음) | ✅ `/api/v1/` 경로 적용 |
| H5 | DB 스키마 | **멀티 테넌시 미지원** (팀/조직 개념 없음) | ✅ `organizations`, `memberships` 테이블 구현 |
| H6 | 상태 관리 | **God Store 문제** (builderStore에 모든 상태) | ✅ 5개 분리 스토어로 분해 |
| H7 | 설정 | **비즈니스 규칙 하드코딩** (API 5개, 생성 10회 등) | ✅ `features.ts`, `featureFlags.ts` 적용 |

### 1.2 보통 (MEDIUM) — 해당 스프린트에서 반영

| # | 영역 | 이슈 | 구현 상태 |
|---|------|------|----------|
| M1 | DB | generated_codes 메타데이터 부재 | ✅ 구현 완료 |
| M2 | DB | API 버전 관리 미지원 | ✅ 구현 완료 |
| M3 | 빌더 | 3단계 위자드 하드코딩 (동적 스텝 불가) | ✅ `StepRegistry.ts` 구현 |
| M4 | 컴포넌트 | UI-비즈니스 로직 강결합 | 미완료 |
| M5 | 국제화 | i18n 인프라 없음 | ✅ `lib/i18n/` 구현 |
| M6 | 템플릿 | 코드 생성 템플릿 시스템 없음 (문자열만) | ✅ 3개 템플릿 구현 |
| M7 | AI | 요청별 모델 선택 불가 | 미완료 |
| M8 | 이벤트 | 이벤트/훅 시스템 없음 | ✅ `eventBus.ts` 구현 |
| M9 | 피처플래그 | 기능 토글 시스템 없음 | ✅ `featureFlags.ts` 구현 |
| M10 | 배포 | 롤백 기능 없음 | ✅ `/api/v1/projects/[id]/rollback` 구현 |
| M11 | 캐싱 | 캐싱 전략 없음 | 미완료 |
| M12 | API | 커서 기반 페이지네이션 미지원 | 미완료 |

### 1.3 낮음 (LOW)

| # | 영역 | 이슈 | 구현 상태 |
|---|------|------|----------|
| L1 | 구조 | 모노레포 전환 준비 없음 | 미완료 |
| L2 | 모니터링 | 구조적 로깅/추적 없음 | ✅ `logger.ts` 구현 |
| L3 | 웹훅 | 사용자 웹훅 미지원 | 미완료 |

---

## 2. 확장성 평가 — 현재 아키텍처 분석

### 2.1 확장 용이도 총괄

| 계층 | 확장 패턴 | 확장 용이도 | 비고 |
|------|-----------|------------|------|
| AI Provider | 인터페이스 + 팩토리 | ★★★★☆ | IAiProvider 구현만으로 추가 가능, 팩토리 switch문 수정 필요 |
| Deploy Provider | 인터페이스 + 팩토리 | ★★★☆☆ | IDeployProvider 8개 메서드 구현 필요, 인메모리 상태 문제 |
| 코드 템플릿 | 레지스트리 패턴 | ★★★★★ | register() 호출만으로 동적 추가, 코드 수정 불필요 |
| 빌더 스텝 | StepRegistry | ★★★★★ | registerStep() 호출만으로 동적 추가 |
| 피처 플래그 | DB 기반 토글 | ★★★★★ | DB INSERT만으로 새 플래그 추가, 5분 캐시 |
| 이벤트 시스템 | Observer 패턴 | ★★★★☆ | on/emit으로 확장 가능, 인메모리 한계 |
| 다국어 | i18n 모듈 | ★★★★☆ | locale 파일 추가로 언어 확장 |
| Zustand 스토어 | 독립 스토어 | ★★★★★ | 새 스토어 파일 추가만으로 확장 |
| Repository | BaseRepository 상속 | ★★★☆☆ | CRUD 자동화, Supabase 종속 |
| 미들웨어 | Next.js Middleware | ★★☆☆☆ | 보호 경로 하드코딩, 서브도메인 로직 결합 |

### 2.2 현재 확장 가능 인터페이스

#### AI Provider (`src/providers/ai/IAiProvider.ts`)
```
IAiProvider
├── name: string
├── model: string
├── generateCode(prompt) → Promise<AiResponse>
├── generateCodeStream(prompt) → AsyncGenerator<string>
└── checkAvailability() → Promise<{available, remainingQuota}>
```
- 현재 구현: GrokProvider (xAI Grok API, OpenAI SDK 호환)
- 확장 방법: 인터페이스 구현 → AiProviderFactory에 등록

#### Deploy Provider (`src/providers/deploy/IDeployProvider.ts`)
```
IDeployProvider
├── name: string
├── supportedFeatures: ('env_vars'|'custom_domain'|'serverless'|'static_only')[]
├── createProject(name) → {projectId, repoUrl}
├── pushFiles(projectId, files) → void
├── setEnvironment(projectId, env) → void
├── deploy(projectId) → DeployResult
├── getStatus(deploymentId) → DeployResult
├── rollback(projectId, version) → DeployResult
└── deleteProject(projectId) → void
```
- 현재 구현: RailwayDeployer, GithubPagesDeployer
- 확장 방법: 인터페이스 구현 → DeployProviderFactory에 등록

#### 코드 템플릿 (`src/templates/ICodeTemplate.ts`)
```
ICodeTemplate
├── id, name, description, category
├── supportedApiCategories: string[]
├── matchScore(apis) → number (0~1)
└── generate(context) → {html, css, js, promptHint}
```
- 현재 구현: Dashboard, Calculator, Gallery (3종)
- 확장 방법: `templateRegistry.register(new XxxTemplate())`

#### 도메인 이벤트 (`src/types/events.ts`)
```
DomainEvent (discriminated union)
├── USER_SIGNED_UP
├── PROJECT_CREATED / PROJECT_DELETED
├── PROJECT_PUBLISHED / PROJECT_UNPUBLISHED
├── CODE_GENERATED / CODE_GENERATION_FAILED
├── DEPLOYMENT_STARTED / DEPLOYMENT_COMPLETED / DEPLOYMENT_FAILED
└── API_QUOTA_WARNING
```
- 확장 방법: 유니온 타입에 새 이벤트 추가 → eventBus.on()으로 구독

### 2.3 구조적 한계 및 개선 방향

#### 팩토리 패턴의 switch문 종속
AiProviderFactory, DeployProviderFactory 모두 switch문으로 프로바이더를 생성하여 새 프로바이더 추가 시 팩토리 코드 수정이 필수.

```typescript
// 현재: switch문 (코드 수정 필요)
switch(type) {
  case 'grok': return new GrokProvider(...);
  case 'openai': ...  // 추가할 때마다 수정
}

// 개선: 등록 기반 (코드 수정 불필요)
factory.register('claude', () => new ClaudeProvider(...));
```

#### 배포 상태의 인메모리 관리
RailwayDeployer가 projectId ↔ railwayProjectId 매핑을 `Map`으로 관리. 서버 재시작 시 진행 중인 배포 추적 불가.
- 개선 방향: `deployment_sessions` 테이블 신설 또는 `projects.metadata` JSONB에 배포 세션 정보 저장.

#### 프롬프트 엔지니어링 고정
`promptBuilder.ts`의 시스템 프롬프트가 한국어로 하드코딩. 디자인 규칙(CSS 변수, 시맨틱 HTML, 반응형 브레이크포인트)도 고정.
- 개선 방향: 시스템 프롬프트를 언어별/플랜별로 분리, DB 또는 설정 파일에서 로드.

#### 프레임워크 단일 지원
`generationService.ts`에서 framework가 `'vanilla'`로 고정. `generated_codes.framework` 컬럼은 존재하나 활용되지 않음.
- 개선 방향: React, Vue, Svelte 등 프레임워크별 프롬프트/파서/밸리데이터 분기.

#### 데이터베이스 종속
BaseRepository가 Supabase SDK에 직접 의존. 다른 DB로 교체하려면 전체 Repository 계층 재작성 필요.
- 개선 방향: IDatabase 인터페이스 추출 (장기적). 현재 Supabase 무료 티어로 충분하므로 우선순위 낮음.

#### 코드 파서의 정규식 의존
`codeParser.ts`가 마크다운 코드블록에서 HTML/CSS/JS를 정규식으로 추출. AI 응답 형식이 바뀌면 파싱 실패.
- 개선 방향: 파서 레지스트리 패턴으로 전환, 폴백 파서 체인 구성.

#### 카테고리 라벨/아이콘 하드코딩
`catalogRepository.ts`에서 카테고리별 라벨(날씨, 금융 등)과 아이콘이 코드에 하드코딩.
- 개선 방향: DB 테이블(`api_categories`)로 외부화하거나 설정 파일로 분리.

---

## 3. 기능 확장 로드맵

### Phase 1: 단기 (1~2주, 기존 구조 활용)

#### F1. 다크 모드
- **근거**: `enable_dark_mode` 피처 플래그 이미 존재 (현재 false)
- **구현**: Tailwind `dark:` 클래스 + ThemeProvider 컨텍스트
- **변경 파일**: layout.tsx, 각 컴포넌트에 dark: 프리픽스 추가
- **난이도**: ★☆☆☆☆

#### F2. 코드 뷰어
- **근거**: `enable_code_viewer` 피처 플래그 존재 (현재 true)
- **구현**: 생성된 HTML/CSS/JS를 구문 강조 표시, 복사 버튼
- **변경 파일**: 새 컴포넌트 `CodeViewer.tsx`, builder Step3에 탭 추가
- **난이도**: ★★☆☆☆

#### F3. 프로젝트 초안 자동 저장
- **근거**: `contextStore`에 이미 `persist` 미들웨어 적용됨
- **구현**: 빌더 진행 상태를 localStorage에 저장, 이탈 후 복원
- **변경 파일**: contextStore.ts (이미 구현됨), apiSelectionStore.ts에 persist 추가
- **난이도**: ★☆☆☆☆

#### F4. API 비교 매트릭스
- **근거**: API 선택 시 비교 정보 부재
- **구현**: 선택된 API들의 인증방식, 호출제한, 엔드포인트를 테이블로 비교
- **변경 파일**: 새 컴포넌트 `ApiComparisonView.tsx`, builder Step1에 토글
- **난이도**: ★★☆☆☆

#### F5. 추가 코드 템플릿 (3종 → 6종)
- **근거**: TemplateRegistry가 동적 등록 지원, 기획서에 6종 템플릿 명시
- **구현 대상**:
  - `SearchTemplate`: 검색/조회 서비스 (정보 API 최적화)
  - `FeedTemplate`: 뉴스/피드 스크롤 (뉴스/소셜 API 최적화)
  - `MapTemplate`: 지도 기반 서비스 (위치/지도 API 최적화)
- **변경 파일**: templates/ 폴더에 3개 파일 추가, TemplateRegistry에 register
- **난이도**: ★★☆☆☆

---

### Phase 2: 중기 (3~6주, 아키텍처 소폭 확장)

#### F6. 멀티 AI 프로바이더
- **근거**: IAiProvider 인터페이스 + AiProviderFactory 패턴 완비, `enable_ollama_fallback` 플래그 존재
- **구현 대상**:
  - `OpenAIProvider`: GPT-4o-mini (OpenAI SDK 재사용)
  - `OllamaProvider`: 로컬 LLM 폴백 (무료 대안)
  - `ClaudeProvider`: Anthropic Claude (고품질 코드 생성)
- **변경 파일**: providers/ai/ 폴더에 프로바이더 추가, AiProviderFactory 수정
- **추가 고려**: 모델 선택 UI (빌더 Step2에 드롭다운), 모델별 프롬프트 최적화
- **난이도**: ★★★☆☆

#### F7. 다국어 지원 완성
- **근거**: `src/lib/i18n/index.ts` 구조 존재, `enable_multi_language` 플래그 존재, ko/en 로케일 파일 있음
- **구현**:
  - 프롬프트 빌더 다국어화 (시스템 프롬프트를 언어별로 분리)
  - UI 텍스트 전체 i18n 키로 전환
  - 언어 선택기 (Header 또는 사용자 설정)
- **변경 파일**: i18n 로케일 파일 확장, promptBuilder.ts 리팩터링, 전체 컴포넌트
- **난이도**: ★★★☆☆

#### F8. 사용자 피드백 루프
- **근거**: `CodeMetadata.userFeedback` 필드 타입 정의에 존재
- **구현**:
  - 생성 결과에 좋아요/싫어요 평가 UI
  - 텍스트 피드백 수집
  - 피드백 기반 재생성 (`buildRegenerationPrompt` 활용)
  - 피드백 통계 대시보드
- **변경 파일**: 새 컴포넌트, generationService에 피드백 저장 로직
- **난이도**: ★★☆☆☆

#### F9. 프로젝트 버전 히스토리 & Diff 뷰어
- **근거**: `generated_codes` 테이블에 version 컬럼 + `projects.current_version` 존재
- **구현**:
  - 버전별 코드 목록 조회 UI
  - 버전 간 HTML/CSS/JS diff 비교
  - 특정 버전으로 롤백 (API 존재: `POST /api/v1/projects/:id/rollback`)
- **변경 파일**: 새 컴포넌트 `VersionHistory.tsx`, `CodeDiffViewer.tsx`
- **난이도**: ★★★☆☆

#### F10. 고급 프롬프트 시스템
- **근거**: `enable_advanced_prompt` 피처 플래그 존재
- **구현**:
  - 프롬프트 템플릿 라이브러리 (DB 저장)
  - 프롬프트 변수 시스템 (`{{API_NAME}}`, `{{USER_CONTEXT}}`)
  - 프롬프트 A/B 테스트 (생성 품질 비교)
  - 사용자 커스텀 시스템 프롬프트 오버라이드
- **변경 파일**: promptBuilder.ts 리팩터링, 새 테이블 `prompt_templates`
- **난이도**: ★★★★☆

#### F11. 멀티 프레임워크 코드 생성
- **근거**: `generated_codes.framework` 컬럼 존재 (vanilla/react/next 지원 예정)
- **구현**:
  - 빌더 Step2에서 출력 프레임워크 선택
  - 프레임워크별 시스템 프롬프트 분기
  - 프레임워크별 코드 파서/밸리데이터
  - React: JSX + CSS Modules, Vue: SFC, Svelte: .svelte
- **변경 파일**: promptBuilder.ts, codeParser.ts, codeValidator.ts 분기 추가
- **난이도**: ★★★★☆

---

### Phase 3: 장기 (2~3개월, 아키텍처 확장)

#### F12. 팀/조직 기능
- **근거**: `enable_team_features` 플래그 존재, organizations/memberships 테이블 + RLS 정책 구현 완료
- **구현**:
  - 조직 생성/관리 UI
  - 멤버 초대 (이메일 기반)
  - 역할 기반 접근 제어 (owner/admin/member/viewer)
  - 조직 프로젝트 공유 (RLS 정책 이미 구현)
  - 조직별 사용량 대시보드
- **변경 파일**: 새 페이지 `/org/[slug]`, organizationRepository 활용, authService 확장
- **난이도**: ★★★★☆

#### F13. 분석 대시보드
- **근거**: `event_log` 테이블 존재, 모든 서비스에서 이벤트 발행 중
- **구현**:
  - 생성 성공률 / 실패율 추이
  - AI 모델별 토큰 사용량 (`token_usage` JSONB)
  - 생성 소요 시간 통계 (`generation_time_ms`)
  - API별 인기도 / 조합 패턴
  - 사용자 활동 히트맵
- **변경 파일**: 새 페이지 `/analytics`, event_log 집계 쿼리
- **난이도**: ★★★☆☆

#### F14. 실시간 협업 편집
- **근거**: Supabase Realtime 구독 지원
- **구현**:
  - 프로젝트 실시간 동시 편집 (컨텍스트 입력)
  - 편집 중인 사용자 아바타 표시
  - Supabase Realtime 채널 기반
- **변경 파일**: 새 훅 `useRealtimeProject.ts`, Supabase Realtime 설정
- **난이도**: ★★★★★

#### F15. 비주얼 코드 에디터
- **근거**: 생성 후 미세 조정 수요
- **구현**:
  - Monaco Editor 임베딩 (HTML/CSS/JS 탭)
  - 실시간 미리보기 연동
  - 구문 강조 + 자동 완성
  - 수정 사항 새 버전으로 저장
- **변경 파일**: 새 컴포넌트 `CodeEditor.tsx`, 새 API `/api/v1/projects/:id/code`
- **난이도**: ★★★★☆

#### F16. 플러그인 시스템
- **근거**: StepRegistry, TemplateRegistry 패턴이 플러그인 아키텍처의 기반
- **구현**:
  - 플러그인 인터페이스 정의 (`IPlugin`)
  - 플러그인 레지스트리 (로드/언로드)
  - 훅 포인트: 코드 생성 전/후, 배포 전/후, 밸리데이션
  - 커뮤니티 플러그인 마켓플레이스 (장기)
- **변경 파일**: 새 디렉토리 `src/plugins/`, 이벤트 시스템 확장
- **난이도**: ★★★★★

#### F17. 모바일 반응형 + PWA
- **근거**: Tailwind CSS로 반응형 기반은 있으나 모바일 최적화 미흡
- **구현**:
  - PWA manifest + Service Worker
  - 모바일 전용 레이아웃 최적화
  - 오프라인 지원 (캐시된 프로젝트 조회)
  - 푸시 알림 (배포 완료 등)
- **변경 파일**: public/manifest.json, next.config.ts PWA 설정
- **난이도**: ★★★☆☆

#### F18. 사용자 정의 도메인
- **근거**: IDeployProvider에 `custom_domain` 기능 플래그 존재
- **구현**:
  - `slug.xzawed.xyz` 외 사용자 도메인 연결
  - DNS CNAME 설정 가이드
  - SSL 인증서 자동 발급 (Let's Encrypt)
  - 도메인 검증 플로우
- **변경 파일**: middleware.ts 도메인 매핑, 새 테이블 `custom_domains`
- **난이도**: ★★★★★

---

## 4. 우선순위 매트릭스

평가 기준:
- **사용자 가치**: 사용자 경험에 미치는 영향
- **구현 용이성**: 현재 아키텍처에서 구현 난이도
- **기존 기반**: 이미 준비된 인터페이스/테이블/플래그 활용도

| 순위 | 기능 | 사용자 가치 | 구현 용이성 | 기존 기반 | 추천 |
|------|------|------------|------------|----------|------|
| 1 | F1. 다크 모드 | ★★★☆☆ | ★★★★★ | 플래그 존재 | 즉시 |
| 2 | F5. 추가 템플릿 3종 | ★★★★☆ | ★★★★★ | 레지스트리 완비 | 즉시 |
| 3 | F3. 초안 자동 저장 | ★★★★☆ | ★★★★★ | persist 패턴 존재 | 즉시 |
| 4 | F2. 코드 뷰어 | ★★★☆☆ | ★★★★☆ | 플래그 true | 즉시 |
| 5 | F8. 사용자 피드백 | ★★★★☆ | ★★★★☆ | 타입 정의 존재 | 단기 |
| 6 | F9. 버전 Diff 뷰어 | ★★★★☆ | ★★★☆☆ | version 컬럼 존재 | 단기 |
| 7 | F6. 멀티 AI 프로바이더 | ★★★★★ | ★★★☆☆ | 인터페이스 완비 | 중기 |
| 8 | F7. 다국어 완성 | ★★★★☆ | ★★★☆☆ | i18n 구조 존재 | 중기 |
| 9 | F13. 분석 대시보드 | ★★★★☆ | ★★★☆☆ | event_log 존재 | 중기 |
| 10 | F10. 고급 프롬프트 | ★★★☆☆ | ★★☆☆☆ | 플래그 존재 | 중기 |
| 11 | F12. 팀/조직 기능 | ★★★★★ | ★★☆☆☆ | 테이블+RLS 완비 | 장기 |
| 12 | F11. 멀티 프레임워크 | ★★★★☆ | ★★☆☆☆ | 컬럼 존재 | 장기 |
| 13 | F15. 비주얼 에디터 | ★★★★★ | ★★☆☆☆ | 없음 | 장기 |
| 14 | F17. PWA | ★★★☆☆ | ★★★☆☆ | Tailwind 기반 | 장기 |
| 15 | F4. API 비교 매트릭스 | ★★☆☆☆ | ★★★★☆ | 데이터 존재 | 선택 |
| 16 | F18. 사용자 정의 도메인 | ★★★☆☆ | ★☆☆☆☆ | 플래그만 존재 | 장기 |
| 17 | F14. 실시간 협업 | ★★★☆☆ | ★☆☆☆☆ | Supabase RT | 장기 |
| 18 | F16. 플러그인 시스템 | ★★★★☆ | ★☆☆☆☆ | 레지스트리 패턴 | 장기 |

---

## 5. 아키텍처 개선 로드맵

기능 확장과 병행하여 아키텍처 품질을 점진적으로 개선합니다.

### 5.1 단기 개선 (기능 확장과 함께)

| 개선 | 대상 파일 | 이유 |
|------|----------|------|
| 팩토리 등록 기반 전환 | AiProviderFactory, DeployProviderFactory | F6 구현 시 switch문 제거 |
| API 클라이언트 중앙화 | 새 `src/lib/api/client.ts` | fetch 호출 분산 → 중앙 관리 |
| 프롬프트 언어 분리 | `src/lib/ai/prompts/ko.ts`, `en.ts` | F7 구현의 전제 조건 |
| 카테고리 외부화 | catalogRepository → DB 또는 설정 파일 | 하드코딩 제거 |

### 5.2 중기 개선 (아키텍처 안정성)

| 개선 | 대상 | 이유 |
|------|------|------|
| 배포 상태 DB 저장 | RailwayDeployer → deployment_sessions 테이블 | 서버 재시작 시 상태 유실 방지 |
| 상태 머신 도입 | Project status 전환 | 잘못된 상태 전환 방지 (draft→deployed 직접 전환 등) |
| 이벤트 비동기화 | eventBus → 큐 기반 | 핸들러 실패 시 재시도, 서비스 블로킹 방지 |
| 코드 파서 레지스트리 | codeParser → ParserRegistry | AI 응답 형식 변경에 유연 대응 |

### 5.3 장기 개선 (확장성 극대화)

| 개선 | 대상 | 이유 |
|------|------|------|
| IDatabase 인터페이스 | BaseRepository 추상화 | DB 벤더 독립성 (우선순위 낮음) |
| IAuthProvider 인터페이스 | Supabase Auth 추상화 | 인증 제공자 교체 가능성 |
| 플러그인 아키텍처 | 전체 | 커뮤니티 확장 기반 |
| 마이크로서비스 분리 | 코드 생성 → 별도 서비스 | 생성 부하 격리 |

---

## 6. 미사용/미완성 기반 시설 현황

현재 코드에 정의되어 있지만 활용되지 않는 기반 시설입니다. 향후 기능 확장 시 우선 활용해야 합니다.

| 항목 | 위치 | 상태 | 활용 가능 기능 |
|------|------|------|---------------|
| `enable_dark_mode` 플래그 | feature_flags 테이블 | 정의됨, 미사용 | F1. 다크 모드 |
| `enable_ollama_fallback` 플래그 | feature_flags 테이블 | 정의됨, 미사용 | F6. 멀티 AI |
| `enable_template_system` 플래그 | feature_flags 테이블 | 정의됨, 미사용 | F5. 추가 템플릿 |
| `enable_multi_language` 플래그 | feature_flags 테이블 | 정의됨, 미사용 | F7. 다국어 |
| `enable_team_features` 플래그 | feature_flags 테이블 | 정의됨, 미사용 | F12. 팀/조직 |
| `enable_advanced_prompt` 플래그 | feature_flags 테이블 | 정의됨, 미사용 | F10. 고급 프롬프트 |
| `API_QUOTA_WARNING` 이벤트 | types/events.ts | 정의됨, 발행 안 됨 | 쿼터 모니터링 |
| `organizations` 테이블 + RLS | 001_initial_schema.sql | 스키마 완비, UI 없음 | F12. 팀/조직 |
| `memberships` 테이블 + RLS | 001_initial_schema.sql | 스키마 완비, UI 없음 | F12. 팀/조직 |
| `generated_codes.framework` | DB 컬럼 | 항상 'vanilla' | F11. 멀티 프레임워크 |
| `generated_codes.dependencies` | DB 컬럼 | 미사용 | 외부 라이브러리 추적 |
| `generated_codes.token_usage` | DB JSONB | 저장됨, UI 없음 | F13. 분석 대시보드 |
| `generated_codes.generation_time_ms` | DB 컬럼 | 저장됨, UI 없음 | F13. 분석 대시보드 |
| Pro 플랜 설정 | features.ts getLimits('pro') | 정의됨, 호출 안 됨 | 유료 플랜 도입 |
| `user_api_keys` 테이블 | 001_initial_schema.sql | 스키마 완비, 미사용 | 사용자 API 키 관리 |

---

## 7. 요약

### 현재 아키텍처의 강점
- **Provider 패턴**: AI, 배포 서비스를 인터페이스로 추상화하여 교체/추가 용이
- **Registry 패턴**: 템플릿, 빌더 스텝을 동적으로 등록/관리
- **이벤트 기반**: 핵심 로직 수정 없이 부가 기능 추가 가능
- **설정 기반 규칙**: 비즈니스 한도를 환경변수와 플랜으로 관리
- **DB 선행 설계**: 조직, 멤버십, 이벤트 로그, 피처 플래그 등 미래 기능용 테이블 이미 구축

### 핵심 확장 방향 3가지
1. **AI 생태계 확장**: 멀티 프로바이더 + 고급 프롬프트 + 멀티 프레임워크
2. **사용자 경험 심화**: 코드 에디터 + 버전 관리 + 피드백 루프 + 분석
3. **협업 플랫폼화**: 팀/조직 + 실시간 협업 + 플러그인 시스템

### 즉시 실행 가능한 확장 (기존 기반 시설 활용)
1. 다크 모드 (피처 플래그 활성화 + Tailwind dark: 클래스)
2. 추가 템플릿 3종 (templateRegistry.register() 호출)
3. 초안 자동 저장 (Zustand persist 미들웨어 확장)
4. 코드 뷰어 (피처 플래그 이미 true)
