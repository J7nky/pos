/**
 * Entity utility functions for working with the unified entities table
 * These utilities help detect entity types and work with entity_id fields
 */

import { getDB } from '../lib/db';
import type { Entity } from '../types/accounting';

export type EntityType = 'customer' | 'supplier' | 'employee' | 'cash' | 'internal';

/**
 * Get entity type from entity_id by looking up the entity in the entities table
 * 
 * @param entityId - The entity_id from a transaction or other record
 * @returns The entity type ('customer', 'supplier', 'employee', 'cash', 'internal') or null if not found
 * 
 * @example
 * ```typescript
 * const entityType = await getEntityTypeFromId(transaction.entity_id);
 * if (entityType === 'customer') {
 *   // Handle customer-specific logic
 * }
 * ```
 */
export async function getEntityTypeFromId(entityId: string | null | undefined): Promise<EntityType | null> {
  if (!entityId) {
    return null;
  }

  try {
    const entity = await getDB().entities.get(entityId);
    if (!entity || entity._deleted) {
      return null;
    }
    return entity.entity_type as EntityType;
  } catch (error) {
    console.error(`Failed to get entity type for entity_id ${entityId}:`, error);
    return null;
  }
}

/**
 * Get entity type from entity_id synchronously (requires entity to be pre-loaded)
 * Use this when you already have the entity object to avoid an extra database lookup
 * 
 * @param entity - The entity object from the entities table
 * @returns The entity type or null if entity is invalid
 * 
 * @example
 * ```typescript
 * const entity = await getDB().entities.get(entityId);
 * const entityType = getEntityTypeFromEntity(entity);
 * ```
 */
export function getEntityTypeFromEntity(entity: Entity | null | undefined): EntityType | null {
  if (!entity || entity._deleted) {
    return null;
  }
  return entity.entity_type as EntityType;
}

/**
 * Get entity type from transaction's entity_id
 * This is a convenience wrapper that handles the common case of getting entity type from a transaction
 * 
 * @param transaction - Transaction object with entity_id field
 * @returns The entity type or null if not found
 * 
 * @example
 * ```typescript
 * const entityType = await getEntityTypeFromTransaction(transaction);
 * if (entityType === 'supplier') {
 *   // Handle supplier transaction
 * }
 * ```
 */
export async function getEntityTypeFromTransaction(
  transaction: { entity_id?: string | null }
): Promise<EntityType | null> {
  return getEntityTypeFromId(transaction.entity_id);
}

/**
 * Check if an entity_id represents a specific entity type
 * 
 * @param entityId - The entity_id to check
 * @param expectedType - The expected entity type
 * @returns True if the entity_id matches the expected type, false otherwise
 * 
 * @example
 * ```typescript
 * const isCustomer = await isEntityType(transaction.entity_id, 'customer');
 * ```
 */
export async function isEntityType(
  entityId: string | null | undefined,
  expectedType: EntityType
): Promise<boolean> {
  const actualType = await getEntityTypeFromId(entityId);
  return actualType === expectedType;
}

/**
 * Get entity type from transaction with fallback to legacy fields
 * This function supports both the new entity_id field and legacy customer_id/supplier_id/employee_id fields
 * 
 * @param transaction - Transaction object that may have entity_id or legacy fields
 * @returns The entity type or null if not found
 * 
 * @deprecated Use getEntityTypeFromTransaction instead once migration is complete
 */
export async function getEntityTypeFromTransactionWithLegacy(
  transaction: {
    entity_id?: string | null;
    customer_id?: string | null;
    supplier_id?: string | null;
    employee_id?: string | null;
  }
): Promise<EntityType | null> {
  // Prefer entity_id (new unified field)
  if (transaction.entity_id) {
    return getEntityTypeFromId(transaction.entity_id);
  }

  // Fallback to legacy fields for backward compatibility
  if (transaction.customer_id) {
    return getEntityTypeFromId(transaction.customer_id);
  }
  if (transaction.supplier_id) {
    return getEntityTypeFromId(transaction.supplier_id);
  }
  if (transaction.employee_id) {
    return getEntityTypeFromId(transaction.employee_id);
  }

  return null;
}

