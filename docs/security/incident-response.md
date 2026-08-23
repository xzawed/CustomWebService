# 보안 인시던트 대응 절차

> **언제 읽나**: 시크릿이 노출됐거나 `ENCRYPTION_KEY`·`ADMIN_API_KEY`·`AUTH_SECRET` 을 회전해야 할 때. **`ENCRYPTION_KEY` 교체는 사용자 API 키를 전부 복호화 불가로 만든다**

> 스택 진실원: 루트 [`CLAUDE.md`](../../CLAUDE.md) · [`docs/architecture/system-spec.md`](../architecture/system-spec.md).
> 시크릿 목록의 정본은 [`docs/reference/env-vars.md`](../reference/env-vars.md). 이 문서는 **노출 시 회전 순서**와 **고아 자격증명 폐기**를 다룬다.
>
> **제품 정기 회전 목록에 넣지 말 것**(죽은 스택 — `AUTH_SECRET`/`ANTHROPIC_API_KEY`와 같은 주기의 회전 대상이 아님):
> `GITHUB_TOKEN`(외부 deploy export 제거, 2026-08-01), Supabase `service_role` / `SUPABASE_*`(SQLite 컷오버),
> `ADMIN_EMAIL`/`ADMIN_PASSWORD_HASH`(다중 사용자 전환).
> **≠ 발견 시 내버려 둬도 된다**는 뜻이 아니다. 죽은 스택 키를 발견하면 아래 [고아 자격증명](#고아-자격증명orphan-credential)을 따른다.
>
> 위 목록은 **2026-08-02에 전부 폐기·삭제 완료**됐다(아래 사례 기록). 현재 Railway에 잔존하는 죽은 자격증명은 없다.

---

## 고아 자격증명(orphan credential)

**정기 회전 대상 ≠ 발견 시 폐기 대상.**

제품 코드가 더 이상 읽지 않는 키라도 **출처에서 먼저 폐기**한 뒤 사본을 지운다.
**Railway 변수만 지우는 것은 사본 하나를 지우는 것**이다. Supabase 프로젝트가 살아 있으면
`service_role` JWT는 여전히 유효하고 **RLS를 우회**한다.

### 폐기 순서

1. **출처에서 폐기**
   - Supabase: 프로젝트 존재 확인 → 키 폐기 또는 프로젝트 삭제
   - GitHub: 토큰 revoke (Developer settings → tokens)
2. **그 다음** Railway 등 배포 환경의 사본 삭제 (`railway variable delete`는 재배포를 트리거하지 않을 수 있음 — 다음 배포 때 컨테이너에서 사라짐)
3. **다른 사본**도 찾을 것: GitHub Actions secrets, 과거 이슈·슬랙 붙여넣기, 로컬 `.env*` / 백업 파일

값 자체는 이 문서에 **절대 적지 않는다.**

### 사례 기록 — 2026-08-02 (✅ 해소)

**교훈이 남아야 하므로 지운 게 아니라 상태만 갱신한다.**

SQLite 컷오버(2026-06-23) 후 **약 6주**, 외부 deploy 스택 제거(2026-08-01) 후에도 Railway에
죽은 스택의 자격증명이 남아 있었다. 코드 참조는 0건이었지만 **자격증명은 코드가 아니라 사본이 있는 곳에서 산다.**

| 변수 | 클래스 | 폐기 결과 |
|------|--------|-----------|
| `SUPABASE_SERVICE_ROLE_KEY` | **219자** (JWT형·RLS 우회) | Supabase **프로젝트가 이미 없음**(=키 무효) 확인 → Railway 삭제 |
| `NEXT_PUBLIC_SUPABASE_URL` · `..._ANON_KEY` | 설정됨 | 동일 → Railway 삭제 |
| `GITHUB_TOKEN` | 설정됨 | **GitHub에서 revoke 완료** → Railway 삭제 |
| `GITHUB_ORG` | 설정됨 | 조직명 잔재 → Railway 삭제 |
| `AUTH_PROVIDER` | 설정됨 | 분기 제거로 사문화(참조 3건은 전부 주석) → Railway 삭제 |

Railway 변수 **67 → 61개**. 살아 있어야 하는 9개(`NEXT_PUBLIC_AUTH_PROVIDER`·`DB_PROVIDER`·
`AUTH_URL`·`AUTH_SECRET`·`ANTHROPIC_API_KEY`·`SLACK_WEBHOOK_URL`·`RESEND_API_KEY`·
`ENCRYPTION_KEY`·`ADMIN_API_KEY`)는 삭제 후 개별 확인했다.

**이 사례에서 배울 것 3가지**

1. **스택을 제거해도 자격증명은 따라 죽지 않는다.** 코드에서 `process.env` 참조가 0건이라는 것은
   "앱이 안 쓴다"는 뜻이지 "키가 무효다"가 아니다. 스택 제거 PR의 체크리스트에 **자격증명 폐기**를 넣을 것
2. **Supabase와 GitHub은 결론이 달랐다.** 전자는 프로젝트가 사라져 키가 자동 무효였지만,
   후자는 **PAT가 GitHub에 그대로 살아 있어 별도 revoke가 필요**했다. "죽은 스택"이라고 뭉뚱그리지 말 것
3. **삭제는 종료 코드가 아니라 대상 상태로 확인한다.** 첫 시도가 존재하지 않는 `--yes` 플래그로
   6건 전부 실패했는데 종료 코드는 0이었다. **변수 개수를 다시 세어** 잡았다

---

## 사례 기록 — 2026-08-07 `.scamanager` 토큰 공개 노출 (⏳ 오너 회전 대기)

근본원인 분석 중 발견됐다.

| 항목 | 실측 |
|---|---|
| 파일 | `.scamanager/config.json` — git **추적 중**이었다 |
| 내용 | `token` 64자 + 서버 엔드포인트 |
| 이 저장소 | **PUBLIC** · 커밋 `b2186f4`(**2026-04-08**) 이후 약 4개월 노출 |
| 전송 | **평문 HTTP** + **URL 쿼리스트링**(`?token=…`) — 프록시·서버 액세스 로그에 남는다 |
| 토큰 권한(스크립트 기준) | `GET /api/hook/verify` · `POST /api/hook/result`(리뷰 결과 **위조** 가능) |

### 이번에 한 것

- `.gitignore`에 `.scamanager/config.json` 추가 · `git rm --cached`로 추적 해제
- `config.example.json` 추가(토큰 자리는 플레이스홀더 — 2026-08-08 확인)
- 로컬 `config.json`은 남겨 훅 동작에 영향 없음

### ⚠️ 코드로는 끝나지 않는다 — 오너 액션

**추적 해제는 앞으로의 노출만 막는다. 커밋 `b2186f4` 이하 히스토리에는 토큰이 그대로 있고,
공개 저장소는 이미 클론·미러링됐을 수 있다. 유일한 실질 조치는 회전이다.**

1. SCAManager에서 **이 저장소의 토큰을 폐기·재발급**한다. 토큰은 저장소마다 다르므로
   이 조치는 **이 저장소에만** 해당한다
2. 서버를 **HTTPS 전용**으로, 토큰을 **쿼리스트링이 아니라 헤더**로 옮기는 것을 검토
   (쿼리스트링 토큰은 액세스 로그에 영구 기록된다)

> **범위 주의 — 이 문서는 이 저장소의 사건만 다룬다.**
> `.scamanager`는 여러 저장소가 함께 쓰는 도구이므로 같은 형태의 노출이 다른 곳에도 있을 수
> 있고, 실제로 2026-08-07~08에 워크스페이스 전수 조사를 해 **오너에게 직접 전달**했다.
> 그 목록은 **여기에 싣지 않는다** — 공개 저장소에 "미회전 자격증명이 어디 있는지"를 적는 것은
> 사건을 기록하는 게 아니라 **노출을 넓히는 것**이기 때문이다. 실제로 이 문서가 한때 그렇게
> 자랐고, 2026-08-08 오너 지적으로 되돌렸다. 다른 저장소의 조치는 그 저장소에서 추적한다.

> `.scamanager/pre-commit-secrets.sh`(gitleaks)가 저장소에 있는데 **`.git/hooks`에 설치돼
> 있지 않다.** 설치돼 있었다면 최초 커밋에서 걸렸을 수 있다. 다만 그 훅은 gitleaks 바이너리가
> 없으면 `exit 0`으로 스킵되므로, 설치만으로 보장되지는 않는다.

**토큰 유효성은 의도적으로 프로브하지 않았다.**

---

## 시크릿 노출 의심 시 즉시 조치

### 1. 노출 확인

```bash
# git history에서 패턴 검색 (PowerShell에서는 Select-String 등 사용)
git log --all --full-history -p -- "*.env*"

# gitleaks 전체 스캔 (설치 후)
gitleaks detect --source . --config .gitleaks.toml
```

Railway 변수·슬랙·이슈 본문·로그 덤프도 동시에 확인한다.

### 2. 시크릿 회전 체크리스트

> **⚠️ 2026-08-31 종료 구간에서는 "회전"이 아니라 "폐기"다.**
> 아래 절차는 서비스를 계속 운영한다는 전제로 쓰였다. 종료 작업으로 여기 올 때는 두 가지가 다르다:
> ① 신규 키를 만들 이유가 없다 — **발급처에서 폐기하고 Railway 변수를 지우는 것으로 끝난다.**
> ② **아래 "확인" 단계 다수가 지금 실행되지 않는다** — 생성·회원가입 킬스위치가 내려가 있고
> (2026-08-23), AI 제공자 한도는 **종료일 이후인 2026-09-01**에야 풀린다.
> 확인이 실패하는 것을 "폐기 실패"로 오인하지 말 것.
>
> **이름만 보고 폐기 목록을 만들지 말 것.** 값이 빈 문자열인 변수와 이미 무효화된 토큰이 섞여 있다 —
> 2026-08-23 실측에서 둘 다 실제로 나왔다. **값의 길이**와 **발급처 응답**으로 가른다
> (이 저장소는 PUBLIC이므로 그 목록 자체는 여기 적지 않는다).

노출이 확인되면 영향 범위에 해당하는 항목만, 가능한 한 빨리 회전. 항목 간 독립.

#### AUTH_SECRET (세션 서명)

1. 신규 시크릿 생성: `openssl rand -base64 32`
2. Railway env `AUTH_SECRET` 교체 → 재배포
3. 로컬 `.env.local` 동기화
4. **결과**: 기존 JWT 세션이 전부 무효 → 모든 사용자 재로그인 필요 (의도된 동작)

#### ANTHROPIC_API_KEY

1. https://console.anthropic.com/settings/keys → 기존 키 비활성화
2. 신규 키 생성
3. Railway `ANTHROPIC_API_KEY` 업데이트 → 재배포
4. 로컬 `.env.local` 업데이트
5. 확인: 생성/추천 요청 또는 admin test-generation 경로로 호출 성공
   — ⚠️ **2026-09-01 전까지는 이 확인이 불가능하다**(계정 한도). 종료 작업이라면 폐기만 하고 넘어간다

#### ADMIN_API_KEY

```bash
openssl rand -hex 32
```

1. 신규 키 생성 후 Railway·로컬 동기화
2. 확인:

```bash
curl -H "Authorization: Bearer $ADMIN_API_KEY" "https://xzawed.xyz/api/v1/health?detailed=true"
# 기대: checks/usage 포함 상세 JSON (키가 틀리면 공개 ok 폴백 — 상세가 안 오면 실패)
```

#### RESEND_API_KEY

1. Resend 대시보드에서 키 재발급·기존 폐기
2. Railway `RESEND_API_KEY` (+ `EMAIL_FROM` 유효성) 갱신
3. 확인: 재발송으로 메일이 실제로 나가는지 (미설정 시 콘솔 no-op이라 “조용히 성공”으로 오인하지 말 것)
   — ⚠️ **회원가입 경로는 킬스위치로 막혀 있어 검증에 쓸 수 없다**(2026-08-23~)

#### SLACK_WEBHOOK_URL

1. Slack 앱에서 webhook 재생성 또는 채널 재연결
2. Railway `SLACK_WEBHOOK_URL` 교체 (**빈 문자열 = 미설정**, 값 길이 확인)
3. 확인: 의도적 실패 경로 또는 백업 경보 트리거로 `#alerts` 도착

#### SQLITE_OFFSITE_BACKUP_URL

1. 유출된 URL/토큰을 수신 측에서 즉시 폐기·rotate
2. Railway 변수 교체 또는 제거 (미설정 = `NoopOffsiteSink`, 정상 운영 가능)
3. **시크릿 취급** — 덤프 본문에 사용자 행·해시·암호화 키가 포함될 수 있음
4. 반드시 `https://` — `http://` 등은 fail-closed 거부 (`env-vars.md` 참고)

#### 카탈로그 플랫폼 키 (`API_KEY_*`)

카탈로그 `auth_config.env_var` 이름 그대로 환경변수에 둔다 (하드코딩 목록 없음).

1. 해당 업스트림 콘솔에서 키 폐기·재발급
2. Railway의 해당 `API_KEY_*` 갱신
3. 확인: `GET /api/v1/admin/keys-verify` (`ADMIN_API_KEY`) — `needsPrefixFix` 등 결과 해석
4. 프록시 캐시는 키 지문(`keyFingerprint`)을 키에 넣으므로 교체 후 교차 응답은 새 항목으로 갈린다

대표 예: `API_KEY_NASA`, `API_KEY_UNSPLASH`, data.go.kr·카카오 계열 등 — 전체 표는 [env-vars.md](../reference/env-vars.md).

### 3. 회전 후 공통 검증

```bash
curl https://xzawed.xyz/api/v1/health
# 기대: {"status":"ok","timestamp":"..."}

curl -H "Authorization: Bearer $ADMIN_API_KEY" "https://xzawed.xyz/api/v1/health?detailed=true"
# 기대: status healthy|degraded, checks.database / checks.ai
```

로그인 스모크를 권장한다. ⚠️ **회원가입·생성은 킬스위치로 막혀 있어 스모크에 쓸 수 없다**(2026-08-23~).

---

## ENCRYPTION_KEY — 회전 도구 없음

> **경고를 절차로 착각하지 말 것.**

| 사실 | 내용 |
|------|------|
| **현 상태** | `scripts/migrate-encryption-key.ts` **존재하지 않는다.** `scripts/`에는 `generateCountries.ts`, `runGenerationLoadTest.ts`만 있다. |
| **키를 바꾸면** | `user_api_keys.encrypted_key`를 기존 키로 복호화할 수 없어 **등록된 사용자 API 키가 전부 사용 불가**가 된다. |
| **자동 재암호화** | 없음. |
| **노출 시 선택지** | (1) 키가 **실제로 유출**됐고 즉시 봉쇄가 최우선이면 키를 교체하고, 사용자에게 API 키 **재등록**을 안내한다. (2) 유출이 불확실하면 교체하지 **말고** 접근 경로(로그·백업·이슈)부터 차단한다. |
| **신규 구현** | 재암호화 마이그레이션을 새로 작성하기 전에는 “스크립트 실행”을 런북에 다시 넣지 말 것. |

키 길이: 정확히 32바이트 권장. `openssl rand -hex 32`는 64자 hex — 초과 시 경고 후 첫 32바이트만 사용 (`env-vars.md`).

---

## 정기 시크릿 회전 (권장 리듬)

고정 날짜표는 금방 썩는다. 아래는 **우선순위** 가이드다.

| 시크릿 | 비고 |
|--------|------|
| `ANTHROPIC_API_KEY` | 분기 또는 유출 의심 시 즉시 |
| `ADMIN_API_KEY` | 분기 또는 담당자 이탈 시 |
| `AUTH_SECRET` | 유출 시에만 (전원 로그아웃) |
| `RESEND_API_KEY` · `SLACK_WEBHOOK_URL` | 유출·채널 이전 시 |
| `API_KEY_*` | 업스트림 정책·유출 시 |
| `SQLITE_OFFSITE_BACKUP_URL` | 사용 중일 때만, 유출 시 즉시 |
| `ENCRYPTION_KEY` | **도구 없이 돌리지 말 것** (위 절) |

---

## gitleaks · pre-commit

```bash
# macOS
brew install gitleaks

# 훅 설치 (프로젝트 루트)
.scamanager/install-hook.sh
# 메뉴에서 secrets pre-commit 선택

gitleaks detect --source . --config .gitleaks.toml
```

---

## GitHub Push Protection (저장소 설정, 1회)

1. https://github.com/xzawed/CustomWebService/settings/security_analysis  
2. **Push protection** → Enable  
3. **Secret scanning** → Enable  

---

## Cloudflare 봇 방어 (선택 운영)

DNS·WAF를 Cloudflare 앞에 둘 경우 예시:

- Bot Fight Mode ON  
- Rate Limiting 예: `/api/v1/generate` IP당 분당 소량, `/api/v1/suggest-*` 상대적 완화  
- Managed WAF Ruleset ON  

앱 내부 레이트리밋(생성 SQLite 원자적, auth/proxy 인메모리)과 **이중**이므로 임계값은 관측 후 조정.

---

## 참고

- [보안 헤더](../../src/middleware.ts) — CSP, HSTS, X-Frame-Options  
- [에러 처리](../../src/lib/utils/errors.ts) — 클라이언트 노출 최소화  
- [gitleaks 룰](../../.gitleaks.toml)  
- [환경변수](../reference/env-vars.md)  
- [운영·백업](../guides/operations.md)  
