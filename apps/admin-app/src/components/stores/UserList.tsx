import { useState } from 'react';
import {
  User,
  MoreVertical,
  Edit,
  Power,
  PowerOff,
  Trash2,
  Plus,
  Mail,
  Shield,
  Key,
} from 'lucide-react';
import { StoreUser, Branch } from '../../types';
import {
  Button,
  Badge,
  Card,
  CardHeader,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmptyState,
  ConfirmDialog,
} from '../ui';

interface UserListProps {
  users: StoreUser[];
  branches: Branch[];
  isLoading: boolean;
  canCreateUser: boolean;
  userLimit: number | null;
  onCreateUser: () => void;
  onEditUser: (user: StoreUser) => void;
  onDeactivateUser: (userId: string) => Promise<void>;
  onReactivateUser: (userId: string) => Promise<void>;
  onDeleteUser: (userId: string) => Promise<void>;
  onResetPassword: (userId: string) => void;
}

export default function UserList({
  users,
  branches,
  isLoading,
  canCreateUser,
  userLimit,
  onCreateUser,
  onEditUser,
  onDeactivateUser,
  onReactivateUser,
  onDeleteUser,
  onResetPassword,
}: UserListProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: 'deactivate' | 'reactivate' | 'delete';
    user: StoreUser | null;
  }>({ isOpen: false, type: 'deactivate', user: null });
  const [isActionLoading, setIsActionLoading] = useState(false);

  const getBranchName = (branchId: string | null) => {
    if (!branchId) return 'All Branches';
    const branch = branches.find((b) => b.id === branchId);
    return branch?.name || 'Unknown';
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'admin':
        return 'purple' as const;
      case 'manager':
        return 'info' as const;
      case 'cashier':
        return 'default' as const;
      default:
        return 'default' as const;
    }
  };

  const handleAction = async () => {
    if (!confirmDialog.user) return;

    setIsActionLoading(true);
    try {
      switch (confirmDialog.type) {
        case 'deactivate':
          await onDeactivateUser(confirmDialog.user.id);
          break;
        case 'reactivate':
          await onReactivateUser(confirmDialog.user.id);
          break;
        case 'delete':
          await onDeleteUser(confirmDialog.user.id);
          break;
      }
    } finally {
      setIsActionLoading(false);
      setConfirmDialog({ isOpen: false, type: 'deactivate', user: null });
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
    <Card padding="none">
      <div className="p-6 border-b border-gray-200">
        <CardHeader
          title="Users"
          description={`${users.filter((u) => u.is_active).length} active of ${users.length} total${
            userLimit ? ` (limit: ${userLimit})` : ''
          }`}
          action={
            <Button
              onClick={onCreateUser}
              disabled={!canCreateUser}
              leftIcon={<Plus className="w-4 h-4" />}
              size="sm"
            >
              Add User
            </Button>
          }
          className="mb-0"
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead align="right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8">
                Loading users...
              </TableCell>
            </TableRow>
          ) : users.length === 0 ? (
            <TableEmptyState
              icon={<User className="w-12 h-12" />}
              title="No users found"
              description="Add users to allow them to access this store"
              action={
                canCreateUser ? (
                  <Button onClick={onCreateUser} leftIcon={<Plus className="w-4 h-4" />}>
                    Add User
                  </Button>
                ) : undefined
              }
            />
          ) : (
            users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center">
                      <User className="w-4 h-4 text-gray-500" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{user.name}</p>
                      <p className="text-sm text-gray-500 flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {user.email}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={getRoleBadgeVariant(user.role)}>
                    <Shield className="w-3 h-3 mr-1" />
                    {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-gray-600">{getBranchName(user.branch_id)}</span>
                </TableCell>
                <TableCell>
                  <Badge variant={user.is_active ? 'success' : 'default'}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="text-gray-500">{formatDate(user.created_at)}</span>
                </TableCell>
                <TableCell align="right">
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setOpenMenuId(openMenuId === user.id ? null : user.id)
                      }
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>

                    {openMenuId === user.id && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setOpenMenuId(null)}
                        />
                        <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                          <button
                            onClick={() => {
                              onEditUser(user);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <Edit className="w-4 h-4" />
                            Edit User
                          </button>
                          <button
                            onClick={() => {
                              onResetPassword(user.id);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                          >
                            <Key className="w-4 h-4" />
                            Reset Password
                          </button>
                          <hr className="my-1" />
                          {user.is_active ? (
                            <button
                              onClick={() => {
                                setConfirmDialog({
                                  isOpen: true,
                                  type: 'deactivate',
                                  user,
                                });
                                setOpenMenuId(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-yellow-600 hover:bg-yellow-50 flex items-center gap-2"
                            >
                              <PowerOff className="w-4 h-4" />
                              Deactivate
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setConfirmDialog({
                                  isOpen: true,
                                  type: 'reactivate',
                                  user,
                                });
                                setOpenMenuId(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-green-600 hover:bg-green-50 flex items-center gap-2"
                            >
                              <Power className="w-4 h-4" />
                              Reactivate
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setConfirmDialog({
                                isOpen: true,
                                type: 'delete',
                                user,
                              });
                              setOpenMenuId(null);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
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

      {!canCreateUser && userLimit && (
        <div className="p-4 bg-yellow-50 border-t border-yellow-200">
          <p className="text-sm text-yellow-800">
            User limit reached ({users.length}/{userLimit}). Upgrade your subscription
            to add more users.
          </p>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() =>
          setConfirmDialog({ isOpen: false, type: 'deactivate', user: null })
        }
        onConfirm={handleAction}
        title={
          confirmDialog.type === 'deactivate'
            ? 'Deactivate User'
            : confirmDialog.type === 'reactivate'
            ? 'Reactivate User'
            : 'Delete User'
        }
        message={
          confirmDialog.type === 'deactivate'
            ? `Are you sure you want to deactivate "${confirmDialog.user?.name}"? They will no longer be able to access the system.`
            : confirmDialog.type === 'reactivate'
            ? `Are you sure you want to reactivate "${confirmDialog.user?.name}"?`
            : `Are you sure you want to permanently delete "${confirmDialog.user?.name}"? This action cannot be undone.`
        }
        confirmText={
          confirmDialog.type === 'deactivate'
            ? 'Deactivate'
            : confirmDialog.type === 'reactivate'
            ? 'Reactivate'
            : 'Delete'
        }
        variant={confirmDialog.type === 'delete' ? 'danger' : 'warning'}
        isLoading={isActionLoading}
      />
    </Card>
  );
}
