// 예산 훅의 **경로 판정**을 플랫폼 무관하게 검증한다.
//
// 왜 이 파일이 따로 있나 (2026-08-08 감사 결과):
// 형제 파일 `guardAlwaysLoadedBudget.test.ts` 는 훅을 **서브프로세스로** 돌리므로
// 판정이 실행 플랫폼의 파일시스템에 묶인다. CI 는 전 잡이 `ubuntu-latest`(대소문자 구분)라
// 파일명 대소문자 회귀 테스트 3건이 거기서는 `allow` 를 기대하는데,
// **수정 전 훅도 같은 입력에 `allow`** 를 준다 → **수정을 지워도 CI 는 초록이었다.**
// 개발자 머신(Windows)에서만 참인 초록이었고, G1 이 말하는 "초록색은 증거가 아니다"의 실례다.
//
// 여기서는 파일시스템을 **주입**하므로 두 의미론을 어느 플랫폼에서나 시험한다.
import { describe, it, expect } from 'vitest';
import { canonical, resolveBudgetName } from '../../../scripts/hooks/budgetPath.mjs';

const B = String.fromCharCode(92); // 소스에 백슬래시 리터럴을 두지 않는다(이스케이프 사고 방지)
const ROOT_FWD = 'f:/DEV/repo';
const ROOT_WIN = `F:${B}DEV${B}repo`;

describe('canonical — 같은 파일을 가리키는 표기는 전부 같은 문자열로 접힌다', () => {
  const expected = 'f:/dev/repo/claude.md';

  it.each([
    ['슬래시 소문자 드라이브', `${ROOT_FWD}/CLAUDE.md`],
    ['백슬래시 대문자 드라이브', `${ROOT_WIN}${B}CLAUDE.md`],
    ['MSYS(Git Bash)', '/f/DEV/repo/CLAUDE.md'],
    ['상대 요소 ./', `${ROOT_FWD}/./CLAUDE.md`],
    ['상대 요소 ../', `${ROOT_FWD}/docs/../CLAUDE.md`],
    ['중복 슬래시', `${ROOT_FWD}//CLAUDE.md`],
    // ⚠️ 아래 5종이 2026-08-08 에 실제로 훅을 우회했다. Write/Edit 도구가 이 표기를 받아
    //    **같은 파일에 쓴다**(실측: `\\?\…\AGENTS.md` 편집이 진짜 AGENTS.md 를 94줄로 만들었다).
    ['확장길이 백슬래시', `${B}${B}?${B}${ROOT_WIN}${B}CLAUDE.md`],
    ['확장길이 슬래시', `//?/${ROOT_FWD}/CLAUDE.md`],
    ['디바이스 경로', `//./${ROOT_FWD}/CLAUDE.md`],
    ['UNC 관리공유(백슬래시)', `${B}${B}localhost${B}F$${B}DEV${B}repo${B}CLAUDE.md`],
    ['UNC 관리공유(슬래시)', '//localhost/F$/DEV/repo/CLAUDE.md'],
    ['확장길이 UNC', `${B}${B}?${B}UNC${B}localhost${B}F$${B}DEV${B}repo${B}CLAUDE.md`],
  ])('%s', (_label, input) => {
    expect(canonical(input)).toBe(expected);
  });

  it('다른 파일은 접히지 않는다 (통제군 — 위 단언이 전부를 같게 만드는 게 아님을 보인다)', () => {
    expect(canonical(`${ROOT_FWD}/docs/CLAUDE.md`)).not.toBe(expected);
    expect(canonical(`${ROOT_FWD}/CLAUDE.md.bak`)).not.toBe(expected);
    expect(canonical('g:/DEV/repo/CLAUDE.md')).not.toBe(expected);
    // 관리 공유가 아닌 평범한 UNC 공유는 드라이브로 접지 않는다
    expect(canonical('//fileserver/public/DEV/repo/CLAUDE.md')).not.toBe(expected);
  });
});

describe('resolveBudgetName — 대소문자 무시 FS', () => {
  // 실제 엔트리는 'CLAUDE.md' 하나뿐이고, 'claude.md' 로 물으면 **존재한다**고 답한다.
  const fsProbe = {
    listDir: () => ['CLAUDE.md', 'AGENTS.md', 'README.md'],
    exists: (name: string) => ['claude.md', 'agents.md', 'readme.md'].includes(name.toLowerCase()),
  };
  const keys = ['CLAUDE.md', 'AGENTS.md'];

  it.each(['CLAUDE.md', 'claude.md', 'Claude.md', 'CLAUDE.MD', 'AGENTS.md', 'agents.md'])(
    '%s → 예산 대상으로 판정한다 (같은 파일이므로)',
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
  // Linux 에서 `claude.md` 는 **진짜 다른 파일**이다. 막으면 오탐이다.
  const fsProbe = {
    listDir: () => ['CLAUDE.md', 'AGENTS.md'],
    exists: (name: string) => ['CLAUDE.md', 'AGENTS.md'].includes(name),
  };
  const keys = ['CLAUDE.md', 'AGENTS.md'];

  it('정확히 일치하면 예산 대상이다', () => {
    expect(resolveBudgetName('CLAUDE.md', keys, fsProbe)).toBe('CLAUDE.md');
  });

  it('대소문자가 다르고 그 이름의 파일이 없으면 null — 새 파일이므로 예산 대상이 아니다', () => {
    expect(resolveBudgetName('claude.md', keys, fsProbe)).toBeNull();
  });

  it('대소문자가 다른 파일이 **별도로 실재**하면 null — 별개 파일이다', () => {
    const withBoth = {
      listDir: () => ['CLAUDE.md', 'claude.md'],
      exists: (name: string) => ['CLAUDE.md', 'claude.md'].includes(name),
    };
    expect(resolveBudgetName('claude.md', keys, withBoth)).toBeNull();
  });
});

describe('resolveBudgetName — fail-open', () => {
  it('디렉터리를 못 읽으면 null (훅 고장이 작업을 막으면 안 된다)', () => {
    const broken = {
      listDir: (): string[] => {
        throw new Error('EACCES');
      },
      exists: () => true,
    };
    expect(resolveBudgetName('claude.md', ['CLAUDE.md'], broken)).toBeNull();
  });
});
