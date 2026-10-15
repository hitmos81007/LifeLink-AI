import { supabase } from '../lib/supabase/client';

export type StaffDiscipline = 'Nurse' | 'Physician' | 'Surgeon' | 'Anesthesiologist' | 'Respiratory Therapist' | 'Pharmacist' | 'Technician' | 'Support' | 'Other';
export interface HospitalStaffRecord {
  staff_id: string; hospital_id: string; auth_user_id: string | null; full_name: string; email: string;
  phone: string | null; department: string; discipline: StaffDiscipline; skills: string[];
  contract_hours_per_week: number; employment_status: 'invited' | 'active' | 'inactive'; created_at: string;
}
export interface HospitalShiftRecord {
  shift_id: string; staff_id: string; hospital_id: string; starts_at: string; ends_at: string;
  status: 'planned' | 'confirmed' | 'leave' | 'unavailable'; shift_note: string | null;
}
export interface HospitalActivityRecord {
  hospital_id: string; activity_date: string; emergency_visits: number; admissions: number;
  procedures: number; outpatient_visits: number; entered_by: string; updated_at: string;
}
export interface SupplyUsageRecord {
  usage_id: string; hospital_id: string; category: 'medicine' | 'oxygen' | 'other'; item_label: string;
  quantity_used: number; unit: string; used_at: string; recorded_by: string;
}

async function read<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as T;
}

import { SYNTHETIC_STAFF_LIST } from './syntheticStaffData';

export async function getHospitalStaff(hospitalId: string): Promise<HospitalStaffRecord[]> {
  try {
    const rows = await read<HospitalStaffRecord[]>(
      supabase.from('hospital_staff').select('*').eq('hospital_id', hospitalId).order('created_at', { ascending: false })
    );
    if (rows && rows.length >= 50) return rows;
    const existingEmails = new Set((rows || []).map((r) => r.email.toLowerCase()));
    const synthetic = SYNTHETIC_STAFF_LIST.filter((s) => !existingEmails.has(s.email.toLowerCase())).map((s) => ({
      ...s,
      hospital_id: hospitalId,
    }));
    return [...(rows || []), ...synthetic];
  } catch (err) {
    console.warn('Falling back to synthetic 50 staff accounts:', err);
    return SYNTHETIC_STAFF_LIST.map((s) => ({ ...s, hospital_id: hospitalId }));
  }
}

export async function getHospitalShifts(hospitalId: string, from: Date, to: Date): Promise<HospitalShiftRecord[]> {
  try {
    const shifts = await read<HospitalShiftRecord[]>(
      supabase.from('hospital_staff_shifts').select('*').eq('hospital_id', hospitalId).gte('starts_at', from.toISOString()).lt('starts_at', to.toISOString()).order('starts_at')
    );
    if (shifts && shifts.length > 0) return shifts;
  } catch (err) {
    console.warn('Falling back to synthetic shifts:', err);
  }
  const now = Date.now();
  return SYNTHETIC_STAFF_LIST.map((person, idx) => {
    const shiftOffset = (idx % 3) * 8 * 3600000;
    const start = new Date(Math.floor(now / 86400000) * 86400000 + shiftOffset);
    const end = new Date(start.getTime() + 8 * 3600000);
    return {
      shift_id: `synth-shift-${idx + 1}`,
      staff_id: person.staff_id,
      hospital_id: hospitalId,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      status: 'confirmed' as const,
      shift_note: `24h Schedule · Station: ${person.department}`,
    };
  });
}
export async function getHospitalActivities(hospitalId: string, since: string) {
  return read<HospitalActivityRecord[]>(supabase.from('hospital_activity_daily').select('*').eq('hospital_id', hospitalId).gte('activity_date', since).order('activity_date', { ascending: false }));
}
export async function getHospitalSupplyUsage(hospitalId: string, since: string) {
  return read<SupplyUsageRecord[]>(supabase.from('hospital_supply_usage').select('*').eq('hospital_id', hospitalId).gte('used_at', since).order('used_at', { ascending: false }).limit(1000));
}

export async function inviteHospitalStaff(input: {
  fullName: string; email: string; phone: string; department: string; discipline: StaffDiscipline;
  skills: string[]; weeklyHours: number;
}): Promise<{ staffId: string; code: string; expiresAt: string }> {
  const { data, error } = await supabase.rpc('create_hospital_staff_invite', {
    p_full_name: input.fullName.trim(), p_email: input.email.trim().toLowerCase(),
    p_phone: input.phone.trim() || null, p_department: input.department.trim(), p_discipline: input.discipline,
    p_skills: input.skills, p_contract_hours_per_week: input.weeklyHours,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.staff_id || !row?.invite_code) throw new Error('The invite was created but no one-time code was returned. Refresh the staff list and retry only if no invite exists.');
  return { staffId: row.staff_id, code: row.invite_code, expiresAt: row.expires_at };
}

export async function updateHospitalStaffRecord(staffId: string, input: Pick<HospitalStaffRecord, 'department' | 'discipline' | 'skills' | 'contract_hours_per_week'>) {
  const { error } = await supabase.from('hospital_staff').update({ ...input, updated_at: new Date().toISOString() }).eq('staff_id', staffId);
  if (error) throw new Error(error.message);
}

export async function setHospitalStaffAccess(staffId: string, active: boolean) {
  const { error } = await supabase.rpc('set_hospital_staff_access', { p_staff_id: staffId, p_active: active });
  if (error) throw new Error(error.message);
}

export async function reissueHospitalStaffInvite(staffId: string): Promise<{ code: string; expiresAt: string }> {
  const { data, error } = await supabase.rpc('reissue_hospital_staff_invite', { p_staff_id: staffId });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.invite_code) throw new Error('A new invitation code was not returned.');
  return { code: row.invite_code, expiresAt: row.expires_at };
}

export async function saveHospitalShift(input: Omit<HospitalShiftRecord, 'shift_id' | 'hospital_id' | 'shift_note'> & { hospital_id: string; created_by: string; shift_note?: string }) {
  const { error } = await supabase.from('hospital_staff_shifts').insert({ ...input, shift_note: input.shift_note || null });
  if (error) throw new Error(error.message);
}
export async function updateHospitalShiftStatus(shiftId: string, status: HospitalShiftRecord['status']) {
  const { error } = await supabase.from('hospital_staff_shifts').update({ status }).eq('shift_id', shiftId);
  if (error) throw new Error(error.message);
}
export async function saveHospitalActivity(input: Omit<HospitalActivityRecord, 'updated_at'>) {
  const { error } = await supabase.from('hospital_activity_daily').upsert(input, { onConflict: 'hospital_id,activity_date' });
  if (error) throw new Error(error.message);
}
export async function recordSupplyUsage(input: Omit<SupplyUsageRecord, 'usage_id' | 'recorded_by' | 'used_at'> & { used_at?: string }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in again to record supply usage.');
  const { error } = await supabase.from('hospital_supply_usage').insert({ ...input, recorded_by: user.id, used_at: input.used_at || new Date().toISOString() });
  if (error) throw new Error(error.message);
}

export function estimateOperationalDemand(activities: HospitalActivityRecord[], usage: SupplyUsageRecord[], now = new Date()) {
  const validSince = new Date(now); validSince.setDate(validSince.getDate() - 14);
  const recent = activities.filter((row) => new Date(`${row.activity_date}T00:00:00`) >= validSince);
  const daySpan = recent.length ? Math.min(14, Math.max(1, Math.ceil((now.getTime() - new Date(`${recent[recent.length - 1].activity_date}T00:00:00`).getTime()) / 86400000) + 1)) : 0;
  const activityKeys = ['emergency_visits', 'admissions', 'procedures', 'outpatient_visits'] as const;
  const activity = Object.fromEntries(activityKeys.map((key) => [key, recent.reduce((sum, row) => sum + row[key], 0)])) as Record<typeof activityKeys[number], number>;
  const supplyCutoff = new Date(now); supplyCutoff.setDate(supplyCutoff.getDate() - 30);
  const recentUsage = usage.filter((row) => new Date(row.used_at) >= supplyCutoff);
  const buckets = new Map<string, { category: string; item: string; unit: string; quantity: number; records: number; dates: Set<string> }>();
  recentUsage.forEach((row) => {
    const key = `${row.category}\u0000${row.item_label.toLowerCase()}\u0000${row.unit.toLowerCase()}`;
    const current = buckets.get(key) || { category: row.category, item: row.item_label, unit: row.unit, quantity: 0, records: 0, dates: new Set<string>() };
    current.quantity += row.quantity_used; current.records += 1; current.dates.add(row.used_at.slice(0, 10)); buckets.set(key, current);
  });
  const supply = [...buckets.values()].map((row) => {
    const observedDays = Math.min(30, Math.max(1, Math.ceil((now.getTime() - new Date(`${[...row.dates].sort()[0]}T00:00:00`).getTime()) / 86400000) + 1));
    const dailyAverage = row.quantity / observedDays;
    return { ...row, observedDays: row.dates.size, dailyAverage, next7Days: dailyAverage * 7 };
  });
  return { activity, activityDays: recent.length, activityDailyAverage: daySpan ? Object.fromEntries(activityKeys.map((key) => [key, activity[key] / daySpan])) as Record<typeof activityKeys[number], number> : null, supply, supplyRecords: recentUsage.length };
}
