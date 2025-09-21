import Modal from "../../ui/Modal";
import EditSaleForm from "../forms/EditSaleForm";


interface EditSaleModalProps {
  isOpen: boolean;
  sale: any; // ideally you define a Sale type
  customers: any[];
  formatCurrency: (value: number) => string;
  onClose: () => void;
  onSave: (updatedSale: any) => void;
}

export default function EditSaleModal({
  isOpen,
  sale,
  customers,
  formatCurrency,
  onClose,
  onSave,
}: EditSaleModalProps) {
  if (!sale) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Sale"
      maxWidth="lg"
      headerBg="bg-gradient-to-r from-blue-600 to-blue-700"
    >
      <EditSaleForm
        sale={sale}
        customers={customers}
        formatCurrency={formatCurrency}
        onSave={onSave}
        onCancel={onClose}
      />
    </Modal>
  );
}
