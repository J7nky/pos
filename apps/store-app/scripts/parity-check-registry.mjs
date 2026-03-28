#!/usr/bin/env node
/**
 * Ensures golden JSON files only contain known top-level keys (parity contract).
 */
import { readFileSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const baseline = join(__dirname, '../tests/sync-baseline');

const ALLOWED_TOP = new Set([
  'scenarioId',
  'localSnapshot',
  'serverSnapshot',
  'syncMetadata',
  'syncResult',
  'extras',
]);

let failed = false;
try {
  const files = readdirSync(baseline).filter((f) => f.endsWith('.golden.json'));
  if (files.length === 0) {
    console.error('parity-check-registry: no .golden.json files under tests/sync-baseline');
    failed = true;
  }
  for (const f of files) {
    const raw = JSON.parse(readFileSync(join(baseline, f), 'utf-8'));
    for (const k of Object.keys(raw)) {
      if (!ALLOWED_TOP.has(k)) {
        console.error(`parity-check-registry: ${f} has disallowed top-level key: ${k}`);
        failed = true;
      }
    }
  }
} catch (e) {
  console.error('parity-check-registry:', e);
  failed = true;
}

process.exit(failed ? 1 : 0);
