import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Store,
  Building2,
  Users,
  CreditCard,
  Settings,
  Phone,
  Mail,
  Globe,
  DollarSign,
  RefreshCw,
} from 'lucide-react';
import {
  StoreWithStats,
  Branch,
  StoreUser,
  Subscription,
  SubscriptionUsage,
  CreateBranchInput,
  UpdateBranchInput,
  CreateUserInput,
  UpdateUserInput,
} from '../../types';
import {
  getStore,
  updateStore,
} from '../../services/storeService';
import {
  getBranches,
  createBranch,
  updateBranch,
  deactivateBranch,
  reactivateBranch,
  deleteBranch,
  canCreateBranch,
} from '../../services/branchService';
import {
  getSubscription,
  getSubscriptionUsage,
} from '../../services/subscriptionService';
import {
  getUsers,
  createUser,
  updateUser,
  deactivateUser,
  reactivateUser,
  deleteUser,
  canCreateUser,
} from '../../services/userService';
import {
  Button,
  Badge,
  Card,
  getStatusVariant,
  getTierVariant,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  useToast,
} from '../ui';
import StoreForm from './StoreForm';
import BranchList from './BranchList';
import BranchForm from './BranchForm';
import UserList from './UserList';
import UserForm from './UserForm';
import SubscriptionCard from './SubscriptionCard';

export default function StoreDetail() {
  const { storeId } = useParams<{ storeId: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  // State
  const [store, setStore] = useState<StoreWithStats | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<StoreUser[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<SubscriptionUsage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [branchLimitInfo, setBranchLimitInfo] = useState({ canCreate: false, limit: 1 });
  const [userLimitInfo, setUserLimitInfo] = useState({ canCreate: false, limit: null as number | null });

  // Modals
  const [showEditStore, setShowEditStore] = useState(false);
  const [showBranchForm, setShowBranchForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState<StoreUser | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load data
  useEffect(() => {
    if (storeId) {
      loadData();
    }
  }, [storeId]);

  const loadData = async () => {
    if (!storeId) return;

    setIsLoading(true);
    try {
      const [storeData, branchesData, usersData, subscriptionData, usageData, branchLimit, userLimit] =
        await Promise.all([
          getStore(storeId),
          getBranches(storeId),
          getUsers(storeId),
          getSubscription(storeId),
          getSubscriptionUsage(storeId),
          canCreateBranch(storeId),
          canCreateUser(storeId),
        ]);

      setStore(storeData);
      setBranches(branchesData);
      setUsers(usersData);
      setSubscription(subscriptionData);
      setUsage(usageData);
      setBranchLimitInfo({ canCreate: branchLimit.canCreate, limit: branchLimit.limit });
      setUserLimitInfo({ canCreate: userLimit.canCreate, limit: userLimit.limit });
    } catch (error) {
      console.error('Error loading store data:', error);
      toast.error('Failed to load store data');
    } finally {
      setIsLoading(false);
    }
  };

  // Store actions
  const handleUpdateStore = async (data: any) => {
    if (!storeId) return;

    setIsSubmitting(true);
    try {
      await updateStore(storeId, data);
      await loadData();
      setShowEditStore(false);
      toast.success('Store updated successfully');
    } catch (error: any) {
      toast.error('Failed to update store', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Branch actions
  const handleCreateBranch = async (data: CreateBranchInput | UpdateBranchInput) => {
    setIsSubmitting(true);
    try {
      if (editingBranch) {
        await updateBranch(editingBranch.id, data as UpdateBranchInput);
        toast.success('Branch updated successfully');
      } else {
        await createBranch(data as CreateBranchInput);
        toast.success('Branch created successfully');
      }
      await loadData();
      setShowBranchForm(false);
      setEditingBranch(null);
    } catch (error: any) {
      toast.error(editingBranch ? 'Failed to update branch' : 'Failed to create branch', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivateBranch = async (branchId: string) => {
    try {
      await deactivateBranch(branchId);
      await loadData();
      toast.success('Branch deactivated');
    } catch (error: any) {
      toast.error('Failed to deactivate branch', error.message);
    }
  };

  const handleReactivateBranch = async (branchId: string) => {
    try {
      await reactivateBranch(branchId);
      await loadData();
      toast.success('Branch reactivated');
    } catch (error: any) {
      toast.error('Failed to reactivate branch', error.message);
    }
  };

  const handleDeleteBranch = async (branchId: string) => {
    try {
      await deleteBranch(branchId);
      await loadData();
      toast.success('Branch deleted');
    } catch (error: any) {
      toast.error('Failed to delete branch', error.message);
    }
  };

  // User actions
  const handleCreateUser = async (data: CreateUserInput | UpdateUserInput) => {
    setIsSubmitting(true);
    try {
      if (editingUser) {
        await updateUser(editingUser.id, data as UpdateUserInput);
        toast.success('User updated successfully');
      } else {
        await createUser(data as CreateUserInput);
        toast.success('User created successfully');
      }
      await loadData();
      setShowUserForm(false);
      setEditingUser(null);
    } catch (error: any) {
      toast.error(editingUser ? 'Failed to update user' : 'Failed to create user', error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivateUser = async (userId: string) => {
    try {
      await deactivateUser(userId);
      await loadData();
      toast.success('User deactivated');
    } catch (error: any) {
      toast.error('Failed to deactivate user', error.message);
    }
  };

  const handleReactivateUser = async (userId: string) => {
    try {
      await reactivateUser(userId);
      await loadData();
      toast.success('User reactivated');
    } catch (error: any) {
      toast.error('Failed to reactivate user', error.message);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      await deleteUser(userId);
      await loadData();
      toast.success('User deleted');
    } catch (error: any) {
      toast.error('Failed to delete user', error.message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!store) {
    return (
      <div className="text-center py-12">
        <Store className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Store not found</h2>
        <p className="text-gray-500 mb-4">The store you're looking for doesn't exist.</p>
        <Button onClick={() => navigate('/stores')}>Back to Stores</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/stores')}
            leftIcon={<ArrowLeft className="w-4 h-4" />}
          >
            Back
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <Store className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-gray-900">{store.name}</h1>
                  <Badge variant={getStatusVariant(store.status)}>
                    {store.status.charAt(0).toUpperCase() + store.status.slice(1)}
                  </Badge>
                  {subscription && (
                    <Badge variant={getTierVariant(subscription.plan)}>
                      {subscription.plan.charAt(0).toUpperCase() + subscription.plan.slice(1)}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                  {store.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-4 h-4" />
                      {store.email}
                    </span>
                  )}
                  {store.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-4 h-4" />
                      {store.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        <Button variant="outline" onClick={() => setShowEditStore(true)}>
          Edit Store
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <Building2 className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Branches</p>
            <p className="text-xl font-semibold text-gray-900">
              {branches.filter((b) => b.is_active).length}
              <span className="text-sm font-normal text-gray-400">
                /{branchLimitInfo.limit}
              </span>
            </p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
            <Users className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Users</p>
            <p className="text-xl font-semibold text-gray-900">
              {users.filter((u) => u.is_active).length}
              {userLimitInfo.limit && (
                <span className="text-sm font-normal text-gray-400">
                  /{userLimitInfo.limit}
                </span>
              )}
            </p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
            <Globe className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Language</p>
            <p className="text-xl font-semibold text-gray-900">
              {store.preferred_language.toUpperCase()}
            </p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-yellow-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Currency</p>
            <p className="text-xl font-semibold text-gray-900">
              {store.preferred_currency}
            </p>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="branches">
        <TabsList>
          <TabsTrigger value="branches" icon={<Building2 className="w-4 h-4" />}>
            Branches
          </TabsTrigger>
          <TabsTrigger value="users" icon={<Users className="w-4 h-4" />}>
            Users
          </TabsTrigger>
          <TabsTrigger value="subscription" icon={<CreditCard className="w-4 h-4" />}>
            Subscription
          </TabsTrigger>
          <TabsTrigger value="settings" icon={<Settings className="w-4 h-4" />}>
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="branches">
          <BranchList
            branches={branches}
            isLoading={false}
            canCreateBranch={branchLimitInfo.canCreate}
            branchLimit={branchLimitInfo.limit}
            onCreateBranch={() => {
              setEditingBranch(null);
              setShowBranchForm(true);
            }}
            onEditBranch={(branch) => {
              setEditingBranch(branch);
              setShowBranchForm(true);
            }}
            onDeactivateBranch={handleDeactivateBranch}
            onReactivateBranch={handleReactivateBranch}
            onDeleteBranch={handleDeleteBranch}
          />
        </TabsContent>

        <TabsContent value="users">
          <UserList
            users={users}
            branches={branches}
            isLoading={false}
            canCreateUser={userLimitInfo.canCreate}
            userLimit={userLimitInfo.limit}
            onCreateUser={() => {
              setEditingUser(null);
              setShowUserForm(true);
            }}
            onEditUser={(user) => {
              setEditingUser(user);
              setShowUserForm(true);
            }}
            onDeactivateUser={handleDeactivateUser}
            onReactivateUser={handleReactivateUser}
            onDeleteUser={handleDeleteUser}
            onResetPassword={() => toast.info('Reset password', 'Password reset coming soon')}
          />
        </TabsContent>

        <TabsContent value="subscription">
          <SubscriptionCard
            subscription={subscription}
            usage={usage}
            onUpgrade={() => toast.info('Upgrade', 'Subscription upgrade coming soon')}
            onManage={() => toast.info('Manage', 'Subscription management coming soon')}
          />
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Store Settings</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Exchange Rate (LBP/USD)
                    </label>
                    <p className="text-lg font-semibold text-gray-900">
                      {store.exchange_rate.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Commission Rate
                    </label>
                    <p className="text-lg font-semibold text-gray-900">
                      {store.preferred_commission_rate}%
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Low Stock Alert
                    </label>
                    <Badge variant={store.low_stock_alert ? 'success' : 'default'}>
                      {store.low_stock_alert ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Address
                    </label>
                    <p className="text-gray-900">{store.address || 'Not set'}</p>
                  </div>
                </div>
              </div>
              <div className="pt-6 border-t border-gray-200">
                <Button variant="outline" onClick={() => setShowEditStore(true)}>
                  Edit Settings
                </Button>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Store Modal */}
      <StoreForm
        isOpen={showEditStore}
        onClose={() => setShowEditStore(false)}
        onSubmit={handleUpdateStore}
        store={store}
        isLoading={isSubmitting}
      />

      {/* Branch Form Modal */}
      <BranchForm
        isOpen={showBranchForm}
        onClose={() => {
          setShowBranchForm(false);
          setEditingBranch(null);
        }}
        onSubmit={handleCreateBranch}
        storeId={storeId!}
        branch={editingBranch || undefined}
        isLoading={isSubmitting}
      />

      {/* User Form Modal */}
      <UserForm
        isOpen={showUserForm}
        onClose={() => {
          setShowUserForm(false);
          setEditingUser(null);
        }}
        onSubmit={handleCreateUser}
        storeId={storeId!}
        branches={branches}
        user={editingUser || undefined}
        isLoading={isSubmitting}
      />
    </div>
  );
}
