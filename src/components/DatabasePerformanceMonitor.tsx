import React, { useState, useEffect } from 'react';
import { databasePerformanceService, DatabaseMetrics, PerformanceAlert } from '../services/databasePerformanceService';
import { 
  BarChart3, 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Database, 
  TrendingUp, 
  TrendingDown,
  RefreshCw,
  Settings,
  XCircle,
  Zap,
  HardDrive,
  Network
} from 'lucide-react';

interface DatabasePerformanceMonitorProps {
  onClose?: () => void;
}

export default function DatabasePerformanceMonitor({ onClose }: DatabasePerformanceMonitorProps) {
  const [metrics, setMetrics] = useState<DatabaseMetrics | null>(null);
  const [alerts, setAlerts] = useState<PerformanceAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'tables' | 'queries' | 'alerts'>('overview');
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    loadMetrics();
    loadAlerts();
    
    // Start monitoring if not already started
    databasePerformanceService.startMonitoring();
    
    // Refresh metrics every 10 seconds
    const interval = setInterval(() => {
      loadMetrics();
      loadAlerts();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const loadMetrics = async () => {
    try {
      const currentMetrics = databasePerformanceService.getDatabaseMetrics();
      setMetrics(currentMetrics);
    } catch (error) {
      console.error('Failed to load metrics:', error);
    }
  };

  const loadAlerts = async () => {
    try {
      const currentAlerts = databasePerformanceService.getAlerts();
      setAlerts(currentAlerts);
    } catch (error) {
      console.error('Failed to load alerts:', error);
    }
  };

  const resolveAlert = (alertId: string) => {
    databasePerformanceService.resolveAlert(alertId);
    loadAlerts();
  };

  const getPerformanceColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getPerformanceIcon = (score: number) => {
    if (score >= 80) return <CheckCircle className="w-5 h-5 text-green-600" />;
    if (score >= 60) return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
    return <XCircle className="w-5 h-5 text-red-600" />;
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms.toFixed(1)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  if (!metrics) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
          <div className="flex items-center justify-center">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            <span>Loading performance metrics...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center">
            <BarChart3 className="w-6 h-6 text-blue-600 mr-3" />
            <h2 className="text-xl font-semibold text-gray-900">Database Performance Monitor</h2>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'overview', label: 'Overview', icon: Activity },
              { id: 'tables', label: 'Tables', icon: Database },
              { id: 'queries', label: 'Queries', icon: Clock },
              { id: 'alerts', label: 'Alerts', icon: AlertTriangle }
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as any)}
                className={`flex items-center py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4 mr-2" />
                {label}
                {id === 'alerts' && alerts.length > 0 && (
                  <span className="ml-2 bg-red-100 text-red-600 text-xs px-2 py-1 rounded-full">
                    {alerts.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Performance Score */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Performance Score</h3>
                    <p className="text-sm text-gray-600">Overall database performance rating</p>
                  </div>
                  <div className="flex items-center">
                    {getPerformanceIcon(metrics.performanceScore)}
                    <span className={`ml-2 text-3xl font-bold ${getPerformanceColor(metrics.performanceScore)}`}>
                      {metrics.performanceScore}
                    </span>
                    <span className="ml-1 text-gray-500">/100</span>
                  </div>
                </div>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <Clock className="w-5 h-5 text-blue-600 mr-2" />
                    <div>
                      <p className="text-sm font-medium text-gray-600">Avg Query Time</p>
                      <p className="text-2xl font-semibold text-gray-900">
                        {formatDuration(metrics.averageQueryTime)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <Database className="w-5 h-5 text-green-600 mr-2" />
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Records</p>
                      <p className="text-2xl font-semibold text-gray-900">
                        {metrics.totalRecords.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <HardDrive className="w-5 h-5 text-purple-600 mr-2" />
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Size</p>
                      <p className="text-2xl font-semibold text-gray-900">
                        {formatBytes(metrics.totalSizeBytes)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <Network className="w-5 h-5 text-orange-600 mr-2" />
                    <div>
                      <p className="text-sm font-medium text-gray-600">Error Rate</p>
                      <p className="text-2xl font-semibold text-gray-900">
                        {metrics.errorRate.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Connection Pool Status */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Connection Pool Status</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-2xl font-semibold text-green-600">
                      {metrics.connectionPoolStatus.healthy}
                    </p>
                    <p className="text-sm text-gray-600">Healthy</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-semibold text-red-600">
                      {metrics.connectionPoolStatus.unhealthy}
                    </p>
                    <p className="text-sm text-gray-600">Unhealthy</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-semibold text-gray-600">
                      {metrics.connectionPoolStatus.total}
                    </p>
                    <p className="text-sm text-gray-600">Total</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tables' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Table Performance</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Table
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Records
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Size
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Avg Query Time
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Error Rate
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Last Accessed
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {metrics.tableMetrics.map((table) => (
                      <tr key={table.tableName}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {table.tableName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {table.recordCount.toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatBytes(table.sizeBytes)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDuration(table.averageQueryTime)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            table.errorRate > 10 ? 'bg-red-100 text-red-800' :
                            table.errorRate > 5 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {table.errorRate.toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {table.lastAccessed.toLocaleTimeString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'queries' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Recent Queries</h3>
              <div className="space-y-2">
                {metrics.recentQueries.map((query) => (
                  <div key={query.queryId} className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className={`w-3 h-3 rounded-full mr-3 ${
                          query.success ? 'bg-green-500' : 'bg-red-500'
                        }`} />
                        <div>
                          <p className="font-medium text-gray-900">
                            {query.operation.toUpperCase()} on {query.tableName}
                          </p>
                          <p className="text-sm text-gray-500">
                            {query.recordCount} records • {formatDuration(query.duration)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-500">
                          {new Date(query.startTime).toLocaleTimeString()}
                        </p>
                        {query.error && (
                          <p className="text-xs text-red-600 mt-1">{query.error}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'alerts' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Performance Alerts</h3>
              {alerts.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                  <p className="text-gray-500">No active alerts</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {alerts.map((alert) => (
                    <div key={alert.id} className={`border rounded-lg p-4 ${getSeverityColor(alert.severity)}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <AlertTriangle className="w-5 h-5 mr-3" />
                          <div>
                            <p className="font-medium">{alert.message}</p>
                            <p className="text-sm opacity-75">
                              {alert.timestamp.toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => resolveAlert(alert.id)}
                          className="px-3 py-1 bg-white bg-opacity-50 rounded text-sm hover:bg-opacity-75"
                        >
                          Resolve
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

