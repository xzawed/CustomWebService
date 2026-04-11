# Plan: `.claude` 폴더 생성 및 .md 파일 정리

## Context
프로젝트에 Claude Code 전용 설정 파일들이 없는 상태. `.claude/` 폴더와 `CLAUDE.md`를 생성하여 Claude Code가 프로젝트를 효과적으로 이해하고 작업할 수 있도록 설정한다.

**현재 상태:**
- `.claude/` 폴더 없음 (`.gitignore`에 `.claude/` 포함 → 로컬 전용)
- `CLAUDE.md` 없음
- `MEMORY.md` 없음
- `docs/` 폴더에 40+ 문서 → 이미 잘 정리되어 있으므로 변경 불필요
- `README.md`, `.github/PULL_REQUEST_TEMPLATE.md` → 현재 위치 유지

## 작업 단계

### Step 1: `CLAUDE.md` 생성 (프로젝트 루트)
- **파일**: `F:/DEVELOPMENT/SOURCE/CLAUDE/CustomWebService/CLAUDE.md`
- Claude Code가 매 세션 시작 시 읽는 프로젝트 지침 파일
- 내용: 기술 스택, 프로젝트 구조, 개발 명령어, 코딩 컨벤션, 아키텍처 패턴
- README.md와 docs/ 내용을 참고하되 중복하지 않음 (개발 지침에 집중)
- 한국어로 작성 (~100-150줄)

### Step 2: `.claude/` 디렉토리 및 설정 파일 생성
- **파일**: `.claude/settings.json`
  - 자주 사용하는 개발 명령어 사전 허용 (pnpm dev/build/lint/test 등)
- **Note**: `.gitignore`에 이미 `.claude/` 포함되어 있으므로 로컬 전용

### Step 3: `.claude/commands/` 커스텀 슬래시 커맨드 생성
- **파일**: `.claude/commands/validate.md` — 전체 검증 파이프라인 (lint → type-check → test)
- **파일**: `.claude/commands/new-api-route.md` — API 라우트 스캐폴딩 템플릿

### Step 4: `MEMORY.md` 생성 (메모리 디렉토리)
- **파일**: `C:/Users/dirtc/.claude/projects/F--DEVELOPMENT-SOURCE-CLAUDE-CustomWebService/memory/MEMORY.md`
- 프로젝트 메모리 인덱스 초기화

### Step 5: `.gitignore` 확인
- `.claude/`가 이미 `.gitignore`에 있음 → 변경 불필요
- `CLAUDE.md`는 `.gitignore`에 없음 → git에 커밋됨 (의도된 동작)

## 변경하지 않는 파일
- `docs/` 폴더 내 40+ 문서 — 이미 번호순으로 잘 정리됨
- `README.md` — 프로젝트 개요로 현재 위치 유지
- `.github/PULL_REQUEST_TEMPLATE.md` — GitHub 표준 위치

## 주요 참조 파일
- `F:/DEVELOPMENT/SOURCE/CLAUDE/CustomWebService/README.md` (CLAUDE.md 작성 시 참고)
- `F:/DEVELOPMENT/SOURCE/CLAUDE/CustomWebService/package.json` (스크립트 및 의존성)
- `F:/DEVELOPMENT/SOURCE/CLAUDE/CustomWebService/.gitignore` (현재 설정 확인)

## 검증 방법
1. `CLAUDE.md` 파일이 프로젝트 루트에 존재하는지 확인
2. `.claude/settings.json` 파일이 유효한 JSON인지 확인
3. `.claude/commands/` 내 커맨드 파일들이 존재하는지 확인
4. `MEMORY.md`가 메모리 디렉토리에 존재하는지 확인
5. `git status`로 `CLAUDE.md`만 tracked 파일로 표시되는지 확인 (`.claude/`는 gitignore됨)
