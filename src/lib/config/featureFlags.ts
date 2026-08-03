import { eq } from 'drizzle-orm';
import { getSqliteDb } from '@/lib/db/sqlite/connection';
import * as schema from '@/lib/db/sqlite/schema';
import { logger } from '@/lib/utils/logger';

/**
 * 운영 킬스위치 (A6).
 *
 * env 토글과 역할이 다르다: **env는 바꾸면 Railway 재배포가 필요하고**(Wait for CI까지
 * 포함하면 수 분), 그 사이에도 비용은 계속 나간다. 이 플래그는 DB 값이라 즉시 반영된다.
 * 그래서 "기능 구성"이 아니라 **비용 폭주·남용을 지금 당장 멈추는 수단**으로만 쓴다.
 *
 * **fail-open이 규칙이다.** 행이 없거나 DB 읽기가 실패하면 **켜진 것으로 본다**.
 * 이 플래그의 목적은 의도적으로 끄는 것이지 켜는 게 아니므로, DB 순간 장애가
 * 서비스 중단으로 번지면 스위치가 없느니만 못하다.
 */
export const FEATURE_FLAGS = ['enable_generation', 'enable_signup'] as const;
export type FeatureFlagName = (typeof FEATURE_FLAGS)[number];

/**
 * 짧은 인프로세스 캐시. 생성 라우트마다 DB를 때리지 않기 위한 것이고,
 * TTL이 곧 **스위치를 내린 뒤 실제로 멈추기까지의 최대 지연**이다.
 * 10초는 "인시던트 대응에 충분히 빠르면서 매 요청 조회는 피한다"의 절충이다.
 */
const CACHE_TTL_MS = 10_000;

let cache: { at: number; values: Map<string, boolean> } | null = null;

function readAllFromDb(): Map<string, boolean> {
  const rows = getSqliteDb()
    .select({ name: schema.featureFlags.flag_name, enabled: schema.featureFlags.enabled })
    .from(schema.featureFlags)
    .all();
  return new Map(rows.map((r) => [r.name, r.enabled ?? true]));
}

/**
 * 플래그 상태를 반환한다. 미존재·오류 시 `true`(fail-open).
 *
 * 동기 함수다 — better-sqlite3가 동기이고, 호출부(라우트 진입)에서 await 경계를
 * 하나 더 만들 이유가 없다.
 */
export function isFeatureEnabled(name: FeatureFlagName): boolean {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return cache.values.get(name) ?? true;
  }

  try {
    const values = readAllFromDb();
    cache = { at: now, values };
    return values.get(name) ?? true;
  } catch (error) {
    // 캐시를 갱신하지 않는다 — 다음 호출이 다시 시도하게 둔다.
    logger.warn('Feature flag read failed — fail-open', {
      flag: name,
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}

/** 전체 플래그 상태(관리자 조회용). 오류는 호출부로 전파한다 — 진단 화면은 사실을 보여야 한다. */
export function listFeatureFlags(): { name: string; enabled: boolean }[] {
  return Array.from(readAllFromDb().entries()).map(([name, enabled]) => ({ name, enabled }));
}

/**
 * 플래그를 설정한다. 행이 없으면 만든다(upsert).
 *
 * upsert인 이유: 프로덕션에는 2026-05 시절 7행만 있고 새 플래그 행이 없을 수 있다.
 * "행이 없어서 스위치를 못 내린다"가 되면 인시던트 중에 쓸모가 없다.
 */
export function setFeatureFlag(name: FeatureFlagName, enabled: boolean): void {
  const db = getSqliteDb();
  const existing = db
    .select({ name: schema.featureFlags.flag_name })
    .from(schema.featureFlags)
    .where(eq(schema.featureFlags.flag_name, name))
    .get();

  if (existing) {
    db.update(schema.featureFlags)
      .set({ enabled })
      .where(eq(schema.featureFlags.flag_name, name))
      .run();
  } else {
    db.insert(schema.featureFlags).values({ flag_name: name, enabled }).run();
  }

  invalidateFeatureFlagCache();
}

/** 쓰기 직후 캐시를 버린다 — 스위치를 내렸는데 최대 10초 더 도는 것을 막는다. */
export function invalidateFeatureFlagCache(): void {
  cache = null;
}

/** 테스트 격리용. 프로덕션 코드에서 호출하지 말 것. */
export function __resetFeatureFlagCacheForTests(): void {
  cache = null;
}
