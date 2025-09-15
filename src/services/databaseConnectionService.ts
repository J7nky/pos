import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../types/database';

export interface ConnectionConfig {
  url: string;
  anonKey: string;
  maxRetries: number;
  retryDelay: number;
  connectionTimeout: number;
  poolSize: number;
}

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

export interface ConnectionPool {
  client: SupabaseClient<Database>;
  lastUsed: Date;
  isHealthy: boolean;
  errorCount: number;
}

export interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  failedConnections: number;
  averageResponseTime: number;
  lastError?: string;
  lastErrorTime?: Date;
}

export class DatabaseConnectionService {
  private static instance: DatabaseConnectionService;
  private connectionPool: ConnectionPool[] = [];
  private config: ConnectionConfig;
  private retryOptions: RetryOptions;
  private metrics: ConnectionMetrics;
  private isInitialized = false;

  private constructor() {
    this.config = {
      url: import.meta.env.VITE_SUPABASE_URL || '',
      anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
      maxRetries: 3,
      retryDelay: 1000,
      connectionTimeout: 10000,
      poolSize: 5
    };

    this.retryOptions = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      retryableErrors: [
        'NetworkError',
        'TimeoutError',
        'ConnectionError',
        'ECONNRESET',
        'ENOTFOUND',
        'ETIMEDOUT'
      ]
    };

    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      failedConnections: 0,
      averageResponseTime: 0
    };
  }

  public static getInstance(): DatabaseConnectionService {
    if (!DatabaseConnectionService.instance) {
      DatabaseConnectionService.instance = new DatabaseConnectionService();
    }
    return DatabaseConnectionService.instance;
  }

  /**
   * Initialize the connection pool
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('🔌 Initializing database connection pool...');
      
      // Create initial connections
      for (let i = 0; i < this.config.poolSize; i++) {
        const client = this.createClient();
        const connection: ConnectionPool = {
          client,
          lastUsed: new Date(),
          isHealthy: true,
          errorCount: 0
        };
        this.connectionPool.push(connection);
        this.metrics.totalConnections++;
      }

      // Test all connections
      await this.healthCheck();
      
      this.isInitialized = true;
      console.log(`✅ Database connection pool initialized with ${this.connectionPool.length} connections`);
      
    } catch (error) {
      console.error('❌ Failed to initialize connection pool:', error);
      throw error;
    }
  }

  /**
   * Create a new Supabase client
   */
  private createClient(): SupabaseClient<Database> {
    return createClient<Database>(this.config.url, this.config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      realtime: {
        enabled: false // Disable realtime for better performance
      },
      global: {
        headers: {
          'X-Client-Info': 'pos-app@1.0.0'
        }
      }
    });
  }

  /**
   * Get a healthy connection from the pool
   */
  public async getConnection(): Promise<SupabaseClient<Database>> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Find the healthiest connection
    const healthyConnections = this.connectionPool.filter(conn => conn.isHealthy);
    
    if (healthyConnections.length === 0) {
      // All connections are unhealthy, try to recover
      await this.recoverConnections();
      const recoveredConnections = this.connectionPool.filter(conn => conn.isHealthy);
      
      if (recoveredConnections.length === 0) {
        throw new Error('No healthy database connections available');
      }
    }

    // Select the least recently used healthy connection
    const selectedConnection = healthyConnections.reduce((oldest, current) => 
      current.lastUsed < oldest.lastUsed ? current : oldest
    );

    selectedConnection.lastUsed = new Date();
    this.metrics.activeConnections = healthyConnections.length;

    return selectedConnection.client;
  }

  /**
   * Execute a database operation with retry logic
   */
  public async executeWithRetry<T>(
    operation: (client: SupabaseClient<Database>) => Promise<T>,
    operationName: string = 'Database operation'
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= this.retryOptions.maxRetries; attempt++) {
      const startTime = Date.now();
      
      try {
        const client = await this.getConnection();
        const result = await operation(client);
        
        // Update metrics
        const responseTime = Date.now() - startTime;
        this.updateResponseTime(responseTime);
        
        return result;
        
      } catch (error) {
        lastError = error as Error;
        console.warn(`⚠️ ${operationName} failed (attempt ${attempt}/${this.retryOptions.maxRetries}):`, error);
        
        // Check if error is retryable
        if (!this.isRetryableError(error as Error)) {
          throw error;
        }
        
        // Mark connection as unhealthy if it's a connection error
        if (this.isConnectionError(error as Error)) {
          await this.markConnectionUnhealthy(client);
        }
        
        // Wait before retry
        if (attempt < this.retryOptions.maxRetries) {
          const delay = this.calculateRetryDelay(attempt);
          console.log(`⏳ Retrying ${operationName} in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }
    
    this.metrics.failedConnections++;
    this.metrics.lastError = lastError?.message;
    this.metrics.lastErrorTime = new Date();
    
    throw new Error(`${operationName} failed after ${this.retryOptions.maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    return this.retryOptions.retryableErrors.some(retryableError => 
      errorMessage.includes(retryableError.toLowerCase())
    );
  }

  /**
   * Check if an error is a connection error
   */
  private isConnectionError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    return errorMessage.includes('connection') || 
           errorMessage.includes('network') || 
           errorMessage.includes('timeout');
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    const delay = this.retryOptions.baseDelay * Math.pow(this.retryOptions.backoffMultiplier, attempt - 1);
    return Math.min(delay, this.retryOptions.maxDelay);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Mark a connection as unhealthy
   */
  private async markConnectionUnhealthy(client: SupabaseClient<Database>): Promise<void> {
    const connection = this.connectionPool.find(conn => conn.client === client);
    if (connection) {
      connection.isHealthy = false;
      connection.errorCount++;
      console.warn(`⚠️ Marked connection as unhealthy (error count: ${connection.errorCount})`);
    }
  }

  /**
   * Recover unhealthy connections
   */
  private async recoverConnections(): Promise<void> {
    console.log('🔄 Attempting to recover unhealthy connections...');
    
    for (const connection of this.connectionPool) {
      if (!connection.isHealthy) {
        try {
          // Test the connection
          const { error } = await connection.client.from('products').select('id').limit(1);
          
          if (!error) {
            connection.isHealthy = true;
            connection.errorCount = 0;
            console.log('✅ Recovered unhealthy connection');
          }
        } catch (error) {
          console.warn('⚠️ Failed to recover connection:', error);
        }
      }
    }
  }

  /**
   * Perform health check on all connections
   */
  public async healthCheck(): Promise<{ healthy: number; total: number }> {
    let healthyCount = 0;
    
    for (const connection of this.connectionPool) {
      try {
        const { error } = await connection.client.from('products').select('id').limit(1);
        
        if (error) {
          connection.isHealthy = false;
          connection.errorCount++;
        } else {
          connection.isHealthy = true;
          connection.errorCount = 0;
          healthyCount++;
        }
      } catch (error) {
        connection.isHealthy = false;
        connection.errorCount++;
      }
    }
    
    console.log(`🏥 Health check: ${healthyCount}/${this.connectionPool.length} connections healthy`);
    return { healthy: healthyCount, total: this.connectionPool.length };
  }

  /**
   * Update response time metrics
   */
  private updateResponseTime(responseTime: number): void {
    if (this.metrics.averageResponseTime === 0) {
      this.metrics.averageResponseTime = responseTime;
    } else {
      // Simple moving average
      this.metrics.averageResponseTime = (this.metrics.averageResponseTime + responseTime) / 2;
    }
  }

  /**
   * Get connection metrics
   */
  public getMetrics(): ConnectionMetrics {
    return { ...this.metrics };
  }

  /**
   * Get connection pool status
   */
  public getPoolStatus(): { total: number; healthy: number; unhealthy: number } {
    const healthy = this.connectionPool.filter(conn => conn.isHealthy).length;
    const unhealthy = this.connectionPool.length - healthy;
    
    return {
      total: this.connectionPool.length,
      healthy,
      unhealthy
    };
  }

  /**
   * Reset connection pool
   */
  public async resetPool(): Promise<void> {
    console.log('🔄 Resetting connection pool...');
    
    this.connectionPool = [];
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      failedConnections: 0,
      averageResponseTime: 0
    };
    
    await this.initialize();
  }

  /**
   * Close all connections
   */
  public async close(): Promise<void> {
    console.log('🔌 Closing all database connections...');
    
    // Supabase clients don't need explicit closing, but we can clear the pool
    this.connectionPool = [];
    this.isInitialized = false;
    
    console.log('✅ All database connections closed');
  }
}

export const databaseConnectionService = DatabaseConnectionService.getInstance();

