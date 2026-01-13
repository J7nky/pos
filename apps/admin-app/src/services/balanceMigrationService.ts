import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';

export interface ExcelRow {
  entityName: string;
  entityType: 'customer' | 'supplier';
  debitBalance: number;
  creditBalance: number;
}

export interface ValidationError {
  row: Partial<ExcelRow>;
  rowIndex: number;
  message: string;
}

export interface ValidationResult {
  validRows: ExcelRow[];
  errors: ValidationError[];
}

export interface MigrationSession {
  id: string;
  storeId: string;
  branchId: string;
  filename: string;
  uploadedAt: string;
  status: 'uploading' | 'validating' | 'previewing' | 'importing' | 'completed' | 'failed';
  totalRows: number;
  validRows: number;
  importedRows: number;
  errorRows: number;
}

export interface ImportResult {
  importedCount: number;
  importedRows: ExcelRow[];
  errors: string[];
}

/**
 * Result from the migrate_opening_balance RPC function
 */
interface MigrationRPCResult {
  success: boolean;
  entity_id?: string;
  entity_name?: string;
  entity_type?: string;
  entity_created?: boolean;
  transaction_id?: string;
  journal_entry_ids?: string[];
  amount?: number;
  currency?: string;
  debit_account?: string;
  credit_account?: string;
  error?: string;
  error_detail?: string;
}

/**
 * Result from the migrate_opening_balances_bulk RPC function
 */
interface BulkMigrationRPCResult {
  success: boolean;
  total_rows: number;
  success_count: number;
  error_count: number;
  results: MigrationRPCResult[];
}

/**
 * Balance Migration Service
 * Handles the end-to-end process of migrating opening balances from Excel files
 * 
 * Architecture (following DEVELOPER_RULES.md):
 * - Uses atomic PostgreSQL RPC function for all database operations
 * - Emits events to branch_event_log for real-time sync
 * - Follows established schema patterns from db.ts
 */
export class BalanceMigrationService {

  /**
   * Create a new migration session
   */
  async createMigrationSession(
    storeId: string,
    branchId: string,
    filename: string
  ): Promise<MigrationSession> {
    const session: MigrationSession = {
      id: crypto.randomUUID(),
      storeId,
      branchId,
      filename,
      uploadedAt: new Date().toISOString(),
      status: 'uploading',
      totalRows: 0,
      validRows: 0,
      importedRows: 0,
      errorRows: 0
    };

    // Store session in local storage for now (could be moved to Supabase later)
    const sessions = this.getStoredSessions();
    sessions.push(session);
    localStorage.setItem('balanceMigrationSessions', JSON.stringify(sessions));

    return session;
  }

  /**
   * Parse legacy mchar.csv file from Access database export
   * 
   * CSV Structure (actual Access export format):
   * - Column 0: id - entity ID
   * - Column 1: account - account code
   * - Column 2: description - entity name
   * - Column 3: fia - entity flag (4 = customer/supplier)
   * - Column 4: typex - type code
   * - Column 5-8: address, tel, FAX, curr - contact/currency info
   * - Column 9: ydfamt - yearly debit amount
   * - Column 10: ycfamt - yearly credit amount
   * - Column 11: ydbamt1 - yearly debit amount (period 1)
   * - Column 12: ycbamt1 - yearly credit amount (period 1)
   * - Column 13: ydbamt2 - yearly debit amount (period 2)
   * - Column 14: ycbamt2 - yearly credit amount (period 2)
   * - Additional columns may exist and will be ignored
   * 
   * Processing:
   * 1. Filter: only fia = 4 (note: field is 'fia' not 'fla')
   * 2. Calculate: balance = (ydfamt + ydbamt1 + ydbamt2) - (ycfamt + ycbamt1 + ycbamt2)
   * 3. Skip: balance with absolute value < 1 (e.g., 0.45, -0.45)
   * 4. Classify: balance >= 1 = customer, balance <= -1 = supplier
   */
  async parseMcharFile(file: File): Promise<ExcelRow[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          let csvText = e.target?.result as string;

          // Remove BOM if present
          if (csvText.charCodeAt(0) === 0xFEFF) {
            csvText = csvText.slice(1);
          }

          // Parse CSV using existing XLSX library
          const workbook = XLSX.read(csvText, {
            type: 'string',
            codepage: 65001,
            cellDates: true,
            raw: true
          });

          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
            header: 1, 
            raw: true, 
            defval: '' 
          });

          const rows: ExcelRow[] = [];
          
          // Process each row (skip header)
          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i] as any[];
            
            // Need at least 15 columns for the data we need
            if (row.length < 15) {
              console.log(`Skipping row ${i}: insufficient columns (${row.length} < 15)`);
              continue;
            }
            
            // Extract columns according to actual Access export format
            // Position: 0=id, 1=account, 2=description, 3=fia, 4=typex, 5=address, 6=tel, 7=FAX, 8=curr,
            //           9=ydfamt, 10=ycfamt, 11=ydbamt1, 12=ycbamt1, 13=ydbamt2, 14=ycbamt2
            const [_id, _account, description, fia, _typex, _address, _tel, _fax, _curr, 
                   ydfamt, ycfamt, ydbamt1, ycbamt1, ydbamt2, ycbamt2] = row;
            
            // Filter: only fia = 4 (customer/supplier entities)
            const fiaValue = Number(fia);
            if (fiaValue !== 4) {
              console.log(`Skipping row ${i}: fia = ${fiaValue} (not 4)`);
              continue;
            }
            
            // Calculate balance using the exact formula
            const balance = 
              (Number(ydfamt || 0)) -
              (Number(ycfamt || 0));
            
            // Skip balances with absolute value < 1 (e.g., 0.45, -0.45, 0.99)
            if (Math.abs(balance) < 1) {
              console.log(`Skipping row ${i}: ${description} (balance < 1: ${balance})`);
              continue;
            }
            
            // Classify entity type based on balance sign
            const entityType: 'customer' | 'supplier' = balance > 0 ? 'customer' : 'supplier';
            const amount = Math.abs(balance);
            
            const entityName = String(description || '').trim();
            if (!entityName) {
              console.warn(`Skipping row ${i}: empty entity name`);
              continue;
            }
            
            rows.push({
              entityName: entityName,
              entityType: entityType,
              debitBalance: balance < 0 ? amount : 0,   // Supplier (we owe them)
              creditBalance: balance > 0 ? amount : 0   // Customer (they owe us)
            });
            
            console.log(`Processed row ${i}: ${entityName} (${entityType}, balance: ${balance})`);
          }

          console.log(`Parsed legacy mchar.csv: ${rows.length} valid entities found`);
          resolve(rows);
        } catch (error) {
          reject(new Error(`Failed to parse mchar.csv: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file, 'UTF-8');
    });
  }

  /**
   * Validate migration data according to business rules
   */
  validateMigrationData(rows: ExcelRow[]): ValidationResult {
    const validRows: ExcelRow[] = [];
    const errors: ValidationError[] = [];

    rows.forEach((row, index) => {
      const rowErrors: string[] = [];

      // 1. Entity name is required
      if (!row.entityName || row.entityName.trim() === '') {
        rowErrors.push('Entity name is required');
      }

      // 2. Entity type must be customer or supplier
      if (!['customer', 'supplier'].includes(row.entityType)) {
        rowErrors.push('Entity type must be "customer" or "supplier"');
      }

      // 3. At least one balance must be non-zero
      if (row.debitBalance === 0 && row.creditBalance === 0) {
        rowErrors.push('At least one balance (debit or credit) must be non-zero');
      }

      // 4. Both balances cannot be non-zero
      if (row.debitBalance !== 0 && row.creditBalance !== 0) {
        rowErrors.push('Only one balance (debit or credit) can be non-zero');
      }

      // 5. Legacy rules validation
      if (row.entityType === 'supplier' && row.creditBalance !== 0) {
        rowErrors.push('Suppliers cannot have credit balances');
      }

      if (row.entityType === 'customer' && row.debitBalance !== 0) {
        rowErrors.push('Customers cannot have debit balances');
      }

      // 6. Balances must be positive
      if (row.debitBalance < 0 || row.creditBalance < 0) {
        rowErrors.push('Balances cannot be negative');
      }

      if (rowErrors.length === 0) {
        validRows.push(row);
      } else {
        errors.push({
          row,
          rowIndex: index + 2, // +2 because Excel is 1-indexed and we skip header
          message: rowErrors.join('; ')
        });
      }
    });

    return { validRows, errors };
  }

  /**
   * Execute the migration using atomic RPC function
   * This follows DEVELOPER_RULES.md:
   * - Rule 5: Event-driven architecture (RPC emits events to branch_event_log)
   * - Rule 6: Atomic transactions (all operations in single PostgreSQL transaction)
   * - Rule 10: Schema compliance (RPC follows established patterns)
   * - Rule 11: Error handling (comprehensive error reporting)
   */
  async executeMigration(
    sessionId: string,
    validRows: ExcelRow[],
    options: { useBulk?: boolean; currency?: 'USD' | 'LBP' } = {}
  ): Promise<ImportResult> {
    // Default to individual processing (more reliable, bulk RPC may not be deployed)
    const { useBulk = false, currency = 'LBP' } = options;
    const importedRows: ExcelRow[] = [];
    const errors: string[] = [];

    console.log(`📦 Starting migration for ${validRows.length} rows, useBulk: ${useBulk}`);

    try {
      // Get session details
      const sessions = this.getStoredSessions();
      const session = sessions.find(s => s.id === sessionId);
      if (!session) {
        throw new Error('Migration session not found');
      }

      console.log('📍 Session found:', { storeId: session.storeId, branchId: session.branchId });

      // Get current user ID (if authenticated)
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || null;
      console.log('👤 User ID:', userId);

      if (useBulk && validRows.length > 1) {
        // Use bulk RPC for better performance
        console.log('🚀 Using bulk migration...');
        const result = await this.executeBulkMigration(session, validRows, currency, userId);
        importedRows.push(...result.importedRows);
        errors.push(...result.errors);
      } else {
        // Process rows individually
        console.log('🔄 Processing rows individually...');
        for (let i = 0; i < validRows.length; i++) {
          const row = validRows[i];
          console.log(`Processing row ${i + 1}/${validRows.length}: ${row.entityName}`);
          try {
            await this.migrateOpeningBalance(session, row, currency, userId);
            importedRows.push(row);
          } catch (error) {
            const errorMsg = `Failed to import ${row.entityName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            errors.push(errorMsg);
            console.error(errorMsg, error);
          }
        }
      }

      console.log(`📊 Migration complete: ${importedRows.length} imported, ${errors.length} errors`);

      // Update session status
      session.status = errors.length === 0 ? 'completed' : (importedRows.length > 0 ? 'completed' : 'failed');
      session.importedRows = importedRows.length;
      session.errorRows = errors.length;
      this.saveSessions(sessions);

      return {
        importedCount: importedRows.length,
        importedRows,
        errors
      };

    } catch (error) {
      console.error('Migration execution failed:', error);
      throw new Error(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Migrate a single opening balance using atomic RPC function
   * The RPC function handles:
   * - Entity creation (if needed)
   * - Transaction creation
   * - Journal entry creation (balanced debit/credit)
   * - Event emission for real-time sync
   */
  private async migrateOpeningBalance(
    session: MigrationSession,
    row: ExcelRow,
    currency: 'USD' | 'LBP',
    userId: string | null
  ): Promise<MigrationRPCResult> {
    console.log(`🔄 Migrating balance for ${row.entityName}:`, {
      storeId: session.storeId,
      branchId: session.branchId,
      entityType: row.entityType,
      debitBalance: row.debitBalance,
      creditBalance: row.creditBalance,
      currency,
      userId
    });

    const { data, error } = await supabase.rpc('migrate_opening_balance', {
      p_store_id: session.storeId,
      p_branch_id: session.branchId,
      p_entity_name: row.entityName,
      p_entity_type: row.entityType,
      p_debit_balance: row.debitBalance,
      p_credit_balance: row.creditBalance,
      p_currency: currency,
      p_user_id: userId
    });

    if (error) {
      console.error(`❌ RPC error for ${row.entityName}:`, error);
      throw new Error(`RPC error: ${error.message}`);
    }

    const result = data as MigrationRPCResult;
    
    if (!result.success) {
      console.error(`❌ Migration failed for ${row.entityName}:`, result);
      throw new Error(result.error || 'Migration failed');
    }

    console.log(`✅ Migrated opening balance for ${row.entityName}:`, {
      entityId: result.entity_id,
      entityCreated: result.entity_created,
      transactionId: result.transaction_id,
      amount: result.amount,
      currency: result.currency
    });

    return result;
  }

  /**
   * Execute bulk migration using atomic RPC function
   * More efficient for multiple rows - single RPC call
   */
  private async executeBulkMigration(
    session: MigrationSession,
    rows: ExcelRow[],
    currency: 'USD' | 'LBP',
    userId: string | null
  ): Promise<{ importedRows: ExcelRow[]; errors: string[] }> {
    const importedRows: ExcelRow[] = [];
    const errors: string[] = [];

    // Convert rows to format expected by RPC
    const rpcRows = rows.map(row => ({
      entity_name: row.entityName,
      entity_type: row.entityType,
      debit_balance: row.debitBalance,
      credit_balance: row.creditBalance
    }));

    const { data, error } = await supabase.rpc('migrate_opening_balances_bulk', {
      p_store_id: session.storeId,
      p_branch_id: session.branchId,
      p_rows: rpcRows,
      p_currency: currency,
      p_user_id: userId
    });

    if (error) {
      // Fall back to individual processing if bulk RPC fails
      console.warn('Bulk RPC failed, falling back to individual processing:', error.message);
      for (const row of rows) {
        try {
          await this.migrateOpeningBalance(session, row, currency, userId);
          importedRows.push(row);
        } catch (rowError) {
          errors.push(`Failed to import ${row.entityName}: ${rowError instanceof Error ? rowError.message : 'Unknown error'}`);
        }
      }
      return { importedRows, errors };
    }

    const result = data as BulkMigrationRPCResult;

    console.log(`📦 Bulk migration completed:`, {
      totalRows: result.total_rows,
      successCount: result.success_count,
      errorCount: result.error_count
    });

    // Process results
    result.results.forEach((rowResult, index) => {
      if (rowResult.success) {
        importedRows.push(rows[index]);
      } else {
        errors.push(`Failed to import ${rows[index].entityName}: ${rowResult.error || 'Unknown error'}`);
      }
    });

    return { importedRows, errors };
  }

  /**
   * Get stored migration sessions
   */
  private getStoredSessions(): MigrationSession[] {
    const stored = localStorage.getItem('balanceMigrationSessions');
    return stored ? JSON.parse(stored) : [];
  }

  /**
   * Save migration sessions
   */
  private saveSessions(sessions: MigrationSession[]): void {
    localStorage.setItem('balanceMigrationSessions', JSON.stringify(sessions));
  }
}

// Export singleton instance
export const balanceMigrationService = new BalanceMigrationService();
