import React from "react";

interface SalesOverviewCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  iconColor?: string; // optional to override Tailwind color
}

const SalesOverviewCard: React.FC<SalesOverviewCardProps> = ({
  title,
  value,
  icon,
  iconColor = "text-gray-500",
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`w-8 h-8 ${iconColor}`}>{icon}</div>
      </div>
    </div>
  );
};

export default SalesOverviewCard;
