// scripts/generateCountries.ts
// Run: pnpm tsx scripts/generateCountries.ts [localSourcePath]
//
// mledoze/countries(ODbL) countries.json을 fetch(또는 로컬 인자 파일)하여
// 큐레이티드 서브셋으로 변환 → src/data/countries.json 생성(커밋 대상).
// 준-정적 데이터라 수동/주기 실행(빌드 의존 아님). 변환 로직은 src/lib/countries/transform.ts.
import * as fs from 'node:fs';
import * as path from 'node:path';
import { toCuratedCountries } from '../src/lib/countries/transform';
import type { RawCountry } from '../src/lib/countries/types';

const SOURCE_URL = 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json';
const OUT_PATH = path.resolve(process.cwd(), 'src/data/countries.json');

async function main(): Promise<void> {
  const localArg = process.argv[2];
  let raws: RawCountry[];

  if (localArg && fs.existsSync(localArg)) {
    raws = JSON.parse(fs.readFileSync(localArg, 'utf-8')) as RawCountry[];
    console.error(`Loaded ${raws.length} countries from local file ${localArg}`);
  } else {
    const res = await fetch(SOURCE_URL);
    if (!res.ok) {
      console.error(`Failed to fetch mledoze countries: HTTP ${res.status}`);
      process.exit(1);
    }
    raws = (await res.json()) as RawCountry[];
    console.error(`Fetched ${raws.length} countries from ${SOURCE_URL}`);
  }

  const curated = toCuratedCountries(raws);
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(curated));
  console.error(
    `Wrote ${curated.length} curated countries → ${OUT_PATH} (${fs.statSync(OUT_PATH).size} bytes)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
