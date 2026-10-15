import { supabase } from '../lib/supabase/client';
import type { HospitalORAssignment, HospitalORBooking, HospitalORCase, HospitalOREvent, HospitalORRoom, HospitalORSnapshot } from './hospitalORPlanning';

async function rows<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as T[];
}

export async function getHospitalORSnapshot(hospitalId: string, from: Date, to: Date): Promise<HospitalORSnapshot> {
  const [rooms, bookings] = await Promise.all([
    rows<HospitalORRoom>(supabase.from('hospital_operating_rooms').select('*').eq('hospital_id', hospitalId).order('room_code')),
    rows<HospitalORBooking>(supabase.from('hospital_or_bookings').select('*').eq('hospital_id', hospitalId)
      .lt('starts_at', to.toISOString()).gt('ends_at', from.toISOString()).order('starts_at')),
  ]);
  const bookingIds = bookings.map((item) => item.booking_id);
  const caseIds = [...new Set(bookings.map((item) => item.case_id))];
  const [cases, assignments, events] = await Promise.all([
    caseIds.length ? rows<HospitalORCase>(supabase.from('hospital_procedure_cases').select('*').in('case_id', caseIds)) : Promise.resolve([]),
    bookingIds.length ? rows<HospitalORAssignment>(supabase.from('hospital_or_booking_staff').select('*').in('booking_id', bookingIds)) : Promise.resolve([]),
    rows<HospitalOREvent>(supabase.from('hospital_or_schedule_events').select('*').eq('hospital_id', hospitalId).order('occurred_at', { ascending: false }).limit(100)),
  ]);
  return { rooms, bookings, cases, assignments, events, refreshedAt: new Date().toISOString() };
}

export interface SaveHospitalORRoomInput {
  roomId?: string; roomCode: string; displayName: string; capabilities: string[];
  operatingMinutesPerDay: number; turnaroundMinutes: number; status: HospitalORRoom['status'];
  reason: string;
}

export async function saveHospitalORRoom(input: SaveHospitalORRoomInput): Promise<string> {
  const { data, error } = await supabase.rpc('save_hospital_operating_room', {
    p_room_id: input.roomId || null, p_room_code: input.roomCode.trim(), p_display_name: input.displayName.trim(),
    p_capabilities: input.capabilities, p_operating_minutes_per_day: input.operatingMinutesPerDay,
    p_turnaround_minutes: input.turnaroundMinutes, p_status: input.status, p_reason: input.reason,
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error('The room save did not return a room reference. Refresh and check the room list.');
  return data as string;
}

export interface CreateHospitalORProposalInput {
  roomId: string; procedureCategory: string; durationMinutes: number; startsAt: string;
  requiredRoomCapabilities: string[]; requiredStaffSkills: string[];
  assignments: Array<{ staffId: string; role: HospitalORAssignment['assignment_role'] }>; reason: string;
}

export async function createHospitalORProposal(input: CreateHospitalORProposalInput) {
  const { data, error } = await supabase.rpc('create_hospital_or_booking', {
    p_room_id: input.roomId, p_procedure_category: input.procedureCategory, p_duration_minutes: input.durationMinutes,
    p_starts_at: input.startsAt, p_required_room_capabilities: input.requiredRoomCapabilities,
    p_required_staff_skills: input.requiredStaffSkills,
    p_staff_assignments: input.assignments.map((item) => ({ staff_id: item.staffId, assignment_role: item.role })),
    p_reason: input.reason.trim(),
  });
  if (error) throw new Error(error.message);
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.booking_id) throw new Error('Proposal was not returned. Refresh the operating-room schedule before retrying.');
  return result as { booking_id: string; case_id: string; status: string; version: number; case_code: string };
}

export async function transitionHospitalORBooking(input: { bookingId: string; expectedVersion: number; action: string; reason: string }) {
  const { data, error } = await supabase.rpc('transition_hospital_or_booking', {
    p_booking_id: input.bookingId, p_expected_version: input.expectedVersion,
    p_action: input.action, p_reason: input.reason.trim(),
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.booking_id) throw new Error('The schedule change was not returned. Refresh and review the latest booking.');
  return row as { booking_id: string; status: string; version: number };
}
