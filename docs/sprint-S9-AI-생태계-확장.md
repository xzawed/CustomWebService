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

## S9 완료 조건 종합

- [ ] 등록 기반 팩토리로 전환 완료
- [ ] 2개 이상 AI 프로바이더 동작 (Grok + OpenAI 또는 Ollama)
- [ ] 빌더에서 모델 선택 가능
- [ ] 프롬프트가 DB 기반으로 관리됨
- [ ] 쿼터 모니터링 동작
- [ ] 기존 테스트 통과 + 신규 프로바이더 테스트 추가
