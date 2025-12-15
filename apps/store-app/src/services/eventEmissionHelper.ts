/**
 * Event Emission Helper
 * 
 * Helper utilities to simplify event emission after CRUD operations
 * Use these helpers in OfflineDataContext to emit events for config tables
 */

import { eventEmissionService } from './eventEmissionService';

export interface EmitEventOptions {
  storeId: string;
  branchId: string | null;
  userId?: string;
  operation?: 'create' | 'update' | 'delete';
  metadata?: Record<string, any>;
}

/**
 * Safely emit an event, handling missing branchId gracefully
 * Returns true if event was emitted, false if skipped (missing branchId)
 */
async function safeEmitEvent(
  emitFn: () => Promise<void>,
  branchId: string | null,
  context: string
): Promise<boolean> {
  if (!branchId) {
    console.warn(`[EventEmission] Skipping ${context} - no branchId available`);
    return false;
  }

  try {
    await emitFn();
    console.log(`[EventEmission] Successfully emitted ${context}`);
    return true;
  } catch (error) {
    // Event emission failures should not block the main operation
    console.error(`[EventEmission] Failed to emit ${context}:`, error);
    return false;
  }
}

// ============================================================================
// Single Record Event Emitters
// ============================================================================

/**
 * Emit product updated event
 */
export async function emitProductEvent(
  productId: string,
  options: EmitEventOptions
): Promise<boolean> {
  return safeEmitEvent(
    () => eventEmissionService.emitProductUpdated(
      options.storeId,
      options.branchId!,
      productId,
      options.userId,
      { 
        operation: options.operation,
        ...options.metadata 
      }
    ),
    options.branchId,
    `product ${options.operation || 'update'} (${productId})`
  );
}

/**
 * Emit entity (customer/supplier) updated event
 */
export async function emitEntityEvent(
  entityId: string,
  options: EmitEventOptions
): Promise<boolean> {
  return safeEmitEvent(
    () => eventEmissionService.emitEntityUpdated(
      options.storeId,
      options.branchId!,
      entityId,
      options.userId,
      options.metadata
    ),
    options.branchId,
    `entity ${options.operation || 'update'} (${entityId})`
  );
}

/**
 * Emit user updated event
 */
export async function emitUserEvent(
  targetUserId: string,
  options: EmitEventOptions
): Promise<boolean> {
  return safeEmitEvent(
    () => eventEmissionService.emitUserUpdated(
      options.storeId,
      options.branchId!,
      targetUserId,
      options.userId,
      { 
        operation: options.operation,
        ...options.metadata 
      }
    ),
    options.branchId,
    `user ${options.operation || 'update'} (${targetUserId})`
  );
}

/**
 * Emit store updated event
 */
export async function emitStoreEvent(
  options: EmitEventOptions
): Promise<boolean> {
  return safeEmitEvent(
    () => eventEmissionService.emitStoreUpdated(
      options.storeId,
      options.branchId!,
      options.userId,
      options.metadata
    ),
    options.branchId,
    'store update'
  );
}

/**
 * Emit branch updated event
 */
export async function emitBranchEvent(
  options: EmitEventOptions
): Promise<boolean> {
  return safeEmitEvent(
    () => eventEmissionService.emitBranchUpdated(
      options.storeId,
      options.branchId!,
      options.userId,
      options.metadata
    ),
    options.branchId,
    'branch update'
  );
}

/**
 * Emit reminder updated event
 */
export async function emitReminderEvent(
  reminderId: string,
  options: EmitEventOptions
): Promise<boolean> {
  return safeEmitEvent(
    () => eventEmissionService.emitReminderUpdated(
      options.storeId,
      options.branchId!,
      reminderId,
      options.userId,
      { operation: options.operation }
    ),
    options.branchId,
    `reminder ${options.operation || 'update'} (${reminderId})`
  );
}

/**
 * Emit chart of account updated event
 */
export async function emitChartOfAccountEvent(
  accountId: string,
  options: EmitEventOptions
): Promise<boolean> {
  return safeEmitEvent(
    () => eventEmissionService.emitChartOfAccountUpdated(
      options.storeId,
      options.branchId!,
      accountId,
      options.userId,
      { operation: options.operation }
    ),
    options.branchId,
    `chart_of_account ${options.operation || 'update'} (${accountId})`
  );
}

// ============================================================================
// Bulk Event Emitters
// ============================================================================

/**
 * Emit products bulk updated event
 * Use this when creating/updating/deleting multiple products at once
 */
export async function emitProductsBulkEvent(
  productIds: string[],
  options: EmitEventOptions & {
    operationType?: 'import' | 'price_update' | 'category_change' | 'bulk_edit';
  }
): Promise<boolean> {
  if (productIds.length === 0) {
    console.warn('[EventEmission] Skipping products bulk event - empty array');
    return false;
  }

  // If only 1 product, use single event
  if (productIds.length === 1) {
    return emitProductEvent(productIds[0], options);
  }

  return safeEmitEvent(
    () => eventEmissionService.emitProductsBulkUpdated(
      options.storeId,
      options.branchId!,
      productIds,
      options.userId,
      {
        operation: options.operation,
        operation_type: options.operationType,
        count: productIds.length,
        ...options.metadata,
      }
    ),
    options.branchId,
    `products bulk ${options.operation || 'update'} (${productIds.length} items)`
  );
}

/**
 * Emit entities bulk updated event
 * Use this when creating/updating/deleting multiple entities at once
 */
export async function emitEntitiesBulkEvent(
  entityIds: string[],
  options: EmitEventOptions & {
    operationType?: 'import' | 'bulk_edit';
  }
): Promise<boolean> {
  if (entityIds.length === 0) {
    console.warn('[EventEmission] Skipping entities bulk event - empty array');
    return false;
  }

  // If only 1 entity, use single event
  if (entityIds.length === 1) {
    return emitEntityEvent(entityIds[0], options);
  }

  return safeEmitEvent(
    () => eventEmissionService.emitEntitiesBulkUpdated(
      options.storeId,
      options.branchId!,
      entityIds,
      options.userId,
      {
        operation: options.operation,
        operation_type: options.operationType,
        count: entityIds.length,
        ...options.metadata,
      }
    ),
    options.branchId,
    `entities bulk ${options.operation || 'update'} (${entityIds.length} items)`
  );
}

/**
 * Emit users bulk updated event
 * Use this when creating/updating/deleting multiple users at once
 */
export async function emitUsersBulkEvent(
  userIds: string[],
  options: EmitEventOptions & {
    operationType?: 'import' | 'bulk_edit';
  }
): Promise<boolean> {
  if (userIds.length === 0) {
    console.warn('[EventEmission] Skipping users bulk event - empty array');
    return false;
  }

  // If only 1 user, use single event
  if (userIds.length === 1) {
    return emitUserEvent(userIds[0], options);
  }

  return safeEmitEvent(
    () => eventEmissionService.emitUsersBulkUpdated(
      options.storeId,
      options.branchId!,
      userIds,
      options.userId,
      {
        operation: options.operation,
        operation_type: options.operationType,
        count: userIds.length,
        ...options.metadata,
      }
    ),
    options.branchId,
    `users bulk ${options.operation || 'update'} (${userIds.length} items)`
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get fields that changed between old and new objects
 * Useful for metadata in update events
 */
export function getChangedFields(
  oldObj: Record<string, any>,
  newObj: Record<string, any>
): string[] {
  const changed: string[] = [];
  
  for (const key in newObj) {
    if (oldObj[key] !== newObj[key]) {
      changed.push(key);
    }
  }
  
  return changed;
}

/**
 * Build event emission options from common context
 * Helper to reduce boilerplate in OfflineDataContext
 */
export function buildEventOptions(
  storeId: string,
  branchId: string | null,
  userId?: string,
  operation?: 'create' | 'update' | 'delete',
  metadata?: Record<string, any>
): EmitEventOptions {
  return {
    storeId,
    branchId,
    userId,
    operation,
    metadata,
  };
}

