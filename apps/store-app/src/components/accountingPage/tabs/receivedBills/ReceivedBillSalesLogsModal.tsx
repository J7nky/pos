import { useState, useMemo } from 'react';
import { X, Edit, Trash2, FileText } from 'lucide-react';
import { Modal } from '../../../common/Modal';
import { ReceivedBill, SaleLineItem, CloseBillFees } from './types';

interface ReceivedBillSalesLogsModalProps {
  bill: ReceivedBill | null;
  isOpen: boolean;
  onClose: () => void;
  inventory: any[];
  sales: any[];
  bills: any[];
  customers: any[];
  formatCurrency: (amount: number) => string;
  onEditSale: (sale: any) => void;
  onDeleteSale: (sale: any) => void;
  onCloseBill?: (bill: any, fees: CloseBillFees) => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error') => void;
  onMarkBillClosed: (id: string) => void;
}

export function ReceivedBillSalesLogsModal({
  bill,
  isOpen,
  onClose,
  inventory,
  sales,
  bills,
  customers,
  formatCurrency,
  onEditSale,
  onDeleteSale,
  onCloseBill,
  showToast,
  onMarkBillClosed
}: ReceivedBillSalesLogsModalProps) {
  const [showCloseBillModal, setShowCloseBillModal] = useState(false);
  const [closeBillFees, setCloseBillFees] = useState<CloseBillFees | null>(null);

  if (!bill) return null;

  const processedSalesData = useMemo(() => {
    const salesDetails: any[] = [];
    let matchingSales: any[] = [];
    
    if (bill.batchId) {
      const itemIdsInBatch = (inventory || []).filter((it: any) => it.batch_id === bill.batchId).map((it: any) => it.id);
      const itemIdSet = new Set(itemIdsInBatch);
      matchingSales = (sales || []).filter((sale: any) => sale && sale.inventory_item_id && itemIdSet.has(sale.inventory_item_id));
    } else {
      matchingSales = (sales || []).filter((sale: any) => sale && sale.inventory_item_id === bill.id);
    }
    
    matchingSales.forEach((sale: any) => {
      const quantity = sale.quantity || 1;
      const unitPrice = sale.unit_price || 0;
      const receivedValue = sale.received_value;
      
      // Get customer_id and payment_method from parent bill
      const parentBill = bills.find((b: any) => b.id === sale.bill_id);
      const customerId = parentBill?.customer_id || null;
      const paymentMethod = parentBill?.payment_method || 'cash';
      
      // Create clean data structure with only needed fields (no spreading to avoid duplicates)
      salesDetails.push({
        // IDs
        id: sale.id,
        saleId: sale.id,
        bill_id: sale.bill_id,
        product_id: sale.product_id,
        inventory_item_id: sale.inventory_item_id,
        store_id: sale.store_id,
        
        // Dates
        saleDate: sale.created_at,
        created_at: sale.created_at,
        
        // Customer info (from parent bill)
        customerId: customerId,
        customerName: customers.find(c => c.id === customerId)?.name || 'Walk-in Customer',
        
        // Product/Supplier info (from received bill)
        productName: bill.productName,
        supplierName: bill.supplierName,
        
        // Quantities and pricing
        quantity: quantity,
        weight: sale.weight,
        unitPrice: unitPrice,
        receivedValue: receivedValue,
        line_total: sale.line_total,
        
        // Payment (from parent bill)
        paymentMethod: paymentMethod,
        
        // Other
        notes: sale.notes,
        line_order: sale.line_order
      });
    });
    
    return salesDetails.sort((a, b) => new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime());
  }, [bill, sales, customers, inventory, bills]);

  const closeBill = async () => {
    try {
      if (bill.isClosed) {
        showToast('Bill is already closed.', 'error');
        return;
      }
      
      // Calculate total revenue from sales
      const totalRevenue = bill.totalRevenue || 0;

      // Calculate fees based on bill type
      let commissionAmount = 0;
      let porterageAmount = 0;
      let transferAmount = 0;
      let supplierAmount = 0;

      if (bill.type === 'commission') {
        // For commission items, calculate commission percentage
        const commissionRate = bill.commissionRate || 0;
        commissionAmount = (totalRevenue * commissionRate) / 100;

        // Porterage and transfer fees are fixed amounts
        porterageAmount = (bill as any).porterage || bill.batchPorterage || 0;
        transferAmount = (bill as any).transferFee || bill.batchTransferFee || 0;

        // Supplier gets the remaining amount after deducting all fees
        supplierAmount = totalRevenue - commissionAmount - porterageAmount - transferAmount;
      } else {
        // For cash items, supplier gets the full amount
        supplierAmount = totalRevenue;
      }

      const fees: CloseBillFees = {
        commission: commissionAmount,
        porterage: porterageAmount,
        transfer: transferAmount,
        supplierAmount: supplierAmount
      };

      // Set fees and show confirmation modal
      setCloseBillFees(fees);
      setShowCloseBillModal(true);
    } catch (e) {
      console.error('Error closing bill:', e);
      showToast('Failed to close bill. Please try again.', 'error');
    }
  };

  const hasInvalidSalesLines = useMemo(() => {
    return processedSalesData.some((item: any) => {
      const invalidQuantity = bill.originalQuantity > bill.totalSoldQuantity;
      const invalidPrice = !item.unitPrice || item.unitPrice <= 0;
      return invalidQuantity || invalidPrice;
    });
  }, [processedSalesData, bill]);

  const exportSelectedBill = () => {
    try {
      const isBatch = !!bill.batchId;
      const billHeaders = isBatch
        ? ['Batch ID', 'Supplier', 'Type', 'Batch Porterage', 'Batch Transfer Fee', 'Batch Notes', 'Total Items', 'Total Original Qty', 'Total Remaining Qty', 'Total Sold Qty', 'Total Revenue', 'Total Cost', 'Total Profit', 'Received Date']
        : ['Product', 'Supplier', 'Type', 'Original Qty', 'Remaining Qty', 'Sold Qty', 'Progress %', 'Revenue', 'Cost', 'Profit', 'Status', 'Avg Unit Price', 'Received Date'];

      let billRow: any[] = [];
      if (isBatch) {
        const batchItems = inventory.filter((i: any) => i.batch_id === bill.batchId);
        const totals = batchItems.reduce((acc: any, it: any) => {
          const relatedSales = sales.filter((s: any) => s.inventory_item_id === it.id && new Date(s.created_at).getTime() >= new Date(it.received_at || it.created_at).getTime());
          const soldQty = relatedSales.reduce((s: number, r: any) => s + (r.quantity || 0), 0);
          const revenue = relatedSales.reduce((s: number, r: any) => s + (r.unit_price || 0) * (r.quantity || 0), 0);
          const origQty = it.received_quantity || it.quantity || 0;
          const cost = it.type === 'commission' ? ((it.batch_porterage || 0) + (it.batch_transfer_fee || 0)) : (it.price || 0) * origQty;
          acc.totalItems += 1;
          acc.totalOriginal += origQty;
          acc.totalRemaining += (it.quantity || 0);
          acc.totalSold += soldQty;
          acc.totalRevenue += revenue;
          acc.totalCost += cost;
          acc.totalProfit += revenue - cost;
          return acc;
        }, { totalItems: 0, totalOriginal: 0, totalRemaining: 0, totalSold: 0, totalRevenue: 0, totalCost: 0, totalProfit: 0 });
        
        billRow = [
          bill.batchId,
          `"${bill.supplierName}"`,
          bill.type,
          (bill.batchPorterage || 0).toFixed(2),
          (bill.batchTransferFee || 0).toFixed(2),
          bill.batchNotes ? `"${String(bill.batchNotes).replace(/\"/g, '"')}"` : '',
          totals.totalItems,
          totals.totalOriginal,
          totals.totalRemaining,
          totals.totalSold,
          totals.totalRevenue.toFixed(2),
          totals.totalCost.toFixed(2),
          totals.totalProfit.toFixed(2),
          new Date(bill.receivedAt).toLocaleString()
        ];
      } else {
        billRow = [
          `"${bill.productName}"`,
          `"${bill.supplierName}"`,
          bill.type,
          bill.originalQuantity,
          bill.remainingQuantity,
          bill.totalSoldQuantity,
          `${bill.progress.toFixed(1)}%`,
          (bill.totalRevenue || 0).toFixed(2),
          (bill.totalCost || 0).toFixed(2),
          (bill.totalProfit || 0).toFixed(2),
          bill.status,
          (bill.avgUnitPrice || 0).toFixed(2),
          new Date(bill.receivedAt).toLocaleString()
        ];
      }

      const salesHeader = ['Date', 'Customer', 'Quantity', 'Weight', 'Unit Price', 'Total Price', 'Payment Method', 'Notes'];
      const salesRows = processedSalesData.map((s: any) => [
        new Date(s.saleDate).toLocaleString(),
        `"${s.customerName}"`,
        s.quantity ?? '',
        s.weight ?? '',
        (s.unitPrice ?? 0).toFixed(2),
        (s.line_total ?? 0).toFixed(2),
        s.paymentMethod ?? '',
        s.notes ? `"${String(s.notes).replace(/\"/g, '""')}"` : ''
      ].join(','));

      const csvContent = [
        billHeaders.join(','),
        billRow.join(','),
        '',
        'Sales Lines',
        salesHeader.join(','),
        ...salesRows
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      const safeProduct = String(bill.productName || '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      const safeSupplier = String(bill.supplierName || '').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      link.setAttribute('download', `received-bill-${safeProduct}-${safeSupplier}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error exporting selected bill:', error);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Sales Logs"
        maxWidth="6xl"
      >
        {/* Subtitle */}
        <p className="text-md text-gray-600 -mt-4 mb-4">
          {bill.productName} - {bill.supplierName}
        </p>

        {/* Stats Cards */}
        <div className="mb-4">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-sm text-blue-700">Total Sales</p>
              <p className="text-lg font-bold text-blue-900">{processedSalesData.length}</p>
            </div>
            <div className="bg-green-50 p-3 rounded-lg">
              <p className="text-sm text-green-700">Total Revenue</p>
              <p className="text-lg font-bold text-green-900">{formatCurrency(processedSalesData.reduce((sum, item) => sum + (item.line_total || 0), 0))}</p>
            </div>
            <div className="bg-purple-50 p-3 rounded-lg">
              <p className="text-sm text-purple-700">Sold Quantity</p>
              <p className="text-lg font-bold text-purple-900">{processedSalesData.reduce((sum, item) => sum + (item.quantity || 0), 0)} {bill.unit}</p>
            </div>
            <div className="bg-orange-50 p-3 rounded-lg">
              <p className="text-sm text-orange-700">Avg Price</p>
              <p className="text-lg font-bold text-orange-900">{formatCurrency(processedSalesData.length > 0 ? processedSalesData.reduce((sum, item) => sum + (item.unitPrice || 0), 0) / processedSalesData.length : 0)}</p>
            </div>
            <div className="bg-indigo-50 p-3 rounded-lg">
              <p className="text-sm text-indigo-700">Total Received Weight</p>
              <p className="text-lg font-bold text-indigo-900">{bill.weight ? `${bill.weight} kg` : 'N/A'}</p>
            </div>
            <div className="bg-teal-50 p-3 rounded-lg">
              <p className="text-sm text-teal-700">Total Sold Weight</p>
              <p className="text-lg font-bold text-teal-900">{processedSalesData.reduce((sum, item) => sum + (item.weight || 0), 0)} kg</p>
            </div>
          </div>
        </div>

        {/* Sales Table */}
        {processedSalesData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Weight</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment Method</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {processedSalesData.map((item, index) => (
                  <tr key={`${item.saleId}-${index}`} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{new Date(item.saleDate).toLocaleDateString()}</div>
                      <div className="text-xs text-gray-500">{new Date(item.saleDate).toLocaleTimeString()}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{item.customerName}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{item.quantity} {bill.unit}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{item.weight ? `${item.weight} kg` : '-'}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{formatCurrency(item.unitPrice || 0)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{formatCurrency(item.line_total || 0)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.paymentMethod === 'cash' ? 'bg-green-100 text-green-800' : item.paymentMethod === 'card' ? 'bg-blue-100 text-blue-800' : item.paymentMethod === 'credit' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>
                        {item.paymentMethod}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <button onClick={() => onEditSale({ ...item, id: item.id, quantity: item.quantity, weight: item.weight, unit_price: item.unitPrice, payment_method: item.paymentMethod, notes: item.notes })} className="text-blue-600 hover:text-blue-800 p-1 rounded hover:bg-blue-50 transition-colors" title="Edit Sale">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => onDeleteSale({ ...item, id: item.id, saleId: item.saleId, customerName: item.customerName, totalPrice: item.line_total })} className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition-colors" title="Delete Sale">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Sales Recorded</h3>
            <p className="text-gray-500 mb-4">No sales have been recorded for this inventory item yet.</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-gray-200 flex justify-between items-center">
          <div className="text-sm text-gray-500">Showing {processedSalesData.length} sale record{processedSalesData.length !== 1 ? 's' : ''}</div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportSelectedBill}
              disabled={!bill.isClosed}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={!bill.isClosed ? 'Export is only available after closing the bill' : 'Export this received bill'}
            >
              Export Bill
            </button>
            <button
              onClick={closeBill}
              disabled={hasInvalidSalesLines || bill.isClosed}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={bill.isClosed ? 'Bill already closed' : hasInvalidSalesLines ? 'Cannot close bill: missing quantity or non-priced item(s) present' : 'Close this received bill'}
            >
              Close Bill
            </button>
            <button onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors">Close</button>
          </div>
        </div>
      </Modal>

      {/* Close Bill Confirmation Modal */}
      {showCloseBillModal && closeBillFees && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full max-h-[85vh] overflow-y-auto">
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Close Bill Confirmation</h2>
                <button onClick={() => setShowCloseBillModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Bill Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Product:</span>
                    <span className="font-medium">{bill.productName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Supplier:</span>
                    <span className="font-medium">{bill.supplierName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Type:</span>
                    <span className="font-medium capitalize">{bill.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Revenue:</span>
                    <span className="font-medium text-green-600">{formatCurrency(bill.totalRevenue)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-yellow-50 p-4 rounded-lg">
                <h3 className="text-sm font-medium text-yellow-700 mb-3">Fee Breakdown</h3>
                <div className="space-y-2 text-sm">
                  {bill.type === 'commission' && (
                    <>
                      <div className="flex justify-between">
                        <span>Commission ({bill.commissionRate || 0}%):</span>
                        <span className="font-medium text-red-600">-{formatCurrency(closeBillFees.commission)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Porterage:</span>
                        <span className="font-medium text-red-600">-{formatCurrency(closeBillFees.porterage)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Transfer Fee:</span>
                        <span className="font-medium text-red-600">-{formatCurrency(closeBillFees.transfer)}</span>
                      </div>
                    </>
                  )}
                  <div className="border-t pt-2 mt-2">
                    <div className="flex justify-between font-medium">
                      <span>Supplier Amount:</span>
                      <span className="text-green-600">{formatCurrency(closeBillFees.supplierAmount)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowCloseBillModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    if (onCloseBill) {
                      await onCloseBill(bill, closeBillFees);
                      setShowCloseBillModal(false);
                      setCloseBillFees(null);
                      onClose();
                      showToast('Bill closed successfully! Commission, porterage, and transfer fees deducted. Supplier balance updated.', 'success');
                      onMarkBillClosed(String(bill.id));
                    }
                  } catch (e) {
                    console.error('Error closing bill:', e);
                    showToast('Failed to close bill. Please try again.', 'error');
                  }
                }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Confirm Close Bill
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
