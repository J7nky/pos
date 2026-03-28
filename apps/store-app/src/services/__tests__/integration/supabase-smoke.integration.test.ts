/**
 * Optional non-gate integration smoke (real Supabase).
 * Excluded from parity:gate and default vitest; run manually with:
 *   pnpm exec vitest run src/services/__tests__/integration/
 */
import { describe, it, expect } from 'vitest';

describe.skip('integration: Supabase connectivity (optional)', () => {
  it('placeholder — configure VITE_SUPABASE_URL + key and un-skip to validate env', () => {
    expect(true).toBe(true);
  });
});
