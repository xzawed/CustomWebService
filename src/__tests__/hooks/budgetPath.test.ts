// 예산 훅의 **대상 판정**을 플랫폼 무관하게 검증한다.
//
// 왜 이 파일이 따로 있나 (2026-08-08 감사 결과):
// 형제 파일 `guardAlwaysLoadedBudget.test.ts` 는 훅을 **서브프로세스로** 돌리므로
// 판정이 실행 플랫폼의 파일시스템에 묶인다. CI 는 전 잡이 `ubuntu-latest`(대소문자 구분)라
// 파일명 대소문자 회귀 테스트가 거기서는 **수정 전 훅으로도 통과**했다 —
// 즉 수정을 지워도 CI 는 초록이었다. G1 의 "초록색은 증거가 아니다"의 실례다.
//
// 여기서는 파일시스템(`stat` · `realpath` · 디렉터리 목록)을 **주입**하므로
// Windows 고유 표기법과 두 FS 의미론을 **어느 플랫폼에서나** 시험한다.
import { describe, it, expect } from 'vitest';
import {
  canonical,
  isSameFile,
  resolveBudgetName,
  baseNameOf,
} from '../../../scripts/hooks/budgetPath.mjs';

const B = String.fromCharCode(92); // 소스에 백슬래시 리터럴을 두지 않는다(이스케이프 사고 방지)
const WIN = `F:${B}DEV${B}repo${B}CLAUDE.md`;
const GUID = `${B}${B}?${B}Volume{e4fddb3d-d1fc-4f32-9063-dc7fe1038925}${B}DEV${B}repo${B}CLAUDE.md`;
const UNC = `${B}${B}localhost${B}F$${B}DEV${B}repo${B}CLAUDE.md`;
const EXTLEN = `${B}${B}?${B}F:${B}DEV${B}repo${B}CLAUDE.md`;
const MSYS = '/f/DEV/repo/CLAUDE.md';
const OTHER = `F:${B}DEV${B}repo${B}docs${B}README.md`;

/**
 * 2026-08-08 실측을 그대로 옮긴 가짜 파일시스템.
 *   · ino/dev  — 정상·GUID·UNC·확장길이가 전부 **동일**, MSYS 는 해석 불가(throw)
 *   · realpath — GUID·확장길이는 `F:\…` 로 접히지만 **UNC 는 `\\localhost\F$\…` 로 남는다**
 * 이 비대칭이 층을 쌓는 이유다. 한 층만으로는 반드시 구멍이 남는다.
 */
const SAME = new Set([WIN, GUID, UNC, EXTLEN]);
const realFs = {
  stat: (p: string) => {
    if (SAME.has(p)) return { ino: '25051272927992280', dev: '713254832' };
    if (p === OTHER) return { ino: '99999999999999999', dev: '713254832' };
    throw new Error('ENOENT');
  },
  realpath: (p: string) => {
    if (p === WIN || p === GUID || p === EXTLEN) return WIN;
    if (p === UNC) return `${B}${B}localhost${B}F$${B}DEV${B}repo${B}CLAUDE.md`;
    if (p === OTHER) return OTHER;
    throw new Error('ENOENT');
  },
};

describe('isSameFile — 다섯 번 뚫린 표기법이 전부 같은 파일로 판정된다', () => {
  it.each([
    ['정상 드라이브', WIN],
    ['볼륨 GUID (#307 이후 남아 있던 다섯 번째 구멍)', GUID],
    ['UNC 관리공유 (realpath 문자열은 불일치 — ino 층이 잡는다)', UNC],
    ['확장길이 접두사', EXTLEN],
    ['MSYS (파일시스템이 해석 못 함 — 문자열 층이 잡는다)', MSYS],
  ])('%s', (_label, input) => {
    expect(isSameFile(input, WIN, realFs)).toBe(true);
  });

  it('다른 파일은 false — 통제군(위 단언이 전부를 같게 만드는 게 아님을 보인다)', () => {
    expect(isSameFile(OTHER, WIN, realFs)).toBe(false);
    expect(isSameFile(`F:${B}DEV${B}repo${B}CLAUDE.md.bak`, WIN, realFs)).toBe(false);
    expect(isSameFile('g:/DEV/repo/CLAUDE.md', WIN, realFs)).toBe(false);
    expect(isSameFile('//fileserver/public/DEV/repo/CLAUDE.md', WIN, realFs)).toBe(false);
  });

  // 각 층이 **혼자서는** 부족함을 보인다 — 층을 지우는 리팩터가 조용히 통과하지 못하게 한다.
  it('ino 층만으로는 MSYS 를 못 잡는다', () => {
    const inoOnly = { stat: realFs.stat };
    expect(isSameFile(GUID, WIN, inoOnly)).toBe(true);
    expect(isSameFile(MSYS, WIN, inoOnly)).toBe(true); // ③ 문자열 층이 받아준다
  });

  it('realpath 층만으로는 UNC 를 못 잡는다 — 문자열이 다르기 때문', () => {
    const realOnly = { realpath: realFs.realpath };
    expect(normalizedRealpathAgree(realOnly, UNC, WIN)).toBe(false); // 층 자체는 실패하고
    expect(isSameFile(UNC, WIN, realOnly)).toBe(true); // ③ 문자열 층이 받아준다
  });

  // ⚠️ 아래 두 건이 **realpath 층을 격리**한다. 이게 없으면 그 층을 통째로 지워도 전부 초록이었다
  // (2026-08-08 뮤테이션에서 실제로 그랬다) — 볼륨 GUID 는 ① ino 나 ③ 문자열 중 하나가
  // 항상 받아줘서 ② 의 기여가 가려졌기 때문이다. 층마다 **혼자 감당하는 사례**가 있어야 한다.
  it('ino 를 쓸 수 없는 파일시스템에서는 realpath 층이 볼륨 GUID 를 혼자 잡는다', () => {
    const realOnly = { realpath: realFs.realpath }; // stat 없음
    // ③ 문자열 층은 GUID 를 못 접는다(위 canonical 단언 참조) → ② 만이 성립 근거다
    expect(canonical(GUID)).not.toBe(canonical(WIN));
    expect(isSameFile(GUID, WIN, realOnly)).toBe(true);
  });

  it('신규 파일(대상이 아직 없음)은 부모 디렉터리 신원으로 판정한다 — GUID 로 검증', () => {
    const GUID_DIR = `${B}${B}?${B}Volume{e4fddb3d-d1fc-4f32-9063-dc7fe1038925}${B}DEV${B}repo`;
    const noTarget = {
      realpath: (p: string) => {
        if (p === `F:${B}DEV${B}repo` || p === GUID_DIR) return `F:${B}DEV${B}repo`;
        throw new Error('ENOENT'); // 파일 자체는 아직 없다
      },
    };
    // ③ 이 GUID 를 못 접으므로, 통과한다면 ②-b(부모 디렉터리 신원)뿐이다
    expect(isSameFile(GUID, WIN, noTarget)).toBe(true);
    expect(isSameFile(`${GUID_DIR}${B}OTHER.md`, WIN, noTarget)).toBe(false);
  });

  it('ino 가 0 이면 신뢰하지 않는다 (일부 파일시스템은 0 을 준다)', () => {
    const zeroIno = { stat: () => ({ ino: 0, dev: 1 }) };
    expect(isSameFile('x:/a/ZERO.md', 'y:/b/ZERO.md', zeroIno)).toBe(false);
  });

  it('파일시스템이 전부 실패해도 던지지 않는다 (fail-open — 호출부가 allow 한다)', () => {
    const broken = {
      stat: () => {
        throw new Error('EACCES');
      },
      realpath: () => {
        throw new Error('EACCES');
      },
    };
    expect(isSameFile('f:/a/X.md', 'f:/b/Y.md', broken)).toBe(false);
    expect(isSameFile(WIN, WIN, broken)).toBe(true); // 문자열 층은 여전히 동작한다
  });
});

/** 위 "realpath 층만으로는 UNC 를 못 잡는다" 단언의 보조 — 층 자체의 판정을 직접 본다. */
function normalizedRealpathAgree(
  probe: { realpath: (p: string) => string },
  a: string,
  b: string,
): boolean {
  const n = (p: string) => p.replaceAll(B, '/').toLowerCase();
  try {
    return n(probe.realpath(a)) === n(probe.realpath(b));
  } catch {
    return false;
  }
}

describe('canonical — 문자열 층(마지막 층)', () => {
  const expected = 'f:/dev/repo/claude.md';

  it.each([
    ['슬래시', 'f:/DEV/repo/CLAUDE.md'],
    ['백슬래시', WIN],
    ['MSYS', MSYS],
    ['상대 요소 ./', 'f:/DEV/./repo/CLAUDE.md'],
    ['상대 요소 ../', 'f:/DEV/repo/docs/../CLAUDE.md'],
    ['중복 슬래시', 'f:/DEV//repo/CLAUDE.md'],
    ['확장길이', EXTLEN],
    ['디바이스', '//./f:/DEV/repo/CLAUDE.md'],
    ['UNC 관리공유', UNC],
    ['확장길이 UNC', `${B}${B}?${B}UNC${B}localhost${B}F$${B}DEV${B}repo${B}CLAUDE.md`],
  ])('%s', (_label, input) => {
    expect(canonical(input)).toBe(expected);
  });

  it('볼륨 GUID 는 접지 못한다 — 이것이 문자열 층의 한계이고 ①② 가 필요한 이유다', () => {
    expect(canonical(GUID)).not.toBe(expected);
  });

  it('다른 파일은 접히지 않는다 (통제군)', () => {
    expect(canonical(OTHER)).not.toBe(expected);
    expect(canonical('//fileserver/public/DEV/repo/CLAUDE.md')).not.toBe(expected);
  });
});

describe('resolveBudgetName — 대소문자 무시 FS', () => {
  const fsProbe = {
    listDir: () => ['CLAUDE.md', 'AGENTS.md', 'README.md'],
    exists: (name: string) => ['claude.md', 'agents.md', 'readme.md'].includes(name.toLowerCase()),
  };
  const keys = ['CLAUDE.md', 'AGENTS.md'];

  it.each(['CLAUDE.md', 'claude.md', 'Claude.md', 'CLAUDE.MD', 'AGENTS.md', 'agents.md'])(
    '%s → 예산 대상 (같은 파일이므로)',
    (name) => {
      expect(resolveBudgetName(name, keys, fsProbe)).toBe(
        name.toLowerCase().startsWith('claude') ? 'CLAUDE.md' : 'AGENTS.md',
      );
    },
  );

  it('예산 대상이 아닌 이름은 null (통제군)', () => {
    expect(resolveBudgetName('README.md', keys, fsProbe)).toBeNull();
    expect(resolveBudgetName('CLAUDE.md.bak', keys, fsProbe)).toBeNull();
  });
});

describe('resolveBudgetName — 대소문자 구분 FS (Linux)', () => {
  const fsProbe = {
    listDir: () => ['CLAUDE.md', 'AGENTS.md'],
    exists: (name: string) => ['CLAUDE.md', 'AGENTS.md'].includes(name),
  };
  const keys = ['CLAUDE.md', 'AGENTS.md'];

  it('정확히 일치하면 예산 대상이다', () => {
    expect(resolveBudgetName('CLAUDE.md', keys, fsProbe)).toBe('CLAUDE.md');
  });

  it('대소문자가 다르고 그 이름의 파일이 없으면 null — 새 파일이므로 대상이 아니다', () => {
    expect(resolveBudgetName('claude.md', keys, fsProbe)).toBeNull();
  });

  it('대소문자가 다른 파일이 **별도로 실재**하면 null — 별개 파일이다', () => {
    const withBoth = {
      listDir: () => ['CLAUDE.md', 'claude.md'],
      exists: (name: string) => ['CLAUDE.md', 'claude.md'].includes(name),
    };
    expect(resolveBudgetName('claude.md', keys, withBoth)).toBeNull();
  });

  it('디렉터리를 못 읽으면 null (fail-open)', () => {
    const broken = {
      listDir: (): string[] => {
        throw new Error('EACCES');
      },
      exists: () => true,
    };
    expect(resolveBudgetName('claude.md', ['CLAUDE.md'], broken)).toBeNull();
  });
});

describe('baseNameOf — 구분자 혼용·표기법 무관', () => {
  it.each([
    [WIN, 'CLAUDE.md'],
    [GUID, 'CLAUDE.md'],
    [MSYS, 'CLAUDE.md'],
    ['f:/DEV/repo/CLAUDE.md', 'CLAUDE.md'],
    ['CLAUDE.md', 'CLAUDE.md'],
  ])('%s → %s', (input, expected) => {
    expect(baseNameOf(input)).toBe(expected);
  });
});
