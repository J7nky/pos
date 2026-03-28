#!/usr/bin/env node
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, '../tests/sync-parity/parityEnv.ts');
const src = readFileSync(envPath, 'utf-8');
if (!/PARITY_DEXIE_MODE\s*=\s*['"]indexeddb['"]/.test(src)) {
  console.error('parity-check-dexie-mode: PARITY_DEXIE_MODE must be set to indexeddb in parityEnv.ts');
  process.exit(1);
}
if (/memory/.test(src) && /PARITY_DEXIE_MODE/.test(src)) {
  console.warn('parity-check-dexie-mode: verify memory mode is not mixed with indexeddb');
}
process.exit(0);
