import React from "react";

type LowStockItemProps = {
  productId: string | number;
  productName: string;
  currentStock: number;
  unit: string;
  lowStockLabel: string; // e.g. t('inventory.lowStock')
  remainingLabel: string; // e.g. t('inventory.remaining')
};

const LowStockItem: React.FC<LowStockItemProps> = ({
  productId,
  productName,
  currentStock,
  unit,
  lowStockLabel,
  remainingLabel,
}) => {
  return (
    <div
      key={productId}
      className="flex items-center justify-between p-3 bg-amber-50 rounded-lg"
    >
      <div>
        <p className="font-medium text-gray-900">{productName}</p>
        <p className="text-sm text-gray-600">
          {currentStock} {unit} {remainingLabel}
        </p>
      </div>
      <span className="px-2 py-1 bg-amber-200 text-amber-800 text-xs rounded-full">
        {lowStockLabel}
      </span>
    </div>
  );
};

export default LowStockItem;
