import React from "react";
import Modal from "../../ui/Modal";
import { FormRenderer } from "../forms/FormRenderer";


interface PaymentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  formType: "receive" | "pay" | "expense" | null;
  formProps: any;
}

export const PaymentsModal: React.FC<PaymentsModalProps> = ({
  isOpen,
  onClose,
  formType,
  formProps
}) => {
  const titles: Record<string, string> = {
    receive: "Add Payment Received",
    pay: "Add Payment Sent",
    expense: "Add Expense"
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={formType ? titles[formType] : ""}
      maxWidth="2xl"
    >
      <FormRenderer formType={formType} formProps={{ ...formProps, onCancel: onClose }} />
    </Modal>
  );
};
