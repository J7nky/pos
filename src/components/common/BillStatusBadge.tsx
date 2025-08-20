import React from 'react';
import { CheckCircle, Clock, XCircle, AlertTriangle, CreditCard, DollarSign } from 'lucide-react';

interface BillStatusBadgeProps {
  status: 'active' | 'cancelled' | 'refunded';
  paymentStatus: 'paid' | 'partial' | 'pending';
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export default function BillStatusBadge({ 
  status, 
  paymentStatus, 
  size = 'md', 
  showIcon = true 
}: BillStatusBadgeProps) {
  const getStatusConfig = () => {
    // Primary status (bill status)
    if (status === 'cancelled') {
      return {
        color: 'bg-red-100 text-red-800 border-red-200',
        icon: XCircle,
        text: 'Cancelled'
      };
    }
    
    if (status === 'refunded') {
      return {
        color: 'bg-purple-100 text-purple-800 border-purple-200',
        icon: AlertTriangle,
        text: 'Refunded'
      };
    }

    // Active bills - show payment status
    switch (paymentStatus) {
      case 'paid':
        return {
          color: 'bg-green-100 text-green-800 border-green-200',
          icon: CheckCircle,
          text: 'Paid'
        };
      case 'partial':
        return {
          color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
          icon: CreditCard,
          text: 'Partial'
        };
      case 'pending':
        return {
          color: 'bg-orange-100 text-orange-800 border-orange-200',
          icon: Clock,
          text: 'Pending'
        };
      default:
        return {
          color: 'bg-gray-100 text-gray-800 border-gray-200',
          icon: AlertTriangle,
          text: 'Unknown'
        };
    }
  };

  const config = getStatusConfig();
  
  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base'
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  return (
    <span className={`inline-flex items-center ${sizeClasses[size]} font-medium rounded-full border ${config.color}`}>
      {showIcon && <config.icon className={`${iconSizes[size]} mr-1`} />}
      {config.text}
    </span>
  );
}