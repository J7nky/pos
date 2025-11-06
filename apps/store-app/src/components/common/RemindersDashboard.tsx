import React, { useState, useMemo } from 'react';
import { 
  Bell, 
  Calendar, 
  CheckCircle, 
  XCircle, 
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Trash2,
  Snooze,
  RefreshCw
} from 'lucide-react';
import { Reminder, ReminderType, ReminderStatus } from '../../types';
import { reminderMonitoringService } from '../../services/reminderMonitoringService';

interface RemindersDashboardProps {
  storeId: string;
  reminders: Reminder[];
  onRefresh: () => Promise<void>;
  formatDate: (date: string) => string;
  showToast: (message: string, type: 'success' | 'error') => void;
  currentUserId: string;
}

export default function RemindersDashboard({
  storeId,
  reminders,
  onRefresh,
  formatDate,
  showToast,
  currentUserId
}: RemindersDashboardProps) {
  const [statusFilter, setStatusFilter] = useState<ReminderStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<ReminderType | 'all'>('all');
  const [expandedReminder, setExpandedReminder] = useState<string | null>(null);
  const [showCompletionModal, setShowCompletionModal] = useState<string | null>(null);
  const [completionNote, setCompletionNote] = useState('');
  const [showSnoozeModal, setShowSnoozeModal] = useState<string | null>(null);
  const [snoozeDate, setSnoozeDate] = useState('');

  // Calculate statistics
  const stats = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    
    return {
      total: reminders.length,
      pending: reminders.filter(r => r.status === 'pending').length,
      overdue: reminders.filter(r => r.status === 'overdue').length,
      dueToday: reminders.filter(r => r.due_date === today && (r.status === 'pending' || r.status === 'overdue')).length,
      completed: reminders.filter(r => r.status === 'completed').length,
    };
  }, [reminders]);

  // Filter reminders
  const filteredReminders = useMemo(() => {
    return reminders.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      return true;
    }).sort((a, b) => {
      // Sort: overdue first, then by due date
      if (a.status === 'overdue' && b.status !== 'overdue') return -1;
      if (a.status !== 'overdue' && b.status === 'overdue') return 1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });
  }, [reminders, statusFilter, typeFilter]);

  // Get unique types for filter dropdown
  const uniqueTypes = useMemo(() => {
    const types = new Set(reminders.map(r => r.type));
    return Array.from(types).sort();
  }, [reminders]);

  const handleComplete = async (reminderId: string) => {
    try {
      await reminderMonitoringService.completeReminder(reminderId, currentUserId, completionNote);
      await onRefresh();
      setShowCompletionModal(null);
      setCompletionNote('');
      showToast('Reminder completed successfully', 'success');
    } catch (error) {
      console.error('Error completing reminder:', error);
      showToast('Failed to complete reminder', 'error');
    }
  };

  const handleDismiss = async (reminderId: string) => {
    if (!confirm('Are you sure you want to dismiss this reminder?')) return;
    
    try {
      await reminderMonitoringService.dismissReminder(reminderId);
      await onRefresh();
      showToast('Reminder dismissed', 'success');
    } catch (error) {
      console.error('Error dismissing reminder:', error);
      showToast('Failed to dismiss reminder', 'error');
    }
  };

  const handleSnooze = async (reminderId: string) => {
    if (!snoozeDate) {
      showToast('Please select a snooze date', 'error');
      return;
    }

    try {
      await reminderMonitoringService.snoozeReminder(reminderId, snoozeDate);
      await onRefresh();
      setShowSnoozeModal(null);
      setSnoozeDate('');
      showToast('Reminder snoozed', 'success');
    } catch (error) {
      console.error('Error snoozing reminder:', error);
      showToast('Failed to snooze reminder', 'error');
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'text-red-600 bg-red-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'medium': return 'text-blue-600 bg-blue-50';
      case 'low': return 'text-gray-600 bg-gray-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (status: ReminderStatus) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'dismissed': return <XCircle className="w-5 h-5 text-gray-400" />;
      case 'overdue': return <AlertTriangle className="w-5 h-5 text-red-600" />;
      case 'snoozed': return <Snooze className="w-5 h-5 text-blue-600" />;
      default: return <Clock className="w-5 h-5 text-gray-600" />;
    }
  };

  const formatReminderType = (type: ReminderType) => {
    return type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <Bell className="w-8 h-8 text-gray-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-blue-600">{stats.pending}</p>
            </div>
            <Clock className="w-8 h-8 text-blue-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Overdue</p>
              <p className="text-2xl font-bold text-red-600">{stats.overdue}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Due Today</p>
              <p className="text-2xl font-bold text-orange-600">{stats.dueToday}</p>
            </div>
            <Calendar className="w-8 h-8 text-orange-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Completed</p>
              <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ReminderStatus | 'all')}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
              <option value="completed">Completed</option>
              <option value="dismissed">Dismissed</option>
              <option value="snoozed">Snoozed</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as ReminderType | 'all')}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Types</option>
              {uniqueTypes.map(type => (
                <option key={type} value={type}>{formatReminderType(type)}</option>
              ))}
            </select>
          </div>

          <div className="flex-1"></div>

          <button
            onClick={onRefresh}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Reminders List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Reminders ({filteredReminders.length})
          </h3>
        </div>

        {filteredReminders.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Bell className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No reminders found</p>
            <p className="text-sm mt-2">Create reminders to stay on top of important tasks</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredReminders.map((reminder) => (
              <div key={reminder.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 mt-1">
                    {getStatusIcon(reminder.status)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={() => setExpandedReminder(expandedReminder === reminder.id ? null : reminder.id)}
                        className="flex items-center gap-1 text-gray-700 hover:text-gray-900"
                      >
                        {expandedReminder === reminder.id ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                        <h4 className="font-semibold">{reminder.title}</h4>
                      </button>

                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${getPriorityColor(reminder.priority)}`}>
                        {reminder.priority.toUpperCase()}
                      </span>

                      <span className="text-xs text-gray-500">
                        {formatReminderType(reminder.type)}
                      </span>
                    </div>

                    <p className="text-sm text-gray-600 mb-2">{reminder.description}</p>

                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span>Due: {formatDate(reminder.due_date)}</span>
                      {reminder.entity_name && (
                        <span>• {reminder.entity_name}</span>
                      )}
                      {reminder.status === 'snoozed' && reminder.snoozed_until && (
                        <span className="text-blue-600">• Snoozed until {formatDate(reminder.snoozed_until)}</span>
                      )}
                    </div>

                    {expandedReminder === reminder.id && (
                      <div className="mt-4 pt-4 border-t border-gray-200 space-y-2">
                        <div className="text-sm">
                          <span className="font-medium">Entity:</span> {reminder.entity_type} - {reminder.entity_name}
                        </div>
                        {reminder.metadata && Object.keys(reminder.metadata).length > 0 && (
                          <div className="text-sm">
                            <span className="font-medium">Details:</span>
                            <pre className="mt-1 text-xs bg-gray-50 p-2 rounded overflow-auto">
                              {JSON.stringify(reminder.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                        {reminder.completion_note && (
                          <div className="text-sm">
                            <span className="font-medium">Completion Note:</span> {reminder.completion_note}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {(reminder.status === 'pending' || reminder.status === 'overdue' || reminder.status === 'snoozed') && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowCompletionModal(reminder.id)}
                        className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                        title="Complete"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setShowSnoozeModal(reminder.id)}
                        className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                        title="Snooze"
                      >
                        <Snooze className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDismiss(reminder.id)}
                        className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700"
                        title="Dismiss"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completion Modal */}
      {showCompletionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">Complete Reminder</h3>
              <textarea
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                placeholder="Add a note about completion (optional)"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                rows={4}
              />
              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={() => {
                    setShowCompletionModal(null);
                    setCompletionNote('');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleComplete(showCompletionModal)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Complete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Snooze Modal */}
      {showSnoozeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-4">Snooze Reminder</h3>
              <input
                type="date"
                value={snoozeDate}
                onChange={(e) => setSnoozeDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={() => {
                    setShowSnoozeModal(null);
                    setSnoozeDate('');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSnooze(showSnoozeModal)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Snooze
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

