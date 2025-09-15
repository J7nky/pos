import React, { useState, useEffect } from 'react';
import { databaseMigrationService, SchemaValidationResult } from '../services/databaseMigrationService';
import { databaseBackupService, BackupMetadata } from '../services/databaseBackupService';
import { databaseTransactionService, ConsistencyCheck } from '../services/databaseTransactionService';
import DatabasePerformanceMonitor from './DatabasePerformanceMonitor';
import { 
  Database, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  RefreshCw,
  Download,
  Upload,
  BarChart3,
  Shield,
  List,
  Trash2,
  FileText,
  Activity,
  Lock,
  AlertCircle
} from 'lucide-react';

interface DatabaseHealthMonitorProps {
  onClose?: () => void;
}

export default function DatabaseHealthMonitor({ onClose }: DatabaseHealthMonitorProps) {
  const [validationResult, setValidationResult] = useState<SchemaValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupId, setBackupId] = useState('');
  const [showRestoreForm, setShowRestoreForm] = useState(false);
  const [restoreBackupId, setRestoreBackupId] = useState('');
  const [backups, setBackups] = useState<BackupMetadata[]>([]);
  const [showBackupList, setShowBackupList] = useState(false);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [showPerformanceMonitor, setShowPerformanceMonitor] = useState(false);
  const [consistencyChecks, setConsistencyChecks] = useState<ConsistencyCheck[]>([]);
  const [isCheckingConsistency, setIsCheckingConsistency] = useState(false);
  const [activeTransactions, setActiveTransactions] = useState<any[]>([]);

  useEffect(() => {
    validateDatabase();
  }, []);

  const validateDatabase = async () => {
    setIsValidating(true);
    try {
      const result = await databaseMigrationService.validateSchema();
      setValidationResult(result);
    } catch (error) {
      console.error('Validation failed:', error);
    } finally {
      setIsValidating(false);
    }
  };

  const loadBackups = async () => {
    setIsLoadingBackups(true);
    try {
      const backupList = await databaseBackupService.listBackups();
      setBackups(backupList);
    } catch (error) {
      console.error('Failed to load backups:', error);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  const createBackup = async () => {
    setIsCreatingBackup(true);
    try {
      const result = await databaseBackupService.createBackup('default', {
        includeDeleted: false,
        compress: true,
        encrypt: false
      });
      if (result.success) {
        setBackupId(result.backupId);
        alert(`Backup created successfully! Backup ID: ${result.backupId}`);
        loadBackups(); // Refresh backup list
      } else {
        alert(`Backup failed: ${result.message}`);
      }
    } catch (error) {
      console.error('Backup failed:', error);
      alert('Backup failed');
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const restoreFromBackup = async () => {
    if (!restoreBackupId.trim()) {
      alert('Please enter a backup ID');
      return;
    }

    setIsRestoring(true);
    try {
      const result = await databaseBackupService.restoreFromBackup(restoreBackupId, {
        verifyIntegrity: true,
        skipConflicts: false,
        mergeStrategy: 'overwrite'
      });
      if (result.success) {
        alert('Database restored successfully!');
        setShowRestoreForm(false);
        setRestoreBackupId('');
        validateDatabase(); // Re-validate after restore
        loadBackups(); // Refresh backup list
      } else {
        alert(`Restore failed: ${result.message}`);
      }
    } catch (error) {
      console.error('Restore failed:', error);
      alert('Restore failed');
    } finally {
      setIsRestoring(false);
    }
  };

  const checkConsistency = async () => {
    setIsCheckingConsistency(true);
    try {
      const checks = await databaseTransactionService.checkConsistency();
      setConsistencyChecks(checks);
    } catch (error) {
      console.error('Consistency check failed:', error);
    } finally {
      setIsCheckingConsistency(false);
    }
  };

  const loadActiveTransactions = () => {
    try {
      const transactions = databaseTransactionService.getActiveTransactions();
      setActiveTransactions(transactions);
    } catch (error) {
      console.error('Failed to load active transactions:', error);
    }
  };

  const getStatusIcon = () => {
    if (!validationResult) return <RefreshCw className="w-5 h-5 animate-spin" />;
    
    if (validationResult.isValid) {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    } else {
      return <XCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const getStatusText = () => {
    if (!validationResult) return 'Validating...';
    
    if (validationResult.isValid) {
      return 'Database is healthy';
    } else {
      return 'Database has issues';
    }
  };

  const getStatusColor = () => {
    if (!validationResult) return 'text-gray-500';
    
    if (validationResult.isValid) {
      return 'text-green-600';
    } else {
      return 'text-red-600';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <Database className="w-6 h-6 text-blue-600 mr-3" />
              <h2 className="text-2xl font-bold text-gray-900">Database Health Monitor</h2>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* Status Overview */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                {getStatusIcon()}
                <span className={`ml-2 font-medium ${getStatusColor()}`}>
                  {getStatusText()}
                </span>
              </div>
              <button
                onClick={validateDatabase}
                disabled={isValidating}
                className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isValidating ? 'animate-spin' : ''}`} />
                {isValidating ? 'Validating...' : 'Refresh'}
              </button>
            </div>
          </div>

          {/* Validation Results */}
          {validationResult && (
            <div className="space-y-4 mb-6">
              {/* Errors */}
              {validationResult.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center mb-2">
                    <XCircle className="w-5 h-5 text-red-500 mr-2" />
                    <h3 className="font-medium text-red-800">Errors ({validationResult.errors.length})</h3>
                  </div>
                  <ul className="text-sm text-red-700 space-y-1">
                    {validationResult.errors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {validationResult.warnings.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-center mb-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-500 mr-2" />
                    <h3 className="font-medium text-yellow-800">Warnings ({validationResult.warnings.length})</h3>
                  </div>
                  <ul className="text-sm text-yellow-700 space-y-1">
                    {validationResult.warnings.map((warning, index) => (
                      <li key={index}>• {warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Suggestions */}
              {validationResult.suggestions.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center mb-2">
                    <BarChart3 className="w-5 h-5 text-blue-500 mr-2" />
                    <h3 className="font-medium text-blue-800">Suggestions ({validationResult.suggestions.length})</h3>
                  </div>
                  <ul className="text-sm text-blue-700 space-y-1">
                    {validationResult.suggestions.map((suggestion, index) => (
                      <li key={index}>• {suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Backup and Restore Section */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Shield className="w-5 h-5 mr-2" />
              Backup & Restore
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Create Backup */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">Create Backup</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Create a complete backup of your database for safety.
                </p>
                <button
                  onClick={createBackup}
                  disabled={isCreatingBackup}
                  className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {isCreatingBackup ? 'Creating...' : 'Create Backup'}
                </button>
                {backupId && (
                  <p className="text-xs text-gray-500 mt-2">
                    Last backup: {backupId}
                  </p>
                )}
              </div>

              {/* Manage Backups */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">Manage Backups</h4>
                <p className="text-sm text-gray-600 mb-3">
                  View, export, and delete existing backups.
                </p>
                <button
                  onClick={() => {
                    setShowBackupList(!showBackupList);
                    if (!showBackupList) {
                      loadBackups();
                    }
                  }}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <List className="w-4 h-4 mr-2" />
                  {showBackupList ? 'Hide Backups' : 'View Backups'}
                </button>
              </div>

              {/* Performance Monitor */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">Performance Monitor</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Monitor database performance and query metrics.
                </p>
                <button
                  onClick={() => setShowPerformanceMonitor(true)}
                  className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  <Activity className="w-4 h-4 mr-2" />
                  Open Monitor
                </button>
              </div>

              {/* Restore Backup */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">Restore Backup</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Restore database from a previous backup.
                </p>
                {!showRestoreForm ? (
                  <button
                    onClick={() => setShowRestoreForm(true)}
                    className="flex items-center px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Restore Backup
                  </button>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={restoreBackupId}
                      onChange={(e) => setRestoreBackupId(e.target.value)}
                      placeholder="Enter backup ID"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <div className="flex space-x-2">
                      <button
                        onClick={restoreFromBackup}
                        disabled={isRestoring}
                        className="flex items-center px-3 py-1 bg-orange-600 text-white rounded text-sm hover:bg-orange-700 disabled:opacity-50"
                      >
                        {isRestoring ? 'Restoring...' : 'Restore'}
                      </button>
                      <button
                        onClick={() => {
                          setShowRestoreForm(false);
                          setRestoreBackupId('');
                        }}
                        className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Backup List */}
            {showBackupList && (
              <div className="mt-6">
                <h4 className="font-medium text-gray-900 mb-3">Available Backups</h4>
                {isLoadingBackups ? (
                  <div className="flex items-center justify-center py-4">
                    <RefreshCw className="w-5 h-5 animate-spin mr-2" />
                    Loading backups...
                  </div>
                ) : backups.length === 0 ? (
                  <p className="text-gray-500 text-sm">No backups found</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {backups.map((backup) => (
                      <div key={backup.id} className="bg-white border border-gray-200 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center">
                              <FileText className="w-4 h-4 text-gray-400 mr-2" />
                              <span className="font-medium text-sm">{backup.id}</span>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {new Date(backup.timestamp).toLocaleString()} • 
                              {Object.values(backup.recordCounts).reduce((sum, count) => sum + count, 0)} records • 
                              {(backup.totalSize / 1024).toFixed(1)}KB
                            </div>
                          </div>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => {
                                setRestoreBackupId(backup.id);
                                setShowRestoreForm(true);
                              }}
                              className="px-2 py-1 bg-orange-600 text-white rounded text-xs hover:bg-orange-700"
                            >
                              Restore
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  const result = await databaseBackupService.exportBackup(backup.id);
                                  if (result.success && result.blob) {
                                    const url = URL.createObjectURL(result.blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `backup_${backup.id}.json`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                  }
                                } catch (error) {
                                  alert('Export failed');
                                }
                              }}
                              className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                            >
                              Export
                            </button>
                            <button
                              onClick={async () => {
                                if (confirm('Are you sure you want to delete this backup?')) {
                                  try {
                                    await databaseBackupService.deleteBackup(backup.id);
                                    loadBackups();
                                  } catch (error) {
                                    alert('Delete failed');
                                  }
                                }
                              }}
                              className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Transaction Management & Consistency */}
          <div className="border-t pt-6 mt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Lock className="w-5 h-5 mr-2" />
              Transaction Management & Consistency
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Consistency Check */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">Data Consistency</h4>
                <p className="text-sm text-gray-600 mb-3">
                  Check for orphaned records, invalid references, and data inconsistencies.
                </p>
                <button
                  onClick={checkConsistency}
                  disabled={isCheckingConsistency}
                  className="flex items-center px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                >
                  <AlertCircle className="w-4 h-4 mr-2" />
                  {isCheckingConsistency ? 'Checking...' : 'Check Consistency'}
                </button>
              </div>

              {/* Active Transactions */}
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">Active Transactions</h4>
                <p className="text-sm text-gray-600 mb-3">
                  View and manage active database transactions.
                </p>
                <button
                  onClick={loadActiveTransactions}
                  className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  <Lock className="w-4 h-4 mr-2" />
                  View Transactions
                </button>
              </div>
            </div>

            {/* Consistency Check Results */}
            {consistencyChecks.length > 0 && (
              <div className="mt-6">
                <h4 className="font-medium text-gray-900 mb-3">Consistency Check Results</h4>
                <div className="space-y-4">
                  {consistencyChecks.map((check, index) => (
                    <div key={index} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="font-medium text-gray-900 capitalize">
                          {check.tableName.replace('_', ' ')}
                        </h5>
                        <div className="flex items-center">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            check.score >= 80 ? 'bg-green-100 text-green-800' :
                            check.score >= 60 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            Score: {check.score}/100
                          </span>
                        </div>
                      </div>
                      
                      {check.issues.length === 0 ? (
                        <p className="text-green-600 text-sm">✅ No issues found</p>
                      ) : (
                        <div className="space-y-2">
                          {check.issues.map((issue, issueIndex) => (
                            <div key={issueIndex} className={`p-3 rounded-lg border ${
                              issue.severity === 'critical' ? 'bg-red-50 border-red-200' :
                              issue.severity === 'high' ? 'bg-orange-50 border-orange-200' :
                              issue.severity === 'medium' ? 'bg-yellow-50 border-yellow-200' :
                              'bg-blue-50 border-blue-200'
                            }`}>
                              <div className="flex items-start">
                                <AlertTriangle className={`w-4 h-4 mr-2 mt-0.5 ${
                                  issue.severity === 'critical' ? 'text-red-500' :
                                  issue.severity === 'high' ? 'text-orange-500' :
                                  issue.severity === 'medium' ? 'text-yellow-500' :
                                  'text-blue-500'
                                }`} />
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-gray-900">
                                    {issue.description}
                                  </p>
                                  {issue.recordId && (
                                    <p className="text-xs text-gray-500 mt-1">
                                      Record ID: {issue.recordId}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Active Transactions List */}
            {activeTransactions.length > 0 && (
              <div className="mt-6">
                <h4 className="font-medium text-gray-900 mb-3">Active Transactions</h4>
                <div className="space-y-2">
                  {activeTransactions.map((transaction) => (
                    <div key={transaction.id} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">{transaction.id}</p>
                          <p className="text-sm text-gray-500">
                            {transaction.operations.length} operations • 
                            {transaction.isolationLevel} • 
                            {new Date(transaction.startTime).toLocaleTimeString()}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            transaction.state === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            transaction.state === 'committed' ? 'bg-green-100 text-green-800' :
                            transaction.state === 'rolled_back' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {transaction.state}
                          </span>
                          <button
                            onClick={() => databaseTransactionService.cancelTransaction(transaction.id)}
                            className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Database Info */}
          <div className="border-t pt-6 mt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Database Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-700">Current Version:</span>
                <span className="ml-2 text-gray-600">{databaseMigrationService.getCurrentVersion()}</span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Schema Status:</span>
                <span className={`ml-2 ${validationResult?.isValid ? 'text-green-600' : 'text-red-600'}`}>
                  {validationResult?.isValid ? 'Valid' : 'Invalid'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Monitor Modal */}
      {showPerformanceMonitor && (
        <DatabasePerformanceMonitor onClose={() => setShowPerformanceMonitor(false)} />
      )}
    </div>
  );
}
