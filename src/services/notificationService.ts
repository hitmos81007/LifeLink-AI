import { supabase } from '../lib/supabase/client';
import { NotificationTable } from '../types/database';

/**
 * Fetches notifications for a specific user ID
 */
export async function getUserNotifications(userId: string): Promise<NotificationTable[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('receiver_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not load notifications: ${error.message}`);
  if (!data) throw new Error('Could not load notifications: Supabase returned no data.');
  return data as NotificationTable[];
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
