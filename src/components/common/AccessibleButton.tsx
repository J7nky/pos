import React, { forwardRef } from 'react';
import { LucideIcon } from 'lucide-react';

interface AccessibleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  icon?: LucideIcon;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  touchOptimized?: boolean;
  shortcut?: string;
  ariaLabel?: string;
}

const AccessibleButton = forwardRef<HTMLButtonElement, AccessibleButtonProps>(({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  loading = false,
  touchOptimized = false,
  shortcut,
  ariaLabel,
  children,
  className = '',
  disabled,
  ...props
}, ref) => {
  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 active:bg-blue-800',
    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-500 active:bg-gray-300',
    success: 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500 active:bg-green-800',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 active:bg-red-800',
    warning: 'bg-amber-600 text-white hover:bg-amber-700 focus:ring-amber-500 active:bg-amber-800',
    ghost: 'text-gray-700 hover:bg-gray-100 focus:ring-gray-500 active:bg-gray-200'
  };

  const sizeClasses = {
    sm: touchOptimized ? 'px-4 py-3 text-sm min-h-[44px]' : 'px-3 py-1.5 text-sm',
    md: touchOptimized ? 'px-6 py-4 text-base min-h-[48px]' : 'px-4 py-2 text-sm',
    lg: touchOptimized ? 'px-8 py-5 text-lg min-h-[52px]' : 'px-6 py-3 text-base',
    xl: touchOptimized ? 'px-10 py-6 text-xl min-h-[56px]' : 'px-8 py-4 text-lg'
  };

  const iconSizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
    xl: 'w-7 h-7'
  };

  const combinedClassName = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

  return (
    <button
      ref={ref}
      className={combinedClassName}
      disabled={disabled || loading}
      aria-label={ariaLabel || (typeof children === 'string' ? children : undefined)}
      title={shortcut ? `${ariaLabel || children} (${shortcut})` : undefined}
      {...props}
    >
      {loading && (
        <div className="animate-spin rounded-full border-2 border-current border-t-transparent w-4 h-4 mr-2" />
      )}
      
      {Icon && iconPosition === 'left' && !loading && (
        <Icon className={`${iconSizeClasses[size]} ${children ? 'mr-2' : ''}`} />
      )}
      
      {children}
      
      {Icon && iconPosition === 'right' && !loading && (
        <Icon className={`${iconSizeClasses[size]} ${children ? 'ml-2' : ''}`} />
      )}
      
      {shortcut && (
        <span className="ml-2 text-xs opacity-75 bg-black bg-opacity-20 px-1.5 py-0.5 rounded">
          {shortcut}
        </span>
      )}
    </button>
  );
});

AccessibleButton.displayName = 'AccessibleButton';

export default AccessibleButton;