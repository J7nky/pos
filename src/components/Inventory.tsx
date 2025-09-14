import React, { useState } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useInventoryForms } from '../hooks/useInventoryForms';
import { useInventoryModals } from '../hooks/useInventoryModals';
import { Plus, Search, Package, Truck } from 'lucide-react';
import { SupabaseService } from '../services/supabaseService';
import { db } from '../lib/db';

// Import components
import ReceiveFormModal from './inventory/ReceiveFormModal';
import AddProductModal from './inventory/AddProductModal';
import EditProductModal from './inventory/EditProductModal';
import DeleteProductConfirm from './inventory/DeleteProductConfirm';
import EditInventoryModal from './inventory/EditInventoryModal';
import DeleteInventoryConfirm from './inventory/DeleteInventoryConfirm';
import RecentReceivesTable from './inventory/RecentReceivesTable';
import ProductTable from './inventory/ProductTable';

// Import types
import { Product, Supplier, InventoryItem } from '../types/inventory';


const Inventory: React.FC = () => {
  // Data from context
  const raw = useOfflineData();
  const products = raw.products.map(p => ({ ...p, createdAt: p.created_at })) as Product[];
  const suppliers = raw.suppliers.map(s => ({ ...s, createdAt: s.created_at, type: 'commission' as const })) as Supplier[];
  const inventory = raw.inventory.map(i => ({ 
    ...i, 
    createdAt: i.created_at, 
    product_id: i.product_id, 
    supplier_id: i.supplier_id, 
    created_at: i.created_at 
  })) as InventoryItem[];
  const addSupplier = raw.addSupplier;
  const addProduct = raw.addProduct;
  const defaultCommissionRate = raw.defaultCommissionRate;
  const { userProfile } = useSupabaseAuth();

  // Local storage for recent selections
  const [recentSuppliers, setRecentSuppliers] = useLocalStorage<string[]>('inventory_recent_suppliers', []);

  // Main state
  const [activeTab, setActiveTab] = useState<'receive' | 'stock'>('receive');
  const [searchTerm, setSearchTerm] = useState('');

  // Custom hooks
  const {
    supplierForm,
    setSupplierForm,
    supplierErrors,
    setSupplierErrors,
    validateSupplierForm,
    receiveForm,
    setReceiveForm,
    receiveErrors,
    setReceiveErrors,
    resetSupplierForm,
  } = useInventoryForms(defaultCommissionRate);

  const {
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
    editProductData,
    deleteProductData,
    editItem,
    setEditItem,
    deleteItem,
    setDeleteItem,
    loading,
    setLoading,
    toast,
    showToast,
    openEditProduct,
    openDeleteProduct,
    openEditInventory,
    openDeleteInventory,
  } = useInventoryModals();


  // Recent receives
  const recentReceives = inventory
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10);


  // Form handlers
  const handleSupplierSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateSupplierForm();
    setSupplierErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setLoading((l: any) => ({ ...l, supplier: true }));
    
    try {
      await addSupplier({
        name: supplierForm.name,
        phone: supplierForm.phone,
        email: supplierForm.email || '',
        address: supplierForm.address,
      });
      resetSupplierForm();
      setShowAddSupplierForm(false);
      showToast('success', 'Supplier added successfully!');
    } catch (err) {
      showToast('error', 'Failed to add supplier.');
    }
    setLoading((l: any) => ({ ...l, supplier: false }));
  };

  // Inventory operations
  const updateInventoryItem = async (item: any) => {
    await SupabaseService.updateInventoryItem(item.id, {
      quantity: Number(item.quantity),
      price: item.price ? Number(item.price) : null,
      status: item.status || null,
    });
  };

  const deleteInventoryItem = async (item: any) => {
    await db.transaction('rw', [db.bill_line_items, db.inventory_items], async () => {
      const relatedBillLineItems = await db.bill_line_items.where('inventory_item_id').equals(item.id).toArray();
      for (const bli of relatedBillLineItems) {
        await db.softDelete('bill_line_items', bli.id);
      }
      await db.softDelete('inventory_items', item.id);
    });

    try {
      await SupabaseService.deleteBillLineItemsByInventoryItem(item.id);
      await SupabaseService.deleteInventoryItem(item.id);
    } catch (err) {
      console.warn('Remote delete skipped or failed; will sync later:', err);
    }
  };

  const handleReceiveSuccess = async (data: any) => {
    console.log('batch123', data);
    const { batch } = data;
    await raw.addInventoryBatch({
      type: batch.type,
      supplier_id: batch.supplier_id,
      created_by: userProfile?.id || '',
      status: 'Created',
      porterage_fee: batch.porterage_fee,
      transfer_fee: batch.transfer_fee,
      items: batch.items,
      plastic_fee: batch.plastic_fee,
      commission_rate: batch.commission_rate
    });

    await raw.refreshData();
    showToast('success', 'Inventory received successfully!');
  };

  const handleProductUpdate = async (data: any) => {
    await SupabaseService.updateProduct(data.id, { 
      name: data.name, 
      category: data.category, 
      image: data.image 
    });
    await raw.refreshData();
    showToast('success', 'Product updated successfully!');
  };

  const handleProductDelete = async (product: any) => {
    try {
      await SupabaseService.deleteProduct(product.id);
      await db.products.delete(product.id);
      await raw.refreshData();
      showToast('success', 'Product deleted successfully!');
    } catch (error) {
      console.error('Error deleting product:', error);
      showToast('error', 'Failed to delete product.');
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Inventory Management</h1>
        {activeTab === 'receive' && (
          <button
            onClick={() => setShowReceiveForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            Receive Products
          </button>
        )}
        {activeTab === 'stock' && (
          <button
            onClick={() => setShowAddProductForm(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Product
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 mb-6 bg-gray-100 dark:bg-slate-800 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('receive')}
          className={`px-4 py-2 rounded-md transition-colors ${
            activeTab === 'receive' 
              ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-sm' 
              : 'text-gray-600 dark:text-slate-300'
          }`}
        >
          <Truck className="w-4 h-4 inline mr-2" />
          Product Reception
        </button>
        <button
          onClick={() => setActiveTab('stock')}
          className={`px-4 py-2 rounded-md transition-colors ${
            activeTab === 'stock' 
              ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-sm' 
              : 'text-gray-600 dark:text-slate-300'
          }`}
        >
          <Package className="w-4 h-4 inline mr-2" />
          Stock Products
        </button>
      </div>

      {/* Content based on active tab */}
      {activeTab === 'receive' && (
        <div className="space-y-6">
          <RecentReceivesTable 
            recentReceives={recentReceives} 
            products={products} 
            suppliers={suppliers} 
            onEdit={openEditInventory} 
            onDelete={openDeleteInventory} 
          />
        </div>
      )}

      {activeTab === 'stock' && (
        <div className="space-y-6">
          {/* Search */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-lg shadow-sm">
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Product Table */}
          <ProductTable
            products={products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))}
            onEdit={openEditProduct}
            onDelete={openDeleteProduct}
          />
        </div>
      )}

      {/* Modals */}
      <ReceiveFormModal
        open={showReceiveForm}
        onClose={() => setShowReceiveForm(false)}
        onSuccess={handleReceiveSuccess}
        products={products}
        suppliers={suppliers}
        defaultCommissionRate={defaultCommissionRate}
        recentSuppliers={recentSuppliers}
        setRecentSuppliers={setRecentSuppliers}
        form={receiveForm}
        setForm={setReceiveForm}
        errors={receiveErrors}
        setErrors={setReceiveErrors}
        addSupplier={addSupplier}
      />

      <AddProductModal
        open={showAddProductForm}
        onClose={() => setShowAddProductForm(false)}
        onSuccess={async (data: any) => {
          await addProduct(data);
          await raw.refreshData();
          showToast('success', 'Product added successfully!');
        }}
      />

      <EditProductModal
        open={showEditProductModal}
        onClose={() => setShowEditProductModal(false)}
        product={editProductData}
        onSuccess={handleProductUpdate}
      />

      <DeleteProductConfirm
        open={showDeleteProductModal}
        onClose={() => setShowDeleteProductModal(false)}
        product={deleteProductData}
        onDelete={handleProductDelete}
      />

      {editItem && (
        <EditInventoryModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={async (form: any) => {
            try {
              await updateInventoryItem(form);
              await raw.refreshData();
              showToast('success', 'Inventory item updated!');
            } catch {
              showToast('error', 'Failed to update inventory item.');
            }
            setEditItem(null);
          }}
        />
      )}

      {deleteItem && (
        <DeleteInventoryConfirm
          item={deleteItem}
          onClose={() => setDeleteItem(null)}
          onDelete={async (item: any) => {
            try {
              await deleteInventoryItem(item);
              await raw.refreshData();
              showToast('success', 'Inventory item deleted!');
            } catch {
              showToast('error', 'Failed to delete inventory item.');
            }
            setDeleteItem(null);
          }}
        />
      )}

      {/* Add Supplier Form Modal */}
      {showAddSupplierForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
            <div className="p-6 border-b border-gray-200 dark:border-slate-800 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">Add New Supplier</h2>
            </div>
            
            <form onSubmit={handleSupplierSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                    Supplier Name *
                  </label>
                  <input
                    type="text"
                    value={supplierForm.name}
                    onChange={(e) => setSupplierForm((prev: any) => ({ ...prev, name: e.target.value }))}
                    className={`w-full border ${supplierErrors.name ? 'border-red-500' : 'border-gray-300 dark:border-slate-700'} rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100`}
                    required
                  />
                  {supplierErrors.name && <p className="text-xs text-red-600 mt-1">{supplierErrors.name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                    Phone *
                  </label>
                  <input
                    type="tel"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm((prev: any) => ({ ...prev, phone: e.target.value }))}
                    className={`w-full border ${supplierErrors.phone ? 'border-red-500' : 'border-gray-300 dark:border-slate-700'} rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100`}
                    required
                  />
                  {supplierErrors.phone && <p className="text-xs text-red-600 mt-1">{supplierErrors.phone}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={supplierForm.email}
                    onChange={(e) => setSupplierForm((prev: any) => ({ ...prev, email: e.target.value }))}
                    className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                    Type *
                  </label>
                  <select
                    value={supplierForm.type}
                    onChange={(e) => setSupplierForm((prev: any) => ({ ...prev, type: e.target.value as 'commission' | 'cash' }))}
                    className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="commission">Commission</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                    Address
                  </label>
                  <textarea
                    value={supplierForm.address}
                    onChange={(e) => setSupplierForm((prev: any) => ({ ...prev, address: e.target.value }))}
                    className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100"
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddSupplierForm(false)}
                  className="px-4 py-2 text-gray-700 dark:text-slate-200 border border-gray-300 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  disabled={loading.supplier}
                >
                  {loading.supplier ? 'Adding...' : 'Add Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {(loading.form || loading.product || loading.supplier || loading.initial) && (
        <div className="fixed inset-0 backdrop-blur-[2px] bg-black/20 flex items-center justify-center z-50">
          <div className="w-16 h-16 border-4 border-blue-500/80 border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-4 right-4 px-4 py-2 rounded shadow-lg z-50 text-white ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default Inventory;
