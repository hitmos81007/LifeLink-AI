import { supabase } from '../lib/supabase/client';
import { AlertEventTable, RiskAlertTable, RiskAlertStatus } from '../types/database';

export type RiskAlertAction = Extract<RiskAlertStatus, 'acknowledged' | 'resolved' | 'dismissed'>;
export const RISK_ALERT_ACTION_NOTES = [
  'Inventory verified',
  'Restock or transfer requested',
  'Inventory count corrected',
  'Duplicate alert',
  'Expected synthetic scenario threshold',
  'Condition cleared',
  'Source data checked'
] as const;

export async function getRiskAlerts(filter: RiskAlertStatus | 'active' = 'active'): Promise<RiskAlertTable[]> {
  let query = supabase.from('risk_alerts').select('*');
  query = filter === 'active'
    ? query.in('status', ['open', 'acknowledged'])
    : query.eq('status', filter);
  const { data, error } = await query.order('last_detected_at', { ascending: false }).limit(100);
  if (error) throw new Error(`Could not load resource risk alerts: ${error.message}`);
  if (!data) throw new Error('Could not load resource risk alerts: Supabase returned no data.');
  return data as RiskAlertTable[];
}

export async function getRiskAlertEvents(alertIds: string[]): Promise<AlertEventTable[]> {
  if (alertIds.length === 0) return [];
  const { data, error } = await supabase.from('alert_events')
    .select('*')
    .in('alert_id', alertIds)
    .order('occurred_at', { ascending: false });
  if (error) throw new Error(`Could not load risk alert history: ${error.message}`);
  if (!data) throw new Error('Could not load risk alert history: Supabase returned no data.');
  return data as AlertEventTable[];
}

export async function transitionRiskAlert(
  alertId: string,
  action: RiskAlertAction,
  note?: string
): Promise<RiskAlertTable> {
  if (!alertId.trim()) throw new Error('An alert is required.');
  if (!['acknowledged', 'resolved', 'dismissed'].includes(action)) throw new Error('Choose a valid alert action.');
  const normalizedNote = note?.trim() || null;
  if (action === 'resolved' && !normalizedNote) {
    throw new Error('Add a resolution note.');
  }
  if (normalizedNote && !RISK_ALERT_ACTION_NOTES.includes(normalizedNote as typeof RISK_ALERT_ACTION_NOTES[number])) {
    throw new Error('Choose an approved review note; do not enter patient or contact details.');
  }

  const { data, error } = await supabase.rpc('transition_risk_alert', {
    p_alert_id: alertId,
    p_action: action,
    p_note: normalizedNote
  });
  if (error) throw new Error(`Could not update resource risk alert: ${error.message}`);
  const result = (Array.isArray(data) ? data[0] : data) as RiskAlertTable | null;
  if (!result?.alert_id) throw new Error('The alert update returned no saved record. Refresh and verify the status.');
  return result;
}
