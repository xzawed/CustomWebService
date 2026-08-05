// scripts/checkDocIntegrity.ts
// Run: pnpm docs:check
//
// 문서 정합성 검사 4종. 트리거·경로·명령어는 **테스트도 lint도 안 잡는** 유일한
// 문서 요소이고, 실제로 죽어 있던 것이 이미 2건 나왔다
// (ENV_VAR_DENYLIST — 보안 ADR / isNotFound — SQLite 컷오버 때 제거).
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

// ── 보고 ──────────────────────────────────────────────────────────────────
const byCheck = new Map<string, Violation[]>();
for (const v of violations) {
  const list = byCheck.get(v.check) ?? [];
  list.push(v);
  byCheck.set(v.check, list);
}

console.log(`문서 정합성 검사 — md ${allMd.length}개 · ADR ${adrs.length}개\n`);

if (violations.length === 0) {
  console.log('위반 없음 (4/4 통과)');
  process.exit(0);
}

for (const [check, list] of [...byCheck.entries()].sort()) {
  console.log(`\n${check} — ${list.length}건`);
  for (const v of list) console.log(`  ${v.where}\n    ${v.detail}`);
}
console.log(`\n총 ${violations.length}건 위반`);
process.exit(1);
