/**
 * ERROR HANDLER UTILITY
 * 
 * Provides consistent error handling across the application.
 * Eliminates ~500 lines of repetitive try-catch boilerplate code.
 * 
 * Benefits:
 * - Consistent error format across all services
 * - Automatic error logging
 * - Type-safe results
 * - Cleaner business logic
 * 
 * Usage:
 * ```typescript
 * public async myOperation(id: string) {
 *   return withErrorHandler(
 *     async () => {
 *       // business logic only
 *       return result;
 *     },
 *     'my_operation',
 *     { entityId: id }
 *   );
 * }
 * ```
 */

import { comprehensiveLoggingService } from '../services/comprehensiveLoggingService';

export interface OperationResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
  errorDetails?: any;
}

export interface ErrorContext {
  [key: string]: any;
}

/**
 * Wraps an async operation with consistent error handling
 * 
 * @param operation - The async function to execute
 * @param contextName - Name for logging (e.g., 'create_customer', 'get_balance')
 * @param context - Additional context for error logging
 * @returns Promise with success/error result
 */
export async function withErrorHandler<T>(
  operation: () => Promise<T>,
  contextName: string,
  context?: ErrorContext
): Promise<OperationResult<T>> {
  try {
    const data = await operation();
    return { 
      success: true, 
      data 
    };
  } catch (error) {
    // Log error with context
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    comprehensiveLoggingService.logError(
      contextName,
      errorMessage,
      {
        ...context,
        stack: error instanceof Error ? error.stack : undefined
      }
    );
    
    return { 
      success: false, 
      error: errorMessage,
      errorDetails: error
    };
  }
}

/**
 * Wraps an async operation that returns a result object
 * Useful for operations that already return { success, ... }
 * 
 * @param operation - The async function to execute
 * @param contextName - Name for logging
 * @param context - Additional context for error logging
 * @returns Promise with the operation result or error result
 */
export async function withErrorHandlerResult<T extends { success: boolean }>(
  operation: () => Promise<T>,
  contextName: string,
  context?: ErrorContext
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    // Log error with context
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    comprehensiveLoggingService.logError(
      contextName,
      errorMessage,
      {
        ...context,
        stack: error instanceof Error ? error.stack : undefined
      }
    );
    
    return { 
      success: false, 
      error: errorMessage 
    } as T;
  }
}

/**
 * Wraps a synchronous operation with error handling
 * 
 * @param operation - The function to execute
 * @param contextName - Name for logging
 * @param context - Additional context for error logging
 * @returns Result with success/error
 */
export function withSyncErrorHandler<T>(
  operation: () => T,
  contextName: string,
  context?: ErrorContext
): OperationResult<T> {
  try {
    const data = operation();
    return { 
      success: true, 
      data 
    };
  } catch (error) {
    // Log error with context
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    comprehensiveLoggingService.logError(
      contextName,
      errorMessage,
      {
        ...context,
        stack: error instanceof Error ? error.stack : undefined
      }
    );
    
    return { 
      success: false, 
      error: errorMessage,
      errorDetails: error
    };
  }
}

/**
 * Creates an error result object
 * Useful for validation errors that don't throw
 */
export function createErrorResult<T = void>(
  error: string,
  contextName?: string,
  context?: ErrorContext
): OperationResult<T> {
  if (contextName) {
    comprehensiveLoggingService.logError(
      contextName,
      error,
      context
    );
  }
  
  return {
    success: false,
    error
  };
}

/**
 * Creates a success result object
 */
export function createSuccessResult<T>(data: T): OperationResult<T> {
  return {
    success: true,
    data
  };
}

/**
 * Type guard to check if operation was successful
 */
export function isSuccess<T>(result: OperationResult<T>): result is OperationResult<T> & { success: true; data: T } {
  return result.success === true && result.data !== undefined;
}

/**
 * Type guard to check if operation failed
 */
export function isError<T>(result: OperationResult<T>): result is OperationResult<T> & { success: false; error: string } {
  return result.success === false;
}

/**
 * Unwrap result or throw error
 * Useful when you want to convert back to exception-based flow
 */
export function unwrapResult<T>(result: OperationResult<T>): T {
  if (isSuccess(result)) {
    return result.data;
  }
  throw new Error(result.error || 'Operation failed');
}

/**
 * Chain multiple operations with error handling
 * Stops at first error
 */
export async function chainOperations<T1, T2>(
  op1: () => Promise<T1>,
  op2: (result1: T1) => Promise<T2>,
  contextName: string,
  context?: ErrorContext
): Promise<OperationResult<T2>> {
  const result1 = await withErrorHandler(op1, `${contextName}_step1`, context);
  
  if (!isSuccess(result1)) {
    return { success: false, error: result1.error };
  }
  
  return withErrorHandler(
    () => op2(result1.data),
    `${contextName}_step2`,
    context
  );
}

