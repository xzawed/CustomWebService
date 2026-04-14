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
- `ANTHROPIC_API_KEY` — Claude API 키 (기본 Provider)
- `XAI_API_KEY` — Grok API 키 (롤백용)
- `AI_PROVIDER` — `claude` (기본값) 또는 `grok`

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

## Grok → Claude 전환

Railway 환경변수에 `ANTHROPIC_API_KEY`를 추가하면 자동 전환.
롤백: `AI_PROVIDER=grok` 설정.
