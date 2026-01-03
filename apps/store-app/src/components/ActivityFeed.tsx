import React, { useState, useEffect, useMemo } from 'react';
import { 
  Activity, 
  Search, 
  Filter, 
  Clock, 
  User, 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Package, 
  ShoppingCart, 
  CreditCard, 
  AlertCircle, 
  CheckCircle, 
  Eye, 
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  AlertTriangle
} from 'lucide-react';
import { auditLogService, AuditLogEntry, AuditQuery } from '../services/auditLogService';
import { useCurrency } from '../hooks/useCurrency';
import { normalizeNameForComparison } from '../utils/nameNormalization';

interface ActivityFeedProps {
  showSearch?: boolean;
  showFilters?: boolean;
  maxEntries?: number;
  entityId?: string;
  entityType?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export default function ActivityFeed({
  showSearch = true,
  showFilters = true,
  maxEntries = 50,
  entityId,
  entityType,
  autoRefresh = true,
  refreshInterval = 30000
}: ActivityFeedProps) {
  const { formatCurrency } = useCurrency();
  
  // State
  const [activities, setActivities] = useState<AuditLogEntry[]>([]);
  const [filteredActivities, setFilteredActivities] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [showFiltersPanel, setShowFiltersPanel] = useState(false);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  // Load activities
  const loadActivities = useMemo(() => {
    const query: AuditQuery = {
      startDate: dateRange.start,
      endDate: dateRange.end,
      limit: maxEntries
    };

    if (entityId) query.entityId = entityId;
    if (entityType) query.entityType = entityType as any;
    if (selectedSeverity !== 'all') query.severity = selectedSeverity as any;
    if (selectedAction !== 'all') query.action = selectedAction as any;
    if (selectedUser !== 'all') query.userId = selectedUser;
    if (searchTerm) query.searchTerm = searchTerm;

    return auditLogService.queryLogs(query);
  }, [dateRange, maxEntries, entityId, entityType, selectedSeverity, selectedAction, selectedUser, searchTerm]);

  // Load data on mount and when filters change
  useEffect(() => {
    setLoading(true);
    try {
      const results = loadActivities;
      setActivities(results);
      setFilteredActivities(results);
    } catch (error) {
      console.error('Error loading activities:', error);
    } finally {
      setLoading(false);
    }
  }, [loadActivities]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      const results = loadActivities;
      setActivities(results);
      setFilteredActivities(results);
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, loadActivities]);

  // Real-time updates via event listener
  useEffect(() => {
    const handleNewLogEntry = (event: CustomEvent) => {
      const newEntry = event.detail as AuditLogEntry;
      
      // Check if entry matches current filters
      const matchesFilters = 
        (!entityId || newEntry.entityId === entityId) &&
        (!entityType || newEntry.entityType === entityType) &&
        (selectedSeverity === 'all' || newEntry.severity === selectedSeverity) &&
        (selectedAction === 'all' || newEntry.action === selectedAction) &&
        (selectedUser === 'all' || newEntry.userId === selectedUser) &&
        (!searchTerm || 
          normalizeNameForComparison(newEntry.description).includes(normalizeNameForComparison(searchTerm)) ||
          normalizeNameForComparison(newEntry.entityName || '').includes(normalizeNameForComparison(searchTerm))
        );

      if (matchesFilters) {
        setActivities(prev => [newEntry, ...prev.slice(0, maxEntries - 1)]);
        setFilteredActivities(prev => [newEntry, ...prev.slice(0, maxEntries - 1)]);
      }
    };

    window.addEventListener('audit-log-created', handleNewLogEntry as EventListener);
    return () => window.removeEventListener('audit-log-created', handleNewLogEntry as EventListener);
  }, [entityId, entityType, selectedSeverity, selectedAction, selectedUser, searchTerm, maxEntries]);

  // Get unique values for filters
  const uniqueUsers = useMemo(() => {
    const users = new Set<string>();
    activities.forEach(activity => {
      const userDisplay = activity.userName || activity.userEmail || activity.userId;
      users.add(userDisplay);
    });
    return Array.from(users).sort();
  }, [activities]);

  const uniqueActions = useMemo(() => {
    const actions = new Set<string>();
    activities.forEach(activity => actions.add(activity.action));
    return Array.from(actions).sort();
  }, [activities]);

  // Helper functions
  const getActivityIcon = (action: string, severity: string) => {
    const iconProps = { className: "w-4 h-4" };
    
    if (severity === 'critical') return <AlertTriangle {...iconProps} className="w-4 h-4 text-red-500" />;
    if (severity === 'high') return <AlertCircle {...iconProps} className="w-4 h-4 text-orange-500" />;
    
    switch (action) {
      case 'customer_payment_received':
        return <ArrowDownRight {...iconProps} className="w-4 h-4 text-green-500" />;
      case 'supplier_payment_sent':
        return <ArrowUpRight {...iconProps} className="w-4 h-4 text-red-500" />;
      case 'sale_created':
        return <ShoppingCart {...iconProps} className="w-4 h-4 text-blue-500" />;
      case 'inventory_received':
        return <Package {...iconProps} className="w-4 h-4 text-purple-500" />;
      case 'customer_created':
      case 'supplier_created':
        return <User {...iconProps} className="w-4 h-4 text-indigo-500" />;
      case 'transaction_created':
        return <DollarSign {...iconProps} className="w-4 h-4 text-gray-500" />;
      case 'customer_balance_adjusted':
      case 'supplier_balance_adjusted':
        return <TrendingUp {...iconProps} className="w-4 h-4 text-yellow-500" />;
      default:
        return <Activity {...iconProps} className="w-4 h-4 text-gray-400" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatActionName = (action: string) => {
    return action.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const toggleExpanded = (entryId: string) => {
    const newExpanded = new Set(expandedEntries);
    if (newExpanded.has(entryId)) {
      newExpanded.delete(entryId);
    } else {
      newExpanded.add(entryId);
    }
    setExpandedEntries(newExpanded);
  };

  const exportActivities = () => {
    const csvContent = [
      ['Timestamp', 'User', 'Action', 'Entity', 'Description', 'Severity', 'Tags'].join(','),
      ...filteredActivities.map(activity => [
        new Date(activity.timestamp).toLocaleString(),
        activity.userName || activity.userEmail || activity.userId,
        formatActionName(activity.action),
        activity.entityName || activity.entityId,
        activity.description.replace(/,/g, ';'),
        activity.severity,
        activity.tags.join(';')
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-log-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400 mr-2" />
          <span className="text-gray-500">Loading activity feed...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Activity className="w-5 h-5 text-gray-600 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">Activity Feed</h3>
            {activities.length > 0 && (
              <span className="ml-2 bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs">
                {activities.length} entries
              </span>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            {showFilters && (
              <button
                onClick={() => setShowFiltersPanel(!showFiltersPanel)}
                className={`p-2 rounded-lg transition-colors ${
                  showFiltersPanel ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Filter className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={exportActivities}
              className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
              title="Export to CSV"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                const results = loadActivities;
                setActivities(results);
                setFilteredActivities(results);
              }}
              className="p-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        {showSearch && (
          <div className="mt-4 relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search activities..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        )}

        {/* Filters Panel */}
        {showFilters && showFiltersPanel && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
                <div className="flex space-x-2">
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
                <select
                  value={selectedSeverity}
                  onChange={(e) => setSelectedSeverity(e.target.value)}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  <option value="all">All Severities</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
                <select
                  value={selectedAction}
                  onChange={(e) => setSelectedAction(e.target.value)}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  <option value="all">All Actions</option>
                  {uniqueActions.map(action => (
                    <option key={action} value={action}>
                      {formatActionName(action)}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">User</label>
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                >
                  <option value="all">All Users</option>
                  {uniqueUsers.map(user => (
                    <option key={user} value={user}>
                      {user}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Activity List */}
      <div className="max-h-96 overflow-y-auto">
        {filteredActivities.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <Activity className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-lg font-medium">No activities found</p>
            <p className="text-sm">Try adjusting your filters or date range</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredActivities.map((activity) => (
              <div key={activity.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex items-start space-x-3">
                  {/* Icon */}
                  <div className="flex-shrink-0 mt-1">
                    {getActivityIcon(activity.action, activity.severity)}
                  </div>
                  
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <p className="text-sm font-medium text-gray-900">
                          {formatActionName(activity.action)}
                        </p>
                        <span className={`px-2 py-1 text-xs rounded-full border ${getSeverityColor(activity.severity)}`}>
                          {activity.severity}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs text-gray-500">
                          {new Date(activity.timestamp).toLocaleString()}
                        </span>
                        {(activity.previousData || activity.newData || activity.balanceChange) && (
                          <button
                            onClick={() => toggleExpanded(activity.id)}
                            className="text-gray-400 hover:text-gray-600"
                          >
                            {expandedEntries.has(activity.id) ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <p className="text-sm text-gray-600 mt-1">
                      {activity.description}
                    </p>
                    
                    <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                      <span className="flex items-center">
                        <User className="w-3 h-3 mr-1" />
                        {activity.userName || activity.userEmail || activity.userId}
                      </span>
                      {activity.entityName && (
                        <span className="flex items-center">
                          <Info className="w-3 h-3 mr-1" />
                          {activity.entityName}
                        </span>
                      )}
                      {activity.balanceChange && (
                        <span className="flex items-center">
                          <DollarSign className="w-3 h-3 mr-1" />
                          {formatCurrency(activity.balanceChange.balanceBefore)} → {formatCurrency(activity.balanceChange.balanceAfter)}
                        </span>
                      )}
                    </div>

                    {activity.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {activity.tags.map(tag => (
                          <span
                            key={tag}
                            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Expanded Details */}
                    {expandedEntries.has(activity.id) && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                        {activity.balanceChange && (
                          <div className="mb-3">
                            <h5 className="text-xs font-medium text-gray-700 mb-1">Balance Change</h5>
                            <div className="text-xs text-gray-600">
                              <div>Entity: {activity.balanceChange.entityType}</div>
                              <div>Before: {formatCurrency(activity.balanceChange.balanceBefore)} {activity.balanceChange.currency}</div>
                              <div>After: {formatCurrency(activity.balanceChange.balanceAfter)} {activity.balanceChange.currency}</div>
                              <div>Change: {formatCurrency(activity.balanceChange.balanceAfter - activity.balanceChange.balanceBefore)} {activity.balanceChange.currency}</div>
                            </div>
                          </div>
                        )}
                        
                        {activity.changedFields && activity.changedFields.length > 0 && (
                          <div className="mb-3">
                            <h5 className="text-xs font-medium text-gray-700 mb-1">Changed Fields</h5>
                            <div className="flex flex-wrap gap-1">
                              {activity.changedFields.map(field => (
                                <span key={field} className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded">
                                  {field}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {activity.relatedTransactions && activity.relatedTransactions.length > 0 && (
                          <div className="mb-3">
                            <h5 className="text-xs font-medium text-gray-700 mb-1">Related Transactions</h5>
                            <div className="text-xs text-gray-600">
                              {activity.relatedTransactions.map(txnId => (
                                <div key={txnId}>{txnId}</div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="text-xs text-gray-500">
                          <div>Session: {activity.metadata.sessionId}</div>
                          <div>Correlation: {activity.metadata.correlationId}</div>
                          <div>Source: {activity.metadata.source} / {activity.metadata.module}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 