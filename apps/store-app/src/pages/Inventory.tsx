import React, { useState, useMemo } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useInventoryForms } from '../hooks/useInventoryForms';
import { useInventoryModals } from '../hooks/useInventoryModals';
import { Plus, Search, Package, Truck, Archive } from 'lucide-react';
import ReceiveFormModal from '../components/inventory/ReceiveFormModal';
import AddProductModal from '../components/inventory/AddProductModal';
import EditProductModal from '../components/inventory/EditProductModal';
import DeleteProductConfirm from '../components/inventory/DeleteProductConfirm';
import EditInventoryModal from '../components/inventory/EditInventoryModal';
import DeleteInventoryConfirm from '../components/inventory/DeleteInventoryConfirm';
import RecentReceivesTable from '../components/inventory/RecentReceivesTable';
import ProductTable from '../components/inventory/ProductTable';
import ArchivedInventoryTab from '../components/inventory/ArchivedInventoryTab';
import { Product, Supplier, InventoryItem } from '../types/inventory';
import { useI18n } from '../i18n';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { parseMultilingualString } from '../utils/multilingual';
import { normalizeNameForComparison } from '../utils/nameNormalization';    

const Inventory: React.FC = () => {
  // Data from context
  const raw = useOfflineData();
  const products = raw.products.map(p => ({ ...p, createdAt: p.created_at })) as Product[];
  const suppliers = raw.suppliers.map(s => ({ ...s, createdAt: s.created_at, type: 'commission' as const })) as Supplier[];
  const inventoryBills = raw.inventoryBills || [];
  // Create batch map for supplier lookup
  const batchMap = new Map(inventoryBills.map(b => [b.id, b]));
  
  const inventory = raw.inventory.map(i => {
    // Get supplier_id from batch instead of from item
    const batch = i.batch_id ? batchMap.get(i.batch_id) : null;
    const supplierId = batch?.supplier_id || null;
    
    return { 
      ...i, 
      createdAt: i.created_at, 
      product_id: i.product_id, 
      // supplier_id removed from inventory_items - get it from inventory_bills via batch_id
      // Adding supplier_id here for backward compatibility with InventoryItem interface
      supplier_id: supplierId || '',
      created_at: i.created_at 
    };
  }) as InventoryItem[];
  const {
    addSupplier,
    addProduct,
    updateProduct,
    deleteProduct,
    updateInventoryItem,
    deleteInventoryItem,
    archiveInventoryItem,
    unarchiveInventoryItem,
    defaultCommissionRate
  } = raw;
  const { userProfile } = useSupabaseAuth();

  // Local storage for recent selections
  const [recentSuppliers, setRecentSuppliers] = useLocalStorage<string[]>('inventory_recent_suppliers', []);

  // Main state
  const [activeTab, setActiveTab] = useState<'receive' | 'stock' | 'archived'>('receive');
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
  } = useInventoryForms(defaultCommissionRate, raw.preferredCurrency);

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


  const archivedInventory = inventory.filter(item => item.is_archived === true);

  // Recent receives — active only, exclude archived and closed bills
  const recentReceives = inventory
    .filter((item) => {
      if (item.is_archived) return false;
      if (item.batch_id) {
        const batch = batchMap.get(item.batch_id);
        if (batch?.status === 'CLOSED' || batch?.closed_at) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());


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

  // Inventory operations - using offline-first context methods
  const handleUpdateInventoryItem = async (item: any) => {
    try {
      await updateInventoryItem(item.id, {
        id: item.id,
        quantity: Number(item.quantity),
        price: item.price ? Number(item.price) : null,
        currency: item.currency,
      });
      showToast('success', 'Inventory item updated successfully!');
    } catch (error) {
      handleError(error);
      showToast('error', 'Failed to update inventory item.');
    }
  };

  const handleDeleteInventoryItem = async (item: any) => {
    try {
      await deleteInventoryItem(item.id);
      showToast('success', t('inventory.deleteSuccess') || 'Inventory item deleted successfully!');
    } catch (error) {
      handleError(error);
      showToast('error', t('inventory.deleteFailure') || 'Failed to delete inventory item.');
    }
  };

  const handleArchiveInventoryItem = async (item: any) => {
    try {
      await archiveInventoryItem(item.id);
      showToast('success', t('inventory.archiveSuccess'));
    } catch (error) {
      handleError(error);
      showToast('error', t('inventory.archiveFailure'));
    }
  };

  const handleUnarchiveInventoryItem = async (item: any) => {
    try {
      await unarchiveInventoryItem(item.id);
      showToast('success', t('inventory.unarchiveSuccess'));
    } catch (error) {
      handleError(error);
      showToast('error', t('inventory.unarchiveFailure'));
    }
  };

  const handleReceiveSuccess = async (data: any) => {
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
      commission_rate: batch.commission_rate,
      currency: batch.currency
    });

    await raw.refreshData();
    showToast('success', 'Inventory received successfully!');
  };

  const handleProductUpdate = async (data: any) => {
    try {
      await updateProduct(data.id, { 
        name: data.name, 
        category: data.category, 
        image: data.image 
      });
      showToast('success', 'Product updated successfully!');
    } catch (error) {
      handleError(error);
      showToast('error', 'Failed to update product.');
    }
  };

  const handleProductDelete = async (product: any) => {
    try {
      await deleteProduct(product.id);
      showToast('success', 'Product deleted successfully!');
    } catch (error) {
      handleError(error);
      showToast('error', 'Failed to delete product.');
    }
  };
  const { t, language } = useI18n();
  const { handleError } = useErrorHandler();

  // Filter products based on search term (handle multilingual names)
  const filteredProducts = useMemo(() => {
    
    if (!searchTerm) {
      return products;
    }
    
    // Normalize search term for Arabic text (handles أ = ا normalization)
    const normalizedSearchTerm = normalizeNameForComparison(searchTerm);
    
    const filtered = products.filter(p => {
      const parsedName = parseMultilingualString(p.name);
      
      if (!parsedName) return false;
      
      // Check all language variants for better search
      const allNames = typeof parsedName === 'string' 
        ? [parsedName]
        : [
            parsedName.en || '',
            parsedName.ar || '',
            parsedName.fr || ''
          ].filter(Boolean);
      
      return allNames.some(name => {
        const normalizedName = normalizeNameForComparison(name);
        return normalizedName.includes(normalizedSearchTerm);
      });
    });
    
    console.log('📦 Inventory page: Filtered products:', filtered.length);
    return filtered;
  }, [products, searchTerm, language]);
return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">{t('inventory.header')}</h1>
        {activeTab === 'receive' && (
          <button
            onClick={() => setShowReceiveForm(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            {t('inventory.receiveProducts')}
          </button>
        )}
        {activeTab === 'stock' && (
          <button
            onClick={() => setShowAddProductForm(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center"
          >
            <Plus className="w-5 h-5 mr-2" />
            {t('inventory.addProduct')}
          </button>
        )}
        {activeTab === 'archived' && archivedInventory.length > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-sm font-medium">
            <Archive className="w-4 h-4" />
            {archivedInventory.length}
          </span>
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
          {t('inventory.productReception')}
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
          {t('inventory.stockProducts')}
        </button>
        <button
          onClick={() => setActiveTab('archived')}
          className={`px-4 py-2 rounded-md transition-colors flex items-center gap-1.5 ${
            activeTab === 'archived'
              ? 'bg-white dark:bg-slate-900 text-amber-600 shadow-sm'
              : 'text-gray-600 dark:text-slate-300'
          }`}
        >
          <Archive className="w-4 h-4" />
          {t('inventory.archivedItems')}
          {archivedInventory.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 font-medium">
              {archivedInventory.length}
            </span>
          )}
        </button>
      </div>

      {/* Content based on active tab */}
      {activeTab === 'archived' && (
        <ArchivedInventoryTab
          items={archivedInventory}
          products={products}
          onUnarchive={handleUnarchiveInventoryItem}
          onDelete={handleDeleteInventoryItem}
        />
      )}

      {activeTab === 'receive' && (
        <div className="space-y-6">
          <RecentReceivesTable 
            recentReceives={recentReceives} 
            products={products} 
            suppliers={suppliers}
            inventoryBills={inventoryBills}
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
                placeholder={t('inventory.searchProducts')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Product Table */}
          <ProductTable
            products={filteredProducts}
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
        preferredCurrency={raw.preferredCurrency}
        acceptedCurrencies={raw.acceptedCurrencies}
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
          inventoryBills={inventoryBills}
          onClose={() => setEditItem(null)}
          onSave={async (form: any) => {
            await handleUpdateInventoryItem(form);
            setEditItem(null);
          }}
        />
      )}

      {deleteItem && (
        <DeleteInventoryConfirm
          item={deleteItem}
          onClose={() => setDeleteItem(null)}
          onDelete={async (item: any) => {
            await handleDeleteInventoryItem(item);
            setDeleteItem(null);
          }}
          onArchive={async (item: any) => {
            await handleArchiveInventoryItem(item);
            setDeleteItem(null);
          }}
        />
      )}

      {/* Add Supplier Form Modal */}
      {showAddSupplierForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
            <div className="p-6 border-b border-gray-200 dark:border-slate-800 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">{t('inventory.addNewSupplier')}</h2>
            </div>
            
            <form onSubmit={handleSupplierSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                    {t('inventory.supplierName')} *
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
                    {t('inventory.phone')} *
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
                    {t('inventory.email')}
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
                    {t('inventory.type')} *
                  </label>
                  <select
                    value={supplierForm.type}
                    onChange={(e) => setSupplierForm((prev: any) => ({ ...prev, type: e.target.value as 'commission' | 'cash' }))}
                    className="w-full border border-gray-300 dark:border-slate-700 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="commission">{t('inventory.typeCommission')} </option>
                    <option value="cash">{t('inventory.typeCash')}</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                    {t('inventory.address')}
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
                  {t('inventory.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  disabled={loading.supplier}
                >
                  {loading.supplier ? t('inventory.adding') : t('inventory.addSupplier')}
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
        <div className={`fixed top-4 right-4 px-4 py-2 rounded shadow-lg z-[100] text-white ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default Inventory;
