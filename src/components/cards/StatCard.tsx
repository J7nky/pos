import React, { memo } from "react";

type Stat = {
  title: string;
  value: string | number;
  change?: string;
  color: string; // Tailwind class e.g. "bg-green-500"
  icon: React.ElementType;
  isLoading?: boolean; // Optional loading state
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

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{stat.title}</p>
          <div className="flex items-center mt-2">
            <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            {stat.isLoading && (
              <div className="ml-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-400"></div>
              </div>
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
          Open Cash Drawer
        </button>
      )}
    </div>
  );
});

StatCard.displayName = 'StatCard';

export default StatCard;
