import { Trash2 } from "lucide-react";
import Modal from "../../ui/Modal";

interface DeleteSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  itemLabel?: string; // e.g. "Sale", "Customer", "Payment"
  itemDetails?: { label: string; value: string | number }[]; // key-value pairs
}

export default function DeleteSaleModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Delete Item",
  itemLabel = "Item",
  itemDetails = []
}: DeleteSaleModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="md"
      headerBg="bg-gradient-to-r from-red-600 to-red-700"
    >
      <div className="mb-6">
        {/* Header icon + warning */}
        <div className="flex items-center mb-4">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mr-4">
            <Trash2 className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <p className="text-gray-900 font-medium">Confirm Deletion</p>
            <p className="text-gray-600 text-sm">This action cannot be undone.</p>
          </div>
        </div>

        {/* Details */}
        {itemDetails.length > 0 && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-red-800 mb-2">
              {itemLabel} Details
            </h4>
            <div className="space-y-1 text-sm text-red-700">
              {itemDetails.map((detail, idx) => (
                <p key={idx}>
                  <strong>{detail.label}: </strong> {detail.value}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer buttons */}
      <div className="flex justify-end space-x-3">
        <button
          onClick={onClose}
          className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium flex items-center"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Delete {itemLabel}
        </button>
      </div>
    </Modal>
  );
}
