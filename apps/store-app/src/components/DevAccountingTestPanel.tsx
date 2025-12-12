/**
 * Developer Accounting Test Panel
 * 
 * Add this component to your settings or admin page for easy testing
 * Remove before production launch if desired
 */

import React, { useState, useEffect } from 'react';
import { AccountingFlowTester } from '../utils/testAccountingFlows';
import { balanceVerificationService } from '../services/balanceVerificationService';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { db } from '../lib/db';

export function DevAccountingTestPanel() {
  const raw = useOfflineData();
  const { storeId, currentBranchId, userProfile } = raw;
  const auth = useSupabaseAuth();
  const [testResults, setTestResults] = useState<any>(null);
  const [verificationResults, setVerificationResults] = useState<any>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<'tests' | 'verification'>('tests');
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);

  // Try to resolve user ID from multiple sources
  useEffect(() => {
    async function resolveUserId() {
      // Try 1: From OfflineData context
      if (userProfile?.id) {
        setResolvedUserId(userProfile.id);
        return;
      }

      // Try 2: From Supabase Auth context
      if (auth?.userProfile?.id) {
        setResolvedUserId(auth.userProfile.id);
        return;
      }

      // Try 3: From database (get first user)
      try {
        const users = await db.users.limit(1).toArray();
        if (users.length > 0 && users[0].id) {
          console.log('📝 Using user from database:', users[0].id);
          setResolvedUserId(users[0].id);
          return;
        }
      } catch (error) {
        console.warn('Could not fetch user from database:', error);
      }

      // Try 4: Use a test/fallback user ID
      console.warn('⚠️ No user ID found, using fallback');
      setResolvedUserId('test-user-fallback');
    }

    resolveUserId();
  }, [userProfile, auth]);

  // Final user ID to use
  const effectiveUserId = resolvedUserId || userProfile?.id || auth?.userProfile?.id || 'unknown';

  // Debug: Check what we have
  const debugInfo = {
    storeId: storeId || 'MISSING',
    currentBranchId: currentBranchId || 'MISSING',
    userId: effectiveUserId === 'unknown' ? 'MISSING' : effectiveUserId,
    userIdSource: resolvedUserId ? 'Auto-resolved' : 'Context',
    userProfileExists: !!userProfile,
    authUserExists: !!auth?.userProfile,
    rawKeys: Object.keys(raw)
  };

  const handleRunTests = async () => {
    // Check what's missing
    const missing = [];
    if (!storeId) missing.push('storeId');
    if (!currentBranchId) missing.push('branchId');
    if (effectiveUserId === 'unknown') missing.push('userId');

    if (missing.length > 0) {
      setShowDebugInfo(true);
      alert(`Missing: ${missing.join(', ')}\n\nCheck the debug info panel below for details.`);
      return;
    }

    setIsRunning(true);
    setTestResults(null);
    
    try {
      console.log('🧪 Running tests with:', {
        storeId,
        branchId: currentBranchId,
        userId: effectiveUserId
      });

      const tester = new AccountingFlowTester(
        storeId,
        currentBranchId,
        effectiveUserId
      );
      const results = await tester.runAllTests();
      setTestResults(results);
    } catch (error) {
      console.error('Test error:', error);
      alert(`Test error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    setIsRunning(false);
  };

  const handleVerifyBalances = async () => {
    if (!storeId) {
      setShowDebugInfo(true);
      alert('Missing store information. Check debug info below.');
      return;
    }

    setIsRunning(true);
    setVerificationResults(null);
    
    try {
      const results = await balanceVerificationService.verifyAllBalances(storeId);
      setVerificationResults(results);
    } catch (error) {
      console.error('Verification error:', error);
      alert(`Verification error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    setIsRunning(false);
  };

  const handleReconcileAll = async () => {
    if (!storeId) {
      alert('Missing store information');
      return;
    }

    if (!confirm('This will update all entity balances to match journal entries. Continue?')) {
      return;
    }

    setIsRunning(true);
    
    try {
      const results = await balanceVerificationService.reconcileAllBalances(storeId);
      alert(`✅ Reconciled ${results.totalUpdated} entities`);
      
      // Re-verify after reconciliation
      await handleVerifyBalances();
    } catch (error) {
      console.error('Reconciliation error:', error);
      alert(`Reconciliation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    setIsRunning(false);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">
          🧪 Accounting System Testing
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDebugInfo(!showDebugInfo)}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            {showDebugInfo ? 'Hide' : 'Show'} Debug Info
          </button>
          <div className="text-sm text-gray-500">
            Pre-Launch Verification
          </div>
        </div>
      </div>

      {/* Debug Information Panel */}
      {showDebugInfo && (
        <div className="mb-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h3 className="font-bold text-gray-900 mb-2">🔍 Debug Information</h3>
          <div className="space-y-1 text-sm font-mono">
            <div className="flex justify-between">
              <span>Store ID:</span>
              <span className={debugInfo.storeId === 'MISSING' ? 'text-red-600 font-bold' : 'text-green-600'}>
                {debugInfo.storeId === 'MISSING' ? '❌ MISSING' : `✅ ${debugInfo.storeId.substring(0, 20)}...`}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Branch ID:</span>
              <span className={debugInfo.currentBranchId === 'MISSING' ? 'text-red-600 font-bold' : 'text-green-600'}>
                {debugInfo.currentBranchId === 'MISSING' ? '❌ MISSING' : `✅ ${debugInfo.currentBranchId.substring(0, 20)}...`}
              </span>
            </div>
            <div className="flex justify-between">
              <span>User ID:</span>
              <span className={debugInfo.userId === 'MISSING' ? 'text-red-600 font-bold' : 'text-green-600'}>
                {debugInfo.userId === 'MISSING' ? '❌ MISSING' : `✅ ${debugInfo.userId.substring(0, 20)}...`}
              </span>
            </div>
            {debugInfo.userId !== 'MISSING' && (
              <div className="flex justify-between text-xs text-gray-500">
                <span>Source:</span>
                <span>{debugInfo.userIdSource}</span>
              </div>
            )}
          </div>
          
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
            <strong className="text-yellow-900">How to fix:</strong>
            <ol className="mt-1 ml-4 list-decimal text-yellow-800">
              <li>Make sure you're logged in</li>
              <li>Make sure you've selected a store (if admin)</li>
              <li>Make sure you've selected a branch (if admin)</li>
              <li>Or use the browser console method (see below)</li>
            </ol>
          </div>

          <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
            <strong className="text-blue-900">Alternative: Run in Browser Console</strong>
            <pre className="mt-2 p-2 bg-white border rounded overflow-x-auto text-xs">
{`// Open browser console (F12) and run:
const { runAccountingTests } = await import('./src/utils/testAccountingFlows.js');

// Replace with your actual IDs:
await runAccountingTests('store-id', 'branch-id', 'user-id');`}
            </pre>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex space-x-2 mb-4 border-b">
        <button
          onClick={() => setActiveTab('tests')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'tests'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Flow Tests
        </button>
        <button
          onClick={() => setActiveTab('verification')}
          className={`px-4 py-2 font-medium ${
            activeTab === 'verification'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Balance Verification
        </button>
      </div>

      {/* Flow Tests Tab */}
      {activeTab === 'tests' && (
        <div>
          <p className="text-gray-600 mb-4">
            Tests credit sales, cash sales, customer payments, supplier payments, 
            and journal entry integrity.
          </p>

          <button
            onClick={handleRunTests}
            disabled={isRunning}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isRunning ? '🔄 Running Tests...' : '▶️ Run All Tests'}
          </button>

          {testResults && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">Test Results:</h3>
                <div className="text-sm">
                  <span className="text-green-600 font-bold">
                    ✅ {testResults.passed}
                  </span>
                  {' / '}
                  <span className="font-bold">{testResults.totalTests}</span>
                  {testResults.failed > 0 && (
                    <>
                      {' • '}
                      <span className="text-red-600 font-bold">
                        ❌ {testResults.failed} failed
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {testResults.results.map((result: any, index: number) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg ${
                      result.passed ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                    }`}
                  >
                    <div className="flex items-start">
                      <span className="text-xl mr-2">
                        {result.passed ? '✅' : '❌'}
                      </span>
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">
                          {result.testName}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          {result.details}
                        </div>
                        {result.error && (
                          <div className="text-sm text-red-600 mt-1 font-mono">
                            {result.error}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {testResults.failed === 0 && (
                <div className="mt-4 p-4 bg-green-100 border border-green-300 rounded-lg">
                  <p className="text-green-800 font-medium">
                    🎉 All tests passed! Your accounting system is working correctly.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Balance Verification Tab */}
      {activeTab === 'verification' && (
        <div>
          <p className="text-gray-600 mb-4">
            Verifies that cached entity balances match journal-derived balances.
            This ensures data integrity.
          </p>

          <div className="flex space-x-3">
            <button
              onClick={handleVerifyBalances}
              disabled={isRunning}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isRunning ? '🔄 Verifying...' : '🔍 Verify All Balances'}
            </button>

            {verificationResults && verificationResults.invalidEntities > 0 && (
              <button
                onClick={handleReconcileAll}
                disabled={isRunning}
                className="px-6 py-3 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                🔧 Fix All Discrepancies
              </button>
            )}
          </div>

          {verificationResults && (
            <div className="mt-6">
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="text-sm text-gray-600">Total Entities</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {verificationResults.totalEntities}
                  </div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-sm text-green-700">Valid</div>
                  <div className="text-2xl font-bold text-green-700">
                    {verificationResults.validEntities}
                  </div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <div className="text-sm text-red-700">Invalid</div>
                  <div className="text-2xl font-bold text-red-700">
                    {verificationResults.invalidEntities}
                  </div>
                </div>
              </div>

              {verificationResults.invalidEntities > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-gray-900 mb-2">
                    Entities with Discrepancies:
                  </h4>
                  {verificationResults.results
                    .filter((r: any) => !r.isValid)
                    .map((result: any, index: number) => (
                      <div
                        key={index}
                        className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg"
                      >
                        <div className="font-medium text-gray-900">
                          {result.entityName} ({result.entityType})
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          USD: Cached ${result.cachedUsdBalance.toFixed(2)} → 
                          Journal ${result.journalUsdBalance.toFixed(2)} 
                          (diff: ${result.usdDifference.toFixed(2)})
                        </div>
                        <div className="text-sm text-gray-600">
                          LBP: Cached {result.cachedLbpBalance.toFixed(0)} → 
                          Journal {result.journalLbpBalance.toFixed(0)} 
                          (diff: {result.lbpDifference.toFixed(0)})
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {verificationResults.invalidEntities === 0 && (
                <div className="p-4 bg-green-100 border border-green-300 rounded-lg">
                  <p className="text-green-800 font-medium">
                    ✅ All entity balances match journal entries. Perfect!
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

