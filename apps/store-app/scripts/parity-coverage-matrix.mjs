#!/usr/bin/env node
/**
 * Warns when SYNC_TABLES entries have no owning scenario in coverage-matrix.md (GAP).
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tables = JSON.parse(readFileSync(join(__dirname, '../tests/sync-parity/sync-tables.json'), 'utf-8'));
const matrix = readFileSync(join(__dirname, '../tests/sync-parity/coverage-matrix.md'), 'utf-8');

const gaps = [];
for (const t of tables) {
  const re = new RegExp(`^\\| ${t} \\|[^\\n]*GAP`, 'm');
  if (re.test(matrix)) gaps.push(t);
}

if (gaps.length > 0) {
  console.warn(
    'parity-coverage-matrix: tables marked GAP (expected until suite expands):',
    gaps.join(', ')
  );
}

const failOnGap = process.env.PARITY_COVERAGE_FAIL_ON_GAP === '1';
if (failOnGap && gaps.length > 0) {
  console.error('parity-coverage-matrix: failing due to GAP rows (set PARITY_COVERAGE_FAIL_ON_GAP only when matrix is complete)');
  process.exit(1);
}

process.exit(0);
