import { useState, useEffect } from 'react';
import { useLocalStorage } from './useLocalStorage';

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
    porterage_currency: 'USD' | 'LBP';
    transfer_fee: string;
    transfer_currency: 'USD' | 'LBP';
    commission_rate: number | null;
    status: string;
    empty_plastic: boolean;
    plastic_count: string;
    plastic_price: string;
    plastic_currency: 'USD' | 'LBP';
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
  // Local storage for persisting supplier selection
  const [lastSelectedSupplierId, setLastSelectedSupplierId] = useLocalStorage<string>('inventory_last_supplier_id', '');
  const [lastSelectedType, setLastSelectedType] = useLocalStorage<string>('inventory_last_type', 'commission');

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

  // Receive form state - initialize with persisted values
  const [receiveForm, setReceiveForm] = useState({
    supplier_id: lastSelectedSupplierId,
    type: lastSelectedType as 'commission' | 'cash',
    porterage_fee: '',
    porterage_currency: 'USD' as 'USD' | 'LBP',
    transfer_fee: '',
    transfer_currency: 'USD' as 'USD' | 'LBP',
    commission_rate: '',
    status: '',
    empty_plastic: false,
    plastic_count: '',
    plastic_price: '',
    plastic_currency: 'USD' as 'USD' | 'LBP',
    received_at: new Date().toISOString().split('T')[0] // Today's date in YYYY-MM-DD format
  });

  // Error states
  const [productErrors, setProductErrors] = useState<any>({});
  const [supplierErrors, setSupplierErrors] = useState<any>({});
  const [receiveErrors, setReceiveErrors] = useState<any>({});

  // Persist supplier selection and type changes
  useEffect(() => {
    if (receiveForm.supplier_id !== lastSelectedSupplierId) {
      setLastSelectedSupplierId(receiveForm.supplier_id);
    }
    if (receiveForm.type !== lastSelectedType) {
      setLastSelectedType(receiveForm.type);
    }
  }, [receiveForm.supplier_id, receiveForm.type, lastSelectedSupplierId, lastSelectedType, setLastSelectedSupplierId, setLastSelectedType]);

  // Update commission rate when form opens or supplier changes
  useEffect(() => {
    if (receiveForm.type === 'commission' && receiveForm.supplier_id) {
      // Only set default commission rate if it's empty, don't override user input
      const expectedRate = defaultCommissionRate?.toString() || '10';
      if (!receiveForm.commission_rate || receiveForm.commission_rate === '') {
        setReceiveForm(prev => ({ ...prev, commission_rate: expectedRate }));
      }
    } else if (receiveForm.type === 'cash') {
      // Clear commission rate for cash purchases
      if (receiveForm.commission_rate !== '') {
        setReceiveForm(prev => ({ ...prev, commission_rate: '' }));
      }
    }
  }, [receiveForm.supplier_id, receiveForm.type, defaultCommissionRate]);

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
      supplier_id: lastSelectedSupplierId, // Preserve last selected supplier
      type: lastSelectedType as 'commission' | 'cash', // Preserve last selected type
      porterage_fee: '',
      porterage_currency: 'USD' as 'USD' | 'LBP',
      transfer_fee: '',
      transfer_currency: 'USD' as 'USD' | 'LBP',
      commission_rate: '',
      status: '',
      empty_plastic: false,
      plastic_count: '',
      plastic_price: '',
      plastic_currency: 'USD' as 'USD' | 'LBP',
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


