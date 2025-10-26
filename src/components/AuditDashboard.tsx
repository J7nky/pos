import React, { useState, useEffect, useMemo } from 'react';
import { 
  Shield, 
  Search, 
  Calendar, 
  Filter, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Activity, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  Download, 
  RefreshCw,
  BarChart3,
  PieChart,
  Eye,
  FileText,
  DollarSign,
  User,
  Building2,
  ShoppingCart,
  Package
} from 'lucide-react';
import { auditLogService, AuditLogEntry, AuditQuery } from '../services/auditLogService';
import { useCurrency } from '../hooks/useCurrency';
import ActivityFeed from './ActivityFeed';

interface AuditDashboardProps {
  showHeader?: boolean;
  defaultTimeRange?: 'today' | 'week' | 'month' | 'quarter' | 'year';
}

export default function AuditDashboard({ 
  showHeader = true, 
  defaultTimeRange = 'week' 
}: AuditDashboardProps) {
  const { formatCurrency } = useCurrency();
  
  // State
  const [timeRange, setTimeRange] = useState(defaultTimeRange);
  const [selectedView, setSelectedView] = useState<'overview' | 'activity' | 'analytics' | 'integrity'>('overview');
  const [loading, setLoading] = useState(true);
  const [auditSummary, setAuditSummary] = useState<any>(null);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  // Load audit summary
  useEffect(() => {
    const loadAuditSummary = () => {
      setLoading(true);
      try {
        const startDate = getStartDateForRange(timeRange);
        const summary = auditLogService.generateSummary(startDate, new Date().toISOString());
        setAuditSummary(summary);
      } catch (error) {
        console.error('Error loading audit summary:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAuditSummary();
  }, [timeRange]);

  const getStartDateForRange = (range: string): string => {
    const now = new Date();
    switch (range) {
      case 'today':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      case 'week':
        const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        weekStart.setHours(0, 0, 0, 0);
        return weekStart.toISOString();
      case 'month':
        return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      case 'quarter':
        const quarterStart = Math.floor(now.getMonth() / 3) * 3;
        return new Date(now.getFullYear(), quarterStart, 1).toISOString();
      case 'year':
        return new Date(now.getFullYear(), 0, 1).toISOString();
      default:
        const defaultStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        defaultStart.setHours(0, 0, 0, 0);
        return defaultStart.toISOString();
    }
  };

  const exportAuditData = () => {
    const query: AuditQuery = {
      startDate: dateRange.start,
      endDate: dateRange.end
    };
    const data = auditLogService.exportLogs(query);
    
    const blob = new Blob([data], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${dateRange.start}-to-${dateRange.end}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Analytics calculations
  const analytics = useMemo(() => {
    if (!auditSummary) return null;

    const topUsers = Object.entries(auditSummary.entriesByUser)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 5);

    const topActions = Object.entries(auditSummary.entriesByAction)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 10);

    const activityTrend = auditSummary.recentActivity.reduce((acc: Record<string, number>, entry: AuditLogEntry) => {
      const date = new Date(entry.timestamp).toLocaleDateString();
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {});

    return {
      topUsers,
      topActions,
      activityTrend
    };
  }, [auditSummary]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-8">
        <div className="flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400 mr-2" />
          <span className="text-gray-500">Loading audit dashboard...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      {showHeader && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Shield className="w-6 h-6 text-blue-600 mr-3" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Audit Dashboard</h1>
                <p className="text-gray-600">Comprehensive tracking and monitoring of all system activities</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as any)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="quarter">This Quarter</option>
                <option value="year">This Year</option>
              </select>
              <button
                onClick={exportAuditData}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center"
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </button>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex space-x-1 mt-6 bg-gray-100 p-1 rounded-lg w-fit">
            {[
              { id: 'overview', label: 'Overview', icon: BarChart3 },
              { id: 'activity', label: 'Activity Feed', icon: Activity },
              { id: 'analytics', label: 'Analytics', icon: PieChart },
              { id: 'integrity', label: 'Data Integrity', icon: Shield }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedView(tab.id as any)}
                className={`px-4 py-2 rounded-md transition-colors flex items-center ${
                  selectedView === tab.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <tab.icon className="w-4 h-4 mr-2" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Overview */}
      {selectedView === 'overview' && auditSummary && (
        <div className="space-y-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Activities</p>
                  <p className="text-2xl font-bold text-gray-900">{auditSummary.totalEntries.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-full">
                  <Activity className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Critical Events</p>
                  <p className="text-2xl font-bold text-gray-900">{auditSummary.entriesBySeverity.critical || 0}</p>
                </div>
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Active Users</p>
                  <p className="text-2xl font-bold text-gray-900">{Object.keys(auditSummary.entriesByUser).length}</p>
                </div>
                <div className="p-3 bg-green-100 rounded-full">
                  <Users className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Entity Types</p>
                  <p className="text-2xl font-bold text-gray-900">{Object.keys(auditSummary.entriesByEntityType).length}</p>
                </div>
                <div className="p-3 bg-purple-100 rounded-full">
                  <FileText className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Severity Breakdown */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity Severity Breakdown</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {Object.entries(auditSummary.entriesBySeverity).map(([severity, count]) => (
                <div key={severity} className="text-center">
                  <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-2 ${
                    severity === 'critical' ? 'bg-red-100' :
                    severity === 'high' ? 'bg-orange-100' :
                    severity === 'medium' ? 'bg-yellow-100' :
                    'bg-green-100'
                  }`}>
                    <span className={`text-xl font-bold ${
                      severity === 'critical' ? 'text-red-600' :
                      severity === 'high' ? 'text-orange-600' :
                      severity === 'medium' ? 'text-yellow-600' :
                      'text-green-600'
                    }`}>
                      {count as number}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-gray-600 capitalize">{severity}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Critical Events */}
          {auditSummary.criticalEvents.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <AlertTriangle className="w-5 h-5 text-red-500 mr-2" />
                Critical Events Requiring Attention
              </h3>
              <div className="space-y-3">
                {auditSummary.criticalEvents.slice(0, 5).map((event: AuditLogEntry) => (
                  <div key={event.id} className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-red-900">{event.action.replace(/_/g, ' ').toUpperCase()}</p>
                        <p className="text-sm text-red-700 mt-1">{event.description}</p>
                        <p className="text-xs text-red-600 mt-1">
                          {new Date(event.timestamp).toLocaleString()} • {event.userName || event.userEmail || event.userId}
                        </p>
                      </div>
                      <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
                        {event.entityType}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Entity Type Distribution */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity by Entity Type</h3>
            <div className="space-y-3">
              {Object.entries(auditSummary.entriesByEntityType).map(([entityType, count]) => {
                const percentage = (count as number / auditSummary.totalEntries) * 100;
                return (
                  <div key={entityType} className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center mr-3">
                        {entityType === 'customer' && <User className="w-4 h-4 text-blue-600" />}
                        {entityType === 'supplier' && <Building2 className="w-4 h-4 text-purple-600" />}
                        {entityType === 'sale' && <ShoppingCart className="w-4 h-4 text-green-600" />}
                        {entityType === 'inventory_item' && <Package className="w-4 h-4 text-orange-600" />}
                        {entityType === 'transaction' && <DollarSign className="w-4 h-4 text-yellow-600" />}
                        {!['customer', 'supplier', 'sale', 'inventory_item', 'transaction'].includes(entityType) && (
                          <FileText className="w-4 h-4 text-gray-600" />
                        )}
                      </div>
                      <span className="font-medium text-gray-900 capitalize">{entityType.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-32 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full" 
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-600 w-12 text-right">
                        {count as number}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Activity Feed */}
      {selectedView === 'activity' && (
        <ActivityFeed 
          showSearch={true}
          showFilters={true}
          maxEntries={100}
          autoRefresh={true}
        />
      )}

      {/* Analytics */}
      {selectedView === 'analytics' && analytics && (
        <div className="space-y-6">
          {/* Top Users */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Most Active Users</h3>
            <div className="space-y-3">
              {analytics.topUsers.map(([user, count], index) => (
                <div key={user} className="flex items-center justify-between">
                  <div className="flex items-center">
                    <span className="w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-bold mr-3">
                      {index + 1}
                    </span>
                    <span className="font-medium text-gray-900">{user}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-600">{count as number} activities</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Actions */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Most Common Actions</h3>
            <div className="space-y-3">
              {analytics.topActions.map(([action, count]) => {
                const percentage = (count as number / auditSummary.totalEntries) * 100;
                return (
                  <div key={action} className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 capitalize">
                      {action.replace(/_/g, ' ')}
                    </span>
                    <div className="flex items-center space-x-3">
                      <div className="w-24 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-green-600 h-2 rounded-full" 
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-gray-600 w-8 text-right">
                        {count as number}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Activity Trend */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Activity Trend</h3>
            <div className="space-y-2">
              {Object.entries(analytics.activityTrend)
                .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
                .map(([date, count]) => {
                  // Ensure all values are numbers for Math.max
                  const counts = Object.values(analytics.activityTrend).map(Number);
                  const maxCount = Math.max(...counts, 1); // Avoid division by zero
                  const percentage = (Number(count) / maxCount) * 100;
                  return (
                    <div key={date} className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">{date}</span>
                      <div className="flex items-center space-x-3">
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full" 
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-gray-600 w-8 text-right">
                          {count as number}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Data Integrity */}
      {selectedView === 'integrity' && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Integrity Status</h3>
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center">
                <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                <span className="font-medium text-green-900">Audit Logging System Active</span>
              </div>
              <p className="text-sm text-green-700 mt-1">
                All user actions and system changes are being tracked and logged properly.
              </p>
            </div>
            
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center">
                <Clock className="w-5 h-5 text-blue-600 mr-2" />
                <span className="font-medium text-blue-900">Real-time Monitoring</span>
              </div>
              <p className="text-sm text-blue-700 mt-1">
                System is actively monitoring for suspicious activities and data inconsistencies.
              </p>
            </div>

            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mr-2" />
                <span className="font-medium text-yellow-900">Pending Review</span>
              </div>
              <p className="text-sm text-yellow-700 mt-1">
                {auditSummary?.criticalEvents?.length || 0} critical events require attention from administrators.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 