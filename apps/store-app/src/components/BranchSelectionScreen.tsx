/**
 * Branch Selection Screen
 * 
 * Full-screen component that appears after admin login to select which branch to access.
 * Only shown to admin users who have access to all branches.
 * Once a branch is selected, data for that branch will be loaded.
 */

import { useState, useEffect } from 'react';
import { Building2, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { BranchAccessValidationService } from '../services/branchAccessValidationService';
import { db } from '../lib/db';
import { Branch } from '../types';

interface BranchSelectionScreenProps {
  onBranchSelected: (branchId: string) => void;
}

export default function BranchSelectionScreen({ onBranchSelected }: BranchSelectionScreenProps) {
  const { userProfile } = useSupabaseAuth();
  
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('Loading branches...');
  const [retryCount, setRetryCount] = useState(0);
  const [isManualRetry, setIsManualRetry] = useState(false);

  // Load all accessible branches for the admin user with retry logic
  useEffect(() => {
    let isMounted = true;
    let retryTimeout: NodeJS.Timeout;

    const loadBranches = async (attemptNumber: number = 0) => {
      if (!isMounted) return;
      
      if (!userProfile?.id || !userProfile?.store_id) {
        setError('User profile not loaded');
        setIsLoading(false);
        return;
      }

      // Verify user is admin
      if (userProfile.role !== 'admin') {
        setError('Only admin users can access this screen');
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);
      
      // Update loading message based on retry attempt
      if (attemptNumber === 0) {
        setLoadingMessage('Loading branches...');
      } else if (attemptNumber === 1) {
        setLoadingMessage('Syncing branch data from server...');
      } else if (attemptNumber === 2) {
        setLoadingMessage('Still loading, please wait...');
      } else {
        setLoadingMessage('Almost there...');
      }
      
      try {
        // Get all branches for the store
        const accessibleBranches = await BranchAccessValidationService.getAccessibleBranches(
          userProfile.id,
          userProfile.store_id
        );
        
        if (accessibleBranches.length === 0 && attemptNumber < 5) {
          // Branches not loaded yet - retry with exponential backoff
          const retryDelay = Math.min(1000 * Math.pow(1.5, attemptNumber), 5000);
          console.log(`No branches found, retrying in ${retryDelay}ms (attempt ${attemptNumber + 1}/5)...`);
          setRetryCount(attemptNumber + 1);
          
          retryTimeout = setTimeout(() => {
            if (isMounted) {
              loadBranches(attemptNumber + 1);
            }
          }, retryDelay);
          return;
        }
        
        if (accessibleBranches.length === 0) {
          // After all retries, show error with manual refresh and skip options
          setError('Branches are still loading from the server.');
          setIsLoading(false);
          return;
        }

        // Load full branch details
        const branchDetails = await Promise.all(
          accessibleBranches.map(async (b) => {
            const branch = await db.branches.get(b.id);
            return branch;
          })
        );

        const validBranches = branchDetails.filter(b => b !== undefined) as Branch[];
        
        if (validBranches.length === 0 && attemptNumber < 5) {
          // Branch details not available yet - retry
          const retryDelay = Math.min(1000 * Math.pow(1.5, attemptNumber), 5000);
          console.log(`Branch details not loaded, retrying in ${retryDelay}ms...`);
          setRetryCount(attemptNumber + 1);
          
          retryTimeout = setTimeout(() => {
            if (isMounted) {
              loadBranches(attemptNumber + 1);
            }
          }, retryDelay);
          return;
        }

        if (isMounted) {
          setBranches(validBranches);
          
          // Auto-select if only one branch
          if (validBranches.length === 1) {
            setSelectedBranchId(validBranches[0].id);
          }
          
          setIsLoading(false);
          setRetryCount(0);
        }
      } catch (err) {
        console.error('Failed to load branches:', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load branches');
          setIsLoading(false);
        }
      }
    };

    loadBranches(0);
    
    // Cleanup function
    return () => {
      isMounted = false;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [userProfile]);

  const handleBranchSelect = (branchId: string) => {
    setSelectedBranchId(branchId);
  };

  const handleConfirm = async () => {
    if (!selectedBranchId) return;

    try {
      setIsLoading(true);
      
      // Validate branch access
      if (userProfile?.id && userProfile?.store_id) {
        await BranchAccessValidationService.validateBranchAccess(
          userProfile.id,
          userProfile.store_id,
          selectedBranchId
        );
      }
      
      // Save preference to localStorage
      if (userProfile?.store_id) {
        localStorage.setItem(`branch_preference_${userProfile.store_id}`, selectedBranchId);
      }
      
      // Notify parent component
      onBranchSelected(selectedBranchId);
    } catch (err) {
      console.error('Failed to select branch:', err);
      setError(err instanceof Error ? err.message : 'Failed to select branch');
      setIsLoading(false);
    }
  };

  // Loading state
  if (isLoading && branches.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <Loader2 className="w-16 h-16 mx-auto text-blue-600 animate-spin mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Loading Branches</h2>
          <p className="text-gray-600 mb-2">{loadingMessage}</p>
          {retryCount > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-gray-500">
                Attempt {retryCount}/5 - Data is syncing from server...
              </p>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${(retryCount / 5) * 100}%` }}
                />
              </div>
            </div>
          )}
          {retryCount === 0 && (
            <p className="text-sm text-gray-500 mt-2">
              This usually takes just a few seconds...
            </p>
          )}
        </div>
      </div>
    );
  }

  // Manual retry handler
  const handleManualRetry = () => {
    setIsManualRetry(true);
    setError(null);
    setRetryCount(0);
    window.location.reload();
  };

  // Error state with retry and skip options
  if (error && branches.length === 0 && !isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-yellow-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <AlertCircle className="w-16 h-16 mx-auto text-orange-600 mb-4" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Branches Not Loaded Yet</h2>
            <p className="text-gray-600 mb-4">{error}</p>
          </div>
          
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">Why is this happening?</h3>
              <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                <li>Branch data is still syncing from the server</li>
                <li>This is normal on first login</li>
                <li>Usually takes 5-10 seconds</li>
              </ul>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleManualRetry}
                disabled={isManualRetry}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isManualRetry ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Retrying...
                  </>
                ) : (
                  'Try Again'
                )}
              </button>

              <button
                onClick={() => {
                  // Try to get the first available branch and auto-select it
                  db.branches
                    .where('store_id')
                    .equals(userProfile?.store_id || '')
                    .filter(b => !b.is_deleted)
                    .first()
                    .then(branch => {
                      if (branch) {
                        onBranchSelected(branch.id);
                      } else {
                        setError('No branches available. Please wait a moment and try again.');
                      }
                    });
                }}
                className="w-full px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-semibold"
              >
                Continue with Main Branch
              </button>
            </div>

            <p className="text-xs text-center text-gray-500">
              If this persists after multiple retries, check your internet connection.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-6 text-white">
          <div className="flex items-center gap-3 mb-2">
            <Building2 className="w-8 h-8" />
            <h1 className="text-3xl font-bold">Select Branch</h1>
          </div>
          <p className="text-blue-100">
            Welcome, {userProfile?.name || 'Admin'}! Please select which branch you would like to access.
          </p>
        </div>

        {/* Branch Grid */}
        <div className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {branches.map((branch) => (
              <button
                key={branch.id}
                onClick={() => handleBranchSelect(branch.id)}
                disabled={isLoading}
                className={`
                  relative p-6 rounded-xl border-2 transition-all duration-200
                  ${selectedBranchId === branch.id
                    ? 'border-blue-600 bg-blue-50 shadow-lg scale-105'
                    : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                  }
                  ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                {/* Selection indicator */}
                {selectedBranchId === branch.id && (
                  <div className="absolute top-3 right-3">
                    <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  </div>
                )}

                {/* Branch icon */}
                <div className={`
                  w-16 h-16 rounded-full flex items-center justify-center mb-4 mx-auto
                  ${selectedBranchId === branch.id ? 'bg-blue-100' : 'bg-gray-100'}
                `}>
                  <Building2 className={`
                    w-8 h-8
                    ${selectedBranchId === branch.id ? 'text-blue-600' : 'text-gray-600'}
                  `} />
                </div>

                {/* Branch name */}
                <h3 className={`
                  text-xl font-semibold mb-2 text-center
                  ${selectedBranchId === branch.id ? 'text-blue-900' : 'text-gray-800'}
                `}>
                  {branch.name}
                </h3>

                {/* Branch details */}
                {(branch.address || branch.phone) && (
                  <div className="text-sm text-gray-600 text-center space-y-1">
                    {branch.address && (
                      <p className="truncate">{branch.address}</p>
                    )}
                    {branch.phone && (
                      <p>{branch.phone}</p>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Confirm button */}
          <div className="flex justify-center">
            <button
              onClick={handleConfirm}
              disabled={!selectedBranchId || isLoading}
              className={`
                px-8 py-3 rounded-lg font-semibold text-white text-lg
                transition-all duration-200 min-w-[200px]
                ${!selectedBranchId || isLoading
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl'
                }
              `}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Loading...
                </span>
              ) : (
                'Continue'
              )}
            </button>
          </div>

          {/* Helper text */}
          <p className="text-center text-sm text-gray-500 mt-4">
            You can switch branches later from the navigation bar
          </p>
        </div>
      </div>
    </div>
  );
}

