import React, { useEffect, useState } from 'react';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { Wifi, WifiOff, RefreshCw, AlertCircle, CheckCircle, Clock, Zap } from 'lucide-react';
import { useI18n } from '../i18n';

export default function SyncStatus() {
  const { getSyncStatus, sync, fullResync, validateAndCleanData, loading } = useOfflineData();
  const { isOnline, lastSync, unsyncedCount, isSyncing, isAutoSyncing } = getSyncStatus();
  const { justCameOnline } = useNetworkStatus();
  const [showConnectionRestored, setShowConnectionRestored] = useState(false);
  const { t } = useI18n();

  // Show connection restored notification
  useEffect(() => {
    if (justCameOnline) {
      setShowConnectionRestored(true);
      setTimeout(() => setShowConnectionRestored(false), 5000);
    }
  }, [justCameOnline]);

  const handleSync = async () => {
    try {
      const result = await sync();
      if (result.success) {
        console.log('Sync completed successfully', result);
      } else {
        console.error('Sync failed', result.errors);
      }
    } catch (error) {
      console.error('Sync error:', error);
    }
  };

  const handleFullResync = async () => {
    if (confirm(t('common.confirmations.fullResyncConfirm'))) {
      try {
        const result = await fullResync();
        if (result.success) {
          console.log('Full resync completed successfully', result);
        } else {
          console.error('Full resync failed', result.errors);
        }
      } catch (error) {
        console.error('Full resync error:', error);
      }
    }
  };

  const handleValidateAndClean = async () => {
    try {
      const result = await validateAndCleanData();
      if (result.cleaned > 0) {
        alert(`${t('syncStatus.validateAndClean')}: ${result.cleaned}`);
      } else {
        alert(`${t('syncStatus.validateAndClean')}: 0`);
      }
      console.log('Data validation report:', result.report);
    } catch (error) {
      console.error('Data validation error:', error);
      alert('Validation failed');
    }
  };

  const formatLastSync = (date: Date | null) => {
    if (!date) return 'Never';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    return date.toLocaleDateString();
  };

  const getStatusColor = () => {
    if (!isOnline) return 'text-red-500';
    if (isSyncing) return 'text-blue-500';
    if (unsyncedCount > 0) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getStatusIcon = () => {
    if (!isOnline) return <WifiOff className="w-4 h-4" />;
    if (isSyncing) return <RefreshCw className="w-4 h-4 animate-spin" />;
    if (unsyncedCount > 0) return <AlertCircle className="w-4 h-4" />;
    return <CheckCircle className="w-4 h-4" />;
  };

  const getStatusText = () => {
    if (!isOnline) return t('common.status.offline');
    if (isSyncing && isAutoSyncing) return 'Auto-syncing...';
    if (isSyncing) return 'Syncing...';
    if (unsyncedCount > 0) return t('common.status.unsyncedCount', { count: unsyncedCount });
    return t('common.status.synced');
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium text-gray-900">{t('syncStatus.header')}</h3>
        <div className={`flex items-center gap-2 ${getStatusColor()}`}>
          {getStatusIcon()}
          <span className="text-sm font-medium">{getStatusText()}</span>
        </div>
      </div>

      <div className="space-y-3">
        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">{t('syncStatus.connection')}</span>
          <div className="flex items-center gap-2">
            {isOnline ? (
              <Wifi className="w-4 h-4 text-green-500" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-500" />
            )}
            <span className={`text-sm font-medium ${isOnline ? 'text-green-600' : 'text-red-600'}`}>
              {isOnline ? t('common.status.online') : t('common.status.offline')}
            </span>
          </div>
        </div>

        {/* Last Sync */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">{t('syncStatus.lastSync')}</span>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-900">{formatLastSync(lastSync)}</span>
          </div>
        </div>

        {/* Unsynced Count */}
        {unsyncedCount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">{t('syncStatus.pendingChanges')}</span>
            <span className="text-sm font-medium text-yellow-600">{unsyncedCount} {t('syncStatus.items')}</span>
          </div>
        )}

        {/* Connection Restored Notification */}
        {showConnectionRestored && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md">
            <Zap className="w-4 h-4 text-green-600" />
            <div className="text-sm text-green-800">
              <p className="font-medium">{t('common.alerts.connectionRestored')}</p>
              <p>{t('common.alerts.autoSyncingChanges')}</p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 pt-3 border-t border-gray-100">
          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={!isOnline || isSyncing || loading.sync}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing && isAutoSyncing ? 'Auto-syncing...' : isSyncing ? 'Syncing...' : t('syncStatus.manualSync')}
            </button>
            
            <button
              onClick={handleFullResync}
              disabled={!isOnline || isSyncing || loading.sync}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('syncStatus.fullResync')}
            </button>
          </div>
          
          <button
            onClick={handleValidateAndClean}
            disabled={isSyncing || loading.sync}
            className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-md hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <AlertCircle className="w-4 h-4" />
            {t('syncStatus.validateAndClean')}
          </button>
        </div>

        {/* Offline Notice */}
        {!isOnline && (
          <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium">{t('syncStatus.workingOffline')}</p>
              <p>{t('syncStatus.offlineNote')}</p>
            </div>
          </div>
        )}

        {/* Auto-sync Info */}
        {isOnline && !showConnectionRestored && (
          <div className="text-xs text-gray-500 text-center pt-2">{t('syncStatus.autoSyncEnabled')}</div>
        )}
      </div>
    </div>
  );
} 