import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Store,
  Building2,
  Users,
  MoreVertical,
  Eye,
  Edit,
  Archive,
  RefreshCw,
  Trash2,
  Search,
  Plus,
} from 'lucide-react';
import { StoreWithStats, StoreFilters } from '../../types';
import {
  Button,
  Select,
  Badge,
  getStatusVariant,
  getTierVariant,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmptyState,
  ConfirmDialog,
} from '../ui';

interface StoreListProps {
  stores: StoreWithStats[];
  isLoading: boolean;
  filters: StoreFilters;
  onFiltersChange: (filters: StoreFilters) => void;
  onCreateStore: () => void;
  onEditStore: (store: StoreWithStats) => void;
  onArchiveStore: (storeId: string) => Promise<void>;
  onReactivateStore: (storeId: string) => Promise<void>;
  onDeleteStore: (storeId: string) => Promise<void>;
}

export default function StoreList({
  stores,
  isLoading,
  filters,
  onFiltersChange,
  onCreateStore,
  onEditStore,
  onArchiveStore,
  onReactivateStore,
  onDeleteStore,
}: StoreListProps) {
  const navigate = useNavigate();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: 'archive' | 'reactivate' | 'delete';
    store: StoreWithStats | null;
  }>({ isOpen: false, type: 'archive', store: null });
  const [isActionLoading, setIsActionLoading] = useState(false);

  const handleAction = async () => {
    if (!confirmDialog.store) return;

    setIsActionLoading(true);
    try {
      switch (confirmDialog.type) {
        case 'archive':
          await onArchiveStore(confirmDialog.store.id);
          break;
        case 'reactivate':
          await onReactivateStore(confirmDialog.store.id);
          break;
        case 'delete':
          await onDeleteStore(confirmDialog.store.id);
          break;
      }
    } finally {
      setIsActionLoading(false);
      setConfirmDialog({ isOpen: false, type: 'archive', store: null });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stores</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage all stores in the platform
          </p>
        </div>
        <Button onClick={onCreateStore} leftIcon={<Plus className="w-4 h-4" />}>
          Create Store
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search stores..."
                value={filters.search || ''}
                onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <Select
            value={filters.status || ''}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                status: e.target.value as StoreFilters['status'] || undefined,
              })
            }
            options={[
              { value: '', label: 'All Status' },
              { value: 'active', label: 'Active' },
              { value: 'suspended', label: 'Suspended' },
              { value: 'archived', label: 'Archived' },
            ]}
            className="w-full sm:w-40"
          />
          <Select
            value={filters.subscriptionPlan || ''}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                subscriptionPlan: e.target.value as StoreFilters['subscriptionPlan'] || undefined,
              })
            }
            options={[
              { value: '', label: 'All Plans' },
              { value: 'starter', label: 'Starter' },
              { value: 'professional', label: 'Professional' },
              { value: 'premium', label: 'Premium' },
            ]}
            className="w-full sm:w-40"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Store</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Subscription</TableHead>
              <TableHead align="center">Branches</TableHead>
              <TableHead align="center">Users</TableHead>
              <TableHead>Created</TableHead>
              <TableHead align="right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12">
                  <div className="flex items-center justify-center gap-2 text-gray-500">
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Loading stores...
                  </div>
                </TableCell>
              </TableRow>
            ) : stores.length === 0 ? (
              <TableEmptyState
                icon={<Store className="w-12 h-12" />}
                title="No stores found"
                description={
                  filters.search || filters.status || filters.subscriptionPlan
                    ? 'Try adjusting your filters'
                    : 'Get started by creating your first store'
                }
                action={
                  !filters.search && !filters.status && !filters.subscriptionPlan ? (
                    <Button onClick={onCreateStore} leftIcon={<Plus className="w-4 h-4" />}>
                      Create Store
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              stores.map((store) => (
                <TableRow
                  key={store.id}
                  isClickable
                  onClick={() => navigate(`/stores/${store.id}`)}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Store className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{store.name}</p>
                        <p className="text-sm text-gray-500">{store.email || 'No email'}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(store.status)}>
                      {store.status.charAt(0).toUpperCase() + store.status.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {store.subscription ? (
                      <div className="flex items-center gap-2">
                        <Badge variant={getTierVariant(store.subscription.plan)}>
                          {store.subscription.plan.charAt(0).toUpperCase() +
                            store.subscription.plan.slice(1)}
                        </Badge>
                        {store.subscription.status === 'trial' && (
                          <Badge variant="warning" size="sm">
                            Trial
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-400 text-sm">No subscription</span>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <div className="flex items-center justify-center gap-1">
                      <Building2 className="w-4 h-4 text-gray-400" />
                      <span>{store.branches_count}</span>
                    </div>
                  </TableCell>
                  <TableCell align="center">
                    <div className="flex items-center justify-center gap-1">
                      <Users className="w-4 h-4 text-gray-400" />
                      <span>{store.users_count}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-gray-500">{formatDate(store.created_at)}</span>
                  </TableCell>
                  <TableCell align="right">
                    <div className="relative">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === store.id ? null : store.id);
                        }}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </Button>

                      {openMenuId === store.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setOpenMenuId(null)}
                          />
                          <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/stores/${store.id}`);
                                setOpenMenuId(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                            >
                              <Eye className="w-4 h-4" />
                              View Details
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onEditStore(store);
                                setOpenMenuId(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                            >
                              <Edit className="w-4 h-4" />
                              Edit Store
                            </button>
                            <hr className="my-1" />
                            {store.status === 'active' ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDialog({
                                    isOpen: true,
                                    type: 'archive',
                                    store,
                                  });
                                  setOpenMenuId(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-yellow-600 hover:bg-yellow-50 flex items-center gap-2"
                              >
                                <Archive className="w-4 h-4" />
                                Archive Store
                              </button>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDialog({
                                    isOpen: true,
                                    type: 'reactivate',
                                    store,
                                  });
                                  setOpenMenuId(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-green-600 hover:bg-green-50 flex items-center gap-2"
                              >
                                <RefreshCw className="w-4 h-4" />
                                Reactivate Store
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDialog({
                                  isOpen: true,
                                  type: 'delete',
                                  store,
                                });
                                setOpenMenuId(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete Store
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ isOpen: false, type: 'archive', store: null })}
        onConfirm={handleAction}
        title={
          confirmDialog.type === 'archive'
            ? 'Archive Store'
            : confirmDialog.type === 'reactivate'
            ? 'Reactivate Store'
            : 'Delete Store'
        }
        message={
          confirmDialog.type === 'archive'
            ? `Are you sure you want to archive "${confirmDialog.store?.name}"? The store will be deactivated but data will be preserved.`
            : confirmDialog.type === 'reactivate'
            ? `Are you sure you want to reactivate "${confirmDialog.store?.name}"?`
            : `Are you sure you want to permanently delete "${confirmDialog.store?.name}"? This action cannot be undone and all store data will be lost.`
        }
        confirmText={
          confirmDialog.type === 'archive'
            ? 'Archive'
            : confirmDialog.type === 'reactivate'
            ? 'Reactivate'
            : 'Delete'
        }
        variant={confirmDialog.type === 'delete' ? 'danger' : 'warning'}
        isLoading={isActionLoading}
      />
    </div>
  );
}
