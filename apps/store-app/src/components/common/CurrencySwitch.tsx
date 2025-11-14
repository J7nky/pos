import React from 'react';
import { DollarSign } from 'lucide-react';
import { useI18n } from '../../i18n';

interface CurrencySwitchProps {
  value: 'USD' | 'LBP';
  onChange: (currency: 'USD' | 'LBP') => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const CurrencySwitch: React.FC<CurrencySwitchProps> = ({
  value,
  onChange,
  disabled = false,
  size = 'md',
  className = ''
}) => {
  const { t } = useI18n();
  const sizeClasses = {
    sm: 'text-xs px-2.5 py-1',
    md: 'text-sm px-3.5 py-2',
    lg: 'text-base px-5 py-2.5'
  };

  const iconSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => onChange('USD')}
        disabled={disabled}
        className={`
          ${sizeClasses[size]}
          rounded-md transition-all duration-200
          flex items-center gap-1.5 font-semibold
          ${value === 'USD'
            ? 'bg-white dark:bg-slate-700 text-green-600 dark:text-green-400 shadow-sm scale-105'
            : 'bg-transparent text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <DollarSign className={iconSizes[size]} strokeWidth={2.5} />
        <span>{t('common.currency.USD')}</span>
      </button>
      <button
        type="button"
        onClick={() => onChange('LBP')}
        disabled={disabled}
        className={`
          ${sizeClasses[size]}
          rounded-md transition-all duration-200
          flex items-center gap-1.5 font-semibold
          ${value === 'LBP'
            ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm scale-105'
            : 'bg-transparent text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <span className="font-bold text-base leading-none">{t('common.currency.LBP')}</span>
        
      </button>
    </div>
  );
};

export default CurrencySwitch;
