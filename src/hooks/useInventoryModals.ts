import { useState, useEffect } from 'react';

interface UseInventoryModalsReturn {
  // Modal states
  showReceiveForm: boolean;
  setShowReceiveForm: (show: boolean) => void;
  showAddProductForm: boolean;
  setShowAddProductForm: (show: boolean) => void;
  showAddSupplierForm: boolean;
  setShowAddSupplierForm: (show: boolean) => void;
  showEditProductModal: boolean;
  setShowEditProductModal: (show: boolean) => void;
  showDeleteProductModal: boolean;
  setShowDeleteProductModal: (show: boolean) => void;

  // Edit/Delete data
  editProductData: any;
  setEditProductData: (data: any) => void;
  deleteProductData: any;
  setDeleteProductData: (data: any) => void;
  editItem: any;
  setEditItem: (item: any) => void;
  deleteItem: any;
  setDeleteItem: (item: any) => void;

  // Loading states
  loading: {
    form?: boolean;
    product?: boolean;
    supplier?: boolean;
    initial?: boolean;
  };
  setLoading: (loading: any) => void;

  // Toast state
  toast: { type: 'success' | 'error'; message: string } | null;
  showToast: (type: 'success' | 'error', message: string) => void;

  // Camera states
  isCameraActive: boolean;
  setIsCameraActive: (active: boolean) => void;
  cameraError: string;
  setCameraError: (error: string) => void;
  imageLoading: boolean;
  setImageLoading: (loading: boolean) => void;

  // Helper functions
  openEditProduct: (product: any) => void;
  openDeleteProduct: (product: any) => void;
  openEditInventory: (item: any) => void;
  openDeleteInventory: (item: any) => void;
}

export const useInventoryModals = (): UseInventoryModalsReturn => {
  // Modal states
  const [showReceiveForm, setShowReceiveForm] = useState(false);
  const [showAddProductForm, setShowAddProductForm] = useState(false);
  const [showAddSupplierForm, setShowAddSupplierForm] = useState(false);
  const [showEditProductModal, setShowEditProductModal] = useState(false);
  const [showDeleteProductModal, setShowDeleteProductModal] = useState(false);

  // Edit/Delete data
  const [editProductData, setEditProductData] = useState<any>(null);
  const [deleteProductData, setDeleteProductData] = useState<any>(null);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  // Loading states
  const [loading, setLoading] = useState<{
    form?: boolean;
    product?: boolean;
    supplier?: boolean;
    initial?: boolean;
  }>({ initial: false });

  // Toast state
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Camera states
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [imageLoading, setImageLoading] = useState(false);

  // Toast helper
  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  // Helper functions
  const openEditProduct = (product: any) => {
    setEditProductData(product);
    setShowEditProductModal(true);
  };

  const openDeleteProduct = (product: any) => {
    setDeleteProductData(product);
    setShowDeleteProductModal(true);
  };

  const openEditInventory = (item: any) => {
    setEditItem(item);
  };

  const openDeleteInventory = (item: any) => {
    setDeleteItem(item);
  };

  // Keyboard support - Escape to close modals
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showReceiveForm) setShowReceiveForm(false);
        if (showAddProductForm) setShowAddProductForm(false);
        if (showAddSupplierForm) setShowAddSupplierForm(false);
        if (showEditProductModal) setShowEditProductModal(false);
        if (showDeleteProductModal) setShowDeleteProductModal(false);
        if (editItem) setEditItem(null);
        if (deleteItem) setDeleteItem(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showReceiveForm, showAddProductForm, showAddSupplierForm, showEditProductModal, showDeleteProductModal, editItem, deleteItem]);

  return {
    // Modal states
    showReceiveForm,
    setShowReceiveForm,
    showAddProductForm,
    setShowAddProductForm,
    showAddSupplierForm,
    setShowAddSupplierForm,
    showEditProductModal,
    setShowEditProductModal,
    showDeleteProductModal,
    setShowDeleteProductModal,

    // Edit/Delete data
    editProductData,
    setEditProductData,
    deleteProductData,
    setDeleteProductData,
    editItem,
    setEditItem,
    deleteItem,
    setDeleteItem,

    // Loading states
    loading,
    setLoading,

    // Toast state
    toast,
    showToast,

    // Camera states
    isCameraActive,
    setIsCameraActive,
    cameraError,
    setCameraError,
    imageLoading,
    setImageLoading,

    // Helper functions
    openEditProduct,
    openDeleteProduct,
    openEditInventory,
    openDeleteInventory,
  };
};


