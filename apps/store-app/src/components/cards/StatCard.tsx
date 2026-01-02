import React, { memo } from "react";
import { useI18n } from '../../i18n';
import { Repeat } from 'lucide-react';

type Stat = {
  title: string;
  value: string | number;
  change?: string;
  color: string; // Tailwind class e.g. "bg-green-500"
  icon: React.ElementType;
  isLoading?: boolean; // Optional loading state
  isCashDrawer?: boolean; // NEW: Identify cash drawer card
  showCombinedBalance?: boolean; // NEW: Toggle state
  onToggleCombined?: () => void; // NEW: Toggle handler
  onClick?: () => void; // NEW: Click handler for card
};

interface StatCardProps {
  stat: Stat;
  index: number;
  cashDrawerStatus?: {
    openedAt?: string | null;
  };
  handleOpenDrawer?: () => void;
}

const StatCard: React.FC<StatCardProps> = memo(({
  stat,
  index,
  cashDrawerStatus,
  handleOpenDrawer,
}) => {
  // Only first card may show "Open Cash Drawer"
  const shouldShowButton =
    index === 0 &&
    (!cashDrawerStatus || !cashDrawerStatus.openedAt) &&
    typeof handleOpenDrawer === "function";
  const { t } = useI18n();
  
  // Check if value is multi-line (dual currency view)
  const isMultiLine = stat.isCashDrawer && !stat.showCombinedBalance && typeof stat.value === 'string' && stat.value.includes('\n');
  const displayValue = isMultiLine && typeof stat.value === 'string' 
    ? stat.value.split('\n') 
    : [String(stat.value)];
  
  const handleCardClick = (e: React.MouseEvent) => {
    // Don't trigger card click if clicking on a button or interactive element
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    if (stat.onClick && !shouldShowButton) {
      stat.onClick();
    }
  };

  const isClickable = stat.onClick && !shouldShowButton;

  return (
    <div 
      className={`bg-white rounded-lg shadow-sm p-6 ${isClickable ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={handleCardClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-600">{stat.title}</p>
          <div className="flex items-center mt-2 gap-2">
            {isMultiLine ? (
              <div className="flex flex-col">
                {displayValue.map((line: string, idx: number) => (
                  <p key={idx} className="text-2xl font-bold text-gray-900">
                    {line}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            )}
        
            {/* Toggle button for cash drawer card */}
            {stat.isCashDrawer && stat.onToggleCombined && (
              <button
                onClick={stat.onToggleCombined}
                className="ml-2 p-1.5 rounded-lg  border border-gray-200 border-color-blue-200 hover:bg-gray-100 transition-colors"
                title={stat.showCombinedBalance ? t('home.showBothCurrencies') : t('home.showCombined')}
                aria-label={stat.showCombinedBalance ? t('home.showBothCurrencies') : t('home.showCombined')}
              >
                <Repeat className="w-4 h-4 text-gray-600" />
              </button>
            )}
          </div>
          {stat.change && (
            <p className="text-sm text-gray-500 mt-1">{stat.change}</p>
          )}
        </div>
        <div className={`p-3 rounded-full ${stat.color} ${stat.isLoading ? 'opacity-75' : ''}`}>
          <stat.icon className="w-6 h-6 text-white" />
        </div>
      </div>

      {shouldShowButton && (
        <button
          onClick={handleOpenDrawer}
          className="mt-3 w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors text-sm"
        >
          {t('home.openCashDrawer')}
        </button>
      )}
    </div>
  );
});

StatCard.displayName = 'StatCard';

export default StatCard;
