# 마무리 작업 가이드 (Setup & Launch Checklist)

> 코드는 모두 구현 완료되었습니다.
> 아래 작업은 외부 서비스 설정 및 연동 테스트로, 순서대로 진행하시면 됩니다.
>
> **이 문서는 개발 경험이 없는 분도 따라할 수 있도록 작성되었습니다.**
> 각 단계마다 "어디에 접속하여, 무엇을 클릭하고, 무엇을 입력하는지" 상세히 안내합니다.

---

## 사전 준비물

시작하기 전에 아래 항목들을 준비해주세요:

| 준비물 | 설명 |
|--------|------|
| **Google 계정** | Gmail 주소가 있으면 됩니다 (Google OAuth에 사용) |
| **GitHub 계정** | https://github.com 에서 무료 가입 (코드 저장소, GitHub OAuth에 사용) |
| **메모장 (또는 메모 앱)** | 중간에 복사하는 키(Key)를 임시로 저장해둘 곳이 필요합니다 |
| **Chrome 브라우저** | 다른 브라우저도 가능하지만 Chrome을 권장합니다 |

---

## Step 1. Supabase 프로젝트 생성 (약 10분)

> **Supabase란?** 우리 서비스의 데이터를 저장하고, 회원 로그인을 처리해주는 서버입니다.
> 직접 서버를 만들 필요 없이 웹사이트에서 클릭만으로 설정할 수 있습니다.

### 1-1. Supabase 가입하기

1. 크롬 브라우저에서 **https://supabase.com** 에 접속합니다
2. 화면 오른쪽 위의 **"Start your project"** 버튼을 클릭합니다
3. **"Continue with GitHub"** 버튼을 클릭합니다
4. GitHub 로그인 화면이 나오면 GitHub 계정으로 로그인합니다
5. "Authorize Supabase" 라는 권한 요청이 나오면 **"Authorize"** 버튼을 클릭합니다
6. 로그인이 완료되면 Supabase 대시보드 화면이 나옵니다

### 1-2. 새 프로젝트 만들기

1. 대시보드에서 초록색 **"New Project"** 버튼을 클릭합니다
2. 아래와 같이 입력합니다:
   - **Name** (프로젝트 이름): `custom-web-service` 라고 입력
   - **Database Password** (데이터베이스 비밀번호):
     - **"Generate a password"** 버튼을 클릭하면 자동으로 강력한 비밀번호가 생성됩니다
     - **중요: "Copy" 버튼을 눌러서 메모장에 반드시 붙여넣기 해두세요!** (나중에 다시 볼 수 없습니다)
   - **Region** (서버 위치): 드롭다운을 클릭하여 **"Northeast Asia (Tokyo) - ap-northeast-1"** 을 선택
   - **Pricing Plan**: Free (무료) 확인
3. 하단의 **"Create new project"** 버튼을 클릭합니다
4. 프로젝트가 생성되는 동안 약 2분 정도 기다립니다 (화면에 진행 상태가 표시됩니다)
5. "Welcome to your new project" 라는 문구가 나오면 생성 완료입니다

### 1-3. API 키 복사하기

> **API 키란?** 우리 서비스가 Supabase 서버와 통신할 때 사용하는 "출입증" 같은 것입니다.
> 총 3개의 키를 복사해야 합니다.

1. 왼쪽 메뉴 맨 아래에 있는 톱니바퀴 모양 **"Project Settings"** (또는 ⚙ Settings)를 클릭합니다
2. 왼쪽 세부 메뉴에서 **"API"** 를 클릭합니다
3. 이제 화면에 여러 키가 보입니다. 아래 3개를 각각 복사합니다:

| 화면에 보이는 항목 | 복사할 위치 | 설명 |
|--|--|--|
| **Project URL** | `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxxxxx.supabase.co` 형태의 주소 |
| **anon** public (Project API keys 섹션) | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGci...` 로 시작하는 긴 문자열 |
| **service_role** (Project API keys 섹션) | `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGci...` 로 시작하는 긴 문자열 |

> **복사하는 방법**: 각 키 오른쪽에 있는 **복사 아이콘** (사각형 2개가 겹친 모양)을 클릭하면 자동으로 복사됩니다.
> 복사한 내용을 메모장에 붙여넣기 해두세요.

### 1-4. .env.local 파일 만들기

> **`.env.local` 파일이란?** 방금 복사한 키(비밀번호)들을 저장하는 파일입니다.
> 이 파일은 내 컴퓨터에만 존재하며, 다른 사람에게 공유되지 않습니다.

1. 프로젝트 폴더에 `.env.example` 이라는 파일이 이미 있습니다
2. 이 파일을 복사하여 `.env.local` 이라는 이름으로 만들어야 합니다
3. **방법 A - 터미널 사용** (프로젝트 폴더에서):
   ```bash
   cp .env.example .env.local
   ```
4. **방법 B - 파일 탐색기 사용**:
   - 프로젝트 폴더를 파일 탐색기로 엽니다
   - `.env.example` 파일을 찾습니다 (숨김 파일이므로, 파일 탐색기 상단의 "보기" → "숨긴 항목"을 체크해야 보일 수 있습니다)
   - 이 파일을 복사(Ctrl+C) → 붙여넣기(Ctrl+V) 합니다
   - 복사된 파일의 이름을 `.env.local`로 변경합니다
5. `.env.local` 파일을 메모장이나 텍스트 편집기로 엽니다
6. 아까 메모장에 저장해둔 키를 아래와 같이 `=` 뒤에 붙여넣습니다:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci.....여기에_anon_키_붙여넣기
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci.....여기에_service_role_키_붙여넣기
```

> **주의**: `=` 앞뒤에 공백(빈칸)을 넣지 마세요. 바로 붙여서 써야 합니다.

7. 파일을 저장합니다 (Ctrl+S)

---

## Step 2. DB 테이블 생성 + 시드 데이터 (약 5분)

> **이 단계에서 하는 일**: 데이터베이스에 "표(테이블)"를 만들고, 초기 데이터를 넣습니다.
> 우리 서비스에서 사용할 API 목록이나 설정값이 여기에 저장됩니다.

### 2-1. SQL 편집기 열기

1. **Supabase 대시보드**로 돌아갑니다 (아까 열어둔 브라우저 탭)
2. 왼쪽 메뉴에서 **"SQL Editor"** 를 클릭합니다 (데이터베이스 아이콘 옆에 있습니다)
3. 가운데에 큰 입력창(에디터)이 나타납니다. 여기에 SQL 코드를 붙여넣고 실행할 것입니다

### 2-2. 테이블 만들기 (첫 번째 실행)

1. 프로젝트 폴더에서 이 파일을 찾아 엽니다:
   ```
   supabase/migrations/001_initial_schema.sql
   ```
   - 파일 탐색기에서 `supabase` 폴더 → `migrations` 폴더 → `001_initial_schema.sql` 파일을 메모장으로 엽니다
2. 파일 내용을 **전체 선택** (Ctrl+A) → **복사** (Ctrl+C) 합니다
3. Supabase SQL Editor 입력창에 **붙여넣기** (Ctrl+V) 합니다
4. 오른쪽 하단 (또는 상단)의 초록색 **"Run"** 버튼을 클릭합니다
5. 하단에 **"Success"** 메시지가 나오면 성공입니다
   - 이것으로 10개의 테이블, 인덱스, 보안 정책이 만들어졌습니다

> **에러가 나는 경우**: "already exists" 라는 메시지가 나오면 이미 실행된 것이므로 무시하고 다음으로 넘어갑니다.

### 2-3. 초기 데이터 넣기 (두 번째 실행)

1. SQL Editor 입력창의 내용을 전부 지웁니다 (Ctrl+A → Delete)
2. 프로젝트 폴더에서 이 파일을 찾아 엽니다:
   ```
   supabase/seed.sql
   ```
3. 파일 내용을 **전체 선택** (Ctrl+A) → **복사** (Ctrl+C) 합니다
4. SQL Editor 입력창에 **붙여넣기** (Ctrl+V) 합니다
5. **"Run"** 버튼을 클릭합니다
6. **"Success"** 메시지가 나오면 성공입니다
   - 54개의 무료 API 정보와 7개의 기능 설정값이 입력되었습니다

### 2-4. 데이터가 잘 들어갔는지 확인하기

1. 왼쪽 메뉴에서 **"Table Editor"** 를 클릭합니다 (표 모양 아이콘)
2. 왼쪽에 테이블 목록이 나옵니다. **"api_catalog"** 을 클릭합니다
3. 오른쪽에 표 형태로 데이터가 보입니다
4. "Open-Meteo", "REST Countries" 등 API 이름이 보이면 정상입니다

---

## Step 3. Google OAuth 설정 (약 10분)

> **OAuth란?** "Google 계정으로 로그인" 기능을 말합니다.
> 사용자가 아이디/비밀번호를 새로 만들 필요 없이, 이미 가지고 있는 Google 계정으로 바로 로그인할 수 있게 해줍니다.

### 3-1. Google Cloud Console 접속 및 프로젝트 만들기

1. 새 브라우저 탭에서 **https://console.cloud.google.com** 에 접속합니다
2. Google 계정으로 로그인합니다 (이미 로그인되어 있으면 바로 대시보드가 보입니다)
3. **이용약관 동의** 화면이 나오면 동의하고 진행합니다
4. 화면 상단에 프로젝트 이름이 보이는 드롭다운이 있습니다 → 클릭합니다
5. 팝업 창 오른쪽 위의 **"새 프로젝트"** (또는 "NEW PROJECT") 버튼을 클릭합니다
6. 프로젝트 이름에 `custom-web-service` 라고 입력합니다
7. **"만들기"** (또는 "CREATE") 버튼을 클릭합니다
8. 잠시 기다리면 프로젝트가 생성됩니다
9. 상단 드롭다운에서 방금 만든 **"custom-web-service"** 프로젝트가 선택되어 있는지 확인합니다

### 3-2. OAuth 동의 화면 설정하기

> 이 단계는 "우리 서비스가 Google 로그인을 사용한다"고 Google에 등록하는 과정입니다.

1. 왼쪽 메뉴에서 **"API 및 서비스"** (또는 "APIs & Services")를 클릭합니다
   - 메뉴가 보이지 않으면 왼쪽 위의 **☰ (햄버거 메뉴)** 를 클릭하세요
2. 펼쳐지는 하위 메뉴에서 **"OAuth 동의 화면"** (또는 "OAuth consent screen")을 클릭합니다
3. **"User Type"** 을 선택하는 화면이 나옵니다:
   - **"외부"** (또는 "External")를 선택합니다
   - **"만들기"** (또는 "CREATE") 버튼을 클릭합니다
4. **앱 정보 입력 화면**이 나옵니다:
   - **앱 이름**: `CustomWebService` 입력
   - **사용자 지원 이메일**: 드롭다운에서 본인 이메일을 선택합니다
   - (나머지 항목은 비워두어도 됩니다)
   - 맨 아래로 스크롤하여 **개발자 연락처 정보** → 이메일 주소에 본인 이메일을 입력합니다
   - **"저장 후 계속"** (또는 "SAVE AND CONTINUE") 버튼을 클릭합니다
5. **범위(Scopes) 설정 화면**이 나옵니다:
   - **"범위 추가 또는 삭제"** (또는 "ADD OR REMOVE SCOPES") 버튼을 클릭합니다
   - 팝업에서 아래 3개를 찾아 체크합니다:
     - `email` (사용자 이메일 주소 보기)
     - `profile` (사용자 기본 프로필 보기)
     - `openid` (OpenID Connect)
   - **"업데이트"** (또는 "UPDATE") 버튼을 클릭합니다
   - **"저장 후 계속"** 버튼을 클릭합니다
6. **테스트 사용자 화면**이 나옵니다:
   - 여기서는 아무것도 입력하지 않고 **"저장 후 계속"** 을 클릭합니다
7. **요약 화면**이 나옵니다:
   - 내용을 확인하고 **"대시보드로 돌아가기"** 를 클릭합니다

### 3-3. OAuth 클라이언트 ID 만들기

> 이 단계에서 실제로 "로그인 버튼"에 사용할 키를 발급받습니다.

1. 왼쪽 메뉴에서 **"사용자 인증 정보"** (또는 "Credentials")를 클릭합니다
2. 상단의 **"+ 사용자 인증 정보 만들기"** (또는 "+ CREATE CREDENTIALS") 버튼을 클릭합니다
3. 드롭다운에서 **"OAuth 클라이언트 ID"** 를 선택합니다
4. 아래와 같이 입력합니다:
   - **애플리케이션 유형**: `웹 애플리케이션` (또는 "Web application") 선택
   - **이름**: `CustomWebService` 입력
5. **"승인된 리디렉션 URI"** 섹션에서:
   - **"+ URI 추가"** 버튼을 클릭합니다
   - 아래 주소를 입력합니다 (⚠ 본인의 Supabase 프로젝트 URL로 교체 필요):
     ```
     https://xxxxxxxx.supabase.co/auth/v1/callback
     ```
   - `xxxxxxxx` 부분은 Step 1에서 복사한 **Project URL**에서 `https://` 와 `.supabase.co` 사이의 문자열입니다
   - 예시: Project URL이 `https://abcd1234.supabase.co` 이면 → `https://abcd1234.supabase.co/auth/v1/callback`
6. **"만들기"** (또는 "CREATE") 버튼을 클릭합니다
7. 팝업 창에 **"클라이언트 ID"** 와 **"클라이언트 보안 비밀번호"** 가 표시됩니다
   - **두 값 모두 복사하여 메모장에 붙여넣기 해두세요!**
   - 클라이언트 ID 예시: `123456789-abcdefg.apps.googleusercontent.com`
   - 클라이언트 보안 비밀번호 예시: `GOCSPX-AbCdEfGhIjKlMnOp`

### 3-4. Supabase에 Google 로그인 연결하기

1. **Supabase 대시보드**가 열린 브라우저 탭으로 돌아갑니다
2. 왼쪽 메뉴에서 **"Authentication"** (자물쇠 아이콘)을 클릭합니다
3. 왼쪽 세부 메뉴에서 **"Providers"** 를 클릭합니다
4. Provider 목록에서 **"Google"** 을 찾아 클릭하여 펼칩니다
5. **"Enable Sign in with Google"** 토글을 켭니다 (오른쪽으로 밀기)
6. 아래 항목을 입력합니다:
   - **Client ID (for oauth)**: 메모장에서 복사한 **클라이언트 ID** 붙여넣기
   - **Client Secret (for oauth)**: 메모장에서 복사한 **클라이언트 보안 비밀번호** 붙여넣기
7. **"Save"** 버튼을 클릭합니다

---

## Step 4. GitHub OAuth 설정 (약 5분)

> **이 단계에서 하는 일**: "GitHub 계정으로 로그인" 기능을 설정합니다.
> Google 로그인과 마찬가지로, GitHub 계정으로도 우리 서비스에 로그인할 수 있게 해줍니다.

### 4-1. GitHub에서 OAuth App 만들기

1. 새 브라우저 탭에서 **https://github.com/settings/developers** 에 접속합니다
   - GitHub 로그인이 필요할 수 있습니다
2. 왼쪽 메뉴에서 **"OAuth Apps"** 를 클릭합니다
3. 오른쪽의 **"New OAuth App"** 버튼을 클릭합니다
4. 아래와 같이 입력합니다:
   - **Application name**: `CustomWebService`
   - **Homepage URL**: `http://localhost:3000`
   - **Application description**: 비워두어도 됩니다 (선택사항)
   - **Authorization callback URL** (⚠ 중요):
     ```
     https://xxxxxxxx.supabase.co/auth/v1/callback
     ```
     - Step 3에서 사용한 것과 동일한 주소를 입력합니다
     - `xxxxxxxx` 부분을 본인의 Supabase 프로젝트 ID로 교체하세요
5. **"Register application"** 버튼을 클릭합니다
6. 앱 상세 화면이 나옵니다:
   - **Client ID** 가 바로 보입니다 → 메모장에 복사합니다
   - **Client secrets** 섹션에서 **"Generate a new client secret"** 버튼을 클릭합니다
   - 생성된 Secret 값이 표시됩니다 → **즉시 메모장에 복사합니다!** (페이지를 벗어나면 다시 볼 수 없습니다)

### 4-2. Supabase에 GitHub 로그인 연결하기

1. **Supabase 대시보드** 브라우저 탭으로 돌아갑니다
2. 왼쪽 메뉴 **"Authentication"** → **"Providers"** 로 이동합니다
3. Provider 목록에서 **"GitHub"** 을 찾아 클릭하여 펼칩니다
4. **"Enable Sign in with GitHub"** 토글을 켭니다
5. 아래 항목을 입력합니다:
   - **Client ID (for oauth)**: GitHub에서 복사한 **Client ID** 붙여넣기
   - **Client Secret (for oauth)**: GitHub에서 복사한 **Client Secret** 붙여넣기
6. **"Save"** 버튼을 클릭합니다

---

## Step 5. Supabase Auth 추가 설정 (약 2분)

> **이 단계에서 하는 일**: 로그인 완료 후 사용자를 어디로 보낼지 설정합니다.

### 5-1. URL 설정하기

1. **Supabase 대시보드**에서 왼쪽 메뉴 **"Authentication"** 을 클릭합니다
2. 왼쪽 세부 메뉴에서 **"URL Configuration"** 을 클릭합니다
3. 아래 항목을 설정합니다:

**Site URL (사이트 주소)**:
- 입력란에 아래 주소를 입력합니다:
  ```
  http://localhost:3000
  ```

**Redirect URLs (리다이렉트 주소 목록)**:
- **"Add URL"** 버튼을 클릭합니다
- 아래 주소를 입력합니다:
  ```
  http://localhost:3000/callback
  ```
- **"Add URL"** (또는 "Save") 버튼을 클릭합니다

> **이것이 의미하는 것**: 로그인에 성공하면 사용자를 `http://localhost:3000/callback` 으로 보내고,
> 서버사이드 Route Handler에서 PKCE 코드 교환 및 세션 생성을 완료합니다.
> 첫 로그인 시 `users` 테이블에 사용자 레코드도 자동 생성한 뒤 대시보드로 이동시킵니다.

---

## Step 6. xAI Grok API 키 발급 (약 3분)

> **xAI Grok이란?** xAI가 만든 AI 서비스입니다.
> 우리 서비스에서 "AI로 웹서비스 코드를 자동 생성"하는 기능에 사용됩니다.

### 6-1. xAI Console에서 API 키 발급받기

1. 새 브라우저 탭에서 **https://console.x.ai** 에 접속합니다
2. 계정으로 로그인합니다 (X/Twitter 계정 또는 이메일)
3. 이용약관 동의 화면이 나오면 동의합니다
4. 왼쪽 메뉴 또는 상단에서 **"API Keys"** 를 클릭합니다
5. **"Create API key"** 버튼을 클릭합니다
6. API 키가 생성됩니다 (예: `xai-xxxxxxxxxxxxxxxxxxxx`)
7. **"Copy"** 버튼을 눌러 키를 복사합니다 → 메모장에 붙여넣기

### 6-2. .env.local 파일에 키 추가하기

1. `.env.local` 파일을 텍스트 편집기로 엽니다
2. `XAI_API_KEY=` 줄을 찾아서 `=` 뒤에 복사한 키를 붙여넣습니다:
   ```
   XAI_API_KEY=xai-xxxxxxxxxxxxxxxxxxxx
   ```
3. 파일을 저장합니다 (Ctrl+S)

### 6-3. (선택) API 키가 작동하는지 테스트하기

> 이 단계는 건너뛰어도 괜찮습니다. API 키가 정상인지 미리 확인하고 싶을 때만 진행하세요.

1. 터미널(명령 프롬프트)을 엽니다
2. 아래 명령어에서 `YOUR_KEY` 부분을 방금 복사한 키로 교체한 뒤 실행합니다:
   ```bash
   curl "https://api.x.ai/v1/chat/completions" \
     -H 'Content-Type: application/json' \
     -H 'Authorization: Bearer YOUR_KEY' \
     -d '{"model":"grok-3-mini","messages":[{"role":"user","content":"Hello"}]}'
   ```
3. `"content": "Hello! ..."` 와 같은 응답이 돌아오면 정상 작동하는 것입니다
4. 에러가 나오면 키를 다시 확인하거나 Step 6-1부터 다시 진행합니다

---

## Step 7. 로컬 실행 테스트 (약 10분)

> **이 단계에서 하는 일**: 지금까지 설정한 것이 제대로 동작하는지
> 내 컴퓨터에서 서비스를 실행하여 확인합니다.

### 7-1. 서비스 실행하기

1. 터미널(명령 프롬프트)을 엽니다
2. 프로젝트 폴더로 이동합니다:
   ```bash
   cd D:\Source\CustomWebService
   ```
3. 아래 명령어를 입력하여 서비스를 실행합니다:
   ```bash
   pnpm dev
   ```
4. 잠시 기다리면 아래와 비슷한 메시지가 나옵니다:
   ```
   ▲ Next.js 15.x.x
   - Local: http://localhost:3000
   ```
5. 이 메시지가 나오면 서비스가 실행된 것입니다!

> **서비스를 종료하려면**: 터미널에서 `Ctrl+C` 를 누릅니다.
> 테스트가 끝날 때까지는 종료하지 마세요.

### 7-2. 테스트 체크리스트

크롬 브라우저를 열고 아래 항목을 하나씩 확인합니다.
각 항목이 정상이면 ✅, 문제가 있으면 ❌ 를 체크하세요.

| # | 테스트 항목 | 확인 방법 | 결과 |
|---|-----------|-----------|------|
| 1 | **랜딩 페이지** | 주소창에 `http://localhost:3000` 입력 → Enter → 히어로 섹션(큰 제목과 설명)이 보이면 정상 | ☐ |
| 2 | **API 카탈로그** | 주소창에 `http://localhost:3000/catalog` 입력 → Enter → API 카드들이 목록으로 보이면 정상 (54개) | ☐ |
| 3 | **카테고리 필터** | 카탈로그 페이지에서 상단의 카테고리 탭(weather, finance 등)을 클릭 → 해당 카테고리만 필터링되면 정상 | ☐ |
| 4 | **검색** | 카탈로그 페이지의 검색창에 "날씨" 입력 → 관련 API만 표시되면 정상 | ☐ |
| 5 | **Google 로그인** | 주소창에 `http://localhost:3000/login` 입력 → "Google로 로그인" 버튼 클릭 → Google 계정 선택 → 로그인 후 대시보드(`/dashboard`)로 이동하면 정상 | ☐ |
| 6 | **GitHub 로그인** | (먼저 로그아웃 후) 로그인 페이지 → "GitHub으로 로그인" 버튼 클릭 → GitHub 로그인 → 대시보드로 이동하면 정상 | ☐ |
| 7 | **대시보드** | 로그인 상태에서 `http://localhost:3000/dashboard` 접속 → "아직 만든 서비스가 없어요" 등의 안내 문구가 보이면 정상 | ☐ |
| 8 | **빌더 Step 1** | `http://localhost:3000/builder` 접속 → API 카드들이 보이고 체크박스를 선택할 수 있으면 정상 | ☐ |
| 9 | **빌더 Step 2** | Step 1에서 API를 선택한 뒤 "다음" 클릭 → 텍스트 입력창이 나오고, 글자 수가 표시되면 정상 | ☐ |
| 10 | **빌더 Step 3** | Step 2에서 설명 입력 후 "다음" 클릭 → "준비 완료!" 화면이 나오고 "생성하기" 버튼이 보이면 정상 | ☐ |
| 11 | **헬스체크 API** | 주소창에 `http://localhost:3000/api/v1/health` 입력 → `{"status":"ok"...}` 같은 텍스트가 보이면 정상 | ☐ |
| 12 | **헤더 네비게이션** | 로그인 상태에서 화면 상단 메뉴에 카탈로그/빌더/대시보드 링크가 보이면 정상 | ☐ |
| 13 | **로그아웃** | 오른쪽 상단의 프로필 사진(아바타) 클릭 → "로그아웃" 클릭 → 랜딩 페이지로 이동하면 정상 | ☐ |

> **문제가 있는 경우**: 해당 Step으로 돌아가서 설정을 다시 확인하세요.
> 특히 `.env.local` 파일의 키 값이 정확한지 확인이 중요합니다.

---

## Step 8. Railway 배포 (약 10분)

> **Railway란?** 우리가 만든 서비스를 인터넷에 공개하여 누구나 접속할 수 있게 해주는 호스팅 서비스입니다.
> 무료로 사용 가능하며, GitHub와 연동하여 코드가 바뀌면 자동으로 다시 배포해줍니다.

### 8-1. Railway 가입 및 프로젝트 연결하기

1. 새 브라우저 탭에서 **https://railway.app** 에 접속합니다
2. **"Sign Up"** 또는 **"Start a New Project"** 버튼을 클릭합니다
3. **"Continue with GitHub"** 를 선택하여 GitHub 계정으로 가입/로그인합니다
4. 가입이 완료되면 대시보드가 나옵니다
5. **"New Project"** 버튼을 클릭합니다
6. **"Deploy from GitHub Repo"** 를 선택합니다
7. **"CustomWebService"** 저장소를 찾아 선택합니다
   - 저장소가 보이지 않으면 **"Configure GitHub App"** 를 클릭하여 저장소 접근 권한을 추가합니다

### 8-2. 환경변수 설정하기

> **환경변수란?** 앞서 `.env.local` 에 저장한 키들을 Railway 서버에도 알려주는 것입니다.

1. 프로젝트가 생성되면 서비스를 클릭합니다
2. **"Variables"** 탭을 클릭합니다
3. 아래 5개의 환경변수를 하나씩 추가합니다:

   **추가 방법**: **"+ Add"** 버튼을 클릭하여 이름(NAME)과 값(VALUE)을 입력

   | NAME (이름) | VALUE (값) |
   |------------|-----------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Step 1에서 복사한 Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Step 1에서 복사한 anon 키 |
   | `SUPABASE_SERVICE_ROLE_KEY` | Step 1에서 복사한 service_role 키 |
   | `XAI_API_KEY` | Step 6에서 복사한 xAI Grok API 키 |
   | `NEXT_PUBLIC_APP_URL` | 일단 `https://custom-web-service.up.railway.app` 입력 (배포 후 실제 URL로 수정) |

4. 환경변수를 추가하면 자동으로 재배포가 시작됩니다
5. 빌드가 시작됩니다. 약 2분 정도 기다립니다
6. **"Deploy"** 상태가 **"Success"** 로 바뀌면 배포 성공입니다!
7. **"Settings"** 탭 → **"Networking"** 에서 **"Generate Domain"** 을 클릭하여 공개 URL을 생성합니다
8. 화면에 표시된 **배포 URL**을 복사합니다 (예: `https://custom-web-service-abc123.up.railway.app`)
9. 이 URL을 브라우저에 입력하면 서비스가 인터넷에서 동작하는 것을 확인할 수 있습니다

### 8-3. 배포 후 URL 업데이트하기

> 배포가 완료되면 실제 URL을 각 서비스에 알려주어야 로그인 등이 정상 동작합니다.

**A. Railway 환경변수 업데이트:**

1. Railway 대시보드에서 방금 만든 프로젝트의 서비스를 클릭합니다
2. **"Variables"** 탭을 클릭합니다
3. `NEXT_PUBLIC_APP_URL` 항목을 찾아 클릭하여 편집합니다
4. 값을 실제 배포 URL로 변경합니다 (예: `https://custom-web-service-abc123.up.railway.app`)
6. **"Save"** 클릭

**B. Supabase URL 설정 업데이트:**

1. **Supabase 대시보드** → **"Authentication"** → **"URL Configuration"**
2. **Site URL**을 Railway 배포 URL로 변경합니다:
   ```
   https://custom-web-service-abc123.up.railway.app
   ```
3. **Redirect URLs** 에 아래 주소를 추가합니다 (**"Add URL"** 클릭):
   ```
   https://custom-web-service-abc123.up.railway.app/callback
   ```
   - 기존의 `http://localhost:3000/callback`은 그대로 두세요 (로컬 개발용)
4. **"Save"** 클릭

**C. GitHub OAuth App URL 업데이트:**

1. **https://github.com/settings/developers** 접속
2. **"OAuth Apps"** → 아까 만든 **"CustomWebService"** 클릭
3. **Homepage URL**을 Railway 배포 URL로 변경합니다:
   ```
   https://custom-web-service-abc123.up.railway.app
   ```
4. **"Update application"** 버튼을 클릭합니다

> **참고**: Google OAuth의 리디렉션 URI는 변경할 필요가 없습니다.
> Google 로그인은 Supabase 서버를 통해 처리되므로 기존 Supabase 콜백 URL이 그대로 사용됩니다.

### 8-4. 변경사항 반영을 위해 재배포하기

1. Railway 대시보드에서 프로젝트의 서비스를 클릭합니다
2. **"Deployments"** 탭을 클릭합니다
3. 환경변수 변경 시 자동으로 재배포가 트리거됩니다
4. 약 2분 후 재배포가 완료됩니다

---

## Step 9. 전체 흐름 E2E 확인 (약 15분)

> **E2E란?** "End to End"의 줄임말로, 처음부터 끝까지 전체 흐름을 테스트한다는 뜻입니다.
> 배포된 사이트에서 실제 사용자처럼 모든 기능을 한 번씩 사용해봅니다.

### 테스트 순서

**1단계: 랜딩 페이지 확인**
- 브라우저에서 Railway 배포 URL에 접속합니다
- 서비스 소개 화면(히어로 섹션)이 정상적으로 표시되는지 확인합니다
- **"무료로 시작하기"** 버튼을 클릭합니다

**2단계: 로그인**
- 로그인 페이지로 이동됩니다
- **Google** 또는 **GitHub** 버튼을 클릭하여 로그인합니다
- 로그인 후 자동으로 대시보드 페이지로 이동하는지 확인합니다

**3단계: 대시보드 확인**
- 대시보드에 "아직 만든 서비스가 없어요" 라는 안내가 보이는지 확인합니다
- **"서비스 만들러 가기"** 버튼을 클릭합니다

**4단계: 빌더 - API 선택 (Step 1)**
- API 카드들이 표시됩니다
- 2~3개의 API를 선택합니다 (예: **Open-Meteo**, **REST Countries**)
- 체크박스를 클릭하여 선택한 뒤 **"다음"** 버튼을 클릭합니다

**5단계: 빌더 - 서비스 설명 입력 (Step 2)**
- 텍스트 입력창이 나옵니다
- 아래 예시처럼 50자 이상의 설명을 입력합니다:
  ```
  서울의 현재 날씨와 한국 국가 정보를 한 화면에 보여주는 깔끔한 대시보드를 만들어주세요.
  온도, 습도, 국기, 수도, 인구 정보를 카드로 보여주세요.
  ```
- 글자 수가 입력창 아래에 표시되는지 확인합니다
- **"다음"** 버튼을 클릭합니다

**6단계: 빌더 - AI 생성 (Step 3)**
- "준비 완료!" 화면이 나옵니다
- **"생성하기"** 버튼을 클릭합니다
- 프로그레스 바(진행률 표시줄)가 움직이며 AI가 코드를 생성합니다
- 완료될 때까지 기다립니다 (약 1~3분)

**7단계: 생성 완료 확인**
- 생성이 완료되면 **"대시보드에서 확인하기"** 버튼을 클릭합니다

**8단계: 대시보드에서 결과 확인**
- 대시보드에 방금 생성한 프로젝트 카드가 보이는지 확인합니다
- **"상세 보기"** 를 클릭하여 프로젝트 상세 페이지로 이동합니다

**9단계: 미리보기**
- 상세 페이지에서 **"미리보기"** 버튼을 클릭합니다
- AI가 생성한 웹서비스가 화면에 렌더링(표시)되는지 확인합니다

> **모든 단계가 정상 동작하면 서비스 배포가 완료된 것입니다!**

---

## Step 10. (선택) 추가 개선 작업

> 아래 작업은 핵심 기능과 무관한 선택 사항입니다.
> 서비스를 더 완성도 있게 만들고 싶을 때 필요한 것만 골라서 진행하세요.

### 우선순위: 높음

| 작업 | 설명 | 진행 방법 |
|------|------|----------|
| **Railway 토큰 설정** | 사용자가 만든 서비스를 자동으로 인터넷에 배포하는 기능을 활성화합니다 | Railway 대시보드 → Settings → Tokens → 토큰 생성 → `.env.local`과 Railway 환경변수에 `RAILWAY_TOKEN` 추가 |
| **GitHub Organization 생성** | 사용자들이 만든 서비스의 코드를 자동으로 저장할 공간을 만듭니다 | GitHub → 오른쪽 상단 "+" → "New organization" → 이름: `customwebservice-apps` → `.env.local`에 `GITHUB_ORG` 추가 |

### 우선순위: 보통

| 작업 | 설명 | 진행 방법 |
|------|------|----------|
| **Discord 알림** | 서비스에 문제가 생기면 Discord로 알림을 받습니다 | Discord 서버 → 채널 설정 → 연동 → 웹훅 → 새 웹훅 만들기 → URL 복사 → `.env.local`에 `DISCORD_WEBHOOK_URL` 추가 |
| **Sentry 연동** | 서비스에서 발생하는 오류를 자동으로 수집하고 관리합니다 | https://sentry.io 가입 → 프로젝트 생성 → DSN 복사 → `.env.local`에 `SENTRY_DSN` 추가 |
| **파비콘/로고** | 브라우저 탭에 표시되는 아이콘과 서비스 로고를 만듭니다 | Canva(https://canva.com)에서 디자인 → 다운로드 → 프로젝트의 `public/` 폴더에 저장 |

### 우선순위: 낮음

| 작업 | 설명 | 진행 방법 |
|------|------|----------|
| **커스텀 도메인** | `custom-web-service.up.railway.app` 대신 `myservice.com` 같은 주소를 사용합니다 | 도메인 구매(가비아, Cloudflare 등) → Railway → Settings → Networking → Custom Domain → 도메인 연결 → DNS 설정 |

---

## 전체 소요 시간 예상

| 단계 | 하는 일 | 소요 시간 |
|------|---------|----------|
| Step 1 | Supabase 가입 및 프로젝트 생성 | 약 10분 |
| Step 2 | 데이터베이스 테이블 및 초기 데이터 생성 | 약 5분 |
| Step 3 | Google 로그인 기능 설정 | 약 10분 |
| Step 4 | GitHub 로그인 기능 설정 | 약 5분 |
| Step 5 | 로그인 후 이동 경로 설정 | 약 2분 |
| Step 6 | AI(xAI Grok) API 키 발급 | 약 3분 |
| Step 7 | 내 컴퓨터에서 테스트 | 약 10분 |
| Step 8 | 인터넷에 서비스 배포 | 약 10분 |
| Step 9 | 배포된 서비스 전체 테스트 | 약 15분 |
| **합계** | | **약 70분** |

---

## 문제 해결 (FAQ)

### Q. 로그인 버튼을 눌렀는데 에러가 나요
- Step 3, 4에서 설정한 **Client ID**와 **Client Secret**이 정확한지 확인하세요
- Supabase Providers에서 해당 Provider가 **Enabled** 상태인지 확인하세요
- Step 5에서 **Redirect URL**이 정확히 입력되었는지 확인하세요

### Q. 카탈로그 페이지에 API 카드가 안 보여요
- Step 2의 SQL 실행이 정상적으로 완료되었는지 확인하세요
- Supabase Table Editor에서 `api_catalog` 테이블에 데이터가 있는지 확인하세요
- `.env.local` 파일의 Supabase URL과 키가 정확한지 확인하세요

### Q. AI 생성 기능이 동작하지 않아요
- Step 6에서 발급한 **xAI Grok API 키**가 `.env.local`에 정확히 입력되었는지 확인하세요
- xAI Grok API 키가 유효한지 Step 6-3의 테스트 방법으로 확인해보세요

### Q. Railway 배포 후 로그인이 안 돼요
- Step 8-3의 **URL 업데이트**를 모두 완료했는지 확인하세요
- 특히 Supabase의 **Site URL**과 **Redirect URLs**가 Railway 배포 URL로 변경되었는지 확인하세요
- Step 8-4의 **재배포**를 실행했는지 확인하세요

### Q. `pnpm dev` 명령어가 실행되지 않아요
- Node.js가 설치되어 있는지 확인하세요: 터미널에서 `node -v` 입력
- pnpm이 설치되어 있는지 확인하세요: 터미널에서 `pnpm -v` 입력
- 설치되어 있지 않다면 https://nodejs.org 에서 Node.js를 먼저 설치하세요
