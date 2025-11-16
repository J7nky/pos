import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface CustomerFormContextValue {
  addCustomerRequestedFromPOS: boolean;
  requestAddCustomerFromPOS: () => void;
  clearAddCustomerRequest: () => void;
}

const CustomerFormContext = createContext<CustomerFormContextValue | undefined>(undefined);

export const CustomerFormProvider = ({ children }: { children: ReactNode }) => {
  const [addCustomerRequestedFromPOS, setAddCustomerRequestedFromPOS] = useState(false);

  const requestAddCustomerFromPOS = useCallback(() => {
    setAddCustomerRequestedFromPOS(true);
  }, []);

  const clearAddCustomerRequest = useCallback(() => {
    setAddCustomerRequestedFromPOS(false);
  }, []);

  return (
    <CustomerFormContext.Provider
      value={{ addCustomerRequestedFromPOS, requestAddCustomerFromPOS, clearAddCustomerRequest }}
    >
      {children}
    </CustomerFormContext.Provider>
  );
};

export const useCustomerForm = (): CustomerFormContextValue => {
  const ctx = useContext(CustomerFormContext);
  if (!ctx) {
    throw new Error('useCustomerForm must be used within a CustomerFormProvider');
  }
  return ctx;
};
