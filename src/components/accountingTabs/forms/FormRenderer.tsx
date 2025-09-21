import React from "react";
import { ReceiveForm } from "./ReceiveForm";
import { PayForm } from "./PayForm";
import { ExpenseForm } from "./ExpenseForm";

interface FormRendererProps {
  formType: "receive" | "pay" | "expense" | null;
  formProps: any;
}

export const FormRenderer: React.FC<FormRendererProps> = ({ formType, formProps }) => {
  switch (formType) {
    case "receive":
      return <ReceiveForm {...formProps} />;
    case "pay":
      return <PayForm {...formProps} />;
    case "expense":
      return <ExpenseForm {...formProps} />;
    default:
      return null;
  }
};
