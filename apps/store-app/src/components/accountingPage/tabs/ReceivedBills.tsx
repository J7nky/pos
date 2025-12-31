import React, { useMemo, useState } from 'react';
import {
  Search,
  FileText,
  Activity,
  CheckCircle,
  DollarSign,
  Trash2,
  ChevronRight,
  X,
  Edit
} from 'lucide-react';
import { Bill } from '../../../lib/db';
import ReceiveFormModal from '../../inventory/ReceiveFormModal';
import { useI18n } from '../../../i18n';
import { Pagination } from '../../../components/common/Pagination';
import { useModal } from '../../../hooks/useModal';
import { ReceivedBillDetailsModal } from './receivedBills/ReceivedBillDetailsModal';
import { ReceivedBillSalesLogsModal } from './receivedBills/ReceivedBillSalesLogsModal';
import { ReceivedBill } from './receivedBills/types';
import { getLocalDateString } from '../../../utils/dateUtils';

type ReceivedBillsProps = {
  inventory: any[];
  inventoryBills: any[];
  bills: Bill[];
  products: any[];
  suppliers: any[];
  sales: any[];
  customers: any[];
  formatCurrency: (amount: number) => string;
  showToast: (message: string, type?: 'success' | 'error') => void;
  onEditSale: (sale: any) => void;
  onDeleteSale: (sale: any) => void;
  onUpdateBatch?: (batchId: string, updates: Partial<{ porterage_fee?: number | null; transfer_fee?: number | null; notes?: string | null; plastic_fee?: string | null; plastic_count?: number | null; plastic_price?: number | null; commission_rate?: number | null; received_at?: string | null; status?: string | null; type?: string | null; supplier_id?: string | null; }>) => Promise<void>;
  onCloseBill?: (bill: any, fees: { commission: number; porterage: number; transfer: number; supplierAmount: number }) => Promise<void>;
  // Additional props for ReceiveFormModal
  defaultCommissionRate: number;
  recentSuppliers: string[];
  setRecentSuppliers: (suppliers: string[]) => void;
  addSupplier?: (supplier: any) => Promise<void>;
  flashingItemId?: string | null;
  autoExpandGroupId?: string | null;
  preferredCurrency: 'USD' | 'LBP';
};

export default function ReceivedBills({
  inventory,
  inventoryBills,
  bills: _bills,
  products,
  suppliers,
  sales,
  customers,
  formatCurrency,
  showToast,
  onEditSale,
  onDeleteSale,
  onUpdateBatch,
  onCloseBill,
  defaultCommissionRate,
  recentSuppliers,
  setRecentSuppliers,
  addSupplier,
  flashingItemId,
  autoExpandGroupId,
  preferredCurrency
}: ReceivedBillsProps) {
  const { t } = useI18n();
  const [receivedBillsSearchTerm, setReceivedBillsSearchTerm] = useState('');
  // const [receivedBills, setReceivedBills] = useState<Bill[]>([]);
  const [receivedBillsSupplierFilter, setReceivedBillsSupplierFilter] = useState('');
  const [receivedBillsProductFilter, setReceivedBillsProductFilter] = useState('');
  const [receivedBillsPage, setReceivedBillsPage] = useState(1);
  const [receivedBillsSort, setReceivedBillsSort] = useState<'date' | 'supplier' | 'product' | 'amount' | 'progress' | 'revenue' | 'status'>('date');
  const [receivedBillsSortDir, setReceivedBillsSortDir] = useState<'asc' | 'desc'>('desc');
  const [receivedBillsStatusFilter, setReceivedBillsStatusFilter] = useState<string>('all');
  const [receivedBillsTypeFilter, setReceivedBillsTypeFilter] = useState<string>('all');
  const billDetailsModal = useModal<ReceivedBill>();
  const salesLogsModal = useModal<ReceivedBill>();
  const [showBatchEdit, setShowBatchEdit] = useState(false);
  const [batchEditForm, setBatchEditForm] = useState<{
    supplier_id?: string;
    type?: string;
    porterage_fee?: string;
    transfer_fee?: string;
    commission_rate?: number | null;
    status?: string;
    empty_plastic?: boolean;
    plastic_count?: string;
    plastic_price?: string;
    received_at?: string;
  }>({});
  const [batchEditErrors, setBatchEditErrors] = useState<any>({});
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [editingBatchStatus, setEditingBatchStatus] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [closedBillIds, setClosedBillIds] = useState<Set<string>>(new Set());

  // Auto-expand group when navigating from missed products
  React.useEffect(() => {
    if (autoExpandGroupId) {
      setExpandedGroups(prev => new Set([...prev, autoExpandGroupId]));
    }
  }, [autoExpandGroupId]);

  // Auto-scroll to flashing item
  React.useEffect(() => {
    if (flashingItemId) {
      // Small delay to ensure the item is rendered
      const timer = setTimeout(() => {
        const flashingElement = document.getElementById(`flashing-item-${flashingItemId}`);
        if (flashingElement) {
          flashingElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });
          
          // Add a subtle bounce effect
          flashingElement.style.transform = 'scale(1.02)';
          setTimeout(() => {
            flashingElement.style.transform = 'scale(1)';
          }, 200);
        }
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [flashingItemId]);

  // Initialize batch edit form with current batch data
  const initializeBatchEdit = async (group: any) => {
    const first = group.items[0];
    const batchId = group.batchId || first?.batch_id;
    console.log('[ReceivedBills] initializeBatchEdit - Starting', { batchId, firstItem: first, group });
    if (!batchId || batchId === null) {
      console.warn('[ReceivedBills] initializeBatchEdit - No batchId found');
      return;
    }

    // Get the actual batch status from the database
    // Access db instance to get batch status
    const { getDB } = await import('../../../lib/db');
    const batch = await getDB().inventory_bills.get(batchId);
    console.log('[ReceivedBills] initializeBatchEdit - Batch from DB:', { batch, batchId });
    const currentBatchStatus = batch?.status || 'Created';
    const currentSupplierId = batch?.supplier_id || first?.supplierId || '';
    console.log('[ReceivedBills] initializeBatchEdit - Current values:', { 
      currentBatchStatus, 
      currentSupplierId,
      batchSupplierId: batch?.supplier_id,
      firstSupplierId: first?.supplierId 
    });
    setEditingBatchStatus(currentBatchStatus);

    // Initialize form with current batch data for ReceiveFormModal
    // Note: form.status is used for notes/comments in ReceiveFormModal, not actual status
    const formData = {
      supplier_id: currentSupplierId,
      type: batch?.type || first?.type || 'commission',
      porterage_fee: (batch?.porterage_fee ?? group.batchPorterage ?? '').toString(),
      transfer_fee: (batch?.transfer_fee ?? group.batchTransferFee ?? '').toString(),
      commission_rate: (batch?.commission_rate ?? first?.commissionRate ?? '').toString(),
      status: (batch?.notes ?? group.batchNotes ?? ''), // This is notes, stored in form.status because ReceiveFormModal uses status field for notes
      empty_plastic: !!batch?.plastic_fee || !!group.batchPlasticFee,
      plastic_count: (group.batchPlasticCount ?? '').toString(),
      plastic_price: (group.batchPlasticPrice ?? '').toString(),
      received_at: batch?.received_at || first?.received_at || getLocalDateString(new Date().toISOString())
    };
    console.log('[ReceivedBills] initializeBatchEdit - Setting form data:', formData);
    setBatchEditForm(formData);

    setBatchEditErrors({});
    setEditingBatchId(batchId);
    setShowBatchEdit(true);
  };

  // Handle batch edit success
  const handleBatchEditSuccess = async (data: any) => {
    console.log('[ReceivedBills] handleBatchEditSuccess - Received data:', { 
      data, 
      editingBatchId, 
      editingBatchStatus,
      batchData: data.batch,
      supplierIdFromForm: data.batch?.supplier_id,
      hasOnUpdateBatch: !!onUpdateBatch
    });
    
    try {
      if (editingBatchId && onUpdateBatch) {
        // Build updates object - only include fields that should be updated
        const updates: any = {
          porterage_fee: data.batch?.porterage_fee !== undefined ? (data.batch.porterage_fee ? parseFloat(data.batch.porterage_fee) : null) : undefined,
          transfer_fee: data.batch?.transfer_fee !== undefined ? (data.batch.transfer_fee ? parseFloat(data.batch.transfer_fee) : null) : undefined,
          notes: data.batch?.status !== undefined ? (data.batch.status || null) : undefined, // form.status is actually notes/comments
          plastic_fee: data.batch?.plastic_fee !== undefined ? (data.batch.plastic_fee ? parseFloat(data.batch.plastic_fee) : null) : undefined,
          commission_rate: data.batch?.commission_rate !== undefined ? (data.batch.commission_rate ? parseFloat(data.batch.commission_rate) : null) : undefined,
          received_at: data.batch?.received_at || undefined,
          type: data.batch?.type || undefined,
          supplier_id: data.batch?.supplier_id || undefined,
          // Preserve the existing batch status - don't overwrite it unless explicitly changed
          status: editingBatchStatus || 'Created'
        };

        console.log('[ReceivedBills] handleBatchEditSuccess - Updates before cleanup:', updates);
        console.log('[ReceivedBills] handleBatchEditSuccess - Supplier ID processing:', {
          rawSupplierId: data.batch?.supplier_id,
          processedSupplierId: updates.supplier_id,
          isUndefined: updates.supplier_id === undefined,
          isEmptyString: updates.supplier_id === ''
        });

        // Remove undefined values to avoid unnecessary updates
        const beforeCleanup = { ...updates };
        Object.keys(updates).forEach(key => {
          if (updates[key] === undefined) {
            delete updates[key];
          }
        });
        console.log('[ReceivedBills] handleBatchEditSuccess - Updates after cleanup:', {
          before: beforeCleanup,
          after: updates,
          supplierIdIncluded: 'supplier_id' in updates
        });

        console.log('[ReceivedBills] handleBatchEditSuccess - Calling onUpdateBatch with:', {
          batchId: editingBatchId,
          updates
        });
        await onUpdateBatch(editingBatchId, updates);
        console.log('[ReceivedBills] handleBatchEditSuccess - onUpdateBatch completed successfully');
      }

      setShowBatchEdit(false);
      setEditingBatchId(null);
      setEditingBatchStatus(null);
      showToast('Batch updated successfully', 'success');
    } catch (e) {
      console.error('[ReceivedBills] handleBatchEditSuccess - Error updating batch:', e);
      showToast('Failed to update batch', 'error');
    }
  };

  // Memoize the expensive getReceivedBills calculation
  const getReceivedBills = useMemo(() => {
    const bills: any[] = [];
    try {
      // Create a map of batch_id -> inventory_bill for quick lookup
      const batchMap = new Map<string, any>();
      inventoryBills.forEach((bill: any) => {
        if (bill && bill.id) {
          batchMap.set(bill.id, bill);
        }
      });

      // Filter inventory items - if they have a batch_id, we'll get supplier_id from the batch
      // If they don't have a batch_id, they might be standalone items (legacy support)
      const allInventoryItems = inventory.filter(item => item && item.product_id);
      for (const item of allInventoryItems) {
        // Get supplier_id from batch - items without batch_id are invalid and should not exist
        const batch = item.batch_id ? batchMap.get(item.batch_id) : null;
        const supplierId = batch?.supplier_id || null;
        
        if (!supplierId) {
          console.warn('[ReceivedBills] Item missing supplier_id (no batch or batch missing supplier_id):', { itemId: item.id, batchId: item.batch_id });
          continue;
        }

        const product = products.find(p => p.id === item.product_id);
        const supplier = suppliers.find(s => s.id === supplierId);
        if (!product || !supplier) continue;

        // Link sales by inventory_item_id, then infer the bill (batch) via item's batch_id
        const relatedSales = (sales || []).filter((sale: any) => sale && sale.inventory_item_id === item.id);
        const sortedSales = relatedSales.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        let totalSoldQuantity = 0;
        let totalRevenue = 0;
        let saleCount = 0;
        for (const sale of sortedSales) {
          const qty = typeof sale.quantity === 'number' ? sale.quantity : 0;
          const unitPrice = typeof sale.unit_price === 'number' ? sale.unit_price : 0;
          const receivedValue = typeof sale.received_value === 'number' ? sale.received_value : undefined;
          totalSoldQuantity += qty;
          totalRevenue += receivedValue !== undefined ? receivedValue : (unitPrice * qty);
          saleCount++;
        }

        const originalReceivedQuantity = (item.received_quantity !== null && item.received_quantity !== undefined && item.received_quantity > 0)
          ? item.received_quantity
          : (item.quantity + totalSoldQuantity);
        const remainingQuantity = item.quantity;

        const avgUnitPrice = totalSoldQuantity > 0 ? (totalRevenue / totalSoldQuantity) : (item.price || 0);
        const estimatedTotalValue = originalReceivedQuantity * avgUnitPrice;
        const soldFromThisItem = Math.max(originalReceivedQuantity - remainingQuantity, 0);
        const progress = originalReceivedQuantity > 0 ? (soldFromThisItem / originalReceivedQuantity) * 100 : 0;

        const validOriginalQuantity = Math.max(originalReceivedQuantity, 0);
        const validSoldQuantity = Math.max(totalSoldQuantity, 0);
        const validRemainingQuantity = Math.max(remainingQuantity, 0);
        const validProgress = isNaN(progress) || !isFinite(progress) ? 0 : Math.max(0, Math.min(100, progress));

        // Check batch status first - it takes precedence over calculated status
        const batchStatus = batch?.status ? batch.status.toUpperCase() : null;
        
        let status = 'pending';
        if (batchStatus === 'CLOSED') {
          // If batch is closed, status is always closed regardless of progress
          status = 'closed';
        } else if (batchStatus === 'COMPLETED') {
          status = 'completed';
        } else if (batchStatus === 'PROGRESS') {
          status = 'in-progress';
        } else if (batchStatus === 'RECEIVED') {
          status = 'pending';
        } else {
          // Fallback to progress-based calculation if no batch status
          if (validProgress >= 100) status = 'completed';
          else if (validProgress >= 75) status = 'nearly-complete';
          else if (validProgress >= 50) status = 'halfway';
          else if (validProgress > 0) status = 'in-progress';
        }

        const isClosed = status === 'closed' || closedBillIds.has(item.id);

        // Get batch-related fields from inventory_bills if batch exists
        const batchType = batch?.type || (item as any).batch_type || (item as any).type || 'commission';
        const batchPorterage = batch?.porterage_fee ?? (item as any).batch_porterage ?? null;
        const batchTransferFee = batch?.transfer_fee ?? (item as any).batch_transfer_fee ?? null;
        const batchNotes = batch?.notes ?? (item as any).batch_notes ?? null;
        const commissionRate = batch?.commission_rate ?? (item as any).commission_rate ?? null;
        
        const totalCost = batchType === 'commission'
          ? ((batchPorterage || 0) + (batchTransferFee || 0))
          : (item.price || 0) * validOriginalQuantity;
        const totalProfit = totalRevenue - totalCost;

        bills.push({
          id: item.id,
          batchId: item.batch_id || null,
          productId: item.product_id,
          productName: product.name,
          supplierId: supplierId, // Now from batch if available, otherwise from item
          supplierName: supplier.name,
          type: batchType,
          batchPorterage: batchPorterage,
          batchTransferFee: batchTransferFee,
          batchNotes: batchNotes,
          originalQuantity: validOriginalQuantity,
          remainingQuantity: validRemainingQuantity,
          totalSoldQuantity: validSoldQuantity,
          totalRevenue,
          totalCost,
          totalProfit,
          avgUnitPrice,
          estimatedTotalValue,
          progress: validProgress,
          status,
          isClosed,
          saleCount,
          receivedAt: (item as any).received_at || item.created_at,
          receivedBy: (item as any).received_by,
          notes: item.notes,
          unit: item.unit,
          weight: item.weight,
          porterage: batchPorterage,
          transferFee: batchTransferFee,
          price: item.price,
          commissionRate: commissionRate,
          relatedSales: sortedSales
        });
      }
    } catch (error) {
      console.error('Error processing received bills:', error);
      showToast('Error processing received bills data', 'error');
    }
    return bills;
  }, [inventory, inventoryBills, products, suppliers, sales, showToast, closedBillIds]);

  const filteredReceivedBills = useMemo(() => {
    try {
      let filtered = getReceivedBills;

      if (receivedBillsSearchTerm) {
        const searchLower = receivedBillsSearchTerm.toLowerCase();
        filtered = filtered.filter(bill =>
          bill.productName.toLowerCase().includes(searchLower) ||
          bill.supplierName.toLowerCase().includes(searchLower) ||
          bill.type.toLowerCase().includes(searchLower)
        );
      }
      if (receivedBillsSupplierFilter) {
        filtered = filtered.filter(bill => bill.supplierId === receivedBillsSupplierFilter);
      }
      if (receivedBillsProductFilter) {
        filtered = filtered.filter(bill => bill.productId === receivedBillsProductFilter);
      }
      if (receivedBillsStatusFilter !== 'all') {
        filtered = filtered.filter(bill => bill.status === receivedBillsStatusFilter);
      }
      if (receivedBillsTypeFilter !== 'all') {
        filtered = filtered.filter(bill => bill.type === receivedBillsTypeFilter);
      }

      filtered.sort((a, b) => {
        let aValue: any, bValue: any;
        switch (receivedBillsSort) {
          case 'date':
            aValue = new Date(a.receivedAt).getTime();
            bValue = new Date(b.receivedAt).getTime();
            break;
          case 'supplier':
            aValue = a.supplierName.toLowerCase();
            bValue = b.supplierName.toLowerCase();
            break;
          case 'product':
            aValue = a.productName.toLowerCase();
            bValue = b.productName.toLowerCase();
            break;
          case 'amount':
            aValue = a.estimatedTotalValue;
            bValue = b.estimatedTotalValue;
            break;
          case 'progress':
            aValue = a.progress;
            bValue = b.progress;
            break;
          case 'revenue':
            aValue = a.totalRevenue;
            bValue = b.totalRevenue;
            break;
          case 'status':
            aValue = a.status;
            bValue = b.status;
            break;
          default:
            aValue = new Date(a.receivedAt).getTime();
            bValue = new Date(b.receivedAt).getTime();
        }
        if (receivedBillsSortDir === 'asc') {
          return aValue > bValue ? 1 : -1;
        } else {
          return aValue < bValue ? 1 : -1;
        }
      });
      return filtered;
    } catch (error) {
      console.error('Error filtering received bills:', error);
      return [];
    }
  }, [getReceivedBills, receivedBillsSearchTerm, receivedBillsSupplierFilter, receivedBillsProductFilter, receivedBillsStatusFilter, receivedBillsTypeFilter, receivedBillsSort, receivedBillsSortDir]);

  // Group received bills by batch (bulk) so a batch appears as a single bill with expandable sub-items
  const groupedReceivedBills = useMemo(() => {
    try {
      // Key is batchId if present, otherwise the individual item id
      const groupMap = new Map<string, any>();
      for (const bill of filteredReceivedBills) {
        const key = bill.batchId || bill.id;
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            groupId: key,
            isBatch: bill.batchId,
            supplierId: bill.supplierId,
            supplierName: bill.supplierName,
            batchId: bill.batchId || null,
            batchPorterage: bill.batchPorterage ?? null,
            batchTransferFee: bill.batchTransferFee ?? null,
            batchNotes: bill.batchNotes ?? null,
            items: [] as any[],
            originalQuantity: 0,
            remainingQuantity: 0,
            totalSoldQuantity: 0,
            totalRevenue: 0,
            totalCost: 0,
            totalProfit: 0,
            receivedAt: bill.receivedAt,
            typeSet: new Set<string>(),
          });
        }
        const g = groupMap.get(key);
        g.items.push(bill);
        g.originalQuantity += bill.originalQuantity || 0;
        g.remainingQuantity += bill.remainingQuantity || 0;
        g.totalSoldQuantity += bill.totalSoldQuantity || 0;
        g.totalRevenue += bill.totalRevenue || 0;
        g.totalCost += bill.totalCost || 0;
        g.totalProfit += bill.totalProfit || 0;
        g.typeSet.add(bill.type);
        // Use the earliest received date among group items
        const currentTs = new Date(g.receivedAt).getTime();
        const billTs = new Date(bill.receivedAt).getTime();
        if (!currentTs || billTs < currentTs) {
          g.receivedAt = bill.receivedAt;
        }
      }

      const groups = Array.from(groupMap.values()).map((g: any) => {
        const progressBase = g.originalQuantity > 0 ? (Math.max(g.originalQuantity - g.remainingQuantity, 0) / g.originalQuantity) * 100 : 0;
        const progress = isNaN(progressBase) || !isFinite(progressBase) ? 0 : Math.max(0, Math.min(100, progressBase));
        
        // Get the actual batch status from the first item (all items in a batch share the same status)
        const firstItemBatchStatus = g.items.length > 0 && g.items[0].batchId 
          ? inventoryBills.find((b: any) => b.id === g.items[0].batchId)?.status 
          : null;
        const batchStatus = firstItemBatchStatus ? firstItemBatchStatus.toUpperCase() : null;
        
        let status = 'pending';
        if (batchStatus === 'CLOSED') {
          status = 'closed';
        } else if (batchStatus === 'COMPLETED') {
          status = 'completed';
        } else if (batchStatus === 'PROGRESS') {
          status = 'in-progress';
        } else if (batchStatus === 'RECEIVED') {
          status = 'pending';
        } else {
          // Fallback to progress-based calculation
          if (progress >= 100) status = 'completed';
          else if (progress >= 75) status = 'nearly-complete';
          else if (progress >= 50) status = 'halfway';
          else if (progress > 0) status = 'in-progress';
        }
        
        // If all items in the group are closed, mark the group as closed
        const allClosed = status === 'closed' || (g.items.length > 0 && g.items.every((it: any) => it.isClosed === true));
        if (allClosed) {
          status = 'closed';
        }
        const type = g.typeSet.size === 1 ? Array.from(g.typeSet)[0] : 'mixed';
        const productName = g.items.length === 1 ? g.items[0].productName : `${g.items.length} items`;
        const avgUnitPrice = g.items.length === 1 ? g.items[0].avgUnitPrice : (g.totalSoldQuantity > 0 ? g.totalRevenue / g.totalSoldQuantity : 0);
        return {
          ...g,
          progress,
          status,
          isClosed: allClosed,
          type,
          productName,
          avgUnitPrice,
        };
      });

      // Sort groups following the current sort selection
      groups.sort((a: any, b: any) => {
        let aValue: any;
        let bValue: any;
        switch (receivedBillsSort) {
          case 'date':
            aValue = new Date(a.receivedAt).getTime();
            bValue = new Date(b.receivedAt).getTime();
            break;
          case 'supplier':
            aValue = (a.supplierName || '').toLowerCase();
            bValue = (b.supplierName || '').toLowerCase();
            break;
          case 'product':
            aValue = (a.productName || '').toLowerCase();
            bValue = (b.productName || '').toLowerCase();
            break;
          case 'amount':
            // Use totalRevenue as a proxy for amount
            aValue = a.totalRevenue || 0;
            bValue = b.totalRevenue || 0;
            break;
          case 'progress':
            aValue = a.progress || 0;
            bValue = b.progress || 0;
            break;
          case 'revenue':
            aValue = a.totalRevenue || 0;
            bValue = b.totalRevenue || 0;
            break;
          case 'status':
            aValue = a.status || '';
            bValue = b.status || '';
            break;
          default:
            aValue = new Date(a.receivedAt).getTime();
            bValue = new Date(b.receivedAt).getTime();
        }
        if (receivedBillsSortDir === 'asc') {
          return aValue > bValue ? 1 : -1;
        } else {
          return aValue < bValue ? 1 : -1;
        }
      });

      return groups;
    } catch (e) {
      console.error('Error grouping received bills:', e);
      return [] as any[];
    }
  }, [filteredReceivedBills, receivedBillsSort, receivedBillsSortDir]);

  const paginatedGroups = useMemo(() => {
    const itemsPerPage = 10;
    const startIndex = (receivedBillsPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return groupedReceivedBills.slice(startIndex, endIndex);
  }, [groupedReceivedBills, receivedBillsPage]);
  const groupTotalPages = Math.ceil(groupedReceivedBills.length / 10);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  };

  // replaced by paginatedGroups and groupTotalPages

  const handleReceivedBillsSort = (sort: 'date' | 'supplier' | 'product' | 'amount' | 'progress' | 'revenue' | 'status') => {
    if (receivedBillsSort === sort) {
      setReceivedBillsSortDir(receivedBillsSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setReceivedBillsSort(sort);
      setReceivedBillsSortDir('desc');
    }
  };

  // Helper to create enriched bill with aggregated fields from group
  const createEnrichedBillFromGroup = (group: any) => {
    const first = group.items[0];
    return {
      ...first,
      batchId: group.batchId,
      supplierName: group.supplierName,
      productName: group.productName,
      totalRevenue: group.totalRevenue || 0,
      totalCost: group.totalCost || 0,
      totalProfit: group.totalProfit || 0,
      totalSoldQuantity: group.totalSoldQuantity || 0,
      originalQuantity: group.originalQuantity || 0,
      remainingQuantity: group.remainingQuantity || 0
    };
  };

  const handleViewReceivedBillDetails = (bill: ReceivedBill) => {
    console.log('Bill Details - Received bill:', {
      id: bill.id,
      productName: bill.productName,
      totalRevenue: bill.totalRevenue,
      totalCost: bill.totalCost,
      totalProfit: bill.totalProfit,
      batchId: bill.batchId
    });
    billDetailsModal.open(bill);
  };

  const handleViewReceivedBillSalesLogs = (bill: ReceivedBill) => {
    console.log('Sales Logs - Sales Logs:', {
      id: bill.id,
      productName: bill.productName,
      totalRevenue: bill.totalRevenue,
      totalCost: bill.totalCost,
      totalProfit: bill.totalProfit,
      batchId: bill.batchId
    });
    salesLogsModal.open(bill);
  };

  const exportReceivedBills = () => {
    try {
      const headers = [
        'Date', 'Product', 'Supplier', 'Type', 'Original Qty', 'Remaining Qty',
        'Sold Qty', 'Progress %', 'Revenue', 'Cost', 'Profit', 'Status', 'Unit Price'
      ];
      const csvContent = [
        headers.join(','),
        ...filteredReceivedBills.map(bill => [
          new Date(bill.receivedAt).toLocaleDateString(),
          `"${bill.productName}"`,
          `"${bill.supplierName}"`,
          bill.type,
          bill.originalQuantity,
          bill.remainingQuantity,
          bill.totalSoldQuantity,
          `${bill.progress.toFixed(1)}%`,
          bill.totalRevenue.toFixed(2),
          bill.totalCost.toFixed(2),
          bill.totalProfit.toFixed(2),
          bill.status,
          bill.avgUnitPrice.toFixed(2)
        ].join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `received-bills-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast('Received bills exported successfully', 'success');
    } catch (error) {
      console.error('Error exporting received bills:', error);
      showToast('Error exporting received bills', 'error');
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { color: string; icon: any }> = {
      'pending': { color: 'bg-gray-100 text-gray-800', icon: ClockIcon },
      'in-progress': { color: 'bg-blue-100 text-blue-800', icon: Activity },
      'halfway': { color: 'bg-yellow-100 text-yellow-800', icon: TrendingUpIcon },
      'nearly-complete': { color: 'bg-orange-100 text-orange-800', icon: TargetIcon },
      'completed': { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      'closed': { color: 'bg-gray-200 text-gray-800', icon: CheckCircle }
    };
    const config = statusConfig[status] || statusConfig['pending'];
    const IconComponent = config.icon;
    
    // Map status to translation key
    const statusTranslationKey = `receivedBills.status${status.charAt(0).toUpperCase()}${status.slice(1).replace('-', '')}`;
    
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        <IconComponent className="w-3 h-3 rtl:ml-1 ltr:mr-1" />
        {t(statusTranslationKey)}
      </span>
    );
  };




  return (
    <div>
      <div className="flex justify-between items-center ">
        <div className="rtl:text-right">
          <h2 className="text-xl font-semibold text-gray-900">{t('receivedBills.title')}</h2>
          <p className="mt-1"></p>
          {(() => {
            const problematicItems = inventory.filter(item => item.received_quantity === null || item.received_quantity === undefined || item.received_quantity === 0);
            return problematicItems.length > 0 ? (
              <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-xs text-yellow-800 rtl:text-right">⚠️ {t('receivedBills.problematicItemsWarning', { count: problematicItems.length })}</p>
              </div>
            ) : null;
          })()}
        </div>
        <div className="flex items-center space-x-2 pb-4 rtl:space-x-reverse">
          <button onClick={exportReceivedBills} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center">
            <FileText className="w-4 h-4 rtl:ml-2 ltr:mr-2" />
            {t('receivedBills.exportCSV')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pb-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between ">
            <div className="rtl:text-right">
              <p className="text-sm text-gray-600">{t('receivedBills.totalBills')}</p>
              <p className="text-2xl font-bold text-gray-900">{groupedReceivedBills.length}</p>
            </div>
            <div className="p-2 bg-blue-100 rounded-full">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between ">
            <div className="rtl:text-right">
              <p className="text-sm text-gray-600">{t('receivedBills.inProgress')}</p>
              <p className="text-2xl font-bold text-blue-600">{groupedReceivedBills.filter(bill => bill.status === 'in-progress').length}</p>
            </div>
            <div className="p-2 bg-blue-100 rounded-full">
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between ">
            <div className="rtl:text-right">
              <p className="text-sm text-gray-600">{t('receivedBills.completed')}</p>
              <p className="text-2xl font-bold text-green-600">{groupedReceivedBills.filter(bill => bill.status === 'completed').length}</p>
            </div>
            <div className="p-2 bg-green-100 rounded-full">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between ">
            <div className="rtl:text-right">
              <p className="text-sm text-gray-600">{t('receivedBills.totalRevenue')}</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(groupedReceivedBills.reduce((sum, g) => sum + (g.totalRevenue || 0), 0))}</p>
            </div>
            <div className="p-2 bg-green-100 rounded-full">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">{t('receivedBills.search')}</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 rtl:left-auto rtl:right-3" />
              <input
                type="text"
                placeholder={t('receivedBills.searchPlaceholder')}
                value={receivedBillsSearchTerm}
                onChange={(e) => setReceivedBillsSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 rtl:pl-4 rtl:pr-10"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">{t('receivedBills.product')}</label>
            <select value={receivedBillsProductFilter} onChange={(e) => setReceivedBillsProductFilter(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500">
              <option value="">{t('receivedBills.allProducts')}</option>
              {products.filter(p => p).map(product => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">{t('receivedBills.supplier')}</label>
            <select value={receivedBillsSupplierFilter} onChange={(e) => setReceivedBillsSupplierFilter(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500">
              <option value="">{t('receivedBills.allSuppliers')}</option>
              {suppliers.map(supplier => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">{t('receivedBills.status')}</label>
            <select value={receivedBillsStatusFilter} onChange={(e) => setReceivedBillsStatusFilter(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500">
              <option value="all">{t('receivedBills.statusAllStatus')}</option>
              <option value="pending">{t('receivedBills.statusPending')}</option>
              <option value="in-progress">{t('receivedBills.statusInProgress')}</option>
              <option value="halfway">{t('receivedBills.statusHalfway')}</option>
              <option value="nearly-complete">{t('receivedBills.statusNearlyComplete')}</option>
              <option value="completed">{t('receivedBills.statusCompleted')}</option>
              <option value="closed">{t('receivedBills.statusClosed')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 rtl:text-right">{t('receivedBills.type')}</label>
            <select value={receivedBillsTypeFilter} onChange={(e) => setReceivedBillsTypeFilter(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500">
              <option value="all">{t('receivedBills.allTypes')}</option>
              <option value="commission">{t('receivedBills.commission')}</option>
              <option value="cash">{t('receivedBills.cash')}</option>
              <option value="cash">{t('receivedBills.credit')}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">
                  <button onClick={() => handleReceivedBillsSort('date')} className="flex items-center space-x-1 hover:text-gray-700 rtl:space-x-reverse">
                    <span>{t('receivedBills.date')}</span>
                    {receivedBillsSort === 'date' && (receivedBillsSortDir === 'asc' ? <ChevronRight className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 rotate-180" />)}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">
                  <button onClick={() => handleReceivedBillsSort('product')} className="flex items-center space-x-1 hover:text-gray-700 rtl:space-x-reverse">
                    <span>{t('receivedBills.product')}</span>
                    {receivedBillsSort === 'product' && (receivedBillsSortDir === 'asc' ? <ChevronRight className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 rotate-180" />)}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">
                  <button onClick={() => handleReceivedBillsSort('supplier')} className="flex items-center space-x-1 hover:text-gray-700 rtl:space-x-reverse">
                    <span>{t('receivedBills.supplier')}</span>
                    {receivedBillsSort === 'supplier' && (receivedBillsSortDir === 'asc' ? <ChevronRight className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 rotate-180" />)}
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">{t('receivedBills.type')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">{t('receivedBills.quantity')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">
                  <button onClick={() => handleReceivedBillsSort('progress')} className="flex items-center space-x-1 hover:text-gray-700 rtl:space-x-reverse">
                    <span>{t('receivedBills.progress')}</span>
                    {receivedBillsSort === 'progress' && (receivedBillsSortDir === 'asc' ? <ChevronRight className="w-4 h-4" /> : <ChevronRight className="w-4 h-4 rotate-180" />)}
                  </button>
                </th>

                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">{t('receivedBills.status')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">{t('receivedBills.actions')}</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {paginatedGroups.map((group: any) => (
                <React.Fragment key={`group-${group.groupId}`}>
                  <tr
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => group.isBatch && toggleGroup(group.groupId)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 rtl:space-x-reverse">
                        {group.isBatch && (
                          <div className="p-1">
                            <ChevronRight className={`w-4 h-4 text-gray-500 transition-transform ${expandedGroups.has(group.groupId) ? 'rotate-90' : ''}`} />
                          </div>
                        )}
                        <div className="text-sm text-gray-900 rtl:text-right">{new Date(group.receivedAt).toLocaleDateString()}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 flex items-center gap-2 rtl:space-x-reverse">
                        {group.isBatch && <span className="px-1.5 py-0.5 text-[10px] bg-indigo-100 text-indigo-700 rounded">{t('receivedBills.batch')}</span>}
                        <span className="rtl:text-right">{group.productName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 rtl:text-right">{group.supplierName}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {group.type === 'mixed' ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800`}>
                          {t('receivedBills.mixed')}
                        </span>
                      ) : (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${group.type === 'commission' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`}>
                          {t(`receivedBills.${group.type}`)}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 rtl:text-right">
                        <div>{t('receivedBills.original')}: {group.originalQuantity}</div>
                        <div>{t('receivedBills.remaining')}: {group.remainingQuantity}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center rtl:space-x-reverse">
                        <div className="w-32 bg-gray-200 rounded-full h-2 rtl:ml-2 ltr:mr-2">
                          <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${group.progress}%` }}></div>
                        </div>
                        <span className="text-sm text-gray-900 rtl:text-right">{group.progress.toFixed(1)}%</span>
                      </div>
                    </td>
                  
                    <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(group.status)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 rtl:space-x-reverse">
                        {group.isBatch ? (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent row click
                                // Use first item to prefill batch edit
                                initializeBatchEdit(group);
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                            >
                              {t('receivedBills.editBatch')}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent row click
                                handleViewReceivedBillDetails(createEnrichedBillFromGroup(group));
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5 text-gray-500" />
                              <span>{t('receivedBills.details')}</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent row click
                                handleViewReceivedBillSalesLogs(createEnrichedBillFromGroup(group));
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                            >
                              <Activity className="w-3.5 h-3.5 text-gray-500" />
                              <span>{t('receivedBills.salesLogs')}</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent row click
                                handleViewReceivedBillDetails(createEnrichedBillFromGroup(group));
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5 text-gray-500" />
                              <span>{t('receivedBills.details')}</span>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation(); // Prevent row click
                                handleViewReceivedBillSalesLogs(createEnrichedBillFromGroup(group));
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                            >
                              <Activity className="w-3.5 h-3.5 text-gray-500" />
                              <span>{t('receivedBills.salesLogs')}</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  {group.isBatch && expandedGroups.has(group.groupId) && (
                    <tr className="bg-gray-50">
                      <td colSpan={9} className="px-6 py-4">
                        <div className="border rounded-lg overflow-hidden">
                          <div className="bg-gray-100 px-4 py-2 text-sm text-gray-700 flex items-center justify-between ">
                            <div className="rtl:text-right">
                              {group.items.length} {group.items.length === 1 ? t('receivedBills.item') : t('receivedBills.items')} {t('receivedBills.inThis')} {group.isBatch ? t('receivedBills.batch') : t('receivedBills.bill')}
                            </div>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">{t('receivedBills.product')}</th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">{t('receivedBills.type')}</th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">{t('receivedBills.quantity')}</th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">{t('receivedBills.progress')}</th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">{t('receivedBills.revenue')}</th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">{t('receivedBills.status')}</th>
                                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rtl:text-right">{t('receivedBills.actions')}</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {group.items.map((bill: any) => {
                                  const shouldFlash = flashingItemId === bill.id;
                                  return (
                                    <tr 
                                      key={bill.id} 
                                      id={shouldFlash ? `flashing-item-${bill.id}` : undefined}
                                      className={`${
                                        shouldFlash ? 'border-2 border-blue-400' : ''
                                      }`}
                                    >
                                    <td className="px-6 py-3 whitespace-nowrap text-sm font-medium rtl:text-right text-gray-900">{bill.productName}</td>
                                    <td className="px-6 py-3 whitespace-nowrap">
                                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bill.type === 'commission' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`}>
                                        {t(`receivedBills.${bill.type}`)}
                                      </span>
                                    </td>
                                    <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900 rtl:text-right">
                                      <div>{t('receivedBills.original')}: {bill.originalQuantity} {bill.unit}</div>
                                      <div>{t('receivedBills.remaining')}: {bill.remainingQuantity} {bill.unit}</div>
                                    </td>
                                    <td className="px-6 py-3 whitespace-nowrap">
                                      <div className="flex items-center rtl:space-x-reverse">
                                        <div className="w-24 bg-gray-200 rounded-full h-2 rtl:ml-2 ltr:mr-2">
                                          <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${bill.progress}%` }}></div>
                                        </div>
                                        <span className="text-sm text-gray-900 rtl:text-right">{bill.progress.toFixed(1)}%</span>
                                      </div>
                                    </td>
                                    <td className="px-6 py-3 whitespace-nowrap text-sm font-medium text-gray-900 rtl:text-right">{formatCurrency(bill.totalRevenue)}</td>
                                    <td className="px-6 py-3 whitespace-nowrap">{getStatusBadge(bill.status)}</td>
                                    <td className="px-6 py-3 whitespace-nowrap">
                                      <div className="flex items-center gap-2 rtl:space-x-reverse">
                                        <button
                                          onClick={() => handleViewReceivedBillDetails(bill)}
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                                        >
                                          <FileText className="w-3.5 h-3.5 text-gray-500" />
                                          <span>{t('receivedBills.details')}</span>
                                        </button>
                                        <button
                                          onClick={() => handleViewReceivedBillSalesLogs(bill)}
                                          className="inline-flex items-center gap-1.5 px-2.5 py-1 border border-gray-200 rounded-md text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                                        >
                                          <Activity className="w-3.5 h-3.5 text-gray-500" />
                                          <span>{t('receivedBills.salesLogs')}</span>
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {groupTotalPages > 1 && (
          <Pagination
            currentPage={receivedBillsPage}
            totalPages={groupTotalPages}
            onPageChange={setReceivedBillsPage}
            itemsPerPage={10}
            totalItems={groupedReceivedBills.length}
          />
        )}
      </div>

      <ReceivedBillDetailsModal
        bill={billDetailsModal.data}
        isOpen={billDetailsModal.isOpen}
        onClose={billDetailsModal.close}
        onViewSalesLogs={(bill) => {
          billDetailsModal.close();
          handleViewReceivedBillSalesLogs(bill);
        }}
        formatCurrency={formatCurrency}
        getStatusBadge={getStatusBadge}
        t={t}
      />

      {/* Batch Edit Modal using ReceiveFormModal */}
      <ReceiveFormModal
        open={showBatchEdit}
        onClose={() => {
          setShowBatchEdit(false);
          setEditingBatchId(null);
          setEditingBatchStatus(null);
        }}
        onSuccess={handleBatchEditSuccess}
        products={products}
        suppliers={suppliers}
        defaultCommissionRate={defaultCommissionRate}
        preferredCurrency={preferredCurrency}
        recentSuppliers={recentSuppliers}
        setRecentSuppliers={setRecentSuppliers}
        form={batchEditForm}
        setForm={setBatchEditForm}
        errors={batchEditErrors}
        setErrors={setBatchEditErrors}
        addSupplier={addSupplier}
        isEditMode={true}
        editingBatchId={editingBatchId}
        existingBatchItems={editingBatchId ? inventory.filter((item: any) => item.batch_id === editingBatchId) : []}
      />

      <ReceivedBillSalesLogsModal
        bill={salesLogsModal.data}
        isOpen={salesLogsModal.isOpen}
        onClose={salesLogsModal.close}
        inventory={inventory}
        sales={sales}
        bills={_bills}
        customers={customers}
        formatCurrency={formatCurrency}
        onEditSale={onEditSale}
        onDeleteSale={onDeleteSale}
        onCloseBill={onCloseBill}
        showToast={showToast}
        onMarkBillClosed={(id: string) => {
          setClosedBillIds(prev => {
            const next = new Set(prev);
            next.add(id);
            return next;
          });
        }}
      />

      {/* Removed parent-level Close Bill modal. The Sales Logs modal now manages its own confirmation modal. */}

    </div>
  );
}

// Fallback icons used in status badge for decoupling from Accounting imports
function ClockIcon(props: any) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>; }
function TrendingUpIcon(props: any) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>; }
function TargetIcon(props: any) { return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>; }
