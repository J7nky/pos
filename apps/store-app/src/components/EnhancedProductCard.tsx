import React, { useMemo } from "react";
import { Package } from "lucide-react";
import AccessibleButton from "./common/AccessibleButton";
import { useI18n } from "../i18n";
import { useProductMultilingual } from "../hooks/useMultilingual";
import { getProductTags } from "../utils/productTags";
interface InventoryItem {
  inventoryItemId: string;
  supplierName: string;
  quantity: number;
  receivedQuantity: number;
  sellingPrice?: number;
}

interface Product {
  id: string;
  name: string;
  category?: string;
  image?: string;
}

interface EnhancedProductCardProps {
  product: Product;
  inventoryItems: InventoryItem[];
  stock: number;
  showSalePrice: Record<string, boolean>;

  // Actions
  addToCart: (productId: string, inventoryItemId: string) => void;
  handleLongPress: (
    e: React.MouseEvent | React.TouchEvent,
    inventoryItemId: string,
    sellingPrice?: number
  ) => void;
  handleTouchStart: (
    e: React.TouchEvent,
    inventoryItemId: string,
    sellingPrice?: number
  ) => void;
  hideSalePrice: (inventoryItemId: string) => void;

  // Utils
  formatCurrency: (amount: number) => string;
}

const EnhancedProductCard: React.FC<EnhancedProductCardProps> = ({
  product,
  inventoryItems,
  stock,
  showSalePrice,
  addToCart,
  handleLongPress,
  handleTouchStart,
  hideSalePrice,
  formatCurrency,
}) => {
  const { t } = useI18n();
  const { getProductName } = useProductMultilingual();
  const productName = getProductName(product);
  
  // Get tags for this product
  const tags = useMemo(() => {
    const productTags = getProductTags(product.id);
    // Get unique tags (most recent for each unique note text)
    const uniqueTags = new Map<string, string>();
    productTags
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .forEach(tag => {
        if (!uniqueTags.has(tag.note.toLowerCase())) {
          uniqueTags.set(tag.note.toLowerCase(), tag.note);
        }
      });
    return Array.from(uniqueTags.values()).slice(0, 3); // Show max 3 tags
  }, [product.id]);

  return (
    <div className="group border border-gray-200 rounded-xl p-3 hover:shadow-lg hover:border-blue-300 transition-all duration-200 bg-white">
      {/* Product Image */}
      <div className="relative mb-3">
        {product.image ? (
          <img
            src={product.image}
            alt={productName}
            className="w-full h-40 object-cover rounded-lg group-hover:scale-105 transition-transform duration-200"
          />
        ) : (
          <div className="w-full h-40 flex items-center justify-center bg-gray-100 rounded-lg">
            <Package className="w-10 h-10 text-gray-400" />
          </div>
        )}
      </div>

      {/* Product Info */}
      <div className="space-y-2 mb-3">
        <h3 className="font-semibold text-gray-900 text-xs leading-tight group-hover:text-blue-600 transition-colors duration-200">
          {productName}
        </h3>
        <div className="flex items-center justify-between flex-wrap gap-1">
          {product.category && (
            <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {product.category}
            </span>
          )}
        </div>
        {/* Product Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {tags.map((tag, index) => (
              <span
                key={index}
                className="text-[9px] text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full border border-blue-200"
                title={tag}
              >
                {tag.length > 15 ? `${tag.substring(0, 15)}...` : tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Inventory Items */}
      {inventoryItems.length > 0 ? (
        <div className="space-y-2">
          {inventoryItems.map((item, index) => (
            <AccessibleButton
              key={item.inventoryItemId}
              onClick={() => addToCart(product.id, item.inventoryItemId)}
              onMouseDown={(e) =>
                handleLongPress(e, item.inventoryItemId, item.sellingPrice)
              }
              onTouchStart={(e) =>
                handleTouchStart(e, item.inventoryItemId, item.sellingPrice)
              }
              variant="ghost"
              size="sm"
              touchOptimized
              disabled={item.quantity === 0}
              className={`w-full p-2 rounded-lg border transition-all duration-200 text-left relative ${
                item.quantity === 0
                  ? "bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100 hover:border-blue-300 hover:shadow-md"
              }`}
              ariaLabel={`Add ${productName} from ${item.supplierName}`}
              tabIndex={100 + index}
            >
              <div className="space-y-1">
                <div className="font-medium text-xs">{item.supplierName}</div>
                <div className="flex items-center justify-between text-[10px]">
                  <span
                    className={`px-1.5 py-0.5 rounded-full ${
                      item.quantity === 0
                        ? "bg-red-100 text-red-700"
                        : "bg-green-100 text-green-700"
                    }`}
                  >
                    {item.quantity} {t('common.labels.available')}
                  </span>
                  {item.sellingPrice && item.sellingPrice > 0 && (
                    <span className="text-[8px] text-yellow-600 bg-yellow-100 px-1 py-0.5 rounded-full">
                      {t('pos.price')}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-gray-500">
                  {t('common.labels.received')}: {item.receivedQuantity}
                </div>

                {/* Sale Price Tooltip */}
                {showSalePrice[item.inventoryItemId] &&
                  item.sellingPrice &&
                  item.sellingPrice > 0 && (
                    <div
                      className="absolute top-0 left-0 right-0 bg-yellow-100 border border-yellow-300 rounded-lg p-2 shadow-lg z-10 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        hideSalePrice(item.inventoryItemId);
                      }}
                    >
                      <div className="text-xs font-semibold text-yellow-800 text-center">
                        Sale Price: {formatCurrency(item.sellingPrice)}
                      </div>
                      <div className="text-[10px] text-yellow-600 text-center mt-1">
                        {t('common.labels.clickToHide')}
                      </div>
                    </div>
                  )}
              </div>
            </AccessibleButton>
          ))}
        </div>
      ) : (
        <div className="text-center py-4">
          <div className="bg-gray-100 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-2">
            <Package className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-[10px] text-gray-500">Out of Stock</p>
        </div>
      )}
    </div>
  );
};

export default EnhancedProductCard;
