import React from 'react';
import { Receipt, User, Calendar, DollarSign, CreditCard } from 'lucide-react';
import { useCurrency } from '../../hooks/useCurrency';
import BillStatusBadge from './BillStatusBadge';

interface BillSummaryCardProps {
  bill: {
    id: string;
    bill_number: string;
    customer_name: string | null;
    total_amount: number;
    amount_paid: number;
    amount_due: number;
    payment_method: 'cash' | 'card' | 'credit';
    payment_status: 'paid' | 'partial' | 'pending';
    status: 'active' | 'cancelled' | 'refunded';
    bill_date: string;
    notes?: string | null;
    created_by: string;
    users?: { name: string };
  };
  onClick?: () => void;
  showActions?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onViewAudit?: () => void;
}

export default function BillSummaryCard({ 
  bill, 
  onClick, 
  showActions = false,
  onEdit,
  onDelete,
  onViewAudit
}: BillSummaryCardProps) {
  const { formatCurrency } = useCurrency();

  return (
    <div 
      className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 ${
        onClick ? 'cursor-pointer hover:shadow-md hover:border-blue-300 transition-all' : ''
      }`}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center">
          <Receipt className="w-5 h-5 text-blue-600 mr-2" />
          <h3 className="font-semibold text-gray-900">{bill.bill_number}</h3>
        </div>
        <BillStatusBadge 
          status={bill.status} 
          paymentStatus={bill.payment_status}
          size="sm"
        />
      </div>

      {/* Customer and Date */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center text-sm text-gray-600">
          <User className="w-4 h-4 mr-2" />
          <span>{bill.customer_name || 'Walk-in Customer'}</span>
        </div>
        <div className="flex items-center text-sm text-gray-600">
          <Calendar className="w-4 h-4 mr-2" />
          <span>{new Date(bill.bill_date).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Financial Summary */}
      <div className="bg-gray-50 rounded-lg p-3 mb-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-gray-600">Total</p>
            <p className="font-semibold text-gray-900">{formatCurrency(bill.total_amount)}</p>
          </div>
          <div>
            <p className="text-gray-600">Paid</p>
            <p className="font-semibold text-green-600">{formatCurrency(bill.amount_paid)}</p>
          </div>
          {bill.amount_due > 0 && (
            <div className="col-span-2">
              <p className="text-gray-600">Due</p>
              <p className="font-semibold text-red-600">{formatCurrency(bill.amount_due)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Payment Method */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center text-gray-600">
          {bill.payment_method === 'cash' && <DollarSign className="w-4 h-4 mr-1" />}
          {bill.payment_method === 'card' && <CreditCard className="w-4 h-4 mr-1" />}
          {bill.payment_method === 'credit' && <User className="w-4 h-4 mr-1" />}
          <span className="capitalize">{bill.payment_method}</span>
        </div>
        <span className="text-gray-500">
          by {bill.users?.name || 'Unknown'}
        </span>
      </div>

      {/* Notes */}
      {bill.notes && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-600 italic">{bill.notes}</p>
        </div>
      )}

      {/* Actions */}
      {showActions && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex justify-end space-x-2">
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              Edit
            </button>
          )}
          {onViewAudit && (
            <button
              onClick={(e) => { e.stopPropagation(); onViewAudit(); }}
              className="text-purple-600 hover:text-purple-800 text-sm font-medium"
            >
              Audit
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="text-red-600 hover:text-red-800 text-sm font-medium"
            >
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  );
}