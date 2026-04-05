# Sprint 9 — AI 생태계 확장 (멀티 프로바이더 · 고급 프롬프트)

> 기반 문서: `docs/20_확장성_분석_및_로드맵.md` F6, F10
> 선행 조건: S8 완료
> 예상 기간: 3~4주
> 목표: AI 프로바이더 확장 + 프롬프트 최적화 시스템 구축

---

## 진행 현황

| 태스크 | 목표 | 상태 |
|--------|------|------|
| S9-1 | AiProviderFactory 등록 기반 전환 | ⏳ 대기 |
| S9-2 | OpenAI Provider 추가 | ⏳ 대기 |
| S9-3 | Ollama Provider 추가 (로컬 폴백) | ⏳ 대기 |
| S9-4 | 모델 선택 UI | ⏳ 대기 |
| S9-5 | 프롬프트 템플릿 시스템 | ⏳ 대기 |
| S9-6 | 쿼터 모니터링 | ⏳ 대기 |

---

## S9-1. AiProviderFactory 등록 기반 전환

### 배경

현재 AiProviderFactory가 switch문으로 프로바이더를 생성. 새 프로바이더 추가마다 팩토리 코드 수정 필요.
등록 기반으로 전환하여 코드 수정 없이 프로바이더 추가 가능하게 변경.

### 구현 내용

**수정 파일:** `src/providers/ai/AiProviderFactory.ts`

```typescript
// 변경 전 (switch문)
static create(type: AiProviderType): IAiProvider {
  switch(type) {
    case 'grok': return new GrokProvider(apiKey);
  }
}

// 변경 후 (등록 기반)
class AiProviderFactory {
  private static registry = new Map<string, () => IAiProvider>();

  static register(type: string, creator: () => IAiProvider): void {
    this.registry.set(type, creator);
  }

  static create(type: string): IAiProvider {
    const creator = this.registry.get(type);
    if (!creator) throw new NotFoundError(`AI provider '${type}' not registered`);
    return creator();
  }

  static getAvailableProviders(): string[] {
    return Array.from(this.registry.keys());
  }

  static async getBestAvailable(): Promise<IAiProvider> {
    // 등록된 프로바이더 순서대로 checkAvailability() 확인
    for (const [type] of this.registry) {
      const provider = this.create(type);
      const { available } = await provider.checkAvailability();
      if (available) return provider;
    }
    throw new ServiceError('No AI provider available');
  }
}

// 프로바이더 자동 등록 (파일 로드 시)
AiProviderFactory.register('grok', () => new GrokProvider(process.env.XAI_API_KEY!));
```

### 완료 조건
- [ ] 기존 GrokProvider가 등록 기반으로 동작
- [ ] `getAvailableProviders()`로 등록된 프로바이더 목록 조회 가능
- [ ] 기존 테스트 통과 (AiProviderFactory.test.ts)

---

## S9-2. OpenAI Provider 추가

### 구현 내용

**신규 파일:** `src/providers/ai/OpenAIProvider.ts`

```typescript
// GrokProvider와 동일한 OpenAI SDK 사용 (endpoint만 다름)
// - endpoint: https://api.openai.com/v1 (기본값)
// - model: gpt-4o-mini (기본값)
// - 환경변수: OPENAI_API_KEY
```

**등록:**
```typescript
if (process.env.OPENAI_API_KEY) {
  AiProviderFactory.register('openai', () =>
    new OpenAIProvider(process.env.OPENAI_API_KEY!)
  );
}
```

**환경변수 추가:**

**수정 파일:** `.env.Example`

```env
# OpenAI (선택)
OPENAI_API_KEY=your-openai-api-key
```

### 완료 조건
- [ ] `OPENAI_API_KEY` 설정 시 openai 프로바이더 자동 등록
- [ ] `AiProviderFactory.create('openai')` 정상 동작
- [ ] 코드 생성 결과가 GrokProvider와 동일한 포맷

---

## S9-3. Ollama Provider 추가 (로컬 폴백)

### 배경

`enable_ollama_fallback` 피처 플래그 존재 (현재 false).
외부 API 장애 시 로컬 LLM으로 폴백.

### 구현 내용

**신규 파일:** `src/providers/ai/OllamaProvider.ts`

```typescript
// - endpoint: http://localhost:11434/api (Ollama 기본 포트)
// - model: codellama:7b (기본값)
// - 환경변수: OLLAMA_BASE_URL (선택, 기본값 http://localhost:11434)
// - checkAvailability(): /api/tags 엔드포인트 핑
// - generateCode(): /api/generate 또는 /api/chat 호출
// - generateCodeStream(): streaming 응답 파싱
```

**등록 (피처 플래그 연동):**
```typescript
// generationService.ts에서 피처 플래그 확인 후 등록
if (featureFlags.enableOllamaFallback) {
  AiProviderFactory.register('ollama', () =>
    new OllamaProvider(process.env.OLLAMA_BASE_URL)
  );
}
```

### 완료 조건
- [ ] Ollama 실행 중일 때 프로바이더 자동 등록
- [ ] `getBestAvailable()` 폴백 순서: grok → openai → ollama
- [ ] Ollama 미실행 시 `checkAvailability()` false 반환
- [ ] `enable_ollama_fallback = false` 시 등록 안 됨

---

## S9-4. 모델 선택 UI

### 구현 내용

**1) 모델 목록 API**

**신규 파일:** `src/app/api/v1/ai/providers/route.ts`

```
GET /api/v1/ai/providers
→ [
    { type: 'grok', name: 'xAI Grok', model: 'grok-3-mini', available: true },
    { type: 'openai', name: 'OpenAI', model: 'gpt-4o-mini', available: true },
    { type: 'ollama', name: 'Ollama (로컬)', model: 'codellama:7b', available: false }
  ]
```

**2) ModelSelector 컴포넌트**

**신규 파일:** `src/components/builder/ModelSelector.tsx`

```
┌─ AI 모델 선택 ─────────────────────────────────┐
│                                               │
│  ● xAI Grok (grok-3-mini)    ✅ 사용 가능     │
│  ○ OpenAI (gpt-4o-mini)      ✅ 사용 가능     │
│  ○ Ollama (codellama:7b)     ❌ 연결 안 됨    │
│                                               │
│  💡 Grok은 코드 생성에 최적화되어 있습니다.     │
│                                               │
└───────────────────────────────────────────────┘
```

**3) generationStore 확장**

**수정 파일:** `src/stores/generationStore.ts`

- `selectedProvider: string` 상태 추가 (기본값: 'grok')

**4) 생성 API 확장**

**수정 파일:** `src/app/api/v1/generate/route.ts`

- 요청 body에 `provider?: string` 파라미터 추가
- GenerationService에 프로바이더 선택 전달

**5) 빌더 Step2 연결**

**수정 파일:** `src/app/(main)/builder/page.tsx`

- Step2 하단에 ModelSelector 배치 (컨텍스트 입력 아래)

### 완료 조건
- [ ] 빌더에서 사용 가능한 AI 모델 목록 표시
- [ ] 모델 선택 후 해당 프로바이더로 코드 생성
- [ ] 사용 불가 모델은 선택 불가 (disabled)
- [ ] generated_codes에 사용된 ai_provider, ai_model 기록

---

## S9-5. 프롬프트 템플릿 시스템

### 배경

`enable_advanced_prompt` 피처 플래그 존재. 시스템 프롬프트가 하드코딩되어 최적화/실험 불가.

### 구현 내용

**1) 프롬프트 템플릿 테이블**

**신규 파일:** `supabase/migrations/003_prompt_templates.sql`

```sql
CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  type VARCHAR(50) NOT NULL,         -- 'system' | 'user' | 'regeneration'
  language VARCHAR(10) NOT NULL DEFAULT 'ko',
  template TEXT NOT NULL,            -- {{API_LIST}}, {{USER_CONTEXT}} 등 변수 포함
  is_default BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 기본 시스템 프롬프트 시딩
INSERT INTO prompt_templates (name, type, language, template, is_default) VALUES
('기본 시스템 프롬프트 (한국어)', 'system', 'ko', '...현재 hardcoded 프롬프트 내용...', true),
('기본 시스템 프롬프트 (영어)', 'system', 'en', '...translated prompt...', true);
```

**2) promptBuilder 리팩터링**

**수정 파일:** `src/lib/ai/promptBuilder.ts`

```typescript
// 현재: buildSystemPrompt()에 하드코딩
// 변경: DB에서 is_default=true인 템플릿 로드 → 변수 치환

export async function buildSystemPrompt(language: string = 'ko'): Promise<string> {
  const template = await getDefaultTemplate('system', language);
  return template.content;  // 캐시 적용 (5분)
}

export function interpolatePrompt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}
```

**3) 프롬프트 관리 API (관리자용)**

**신규 파일:** `src/app/api/v1/admin/prompts/route.ts`

```
GET    /api/v1/admin/prompts         → 전체 목록
POST   /api/v1/admin/prompts         → 새 템플릿 생성
PATCH  /api/v1/admin/prompts/:id     → 수정
DELETE /api/v1/admin/prompts/:id     → 삭제
```

### 완료 조건
- [ ] 시스템 프롬프트가 DB에서 로드됨
- [ ] 프롬프트 변경 시 코드 재배포 불필요 (DB 수정만으로)
- [ ] 5분 캐시로 DB 부하 최소화
- [ ] `enable_advanced_prompt = false` 시 기존 하드코딩 프롬프트 사용

---

## S9-6. 쿼터 모니터링

### 배경

`API_QUOTA_WARNING` 이벤트가 정의되어 있으나 발행되지 않음.

### 구현 내용

**1) 쿼터 체크 로직**

**수정 파일:** `src/services/generationService.ts`

- AI 프로바이더의 `checkAvailability()` 결과에서 `remainingQuota` 확인
- 남은 쿼터가 전체의 20% 이하일 때 `API_QUOTA_WARNING` 이벤트 발행

**2) 쿼터 경고 이벤트 핸들러**

**수정 파일:** `src/lib/events/eventBus.ts` 또는 별도 핸들러 파일

- `API_QUOTA_WARNING` 수신 시 event_log에 저장
- 향후 알림 시스템(이메일, Slack)으로 확장 가능

**3) 대시보드 쿼터 표시**

**수정 파일:** `src/app/(main)/dashboard/page.tsx`

- 오늘 남은 생성 횟수 표시: "오늘 N/10회 생성 가능"

### 완료 조건
- [ ] `API_QUOTA_WARNING` 이벤트 발행 동작
- [ ] event_log에 쿼터 경고 기록
- [ ] 대시보드에 일일 남은 생성 횟수 표시

---

## S9 테스트 계획

### 단위 테스트 (Unit Tests)

#### `src/providers/ai/AiProviderFactory.test.ts` — 리팩터링 (S9-1)
```
describe('AiProviderFactory (등록 기반)')
├── it('register()로 등록된 프로바이더를 create()로 생성한다')
├── it('미등록 타입에 NotFoundError를 던진다')
├── it('getAvailableProviders()가 등록 목록을 반환한다')
├── it('getBestAvailable()이 사용 가능한 첫 프로바이더를 반환한다')
├── it('모든 프로바이더 불가 시 ServiceError를 던진다')
└── it('같은 타입 재등록 시 덮어쓴다')
```
예상 테스트 수: **6개** (기존 7개 리팩터링)

#### `src/providers/ai/OpenAIProvider.test.ts` — 신규 (S9-2)
```
describe('OpenAIProvider')
├── describe('generateCode')
│   ├── it('OpenAI API를 호출하고 AiResponse를 반환한다')
│   ├── it('토큰 사용량을 올바르게 추적한다')
│   └── it('API 에러 시 적절한 에러를 던진다')
├── describe('generateCodeStream')
│   ├── it('스트리밍 응답을 AsyncGenerator로 반환한다')
│   └── it('빈 응답을 정상 처리한다')
└── describe('checkAvailability')
    ├── it('API 키 유효 시 available: true를 반환한다')
    └── it('429 상태 시 available: false를 반환한다')
```
예상 테스트 수: **7개**

MSW 핸들러 추가 (`src/test/mocks/handlers.ts`):
```typescript
// OpenAI API mock
http.post('https://api.openai.com/v1/chat/completions', () => {
  return HttpResponse.json({
    choices: [{ message: { content: '```html\n<h1>Test</h1>\n```' } }],
    usage: { prompt_tokens: 100, completion_tokens: 200 }
  });
})
```

#### `src/providers/ai/OllamaProvider.test.ts` — 신규 (S9-3)
```
describe('OllamaProvider')
├── describe('generateCode')
│   ├── it('Ollama API를 호출하고 AiResponse를 반환한다')
│   └── it('연결 실패 시 ServiceError를 던진다')
├── describe('checkAvailability')
│   ├── it('Ollama 실행 중이면 available: true를 반환한다')
│   └── it('연결 불가 시 available: false를 반환한다')
└── describe('generateCodeStream')
    └── it('스트리밍 응답을 올바르게 파싱한다')
```
예상 테스트 수: **5개**

#### `src/lib/ai/promptBuilder.test.ts` — 추가 케이스 (S9-5)
```
describe('promptBuilder (DB 기반)')
├── it('DB에서 기본 시스템 프롬프트를 로드한다')
├── it('DB 실패 시 하드코딩된 프롬프트로 폴백한다')
├── it('interpolatePrompt()가 {{변수}}를 치환한다')
├── it('정의되지 않은 변수는 빈 문자열로 치환한다')
└── it('캐시 TTL 내에서 DB 재조회하지 않는다')
```
예상 테스트 수: **5개** (기존 9개에 추가)

#### `src/services/generationService.test.ts` — 추가 케이스 (S9-6)
```
describe('쿼터 모니터링')
├── it('남은 쿼터 20% 이하 시 API_QUOTA_WARNING 이벤트를 발행한다')
├── it('쿼터 충분 시 이벤트를 발행하지 않는다')
└── it('쿼터 확인 실패 시 경고 없이 계속 진행한다')
```
예상 테스트 수: **3개**

### 통합 테스트 (Integration Tests)

#### `src/__tests__/api/ai-providers.test.ts` — 신규
```
describe('GET /api/v1/ai/providers')
├── it('등록된 프로바이더 목록을 반환한다')
├── it('각 프로바이더의 available 상태를 포함한다')
└── it('미인증 시에도 접근 가능하다')

describe('POST /api/v1/generate — provider 선택')
├── it('provider 파라미터로 특정 프로바이더를 사용한다')
├── it('미등록 provider에 400을 반환한다')
└── it('provider 미지정 시 getBestAvailable()을 사용한다')
```
예상 테스트 수: **6개**

#### `src/__tests__/api/admin-prompts.test.ts` — 신규
```
describe('프롬프트 관리 API')
├── it('GET /api/v1/admin/prompts — 프롬프트 목록을 반환한다')
├── it('POST /api/v1/admin/prompts — 새 프롬프트를 생성한다')
├── it('PATCH /api/v1/admin/prompts/:id — 프롬프트를 수정한다')
└── it('일반 사용자는 관리 API에 403을 반환한다')
```
예상 테스트 수: **4개**

### 코드 품질 검토 체크리스트

#### 정적 분석
- [ ] `pnpm lint` — 경고/에러 0건
- [ ] `pnpm type-check` — 컴파일 에러 0건
- [ ] `pnpm format:check` — 포맷 위반 0건

#### 코드 리뷰 포인트
- [ ] 등록 기반 팩토리 전환 후 기존 테스트가 모두 통과하는가
- [ ] OpenAI/Ollama 프로바이더가 IAiProvider 인터페이스를 완전히 구현하는가
- [ ] API 키가 서버사이드에서만 접근 가능한가 (NEXT_PUBLIC_ 접두사 없음)
- [ ] Ollama 연결 타임아웃이 설정되어 있는가 (무한 대기 방지)
- [ ] 프롬프트 캐시가 메모리 누수를 일으키지 않는가 (WeakMap 또는 TTL)
- [ ] 관리 API에 적절한 인증/인가가 적용되었는가

#### 보안
- [ ] 프롬프트 템플릿의 변수 치환에서 코드 인젝션 위험이 없는가
- [ ] Ollama Provider가 로컬 네트워크 외부 접근을 허용하지 않는가
- [ ] API 키 로깅/노출이 없는가 (에러 메시지, 응답 본문)

#### 성능
- [ ] `getBestAvailable()`의 순차 checkAvailability()가 총 5초 이내에 완료되는가
- [ ] 프롬프트 DB 조회가 캐시 히트 시 0ms에 가까운가
- [ ] 프로바이더 인스턴스 캐싱이 올바르게 동작하는가

#### 테스트 커버리지 목표
- [ ] 신규 코드 라인 커버리지 **85% 이상**
- [ ] 신규 테스트 **36개 이상** 추가 (누적 171개 → 207개)

---

## S9 완료 조건 종합

- [ ] 등록 기반 팩토리로 전환 완료
- [ ] 2개 이상 AI 프로바이더 동작 (Grok + OpenAI 또는 Ollama)
- [ ] 빌더에서 모델 선택 가능
- [ ] 프롬프트가 DB 기반으로 관리됨
- [ ] 쿼터 모니터링 동작
- [ ] 기존 테스트 통과 + 신규 프로바이더 테스트 추가
