import React, { useState, useEffect } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useI18n } from '../i18n';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { crudHelperService } from '../services/crudHelperService';
import { 
  RefreshCw, 
  AlertCircle, 
  CheckCircle, 
  Clock, 
  Database, 
  ChevronDown, 
  ChevronRight,
  CloudOff,
  Download,
  Upload,
  FileText,
  Package,
  Users,
  ShoppingCart,
  Calculator,
  Store,
  Truck,
  Receipt
} from 'lucide-react';

interface UnsyncedTableData {
  tableName: string;
  count: number;
  records: any[];
}

interface TableMetadata {
  displayName: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const TABLE_METADATA: Record<string, TableMetadata> = {
  products: { displayName: 'Products', icon: Package, color: 'text-blue-600' },
  suppliers: { displayName: 'Suppliers', icon: Truck, color: 'text-green-600' },
  customers: { displayName: 'Customers', icon: Users, color: 'text-purple-600' },
  inventory_items: { displayName: 'Inventory Items', icon: Package, color: 'text-indigo-600' },
  inventory_bills: { displayName: 'Inventory Bills', icon: Receipt, color: 'text-cyan-600' },
  bills: { displayName: 'Bills', icon: FileText, color: 'text-orange-600' },
  bill_line_items: { displayName: 'Bill Line Items', icon: FileText, color: 'text-orange-500' },
  bill_audit_logs: { displayName: 'Bill Audit Logs', icon: FileText, color: 'text-orange-400' },
  transactions: { displayName: 'Transactions', icon: Calculator, color: 'text-emerald-600' },
  cash_drawer_accounts: { displayName: 'Cash Drawer Accounts', icon: Store, color: 'text-pink-600' },
  cash_drawer_sessions: { displayName: 'Cash Drawer Sessions', icon: Store, color: 'text-pink-500' },
  stores: { displayName: 'Stores', icon: Store, color: 'text-gray-600' },
};

export default function UnsyncedItems() {
  const { t } = useI18n();
  const { handleError } = useErrorHandler();
  const { sync, getSyncStatus, isOnline, getUnsyncedRecords } = useOfflineData();
  const { unsyncedCount, isSyncing } = getSyncStatus();
  
  const [unsyncedData, setUnsyncedData] = useState<UnsyncedTableData[]>([]);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadUnsyncedData = async () => {
    setLoading(true);
    try {
      const { total, byTable } = await crudHelperService.getUnsyncedCount();
      
      const tablesWithData: UnsyncedTableData[] = [];
      
      for (const [tableName, count] of Object.entries(byTable)) {
        if (count > 0) {
          const records = await getUnsyncedRecords(tableName);
          tablesWithData.push({
            tableName,
            count,
            records: records.slice(0, 50) // Limit to 50 records per table for performance
          });
        }
      }
      
      // Sort by count descending
      tablesWithData.sort((a, b) => b.count - a.count);
      
      setUnsyncedData(tablesWithData);
      setLastRefresh(new Date());
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  };

  // Event-driven refresh: reload when unsynced count changes (CRUD/sync elsewhere)
  // or on mount. No periodic polling — aligns with DEVELOPER_RULES §5.
  useEffect(() => {
    loadUnsyncedData();
  }, [unsyncedCount]);

  const toggleTable = (tableName: string) => {
    setExpandedTables(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tableName)) {
        newSet.delete(tableName);
      } else {
        newSet.add(tableName);
      }
      return newSet;
    });
  };

  const handleSync = async () => {
    if (!isOnline || isSyncing) return;
    await sync();
    await loadUnsyncedData();
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return 'N/A';
    }
  };

  const getOperationType = (record: any): 'CREATE' | 'UPDATE' | 'DELETE' => {
    // Check if record is marked for deletion
    if (record._deleted === true) {
      return 'DELETE';
    }
    
    // Check if record was previously synced (has _lastSyncedAt)
    // If it has _lastSyncedAt, it means it was synced before, so this is an UPDATE
    // If it doesn't have _lastSyncedAt and _synced is false, it's a new record (CREATE)
    if (record._lastSyncedAt) {
      return 'UPDATE';
    }
    
    // New record that hasn't been synced yet
    return 'CREATE';
  };

  const getOperationColor = (operation: 'CREATE' | 'UPDATE' | 'DELETE'): string => {
    switch (operation) {
      case 'CREATE':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'UPDATE':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'DELETE':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getOperationIcon = (operation: 'CREATE' | 'UPDATE' | 'DELETE') => {
    switch (operation) {
      case 'CREATE':
        return '➕';
      case 'UPDATE':
        return '✏️';
      case 'DELETE':
        return '🗑️';
      default:
        return '📝';
    }
  };

  const formatRecordPreview = (record: any, tableName: string): string => {
    // Create a preview string based on common fields
    if (record.name) return record.name;
    if (record.bill_number) return `Bill #${record.bill_number}`;
    if (record.product_name) return record.product_name;
    if (record.description) return record.description.substring(0, 50);
    if (record.id) return record.id.substring(0, 8) + '...';
    return 'Record';
  };

  const getTableMetadata = (tableName: string): TableMetadata => {
    return TABLE_METADATA[tableName] || {
      displayName: tableName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      icon: Database,
      color: 'text-gray-600'
    };
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center">
              <CloudOff className="w-8 h-8 mr-3 text-yellow-600" />
              {t('unsyncedItems.title') || 'Unsynced Items'}
            </h1>
            <p className="text-gray-600">
              {t('unsyncedItems.subtitle') || 'Items pending synchronization with the server'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadUnsyncedData}
              disabled={loading}
              className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {t('common.actions.refresh') || 'Refresh'}
            </button>
            {isOnline && (
              <button
                onClick={handleSync}
                disabled={isSyncing || unsyncedCount === 0}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload className="w-4 h-4" />
                {isSyncing ? (t('common.actions.syncing') || 'Syncing...') : (t('common.actions.syncNow') || 'Sync Now')}
              </button>
            )}
          </div>
        </div>
        
        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-yellow-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">{t('unsyncedItems.totalUnsynced') || 'Total Unsynced'}</p>
                <p className="text-2xl font-bold text-gray-900">{unsyncedCount}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-yellow-600" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-blue-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">{t('unsyncedItems.tablesAffected') || 'Tables Affected'}</p>
                <p className="text-2xl font-bold text-gray-900">{unsyncedData.length}</p>
              </div>
              <Database className="w-8 h-8 text-blue-600" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-gray-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">{t('unsyncedItems.lastRefresh') || 'Last Refresh'}</p>
                <p className="text-sm font-semibold text-gray-900">
                  {lastRefresh.toLocaleTimeString()}
                </p>
              </div>
              <Clock className="w-8 h-8 text-gray-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Unsynced Items List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : unsyncedData.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {t('unsyncedItems.allSynced') || 'All Items Synced'}
          </h3>
          <p className="text-gray-600">
            {t('unsyncedItems.noPendingItems') || 'There are no items waiting to be synchronized.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {unsyncedData.map(({ tableName, count, records }) => {
            const metadata = getTableMetadata(tableName);
            const Icon = metadata.icon;
            const isExpanded = expandedTables.has(tableName);
            
            return (
              <div key={tableName} className="bg-white rounded-lg shadow-sm overflow-hidden">
                {/* Table Header */}
                <button
                  onClick={() => toggleTable(tableName)}
                  className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-4">
                    <Icon className={`w-5 h-5 ${metadata.color}`} />
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{metadata.displayName}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        <p className="text-sm text-gray-500">
                          {count} {count === 1 ? 'item' : 'items'} pending sync
                          {records.length < count && ` (showing first ${records.length})`}
                        </p>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const operations = records.map(getOperationType);
                            const createCount = operations.filter(op => op === 'CREATE').length;
                            const updateCount = operations.filter(op => op === 'UPDATE').length;
                            const deleteCount = operations.filter(op => op === 'DELETE').length;
                            return (
                              <>
                                {createCount > 0 && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                    {getOperationIcon('CREATE')} {createCount}
                                  </span>
                                )}
                                {updateCount > 0 && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                    {getOperationIcon('UPDATE')} {updateCount}
                                  </span>
                                )}
                                {deleteCount > 0 && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                    {getOperationIcon('DELETE')} {deleteCount}
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-sm font-medium rounded-full">
                      {count}
                    </span>
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>
                
                {/* Expanded Records */}
                {isExpanded && (
                  <div className="border-t border-gray-200">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Operation
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              ID
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Preview
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Created
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Updated
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {records.map((record) => {
                            const operation = getOperationType(record);
                            return (
                              <tr key={record.id} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getOperationColor(operation)}`}>
                                    <span className="mr-1.5">{getOperationIcon(operation)}</span>
                                    {operation}
                                  </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">
                                  {record.id.substring(0, 8)}...
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-900">
                                  {formatRecordPreview(record, tableName)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {formatDate(record.created_at)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                  {formatDate(record.updated_at)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Connection Status */}
      {!isOnline && (
        <div className="mt-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
          <div className="flex items-center">
            <CloudOff className="w-5 h-5 text-red-600 mr-3" />
            <div>
              <p className="text-sm font-medium text-red-800">
                {t('unsyncedItems.offlineWarning') || 'You are currently offline. Items will sync when connection is restored.'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

