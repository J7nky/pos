// Snapshot Service - Phase 5 of Accounting Foundation Migration
// Based on ACCOUNTING_FOUNDATION_MIGRATION_PLAN.md
//
// Creates and manages balance snapshots for performance optimization and historical queries
// Uses journal-entry-based calculations with base currency schema (debit_usd, credit_usd, debit_lbp, credit_lbp)

import { getDB } from '../lib/db';
import { BalanceSnapshot } from '../types/accounting';
import { journalService } from './journalService';
import { createId } from '../lib/db';
import { getLocalDateString } from '../utils/dateUtils';
import { buildBalances } from './accountingCurrencyHelpers';

export interface SnapshotResult {
  success: boolean;
  snapshotsCreated: number;
  accountsProcessed: number;
  entitiesProcessed: number;
  errors: string[];
  processingTime: number;
}

export interface HistoricalBalance {
  accountCode: string;
  entityId: string | null;
  balanceUSD: number;
  balanceLBP: number;
  snapshotDate: string;
  isCalculated: boolean; // true if calculated from journal, false if from snapshot
}

export interface SnapshotVerificationResult {
  isValid: boolean;
  discrepancies: Array<{
    accountCode: string;
    entityId: string | null;
    snapshotBalance: { USD: number; LBP: number };
    calculatedBalance: { USD: number; LBP: number };
    difference: { USD: number; LBP: number };
  }>;
  verificationDate: string;
  totalSnapshots: number;
  validSnapshots: number;
}

/**
 * Service for creating and managing balance snapshots
 * Provides performance optimization for historical balance queries
 */
export class SnapshotService {
  
  /**
   * Create daily snapshots for all accounts and entities in a store
   * This is the main method for end-of-day snapshot creation
   */
  async createDailySnapshots(
    storeId: string, 
    snapshotDate?: string,
    branchId?: string | null
  ): Promise<SnapshotResult> {
    const startTime = Date.now();
    const result: SnapshotResult = {
      success: false,
      snapshotsCreated: 0,
      accountsProcessed: 0,
      entitiesProcessed: 0,
      errors: [],
      processingTime: 0
    };
    
    const targetDate = snapshotDate || getLocalDateString(new Date().toISOString());
    
    try {
      console.log(`📊 Creating daily snapshots for store ${storeId} on ${targetDate}`);
      
      // Check if snapshots already exist for this date
      const existingSnapshots = await getDB().balance_snapshots
        .where('[store_id+snapshot_date+snapshot_type]')
        .equals([storeId, targetDate, 'daily'])
        .count();
      
      if (existingSnapshots > 0) {
        result.errors.push(`Daily snapshots already exist for ${targetDate}`);
        return result;
      }
      
      // Get all active accounts for the store
      const accounts = await getDB().chart_of_accounts
        .where('store_id')
        .equals(storeId)
        .filter(account => account.is_active)
        .toArray();
      
      if (accounts.length === 0) {
        result.errors.push('No active accounts found for store');
        return result;
      }
      
      // Get all active entities for the store
      const entities = await getDB().entities
        .where('store_id')
        .equals(storeId)
        .filter(entity => entity.is_active)
        .toArray();
      
      if (entities.length === 0) {
        result.errors.push('No active entities found for store');
        return result;
      }
      
      const snapshots: BalanceSnapshot[] = [];
      
      // Create snapshots for each account-entity combination
      for (const account of accounts) {
        result.accountsProcessed++;
        
        if (account.requires_entity) {
          // Create snapshots for each entity
          for (const entity of entities) {
            const snapshot = await this.createAccountEntitySnapshot(
              storeId,
              branchId || null,
              account.account_code,
              entity.id,
              targetDate
            );
            
            if (snapshot) {
              snapshots.push(snapshot);
              result.snapshotsCreated++;
            }
          }
          result.entitiesProcessed += entities.length;
        } else {
          // Create snapshot for account without entity
          const snapshot = await this.createAccountEntitySnapshot(
            storeId,
            branchId || null,
            account.account_code,
            null,
            targetDate
          );
          
          if (snapshot) {
            snapshots.push(snapshot);
            result.snapshotsCreated++;
          }
        }
      }
      
      // Insert all snapshots atomically
      if (snapshots.length > 0) {
        await getDB().balance_snapshots.bulkAdd(snapshots);
        console.log(`✅ Created ${snapshots.length} balance snapshots for ${targetDate}`);
      }
      
      result.success = true;
      
    } catch (error) {
      result.errors.push(`Snapshot creation failed: ${error instanceof Error ? error.message : String(error)}`);
      console.error('❌ Daily snapshot creation failed:', error);
    } finally {
      result.processingTime = Date.now() - startTime;
    }
    
    return result;
  }
  
  /**
   * Create snapshot for a specific account-entity combination
   */
  private async createAccountEntitySnapshot(
    storeId: string,
    branchId: string | null,
    accountCode: string,
    entityId: string | null,
    snapshotDate: string
  ): Promise<BalanceSnapshot | null> {
    try {
      // Calculate balance from journal entries up to the snapshot date
      const balance = await this.calculateBalanceFromJournal(
        storeId,
        accountCode,
        entityId,
        snapshotDate
      );
      
      // Only create snapshot if there's a balance or journal activity
      if (balance.USD === 0 && balance.LBP === 0) {
        // Check if there are any journal entries for this account-entity combination
        const hasActivity = await this.hasJournalActivity(storeId, accountCode, entityId, snapshotDate);
        if (!hasActivity) {
          return null; // Skip creating snapshot for accounts with no activity
        }
      }
      
      const snapshot: BalanceSnapshot = {
        id: createId(),
        store_id: storeId,
        branch_id: branchId,
        account_code: accountCode,
        entity_id: entityId,
        balance_usd: balance.USD,
        balance_lbp: balance.LBP,
        // Phase 11 dual-write: also write the self-describing balances map.
        balances: buildBalances([
          { currency: 'USD', balance: balance.USD },
          { currency: 'LBP', balance: balance.LBP },
        ]),
        snapshot_date: snapshotDate,
        snapshot_type: 'daily',
        verified: false, // Will be verified later
        created_at: new Date().toISOString(),
        _synced: false
      };

      return snapshot;
      
    } catch (error) {
      console.error(`Failed to create snapshot for ${accountCode}/${entityId}:`, error);
      return null;
    }
  }
  
  /**
   * Calculate balance from journal entries up to a specific date
   */
  private async calculateBalanceFromJournal(
    storeId: string,
    accountCode: string,
    entityId: string | null,
    asOfDate: string
  ): Promise<{ USD: number; LBP: number }> {
    let query = getDB().journal_entries
      .where('[store_id+account_code]')
      .equals([storeId, accountCode])
      .filter(entry => entry.posted_date <= asOfDate);
    
    if (entityId) {
      query = query.filter(entry => entry.entity_id === entityId);
    }
    
    const entries = await query.toArray();
    
    const balance = { USD: 0, LBP: 0 };
    
    for (const entry of entries) {
      balance.USD += entry.debit_usd - entry.credit_usd;
      balance.LBP += entry.debit_lbp - entry.credit_lbp;
    }
    
    return balance;
  }
  
  /**
   * Check if there's any journal activity for an account-entity combination
   */
  private async hasJournalActivity(
    storeId: string,
    accountCode: string,
    entityId: string | null,
    asOfDate: string
  ): Promise<boolean> {
    let query = getDB().journal_entries
      .where('[store_id+account_code]')
      .equals([storeId, accountCode])
      .filter(entry => entry.posted_date <= asOfDate);
    
    if (entityId) {
      query = query.filter(entry => entry.entity_id === entityId);
    }
    
    const count = await query.count();
    return count > 0;
  }
  
  /**
   * Get historical balance using snapshots (O(1) lookup)
   * Falls back to journal calculation if no snapshot exists
   */
  async getHistoricalBalance(
    storeId: string,
    accountCode: string,
    entityId: string | null,
    asOfDate: string,
    branchId?: string | null
  ): Promise<HistoricalBalance> {
    // A snapshot dated today is a point-in-time capture as of when it was
    // created (e.g. 9am for an end-of-shift roll-up); new journal entries can
    // land after it (sales, payments, remote events from another device).
    // Returning that snapshot as the final answer freezes the balance at its
    // creation time. For the current local day, *don't* short-circuit — fall
    // through and recompute from the prior day's snapshot + today's entries.
    const today = getLocalDateString(new Date().toISOString());
    const isToday = asOfDate === today;

    if (!isToday) {
      const exact = await getDB().balance_snapshots
        .where('[store_id+account_code+entity_id+snapshot_date]')
        .equals([storeId, accountCode, entityId, asOfDate])
        .first()
        .catch((error) => { throw error; });

      if (exact) {
        return {
          accountCode,
          entityId,
          balanceUSD: exact.balance_usd,
          balanceLBP: exact.balance_lbp,
          snapshotDate: exact.snapshot_date,
          isCalculated: false
        };
      }
    }

    // Try to find the most recent snapshot before the requested date.
    // For "today", require strictly-before so today's stale snapshot is not picked.
    const recentSnapshot = await getDB().balance_snapshots
      .where('[store_id+account_code+entity_id]')
      .equals([storeId, accountCode, entityId])
      .filter(s => isToday ? s.snapshot_date < asOfDate : s.snapshot_date <= asOfDate)
      .reverse()
      .first();
    
    if (recentSnapshot) {
      // Calculate balance from the snapshot date to the requested date
      const snapshotBalance = {
        USD: recentSnapshot.balance_usd,
        LBP: recentSnapshot.balance_lbp
      };
      
      // Get journal entries from snapshot date to requested date
      const additionalEntries = await getDB().journal_entries
        .where('[store_id+account_code]')
        .equals([storeId, accountCode])
        .filter(entry => 
          entry.posted_date > recentSnapshot.snapshot_date && 
          entry.posted_date <= asOfDate &&
          (entityId ? entry.entity_id === entityId : true)
        )
        .toArray();
      
      // Add changes since snapshot using new base currency schema
      for (const entry of additionalEntries) {
        snapshotBalance.USD += entry.debit_usd - entry.credit_usd;
        snapshotBalance.LBP += entry.debit_lbp - entry.credit_lbp;
      }
      
      return {
        accountCode,
        entityId,
        balanceUSD: snapshotBalance.USD,
        balanceLBP: snapshotBalance.LBP,
        snapshotDate: asOfDate,
        isCalculated: true
      };
    }
    
    // Fallback: calculate from journal entries (O(n) operation)
    const calculatedBalance = await this.calculateBalanceFromJournal(
      storeId,
      accountCode,
      entityId,
      asOfDate
    );
    
    return {
      accountCode,
      entityId,
      balanceUSD: calculatedBalance.USD,
      balanceLBP: calculatedBalance.LBP,
      snapshotDate: asOfDate,
      isCalculated: true
    };
  }
  
  /**
   * Get balance history for an account over a date range
   */
  async getBalanceHistory(
    storeId: string,
    accountCode: string,
    entityId: string | null,
    startDate: string,
    endDate: string
  ): Promise<HistoricalBalance[]> {
    const snapshots = await getDB().balance_snapshots
      .where('[store_id+account_code+entity_id]')
      .equals([storeId, accountCode, entityId])
      .filter(s => s.snapshot_date >= startDate && s.snapshot_date <= endDate)
      .toArray();
    
    return snapshots.map(snapshot => ({
      accountCode,
      entityId,
      balanceUSD: snapshot.balance_usd,
      balanceLBP: snapshot.balance_lbp,
      snapshotDate: snapshot.snapshot_date,
      isCalculated: false
    }));
  }
  
  /**
   * Verify snapshots against journal calculations
   */
  async verifySnapshots(
    storeId: string,
    snapshotDate: string,
    tolerance: number = 0.01
  ): Promise<SnapshotVerificationResult> {
    const result: SnapshotVerificationResult = {
      isValid: true,
      discrepancies: [],
      verificationDate: snapshotDate,
      totalSnapshots: 0,
      validSnapshots: 0
    };
    
    try {
      // Get all snapshots for the date
      const snapshots = await getDB().balance_snapshots
        .where('[store_id+snapshot_date]')
        .equals([storeId, snapshotDate])
        .toArray();
      
      result.totalSnapshots = snapshots.length;
      
      for (const snapshot of snapshots) {
        // Calculate balance from journal
        const calculatedBalance = await this.calculateBalanceFromJournal(
          storeId,
          snapshot.account_code,
          snapshot.entity_id,
          snapshotDate
        );
        
        // Check for discrepancies
        const usdDiff = Math.abs(snapshot.balance_usd - calculatedBalance.USD);
        const lbpDiff = Math.abs(snapshot.balance_lbp - calculatedBalance.LBP);
        
        if (usdDiff > tolerance || lbpDiff > tolerance) {
          result.isValid = false;
          result.discrepancies.push({
            accountCode: snapshot.account_code,
            entityId: snapshot.entity_id,
            snapshotBalance: {
              USD: snapshot.balance_usd,
              LBP: snapshot.balance_lbp
            },
            calculatedBalance: calculatedBalance,
            difference: {
              USD: snapshot.balance_usd - calculatedBalance.USD,
              LBP: snapshot.balance_lbp - calculatedBalance.LBP
            }
          });
        } else {
          result.validSnapshots++;
          
          // Mark snapshot as verified
          await getDB().balance_snapshots.update(snapshot.id, { verified: true });
        }
      }
      
    } catch (error) {
      result.isValid = false;
      console.error('Snapshot verification failed:', error);
    }
    
    return result;
  }
  
  /**
   * Get snapshot statistics for a store
   */
  async getSnapshotStatistics(storeId: string): Promise<{
    totalSnapshots: number;
    verifiedSnapshots: number;
    snapshotsByDate: Record<string, number>;
    snapshotsByAccount: Record<string, number>;
    oldestSnapshot: string | null;
    newestSnapshot: string | null;
  }> {
    const snapshots = await getDB().balance_snapshots
      .where('store_id')
      .equals(storeId)
      .toArray();
    
    const snapshotsByDate: Record<string, number> = {};
    const snapshotsByAccount: Record<string, number> = {};
    let verifiedCount = 0;
    let oldestDate: string | null = null;
    let newestDate: string | null = null;
    
    for (const snapshot of snapshots) {
      // Count by date
      snapshotsByDate[snapshot.snapshot_date] = (snapshotsByDate[snapshot.snapshot_date] || 0) + 1;
      
      // Count by account
      snapshotsByAccount[snapshot.account_code] = (snapshotsByAccount[snapshot.account_code] || 0) + 1;
      
      // Count verified
      if (snapshot.verified) {
        verifiedCount++;
      }
      
      // Track date range
      if (!oldestDate || snapshot.snapshot_date < oldestDate) {
        oldestDate = snapshot.snapshot_date;
      }
      if (!newestDate || snapshot.snapshot_date > newestDate) {
        newestDate = snapshot.snapshot_date;
      }
    }
    
    return {
      totalSnapshots: snapshots.length,
      verifiedSnapshots: verifiedCount,
      snapshotsByDate,
      snapshotsByAccount,
      oldestSnapshot: oldestDate,
      newestSnapshot: newestDate
    };
  }
  
  /**
   * Clean up old snapshots (retention policy)
   */
  async cleanupOldSnapshots(
    storeId: string,
    retentionDays: number = 365
  ): Promise<{ deletedCount: number; oldestRetained: string | null }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffDateStr = getLocalDateString(cutoffDate.toISOString());
    
    const oldSnapshots = await getDB().balance_snapshots
      .where('store_id')
      .equals(storeId)
      .filter(snapshot => snapshot.snapshot_date < cutoffDateStr)
      .toArray();
    
    if (oldSnapshots.length > 0) {
      const idsToDelete = oldSnapshots.map(s => s.id);
      await getDB().balance_snapshots.bulkDelete(idsToDelete);
    }
    
    // Find oldest remaining snapshot
    const oldestRemaining = await getDB().balance_snapshots
      .where('store_id')
      .equals(storeId)
      .orderBy('snapshot_date')
      .first();
    
    return {
      deletedCount: oldSnapshots.length,
      oldestRetained: oldestRemaining?.snapshot_date || null
    };
  }
}

// Export singleton instance
export const snapshotService = new SnapshotService();
