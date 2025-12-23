// Reporting Service - Phase 5 of Accounting Foundation Migration
// High-performance reports using journal entries and balance snapshots

import { getDB } from '../lib/db';
import { snapshotService } from './snapshotService';
import { entityQueryService } from './entityQueryService';

export interface GeneralLedgerEntry {
  date: string;
  transactionId: string;
  description: string;
  accountCode: string;
  accountName: string;
  entityName: string | null;
  debit: number;
  credit: number;
  balance: number;
  currency: 'USD' | 'LBP';
}

export interface GeneralLedgerReport {
  storeId: string;
  accountCode: string;
  accountName: string;
  startDate: string;
  endDate: string;
  openingBalance: { USD: number; LBP: number };
  closingBalance: { USD: number; LBP: number };
  entries: GeneralLedgerEntry[];
  totalDebits: { USD: number; LBP: number };
  totalCredits: { USD: number; LBP: number };
}

export interface AccountStatement {
  entityId: string;
  entityName: string;
  accountCode: string;
  accountName: string;
  startDate: string;
  endDate: string;
  openingBalance: { USD: number; LBP: number };
  closingBalance: { USD: number; LBP: number };
  transactions: Array<{
    date: string;
    transactionId: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;
    currency: 'USD' | 'LBP';
  }>;
}

export interface TrialBalance {
  storeId: string;
  asOfDate: string;
  accounts: Array<{
    accountCode: string;
    accountName: string;
    accountType: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
    debitBalance: { USD: number; LBP: number };
    creditBalance: { USD: number; LBP: number };
  }>;
  totalDebits: { USD: number; LBP: number };
  totalCredits: { USD: number; LBP: number };
  isBalanced: boolean;
}

export interface AgingReport {
  entityType: 'customer' | 'supplier';
  asOfDate: string;
  entities: Array<{
    entityId: string;
    entityName: string;
    totalBalance: { USD: number; LBP: number };
    aging: {
      current: { USD: number; LBP: number };
      days30: { USD: number; LBP: number };
      days60: { USD: number; LBP: number };
      days90: { USD: number; LBP: number };
      over90: { USD: number; LBP: number };
    };
  }>;
  totals: {
    current: { USD: number; LBP: number };
    days30: { USD: number; LBP: number };
    days60: { USD: number; LBP: number };
    days90: { USD: number; LBP: number };
    over90: { USD: number; LBP: number };
  };
}

/**
 * High-performance reporting service using journal entries and snapshots
 */
export class ReportingService {
  
  /**
   * Generate General Ledger report for an account
   */
  async generateGeneralLedger(
    storeId: string,
    accountCode: string,
    startDate: string,
    endDate: string,
    entityId?: string
  ): Promise<GeneralLedgerReport> {
    try {
      // Get account information
      const account = await getDB().chart_of_accounts
        .where('[store_id+account_code]')
        .equals([storeId, accountCode])
        .first();
      
      if (!account) {
        throw new Error(`Account ${accountCode} not found`);
      }
      
      // Get opening balance using snapshots
      const previousDay = new Date(startDate);
      previousDay.setDate(previousDay.getDate() - 1);
      const previousDayStr = previousDay.toISOString().split('T')[0];
      
      let openingBalance = { USD: 0, LBP: 0 };
      
      if (entityId) {
        // Entity-specific opening balance
        try {
          const balance = await snapshotService.getHistoricalBalance(
            storeId,
            accountCode,
            entityId,
            previousDayStr
          );
          openingBalance.USD = balance.balanceUSD;
          openingBalance.LBP = balance.balanceLBP;
        } catch (error) {
          console.warn('Failed to get opening balance from snapshots, calculating from journal:', error);
        }
      } else {
        // Account total opening balance - sum across all entities
        const entities = await getDB().entities.where('store_id').equals(storeId).toArray();
        
        for (const entity of entities) {
          try {
            const balance = await snapshotService.getHistoricalBalance(
              storeId,
              accountCode,
              entity.id,
              previousDayStr
            );
            openingBalance.USD += balance.balanceUSD;
            openingBalance.LBP += balance.balanceLBP;
          } catch (error) {
            // Skip entities with no balance
          }
        }
      }
      
      // Get journal entries for the period
      let query = getDB().journal_entries
        .where('[store_id+account_code]')
        .equals([storeId, accountCode])
        .filter(entry => entry.posted_date >= startDate && entry.posted_date <= endDate);
      
      if (entityId) {
        query = query.filter(entry => entry.entity_id === entityId);
      }
      
      const journalEntries = await query.toArray();
      
      // Sort by date and time
      journalEntries.sort((a, b) => {
        const dateCompare = a.posted_date.localeCompare(b.posted_date);
        if (dateCompare !== 0) return dateCompare;
        return a.created_at.localeCompare(b.created_at);
      });
      
      // Build general ledger entries with running balance
      const entries: GeneralLedgerEntry[] = [];
      let runningBalanceUSD = openingBalance.USD;
      let runningBalanceLBP = openingBalance.LBP;
      let totalDebits = { USD: 0, LBP: 0 };
      let totalCredits = { USD: 0, LBP: 0 };
      
      for (const entry of journalEntries) {
        // Get entity name
        let entityName: string | null = null;
        if (entry.entity_id) {
          const entity = await getDB().entities.get(entry.entity_id);
          entityName = entity?.name || null;
        }
        
        // Update running balance
        if (entry.currency === 'USD') {
          runningBalanceUSD += entry.debit - entry.credit;
          totalDebits.USD += entry.debit;
          totalCredits.USD += entry.credit;
        } else {
          runningBalanceLBP += entry.debit - entry.credit;
          totalDebits.LBP += entry.debit;
          totalCredits.LBP += entry.credit;
        }
        
        entries.push({
          date: entry.posted_date,
          transactionId: entry.transaction_id,
          description: entry.description,
          accountCode: entry.account_code,
          accountName: account.account_name,
          entityName,
          debit: entry.debit,
          credit: entry.credit,
          balance: entry.currency === 'USD' ? runningBalanceUSD : runningBalanceLBP,
          currency: entry.currency
        });
      }
      
      return {
        storeId,
        accountCode,
        accountName: account.account_name,
        startDate,
        endDate,
        openingBalance,
        closingBalance: {
          USD: runningBalanceUSD,
          LBP: runningBalanceLBP
        },
        entries,
        totalDebits,
        totalCredits
      };
      
    } catch (error) {
      console.error('Failed to generate general ledger:', error);
      throw error;
    }
  }
  
  /**
   * Generate account statement for an entity
   */
  async generateAccountStatement(
    storeId: string,
    entityId: string,
    accountCode: string,
    startDate: string,
    endDate: string
  ): Promise<AccountStatement> {
    try {
      // Get entity and account information
      const [entity, account] = await Promise.all([
        getDB().entities.get(entityId),
        getDB().chart_of_accounts
          .where('[store_id+account_code]')
          .equals([storeId, accountCode])
          .first()
      ]);
      
      if (!entity) {
        throw new Error(`Entity ${entityId} not found`);
      }
      
      if (!account) {
        throw new Error(`Account ${accountCode} not found`);
      }
      
      // Get opening balance
      const previousDay = new Date(startDate);
      previousDay.setDate(previousDay.getDate() - 1);
      const previousDayStr = previousDay.toISOString().split('T')[0];
      
      let openingBalance = { USD: 0, LBP: 0 };
      
      try {
        const balance = await snapshotService.getHistoricalBalance(
          storeId,
          accountCode,
          entityId,
          previousDayStr
        );
        openingBalance.USD = balance.balanceUSD;
        openingBalance.LBP = balance.balanceLBP;
      } catch (error) {
        console.warn('Failed to get opening balance from snapshots:', error);
      }
      
      // Get journal entries for the period
      const journalEntries = await getDB().journal_entries
        .where('[store_id+account_code+entity_id]')
        .equals([storeId, accountCode, entityId])
        .filter(entry => entry.posted_date >= startDate && entry.posted_date <= endDate)
        .toArray();
      
      // Sort by date and time
      journalEntries.sort((a, b) => {
        const dateCompare = a.posted_date.localeCompare(b.posted_date);
        if (dateCompare !== 0) return dateCompare;
        return a.created_at.localeCompare(b.created_at);
      });
      
      // Build transactions with running balance
      const transactions: AccountStatement['transactions'] = [];
      let runningBalanceUSD = openingBalance.USD;
      let runningBalanceLBP = openingBalance.LBP;
      
      for (const entry of journalEntries) {
        // Update running balance
        if (entry.currency === 'USD') {
          runningBalanceUSD += entry.debit - entry.credit;
        } else {
          runningBalanceLBP += entry.debit - entry.credit;
        }
        
        transactions.push({
          date: entry.posted_date,
          transactionId: entry.transaction_id,
          description: entry.description,
          debit: entry.debit,
          credit: entry.credit,
          balance: entry.currency === 'USD' ? runningBalanceUSD : runningBalanceLBP,
          currency: entry.currency
        });
      }
      
      return {
        entityId,
        entityName: entity.name,
        accountCode,
        accountName: account.account_name,
        startDate,
        endDate,
        openingBalance,
        closingBalance: {
          USD: runningBalanceUSD,
          LBP: runningBalanceLBP
        },
        transactions
      };
      
    } catch (error) {
      console.error('Failed to generate account statement:', error);
      throw error;
    }
  }
  
  /**
   * Generate trial balance using snapshots for performance
   */
  async generateTrialBalance(storeId: string, asOfDate: string): Promise<TrialBalance> {
    try {
      const accounts = await getDB().chart_of_accounts
        .where('store_id')
        .equals(storeId)
        .filter(account => account.is_active)
        .toArray();
      
      const trialBalanceAccounts: TrialBalance['accounts'] = [];
      let totalDebits = { USD: 0, LBP: 0 };
      let totalCredits = { USD: 0, LBP: 0 };
      
      for (const account of accounts) {
        let accountBalanceUSD = 0;
        let accountBalanceLBP = 0;
        
        if (account.requires_entity) {
          // Sum balances across all entities for this account
          const entities = await getDB().entities.where('store_id').equals(storeId).toArray();
          
          for (const entity of entities) {
            try {
              const balance = await snapshotService.getHistoricalBalance(
                storeId,
                account.account_code,
                entity.id,
                asOfDate
              );
              accountBalanceUSD += balance.balanceUSD;
              accountBalanceLBP += balance.balanceLBP;
            } catch (error) {
              // Skip entities with no balance
            }
          }
        } else {
          // Account doesn't require entity - get total balance
          try {
            const balance = await snapshotService.getHistoricalBalance(
              storeId,
              account.account_code,
              null,
              asOfDate
            );
            accountBalanceUSD = balance.balanceUSD;
            accountBalanceLBP = balance.balanceLBP;
          } catch (error) {
            console.warn(`Failed to get balance for account ${account.account_code}:`, error);
          }
        }
        
        // Determine if balance is debit or credit based on account type and balance sign
        const isDebitBalance = this.isDebitBalance(account.account_type, accountBalanceUSD, accountBalanceLBP);
        
        const debitBalance = isDebitBalance ? 
          { USD: Math.abs(accountBalanceUSD), LBP: Math.abs(accountBalanceLBP) } :
          { USD: 0, LBP: 0 };
          
        const creditBalance = !isDebitBalance ? 
          { USD: Math.abs(accountBalanceUSD), LBP: Math.abs(accountBalanceLBP) } :
          { USD: 0, LBP: 0 };
        
        trialBalanceAccounts.push({
          accountCode: account.account_code,
          accountName: account.account_name,
          accountType: account.account_type,
          debitBalance,
          creditBalance
        });
        
        // Add to totals
        totalDebits.USD += debitBalance.USD;
        totalDebits.LBP += debitBalance.LBP;
        totalCredits.USD += creditBalance.USD;
        totalCredits.LBP += creditBalance.LBP;
      }
      
      // Check if trial balance is balanced
      const isBalanced = 
        Math.abs(totalDebits.USD - totalCredits.USD) < 0.01 &&
        Math.abs(totalDebits.LBP - totalCredits.LBP) < 0.01;
      
      return {
        storeId,
        asOfDate,
        accounts: trialBalanceAccounts,
        totalDebits,
        totalCredits,
        isBalanced
      };
      
    } catch (error) {
      console.error('Failed to generate trial balance:', error);
      throw error;
    }
  }
  
  /**
   * Generate aging report for customers or suppliers
   */
  async generateAgingReport(
    storeId: string,
    entityType: 'customer' | 'supplier',
    asOfDate: string
  ): Promise<AgingReport> {
    try {
      const accountCode = entityType === 'customer' ? '1200' : '2100'; // AR or AP
      
      const entities = await entityQueryService.getEntitiesByType(storeId, entityType, {
        includeInactive: false
      });
      
      const agingEntities: AgingReport['entities'] = [];
      const totals = {
        current: { USD: 0, LBP: 0 },
        days30: { USD: 0, LBP: 0 },
        days60: { USD: 0, LBP: 0 },
        days90: { USD: 0, LBP: 0 },
        over90: { USD: 0, LBP: 0 }
      };
      
      for (const entity of entities) {
        // Get current balance
        const balance = await snapshotService.getHistoricalBalance(
          storeId,
          accountCode,
          entity.id,
          asOfDate
        );
        
        if (Math.abs(balance.balanceUSD) < 0.01 && Math.abs(balance.balanceLBP) < 0.01) {
          continue; // Skip entities with zero balance
        }
        
        // For now, put all balance in "current" - proper aging requires invoice dates
        // This is a simplified implementation
        const aging = {
          current: { USD: balance.balanceUSD, LBP: balance.balanceLBP },
          days30: { USD: 0, LBP: 0 },
          days60: { USD: 0, LBP: 0 },
          days90: { USD: 0, LBP: 0 },
          over90: { USD: 0, LBP: 0 }
        };
        
        agingEntities.push({
          entityId: entity.id,
          entityName: entity.name,
          totalBalance: { USD: balance.balanceUSD, LBP: balance.balanceLBP },
          aging
        });
        
        // Add to totals
        totals.current.USD += balance.balanceUSD;
        totals.current.LBP += balance.balanceLBP;
      }
      
      // Sort by total balance descending
      agingEntities.sort((a, b) => 
        Math.abs(b.totalBalance.USD) - Math.abs(a.totalBalance.USD)
      );
      
      return {
        entityType,
        asOfDate,
        entities: agingEntities,
        totals
      };
      
    } catch (error) {
      console.error('Failed to generate aging report:', error);
      throw error;
    }
  }
  
  /**
   * Get financial summary using snapshots for performance
   */
  async getFinancialSummary(storeId: string, asOfDate: string): Promise<{
    assets: { USD: number; LBP: number };
    liabilities: { USD: number; LBP: number };
    equity: { USD: number; LBP: number };
    revenue: { USD: number; LBP: number };
    expenses: { USD: number; LBP: number };
    netIncome: { USD: number; LBP: number };
  }> {
    try {
      const accounts = await getDB().chart_of_accounts
        .where('store_id')
        .equals(storeId)
        .filter(account => account.is_active)
        .toArray();
      
      const summary = {
        assets: { USD: 0, LBP: 0 },
        liabilities: { USD: 0, LBP: 0 },
        equity: { USD: 0, LBP: 0 },
        revenue: { USD: 0, LBP: 0 },
        expenses: { USD: 0, LBP: 0 },
        netIncome: { USD: 0, LBP: 0 }
      };
      
      for (const account of accounts) {
        let accountBalanceUSD = 0;
        let accountBalanceLBP = 0;
        
        if (account.requires_entity) {
          // Sum across all entities
          const entities = await getDB().entities.where('store_id').equals(storeId).toArray();
          
          for (const entity of entities) {
            try {
              const balance = await snapshotService.getHistoricalBalance(
                storeId,
                account.account_code,
                entity.id,
                asOfDate
              );
              accountBalanceUSD += balance.balanceUSD;
              accountBalanceLBP += balance.balanceLBP;
            } catch (error) {
              // Skip entities with no balance
            }
          }
        } else {
          try {
            const balance = await snapshotService.getHistoricalBalance(
              storeId,
              account.account_code,
              null,
              asOfDate
            );
            accountBalanceUSD = balance.balanceUSD;
            accountBalanceLBP = balance.balanceLBP;
          } catch (error) {
            console.warn(`Failed to get balance for account ${account.account_code}:`, error);
          }
        }
        
        // Add to appropriate category
        switch (account.account_type) {
          case 'asset':
            summary.assets.USD += accountBalanceUSD;
            summary.assets.LBP += accountBalanceLBP;
            break;
          case 'liability':
            summary.liabilities.USD += Math.abs(accountBalanceUSD);
            summary.liabilities.LBP += Math.abs(accountBalanceLBP);
            break;
          case 'equity':
            summary.equity.USD += Math.abs(accountBalanceUSD);
            summary.equity.LBP += Math.abs(accountBalanceLBP);
            break;
          case 'revenue':
            summary.revenue.USD += Math.abs(accountBalanceUSD);
            summary.revenue.LBP += Math.abs(accountBalanceLBP);
            break;
          case 'expense':
            summary.expenses.USD += accountBalanceUSD;
            summary.expenses.LBP += accountBalanceLBP;
            break;
        }
      }
      
      // Calculate net income
      summary.netIncome.USD = summary.revenue.USD - summary.expenses.USD;
      summary.netIncome.LBP = summary.revenue.LBP - summary.expenses.LBP;
      
      return summary;
      
    } catch (error) {
      console.error('Failed to get financial summary:', error);
      throw error;
    }
  }
  
  /**
   * Helper method to determine if an account balance should be shown as debit
   */
  private isDebitBalance(
    accountType: string,
    balanceUSD: number,
    balanceLBP: number
  ): boolean {
    const hasBalance = Math.abs(balanceUSD) > 0.01 || Math.abs(balanceLBP) > 0.01;
    if (!hasBalance) return true; // Show zero balances as debit
    
    const isPositive = balanceUSD >= 0 && balanceLBP >= 0;
    
    switch (accountType) {
      case 'asset':
      case 'expense':
        return isPositive;
      case 'liability':
      case 'equity':
      case 'revenue':
        return !isPositive;
      default:
        return isPositive;
    }
  }
}

// Export singleton instance
export const reportingService = new ReportingService();
