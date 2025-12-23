import { getDB, createId } from '../lib/db';
import { notificationService } from './notificationService';
import { Reminder, ReminderType, ReminderStatus, NotificationType, CreateReminderInput } from '../types';

/**
 * =====================================================
 * UNIFIED REMINDER MONITORING SERVICE
 * =====================================================
 * 
 * Centralized service for monitoring all types of reminders across the application.
 * 
 * Features:
 * - Multi-type reminder support (supplier reviews, payments, follow-ups, etc.)
 * - Flexible notification timing (remind X days before due date
 * - Smart notification tracking (avoid spam)
 * - Status management (pending, overdue, completed, dismissed)
 * - Cloud notification ready (infrastructure in place but inactive)
 * 
 * Architecture:
 * - Singleton pattern for single monitoring instance
 * - Periodic checks every 15 minutes
 * - Integrates with existing notification system
 * - Offline-first with IndexedDB storage
 * 
 * Created: November 4, 2025
 * =====================================================
 */

export class ReminderMonitoringService {
  private static instance: ReminderMonitoringService;
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 15 * 60 * 1000; // Check every 15 minutes

  private constructor() {}

  public static getInstance(): ReminderMonitoringService {
    if (!ReminderMonitoringService.instance) {
      ReminderMonitoringService.instance = new ReminderMonitoringService();
    }
    return ReminderMonitoringService.instance;
  }

  /**
   * Start periodic monitoring of reminders
   */
  public startMonitoring(storeId: string): void {
    console.log('🔔 Starting Reminder Monitoring Service for store:', storeId);

    // Initial check
    this.checkAllReminders(storeId);

    // Stop existing interval if any
    this.stopMonitoring();

    // Set up periodic checks
    this.checkInterval = setInterval(() => {
      this.checkAllReminders(storeId);
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop periodic monitoring
   */
  public stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('🔕 Stopped Reminder Monitoring Service');
    }
  }

  /**
   * Main method: Check all reminders and send notifications as needed
   */
  public async checkAllReminders(storeId: string): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Normalize to start of day

      // Get all pending reminders for this store
      const reminders = await getDB().reminders
        .where('store_id')
        .equals(storeId)
        .filter(r => 
          (r.status === 'pending' || r.status === 'overdue') && 
          !r._deleted
        )
        .toArray();

      console.log(`📋 Checking ${reminders.length} reminders...`);

      for (const reminder of reminders) {
        await this.processReminder(reminder, today);
      }

      // Update overdue statuses
      await this.updateOverdueStatuses(storeId, today);

    } catch (error) {
      console.error('❌ Error checking reminders:', error);
    }
  }

  /**
   * Process a single reminder - check if notification should be sent
   */
  private async processReminder(reminder: Reminder, today: Date): Promise<void> {
    try {
      const dueDate = new Date(reminder.due_date);
      dueDate.setHours(0, 0, 0, 0);

      // Calculate days until due (negative if overdue)
      const daysUntilDue = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      // Check if snoozed
      if (reminder.status === 'snoozed' && reminder.snoozed_until) {
        const snoozeDate = new Date(reminder.snoozed_until);
        if (today < snoozeDate) {
          return; // Still snoozed
        } else {
          // Snooze period ended, reactivate
          await getDB().reminders.update(reminder.id, {
            status: daysUntilDue < 0 ? 'overdue' : 'pending',
            snoozed_until: undefined,
            _synced: false
          });
        }
      }

      // Should we send notification today?
      const shouldNotify = this.shouldSendNotification(reminder, daysUntilDue);

      if (shouldNotify) {
        await this.sendReminderNotification(reminder, daysUntilDue);
        
        // Update last notified timestamp
        await getDB().reminders.update(reminder.id, {
          last_notified_at: new Date().toISOString(),
          notification_count: reminder.notification_count + 1,
          _synced: false
        });
      }

    } catch (error) {
      console.error(`❌ Error processing reminder ${reminder.id}:`, error);
    }
  }

  /**
   * Determine if notification should be sent based on remind_before_days array
   */
  private shouldSendNotification(reminder: Reminder, daysUntilDue: number): boolean {
    // Check if we should notify based on remind_before_days array
    if (!reminder.remind_before_days || reminder.remind_before_days.length === 0) {
      return false;
    }

    // If overdue, send reminder every 7 days
    if (daysUntilDue < 0) {
      const daysSinceLastNotification = reminder.last_notified_at
        ? Math.floor((Date.now() - new Date(reminder.last_notified_at).getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      return daysSinceLastNotification >= 7; // Remind every 7 days if overdue
    }

    // Check if today matches any of the remind_before_days values
    const shouldRemindToday = reminder.remind_before_days.includes(daysUntilDue);

    if (!shouldRemindToday) {
      return false;
    }

    // Avoid sending duplicate notifications on the same day
    if (reminder.last_notified_at) {
      const lastNotifiedDate = new Date(reminder.last_notified_at);
      lastNotifiedDate.setHours(0, 0, 0, 0);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (lastNotifiedDate.getTime() === today.getTime()) {
        return false; // Already notified today
      }
    }

    return true;
  }

  /**
   * Send notification for a reminder
   */
  private async sendReminderNotification(reminder: Reminder, daysUntilDue: number): Promise<void> {
    try {
      const notificationType: NotificationType = daysUntilDue < 0 
        ? 'reminder_overdue' 
        : daysUntilDue === 0 
        ? 'reminder_due' 
        : 'reminder_upcoming';

      const priority = daysUntilDue < 0 
        ? 'high' 
        : daysUntilDue <= 1 
        ? 'high'
        : 'medium';

      // Build notification message
      const { title, message } = this.buildNotificationContent(reminder, daysUntilDue);

      // Check if notification already exists
      const existingNotifications = await getDB().notifications
        .where('store_id')
        .equals(reminder.store_id)
        .filter(n => 
          n.type === notificationType &&
          n.metadata?.reminderId === reminder.id &&
          !n.read
        )
        .toArray();

      // Only send if no unread notification exists
      if (existingNotifications.length === 0) {
        await notificationService.createNotification(
          reminder.store_id,
          notificationType,
          title,
          message,
          {
            priority,
            action_url: reminder.action_url,
            action_label: this.getActionLabel(reminder.type),
            metadata: {
              reminderId: reminder.id,
              reminderType: reminder.type,
              entityType: reminder.entity_type,
              entityId: reminder.entity_id,
              entityName: reminder.entity_name,
              dueDate: reminder.due_date,
              daysUntilDue,
              ...reminder.metadata
            }
          }
        );

        console.log(`📢 Notification sent for reminder: ${reminder.title} (${daysUntilDue} days until due)`);
      }

    } catch (error) {
      console.error(`❌ Error sending reminder notification for ${reminder.id}:`, error);
    }
  }

  /**
   * Build notification content based on reminder type and days until due
   */
  private buildNotificationContent(reminder: Reminder, daysUntilDue: number): { title: string; message: string } {
    let title: string;
    let message: string;

    if (daysUntilDue < 0) {
      // Overdue
      const daysOverdue = Math.abs(daysUntilDue);
      title = `⚠️ Overdue: ${reminder.title}`;
      message = `This reminder is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue. ${reminder.description}`;
    } else if (daysUntilDue === 0) {
      // Due today
      title = `🔔 Due Today: ${reminder.title}`;
      message = `${reminder.description} Please take action today.`;
    } else if (daysUntilDue === 1) {
      // Due tomorrow
      title = `📅 Due Tomorrow: ${reminder.title}`;
      message = `${reminder.description} Due date: ${new Date(reminder.due_date).toLocaleDateString()}`;
    } else {
      // Due in X days
      title = `📅 Upcoming: ${reminder.title}`;
      message = `${reminder.description} Due in ${daysUntilDue} days (${new Date(reminder.due_date).toLocaleDateString()})`;
    }

    return { title, message };
  }

  /**
   * Get action label based on reminder type
   */
  private getActionLabel(type: ReminderType): string {
    const labels: Record<ReminderType, string> = {
      supplier_advance_review: 'Review Advance',
      payment_due: 'View Payment',
      bill_payment: 'View Bill',
      customer_followup: 'View Customer',
      inventory_reorder: 'View Inventory',
      contract_renewal: 'View Contract',
      license_expiration: 'View License',
      equipment_maintenance: 'View Equipment',
      employee_review: 'View Employee',
      insurance_renewal: 'View Insurance',
      lease_renewal: 'View Lease',
      custom: 'View Details'
    };

    return labels[type] || 'View Details';
  }

  /**
   * Update overdue statuses for all pending reminders past their due date
   */
  private async updateOverdueStatuses(storeId: string, today: Date): Promise<void> {
    try {
      const todayStr = today.toISOString().split('T')[0];

      // Find all pending reminders past due date
      const overdueReminders = await getDB().reminders
        .where('store_id')
        .equals(storeId)
        .filter(r => 
          r.status === 'pending' && 
          r.due_date < todayStr && 
          !r._deleted
        )
        .toArray();

      // Update status to overdue
      for (const reminder of overdueReminders) {
        await getDB().reminders.update(reminder.id, {
          status: 'overdue',
          _synced: false
        });
      }

      if (overdueReminders.length > 0) {
        console.log(`⚠️ Updated ${overdueReminders.length} reminder(s) to overdue status`);
      }

    } catch (error) {
      console.error('❌ Error updating overdue statuses:', error);
    }
  }

  /**
   * Create a new reminder
   */
  public async createReminder(input: CreateReminderInput): Promise<Reminder> {
    const now = new Date().toISOString();

    const reminder: Reminder = {
      id: input.id || createId(),
      store_id: input.store_id,
      type: input.type,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      entity_name: input.entity_name,
      due_date: input.due_date,
      remind_before_days: input.remind_before_days || [1, 0], // Default: remind 1 day before and on due date
      status: input.status || 'pending',
      completed_at: input.completed_at,
      completed_by: input.completed_by,
      completion_note: input.completion_note,
      snoozed_until: input.snoozed_until,
      last_notified_at: input.last_notified_at,
      notification_count: 0,
      title: input.title,
      description: input.description,
      priority: input.priority || 'medium',
      action_url: input.action_url,
      metadata: input.metadata,
      notification_channels: input.notification_channels || { in_app: true },
      send_via_cloud: input.send_via_cloud || false,
      cloud_notification_sent: input.cloud_notification_sent || false,
      next_cloud_notification_at: input.next_cloud_notification_at,
      notification_history: input.notification_history || [],
      notify_users: input.notify_users || [],
      notify_roles: input.notify_roles || [],
      created_at: input.created_at || now,
      created_by: input.created_by,
      updated_at: now,
      _synced: false,
      _deleted: false
    };

    await getDB().reminders.add(reminder);
    console.log(`✅ Reminder created: ${reminder.title} (due: ${reminder.due_date})`);

    return reminder;
  }

  /**
   * Mark reminder as completed
   */
  public async completeReminder(
    reminderId: string,
    completedBy: string,
    completionNote?: string
  ): Promise<void> {
    const reminder = await getDB().reminders.get(reminderId);
    if (!reminder) {
      throw new Error('Reminder not found');
    }

    await getDB().reminders.update(reminderId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: completedBy,
      completion_note: completionNote,
      updated_at: new Date().toISOString(),
      _synced: false
    });

    // Delete related notifications
    await this.deleteReminderNotifications(reminder.store_id, reminderId);

    console.log(`✅ Reminder completed: ${reminder.title}`);
  }

  /**
   * Dismiss a reminder (mark as dismissed without completing)
   */
  public async dismissReminder(reminderId: string): Promise<void> {
    const reminder = await getDB().reminders.get(reminderId);
    if (!reminder) {
      throw new Error('Reminder not found');
    }

    await getDB().reminders.update(reminderId, {
      status: 'dismissed',
      updated_at: new Date().toISOString(),
      _synced: false
    });

    // Delete related notifications
    await this.deleteReminderNotifications(reminder.store_id, reminderId);

    console.log(`🚫 Reminder dismissed: ${reminder.title}`);
  }

  /**
   * Snooze a reminder until a specific date
   */
  public async snoozeReminder(reminderId: string, snoozeUntil: string): Promise<void> {
    await getDB().reminders.update(reminderId, {
      status: 'snoozed',
      snoozed_until: snoozeUntil,
      updated_at: new Date().toISOString(),
      _synced: false
    });

    console.log(`😴 Reminder snoozed until: ${snoozeUntil}`);
  }

  /**
   * Delete notifications related to a reminder
   */
  private async deleteReminderNotifications(storeId: string, reminderId: string): Promise<void> {
    const notifications = await getDB().notifications
      .where('store_id')
      .equals(storeId)
      .filter(n => n.metadata?.reminderId === reminderId)
      .toArray();

    for (const notification of notifications) {
      await notificationService.deleteNotification(notification.id);
    }
  }

  /**
   * Get reminder statistics for a store
   */
  public async getReminderStats(storeId: string): Promise<{
    total: number;
    pending: number;
    overdue: number;
    dueToday: number;
    dueThisWeek: number;
    completed: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);
    const weekStr = weekFromNow.toISOString().split('T')[0];

    const allReminders = await getDB().reminders
      .where('store_id')
      .equals(storeId)
      .filter(r => !r._deleted)
      .toArray();

    return {
      total: allReminders.length,
      pending: allReminders.filter(r => r.status === 'pending').length,
      overdue: allReminders.filter(r => r.status === 'overdue').length,
      dueToday: allReminders.filter(r => r.due_date === todayStr && (r.status === 'pending' || r.status === 'overdue')).length,
      dueThisWeek: allReminders.filter(r => 
        r.due_date >= todayStr && 
        r.due_date <= weekStr && 
        (r.status === 'pending' || r.status === 'overdue')
      ).length,
      completed: allReminders.filter(r => r.status === 'completed').length
    };
  }

  /**
   * Get all reminders for a store with optional filters
   */
  public async getReminders(
    storeId: string,
    filters?: {
      status?: ReminderStatus[];
      type?: ReminderType[];
      entityType?: string;
      entityId?: string;
    }
  ): Promise<Reminder[]> {
    let query = getDB().reminders
      .where('store_id')
      .equals(storeId)
      .filter(r => !r._deleted);

    let reminders = await query.toArray();

    // Apply filters
    if (filters?.status) {
      reminders = reminders.filter(r => filters.status!.includes(r.status));
    }

    if (filters?.type) {
      reminders = reminders.filter(r => filters.type!.includes(r.type));
    }

    if (filters?.entityType) {
      reminders = reminders.filter(r => r.entity_type === filters.entityType);
    }

    if (filters?.entityId) {
      reminders = reminders.filter(r => r.entity_id === filters.entityId);
    }

    // Sort by due date (overdue first, then by date)
    reminders.sort((a, b) => {
      if (a.status === 'overdue' && b.status !== 'overdue') return -1;
      if (a.status !== 'overdue' && b.status === 'overdue') return 1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });

    return reminders;
  }
}

export const reminderMonitoringService = ReminderMonitoringService.getInstance();

