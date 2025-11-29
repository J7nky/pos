import { useState } from 'react';
import {
  Building2,
  MoreVertical,
  Edit,
  Power,
  PowerOff,
  Trash2,
  Plus,
  MapPin,
  Phone,
} from 'lucide-react';
import { Branch } from '../../types';
import {
  Button,
  Badge,
  Card,
  CardHeader,
  ConfirmDialog,
} from '../ui';

interface BranchListProps {
  branches: Branch[];
  isLoading: boolean;
  canCreateBranch: boolean;
  branchLimit: number;
  onCreateBranch: () => void;
  onEditBranch: (branch: Branch) => void;
  onDeactivateBranch: (branchId: string) => Promise<void>;
  onReactivateBranch: (branchId: string) => Promise<void>;
  onDeleteBranch: (branchId: string) => Promise<void>;
}

export default function BranchList({
  branches,
  isLoading,
  canCreateBranch,
  branchLimit,
  onCreateBranch,
  onEditBranch,
  onDeactivateBranch,
  onReactivateBranch,
  onDeleteBranch,
}: BranchListProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    type: 'deactivate' | 'reactivate' | 'delete';
    branch: Branch | null;
  }>({ isOpen: false, type: 'deactivate', branch: null });
  const [isActionLoading, setIsActionLoading] = useState(false);

  const activeBranches = branches.filter((b) => b.is_active);
  const inactiveBranches = branches.filter((b) => !b.is_active);

  const handleAction = async () => {
    if (!confirmDialog.branch) return;

    setIsActionLoading(true);
    try {
      switch (confirmDialog.type) {
        case 'deactivate':
          await onDeactivateBranch(confirmDialog.branch.id);
          break;
        case 'reactivate':
          await onReactivateBranch(confirmDialog.branch.id);
          break;
        case 'delete':
          await onDeleteBranch(confirmDialog.branch.id);
          break;
      }
    } finally {
      setIsActionLoading(false);
      setConfirmDialog({ isOpen: false, type: 'deactivate', branch: null });
    }
  };

  const BranchCard = ({ branch }: { branch: Branch }) => (
    <div
      className={`relative p-4 border rounded-lg ${
        branch.is_active
          ? 'border-gray-200 bg-white'
          : 'border-gray-200 bg-gray-50'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              branch.is_active ? 'bg-blue-100' : 'bg-gray-200'
            }`}
          >
            <Building2
              className={`w-5 h-5 ${
                branch.is_active ? 'text-blue-600' : 'text-gray-400'
              }`}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-gray-900">{branch.name}</h4>
              <Badge variant={branch.is_active ? 'success' : 'default'} size="sm">
                {branch.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            {branch.address && (
              <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                <MapPin className="w-3 h-3" />
                {branch.address}
              </p>
            )}
            {branch.phone && (
              <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                <Phone className="w-3 h-3" />
                {branch.phone}
              </p>
            )}
          </div>
        </div>

        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpenMenuId(openMenuId === branch.id ? null : branch.id)}
          >
            <MoreVertical className="w-4 h-4" />
          </Button>

          {openMenuId === branch.id && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setOpenMenuId(null)}
              />
              <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                <button
                  onClick={() => {
                    onEditBranch(branch);
                    setOpenMenuId(null);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Edit Branch
                </button>
                <hr className="my-1" />
                {branch.is_active ? (
                  <button
                    onClick={() => {
                      setConfirmDialog({
                        isOpen: true,
                        type: 'deactivate',
                        branch,
                      });
                      setOpenMenuId(null);
                    }}
                    disabled={activeBranches.length <= 1}
                    className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${
                      activeBranches.length <= 1
                        ? 'text-gray-300 cursor-not-allowed'
                        : 'text-yellow-600 hover:bg-yellow-50'
                    }`}
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
                        branch,
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
                      branch,
                    });
                    setOpenMenuId(null);
                  }}
                  disabled={branches.length <= 1}
                  className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${
                    branches.length <= 1
                      ? 'text-gray-300 cursor-not-allowed'
                      : 'text-red-600 hover:bg-red-50'
                  }`}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader
        title="Branches"
        description={`${activeBranches.length} active of ${branches.length} total (limit: ${branchLimit})`}
        action={
          <Button
            onClick={onCreateBranch}
            disabled={!canCreateBranch}
            leftIcon={<Plus className="w-4 h-4" />}
            size="sm"
          >
            Add Branch
          </Button>
        }
      />

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading branches...</div>
      ) : branches.length === 0 ? (
        <div className="text-center py-8">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No branches found</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active Branches */}
          {activeBranches.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">
                Active Branches ({activeBranches.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeBranches.map((branch) => (
                  <BranchCard key={branch.id} branch={branch} />
                ))}
              </div>
            </div>
          )}

          {/* Inactive Branches */}
          {inactiveBranches.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-500 mb-3">
                Inactive Branches ({inactiveBranches.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {inactiveBranches.map((branch) => (
                  <BranchCard key={branch.id} branch={branch} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!canCreateBranch && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            Branch limit reached ({branches.length}/{branchLimit}). Upgrade your
            subscription to add more branches.
          </p>
        </div>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() =>
          setConfirmDialog({ isOpen: false, type: 'deactivate', branch: null })
        }
        onConfirm={handleAction}
        title={
          confirmDialog.type === 'deactivate'
            ? 'Deactivate Branch'
            : confirmDialog.type === 'reactivate'
            ? 'Reactivate Branch'
            : 'Delete Branch'
        }
        message={
          confirmDialog.type === 'deactivate'
            ? `Are you sure you want to deactivate "${confirmDialog.branch?.name}"? Users will no longer be able to access this branch.`
            : confirmDialog.type === 'reactivate'
            ? `Are you sure you want to reactivate "${confirmDialog.branch?.name}"?`
            : `Are you sure you want to permanently delete "${confirmDialog.branch?.name}"? All branch data will be lost.`
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
