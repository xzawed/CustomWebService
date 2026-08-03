// scripts/generateCountries.ts
// Run: pnpm tsx scripts/generateCountries.ts [--check] [localSourcePath]
//
// mledoze/countries(ODbL) countries.json을 fetch(또는 로컬 인자 파일)하여
// 큐레이티드 서브셋으로 변환 → src/data/countries.json 생성(커밋 대상).
// --check: 쓰기 없이 현재 파일과 비교. 동일하면 exit 0, 드리프트 시 exit 1.
// 준-정적 데이터라 수동/주기 실행(빌드 의존 아님). 변환 로직은 src/lib/countries/transform.ts.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { toCuratedCountries } from '../src/lib/countries/transform';
import type { Country, RawCountry } from '../src/lib/countries/types';

const SOURCE_URL = 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json';
const OUT_PATH = path.resolve(process.cwd(), 'src/data/countries.json');

/** CLI 인자 파싱. `--check`는 플래그, 그 외 `-`로 시작하지 않는 인자는 localSourcePath. 순서 무관. */
function parseCliArgs(argv: string[]): { check: boolean; localSourcePath: string | undefined } {
  let check = false;
  let localSourcePath: string | undefined;
  for (const arg of argv) {
    if (arg === '--check') {
      check = true;
      continue;
    }
    if (!arg.startsWith('-')) {
      localSourcePath = arg;
    }
  }
  return { check, localSourcePath };
}

/**
 * 업스트림 도달 실패. **exit 2**로 드리프트(exit 1)와 구분한다.
 * 두 경우가 같은 코드면 신선도 워크플로가 GitHub raw의 일시 장애를
 * "데이터가 바뀌었다"로 오인해 헛된 이슈를 연다 — 월 1회짜리 알림이
 * 신뢰를 잃는 가장 빠른 길이다.
 */
class UpstreamError extends Error {}

/** mledoze 원본 로드 — 로컬 파일이 있으면 사용, 없으면 upstream fetch. */
async function loadRawCountries(localSourcePath: string | undefined): Promise<RawCountry[]> {
  if (localSourcePath && fs.existsSync(localSourcePath)) {
    const raws = JSON.parse(fs.readFileSync(localSourcePath, 'utf-8')) as RawCountry[];
    console.error(`Loaded ${raws.length} countries from local file ${localSourcePath}`);
    return raws;
  }

  let res: Response;
  try {
    res = await fetch(SOURCE_URL);
  } catch (e) {
    throw new UpstreamError(`Failed to reach mledoze countries: ${(e as Error).message}`);
  }
  if (!res.ok) {
    throw new UpstreamError(`Failed to fetch mledoze countries: HTTP ${res.status}`);
  }
  const raws = (await res.json()) as RawCountry[];
  console.error(`Fetched ${raws.length} countries from ${SOURCE_URL}`);
  return raws;
}

/** cca3 기준 추가·삭제·변경 건수 (전체 레코드 덤프 없이 요약용). */
function diffByCca3(
  current: Country[],
  next: Country[],
): { added: number; removed: number; changed: number } {
  const currentMap = new Map(current.map((c) => [c.cca3, c]));
  const nextMap = new Map(next.map((c) => [c.cca3, c]));
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const [cca3, country] of nextMap) {
    const prev = currentMap.get(cca3);
    if (!prev) {
      added += 1;
    } else if (JSON.stringify(prev) !== JSON.stringify(country)) {
      changed += 1;
    }
  }
  for (const cca3 of currentMap.keys()) {
    if (!nextMap.has(cca3)) {
      removed += 1;
    }
  }
  return { added, removed, changed };
}

/** 현재 번들과 재생성 결과를 비교. 쓰기 없음. 반환값이 그대로 종료 코드다(동일 0 / 드리프트 1). */
function runCheck(curated: Country[], serialized: string): number {
  const nextBytes = Buffer.byteLength(serialized, 'utf-8');
  const nextCount = curated.length;

  if (!fs.existsSync(OUT_PATH)) {
    console.error(`countries.json 없음: ${OUT_PATH}`);
    console.error(`드리프트: 현재 파일 없음 · 재생성 ${nextCount}개 / ${nextBytes} bytes`);
    return 1;
  }

  const currentText = fs.readFileSync(OUT_PATH, 'utf-8');
  const currentBytes = Buffer.byteLength(currentText, 'utf-8');

  if (currentText === serialized) {
    console.error(`일치: ${nextCount}개 국가 · ${currentBytes} bytes (현재 = 재생성)`);
    return 0;
  }

  let current: Country[];
  try {
    current = JSON.parse(currentText) as Country[];
  } catch {
    console.error(
      `드리프트: 현재 파일 파싱 실패 · 현재 ${currentBytes} bytes / 재생성 ${nextCount}개 · ${nextBytes} bytes`,
    );
    return 1;
  }

  const { added, removed, changed } = diffByCca3(current, curated);
  console.error(
    `드리프트: 현재 ${current.length}개 · ${currentBytes} bytes → 재생성 ${nextCount}개 · ${nextBytes} bytes`,
  );
  console.error(`변경 요약 (cca3): +${added} 추가 · -${removed} 삭제 · ~${changed} 변경`);
  return 1;
}

/** 반환값이 프로세스 종료 코드다. 0 동일/생성 성공 · 1 드리프트 · 2 업스트림 도달 실패. */
async function main(): Promise<number> {
  const { check, localSourcePath } = parseCliArgs(process.argv.slice(2));
  const raws = await loadRawCountries(localSourcePath);
  const curated = toCuratedCountries(raws);
  // write 경로와 바이트 단위로 동일한 직렬화 — check/write 비교 기준
  const serialized = JSON.stringify(curated);

  if (check) {
    return runCheck(curated, serialized);
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, serialized);
  console.error(
    `Wrote ${curated.length} curated countries → ${OUT_PATH} (${fs.statSync(OUT_PATH).size} bytes)`,
  );
  return 0;
}

// `process.exit()`를 쓰지 않는다. fetch(undici) 핸들이 살아 있는 동안 강제 종료하면
// Windows에서 libuv 어서션(`UV_HANDLE_CLOSING`)으로 죽고 **종료 코드가 뭉개진다**
// (2026-08-03 실측: exit 1이 127로 보고됨). 워크플로가 코드로 분기하므로 치명적이다.
// exitCode만 세팅하고 이벤트 루프가 비면 자연 종료시킨다.
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e: unknown) => {
    if (e instanceof UpstreamError) {
      console.error(e.message);
      process.exitCode = 2;
      return;
    }
    console.error(e);
    process.exitCode = 1;
  });
