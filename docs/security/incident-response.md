# 보안 인시던트 대응 절차

## 시크릿 노출 의심 시 즉시 조치

### 1. 노출 확인
```bash
# git history에서 패턴 검색
git log --all --full-history -p -- "*.env*" | grep -E "(ANTHROPIC|SERVICE_ROLE|ADMIN_API|ghp_)"

# gitleaks 전체 스캔 (설치 후)
gitleaks detect --source . --config .gitleaks.toml
```

### 2. 시크릿 회전 체크리스트

노출이 확인되는 즉시 아래 순서로 회전. 각 항목은 독립적으로 진행 가능.

#### Anthropic API 키
1. https://console.anthropic.com/settings/keys → 기존 키 비활성화
2. 신규 키 생성
3. Railway env 업데이트: `ANTHROPIC_API_KEY`
4. 로컬 `.env.local` 업데이트
5. 확인: 신규 키로 API 호출 성공 여부

#### GitHub Personal Access Token
1. https://github.com/settings/tokens → 기존 토큰 폐기
2. Fine-grained token 재발급 (scope: repo + workflow만)
3. Railway env 업데이트: `GITHUB_TOKEN`
4. 로컬 `.env.local` 업데이트
5. 확인: GitHub API 호출 성공 여부

#### Supabase Service Role Key
1. Supabase Dashboard → Project Settings → API → Reset service_role
2. Railway env 업데이트: `SUPABASE_SERVICE_ROLE_KEY`
3. 로컬 `.env.local` 업데이트
4. 확인: 관리자 API 정상 동작 여부

#### ADMIN_API_KEY
```bash
openssl rand -hex 32
```
1. 위 명령으로 신규 키 생성
2. Railway env 업데이트: `ADMIN_API_KEY`
3. 로컬 `.env.local` 업데이트
4. 확인: `/api/v1/health?detailed=true` 헤더 인증 성공 여부

### 3. 회전 후 검증
```bash
curl https://xzawed.xyz/api/v1/health
# 기대값: {"status":"ok","timestamp":"..."}

curl -H "Authorization: Bearer $ADMIN_API_KEY" "https://xzawed.xyz/api/v1/health?detailed=true"
# 기대값: 상세 통계 JSON
```

---

## ENCRYPTION_KEY 회전 (별도 마이그레이션 필요)

> **경고**: ENCRYPTION_KEY 회전 시 기존 사용자 API 키가 모두 복호화 불가 상태가 됩니다.
> 아래 절차를 반드시 따를 것.

### 사전 조건
- 회전 전 현재 키로 모든 암호화된 API 키를 복호화하고 재암호화할 마이그레이션 스크립트 필요
- 유지보수 창(maintenance window) 동안 실행 권장

### 마이그레이션 절차 (예시)
```typescript
// scripts/rotate-encryption-key.ts
// 1. DB에서 모든 encrypted_api_key 조회
// 2. OLD_ENCRYPTION_KEY로 복호화
// 3. NEW_ENCRYPTION_KEY로 재암호화
// 4. DB 업데이트
// 5. Railway env에서 ENCRYPTION_KEY = NEW_ENCRYPTION_KEY로 변경
```

**현재 상태**: ENCRYPTION_KEY 회전은 마이그레이션 스크립트 구현 전까지 보류.

---

## 정기 시크릿 회전 일정 (분기 1회)

| 시크릿 | 마지막 회전 | 다음 회전 예정 |
|--------|------------|----------------|
| ANTHROPIC_API_KEY | 2026-04-25 | 2026-07-25 |
| GITHUB_TOKEN | 2026-04-25 | 2026-07-25 |
| SUPABASE_SERVICE_ROLE_KEY | 2026-04-25 | 2026-07-25 |
| ADMIN_API_KEY | 2026-04-25 | 2026-07-25 |
| ENCRYPTION_KEY | (미회전 — 마이그레이션 필요) | — |

---

## gitleaks 설치 및 pre-commit 훅 활성화

```bash
# macOS
brew install gitleaks

# Linux (직접 다운로드)
curl -sSfL https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_linux_x64.tar.gz | tar xz -C /usr/local/bin

# 훅 설치 (프로젝트 루트에서)
.scamanager/install-hook.sh
# 메뉴에서 "Install secrets pre-commit hook" 선택

# 수동 스캔
gitleaks detect --source . --config .gitleaks.toml
```

---

## GitHub Push Protection 활성화 (사용자 1회 설정)

1. https://github.com/xzawed/CustomWebService/settings/security_analysis
2. **Push protection** → Enable
3. **Secret scanning** → Enable
4. 이후 민감 패턴이 포함된 push는 GitHub이 자동 차단

---

## Cloudflare 봇 방어 설정 (P2.9)

### DNS 전환
1. Railway 설정에서 현재 커스텀 도메인(`xzawed.xyz`) 확인
2. Cloudflare에 도메인 추가 (nameserver 변경 필요)
3. DNS 레코드를 Cloudflare → Railway CNAME으로 설정

### 보안 규칙 활성화
- **Bot Fight Mode**: Security → Bots → Bot Fight Mode ON
- **Rate Limiting**: Rules → Rate Limiting
  - `/api/v1/generate`: IP당 분당 5회
  - `/api/v1/suggest-*`: IP당 분당 20회
- **WAF 룰**: Security → WAF → Managed Rules → Cloudflare Managed Ruleset ON

---

## 참고 문서

- [보안 헤더 설정](../../src/middleware.ts) — CSP, HSTS, X-Frame-Options
- [에러 처리 표준](../../src/lib/utils/errors.ts) — 클라이언트 응답 정보 최소화
- [gitleaks 룰](.../../.gitleaks.toml) — 시크릿 패턴 정의
