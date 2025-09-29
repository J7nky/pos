
import { db } from '../lib/db';
import { createId } from '../lib/db';

export interface MissedProductData {
  itemId: string;
  productName: string;
  systemQuantity: number;
  physicalQuantity: number;
  unit: string;
  isVerified: boolean;
  notes?: string;
}

export interface InventoryVerificationData {
  verifiedItems: MissedProductData[];
}

export interface MissedProductWithDetails {
  id: string;
  session_id: string;
  inventory_item_id: string;
  system_quantity: number;
  physical_quantity: number;
  variance: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Joined data
  product_name: string;
  product_category: string;
  unit: string;
  session_opened_by: string;
  session_opened_at: string;
  session_closed_at?: string;
}

export interface MissedProductsReport {
  totalDiscrepancies: number;
  totalVariance: number;
  averageVariance: number;
  mostMissedProducts: Array<{
    product_name: string;
    discrepancy_count: number;
    total_variance: number;
  }>;
  sessions: Array<{
    session_id: string;
    opened_at: string;
    closed_at?: string;
    opened_by: string;
    discrepancy_count: number;
    total_variance: number;
  }>;
}

export class MissedProductsService {
  private static instance: MissedProductsService;
  private operationLocks: Map<string, Promise<any>> = new Map();

  private constructor() {}

  public static getInstance(): MissedProductsService {
    if (!MissedProductsService.instance) {
      MissedProductsService.instance = new MissedProductsService();
    }
    return MissedProductsService.instance;
  }

  /**
   * Record missed products from inventory verification
   */
  public async recordMissedProducts(
    sessionId: string,
    storeId: string,
    verificationData: InventoryVerificationData
  ): Promise<{
    success: boolean;
    recordedCount: number;
    error?: string;
  }> {
    try {
      // Filter only items with discrepancies
      const missedItems = verificationData.verifiedItems.filter(item => 
        item.isVerified && item.physicalQuantity !== item.systemQuantity
      );

      if (missedItems.length === 0) {
    console.log(verificationData,'verificationData 2')

        return {
          success: true,
          recordedCount: 0
        };
      }

      // Get inventory items to get the unit
      const inventoryItems = await db.inventory_items
        .where('store_id')
        .equals(storeId)
        .toArray();

      const missedProducts = missedItems.map(item => {
        const inventoryItem = inventoryItems.find(ii => ii.id === item.itemId);
        return {
          id: createId(),
          store_id: storeId,
          session_id: sessionId,
          inventory_item_id: item.itemId,
          system_quantity: item.systemQuantity,
          physical_quantity: item.physicalQuantity,
          variance: item.physicalQuantity - item.systemQuantity,
          notes: item.notes || undefined,
          product_name: item.productName, // Add product_name field
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          _synced: false
        };
      });

      await db.missed_products.bulkAdd(missedProducts);

      console.log(`📊 Recorded ${missedProducts.length} missed products for session ${sessionId}`);

      return {
        success: true,
        recordedCount: missedProducts.length
      };

    } catch (error) {
      console.error('Error recording missed products:', error);
      return {
        success: false,
        recordedCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Get missed products for a specific session with full details
   * Can use context data for better performance when available
   */
  public async getSessionMissedProducts(
    sessionId: string, 
    contextData?: {
      missedProducts?: any[];
      inventoryItems?: any[];
      products?: any[];
      sessions?: any[];
    }
  ): Promise<MissedProductWithDetails[]> {
    try {
      // Use context data if available for better performance
      let missedProducts: any[];
      let inventoryItems: any[];
      let products: any[];
      let session: any;

      if (contextData?.missedProducts) {
        // Use context data - much faster
        missedProducts = contextData.missedProducts.filter(mp => mp.session_id === sessionId);
        inventoryItems = contextData.inventoryItems || [];
        products = contextData.products || [];
        session = contextData.sessions?.find(s => s.id === sessionId);
      } else {
        // Fallback to database queries
        missedProducts = await db.missed_products
          .where('session_id')
          .equals(sessionId)
          .toArray();

        if (missedProducts.length === 0) {
          return [];
        }

        // Get inventory items and products for details
        const inventoryItemIds = missedProducts.map(mp => mp.inventory_item_id);
        inventoryItems = await db.inventory_items
          .where('id')
          .anyOf(inventoryItemIds)
          .toArray();

        const productIds = inventoryItems.map(ii => ii.product_id);
        products = await db.products
          .where('id')
          .anyOf(productIds)
          .toArray();

        // Get session details
        session = await db.cash_drawer_sessions.get(sessionId);
      }

      if (missedProducts.length === 0) {
        return [];
      }

      if (!session) {
        throw new Error('Session not found');
      }

      // Combine data
      return missedProducts.map(mp => {
        const inventoryItem = inventoryItems.find(ii => ii.id === mp.inventory_item_id);
        const product = products.find(p => p.id === inventoryItem?.product_id);

        return {
          id: mp.id,
          session_id: mp.session_id,
          inventory_item_id: mp.inventory_item_id,
          system_quantity: mp.system_quantity,
          physical_quantity: mp.physical_quantity,
          variance: mp.variance,
          notes: mp.notes,
          created_at: mp.created_at,
          updated_at: mp.updated_at,
          product_name: product?.name || 'Unknown Product',
          product_category: product?.category || 'Unknown',
          unit: inventoryItem?.unit || 'Unknown',
          session_opened_by: session.opened_by,
          session_opened_at: session.opened_at,
          session_closed_at: session.closed_at
        };
      });

    } catch (error) {
      console.error('Error getting session missed products:', error);
      return [];
    }
  }

  /**
   * Get missed products report for a store
   * Can use context data for better performance when available
   */
  public async getMissedProductsReport(
    storeId: string,
    startDate?: string,
    endDate?: string,
    contextData?: {
      missedProducts?: any[];
      inventoryItems?: any[];
      products?: any[];
    }
  ): Promise<MissedProductsReport> {
    try {
      let missedProducts: any[];
      let inventoryItems: any[];
      let products: any[];

      if (contextData?.missedProducts) {
        // Use context data - much faster
        missedProducts = contextData.missedProducts.filter(mp => mp.store_id === storeId);
        inventoryItems = contextData.inventoryItems || [];
        products = contextData.products || [];
      } else {
        // Fallback to database queries
        missedProducts = await db.missed_products
          .where('store_id')
          .equals(storeId)
          .toArray();

        // Get inventory items and products for details
        const inventoryItemIds = missedProducts.map(mp => mp.inventory_item_id);
        inventoryItems = await db.inventory_items
          .where('id')
          .anyOf(inventoryItemIds)
          .toArray();

        const productIds = inventoryItems.map(ii => ii.product_id);
        products = await db.products
          .where('id')
          .anyOf(productIds)
          .toArray();
      }

      // Filter by date range if provided
      if (startDate || endDate) {
        const sessions = await db.cash_drawer_sessions
          .where('store_id')
          .equals(storeId)
          .toArray();

        const filteredSessionIds = sessions
          .filter(session => {
            const sessionDate = new Date(session.opened_at);
            const start = startDate ? new Date(startDate) : new Date(0);
            const end = endDate ? new Date(endDate) : new Date();
            return sessionDate >= start && sessionDate <= end;
          })
          .map(session => session.id);

        missedProducts = missedProducts.filter(mp => 
          filteredSessionIds.includes(mp.session_id)
        );
      }

      if (missedProducts.length === 0) {
        return {
          totalDiscrepancies: 0,
          totalVariance: 0,
          averageVariance: 0,
          mostMissedProducts: [],
          sessions: []
        };
      }

      // Get session details
      const sessionIds = [...new Set(missedProducts.map(mp => mp.session_id))];
      const sessions = await db.cash_drawer_sessions
        .where('id')
        .anyOf(sessionIds)
        .toArray();

      // Calculate totals
      const totalDiscrepancies = missedProducts.length;
      const totalVariance = missedProducts.reduce((sum, mp) => sum + Math.abs(mp.variance), 0);
      const averageVariance = totalVariance / totalDiscrepancies;

      // Group by product
      const productGroups = new Map<string, { count: number; variance: number; name: string }>();
      missedProducts.forEach(mp => {
        const inventoryItem = inventoryItems.find(ii => ii.id === mp.inventory_item_id);
        const product = products.find(p => p.id === inventoryItem?.product_id);
        const productName = product?.name || 'Unknown Product';
        
        if (productGroups.has(productName)) {
          const existing = productGroups.get(productName)!;
          existing.count += 1;
          existing.variance += Math.abs(mp.variance);
        } else {
          productGroups.set(productName, {
            count: 1,
            variance: Math.abs(mp.variance),
            name: productName
          });
        }
      });

      const mostMissedProducts = Array.from(productGroups.values())
        .map(item => ({
          product_name: item.name,
          discrepancy_count: item.count,
          total_variance: item.variance
        }))
        .sort((a, b) => b.discrepancy_count - a.discrepancy_count)
        .slice(0, 10);

      // Group by session
      const sessionGroups = new Map<string, { count: number; variance: number; session: any }>();
      missedProducts.forEach(mp => {
        const session = sessions.find(s => s.id === mp.session_id);
        if (session) {
          if (sessionGroups.has(mp.session_id)) {
            const existing = sessionGroups.get(mp.session_id)!;
            existing.count += 1;
            existing.variance += Math.abs(mp.variance);
          } else {
            sessionGroups.set(mp.session_id, {
              count: 1,
              variance: Math.abs(mp.variance),
              session
            });
          }
        }
      });

      const sessionReports = Array.from(sessionGroups.values())
        .map(group => ({
          session_id: group.session.id,
          opened_at: group.session.opened_at,
          closed_at: group.session.closed_at,
          opened_by: group.session.opened_by,
          discrepancy_count: group.count,
          total_variance: group.variance
        }))
        .sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());

      return {
        totalDiscrepancies,
        totalVariance,
        averageVariance,
        mostMissedProducts,
        sessions: sessionReports
      };

    } catch (error) {
      console.error('Error generating missed products report:', error);
      return {
        totalDiscrepancies: 0,
        totalVariance: 0,
        averageVariance: 0,
        mostMissedProducts: [],
        sessions: []
      };
    }
  }

  /**
   * Get missed products by product ID for trend analysis
   */
  public async getProductMissedHistory(
    productId: string,
    storeId: string,
    days: number = 30
  ): Promise<Array<{
    date: string;
    discrepancy_count: number;
    total_variance: number;
    sessions: string[];
  }>> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      // Get inventory items for this product
      const inventoryItems = await db.inventory_items
        .where('store_id')
        .equals(storeId)
        .filter(ii => ii.product_id === productId)
        .toArray();

      if (inventoryItems.length === 0) {
        return [];
      }

      const inventoryItemIds = inventoryItems.map(ii => ii.id);

      // Get missed products for these inventory items
      const missedProducts = await db.missed_products
        .where('inventory_item_id')
        .anyOf(inventoryItemIds)
        .filter(mp => new Date(mp.created_at) >= cutoffDate)
        .toArray();

      // Get sessions for these missed products
      const sessionIds = [...new Set(missedProducts.map(mp => mp.session_id))];
      const sessions = await db.cash_drawer_sessions
        .where('id')
        .anyOf(sessionIds)
        .toArray();

      // Group by date
      const dateGroups = new Map<string, {
        discrepancy_count: number;
        total_variance: number;
        sessions: Set<string>;
      }>();

      missedProducts.forEach(mp => {
        const session = sessions.find(s => s.id === mp.session_id);
        if (session) {
          const date = new Date(session.opened_at).toISOString().split('T')[0];
          
          if (dateGroups.has(date)) {
            const existing = dateGroups.get(date)!;
            existing.discrepancy_count += 1;
            existing.total_variance += Math.abs(mp.variance);
            existing.sessions.add(mp.session_id);
          } else {
            dateGroups.set(date, {
              discrepancy_count: 1,
              total_variance: Math.abs(mp.variance),
              sessions: new Set([mp.session_id])
            });
          }
        }
      });

      return Array.from(dateGroups.entries())
        .map(([date, data]) => ({
          date,
          discrepancy_count: data.discrepancy_count,
          total_variance: data.total_variance,
          sessions: Array.from(data.sessions)
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    } catch (error) {
      console.error('Error getting product missed history:', error);
      return [];
    }
  }

  /**
   * Get all missed products with details (Date, Product Name, Variance Number, Employee Name, note, inventory ID)
   * 
   * @param storeId - The store ID to get missed products for
   * @param startDate - Optional start date filter (YYYY-MM-DD format)
   * @param endDate - Optional end date filter (YYYY-MM-DD format)
   * @returns Array of missed products with the specified fields
   * 
   * @example
   * // Get all missed products for a store
   * const missedProducts = await missedProductsService.getAllMissedProducts('store-123');
   * 
   * // Get missed products for a specific date range
   * const missedProducts = await missedProductsService.getAllMissedProducts(
   *   'store-123', 
   *   '2024-01-01', 
   *   '2024-01-31'
   * );
   */
  public async getAllMissedProducts(
    storeId: string,
    startDate?: string,
    endDate?: string
  ): Promise<Array<{
    date: string;
    productName: string;
    varianceNumber: number;
    employeeId: string;
    note?: string;
    inventoryId: string;
  }>> {
    try {
      // Get all missed products for the store
      let missedProducts = await db.missed_products
        .where('store_id')
        .equals(storeId)
        .toArray();

      if (missedProducts.length === 0) {
        return [];
      }

      // Get session IDs to fetch session details
      const sessionIds = [...new Set(missedProducts.map(mp => mp.session_id))];
      const sessions = await db.cash_drawer_sessions
        .where('id')
        .anyOf(sessionIds)
        .toArray();

      // Filter by date range if provided
      if (startDate || endDate) {
        const filteredSessions = sessions.filter(session => {
          const sessionDate = new Date(session.opened_at);
          const start = startDate ? new Date(startDate) : new Date(0);
          const end = endDate ? new Date(endDate) : new Date();
          return sessionDate >= start && sessionDate <= end;
        });

        const filteredSessionIds = filteredSessions.map(s => s.id);
        missedProducts = missedProducts.filter(mp => 
          filteredSessionIds.includes(mp.session_id)
        );
      }

      // Map missed products to the required format
      return missedProducts.map(mp => {
        const session = sessions.find(s => s.id === mp.session_id);
        
        return {
          date: session ? new Date(session.opened_at).toISOString().split('T')[0] : 'Unknown Date',
          productName: mp.product_name || 'Unknown Product',
          varianceNumber: mp.variance,
          employeeId: session?.opened_by || 'Unknown Employee',
          note: mp.notes,
          inventoryId: mp.inventory_item_id
        };
      }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    } catch (error) {
      console.error('Error getting all missed products:', error);
      return [];
    }
  }

  /**
   * Delete missed products for a session (useful for cleanup)
   */
  public async deleteMissedProduct(itemId: string): Promise<boolean> {
    try {
      await db.missed_products
        .where('id')
        .equals(itemId)
        .delete();

      return true;

    } catch (error) {
      console.error('Error deleting missed products:', error);
      return false;
    }
  }
  public async deleteSessionMissedProducts(sessionId: string): Promise<boolean> {
    try {
      await db.missed_products
        .where('session_id')
        .equals(sessionId)
        .delete();

      console.log(`🗑️ Deleted missed products for session ${sessionId}`);
      return true;

    } catch (error) {
      console.error('Error deleting session missed products:', error);
      return false;
    }
  }
}

export const missedProductsService = MissedProductsService.getInstance();
