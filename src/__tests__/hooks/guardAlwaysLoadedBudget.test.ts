// 항상 로드되는 문서(CLAUDE.md·AGENTS.md)의 총량 예산을 **실제로 차단**하는지 검증한다.
//
// 왜 이 테스트가 필요한가: 2026-08-07에 이 훅을 처음 짰을 때 **아무것도 막지 못했다.**
// 경로 형식이 한 가지가 아니어서(MSYS `/f/...` vs Windows `F:\...`) 비교가 항상 불일치했고,
// 그대로 배선했으면 "게이트가 있다"는 착각만 남을 뻔했다. 이 세션의 결론이 바로 그것이다 —
// **검증하지 않은 방어물은 방어물이 아니라 연극이다.**
//
// 규약: 페이로드는 반드시 `JSON.stringify`로 만든다. 쉘 문자열로 손 이스케이프하지 말 것 —
// 훅을 짜는 동안 시험 하네스 버그가 **3번 연속** 같은 원인(쉘→node→JSON 3중 이스케이프)으로 났다.
//
// ⚠️ **이 파일만으로는 부족하다 — 판정이 실행 플랫폼의 파일시스템에 묶인다.**
// 여기 단언은 훅을 서브프로세스로 돌리므로, 대소문자 축은 Windows/macOS 에서만 의미가 있고
// CI(전 잡 `ubuntu-latest`)에서는 수정 전 훅으로도 통과한다(2026-08-08 감사 실측).
// **경로 판정의 실질 검증은 `budgetPath.test.ts`** 에 있다 — 파일시스템을 주입해
// 두 의미론을 어느 플랫폼에서나 시험한다. 이 파일은 **배선(도구·페이로드 처리)** 을 본다.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const HOOK = path.join(ROOT, 'scripts/hooks/guardAlwaysLoadedBudget.mjs');

/**
 * 예산은 **`scripts/doc-budgets.json` 단일 출처**에서 읽는다 — 훅·CI 검사기와 같은 파일이다.
 * 여기에 숫자를 다시 적으면 그 순간 네 번째 사본이 된다.
 */
const BUDGET = (
  JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/doc-budgets.json'), 'utf8')) as {
    alwaysLoaded: Record<string, number>;
  }
).alwaysLoaded;

type Decision = 'allow' | 'deny';

function runHook(payload: unknown): { decision: Decision; reason: string } {
  const out = execFileSync('node', [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
  });
  if (!out.trim()) return { decision: 'allow', reason: '' };
  const parsed = JSON.parse(out) as {
    hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string };
  };
  return {
    decision: parsed.hookSpecificOutput?.permissionDecision === 'deny' ? 'deny' : 'allow',
    reason: parsed.hookSpecificOutput?.permissionDecisionReason ?? '',
  };
}

const linesOf = (n: number): string => Array.from({ length: n }, () => 'x').join('\n');
const countLines = (p: string): number => fs.readFileSync(p, 'utf8').split(/\r?\n/).length;

const write = (filePath: string, content: string) => ({
  tool_name: 'Write',
  tool_input: { file_path: filePath, content },
});

describe('guardAlwaysLoadedBudget — 예산 초과 차단', () => {
  // AGENTS.md 를 기준 파일로 쓴다: 예산 이내(포인터 전용이라 여유가 크다)라 "초과로 만드는 편집"을
  // 그대로 시험할 수 있다. CLAUDE.md 는 축소 작업 중 일시적으로 예산을 넘을 수 있어
  // 기준으로 삼으면 테스트가 저장소 상태에 의존하게 된다.
  const agents = path.join(ROOT, 'AGENTS.md');

  it('AGENTS.md가 예산 이내임을 전제로 한다 (전제가 깨지면 아래 단언들이 무의미하다)', () => {
    expect(countLines(agents)).toBeLessThanOrEqual(BUDGET['AGENTS.md']);
  });

  it('예산을 넘기는 Write를 차단한다', () => {
    const r = runHook(write(agents, linesOf(BUDGET['AGENTS.md'] + 20)));
    expect(r.decision).toBe('deny');
    expect(r.reason).toContain('예산 초과');
  });

  it('예산 이내의 Write는 통과시킨다', () => {
    expect(runHook(write(agents, linesOf(BUDGET['AGENTS.md'] - 20))).decision).toBe('allow');
  });

  // ⚠️ 이 두 건이 최초 구현에서 **둘 다 통과(=차단 실패)** 했다. 경로 형식은 하나가 아니다.
  //
  // Windows 에서만 의미가 있다. POSIX 에서 백슬래시는 **경로 구분자가 아니라 파일명의 한 글자**라
  // `\a\b\AGENTS.md` 는 저장소 루트의 AGENTS.md 가 아닌 다른 이름이고, 훅이 통과시키는 것이 옳다.
  // (Linux CI 에서 이 단언이 실패해 알았다 — 로컬 Windows 에서는 드러나지 않았다.)
  it.skipIf(process.platform !== 'win32')('Windows 백슬래시 경로도 차단한다', () => {
    const winPath = agents.split(path.posix.sep).join(path.win32.sep);
    expect(runHook(write(winPath, linesOf(300))).decision).toBe('deny');
  });

  // 위 건의 플랫폼 독립 대체물 — 구분자를 섞어도 같은 파일로 정규화되는지 본다.
  // 이건 두 플랫폼 모두에서 유효하다.
  it('구분자가 섞인 경로도 같은 파일로 보고 차단한다', () => {
    const mixed = agents.replace(/[\\/]([^\\/]+)$/, '/$1');
    expect(runHook(write(mixed, linesOf(300))).decision).toBe('deny');
  });

  it('MSYS(Git Bash) 형식 경로도 차단한다 — /f/DEVELOPMENT/...', () => {
    const msys = agents.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d: string) => `/${d.toLowerCase()}`);
    expect(runHook(write(msys, linesOf(300))).decision).toBe('deny');
  });

  // ⚠️ 2026-08-07 실측: 정규화가 없던 시절 `<root>/docs/../AGENTS.md` 로 300줄 Write 가
  // **ALLOW** 됐다. 실수로 나올 형태는 아니지만 **강제 게이트에 뚫린 구멍은 게이트가 아니다.**
  it.each([
    ['./ 를 포함한 경로', (p: string) => p.replace(/([^/\\]+)$/, './$1')],
    ['../ 로 우회하는 경로', (p: string) => p.replace(/([^/\\]+)$/, 'docs/../$1')],
    ['중복 슬래시', (p: string) => p.replace(/([^/\\]+)$/, '/$1')],
  ])('%s 도 정규화해서 차단한다', (_name, mangle) => {
    const agentsPath = path.join(ROOT, 'AGENTS.md').split(path.sep).join('/');
    expect(runHook(write(mangle(agentsPath), linesOf(300))).decision).toBe('deny');
  });

  it('드라이브 문자 대소문자가 달라도 차단한다', () => {
    const upper = agents.replace(/^([a-z]):/, (_, d: string) => `${d.toUpperCase()}:`);
    const lower = agents.replace(/^([A-Z]):/, (_, d: string) => `${d.toLowerCase()}:`);
    expect(runHook(write(upper, linesOf(300))).decision).toBe('deny');
    expect(runHook(write(lower, linesOf(300))).decision).toBe('deny');
  });

  // ⚠️ 이 축이 18건 중 **0건**이었다. #304 는 `./` · `../` · `//` 같은 훨씬 드문 형태를
  // 막으면서, **오타 한 글자로 나는** 파일명 대소문자는 통째로 통과시켰다.
  // 2026-08-08 실측: `claude.md` · `Claude.md` · `CLAUDE.MD` · `agents.md` 로 400줄 Write 가 전부 ALLOW.
  //
  // 플랫폼에 따라 **정답이 다르다.** Windows/macOS 는 대소문자를 무시하므로 `agents.md` 는
  // AGENTS.md 와 같은 파일이고 막아야 한다. Linux 는 구분하므로 진짜 다른 파일이고 막으면 오탐이다.
  // 그래서 이름이 아니라 **파일시스템에 실제로 물어본** 결과를 기대값으로 쓴다.
  const caseInsensitiveFs =
    !fs.readdirSync(ROOT).includes('agents.md') && fs.existsSync(path.join(ROOT, 'agents.md'));

  it.each(['agents.md', 'Agents.md', 'AGENTS.MD'])(
    '파일명 대소문자 변형 %s — 대소문자 무시 FS 에서는 같은 파일이므로 차단한다',
    (name) => {
      const r = runHook(write(path.join(ROOT, name), linesOf(300)));
      expect(r.decision).toBe(caseInsensitiveFs ? 'deny' : 'allow');
    },
  );

  it('대소문자가 정확히 일치하는 정상 경로는 어느 플랫폼에서든 차단한다 (위 단언의 통제군)', () => {
    expect(runHook(write(agents, linesOf(300))).decision).toBe('deny');
  });

  it('Edit로 예산을 넘기는 것도 차단한다 (Write만 막으면 우회된다)', () => {
    const first = fs.readFileSync(agents, 'utf8').split(/\r?\n/)[0];
    const r = runHook({
      tool_name: 'Edit',
      tool_input: {
        file_path: agents,
        old_string: first,
        new_string: `${first}\n${linesOf(300)}`,
      },
    });
    expect(r.decision).toBe('deny');
  });
});

describe('guardAlwaysLoadedBudget — 오탐 방지', () => {
  it('예산 대상이 아닌 문서는 아무리 길어도 통과시킨다', () => {
    expect(runHook(write(path.join(ROOT, 'docs/README.md'), linesOf(1000))).decision).toBe('allow');
  });

  it('하위 디렉터리의 동명 파일은 대상이 아니다', () => {
    expect(runHook(write(path.join(ROOT, 'docs/AGENTS.md'), linesOf(1000))).decision).toBe('allow');
  });

  it('Write·Edit 이외의 도구는 관여하지 않는다', () => {
    const r = runHook({ tool_name: 'Read', tool_input: { file_path: path.join(ROOT, 'AGENTS.md') } });
    expect(r.decision).toBe('allow');
  });

  // 이미 초과한 상태에서 **줄이는** 편집까지 막으면 축소 작업 자체가 불가능해진다.
  it('예산을 이미 넘긴 파일을 더 줄이는 편집은 통과시킨다', () => {
    const claude = path.join(ROOT, 'CLAUDE.md');
    const now = countLines(claude);
    if (now <= BUDGET['CLAUDE.md']) {
      // 예산 이내면 이 시나리오가 성립하지 않는다 — 대신 초과 Write가 막히는지만 본다
      expect(runHook(write(claude, linesOf(BUDGET['CLAUDE.md'] + 50))).decision).toBe('deny');
      return;
    }
    expect(runHook(write(claude, linesOf(now - 50))).decision).toBe('allow');
  });
});

describe('guardAlwaysLoadedBudget — fail-open (훅 고장이 작업을 막으면 안 된다)', () => {
  it('빈 입력이면 통과시킨다', () => {
    expect(runHook('').decision).toBe('allow');
  });

  it('페이로드에 file_path가 없으면 통과시킨다', () => {
    expect(runHook({ tool_name: 'Write', tool_input: {} }).decision).toBe('allow');
  });

  it('깨진 JSON을 받아도 종료 코드 0으로 통과시킨다', () => {
    const out = execFileSync('node', [HOOK], { input: '{not json', encoding: 'utf8' });
    expect(out.trim()).toBe('');
  });
});
