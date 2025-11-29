import { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple';
  size?: 'sm' | 'md';
  className?: string;
}

export default function Badge({
  children,
  variant = 'default',
  size = 'md',
  className = '',
}: BadgeProps) {
  const variants = {
    default: 'bg-gray-100 text-gray-800',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    danger: 'bg-red-100 text-red-800',
    info: 'bg-blue-100 text-blue-800',
    purple: 'bg-purple-100 text-purple-800',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </span>
  );
}

// Helper function to get status badge variant
export function getStatusVariant(
  status: string
): 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' {
  switch (status) {
    case 'active':
      return 'success';
    case 'trial':
      return 'info';
    case 'suspended':
    case 'expired':
      return 'warning';
    case 'cancelled':
    case 'archived':
      return 'danger';
    default:
      return 'default';
  }
}

// Helper function to get subscription tier badge variant
export function getTierVariant(
  tier: string
): 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' {
  switch (tier) {
    case 'starter':
      return 'default';
    case 'professional':
      return 'info';
    case 'premium':
      return 'purple';
    default:
      return 'default';
  }
}
