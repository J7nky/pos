import { useState, useEffect, useRef } from 'react';
import { Bell, X, Check, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOfflineData } from '../contexts/OfflineDataContext';
import { NotificationRecord } from '../types';

export function NotificationCenter() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useOfflineData();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleNotificationClick = (notification: NotificationRecord) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
    
    if (notification.action_url) {
      navigate(notification.action_url);
      setIsOpen(false);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
  };

  const getNotificationTypeColor = (type: string) => {
    switch (type) {
      case 'low_stock':
      case 'bill_due':
      case 'payment_due':
      case 'reminder_overdue':
      case 'error':
        return 'bg-red-100 text-red-700';
      case 'payment_reminder':
      case 'inventory_alert':
      case 'bill_ready_to_close':
      case 'reminder_due':
      case 'warning':
        return 'bg-orange-100 text-orange-700';
      case 'sync_complete':
      case 'success':
        return 'bg-green-100 text-green-700';
      case 'sync_error':
        return 'bg-red-100 text-red-700';
      case 'reminder_upcoming':
        return 'bg-blue-100 text-blue-700';
      default:
        return 'bg-blue-100 text-blue-700';
    }
  };

  const formatNotificationType = (type: string) => {
    return type.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        title="Notifications"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="w-6 h-6 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Panel */}
      {isOpen && (
        <div className="fixed right-4 top-16 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-[600px] flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-semibold text-lg">Notifications</h3>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                aria-label="Close notifications"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Bell className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${
                      !notification.read ? 'bg-blue-50/50' : ''
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${getNotificationTypeColor(notification.type)}`}>
                            {formatNotificationType(notification.type)}
                          </span>
                          {!notification.read && (
                            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                          )}
                          {notification.priority === 'high' && (
                            <span className="text-xs text-red-600 font-semibold">!</span>
                          )}
                        </div>
                        <h4 className="font-semibold text-sm mb-1">{notification.title}</h4>
                        <p className="text-sm text-gray-600 mb-2">{notification.message}</p>
                        <span className="text-xs text-gray-400">
                          {new Date(notification.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        {!notification.read && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsRead(notification.id);
                            }}
                            className="p-1 hover:bg-gray-200 rounded transition-colors"
                            title="Mark as read"
                            aria-label="Mark as read"
                          >
                            <Check className="w-4 h-4 text-gray-600" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotification(notification.id);
                          }}
                          className="p-1 hover:bg-red-100 rounded transition-colors"
                          title="Delete notification"
                          aria-label="Delete notification"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </div>
                    {notification.action_label && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleNotificationClick(notification);
                        }}
                        className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {notification.action_label} →
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
