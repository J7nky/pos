import { useState, useEffect } from 'react';
import {
  StoreWithStats,
  StoreFilters,
  CreateStoreInput,
  UpdateStoreInput,
} from '../types';
import {
  getStores,
  createStoreWithInitialization,
  updateStore,
  archiveStore,
  reactivateStore,
  deleteStore,
} from '../services/storeService';
import { createTrialSubscription } from '../services/subscriptionService';
import { StoreList, StoreForm } from '../components/stores';
import { useToast } from '../components/ui';

export default function Stores() {
  const toast = useToast();
  
  // State
  const [stores, setStores] = useState<StoreWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<StoreFilters>({});
  
  // Modals
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingStore, setEditingStore] = useState<StoreWithStats | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load stores
  useEffect(() => {
    loadStores();
  }, [filters]);

  const loadStores = async () => {
    setIsLoading(true);
    try {
      const data = await getStores(filters);
      setStores(data);
    } catch (error: any) {
      console.error('Error loading stores:', error);
      toast.error('Failed to load stores', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Create store
  const handleCreateStore = async (data: CreateStoreInput | UpdateStoreInput) => {
    console.log('am here')
    setIsSubmitting(true);
    try {
      // Create store with initialization
      const newStore = await createStoreWithInitialization(data as CreateStoreInput);
      
      // Create trial subscription
      try {
        await createTrialSubscription(newStore.id, 'professional', 14);
      } catch (subError) {
        console.error('Warning: Failed to create trial subscription:', subError);
      }
      
      await loadStores();
      setShowCreateForm(false);
      toast.success('Store created successfully', 'A 14-day trial has been activated.');
    } catch (error: any) {
      toast.error('Failed to create store', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update store
  const handleUpdateStore = async (data: CreateStoreInput | UpdateStoreInput) => {
    if (!editingStore) return;
    
    setIsSubmitting(true);
    try {
      await updateStore(editingStore.id, data as UpdateStoreInput);
      await loadStores();
      setEditingStore(null);
      toast.success('Store updated successfully');
    } catch (error: any) {
      toast.error('Failed to update store', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Archive store
  const handleArchiveStore = async (storeId: string) => {
    try {
      await archiveStore(storeId);
      await loadStores();
      toast.success('Store archived');
    } catch (error: any) {
      toast.error('Failed to archive store', error.message);
    }
  };

  // Reactivate store
  const handleReactivateStore = async (storeId: string) => {
    try {
      await reactivateStore(storeId);
      await loadStores();
      toast.success('Store reactivated');
    } catch (error: any) {
      toast.error('Failed to reactivate store', error.message);
    }
  };

  // Delete store
  const handleDeleteStore = async (storeId: string) => {
    try {
      await deleteStore(storeId);
      await loadStores();
      toast.success('Store deleted');
    } catch (error: any) {
      toast.error('Failed to delete store', error.message);
    }
  };

  return (
    <>
      <StoreList
        stores={stores}
        isLoading={isLoading}
        filters={filters}
        onFiltersChange={setFilters}
        onCreateStore={() => setShowCreateForm(true)}
        onEditStore={(store) => setEditingStore(store)}
        onArchiveStore={handleArchiveStore}
        onReactivateStore={handleReactivateStore}
        onDeleteStore={handleDeleteStore}
      />

      {/* Create Store Modal */}
      <StoreForm
        isOpen={showCreateForm}
        onClose={() => setShowCreateForm(false)}
        onSubmit={handleCreateStore}
        isLoading={isSubmitting}
      />

      {/* Edit Store Modal */}
      {editingStore && (
        <StoreForm
          isOpen={!!editingStore}
          onClose={() => setEditingStore(null)}
          onSubmit={handleUpdateStore}
          store={editingStore}
          isLoading={isSubmitting}
        />
      )}
    </>
  );
}

