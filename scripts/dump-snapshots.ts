/** Dump all six snapshot JSONs to files for before/after equivalence diffing. */
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';

const root = 'c:/AAA/python-projects/tdf-pool-v2';
for (const envFile of ['.env.local', '.env']) {
  const path = join(root, envFile);
  if (existsSync(path)) loadEnv({ path });
}

const outDir = process.argv[2];
if (!outDir) { console.error('usage: tsx dump-snapshots.ts <outDir>'); process.exit(1); }

async function main() {
  const gen = await import(`../lib/json-generators.js`);
  for (const [name, fn] of [
    ['metadata', gen.generateMetadataJSON],
    ['leaderboards', gen.generateLeaderboardsJSON],
    ['riders', gen.generateRidersJSON],
    ['stages_data', gen.generateStagesDataJSON],
    ['team_selections', gen.generateTeamSelectionsJSON],
    ['rider_rankings', gen.generateRiderRankingsJSON],
  ] as const) {
    console.log(`generating ${name}...`);
    const data = await fn();
    writeFileSync(join(outDir, `${name}.json`), JSON.stringify(data, null, 1));
  }
  console.log('done');
}
main().catch((e) => { console.error(e); process.exit(1); });
