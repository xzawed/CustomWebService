import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface E2EFixtures {
  marker: string;
  draftMarker: string;
  slug: string;
  draftSlug: string;
  rootDomain: string;
  subdomainHost: string;
  owner: { userId: string; email: string; password: string };
  ghost: { userId: string; email: string; password: string };
  publishedProjectId: string;
  draftProjectId: string;
  sqlitePath: string;
  seededAt: string;
  seedId: string;
}

export function loadFixtures(): E2EFixtures {
  // process.cwd() is the repo root when Playwright runs tests.
  const fixturesPath = join(process.cwd(), 'e2e', 'fixtures.json');
  const raw = readFileSync(fixturesPath, 'utf8');
  return JSON.parse(raw) as E2EFixtures;
}
