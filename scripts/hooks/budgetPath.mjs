// scripts/hooks/budgetPath.mjs
//
// **예산 훅의 경로 판정 로직 — 순수 함수로 분리했다.**
//
// 왜 분리했나: 훅 본체는 stdin 을 읽고 `process.exit` 하는 실행 스크립트라
// 서브프로세스로만 시험할 수 있고, 그러면 **판정이 실행 플랫폼의 파일시스템에 묶인다.**
// 2026-08-08 감사가 그 결과를 실측했다 — 파일명 대소문자 회귀 테스트 3건이
// **Linux CI(전 잡 `ubuntu-latest`)에서는 수정 전 훅으로도 그대로 통과**했다.
// 대소문자 구분 FS 에서는 기대값이 `allow` 인데 수정 전 훅도 `allow` 를 주기 때문이다.
// 즉 **수정을 통째로 지워도 CI 는 초록이었다.**
//
// 여기 있는 함수들은 파일시스템을 **주입받으므로**, 두 가지 FS 의미론을 전부
// 어느 플랫폼에서나 시험할 수 있다. 그것이 이 파일의 존재 이유다.
import path from 'node:path';

/**
 * `F:\a\b` · `f:/a/b` · `/f/a/b` · `\\?\F:\a\b` · `//localhost/F$/a/b` 를
 * 전부 `f:/a/b` 로 접는다.
 *
 * ⚠️ **세 번 뚫린 자리다. 여기를 고칠 때는 회귀 테스트를 먼저 늘려라.**
 *  1. 경로 형식(MSYS `/f/…` vs `F:\…`) — 훅 최초 구현이 아무것도 막지 못했다
 *  2. `./` · `../` · `//` — `path.posix.normalize` 누락 (#304)
 *  3. Windows 확장길이·디바이스·UNC 접두사 — 아래 (2026-08-08)
 *
 * 3번은 실제 Edit 도구로 종단 실증됐다: `\\?\F:\…\AGENTS.md` 로 편집하면 훅이
 * 통과시키고 **진짜 AGENTS.md 가 94줄(예산 80)이 됐다.** 같은 편집을 정상 경로로
 * 하면 차단된다. Node 와 Write/Edit 도구가 이 표기를 그대로 받아 같은 파일에 쓰기 때문이다.
 */
export function canonical(p) {
  let s = String(p).replace(/\\/g, '/');

  // 확장길이(`\\?\`)·디바이스(`\\.\`) 접두사를 벗긴다. 벗기면 `F:/…` 또는 `UNC/host/share/…` 가 남는다.
  const device = /^\/\/[?.]\//.exec(s);
  if (device) {
    s = s.slice(device[0].length);
    s = s.replace(/^UNC\//i, '//'); // `\\?\UNC\host\share\…` → `//host/share/…`
  }

  // 관리 공유 `//host/F$/…` 는 `F:/…` 와 **같은 파일**이다.
  s = s.replace(/^\/\/[^/]+\/([A-Za-z])\$\//, '$1:/');

  const msys = /^\/([A-Za-z])\/(.*)$/.exec(s); // /f/DEVELOPMENT/… → f:/DEVELOPMENT/…
  if (msys) s = `${msys[1]}:/${msys[2]}`;

  s = path.posix.normalize(s); // ./ · ../ · // 를 접는다
  return s
    .replace(/^([A-Za-z]):/, (_, d) => `${d.toLowerCase()}:`)
    .toLowerCase()
    .replace(/\/+$/, '');
}

/**
 * 편집 대상이 예산 대상 파일인지 판정하고, 맞으면 **정규 이름**(BUDGETS 의 키)을 돌려준다.
 *
 * 대소문자 조회는 무시하되, **정말 같은 파일인지는 파일시스템에 물어본다** —
 * Windows·macOS 는 `claude.md` 가 CLAUDE.md 와 같은 파일이지만 Linux 는 **다른 파일**이고
 * 그때 막으면 오탐이다.
 *
 * @param {string} rawBase   편집 대상의 basename (원문 대소문자 그대로)
 * @param {string[]} budgetKeys 예산이 걸린 정규 파일명 목록
 * @param {{ listDir: () => string[], exists: (name: string) => boolean }} fsProbe
 *        저장소 루트의 실제 엔트리 목록과 존재 여부. **주입받는 이유는 테스트다** — 위 주석 참조.
 * @returns {string | null} 예산 대상이면 정규 이름, 아니면 null
 */
export function resolveBudgetName(rawBase, budgetKeys, fsProbe) {
  const match = budgetKeys.find((k) => k.toLowerCase() === String(rawBase).toLowerCase());
  if (match === undefined) return null;
  if (rawBase === match) return match;

  // 대소문자가 다르다 — 같은 파일인가?
  let entries;
  try {
    entries = fsProbe.listDir();
  } catch {
    return null; // 루트를 못 읽으면 판정하지 않는다(fail-open)
  }
  // 그 이름의 엔트리가 **실재**하면 별개 파일이다(대소문자 구분 FS) → 예산 대상이 아니다
  if (entries.includes(rawBase)) return null;
  // 엔트리에 없는데 존재한다면 대소문자 무시 FS → **같은 파일**이다
  return fsProbe.exists(rawBase) ? match : null;
}
