import { Modal } from '../../../common/Modal';
import { ReceivedBill } from './types';

interface ReceivedBillDetailsModalProps {
  bill: ReceivedBill | null;
  isOpen: boolean;
  onClose: () => void;
  onViewSalesLogs: (bill: ReceivedBill) => void;
  formatCurrency: (amount: number) => string;
  getStatusBadge: (status: string) => JSX.Element;
  t: (key: string) => string;
}

export function ReceivedBillDetailsModal({
  bill,
  isOpen,
  onClose,
  onViewSalesLogs,
  formatCurrency,
  getStatusBadge,
  t
}: ReceivedBillDetailsModalProps) {
  if (!bill) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('receivedBills.receivedBillDetails')}
      maxWidth="4xl"
      footer={
        <>
          <button
            onClick={() => onViewSalesLogs(bill)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            View Sales Logs
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Close
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Basic Information */}
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Product</label>
              <p className="text-sm text-gray-900">{bill.productName}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Supplier</label>
              <p className="text-sm text-gray-900">{bill.supplierName}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Type</label>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${bill.type === 'commission' ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'}`}>
                {bill.type}
              </span>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Received Date</label>
              <p className="text-sm text-gray-900">{new Date(bill.receivedAt).toLocaleDateString()}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Received By</label>
              <p className="text-sm text-gray-900">{bill.receivedBy}</p>
            </div>
          </div>
        </div>

        {/* Quantity & Progress */}
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-4">Quantity & Progress</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">Original Quantity</label>
              <p className="text-sm text-gray-900">{bill.originalQuantity} {bill.unit}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Remaining Quantity</label>
              <p className="text-sm text-gray-900">{bill.remainingQuantity} {bill.unit}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Sold Quantity</label>
              <p className="text-sm text-gray-900">{bill.totalSoldQuantity} {bill.unit}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Total Received Weight</label>
              <p className="text-sm text-gray-900">{bill.weight ? `${bill.weight} kg` : 'N/A'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Total Sold Weight</label>
              <p className="text-sm text-gray-900">
                {(bill as any).relatedSales 
                  ? (bill as any).relatedSales.reduce((sum: number, sale: any) => sum + (sale.weight || 0), 0) 
                  : 0} kg
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Progress</label>
              <div className="flex items-center mt-1">
                <div className="w-full bg-gray-200 rounded-full h-2 mr-2">
                  <div className="bg-blue-600 h-2 rounded-full" style={{ width: `${bill.progress}%` }}></div>
                </div>
                <span className="text-sm text-gray-900">{bill.progress.toFixed(1)}%</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Status</label>
              <div className="mt-1">{getStatusBadge(bill.status)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Financial Information */}
      <div className="mt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Financial Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-green-50 p-4 rounded-lg">
            <label className="block text-sm font-medium text-green-700">Total Revenue</label>
            <p className="text-2xl font-bold text-green-900">{formatCurrency(bill.totalRevenue)}</p>
          </div>
          <div className="bg-red-50 p-4 rounded-lg">
            <label className="block text-sm font-medium text-red-700">Total Cost</label>
            <p className="text-2xl font-bold text-red-900">{formatCurrency(bill.totalCost)}</p>
          </div>
          <div className="bg-blue-50 p-4 rounded-lg">
            <label className="block text-sm font-medium text-blue-700">Total Profit</label>
            <p className="text-2xl font-bold text-blue-900">{formatCurrency(bill.totalProfit)}</p>
          </div>
        </div>
      </div>

      {/* Commission Details (if applicable) */}
      {bill.type === 'commission' && (
        <div className="mt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Commission Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Porterage</label>
              <p className="text-sm text-gray-900">{formatCurrency((bill as any).porterage || 0)}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Transfer Fee</label>
              <p className="text-sm text-gray-900">{formatCurrency((bill as any).transferFee || 0)}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Commission Rate</label>
              <p className="text-sm text-gray-900">{bill.commissionRate ? `${bill.commissionRate}%` : 'N/A'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Average Unit Price</label>
              <p className="text-sm text-gray-900">{formatCurrency(bill.avgUnitPrice)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Notes (if present) */}
      {(bill as any).notes && (
        <div className="mt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Notes</h3>
          <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded-lg">{(bill as any).notes}</p>
        </div>
      )}
    </Modal>
  );
}
