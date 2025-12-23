import { getDB, createId } from '../lib/db';
import { NotificationRecord, NotificationType, NotificationPreferences } from '../types';

/**
 * Notification Service
 * Handles local in-app notifications with IndexedDB storage (offline-first)
 */
export class NotificationService {
  /**
   * Create and store a notification in IndexedDB (offline-first)
   */
  async createNotification(
    storeId: string,
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
  ): Promise<NotificationRecord> {
    const notification: NotificationRecord = {
      id: createId(),
      store_id: storeId,
      type,
      title,
      message,
      read: false,
      priority: options?.priority || 'medium',
      action_url: options?.action_url,
      action_label: options?.action_label,
      metadata: options?.metadata,
      created_at: new Date().toISOString(),
      expires_at: options?.expires_at,
    };

    // Store in IndexedDB first (offline-first pattern)
    await getDB().notifications.add(notification);

    // Clean up old notifications if needed
    await this.cleanupOldNotifications(storeId);

    return notification;
  }

  /**
   * Get all notifications for a store
   */
  async getNotifications(
    storeId: string,
    options?: {
      unread_only?: boolean;
      type?: NotificationType;
      limit?: number;
    }
  ): Promise<NotificationRecord[]> {
    let query = getDB().notifications.where('store_id').equals(storeId);

    if (options?.unread_only) {
      query = query.filter(n => !n.read);
    }

    if (options?.type) {
      query = query.filter(n => n.type === options.type);
    }

    let notifications = await query
      .reverse()
      .sortBy('created_at');

    if (options?.limit) {
      notifications = notifications.slice(0, options.limit);
    }

    // Filter expired notifications
    const now = new Date().toISOString();
    notifications = notifications.filter(n => !n.expires_at || n.expires_at > now);

    return notifications;
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<void> {
    await getDB().notifications.update(notificationId, { read: true });
  }

  /**
   * Mark all as read for a store
   */
  async markAllAsRead(storeId: string): Promise<void> {
    await getDB().notifications
      .where('store_id')
      .equals(storeId)
      .and(n => !n.read)
      .modify({ read: true });
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId: string): Promise<void> {
    await getDB().notifications.delete(notificationId);
  }

  /**
   * Delete all notifications for a store
   */
  async deleteAllNotifications(storeId: string): Promise<void> {
    await getDB().notifications
      .where('store_id')
      .equals(storeId)
      .delete();
  }

  /**
   * Get unread count
   */
  async getUnreadCount(storeId: string): Promise<number> {
    return await getDB().notifications
      .where('store_id')
      .equals(storeId)
      .and(n => !n.read)
      .count();
  }

  /**
   * Get notification preferences
   */
  async getPreferences(storeId: string): Promise<NotificationPreferences> {
    // Query by store_id since the table uses id as primary key
    const prefs = await getDB().notification_preferences
      .where('store_id')
      .equals(storeId)
      .and(p => !p._deleted)
      .first();
    
    if (!prefs) {
      // Default preferences - must include id for database primary key
      const defaults = {
        id: createId(),
        store_id: storeId,
        branch_id: '', // Will be set when branch is available
        enabled: true,
        enabled_types: [
          'low_stock',
          'bill_due',
          'payment_due',
          'payment_reminder',
          'sync_error',
          'bill_ready_to_close',
          'reminder_due',
          'reminder_overdue',
          'reminder_upcoming',
        ],
        sound_enabled: false,
        show_in_app: true,
        max_notifications_in_history: 1000,
        updated_at: new Date().toISOString(),
        _synced: false,
        _deleted: false,
      };
      
      await getDB().notification_preferences.add(defaults);
      // Return only the NotificationPreferences fields (without id and sync fields)
      return {
        store_id: defaults.store_id,
        enabled: defaults.enabled,
        enabled_types: defaults.enabled_types,
        sound_enabled: defaults.sound_enabled,
        show_in_app: defaults.show_in_app,
        max_notifications_in_history: defaults.max_notifications_in_history,
      };
    }
    
    // Return only the NotificationPreferences fields (without id and sync fields)
    return {
      store_id: prefs.store_id,
      enabled: prefs.enabled,
      enabled_types: prefs.enabled_types,
      sound_enabled: prefs.sound_enabled,
      show_in_app: prefs.show_in_app,
      max_notifications_in_history: prefs.max_notifications_in_history,
      auto_dismiss_seconds: (prefs as any).auto_dismiss_seconds,
    };
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(
    storeId: string,
    updates: Partial<NotificationPreferences>
  ): Promise<void> {
    await getDB().notification_preferences.update(storeId, updates);
  }

  /**
   * Helper: Check if notification type is enabled
   */
  async isTypeEnabled(storeId: string, type: NotificationType): Promise<boolean> {
    const prefs = await this.getPreferences(storeId);
    return prefs.enabled && prefs.enabled_types.includes(type);
  }

  /**
   * Helper: Clean up old notifications based on preferences
   */
  private async cleanupOldNotifications(storeId: string): Promise<void> {
    const prefs = await this.getPreferences(storeId);
    const allNotifications = await getDB().notifications
      .where('store_id')
      .equals(storeId)
      .toArray();

    if (allNotifications.length > prefs.max_notifications_in_history) {
      // Sort by created_at, keep newest ones
      const sorted = allNotifications.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      
      const toDelete = sorted.slice(prefs.max_notifications_in_history);
      await getDB().notifications.bulkDelete(toDelete.map(n => n.id));
    }
  }

  /**
   * Delete expired notifications
   */
  async deleteExpiredNotifications(storeId: string): Promise<number> {
    const now = new Date().toISOString();
    const expired = await getDB().notifications
      .where('store_id')
      .equals(storeId)
      .filter(n => n.expires_at && n.expires_at <= now)
      .toArray();

    if (expired.length > 0) {
      await getDB().notifications.bulkDelete(expired.map(n => n.id));
    }

    return expired.length;
  }
}

export const notificationService = new NotificationService();
