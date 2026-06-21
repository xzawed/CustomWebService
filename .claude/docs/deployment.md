# 배포 가이드

## 환경

- **플랫폼**: Railway (단일 인스턴스)
- **빌드**: Dockerfile + Next.js standalone output
- **도메인**: xzawed.xyz (가비아 DNS → Railway)
- **서브도메인**: *.xzawed.xyz (와일드카드 DNS)

## 필수 환경변수

### Supabase
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### AI Provider
- `ANTHROPIC_API_KEY` — Claude API 키 (유일한 지원 Provider, 필수)

> Provider는 Claude 단일이다. `AiProviderFactory`는 `'claude'` 외 타입에 대해 `throw new Error('Unknown AI provider')`를 던지므로 `AI_PROVIDER=grok`은 런타임 크래시를 유발한다. `XAI_API_KEY`는 코드에서 사용되지 않는다.

### 앱 설정
- `NEXT_PUBLIC_APP_URL` — `https://xzawed.xyz`
- `NEXT_PUBLIC_ROOT_DOMAIN` — `xzawed.xyz`
- `ENCRYPTION_KEY` — 사용자 API 키 암호화용

### 제한 설정 (선택)
- `MAX_DAILY_GENERATIONS` — 일일 생성 한도 (기본: 10)
- `MAX_APIS_PER_PROJECT` — 프로젝트당 API 수 (기본: 5)
- `MAX_PROJECTS_PER_USER` — 사용자당 프로젝트 수 (기본: 20)

## 배포 전 체크리스트

1. [ ] 환경변수 설정 확인
2. [ ] `pnpm type-check` 통과
3. [ ] `pnpm test` 전체 통과
4. [ ] CSP 헤더 3개 파일 일관성 확인
5. [ ] 서빙 파이프라인 3경로 확인 (미리보기/게시/서브도메인)

## AI Provider 이력 (과거 마이그레이션 기록)

> ⚠️ 아래는 현행 운영 지침이 아닌 과거 기록이다. Grok/xAI 경로는 코드베이스에서 완전히 제거되었으며, 현재 Provider는 Claude 단일이다.

과거에는 Grok ↔ Claude 전환이 `AI_PROVIDER` 환경변수로 가능했으나, 현재는 `AiProviderFactory`가 `'claude'`만 지원한다(`AI_PROVIDER=grok` 설정 시 `Unknown AI provider` 예외로 크래시). 따라서 별도 전환·롤백 절차는 없으며 `ANTHROPIC_API_KEY`만 설정하면 된다.
