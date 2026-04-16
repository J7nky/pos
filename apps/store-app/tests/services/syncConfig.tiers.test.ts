import { describe, it, expect } from 'vitest';
import { getTablesInTierOrdered, SYNC_TIERS } from '../../src/services/syncConfig';

describe('incremental sync tier config', () => {
  it('places stores before branches in tier1', () => {
    const t1 = [...SYNC_TIERS.tier1];
    expect(t1.indexOf('stores')).toBeLessThan(t1.indexOf('branches'));
  });

  it('topologically orders tier2 so dependencies come first', () => {
    const ordered = getTablesInTierOrdered('tier2');
    expect(ordered.indexOf('inventory_bills')).toBeLessThan(ordered.indexOf('inventory_items'));
    expect(ordered.indexOf('bills')).toBeLessThan(ordered.indexOf('bill_line_items'));
    expect(ordered.indexOf('bills')).toBeLessThan(ordered.indexOf('journal_entries'));
  });
});
