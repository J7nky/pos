import React, { useMemo } from 'react';
import type { CurrencyCode } from '@pos-platform/shared';
import { CURRENCY_META } from '@pos-platform/shared';
import { useI18n } from '../../i18n';

export interface AcceptedCurrencySelectProps {
  acceptedCurrencies: CurrencyCode[];
  value: CurrencyCode;
  onChange: (code: CurrencyCode) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  size?: 'sm' | 'md';
  'aria-label'?: string;
}

/**
 * Single-select for store-accepted currencies (replaces fixed USD/LBP toggle).
 */
const AcceptedCurrencySelect: React.FC<AcceptedCurrencySelectProps> = ({
  acceptedCurrencies,
  value,
  onChange,
  disabled = false,
  id,
  className = '',
  size = 'md',
  'aria-label': ariaLabel,
}) => {
  const { t } = useI18n();
  const codes = useMemo(() => [...acceptedCurrencies], [acceptedCurrencies]);
  const sizeCls = size === 'sm' ? 'text-xs px-2 py-1' : 'text-sm px-3 py-2';

  if (codes.length <= 1) {
    const only = codes[0] ?? value;
    const label = t(`common.currency.${only}`) || CURRENCY_META[only]?.code || only;
    return (
      <span
        className={`inline-flex items-center rounded-md border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-200 font-medium ${sizeCls} ${className}`}
        title={label}
      >
        {label}
      </span>
    );
  }

  return (
    <select
      id={id}
      aria-label={ariaLabel}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value as CurrencyCode)}
      className={`rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-slate-100 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${sizeCls} ${className}`}
    >
      {codes.map((code) => (
        <option key={code} value={code}>
          {t(`common.currency.${code}`) || CURRENCY_META[code]?.name || code}
        </option>
      ))}
    </select>
  );
};

export default AcceptedCurrencySelect;
