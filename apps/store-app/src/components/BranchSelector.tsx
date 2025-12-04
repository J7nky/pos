/**
 * Branch Selector Component
 * 
 * Displays and manages branch selection based on user role:
 * - Admin: Dropdown to select any branch
 * - Manager/Cashier: Read-only display of assigned branch
 * 
 * Automatically loads accessible branches and handles branch switching.
 */

import { useState, useEffect } from 'react';
import { Building2, ChevronDown, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { BranchAccessValidationService } from '../services/branchAccessValidationService';
import { setBranchPreference } from '../lib/branchHelpers';
import Toast from './common/Toast';

interface Branch {
  id: string;
  name: string;
}

interface BranchSelectorProps {
  className?: string;
  showLabel?: boolean;
  compact?: boolean;
}

export default function BranchSelector({ 
  className = '', 
  showLabel = true,
  compact = false 
}: BranchSelectorProps) {
  const { storeId, currentBranchId, setCurrentBranchId } = useOfflineData();
  const { userProfile } = useSupabaseAuth();
  
  const [accessibleBranches, setAccessibleBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Load accessible branches
  useEffect(() => {
    const loadBranches = async () => {
      if (!storeId || !userProfile?.id) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      
      try {
        const branches = await BranchAccessValidationService.getAccessibleBranches(
          userProfile.id,
          storeId
        );
        
        setAccessibleBranches(branches);
        
        // Auto-select if only one branch available
        if (branches.length === 1 && !currentBranchId) {
          const branchId = branches[0].id;
          setCurrentBranchId(branchId);
          setBranchPreference(storeId, branchId);
        }
        
        // Validate current branch is still accessible
        if (currentBranchId && branches.length > 0) {
          const isAccessible = branches.some(b => b.id === currentBranchId);
          if (!isAccessible) {
            // Current branch is no longer accessible, select first available
            const firstBranch = branches[0];
            setCurrentBranchId(firstBranch.id);
            setBranchPreference(storeId, firstBranch.id);
            setToast({
              message: `Branch changed to "${firstBranch.name}"`,
              type: 'success'
            });
          }
        }
      } catch (err) {
        console.error('Failed to load branches:', err);
        setError(err instanceof Error ? err.message : 'Failed to load branches');
      } finally {
        setIsLoading(false);
      }
    };

    loadBranches();
  }, [storeId, userProfile?.id, currentBranchId, setCurrentBranchId]);

  const handleBranchChange = async (branchId: string) => {
    if (!storeId || !userProfile?.id) return;
    
    if (branchId === currentBranchId) {
      setIsOpen(false);
      return;
    }

    try {
      // Validate access
      await BranchAccessValidationService.validateBranchAccess(
        userProfile.id,
        storeId,
        branchId
      );
      
      // Update branch
      setCurrentBranchId(branchId);
      setBranchPreference(storeId, branchId);
      setIsOpen(false);
      
      setToast({
        message: `Switched to branch: ${accessibleBranches.find(b => b.id === branchId)?.name || branchId}`,
        type: 'success'
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to switch branch';
      setError(errorMessage);
      setToast({
        message: errorMessage,
        type: 'error'
      });
      setIsOpen(false);
    }
  };

  const canSwitchBranches = userProfile?.role === 'admin';
  const currentBranch = accessibleBranches.find(b => b.id === currentBranchId);

  // Loading state
  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {showLabel && <span className="text-sm text-gray-600">Branch:</span>}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading branches...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error && accessibleBranches.length === 0) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {showLabel && <span className="text-sm text-gray-600">Branch:</span>}
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="w-4 h-4" />
          <span>No accessible branches</span>
        </div>
      </div>
    );
  }

  // Manager/Cashier: Read-only display
  if (!canSwitchBranches) {
    if (accessibleBranches.length === 0) {
      return (
        <div className={`flex items-center gap-2 ${className}`}>
          {showLabel && <span className="text-sm text-gray-600">Branch:</span>}
          <div className="flex items-center gap-2 text-sm text-amber-600">
            <AlertCircle className="w-4 h-4" />
            <span>No branch assigned. Please contact an administrator.</span>
          </div>
        </div>
      );
    }

    return (
      <>
        <div className={`flex items-center gap-2 ${className}`}>
          {showLabel && <span className="text-sm text-gray-600">Branch:</span>}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-md border border-gray-200">
            <Building2 className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">
              {currentBranch?.name || accessibleBranches[0]?.name || 'Unknown Branch'}
            </span>
          </div>
        </div>
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </>
    );
  }

  // Admin: Dropdown selector
  return (
    <>
      <div className={`relative ${className}`}>
        {showLabel && !compact && (
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Branch
          </label>
        )}
        
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`
            flex items-center justify-between gap-2
            px-3 py-2
            bg-white border border-gray-300 rounded-md
            hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
            transition-colors
            ${compact ? 'text-sm' : ''}
            ${isOpen ? 'border-blue-500 ring-2 ring-blue-500' : ''}
          `}
          aria-label="Select branch"
          aria-expanded={isOpen}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-700 truncate">
              {currentBranch?.name || 'Select Branch'}
            </span>
          </div>
          <ChevronDown 
            className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ${isOpen ? 'transform rotate-180' : ''}`} 
          />
        </button>

        {/* Dropdown menu */}
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />
            
            {/* Dropdown */}
            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
              {accessibleBranches.length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-500 text-center">
                  No branches available
                </div>
              ) : (
                <ul className="py-1">
                  {accessibleBranches.map((branch) => (
                    <li key={branch.id}>
                      <button
                        onClick={() => handleBranchChange(branch.id)}
                        className={`
                          w-full px-4 py-2 text-left text-sm
                          flex items-center justify-between
                          hover:bg-gray-50 transition-colors
                          ${branch.id === currentBranchId ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}
                        `}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Building2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="truncate">{branch.name}</span>
                        </div>
                        {branch.id === currentBranchId && (
                          <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      {/* Toast notifications */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}

