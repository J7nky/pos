import { useState, useEffect } from 'react';

interface UseInventoryFormsReturn {
  // Product form
  productForm: {
    name: string;
    category: 'Fruits' | 'Vegetables' | 'Herbs' | 'Nuts' | 'Others';
    image: string;
    capturedPhoto: string;
  };
  setProductForm: (form: any) => void;
  productErrors: any;
  setProductErrors: (errors: any) => void;
  validateProductForm: () => any;

  // Supplier form
  supplierForm: {
    name: string;
    phone: string;
    email: string;
    address: string;
    type: 'commission' | 'cash';
  };
  setSupplierForm: (form: any) => void;
  supplierErrors: any;
  setSupplierErrors: (errors: any) => void;
  validateSupplierForm: () => any;

  // Receive form
  receiveForm: {
    supplier_id: string;
    type: 'commission' | 'cash';
    porterage_fee: string;
    transfer_fee: string;
    commission_rate: string;
    status: string;
    empty_plastic: boolean;
    plastic_count: string;
    plastic_price: string;
    received_at: string;
  };
  setReceiveForm: (form: any) => void;
  receiveErrors: any;
  setReceiveErrors: (errors: any) => void;

  // Reset functions
  resetProductForm: () => void;
  resetSupplierForm: () => void;
  resetReceiveForm: () => void;
}

export const useInventoryForms = (defaultCommissionRate: number): UseInventoryFormsReturn => {
  // Product form state
  const [productForm, setProductForm] = useState({
    name: '',
    category: 'Fruits' as 'Fruits' | 'Vegetables' | 'Herbs' | 'Nuts' | 'Others',
    image: '',
    capturedPhoto: ''
  });

  // Supplier form state
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    type: 'commission' as 'commission' | 'cash'
  });

  // Receive form state
  const [receiveForm, setReceiveForm] = useState({
    supplier_id: '',
    type: 'commission' as 'commission' | 'cash',
    porterage_fee: '',
    transfer_fee: '',
    commission_rate: '',
    status: '',
    empty_plastic: false,
    plastic_count: '',
    plastic_price: '',
    received_at: new Date().toISOString().split('T')[0] // Today's date in YYYY-MM-DD format
  });

  // Error states
  const [productErrors, setProductErrors] = useState<any>({});
  const [supplierErrors, setSupplierErrors] = useState<any>({});
  const [receiveErrors, setReceiveErrors] = useState<any>({});

  // Update commission rate when form opens or supplier changes
  useEffect(() => {
    if (receiveForm.type === 'commission' && receiveForm.supplier_id) {
      // Always use the global default commission rate
      const expectedRate = defaultCommissionRate?.toString() || '10';
      if (receiveForm.commission_rate !== expectedRate) {
        setReceiveForm(prev => ({ ...prev, commission_rate: expectedRate }));
      }
    } else if (receiveForm.type === 'cash') {
      // Clear commission rate for cash purchases
      if (receiveForm.commission_rate !== '') {
        setReceiveForm(prev => ({ ...prev, commission_rate: '' }));
      }
    }
  }, [receiveForm.supplier_id, receiveForm.type, defaultCommissionRate, receiveForm.commission_rate]);

  // Validation functions
  const validateProductForm = () => {
    const errors: any = {};
    if (!productForm.name) errors.name = 'Product name is required.';
    if (!productForm.category) errors.category = 'Category is required.';
    return errors;
  };

  const validateSupplierForm = () => {
    const errors: any = {};
    if (!supplierForm.name) errors.name = 'Supplier name is required.';
    if (!supplierForm.phone) errors.phone = 'Phone is required.';
    return errors;
  };

  // Reset functions
  const resetProductForm = () => {
    setProductForm({
      name: '',
      category: 'Fruits',
      image: '',
      capturedPhoto: ''
    });
    setProductErrors({});
  };

  const resetSupplierForm = () => {
    setSupplierForm({
      name: '',
      phone: '',
      email: '',
      address: '',
      type: 'commission'
    });
    setSupplierErrors({});
  };

  const resetReceiveForm = () => {
    setReceiveForm({
      supplier_id: '',
      type: 'commission',
      porterage_fee: '',
      transfer_fee: '',
      commission_rate: '',
      status: '',
      empty_plastic: false,
      plastic_count: '',
      plastic_price: '',
      received_at: new Date().toISOString().split('T')[0] // Today's date in YYYY-MM-DD format
    });
    setReceiveErrors({});
  };

  return {
    // Product form
    productForm,
    setProductForm,
    productErrors,
    setProductErrors,
    validateProductForm,

    // Supplier form
    supplierForm,
    setSupplierForm,
    supplierErrors,
    setSupplierErrors,
    validateSupplierForm,

    // Receive form
    receiveForm,
    setReceiveForm,
    receiveErrors,
    setReceiveErrors,

    // Reset functions
    resetProductForm,
    resetSupplierForm,
    resetReceiveForm,
  };
};


