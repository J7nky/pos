/**
 * Migration Test Page
 * 
 * This page allows you to test the entities migration scripts
 * Access via: /migration-test
 */

import { useState } from 'react';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import { runMigrationTest, quickVerify, quickMigrate } from '../scripts/runMigrationTest';
import { verifyEntitiesMigration, printVerificationReport } from '../scripts/verifyEntitiesMigration';
import { migrateToEntitiesOnly, printMigrationResult } from '../scripts/migrateToEntitiesOnly';
import { testServiceLayerMigration, quickServiceLayerTest } from '../scripts/testServiceLayerMigration';

export default function MigrationTest() {
  const { userProfile } = useSupabaseAuth();
  const storeId = userProfile?.store_id;
  
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<string>('');
  const [autoMigrate, setAutoMigrate] = useState(false);
  const [activeTab, setActiveTab] = useState<'migration' | 'service'>('migration');

  const handleFullTest = async () => {
    if (!storeId) {
      setResult('❌ Error: No store ID found. Please log in.');
      return;
    }

    setIsRunning(true);
    setResult('🔄 Running full migration test...\n');
    
    try {
      const testResult = await runMigrationTest(storeId, autoMigrate);
      
      let resultText = '\n📋 TEST RESULT\n';
      resultText += '='.repeat(60) + '\n';
      resultText += `Success: ${testResult.success ? '✅ YES' : '❌ NO'}\n`;
      resultText += `Message: ${testResult.message}\n`;
      resultText += '='.repeat(60) + '\n';
      
      setResult(resultText);
    } catch (error: any) {
      setResult(`❌ Error: ${error.message || 'Unknown error'}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleVerifyOnly = async () => {
    if (!storeId) {
      setResult('❌ Error: No store ID found. Please log in.');
      return;
    }

    setIsRunning(true);
    setResult('🔄 Running verification...\n');
    
    try {
      await quickVerify(storeId);
      setResult('✅ Verification complete. Check console for details.');
    } catch (error: any) {
      setResult(`❌ Error: ${error.message || 'Unknown error'}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleMigrateOnly = async () => {
    if (!storeId) {
      setResult('❌ Error: No store ID found. Please log in.');
      return;
    }

    if (!confirm('Are you sure you want to run migration? This will update the entities table.')) {
      return;
    }

    setIsRunning(true);
    setResult('🔄 Running migration...\n');
    
    try {
      await quickMigrate(storeId);
      setResult('✅ Migration complete. Check console for details.');
    } catch (error: any) {
      setResult(`❌ Error: ${error.message || 'Unknown error'}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleTestServiceLayer = async () => {
    if (!storeId) {
      setResult('❌ Error: No store ID found. Please log in.');
      return;
    }

    setIsRunning(true);
    setResult('🔄 Running service layer tests...\n');
    
    try {
      const testResult = await testServiceLayerMigration(storeId);
      
      let resultText = '\n📋 SERVICE LAYER TEST RESULTS\n';
      resultText += '='.repeat(60) + '\n';
      resultText += `All Tests Passed: ${testResult.summary.allPassed ? '✅ YES' : '❌ NO'}\n`;
      resultText += `Total Tests: ${testResult.summary.totalTests}\n`;
      resultText += `Passed: ${testResult.summary.passedTests}\n`;
      resultText += `Failed: ${testResult.summary.failedTests}\n`;
      
      if (testResult.transactionServiceTests.errors.length > 0 || 
          testResult.accountBalanceServiceTests.errors.length > 0) {
        resultText += '\nErrors:\n';
        [...testResult.transactionServiceTests.errors, ...testResult.accountBalanceServiceTests.errors]
          .forEach(err => resultText += `  - ${err}\n`);
      }
      
      resultText += '='.repeat(60) + '\n';
      
      setResult(resultText);
    } catch (error: any) {
      setResult(`❌ Error: ${error.message || 'Unknown error'}`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleQuickServiceTest = async () => {
    if (!storeId) {
      setResult('❌ Error: No store ID found. Please log in.');
      return;
    }

    setIsRunning(true);
    setResult('🔄 Running quick service test...\n');
    
    try {
      await quickServiceLayerTest(storeId);
      setResult('✅ Quick service test complete. Check console for details.');
    } catch (error: any) {
      setResult(`❌ Error: ${error.message || 'Unknown error'}`);
    } finally {
      setIsRunning(false);
    }
  };

  if (!storeId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Migration Test</h1>
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          Please log in to access migration testing.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Entities Migration Test</h1>
      
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-blue-800">
          <strong>Store ID:</strong> {storeId}
        </p>
        <p className="text-sm text-blue-800 mt-2">
          This page allows you to test the entities migration scripts. Use the buttons below to verify current state or run migration.
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex space-x-4 mb-4 border-b">
          <button
            onClick={() => setActiveTab('migration')}
            className={`px-4 py-2 font-semibold ${
              activeTab === 'migration'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600'
            }`}
          >
            Data Migration
          </button>
          <button
            onClick={() => setActiveTab('service')}
            className={`px-4 py-2 font-semibold ${
              activeTab === 'service'
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-600'
            }`}
          >
            Service Layer Tests
          </button>
        </div>

        {activeTab === 'migration' && (
          <>
            <h2 className="text-xl font-semibold mb-4">Migration Test Options</h2>
        
        <div className="space-y-4">
          <div>
            <label className="flex items-center space-x-2 mb-2">
              <input
                type="checkbox"
                checked={autoMigrate}
                onChange={(e) => setAutoMigrate(e.target.checked)}
                className="rounded"
              />
              <span>Auto-migrate if needed (when running full test)</span>
            </label>
          </div>

          <div className="flex flex-wrap gap-4">
            <button
              onClick={handleFullTest}
              disabled={isRunning}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isRunning ? 'Running...' : 'Run Full Test'}
            </button>

            <button
              onClick={handleVerifyOnly}
              disabled={isRunning}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isRunning ? 'Running...' : 'Verify Only'}
            </button>

            <button
              onClick={handleMigrateOnly}
              disabled={isRunning}
              className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isRunning ? 'Running...' : 'Migrate Only'}
            </button>
          </div>
          </>
        )}

        {activeTab === 'service' && (
          <>
            <h2 className="text-xl font-semibold mb-4">Service Layer Test Options</h2>
            
            <div className="space-y-4">
              <p className="text-sm text-gray-600 mb-4">
                Test that transactionService and accountBalanceService correctly use the entities table.
              </p>

              <div className="flex flex-wrap gap-4">
                <button
                  onClick={handleTestServiceLayer}
                  disabled={isRunning}
                  className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isRunning ? 'Running...' : 'Run Full Service Tests'}
                </button>

                <button
                  onClick={handleQuickServiceTest}
                  disabled={isRunning}
                  className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {isRunning ? 'Running...' : 'Quick Service Test'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {result && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Result</h2>
          <pre className="whitespace-pre-wrap text-sm font-mono bg-white p-4 rounded border overflow-auto max-h-96">
            {result}
          </pre>
        </div>
      )}

      <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="font-semibold text-yellow-800 mb-2">📝 Note</h3>
        <p className="text-sm text-yellow-700">
          Detailed results are also printed to the browser console. Open Developer Tools (F12) to see full reports.
        </p>
      </div>
    </div>
  );
}

