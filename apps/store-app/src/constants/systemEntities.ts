// System Entities - Predefined entities for accounting operations
// Based on ACCOUNTING_FOUNDATION_MIGRATION_PLAN.md

import { Entity } from '../types/accounting';

/**
 * System entity IDs - These are consistent across all stores
 */
export const SYSTEM_ENTITY_IDS = {
  // Customer entities
  CASH_CUSTOMER: 'entity-cash-customer',
  
  // Supplier entities  
  CASH_SUPPLIER: 'entity-cash-supplier',
  
  // Employee entities
  SALARIES: 'entity-salaries',
  
  // Internal entities
  INTERNAL: 'entity-internal',
  OWNER: 'entity-owner',
  
  // Financial entities
  BANK: 'entity-bank',
  TAX_AUTHORITY: 'entity-tax-authority',
  UTILITIES: 'entity-utilities',
  RENT: 'entity-rent'
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
 * Get system entity by type
 */
export function getSystemEntityId(entityType: 'cash' | 'internal' | 'bank' | 'owner'): string {
  switch (entityType) {
    case 'cash':
      return SYSTEM_ENTITY_IDS.CASH_CUSTOMER;
    case 'internal':
      return SYSTEM_ENTITY_IDS.INTERNAL;
    case 'bank':
      return SYSTEM_ENTITY_IDS.BANK;
    case 'owner':
      return SYSTEM_ENTITY_IDS.OWNER;
    default:
      throw new Error(`Unknown system entity type: ${entityType}`);
  }
}

/**
 * Check if an entity ID is a system entity
 */
export function isSystemEntity(entityId: string): boolean {
  return Object.values(SYSTEM_ENTITY_IDS).includes(entityId as any);
}

/**
 * Default entity for cash transactions when no specific customer is provided
 */
export const DEFAULT_CASH_ENTITY_ID = SYSTEM_ENTITY_IDS.CASH_CUSTOMER;
