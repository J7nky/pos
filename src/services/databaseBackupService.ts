import { db } from '../lib/db';
import { databaseConnectionService } from './databaseConnectionService';

export interface BackupMetadata {
  id: string;
  timestamp: string;
  version: string;
  storeId: string;
  recordCounts: Record<string, number>;
  totalSize: number;
  compressionRatio?: number;
  checksum: string;
}

export interface BackupOptions {
  includeDeleted: boolean;
  compress: boolean;
  encrypt: boolean;
  maxAge?: number; // days
}

export interface RestoreOptions {
  verifyIntegrity: boolean;
  skipConflicts: boolean;
  mergeStrategy: 'overwrite' | 'merge' | 'skip';
}

export interface BackupResult {
  success: boolean;
  backupId: string;
  message: string;
  metadata?: BackupMetadata;
  errors?: string[];
}

export interface RestoreResult {
  success: boolean;
  message: string;
  restoredCounts: Record<string, number>;
  errors?: string[];
}

export class DatabaseBackupService {
  private static instance: DatabaseBackupService;
  private readonly STORAGE_KEY_PREFIX = 'pos_backup_';
  private readonly MAX_BACKUPS = 10; // Keep only last 10 backups
  private readonly COMPRESSION_THRESHOLD = 1024 * 1024; // 1MB

  private constructor() {}

  public static getInstance(): DatabaseBackupService {
    if (!DatabaseBackupService.instance) {
      DatabaseBackupService.instance = new DatabaseBackupService();
    }
    return DatabaseBackupService.instance;
  }

  /**
   * Create a comprehensive backup of the database
   */
  public async createBackup(
    storeId: string, 
    options: BackupOptions = {
      includeDeleted: false,
      compress: true,
      encrypt: false
    }
  ): Promise<BackupResult> {
    const backupId = `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    try {
      console.log(`🔄 Creating backup: ${backupId}`);

      // Get all table data
      const tableData: Record<string, any[]> = {};
      const recordCounts: Record<string, number> = {};
      let totalRecords = 0;

      const tableNames = [
        'stores', 'products', 'suppliers', 'customers', 'inventory_items',
        'transactions', 'inventory_bills', 'bills', 'bill_line_items',
        'bill_audit_logs', 'cash_drawer_accounts', 'cash_drawer_sessions',
        'exchange_rates', 'sync_metadata', 'pending_syncs'
      ];

      for (const tableName of tableNames) {
        try {
          const table = (db as any)[tableName];
          if (table) {
            let query = table.toCollection();
            
            // Apply filters based on options
            if (!options.includeDeleted) {
              query = query.filter(record => !record._deleted);
            }
            
            const records = await query.toArray();
            tableData[tableName] = records;
            recordCounts[tableName] = records.length;
            totalRecords += records.length;
          }
        } catch (error) {
          console.warn(`Failed to backup table ${tableName}:`, error);
          tableData[tableName] = [];
          recordCounts[tableName] = 0;
        }
      }

      // Create backup metadata
      const metadata: BackupMetadata = {
        id: backupId,
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        storeId,
        recordCounts,
        totalSize: 0, // Will be calculated after serialization
        checksum: ''
      };

      // Serialize backup data
      const backupData = {
        metadata,
        data: tableData,
        options
      };

      // Calculate size and checksum
      const serializedData = JSON.stringify(backupData);
      metadata.totalSize = new Blob([serializedData]).size;
      metadata.checksum = await this.calculateChecksum(serializedData);

      // Compress if enabled and data is large enough
      let finalData = serializedData;
      if (options.compress && metadata.totalSize > this.COMPRESSION_THRESHOLD) {
        try {
          finalData = await this.compressData(serializedData);
          metadata.compressionRatio = finalData.length / serializedData.length;
        } catch (error) {
          console.warn('Compression failed, storing uncompressed:', error);
        }
      }

      // Encrypt if enabled
      if (options.encrypt) {
        try {
          finalData = await this.encryptData(finalData);
        } catch (error) {
          console.warn('Encryption failed, storing unencrypted:', error);
        }
      }

      // Store backup
      const storageKey = `${this.STORAGE_KEY_PREFIX}${backupId}`;
      localStorage.setItem(storageKey, finalData);

      // Clean up old backups
      await this.cleanupOldBackups();

      const duration = Date.now() - startTime;
      console.log(`✅ Backup created successfully: ${backupId} (${totalRecords} records, ${(metadata.totalSize / 1024).toFixed(1)}KB, ${duration}ms)`);

      return {
        success: true,
        backupId,
        message: `Backup created successfully with ${totalRecords} records`,
        metadata
      };

    } catch (error) {
      console.error('❌ Backup failed:', error);
      return {
        success: false,
        backupId,
        message: `Backup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Restore database from backup
   */
  public async restoreFromBackup(
    backupId: string,
    options: RestoreOptions = {
      verifyIntegrity: true,
      skipConflicts: false,
      mergeStrategy: 'overwrite'
    }
  ): Promise<RestoreResult> {
    const startTime = Date.now();

    try {
      console.log(`🔄 Restoring from backup: ${backupId}`);

      // Load backup data
      const storageKey = `${this.STORAGE_KEY_PREFIX}${backupId}`;
      const backupData = localStorage.getItem(storageKey);
      
      if (!backupData) {
        throw new Error('Backup not found');
      }

      // Decrypt if needed
      let decryptedData = backupData;
      try {
        decryptedData = await this.decryptData(backupData);
      } catch (error) {
        // Not encrypted or decryption failed, use as-is
      }

      // Decompress if needed
      let decompressedData = decryptedData;
      try {
        decompressedData = await this.decompressData(decryptedData);
      } catch (error) {
        // Not compressed or decompression failed, use as-is
      }

      // Parse backup data
      const backup = JSON.parse(decompressedData);
      
      // Verify integrity if requested
      if (options.verifyIntegrity) {
        const isValid = await this.verifyBackupIntegrity(backup);
        if (!isValid) {
          throw new Error('Backup integrity verification failed');
        }
      }

      // Clear existing data
      await db.transaction('rw', db.tables, async () => {
        for (const tableName of Object.keys(backup.data)) {
          const table = (db as any)[tableName];
          if (table) {
            await table.clear();
          }
        }
      });

      // Restore data
      const restoredCounts: Record<string, number> = {};
      let totalRestored = 0;

      await db.transaction('rw', db.tables, async () => {
        for (const [tableName, records] of Object.entries(backup.data)) {
          const table = (db as any)[tableName];
          if (table && Array.isArray(records)) {
            try {
              await table.bulkAdd(records);
              restoredCounts[tableName] = records.length;
              totalRestored += records.length;
            } catch (error) {
              console.warn(`Failed to restore table ${tableName}:`, error);
              restoredCounts[tableName] = 0;
            }
          }
        }
      });

      const duration = Date.now() - startTime;
      console.log(`✅ Restore completed: ${totalRestored} records restored in ${duration}ms`);

      return {
        success: true,
        message: `Successfully restored ${totalRestored} records`,
        restoredCounts
      };

    } catch (error) {
      console.error('❌ Restore failed:', error);
      return {
        success: false,
        message: `Restore failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        restoredCounts: {},
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * List all available backups
   */
  public async listBackups(): Promise<BackupMetadata[]> {
    const backups: BackupMetadata[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.STORAGE_KEY_PREFIX)) {
        try {
          const backupData = localStorage.getItem(key);
          if (backupData) {
            // Try to extract metadata without full parsing
            const backup = JSON.parse(backupData);
            if (backup.metadata) {
              backups.push(backup.metadata);
            }
          }
        } catch (error) {
          console.warn(`Failed to parse backup ${key}:`, error);
        }
      }
    }

    // Sort by timestamp (newest first)
    return backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  /**
   * Delete a backup
   */
  public async deleteBackup(backupId: string): Promise<{ success: boolean; message: string }> {
    try {
      const storageKey = `${this.STORAGE_KEY_PREFIX}${backupId}`;
      localStorage.removeItem(storageKey);
      
      return {
        success: true,
        message: 'Backup deleted successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to delete backup: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Export backup to file
   */
  public async exportBackup(backupId: string): Promise<{ success: boolean; blob?: Blob; message: string }> {
    try {
      const storageKey = `${this.STORAGE_KEY_PREFIX}${backupId}`;
      const backupData = localStorage.getItem(storageKey);
      
      if (!backupData) {
        throw new Error('Backup not found');
      }

      const blob = new Blob([backupData], { type: 'application/json' });
      
      return {
        success: true,
        blob,
        message: 'Backup exported successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Import backup from file
   */
  public async importBackup(file: File): Promise<BackupResult> {
    try {
      const content = await file.text();
      const backup = JSON.parse(content);
      
      if (!backup.metadata || !backup.data) {
        throw new Error('Invalid backup file format');
      }

      const backupId = backup.metadata.id || `imported_${Date.now()}`;
      const storageKey = `${this.STORAGE_KEY_PREFIX}${backupId}`;
      
      localStorage.setItem(storageKey, content);
      
      return {
        success: true,
        backupId,
        message: 'Backup imported successfully',
        metadata: backup.metadata
      };
    } catch (error) {
      return {
        success: false,
        backupId: '',
        message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Calculate checksum for data integrity
   */
  private async calculateChecksum(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Compress data using gzip
   */
  private async compressData(data: string): Promise<string> {
    const stream = new CompressionStream('gzip');
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();
    
    writer.write(new TextEncoder().encode(data));
    writer.close();
    
    const chunks: Uint8Array[] = [];
    let done = false;
    
    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        chunks.push(value);
      }
    }
    
    const compressed = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      compressed.set(chunk, offset);
      offset += chunk.length;
    }
    
    return btoa(String.fromCharCode(...compressed));
  }

  /**
   * Decompress data
   */
  private async decompressData(compressedData: string): Promise<string> {
    const compressed = Uint8Array.from(atob(compressedData), c => c.charCodeAt(0));
    const stream = new DecompressionStream('gzip');
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();
    
    writer.write(compressed);
    writer.close();
    
    const chunks: Uint8Array[] = [];
    let done = false;
    
    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        chunks.push(value);
      }
    }
    
    const decompressed = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      decompressed.set(chunk, offset);
      offset += chunk.length;
    }
    
    return new TextDecoder().decode(decompressed);
  }

  /**
   * Encrypt data (simple XOR for demo - use proper encryption in production)
   */
  private async encryptData(data: string): Promise<string> {
    // Simple XOR encryption for demo purposes
    // In production, use proper encryption like AES
    const key = 'pos-backup-key-2024';
    let encrypted = '';
    for (let i = 0; i < data.length; i++) {
      encrypted += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(encrypted);
  }

  /**
   * Decrypt data
   */
  private async decryptData(encryptedData: string): Promise<string> {
    const key = 'pos-backup-key-2024';
    const data = atob(encryptedData);
    let decrypted = '';
    for (let i = 0; i < data.length; i++) {
      decrypted += String.fromCharCode(data.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return decrypted;
  }

  /**
   * Verify backup integrity
   */
  private async verifyBackupIntegrity(backup: any): Promise<boolean> {
    try {
      // Check if backup has required structure
      if (!backup.metadata || !backup.data) {
        return false;
      }

      // Verify checksum if available
      if (backup.metadata.checksum) {
        const dataString = JSON.stringify(backup.data);
        const calculatedChecksum = await this.calculateChecksum(dataString);
        return calculatedChecksum === backup.metadata.checksum;
      }

      return true;
    } catch (error) {
      console.warn('Integrity verification failed:', error);
      return false;
    }
  }

  /**
   * Clean up old backups
   */
  private async cleanupOldBackups(): Promise<void> {
    const backups = await this.listBackups();
    
    if (backups.length > this.MAX_BACKUPS) {
      // Sort by timestamp and keep only the newest ones
      const sortedBackups = backups.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const backupsToDelete = sortedBackups.slice(this.MAX_BACKUPS);
      
      for (const backup of backupsToDelete) {
        await this.deleteBackup(backup.id);
      }
      
      console.log(`🧹 Cleaned up ${backupsToDelete.length} old backups`);
    }
  }
}

export const databaseBackupService = DatabaseBackupService.getInstance();

