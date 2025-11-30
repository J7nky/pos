// System Entities - Predefined entities for accounting operations
// Based on ACCOUNTING_FOUNDATION_MIGRATION_PLAN.md

import { Entity } from '../types/accounting';

/**
 * System entity codes - These identify system entities across all stores
 * Use these codes to query entities by entity_code column
 */
export const SYSTEM_ENTITY_CODES = {
  // Customer entities
  CASH_CUSTOMER: 'CASH-CUST',
  
  // Supplier entities  
  CASH_SUPPLIER: 'CASH-SUPP',
  
  // Employee entities
  SALARIES: 'SALARIES',
  
  // Internal entities
  INTERNAL: 'INTERNAL',
  OWNER: 'OWNER',
  
  // Financial entities
  BANK: 'BANK',
  TAX_AUTHORITY: 'TAX',
  UTILITIES: 'UTILITIES',
  RENT: 'RENT'
} as const;

/**
 * Create system entities for a store
 * These entities are required for proper accounting operations
 */
export function createSystemEntities(storeId: string): Omit<Entity, 'id' | 'created_at' | 'updated_at' | '_synced'>[] {
  return [
    {
      store_id: storeId,
      branch_id: null,
      entity_type: 'cash',
      entity_code: 'CASH',
      name: 'Cash Customer',
      phone: null,
      lb_balance: 0,
      usd_balance: 0,
      is_system_entity: true,
      is_active: true,
      customer_data: {
        lb_max_balance: 0, // Cash customers have no credit limit
        credit_limit: 0,
        payment_terms: 'immediate'
      },
      supplier_data: null
    },
    {
      store_id: storeId,
      branch_id: null,
      entity_type: 'internal',
      entity_code: 'INTERNAL',
      name: 'Internal Operations',
      phone: null,
      lb_balance: 0,
      usd_balance: 0,
      is_system_entity: true,
      is_active: true,
      customer_data: null,
      supplier_data: null
    },
    {
      store_id: storeId,
      branch_id: null,
      entity_type: 'cash',
      entity_code: 'BANK',
      name: 'Bank Account',
      phone: null,
      lb_balance: 0,
      usd_balance: 0,
      is_system_entity: true,
      is_active: true,
      customer_data: null,
      supplier_data: null
    },
    {
      store_id: storeId,
      branch_id: null,
      entity_type: 'internal',
      entity_code: 'OWNER',
      name: 'Owner Equity',
      phone: null,
      lb_balance: 0,
      usd_balance: 0,
      is_system_entity: true,
      is_active: true,
      customer_data: null,
      supplier_data: null
    }
  ];
}

/**
 * Get system entity code by type
 * Returns the entity_code to query the entities table
 */
export function getSystemEntityCode(entityType: 'cash' | 'internal' | 'bank' | 'owner'): string {
  switch (entityType) {
    case 'cash':
      return SYSTEM_ENTITY_CODES.CASH_CUSTOMER;
    case 'internal':
      return SYSTEM_ENTITY_CODES.INTERNAL;
    case 'bank':
      return SYSTEM_ENTITY_CODES.BANK;
    case 'owner':
      return SYSTEM_ENTITY_CODES.OWNER;
    default:
      throw new Error(`Unknown system entity type: ${entityType}`);
  }
}

/**
 * Check if an entity code represents a system entity
 */
export function isSystemEntityCode(entityCode: string): boolean {
  return Object.values(SYSTEM_ENTITY_CODES).includes(entityCode as any);
}

/**
 * Default entity code for cash transactions when no specific customer is provided
 */
export const DEFAULT_CASH_ENTITY_CODE = SYSTEM_ENTITY_CODES.CASH_CUSTOMER;

/**
 * Helper to get system entity by code and store
 * @param storeId - The store ID
 * @param entityCode - The entity code (e.g., 'CASH-CUST')
 * @returns Promise<Entity | undefined>
 */
export async function getSystemEntity(db: any, storeId: string, entityCode: string) {
  return db.entities
    .where('[store_id+entity_code]')
    .equals([storeId, entityCode])
    .first();
}
