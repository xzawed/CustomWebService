#!/bin/bash
# pre-commit 시크릿 감지 훅 — gitleaks 기반
# 설치: .scamanager/install-hook.sh 실행 시 자동 설치됨
set -e

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo ".")
GITLEAKS_CONFIG="$ROOT/.gitleaks.toml"

# gitleaks 바이너리 탐색
if command -v gitleaks &>/dev/null; then
  GITLEAKS_CMD="gitleaks"
elif [ -f "$ROOT/.scamanager/bin/gitleaks" ]; then
  GITLEAKS_CMD="$ROOT/.scamanager/bin/gitleaks"
else
  echo "⚠️  [Secrets Check] gitleaks 미설치 — 시크릿 검사를 건너뜁니다."
  echo "   설치 방법: https://github.com/gitleaks/gitleaks#installation"
  echo "   또는: brew install gitleaks  |  winget install gitleaks"
  exit 0
fi

CONFIG_ARGS=""
if [ -f "$GITLEAKS_CONFIG" ]; then
  CONFIG_ARGS="--config $GITLEAKS_CONFIG"
fi

echo "🔍 [Secrets Check] staged 파일에서 시크릿 검사 중..."

if $GITLEAKS_CMD protect --staged $CONFIG_ARGS 2>/dev/null; then
  echo "✅ [Secrets Check] 시크릿 미감지"
else
  echo ""
  echo "❌ [Secrets Check] 시크릿이 감지되어 커밋이 차단되었습니다!"
  echo "   상세 내용: $GITLEAKS_CMD protect --staged --verbose $CONFIG_ARGS"
  echo ""
  echo "   실제 시크릿이 포함된 경우:"
  echo "     1. git reset HEAD <파일> 으로 unstage"
  echo "     2. 시크릿을 환경변수(.env.local)로 이동"
  echo "     3. 해당 키를 즉시 회전시키세요"
  echo ""
  echo "   오탐(false positive)인 경우:"
  echo "     .gitleaks.toml 의 allowlist에 파일/패턴을 추가하세요"
  exit 1
fi
