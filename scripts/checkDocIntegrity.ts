// scripts/checkDocIntegrity.ts
// Run: pnpm docs:check
//
// 문서 정합성 검사 9종. 트리거·경로·명령어는 **테스트도 lint도 안 잡는** 유일한
// 문서 요소이고, 실제로 죽어 있던 것이 이미 2건 나왔다
// (ENV_VAR_DENYLIST — 보안 ADR / isNotFound — SQLite 컷오버 때 제거).
//
// ⑥⑦은 2026-08-07에 추가됐다. 계기: CLAUDE.md가 449줄까지 자랐고 오너가 "문서가
// 너무 많다"고 지적했다. 그때 실측한 것이 이 두 검사의 존재 이유다 —
// **기계로 검증 가능한 층(①~⑤)은 위반 0건이었다.** 즉 부패는 링크가 아니라
// (a) 아무도 안 세던 **총량**과 (b) 검증할 수 없는 **행 참조**에 있었다.
//
// exit 0 — 위반 없음
// exit 1 — 위반 발견
// exit 2 — 검사기 자체 실패 (읽을 수 없는 경로 등)
//
// **exit 1과 2를 합치지 말 것.** checkAiContract.ts와 같은 이유 —
// 검사기 고장을 "문서가 썩었다"로 오인하면 경보 신뢰가 무너진다.
//
// 층 구분: `docs/decisions/`·`docs/archive/`는 **역사**다. 제거된 명령·경로를
// 서술하는 것이 정상이므로 명령어·경로 검사(①②)에서 제외한다. 링크·트리거
// 검사(③④)는 역사 문서에도 적용한다 — 링크는 깨지면 안 되고, 트리거는
// "지금 이 ADR을 열어야 하나"를 판단하는 현재형 장치이기 때문이다.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

type Violation = { check: string; where: string; detail: string };
const violations: Violation[] = [];

function add(check: string, where: string, detail: string): void {
  violations.push({ check, where, detail });
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (/node_modules|[\\/]\.git$|\.next/.test(p)) continue;
      walk(p, acc);
    } else if (e.name.endsWith('.md')) acc.push(p);
  }
  return acc;
}

const rel = (p: string): string => path.relative(ROOT, p).split(path.sep).join('/');

/**
 * 역사 층 — 제거된 것을 서술하는 게 정상이다.
 * `superpowers/specs`는 git상 write-once(설계 시점 기록)이므로 포함하되,
 * `superpowers/plans`의 WBS는 **현재 시제 백로그 진실원**이라 제외하지 않는다.
 */
const isHistory = (p: string): boolean =>
  /^docs\/(decisions|archive|superpowers\/specs)\//.test(rel(p));

/**
 * 가드레일 문장 — "그건 제거됐다/쓰지 말라"는 서술은 **썩은 게 아니라 방어물**이다.
 * 이걸 위반으로 세면 그 보고 자체가 거짓보고가 된다(2026-08-05 전수 분석에서
 * Supabase 언급 15건이 전부 이 부류였다). 존재하지 않음을 말하는 줄은 건너뛴다.
 */
const REMOVAL_MARKERS =
  /제거|삭제|폐기|없다|없음|않는다|존재하지|미사용|미존재|deprecated|레거시|더 이상|안 쓴다|쓰지 말/;

/**
 * 판정 창은 **앞뒤 1줄**까지 본다. 문장이 줄바꿈으로 쪼개져
 * "…(`pnpm keys:verify`)는 / SQLite 컷오버로 제거됨" 처럼 마커가 다음 줄에 있는
 * 경우가 실제로 있었다. 줄 단위로만 보면 그 가드레일을 위반으로 올린다.
 */
const isGuardrail = (lines: string[], i: number): boolean =>
  REMOVAL_MARKERS.test(lines.slice(Math.max(0, i - 1), i + 2).join(' '));

/** `pnpm <bin>` 형태로 호출되는 외부 실행파일 — package.json scripts에 없어도 정상 */
const PNPM_PASSTHROUGH = new Set([
  'install', 'add', 'remove', 'audit', 'dlx', 'exec', 'why', 'up', 'store', 'run',
  'tsx', 'vitest', 'playwright', 'eslint', 'tsc', 'next',
]);

const allMd: string[] = [
  ...['CLAUDE.md', 'AGENTS.md', 'README.md']
    .map((f) => path.join(ROOT, f))
    .filter((f) => fs.existsSync(f)),
  ...walk(path.join(ROOT, 'docs')),
  ...(fs.existsSync(path.join(ROOT, '.claude')) ? walk(path.join(ROOT, '.claude')) : []),
];

/** 코드 펜스 안은 검사에서 제외 — 예시 코드는 실재할 의무가 없다 */
function stripFences(src: string): string {
  return src.replace(/^```[\s\S]*?^```/gm, (m) => m.replace(/[^\n]/g, ' '));
}

// ── ① 문서가 부르는 pnpm 명령이 package.json에 있는가 ──────────────────────
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};
const knownScripts = new Set(Object.keys(pkg.scripts));

for (const f of allMd) {
  if (isHistory(f)) continue;
  const lines = stripFences(fs.readFileSync(f, 'utf8')).split(/\r?\n/);
  lines.forEach((line, i) => {
    if (isGuardrail(lines, i)) return;
    // `pnpm foo:bar` — 백틱 안에 있는 것만. 산문 속 "pnpm"은 잡지 않는다.
    for (const m of line.matchAll(/`pnpm ([a-z][a-z0-9:-]*)/g)) {
      const script = m[1];
      if (PNPM_PASSTHROUGH.has(script)) continue;
      if (!knownScripts.has(script)) {
        add('① pnpm 명령', `${rel(f)}:${i + 1}`, `\`pnpm ${script}\` 가 package.json scripts에 없다`);
      }
    }
  });
}

// ── ② 문서가 지목한 소스 경로가 실재하는가 ────────────────────────────────
for (const f of allMd) {
  if (isHistory(f)) continue;
  const lines = stripFences(fs.readFileSync(f, 'utf8')).split(/\r?\n/);
  lines.forEach((line, i) => {
    if (isGuardrail(lines, i)) return;
    // 백틱 안의 src/... 또는 scripts/... 경로. 줄 번호 접미사(:41,46)는 떼어낸다.
    for (const m of line.matchAll(/`((?:src|scripts|\.claude)\/[A-Za-z0-9_@./[\]-]+?\.[a-z]{2,4})(?::[\d,]+)?`/g)) {
      const p = path.join(ROOT, m[1]);
      if (!fs.existsSync(p)) {
        add('② 소스 경로', `${rel(f)}:${i + 1}`, `\`${m[1]}\` 가 저장소에 없다`);
      }
    }
  });
}

// ── ③ 상대 링크가 대소문자 구분 파일시스템에서 해석되는가 ────────────────
// Windows(NTFS)는 대소문자를 무시하므로 fs.existsSync로는 절대 안 잡힌다.
// 실제 디렉터리 엔트리와 바이트 단위로 대조해야 Linux/GitHub 404를 잡는다.
function resolvesCaseSensitively(abs: string): true | false | { actual: string } {
  const segs = path.relative(ROOT, abs).split(path.sep);
  let cur = ROOT;
  for (const seg of segs) {
    if (seg === '..' || seg === '.') return true; // 정규화 범위 밖 — 판정하지 않음
    let entries: string[];
    try {
      entries = fs.readdirSync(cur);
    } catch {
      return false;
    }
    if (!entries.includes(seg)) {
      const ci = entries.find((e) => e.toLowerCase() === seg.toLowerCase());
      return ci ? { actual: ci } : false;
    }
    cur = path.join(cur, seg);
  }
  return true;
}

for (const f of allMd) {
  const src = fs.readFileSync(f, 'utf8');
  src.split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(/\[[^\]]*\]\(([^)#\s]+)(?:#[^)\s]*)?\)/g)) {
      const target = m[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const abs = path.resolve(path.dirname(f), target);
      if (!abs.toLowerCase().startsWith(ROOT.toLowerCase())) continue;
      const r = resolvesCaseSensitively(abs);
      if (r === true) continue;
      if (r === false) {
        add('③ 링크', `${rel(f)}:${i + 1}`, `${target} → 대상 없음`);
      } else {
        add('③ 링크', `${rel(f)}:${i + 1}`, `${target} → 대소문자 불일치 (실제: ${r.actual}) — Linux/GitHub에서 404`);
      }
    }
  });
}

// ── ④ ADR 「언제 읽나」 트리거의 식별자가 소스에 실재하는가 ────────────────
// 트리거는 에이전트가 grep으로 찾는 지점이다. 심볼이 개명·삭제되면
// 트리거가 조용히 죽고, ADR은 필요한 순간에 열리지 않는다.
const srcIndex: string = (() => {
  const files = (function collect(dir: string, acc: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) collect(p, acc);
      else if (/\.(ts|tsx|json|yml|yaml)$/.test(e.name)) acc.push(p);
    }
    return acc;
  })(path.join(ROOT, 'src'));
  files.push(path.join(ROOT, 'package.json'));
  return files.map((p) => fs.readFileSync(p, 'utf8')).join('\n');
})();

const adrs = fs.existsSync(path.join(ROOT, 'docs/decisions'))
  ? fs.readdirSync(path.join(ROOT, 'docs/decisions')).filter((f) => f.endsWith('.md'))
  : [];

for (const name of adrs) {
  const f = path.join(ROOT, 'docs/decisions', name);
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  const idx = lines.findIndex((l) => /언제 읽나/.test(l));
  if (idx === -1) {
    add('④ ADR 트리거', rel(f), '「언제 읽나」 트리거 줄이 없다');
    continue;
  }
  // 트리거 줄과 바로 이어지는 인용 줄까지 본다(2줄 트리거 허용)
  const block = lines.slice(idx, idx + 2).join(' ');
  for (const m of block.matchAll(/`([A-Za-z_$][A-Za-z0-9_$]{3,})`/g)) {
    const sym = m[1];
    // 트리거가 스스로 "제거됨"이라고 밝힌 심볼은 검사 대상이 아니다
    if (/제거|삭제|없다|개명/.test(block.slice(Math.max(0, block.indexOf(sym) - 60)))) continue;
    if (!srcIndex.includes(sym)) {
      add('④ ADR 트리거', `${rel(f)}:${idx + 1}`, `트리거 식별자 \`${sym}\` 가 src/ 어디에도 없다 — grep으로 못 찾는다`);
    }
  }
}

// ── ⑤ .claude/rules 의 paths 글롭이 **실제로 파일에 매치되는가** ────────────
// 경로가 실재하는지만 보면 부족하다. gitignore 시맨틱 매처에서 대괄호 리터럴은
// 문자 클래스로 해석되어 `src/app/site/[slug]/route.ts` 같은 Next.js 동적 경로에
// **영구 미발동**한다 — 파일은 실재하는데 규칙은 절대 안 뜬다.
// 0매치는 "규칙이 존재하지만 아무 일도 하지 않는다"는 뜻이므로 위반으로 센다.
const RULES_DIR = path.join(ROOT, '.claude/rules');

/** 글롭 → 정규식. `**` = 임의 깊이, `*` = 세그먼트 내부, `?` = 한 글자 */
function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i += 1) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
        i += glob[i + 2] === '/' ? 2 : 1;
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

if (fs.existsSync(RULES_DIR)) {
  const allRepoFiles: string[] = (function collect(dir: string, acc: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (/node_modules|[\\/]\.git$|\.next|coverage/.test(p)) continue;
        collect(p, acc);
      } else acc.push(rel(p));
    }
    return acc;
  })(ROOT);

  const ruleFiles = (function collect(dir: string, acc: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) collect(p, acc);
      else if (e.name.endsWith('.md')) acc.push(p);
    }
    return acc;
  })(RULES_DIR);

  for (const f of ruleFiles) {
    const src = fs.readFileSync(f, 'utf8');
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src);
    if (!fm) continue; // paths 없는 규칙 = 무조건 로드. 검사 대상 아님
    const pathsBlock = /paths:\s*\n((?:\s*-\s*.*\n?)+)/.exec(fm[1]);
    if (!pathsBlock) continue;

    for (const line of pathsBlock[1].split(/\r?\n/)) {
      const m = /^\s*-\s*["']?(.+?)["']?\s*$/.exec(line);
      if (!m) continue;
      const glob = m[1];

      if (glob.includes('[')) {
        add(
          '⑤ rules paths',
          rel(f),
          `\`${glob}\` — 대괄호는 글롭 매처에서 문자 클래스로 해석된다. ` +
            `Next.js 동적 경로(\`[slug]\`)를 이렇게 쓰면 **영구 미발동**한다. 디렉터리 재귀형(\`dir/**\`)을 쓸 것`,
        );
        continue;
      }
      const reg = globToRegExp(glob);
      const hits = allRepoFiles.filter((p) => reg.test(p)).length;
      if (hits === 0) {
        add('⑤ rules paths', rel(f), `\`${glob}\` 가 **0개 파일**에 매치된다 — 이 규칙은 절대 뜨지 않는다`);
      }
    }
  }
}

// ── ⑥ 항상 로드되는 문서의 총량 예산 ──────────────────────────────────────
// **이 검사만이 "문서가 너무 많다"를 기계적으로 잡는다.**
//
// CLAUDE.md·AGENTS.md는 모든 세션에 무조건 로드된다. 개별 줄은 전부 타당해 보이는데
// 총량은 아무도 안 센다 — 그래서 449줄(19,909토큰)까지 자랐다. 2026-08-07 축소 시점의
// 실측 근거:
//   · Anthropic 공식 권고는 CLAUDE.md ~200줄
//   · 이 세션 오류 8건 중 3건이 "문서를 믿고 측정하지 않아서" 발생했다
//   · ①~⑤(기계 검증 가능 층)는 위반 0건 — 즉 링크는 멀쩡한데 **단정이 썩어 있었다**
//
// 예산을 올리려면 **왜 올려야 하는지를 이 주석에 적고** 올려라. 숫자만 바꾸면
// 다음 사람이 같은 이유로 또 올리고, 1년 뒤 다시 449줄이 된다.
const BUDGETS: { file: string; maxLines: number; why: string }[] = [
  { file: 'CLAUDE.md', maxLines: 220, why: '목표 200줄 + 통상 편집 여유 10%' },
  { file: 'AGENTS.md', maxLines: 80, why: '포인터 전용 — 규칙 본문 금지' },
];

for (const b of BUDGETS) {
  const p = path.join(ROOT, b.file);
  if (!fs.existsSync(p)) continue;
  const n = fs.readFileSync(p, 'utf8').split(/\r?\n/).length;
  if (n > b.maxLines) {
    add(
      '⑥ 항상 로드 예산',
      `${b.file}:${n}`,
      `${n}줄 > 예산 ${b.maxLines}줄 (${b.why}). ` +
        `줄이거나, 예산을 올려야 할 근거를 scripts/checkDocIntegrity.ts의 BUDGETS 주석에 적고 올릴 것`,
    );
  }
}

// ── ⑥-b 현재 시제 문서군의 총량 예산 ──────────────────────────────────────
// ⑥이 항상 로드되는 2개 파일을 지킨다면, 이건 **그 2개가 가리키는 곳**을 지킨다.
// 2026-08-07에 CLAUDE.md를 449→203줄로 줄였는데, 그건 **축소가 아니라 이동**이었다
// (235줄이 docs/로 갔을 뿐 총량은 그대로였다). 오너 지적이 정확했다.
//
// 왜 총량이 오류를 만드나: 문서가 코드를 다시 서술하는 만큼 유지보수 부담이 곱해지고,
// 놓친 곳이 드리프트가 되고, 그 드리프트를 읽고 거짓보고가 나온다. 실측(2026-08-07):
//   · `api-endpoints.md` 1,630줄 중 **44%가 JSON 예시** — 코드에서 파생 가능하고 아무도 검증 안 함
//   · `architecture/overview.md`의 절반이 **디렉터리 트리를 코드에서 베낀 것**
//   · 문서 간 중복은 33줄뿐, 고아 문서는 215줄뿐 → **부피는 재서술에 있었다**
//
// **`docs/decisions/`는 대상이 아니다** — ADR은 사고 기록이고 append-only로 자라는 것이 정상이다.
// 여기서 지키는 것은 "지금도 참이어야 하는" 현재 시제 문서군뿐이다.
//
// 예산을 올리려면 **왜 올리는지를 여기 적고** 올릴 것. 숫자만 바꾸면 다시 불어난다.
const CURRENT_TENSE_DIRS = ['docs/guides', 'docs/architecture', 'docs/reference', 'docs/security'];
const CURRENT_TENSE_BUDGET = 6500; // 2026-08-07 축소 직후 5,928줄 + 약 10% 여유

const currentTenseFiles = allMd.filter((f) =>
  CURRENT_TENSE_DIRS.some((d) => rel(f).startsWith(`${d}/`)),
);
const currentTenseLines = currentTenseFiles.reduce(
  (a, f) => a + fs.readFileSync(f, 'utf8').split(/\r?\n/).length,
  0,
);
if (currentTenseLines > CURRENT_TENSE_BUDGET) {
  add(
    '⑥-b 현재 시제 총량 예산',
    `${CURRENT_TENSE_DIRS.join(' + ')}:${currentTenseLines}`,
    `${currentTenseLines}줄 > 예산 ${CURRENT_TENSE_BUDGET}줄 (파일 ${currentTenseFiles.length}개). ` +
      `늘리기 전에 물을 것 — **이 내용이 코드에서 파생 가능한가?** 가능하면 소스 포인터로 대체하라. ` +
      `예산을 올려야 하면 근거를 scripts/checkDocIntegrity.ts의 CURRENT_TENSE_BUDGET 주석에 적을 것`,
  );
}

// ── ⑦ `파일:행` 참조가 실제 행 수 안에 있는가 ─────────────────────────────
// ②는 파일 **존재**만 본다. 행 번호는 코드가 자라면 조용히 어긋나고, 어긋난 채로
// "config/generation.ts:32를 보라"고 하면 다음 사람이 엉뚱한 줄을 읽는다.
//
// ⚠️ **범위 한계를 알고 쓸 것 (2026-08-07 재검증에서 지적됨).**
//  (a) `` `path/file.ts:NNN` `` 형태만 본다. WBS의 "625·745행이 …" 처럼 **파일명이 같은 줄에
//      없는 산문 참조**는 못 잡는다 — 이 검사의 동기가 된 바로 그 드리프트가 그 형태였다.
//      "가장 가까운 파일 언급과 묶는" 휴리스틱은 오탐을 만들어 검사 신뢰를 깎으므로 넣지 않는다.
//  (b) **총 행수 초과만** 잡는다. 파일 범위 *안*에서 어긋난 참조(더 흔한 드리프트)는
//      구조적으로 못 잡는다 — 그 줄에 무엇이 있어야 하는지를 모르기 때문이다.
// 즉 ⑦은 "명백히 죽은 참조"만 거른다. 행 참조를 쓸 때는 그 사실을 감안할 것.
for (const f of allMd) {
  if (isHistory(f)) continue;
  const lines = stripFences(fs.readFileSync(f, 'utf8')).split(/\r?\n/);
  lines.forEach((line, i) => {
    if (isGuardrail(lines, i)) return;
    for (const m of line.matchAll(/`((?:src|scripts)\/[A-Za-z0-9_@./[\]-]+?\.[a-z]{2,4}):(\d+)`/g)) {
      const target = path.join(ROOT, m[1]);
      if (!fs.existsSync(target)) continue; // ②가 이미 잡는다 — 중복 보고 금지
      const total = fs.readFileSync(target, 'utf8').split(/\r?\n/).length;
      if (Number(m[2]) > total) {
        add(
          '⑦ 행 참조',
          `${rel(f)}:${i + 1}`,
          `\`${m[1]}:${m[2]}\` — 그 파일은 ${total}행뿐이다 (행 번호가 드리프트했다)`,
        );
      }
    }
  });
}

// ── ⑧ `system-spec §N.N` 절 포인터가 실재하는가 ────────────────────────────
// ⑦이 **행** 참조 드리프트를 잡는다면 이건 **절** 참조 드리프트를 잡는다. 같은 부류다 —
// 대상 문서가 개편되면 번호가 조용히 어긋나고, 포인터를 따라간 사람은 엉뚱한 규칙을 읽는다.
//
// 2026-08-07 실측: CLAUDE.md가 AI 타임아웃 규칙을 `system-spec §4.3`으로 가리켰는데
// §4.3은 **CSP 규칙**이었다(실제 위치는 §3.3). 링크 자체는 유효해서 ③이 못 잡았고,
// 행 번호가 아니라 절 번호라 ⑦도 못 잡았다 — **어느 검사에도 안 걸리는 사각지대**였다.
//
// ⚠️ **이 검사의 한계를 알고 쓸 것.** 번호만 적힌 포인터는 *존재 여부*만 본다 —
// 위의 §4.3처럼 **실재하지만 엉뚱한 절**을 가리키는 것은 못 잡는다(오늘의 그 버그다).
// 그래서 **제목 힌트**를 함께 적으면 그것까지 검증한다:
//     `system-spec §3.3 (AI 호출 타임아웃)`   ← 괄호 안이 실제 제목에 포함되는지 확인
// 힌트를 붙이는 것이 권장이고, 붙이지 않으면 약한 검사만 걸린다.
{
  const specPath = path.join(ROOT, 'docs/architecture/system-spec.md');
  if (fs.existsSync(specPath)) {
    const sections = new Map<string, string>();
    for (const line of fs.readFileSync(specPath, 'utf8').split(/\r?\n/)) {
      const m = /^#{2,4}\s+([0-9]+(?:\.[0-9]+)*)\s+(.*)$/.exec(line);
      if (m) sections.set(m[1], m[2]);
    }
    for (const f of allMd) {
      if (isHistory(f)) continue;
      const lines = stripFences(fs.readFileSync(f, 'utf8')).split(/\r?\n/);
      lines.forEach((line, i) => {
        if (isGuardrail(lines, i)) return;
        // `system-spec §3.3` 또는 `system-spec §3.3 (제목 힌트)`
        for (const m of line.matchAll(/system-spec §([0-9]+(?:\.[0-9]+)*)(?:\s*\(([^)]{2,40})\))?/g)) {
          const [, num, hint] = m;
          const title = sections.get(num);
          if (title === undefined) {
            add(
              '⑧ 절 포인터',
              `${rel(f)}:${i + 1}`,
              `\`system-spec §${num}\` — system-spec.md에 그런 절이 없다 ` +
                `(실재: ${[...sections.keys()].sort().join(' · ')})`,
            );
            continue;
          }
          // 힌트가 있으면 **가리키는 절이 맞는지**까지 본다 — 번호만으로는 못 잡는 층이다.
          if (hint) {
            const norm = (s: string): string => s.replace(/[\s`*🔇]/g, '');
            if (!norm(title).includes(norm(hint))) {
              add(
                '⑧ 절 포인터',
                `${rel(f)}:${i + 1}`,
                `\`system-spec §${num} (${hint})\` — §${num}의 실제 제목은 "${title}"이다. ` +
                  `번호나 힌트 중 하나가 틀렸다`,
              );
            }
          }
        }
      });
    }
  }
}

// ── 보고 ──────────────────────────────────────────────────────────────────
const byCheck = new Map<string, Violation[]>();
for (const v of violations) {
  const list = byCheck.get(v.check) ?? [];
  list.push(v);
  byCheck.set(v.check, list);
}

console.log(`문서 정합성 검사 — md ${allMd.length}개 · ADR ${adrs.length}개\n`);

// 검사 개수는 세어서 출력한다 — 상수로 박으면 검사를 추가할 때 조용히 어긋난다
// (실제로 헤더가 "4종"인데 출력이 "5/5"인 드리프트가 있었다).
const TOTAL_CHECKS = 9;

if (violations.length === 0) {
  console.log(`위반 없음 (${TOTAL_CHECKS}/${TOTAL_CHECKS} 통과)`);
  process.exit(0);
}

for (const [check, list] of [...byCheck.entries()].sort()) {
  console.log(`\n${check} — ${list.length}건`);
  for (const v of list) console.log(`  ${v.where}\n    ${v.detail}`);
}
console.log(`\n총 ${violations.length}건 위반`);
process.exit(1);
