/**
 * Regenerate and publish the snapshots from the current database state.
 *
 * No DB writes and no scoring recompute — `generateAndPublish` just rebuilds the
 * six JSON snapshots from what's already in the DB and flips the pointer. Use it
 * after a change that only affects snapshot *rendering* (e.g. a display-format
 * change in lib/) so the live snapshots pick it up without a full rebuild.
 *
 * Publishing is outward-facing, so it requires --apply.
 *
 * Usage:
 *   npm run republish            # prints what it will do
 *   npm run republish -- --apply # regenerate + publish
 *
 * Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BLOB_READ_WRITE_TOKEN.
 */

import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
for (const envFile of ['.env.local', '.env']) {
  const path = join(root, envFile);
  if (existsSync(path)) loadEnv({ path });
}

const APPLY = process.argv.includes('--apply');

async function main() {
  if (!APPLY) {
    console.log('\nWould regenerate all snapshots from the current DB and publish.');
    console.log('Pass --apply to publish to the live blob store.\n');
    return;
  }
  const { generateAndPublish } = await import('../lib/pipeline.js');
  console.log('Regenerating snapshots and publishing…');
  const result = await generateAndPublish();
  console.log('Published:', JSON.stringify(result));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
