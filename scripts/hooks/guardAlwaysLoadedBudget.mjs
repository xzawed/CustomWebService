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
import { isSameFile, resolveBudgetName, baseNameOf } from './budgetPath.mjs';

/**
 * 예산은 **`scripts/doc-budgets.json` 단일 출처**에서 읽는다.
 * 2026-08-07 이전에는 여기·`checkDocIntegrity.ts`·훅 테스트 **세 곳에 하드코딩**돼 있었고
 * 동기화를 강제하는 것이 없었다 — 한쪽만 올리면 훅과 CI가 조용히 다른 말을 한다.
 *
 * 읽기 실패는 **fail-open**이다(훅 고장이 작업을 막으면 안 된다). 그 경우 CI의 ⑥이 잡는다.
 */
const BUDGETS = (() => {
  try {
    const p = path.resolve(import.meta.dirname, '..', 'doc-budgets.json');
    return JSON.parse(fs.readFileSync(p, 'utf8')).alwaysLoaded ?? {};
  } catch {
    return {};
  }
})();

/** 저장소 루트. 예산 조회(대소문자 판정)보다 **먼저** 필요하므로 여기서 선언한다. */
const ROOT = path.resolve(import.meta.dirname, '..', '..');

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

// ⚠️ `path.basename` 을 쓰지 않는다 — Windows 표기법(`\\?\Volume{…}\`)에서 플랫폼별로
// 결과가 갈린다. 구분자만 보고 자르는 `baseNameOf` 로 통일한다.
const rawBase = baseNameOf(String(filePath));

// ⚠️ 예산 조회는 **대소문자를 무시해야 한다.**
//
// 2026-08-08 실측: `claude.md` 로 400줄 Write 를 보내면 **ALLOW** 됐다.
// `BUDGETS['claude.md']` 가 undefined 라 경로 비교에 **도달하기도 전에** 통과했기 때문이다.
// Windows(NTFS)·macOS(APFS 기본)는 대소문자를 무시하므로 그 Write 는 **진짜 CLAUDE.md 를 덮어쓴다.**
// #304 가 `./` · `../` 같은 훨씬 드문 형태를 막으면서 정작 **오타 한 글자로 나는 이 구멍**은 남겼다.
//
// 다만 Linux 는 대소문자를 구분하므로 `claude.md` 가 **진짜 다른 파일**일 수 있고,
// 그때 막으면 오탐이다. 그래서 이름만 보지 않고 **파일시스템에 같은 파일인지 물어본다.**
// 판정 자체는 `budgetPath.mjs` 의 **순수 함수**에 있다 — 파일시스템을 주입받으므로
// 두 FS 의미론(대소문자 무시/구분)을 **어느 플랫폼에서나** 단위 테스트할 수 있다.
// 그렇게 나눈 이유는 `budgetPath.mjs` 헤더에 있다(CI 가 Linux 전용이라 생긴 사각지대).
const base = resolveBudgetName(rawBase, Object.keys(BUDGETS), {
  listDir: () => fs.readdirSync(ROOT),
  exists: (name) => fs.existsSync(path.join(ROOT, name)),
});
if (base === null) allow();

const budget = BUDGETS[base];

const real = path.join(ROOT, base);

// 저장소 루트의 **그 파일**인지 확인 — 하위 디렉터리의 동명 파일은 대상이 아니다.
//
// ⚠️ 여기를 문자열 정규화로 하다가 **다섯 번 뚫렸다.** 이제는 표기법을 열거하지 않고
// **파일시스템에 신원을 묻는다**(`realpath`). 근거·이력은 `budgetPath.mjs` 헤더에 있다.
if (
  !isSameFile(String(filePath), real, {
    stat: (p) => fs.statSync(p),
    realpath: (p) => fs.realpathSync.native(p),
  })
)
  allow();

// 읽기는 항상 저장소 루트 기준으로 — 위 동일성 확인이 그것을 보장한다
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
    `  3) 예산을 올려야 한다면 **scripts/doc-budgets.json 한 곳만** 고치고, ` +
    `왜 올리는지를 그 파일의 _rationale 에 적는다. 숫자만 바꾸면 1년 뒤 다시 449줄이 된다.\n` +
    `\n` +
    `근거: docs/guides/agent-working-rules.md`,
);
