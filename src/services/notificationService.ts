import { supabase } from '../lib/supabase/client';
import { NotificationTable, NotificationPriority } from '../types/database';

/**
 * Sends a real notification row into `public.notifications` strictly after underlying DB operation succeeds.
 * MUST use a real public.users.user_id as receiver_id.
 */
export async function sendTypedNotification(
  receiverId: string,
  title: string,
  message: string,
  priority: NotificationPriority = 'Low'
): Promise<NotificationTable | null> {
  if (!receiverId) {
    console.warn('sendTypedNotification skipped: missing receiverId');
    return null;
  }

  try {
    const now = new Date().toISOString();
    const payload = {
      receiver_id: receiverId,
      title,
      message,
      priority,
      is_read: false,
      created_at: now,
      updated_at: now
    };

    const { data, error } = await supabase
      .from('notifications')
      .insert([payload])
      .select()
      .maybeSingle();

    if (error) {
      console.warn('sendTypedNotification DB notice:', error.message);
      return null;
    }

    return data as NotificationTable;
  } catch (err) {
    console.warn('sendTypedNotification exception:', err);
    return null;
  }
}

/**
 * Resolves user_id list for a specific hospital facility
 */
export async function getHospitalUserIds(hospitalId: string): Promise<string[]> {
  try {
    const { data } = await supabase
      .from('users')
      .select('user_id')
      .eq('hospital_id', hospitalId);

    if (data && data.length > 0) {
      return data.map((u) => u.user_id);
    }
  } catch (e) {
    console.warn('getHospitalUserIds error:', e);
  }
  return [];
}

/**
 * Resolves user_id list for government authority role
 */
export async function getGovernmentUserIds(): Promise<string[]> {
  try {
    const { data } = await supabase
      .from('users')
      .select('user_id')
      .eq('role', 'government_admin');

    if (data && data.length > 0) {
      return data.map((u) => u.user_id);
    }
  } catch (e) {
    console.warn('getGovernmentUserIds error:', e);
  }
  return [];
}

/**
 * Broadcasts notification to multiple users (e.g. all admins of a hospital or government)
 */
export async function notifyUsers(
  userIds: string[],
  title: string,
  message: string,
  priority: NotificationPriority = 'Medium'
): Promise<void> {
  if (!userIds || userIds.length === 0) return;
  await Promise.all(userIds.map((uid) => sendTypedNotification(uid, title, message, priority)));
}

/**
 * Fetches notifications for a specific user ID
 */
export async function getUserNotifications(userId: string): Promise<NotificationTable[]> {
  if (!userId) return [];
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('receiver_id', userId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      return data as NotificationTable[];
    }
  } catch (err) {
    console.warn('getUserNotifications error:', err);
  }
  return [];
}

/**
 * Marks a notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, updated_at: new Date().toISOString() })
      .eq('notification_id', notificationId);

    return !error;
  } catch (err) {
    console.warn('markNotificationAsRead error:', err);
    return false;
  }
}

/**
 * Marks all notifications for a user as read
 */
export async function markAllNotificationsAsRead(userId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, updated_at: new Date().toISOString() })
      .eq('receiver_id', userId)
      .eq('is_read', false);

    return !error;
  } catch (err) {
    console.warn('markAllNotificationsAsRead error:', err);
    return false;
  }
}

/**
 * Helper to check and emit low inventory stock alerts
 */
export async function notifyLowStockAlert(
  hospitalId: string,
  resourceType: string,
  currentValue: number,
  thresholdValue: number
) {
  if (currentValue < thresholdValue) {
    const userIds = await getHospitalUserIds(hospitalId);
    const govtUserIds = await getGovernmentUserIds();
    const targetUsers = Array.from(new Set([...userIds, ...govtUserIds]));

    const title = `LOW STOCK ALERT: ${resourceType}`;
    const message = `Facility inventory for ${resourceType} has fallen to ${currentValue} (Threshold: ${thresholdValue}). Immediate restock or transfer recommended.`;

    await notifyUsers(targetUsers, title, message, 'Critical');
  }
}
