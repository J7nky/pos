// Snapshot Scheduler Service - Phase 4 of Accounting Foundation Migration
// Handles automatic scheduling and execution of daily balance snapshots

import { snapshotService } from './snapshotService';
import { getDB } from '../lib/db';
import { getLocalDateString, getTodayLocalDate } from '../utils/dateUtils';

export interface SchedulerConfig {
  enabled: boolean;
  scheduleTime: string; // HH:MM format (24-hour)
  timezone: string;
  retryAttempts: number;
  retryDelayMinutes: number;
}

export interface SchedulerStatus {
  isRunning: boolean;
  lastRunDate: string | null;
  lastRunSuccess: boolean;
  nextScheduledRun: string | null;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
}

export interface SnapshotJob {
  id: string;
  storeId: string;
  scheduledDate: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  attempts: number;
  lastAttempt: string | null;
  error: string | null;
  result: any | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Service for scheduling and managing automatic daily snapshots
 */
export class SnapshotSchedulerService {
  private schedulerInterval: NodeJS.Timeout | null = null;
  private isSchedulerRunning = false;
  private config: SchedulerConfig = {
    enabled: true,
    scheduleTime: '23:59', // Default to 11:59 PM
    timezone: 'UTC',
    retryAttempts: 3,
    retryDelayMinutes: 30
  };
  
  /**
   * Start the snapshot scheduler
   */
  async startScheduler(config?: Partial<SchedulerConfig>): Promise<void> {
    if (this.isSchedulerRunning) {
      console.log('📊 Snapshot scheduler is already running');
      return;
    }
    
    // Update configuration
    if (config) {
      this.config = { ...this.config, ...config };
    }
    
    if (!this.config.enabled) {
      console.log('📊 Snapshot scheduler is disabled');
      return;
    }
    
    console.log(`📊 Starting snapshot scheduler - daily at ${this.config.scheduleTime}`);
    
    // Check every minute for scheduled snapshots
    this.schedulerInterval = setInterval(async () => {
      await this.checkAndRunScheduledSnapshots();
    }, 60 * 1000); // Check every minute
    
    this.isSchedulerRunning = true;
    
    // Run initial check
    await this.checkAndRunScheduledSnapshots();
  }
  
  /**
   * Stop the snapshot scheduler
   */
  stopScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
    
    this.isSchedulerRunning = false;
    console.log('📊 Snapshot scheduler stopped');
  }
  
  /**
   * Check if it's time to run snapshots and execute them
   */
  private async checkAndRunScheduledSnapshots(): Promise<void> {
    try {
      const now = new Date();
      const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const currentDate = getLocalDateString(now.toISOString());
      
      // Check if it's the scheduled time (within 1 minute window)
      if (currentTime === this.config.scheduleTime) {
        console.log(`📊 Scheduled snapshot time reached: ${currentTime}`);
        await this.runDailySnapshotsForAllStores(currentDate);
      }
      
      // Also check for any pending retry jobs
      await this.processRetryJobs();
      
    } catch (error) {
      console.error('❌ Error in snapshot scheduler:', error);
    }
  }
  
  /**
   * Run daily snapshots for all active stores
   */
  async runDailySnapshotsForAllStores(snapshotDate?: string): Promise<void> {
    const targetDate = snapshotDate || getTodayLocalDate();
    
    try {
      // Get all active stores
      const stores = await getDB().stores.toArray();
      
      if (stores.length === 0) {
        console.log('📊 No stores found for snapshot creation');
        return;
      }
      
      console.log(`📊 Running daily snapshots for ${stores.length} stores on ${targetDate}`);
      
      // Create snapshot jobs for each store
      const jobs: SnapshotJob[] = [];
      
      for (const store of stores) {
        // Check if job already exists for this store and date
        const existingJob = await this.findSnapshotJob(store.id, targetDate);
        
        if (!existingJob) {
          const job: SnapshotJob = {
            id: `snapshot-${store.id}-${targetDate}`,
            storeId: store.id,
            scheduledDate: targetDate,
            status: 'pending',
            attempts: 0,
            lastAttempt: null,
            error: null,
            result: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          
          jobs.push(job);
        }
      }
      
      // Process jobs
      for (const job of jobs) {
        await this.executeSnapshotJob(job);
      }
      
    } catch (error) {
      console.error('❌ Failed to run daily snapshots for all stores:', error);
    }
  }
  
  /**
   * Execute a snapshot job for a specific store
   */
  private async executeSnapshotJob(job: SnapshotJob): Promise<void> {
    try {
      console.log(`📊 Executing snapshot job for store ${job.storeId} on ${job.scheduledDate}`);
      
      // Update job status
      job.status = 'running';
      job.attempts++;
      job.lastAttempt = new Date().toISOString();
      job.updatedAt = new Date().toISOString();
      
      // Store job in localStorage for persistence (in a real app, this would be in a database)
      this.saveSnapshotJob(job);
      
      // Execute the snapshot creation
      const result = await snapshotService.createDailySnapshots(
        job.storeId,
        job.scheduledDate
      );
      
      if (result.success) {
        job.status = 'completed';
        job.result = result;
        job.error = null;
        
        console.log(`✅ Snapshot job completed for store ${job.storeId}: ${result.snapshotsCreated} snapshots created`);
        
        // Verify snapshots after creation
        setTimeout(async () => {
          try {
            await this.verifySnapshotsForStore(job.storeId, job.scheduledDate);
          } catch (verifyError) {
            console.warn('⚠️ Snapshot verification failed:', verifyError);
          }
        }, 5000); // Verify after 5 seconds
        
      } else {
        job.status = 'failed';
        job.error = result.errors.join(', ');
        
        console.error(`❌ Snapshot job failed for store ${job.storeId}: ${job.error}`);
        
        // Schedule retry if attempts remaining
        if (job.attempts < this.config.retryAttempts) {
          job.status = 'pending';
          console.log(`🔄 Scheduling retry for store ${job.storeId} (attempt ${job.attempts + 1}/${this.config.retryAttempts})`);
        }
      }
      
      job.updatedAt = new Date().toISOString();
      this.saveSnapshotJob(job);
      
    } catch (error) {
      job.status = 'failed';
      job.error = error instanceof Error ? error.message : String(error);
      job.updatedAt = new Date().toISOString();
      
      console.error(`❌ Snapshot job execution failed for store ${job.storeId}:`, error);
      
      // Schedule retry if attempts remaining
      if (job.attempts < this.config.retryAttempts) {
        job.status = 'pending';
      }
      
      this.saveSnapshotJob(job);
    }
  }
  
  /**
   * Process retry jobs that are due for retry
   */
  private async processRetryJobs(): Promise<void> {
    try {
      const jobs = this.getAllSnapshotJobs();
      const now = new Date();
      
      for (const job of jobs) {
        if (job.status === 'pending' && job.attempts > 0 && job.lastAttempt) {
          const lastAttemptTime = new Date(job.lastAttempt);
          const minutesSinceLastAttempt = (now.getTime() - lastAttemptTime.getTime()) / (1000 * 60);
          
          if (minutesSinceLastAttempt >= this.config.retryDelayMinutes) {
            console.log(`🔄 Retrying snapshot job for store ${job.storeId} (attempt ${job.attempts + 1})`);
            await this.executeSnapshotJob(job);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error processing retry jobs:', error);
    }
  }
  
  /**
   * Verify snapshots for a store after creation
   */
  private async verifySnapshotsForStore(storeId: string, snapshotDate: string): Promise<void> {
    try {
      console.log(`🔍 Verifying snapshots for store ${storeId} on ${snapshotDate}`);
      
      const verification = await snapshotService.verifySnapshots(storeId, snapshotDate);
      
      if (verification.isValid) {
        console.log(`✅ Snapshot verification passed for store ${storeId}: ${verification.validSnapshots}/${verification.totalSnapshots} valid`);
      } else {
        console.warn(`⚠️ Snapshot verification found issues for store ${storeId}: ${verification.discrepancies.length} discrepancies`);
        
        // Log first few discrepancies for debugging
        verification.discrepancies.slice(0, 3).forEach(disc => {
          console.warn(`   - Account ${disc.accountCode}: Snapshot ${disc.snapshotBalance.USD} USD, Calculated ${disc.calculatedBalance.USD} USD`);
        });
      }
      
    } catch (error) {
      console.error(`❌ Snapshot verification failed for store ${storeId}:`, error);
    }
  }
  
  /**
   * Get scheduler status
   */
  getSchedulerStatus(): SchedulerStatus {
    const jobs = this.getAllSnapshotJobs();
    const totalRuns = jobs.length;
    const successfulRuns = jobs.filter(j => j.status === 'completed').length;
    const failedRuns = jobs.filter(j => j.status === 'failed').length;
    
    const lastJob = jobs
      .filter(j => j.status === 'completed' || j.status === 'failed')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    
    return {
      isRunning: this.isSchedulerRunning,
      lastRunDate: lastJob?.scheduledDate || null,
      lastRunSuccess: lastJob?.status === 'completed' || false,
      nextScheduledRun: this.getNextScheduledRun(),
      totalRuns,
      successfulRuns,
      failedRuns
    };
  }
  
  /**
   * Get next scheduled run time
   */
  private getNextScheduledRun(): string | null {
    if (!this.config.enabled) return null;
    
    const now = new Date();
    const [hours, minutes] = this.config.scheduleTime.split(':').map(Number);
    
    const nextRun = new Date(now);
    nextRun.setHours(hours, minutes, 0, 0);
    
    // If the time has passed today, schedule for tomorrow
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
    
    return nextRun.toISOString();
  }
  
  /**
   * Manually trigger snapshots for a specific store
   */
  async triggerSnapshotForStore(storeId: string, snapshotDate?: string): Promise<void> {
    const targetDate = snapshotDate || getTodayLocalDate();
    
    console.log(`📊 Manually triggering snapshot for store ${storeId} on ${targetDate}`);
    
    const job: SnapshotJob = {
      id: `manual-snapshot-${storeId}-${targetDate}-${Date.now()}`,
      storeId,
      scheduledDate: targetDate,
      status: 'pending',
      attempts: 0,
      lastAttempt: null,
      error: null,
      result: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    await this.executeSnapshotJob(job);
  }
  
  // Simple localStorage-based job persistence (in production, use proper database)
  private saveSnapshotJob(job: SnapshotJob): void {
    try {
      const jobs = this.getAllSnapshotJobs();
      const existingIndex = jobs.findIndex(j => j.id === job.id);
      
      if (existingIndex >= 0) {
        jobs[existingIndex] = job;
      } else {
        jobs.push(job);
      }
      
      localStorage.setItem('snapshotJobs', JSON.stringify(jobs));
    } catch (error) {
      console.error('Failed to save snapshot job:', error);
    }
  }
  
  private findSnapshotJob(storeId: string, scheduledDate: string): SnapshotJob | null {
    const jobs = this.getAllSnapshotJobs();
    return jobs.find(j => j.storeId === storeId && j.scheduledDate === scheduledDate) || null;
  }
  
  private getAllSnapshotJobs(): SnapshotJob[] {
    try {
      const stored = localStorage.getItem('snapshotJobs');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to load snapshot jobs:', error);
      return [];
    }
  }
  
  /**
   * Clean up old job records
   */
  cleanupOldJobs(retentionDays: number = 30): number {
    const jobs = this.getAllSnapshotJobs();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffDateStr = getLocalDateString(cutoffDate.toISOString());
    
    const filteredJobs = jobs.filter(job => job.scheduledDate >= cutoffDateStr);
    const deletedCount = jobs.length - filteredJobs.length;
    
    if (deletedCount > 0) {
      localStorage.setItem('snapshotJobs', JSON.stringify(filteredJobs));
      console.log(`🧹 Cleaned up ${deletedCount} old snapshot jobs`);
    }
    
    return deletedCount;
  }
}

// Export singleton instance
export const snapshotSchedulerService = new SnapshotSchedulerService();
