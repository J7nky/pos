import Modal from "../../ui/Modal";
import EditSaleForm from "../forms/EditSaleForm";


interface EditSaleModalProps {
  isOpen: boolean;
  originalSale: any;
  sale: any; // ideally you define a Sale type
  entities: any[]; // Unified entities array
  formatCurrency: (value: number) => string;
  onClose: () => void;
  onSave: (updatedSale: any) => void;
}

export default function EditSaleModal({
  isOpen,
  originalSale,
  sale,
  entities,
  formatCurrency,
  onClose,
  onSave,
}: EditSaleModalProps) {
  // Filter for customers only
  const customers = entities.filter((e: any) => e.entity_type === 'customer' && !e._deleted);
  
  console.log('EditSaleModal props:', { isOpen, originalSale, sale, customers: customers?.length });
  
  if (!sale) {
    console.log('EditSaleModal: sale is null/undefined');
    return null;
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Sale"
      maxWidth="lg"
      headerBg="bg-gradient-to-r from-blue-600 to-blue-700"
    >
      <EditSaleForm
        originalSale={originalSale}
        sale={sale}
        customers={customers}
        formatCurrency={formatCurrency}
        onSave={onSave}
        onCancel={onClose}
      />
    </Modal>
  );
}
