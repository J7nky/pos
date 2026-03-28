/**
 * Notifications domain layer for OfflineDataContext (§1.3).
 * Owns notifications and notificationPreferences state; loadNotifications(storeId) for refreshData;
 * createNotification, markAsRead, markAllAsRead, deleteNotification, updateNotificationPreferences.
 */

import { useState, useCallback, useMemo } from 'react';
import { notificationService } from '../../services/notificationService';
import type { NotificationType } from '../../types';
import type { NotificationsDataLayerAdapter, NotificationsDataLayerResult } from './types';

export function useNotificationsDataLayer(adapter: NotificationsDataLayerAdapter): NotificationsDataLayerResult {
  const { storeId } = adapter;

  const [notifications, setNotifications] = useState<NotificationsDataLayerResult['notifications']>([]);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationsDataLayerResult['notificationPreferences']>(null);

  const unreadCount = useMemo(
    () => notifications.filter(n => !n.read).length,
    [notifications]
  );

  const loadNotifications = useCallback(async (storeIdParam: string) => {
    const [notificationsData, preferencesData] = await Promise.all([
      notificationService.getNotifications(storeIdParam, { limit: 100 }),
      notificationService.getPreferences(storeIdParam),
    ]);
    setNotifications(notificationsData);
    setNotificationPreferences(preferencesData);
    await notificationService.deleteExpiredNotifications(storeIdParam);
  }, []);

  const createNotification = useCallback(
    async (
      type: NotificationType,
      title: string,
      message: string,
      options?: {
        priority?: 'low' | 'medium' | 'high';
        action_url?: string;
        action_label?: string;
        metadata?: Record<string, any>;
        expires_at?: string;
      }
    ) => {
      if (!storeId) return;
      const notification = await notificationService.createNotification(storeId, type, title, message, options);
      setNotifications(prev => [notification, ...prev]);
    },
    [storeId]
  );

  const markAsRead = useCallback(async (id: string) => {
    await notificationService.markAsRead(id);
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!storeId) return;
    await notificationService.markAllAsRead(storeId);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, [storeId]);

  const deleteNotification = useCallback(async (id: string) => {
    await notificationService.deleteNotification(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const updateNotificationPreferences = useCallback(
    async (prefs: Parameters<NotificationsDataLayerResult['updateNotificationPreferences']>[0]) => {
      if (!storeId) return;
      await notificationService.updatePreferences(storeId, prefs);
      const updated = await notificationService.getPreferences(storeId);
      setNotificationPreferences(updated);
    },
    [storeId]
  );

  return {
    notifications,
    notificationPreferences,
    unreadCount,
    loadNotifications,
    createNotification,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    updateNotificationPreferences,
  };
}
