// scripts/hooks/budgetPath.mjs
//
// **예산 훅의 대상 판정 — 순수 함수. 파일시스템을 주입받는다.**
//
// ## 왜 문자열 정규화만으로는 안 되나 (2026-08-08)
//
// 이 훅은 "편집 대상이 저장소 루트의 CLAUDE.md·AGENTS.md 인가" 를 판정한다.
// 그 판정을 **경로 문자열 정규화**로만 하다가 **다섯 번 뚫렸다.** 매번 "이제 막힌다"고
// 선언한 직후에 다음 표기법이 나왔다:
//
//   1. 경로 형식        MSYS `/f/…` vs `F:\…`                      (#294)
//   2. 상대 요소        `./` · `../` · `//`                        (#304)
//   3. 파일명 대소문자  `claude.md`                                (#306)
//   4. 확장길이·UNC     `\\?\F:\…` · `\\localhost\F$\…` · `//./…`  (#307)
//   5. 볼륨 GUID        `\\?\Volume{…}\…`                          (이 파일)
//
// 다섯 번 다 같은 구조적 이유다 — **정규화는 "아는 표기법"의 거부목록**이고,
// Windows 는 같은 파일을 가리키는 표기법이 계속 나온다. 여섯 번째가 없다고 믿을 근거가 없다.
//
// ## 그래서 층을 쌓는다 — 셋이 서로 다른 것을 잡는다 (2026-08-08 실측)
//
//   표기                    ino/dev   realpath 문자열              문자열 정규화
//   정상 드라이브            동일      F:\…            일치          일치
//   볼륨 GUID               동일      F:\…            일치          ✗ (몰랐던 표기)
//   UNC 관리공유            동일      \\localhost\F$\… **불일치**    일치
//   MSYS `/f/…`             ENOENT    ENOENT                        일치
//   통제군(다른 파일)        다름      다름                          다름
//
// 즉 **ino 는 UNC 를 잡지만 realpath 문자열은 못 잡고, 둘 다 MSYS 는 못 잡는다.**
// 하나만 쓰면 반드시 구멍이 남는다. 셋 중 **하나라도 같다고 하면 같은 파일**로 본다 —
// 차단 게이트에서 안전한 방향은 "더 많이 막는 쪽"이고, 오탐은 통제군 테스트가 지킨다.

/**
 * 경로를 디렉터리/파일명으로 쪼갠다. 구분자 혼용을 허용하고 플랫폼에 의존하지 않는다.
 *
 * ⚠️ **원본 구분자를 보존한다.** `dir` 을 다시 파일시스템에 넘기기 때문이다 —
 * Windows 의 `\\?\` 확장길이 경로는 **정규화를 우회해 백슬래시만 받으므로**,
 * `/` 로 바꿔서 넘기면 realpath 가 실패한다(2026-08-08 테스트가 이걸 잡았다).
 */
function splitTail(p) {
  const s = String(p);
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  if (i === -1) return { dir: '.', base: s };
  return { dir: s.slice(0, i) || s.slice(i, i + 1), base: s.slice(i + 1) };
}

/** 후행 슬래시를 **정규식 없이** 잘라낸다(`/\/+$/` 는 슬래시가 많은 입력에서 백트래킹한다). */
function trimTrailingSlash(s) {
  let end = s.length;
  while (end > 0 && s[end - 1] === '/') end -= 1;
  return s.slice(0, end);
}

/** 상대 요소(`.` · `..`)와 중복 슬래시를 접는다. `path.posix.normalize` 의 최소 대체물. */
function collapse(s) {
  const abs = s.startsWith('/');
  const out = [];
  for (const seg of s.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop();
      else if (!abs) out.push('..');
      continue;
    }
    out.push(seg);
  }
  return (abs ? '/' : '') + out.join('/');
}

/**
 * 문자열 층 — `F:\a\b` · `f:/a/b` · `/f/a/b` · `\\?\F:\a\b` · `//host/F$/a/b` 를 `f:/a/b` 로 접는다.
 *
 * ⚠️ **이것만으로는 부족하다.** 이 함수는 아는 표기법만 접는 **거부목록**이고 다섯 번 뚫렸다.
 * `isSameFile` 의 **마지막 층**으로만 쓴다 — 파일시스템이 해석하지 못하는 표기(MSYS `/f/…`)를 담당한다.
 */
export function canonical(p) {
  let s = String(p).replaceAll('\\', '/');

  // 확장길이(`\\?\`)·디바이스(`\\.\`) 접두사를 벗긴다 → `F:/…` 또는 `UNC/host/share/…` 가 남는다.
  const device = /^\/\/[?.]\//.exec(s);
  if (device) {
    s = s.slice(device[0].length);
    s = s.replace(/^UNC\//i, '//'); // `\\?\UNC\host\share\…` → `//host/share/…`
  }
  // 관리 공유 `//host/F$/…` 는 `F:/…` 와 **같은 파일**이다.
  s = s.replace(/^\/\/[^/]+\/([A-Za-z])\$\//, '$1:/');
  // MSYS(Git Bash) `/f/…` → `f:/…`  ← 파일시스템이 해석하지 못하는 유일한 축이다
  const msys = /^\/([A-Za-z])\/(.*)$/.exec(s);
  if (msys) s = `${msys[1]}:/${msys[2]}`;

  s = collapse(s);
  return trimTrailingSlash(s.replace(/^([A-Za-z]):/, (_, d) => `${d.toLowerCase()}:`).toLowerCase());
}

/** realpath 결과 비교용 — 구분자와 대소문자만 맞춘다. */
const normReal = (p) => trimTrailingSlash(String(p).replaceAll('\\', '/').toLowerCase());

/** `{ ino, dev }` 를 문자열 키로. 둘 중 하나라도 0/undefined 면 신뢰하지 않는다(일부 FS 는 0을 준다). */
function identityKey(st) {
  if (!st) return null;
  const ino = String(st.ino ?? '');
  const dev = String(st.dev ?? '');
  if (!ino || ino === '0' || !dev) return null;
  return `${ino}/${dev}`;
}

const attempt = (fn) => {
  try {
    return fn();
  } catch {
    return null;
  }
};

/**
 * 두 경로가 **같은 파일**을 가리키는가. 위 표를 근거로 세 층을 겹친다.
 *
 * @param {string} inputPath  편집 대상 경로 (어떤 표기법이든)
 * @param {string} targetPath 예산이 걸린 실제 파일 경로
 * @param {{ stat?: (p: string) => unknown, realpath?: (p: string) => string }} fsProbe
 *        `fs.statSync` · `fs.realpathSync.native` 를 주입한다. **주입하는 이유는 테스트다** —
 *        실제 파일시스템에 의존하면 판정이 실행 플랫폼에 묶여 CI 가 눈이 먼다(#307 에서 실제로 그랬다).
 * @returns {boolean} 같은 파일이면 true. **판정할 수 없으면 false**(호출부가 fail-open 한다).
 */
export function isSameFile(inputPath, targetPath, fsProbe) {
  // ① 파일시스템 신원 — 표기법과 무관하다. 볼륨 GUID·UNC 를 전부 잡는다.
  if (fsProbe.stat) {
    const a = identityKey(attempt(() => fsProbe.stat(inputPath)));
    const b = identityKey(attempt(() => fsProbe.stat(targetPath)));
    if (a !== null && a === b) return true;
  }

  // ② realpath 문자열 — ino 를 믿을 수 없는 파일시스템 대비.
  if (fsProbe.realpath) {
    const ra = attempt(() => fsProbe.realpath(inputPath));
    const rb = attempt(() => fsProbe.realpath(targetPath));
    if (ra && rb && normReal(ra) === normReal(rb)) return true;

    // ②-b 대상이 아직 없을 수 있다(신규 Write). 부모 디렉터리 신원 + 파일명으로 본다.
    if (!ra || !rb) {
      const x = splitTail(inputPath);
      const y = splitTail(targetPath);
      if (x.base.toLowerCase() === y.base.toLowerCase()) {
        const da = attempt(() => fsProbe.realpath(x.dir));
        const db = attempt(() => fsProbe.realpath(y.dir));
        if (da && db && normReal(da) === normReal(db)) return true;
      }
    }
  }

  // ③ 문자열 정규화 — 파일시스템이 **해석하지 못하는** 표기(MSYS `/f/…`) 전용 마지막 층.
  return canonical(inputPath) === canonical(targetPath);
}

/**
 * 편집 대상이 예산 대상인지 판정하고, 맞으면 **정규 이름**(BUDGETS 의 키)을 돌려준다.
 *
 * 대소문자 조회는 무시하되, **정말 같은 파일인지는 파일시스템에 물어본다** —
 * Windows·macOS 는 `claude.md` 가 CLAUDE.md 와 같은 파일이지만 Linux 는 **다른 파일**이고
 * 그때 막으면 오탐이다.
 */
export function resolveBudgetName(rawBase, budgetKeys, fsProbe) {
  const match = budgetKeys.find((k) => k.toLowerCase() === String(rawBase).toLowerCase());
  if (match === undefined) return null;
  if (rawBase === match) return match;

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

/** 편집 대상의 파일명만 뽑는다(구분자 혼용·표기법 무관). */
export function baseNameOf(p) {
  return stripAds(splitTail(p).base);
}

/**
 * NTFS **대체 데이터 스트림**(ADS) 표기를 벗긴다 — `CLAUDE.md::$DATA` · `CLAUDE.md:stream`.
 *
 * 2026-08-08 실측: `fs.writeFileSync('…/CLAUDE.md::$DATA', …)` 는 **원본 파일을 덮는다**
 * (inode 동일, 부수 엔트리 0). 그런데 훅은 통과시켰다 — `baseNameOf` 가 `CLAUDE.md::$DATA` 를
 * 내놓아 **예산 이름 조회에서 걸러져 신원 검사에 도달하지 못했기** 때문이다.
 * (신원 검사까지 갔다면 ino 가 같으므로 막혔다.)
 *
 * **현재 도구 표면에서는 악용이 어렵다** — Write/Edit 의 temp+rename 패턴은
 * `…::$DATA.tmp.<pid>.<hex>` 가 잘못된 스트림 이름이 되어 ENOENT 로 실패한다(실측).
 * 그래도 막는 이유는 이 저장소의 기준 그대로다 — **강제 게이트에 뚫린 구멍은 게이트가 아니고**,
 * 그 판정이 하네스 구현 세부(temp+rename 여부)에 기대고 있으면 안 된다.
 *
 * 인덱스 0~1 의 콜론은 **드라이브 문자**(`F:CLAUDE.md`)이므로 건드리지 않는다.
 */
function stripAds(base) {
  const i = base.indexOf(':', 2);
  return i === -1 ? base : base.slice(0, i);
}
