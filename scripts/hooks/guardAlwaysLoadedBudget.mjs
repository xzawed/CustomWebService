#!/usr/bin/env node
// scripts/hooks/guardAlwaysLoadedBudget.mjs
//
// **PreToolUse 훅 — 항상 로드되는 문서가 예산을 넘는 편집을 차단한다.**
//
// 왜 훅인가: Anthropic 공식 문서가 명시한다 —
//   "Claude treats [CLAUDE.md] as context, not enforced configuration.
//    To block an action regardless of what Claude decides, use a PreToolUse hook."
//   "Hooks enforce, CLAUDE.md advises."
//
// 2026-08-05 세션에서 작업 게이트 G1~G6을 CLAUDE.md에 추가했다. 그 처방의 예측은
// "오류가 준다"였고 **예측이 틀렸다** — 다음 세션에서도 오류가 계속 났다.
// 원인 분석 결과 규칙이 **강제력 없는 층**에 있었다. 이 저장소의 PreToolUse 훅은 0개였다.
// 이것이 첫 번째다.
//
// 무엇을 막나: CLAUDE.md·AGENTS.md를 예산 초과 상태로 만드는 Write/Edit.
// 무엇을 안 막나: 예산 안에서의 편집, 줄이는 편집(초과 상태에서 더 줄이는 것 포함).
//
// 종료 코드는 항상 0이다 — 훅 자체의 고장이 도구 호출을 막으면 안 된다(fail-open).
// 차단은 stdout의 JSON `permissionDecision: "deny"` 로만 표현한다.
import fs from 'node:fs';
import path from 'node:path';

/** scripts/checkDocIntegrity.ts 의 BUDGETS 와 **같은 값을 유지할 것.** 어긋나면 CI와 훅이 다른 말을 한다. */
const BUDGETS = {
  'CLAUDE.md': 220,
  'AGENTS.md': 80,
};

const countLines = (s) => s.split(/\r?\n/).length;

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function allow() {
  process.exit(0);
}

function deny(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }),
  );
  process.exit(0);
}

const raw = readStdin();
if (!raw.trim()) allow();

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  allow(); // 페이로드를 못 읽으면 통과시킨다 — 훅 고장이 작업을 막으면 안 된다
}

const tool = payload?.tool_name ?? payload?.toolName;
const input = payload?.tool_input ?? payload?.toolInput ?? {};
const filePath = input.file_path ?? input.filePath;
if (!filePath) allow();

const base = path.basename(String(filePath));
const budget = BUDGETS[base];
if (budget === undefined) allow();

// 저장소 루트의 그 파일인지 확인 — 하위 디렉터리의 동명 파일은 대상이 아니다.
//
// ⚠️ 경로 형식이 **한 가지가 아니다.** 실측(2026-08-07): Git Bash는 `/f/DEVELOPMENT/...`
// (MSYS 형식)를 주는데 Windows Node의 `path.resolve`는 그걸 현재 드라이브 기준으로 해석해
// `F:\f\DEVELOPMENT\...` 로 만든다. 그래서 단순 문자열 비교는 **항상 불일치 → 항상 통과**했다.
// 시험하지 않았으면 아무것도 막지 못하는 훅을 배선할 뻔했다.
/** `F:\a\b` · `f:/a/b` · `/f/a/b` 를 전부 `f:/a/b` 로 정규화한다(Windows FS는 대소문자 무시). */
function canonical(p) {
  let s = String(p).replace(/\\/g, '/');
  const msys = /^\/([A-Za-z])\/(.*)$/.exec(s); // /f/DEVELOPMENT/... → f:/DEVELOPMENT/...
  if (msys) s = `${msys[1]}:/${msys[2]}`;
  return s.replace(/^([A-Za-z]):/, (_, d) => `${d.toLowerCase()}:`).toLowerCase().replace(/\/+$/, '');
}

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const abs = String(filePath).replace(/\\/g, '/');
if (canonical(abs) !== `${canonical(ROOT)}/${base.toLowerCase()}`) allow();

const real = path.join(ROOT, base); // 읽기는 항상 저장소 루트 기준으로 — 위 비교가 동일성을 보장한다
const before = fs.existsSync(real) ? countLines(fs.readFileSync(real, 'utf8')) : 0;

/** 편집 후 줄 수를 **실제로 계산**한다. 추정하지 않는다. */
let after;
if (tool === 'Write') {
  after = countLines(String(input.content ?? ''));
} else if (tool === 'Edit') {
  if (!fs.existsSync(real)) allow();
  const src = fs.readFileSync(real, 'utf8');
  const oldStr = String(input.old_string ?? input.oldString ?? '');
  const newStr = String(input.new_string ?? input.newString ?? '');
  if (!oldStr || !src.includes(oldStr)) allow(); // 매치 안 되면 Edit 자체가 실패한다 — 우리가 막을 일이 아니다
  const replaceAll = input.replace_all ?? input.replaceAll ?? false;
  after = countLines(replaceAll ? src.split(oldStr).join(newStr) : src.replace(oldStr, newStr));
} else {
  allow();
}

if (after <= budget) allow();
// 이미 초과 상태에서 **더 줄이는** 편집은 통과시킨다 — 아니면 축소 작업 자체가 막힌다
if (before > budget && after < before) allow();

deny(
  `${base} 예산 초과 차단: 이 편집은 ${before}줄 → ${after}줄로 만드는데 예산은 ${budget}줄이다.\n` +
    `\n` +
    `${base} 는 **모든 세션에 무조건 로드된다.** 개별 줄이 타당해 보여도 총량은 아무도 세지 않아서 ` +
    `449줄까지 자랐고, 그 안의 검증 불가능한 단정들이 실제로 거짓보고를 만들었다(2026-08-07 실측).\n` +
    `\n` +
    `할 것 — 셋 중 하나:\n` +
    `  1) 이 내용을 docs/ 아래 해당 주제 문서로 옮기고 여기엔 한 줄 포인터만 남긴다\n` +
    `     (판단 기준: **CI·테스트가 잡아주면 옮기고, 조용히 프로덕션이 깨지면 남긴다**)\n` +
    `  2) 같은 편집에서 다른 곳을 그만큼 줄인다\n` +
    `  3) 예산을 올려야 한다면 **왜 올리는지를 scripts/checkDocIntegrity.ts의 BUDGETS 주석과 ` +
    `이 파일의 BUDGETS 양쪽에 적고** 올린다. 숫자만 바꾸면 1년 뒤 다시 449줄이 된다.\n` +
    `\n` +
    `근거: docs/guides/agent-working-rules.md`,
);
