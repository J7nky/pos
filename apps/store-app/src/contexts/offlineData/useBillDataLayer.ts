/**
 * Bill/sales domain layer for OfflineDataContext (§1.3).
 * Owns bills, billLineItems, sales state + hydrate + getBills, getBillDetails, createBillAuditLog, getBillsByIds, getBillLineItemsByInventoryItemIds.
 * createBill, updateBill, deleteBill, addSale, updateSale, deleteSale remain in context (complex cross-domain deps).
 */

import { useState, useCallback } from 'react';
import { createId } from '../../lib/db';
import { getDB } from '../../lib/db';
import { getLocalDateString } from '../../utils/dateUtils';
import { normalizeNameForComparison } from '../../utils/nameNormalization';
import { BillLineItemTransforms } from '../../types';
import type { BillLineItem } from '../../types';
import type { BillDataLayerAdapter, BillDataLayerResult } from './types';

export function useBillDataLayer(adapter: BillDataLayerAdapter): BillDataLayerResult {
  const { storeId, currentBranchId, refreshData, updateUnsyncedCount, debouncedSync } = adapter;
  const [bills, setBills] = useState<any[]>([]);
  const [billLineItems, setBillLineItems] = useState<any[]>([]);
  const [sales, setSales] = useState<BillLineItem[]>([]);

  const hydrate = useCallback(
    async (billsData: any[], billLineItemsData: any[]): Promise<void> => {
      setBills(billsData);
      setBillLineItems(billLineItemsData);
      // unit_price is taken from persisted bill_line_items only — never re-derived from live inventory pricing (Feature 016 / T023).
      const transformedSaleItems: BillLineItem[] = billLineItemsData.map((item: any) =>
        BillLineItemTransforms.fromDbRow({
          id: item.id,
          store_id: item.store_id,
          inventory_item_id: item.inventory_item_id || null,
          product_id: item.product_id,
          quantity: item.quantity,
          weight: item.weight,
          unit_price: item.unit_price,
          received_value: item.received_value,
          notes: item.notes,
          created_at: item.created_at,
          bill_id: item.bill_id,
          line_total: item.line_total,
          line_order: item.line_order,
          updated_at: item.updated_at,
          branch_id: item.branch_id,
        })
      );
      setSales(transformedSaleItems);
    },
    []
  );

  const getBills = useCallback(
    async (filters?: any): Promise<any[]> => {
      if (!storeId) return [];

      let query = getDB()
        .bills.where('store_id')
        .equals(storeId)
        .filter((bill: any) => !bill._deleted || bill._deleted === undefined);

      if (filters) {
        if (filters.status) {
          query = query.and((bill: any) => bill.status === filters.status);
        }
        if (filters.supplier_id) {
          const billIdsWithSupplier = await getDB().bill_line_items
            .where('supplier_id')
            .equals(filters.supplier_id)
            .primaryKeys();
          query = query.and((bill: any) => billIdsWithSupplier.includes(bill.id));
        }
        const dateFrom = filters.dateFrom || filters.date_from;
        const dateTo = filters.dateTo || filters.date_to;
        if (dateFrom) {
          query = query.and((bill: any) => {
            if (!bill.bill_date) return false;
            const billDateStr =
              typeof bill.bill_date === 'string'
                ? getLocalDateString(bill.bill_date)
                : getLocalDateString(new Date(bill.bill_date).toISOString());
            return billDateStr >= dateFrom;
          });
        }
        if (dateTo) {
          query = query.and((bill: any) => {
            if (!bill.bill_date) return false;
            const billDateStr =
              typeof bill.bill_date === 'string'
                ? getLocalDateString(bill.bill_date)
                : getLocalDateString(new Date(bill.bill_date).toISOString());
            return billDateStr <= dateTo;
          });
        }
        if (filters.paymentStatus) {
          query = query.and((bill: any) => bill.payment_status === filters.paymentStatus);
        }
      }

      let billsData = await query.toArray();

      if (filters?.searchTerm) {
        const normalizedSearchTerm = normalizeNameForComparison(filters.searchTerm);
        const customersMap = new Map<string, string>();
        const allCustomerEntities = await getDB().entities
          .where('[store_id+entity_type]')
          .equals([storeId, 'customer'])
          .filter((e: any) => !e._deleted)
          .toArray();
        allCustomerEntities.forEach((e: any) => customersMap.set(e.id, normalizeNameForComparison(e.name)));

        billsData = billsData.filter((bill: any) => {
          const billNumberLower = bill.bill_number?.toLowerCase() || '';
          const billNumberWithoutPrefix = billNumberLower.replace(/^bill-/, '');
          const billNumberMatch =
            normalizeNameForComparison(billNumberLower).includes(normalizedSearchTerm) ||
            normalizeNameForComparison(billNumberWithoutPrefix).includes(normalizedSearchTerm);
          const notesMatch = bill.notes ? normalizeNameForComparison(bill.notes).includes(normalizedSearchTerm) : false;
          const customerName = bill.entity_id ? customersMap.get(bill.entity_id) : '';
          const customerMatch = customerName ? customerName.includes(normalizedSearchTerm) : false;
          return billNumberMatch || notesMatch || customerMatch;
        });
      }

      const billsWithLineItems = await Promise.all(
        billsData.map(async (bill: any) => {
          const lineItems = await getDB().bill_line_items
            .where('bill_id')
            .equals(bill.id)
            .filter((item: any) => !item._deleted)
            .toArray();
          return { ...bill, line_items: lineItems };
        })
      );

      return billsWithLineItems;
    },
    [storeId]
  );

  const getBillDetails = useCallback(
    async (billId: string): Promise<any | null> => {
      if (!storeId) return null;

      const bill = await getDB().bills.get(billId);
      if (!bill || (bill as any)._deleted) return null;

      const lineItems = await getDB().bill_line_items
        .where('bill_id')
        .equals(billId)
        .filter((item: any) => !item._deleted)
        .toArray();

      const auditLogs = await getDB().bill_audit_logs
        .where('bill_id')
        .equals(billId)
        .filter((log: any) => !log._deleted)
        .toArray();

      const auditLogsWithUsers = await Promise.all(
        auditLogs.map(async (log: any) => {
          const user = await getDB().users.get(log.changed_by);
          return {
            ...log,
            users: user ? { name: (user as any).name, email: (user as any).email } : undefined,
          };
        })
      );

      return {
        ...bill,
        line_items: lineItems,
        bill_audit_logs: auditLogsWithUsers,
      };
    },
    [storeId]
  );

  const createBillAuditLog = useCallback(
    async (auditData: any): Promise<void> => {
      if (!storeId) throw new Error('No store ID available');

      const auditLog = {
        id: createId(),
        store_id: storeId,
        created_at: new Date().toISOString(),
        _synced: false,
        ...auditData,
      };

      await getDB().bill_audit_logs.add(auditLog);
      await refreshData();
      await updateUnsyncedCount();
      debouncedSync();
    },
    [storeId, refreshData, updateUnsyncedCount, debouncedSync]
  );

  const getBillsByIds = useCallback(async (ids: string[]): Promise<any[]> => {
    try {
      if (ids.length === 0) return [];
      const result = await getDB().bills.where('id').anyOf(ids).toArray();
      return result || [];
    } catch (error) {
      console.error('Error getting bills by ids:', error);
      return [];
    }
  }, []);

  const getBillLineItemsByInventoryItemIds = useCallback(
    async (inventoryItemIds: string[]): Promise<any[]> => {
      try {
        if (inventoryItemIds.length === 0) return [];
        const items = await getDB()
          .bill_line_items.where('inventory_item_id')
          .anyOf(inventoryItemIds)
          .toArray();
        return items || [];
      } catch (error) {
        console.error('Error getting bill line items by inventory item ids:', error);
        return [];
      }
    },
    []
  );

  return {
    bills,
    billLineItems,
    sales,
    hydrate,
    getBills,
    getBillDetails,
    createBillAuditLog,
    getBillsByIds,
    getBillLineItemsByInventoryItemIds,
  };
}
