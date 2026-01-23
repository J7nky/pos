import React from 'react';

export interface StatCardProps {
    title: string;
    value: React.ReactNode;
    icon: React.ReactNode;
    borderColor: string;
    children?: React.ReactNode;
}

/**
 * A reusable stat card component for displaying key metrics.
 * Used in dashboards to show statistics with an icon and optional children.
 */
export const StatCard: React.FC<StatCardProps> = React.memo(({
    title,
    value,
    icon,
    borderColor,
    children,
}) => (
    <div
        className={`bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 p-6 border-l-4 ${borderColor}`}
    >
        <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-600 font-medium truncate">{title}</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
                {children}
            </div>
            <div className="p-3 bg-gray-50 rounded-full ml-4 flex-shrink-0">{icon}</div>
        </div>
    </div>
));

StatCard.displayName = 'StatCard';

export default StatCard;
