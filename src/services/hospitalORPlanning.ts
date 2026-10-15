import type { HospitalStaffRecord, HospitalShiftRecord } from './hospitalOperationsService';

export type HospitalORStatus = 'proposed' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
export type HospitalORRole = 'surgeon' | 'anesthesia' | 'nurse' | 'technician' | 'other';
export interface HospitalORRoom {
  room_id: string; hospital_id: string; room_code: string; display_name: string; capabilities: string[];
  status: 'available' | 'maintenance' | 'closed'; operating_minutes_per_day: number; turnaround_minutes: number;
  created_at: string; updated_at: string;
}
export interface HospitalORCase {
  case_id: string; hospital_id: string; case_code: string; procedure_category: string; planned_duration_minutes: number;
  required_room_capabilities: string[]; required_staff_skills: string[]; required_staff_roles: HospitalORRole[];
  scheduling_class: 'elective'; status: 'proposed' | 'scheduled' | 'completed' | 'cancelled'; created_at: string;
}
export interface HospitalORBooking {
  booking_id: string; hospital_id: string; room_id: string; case_id: string; starts_at: string; ends_at: string;
  turnaround_minutes: number; status: HospitalORStatus; version: number; created_by: string; confirmed_by: string | null;
  confirmed_at: string | null; started_at: string | null; completed_at: string | null; created_at: string; updated_at: string;
}
export interface HospitalORAssignment {
  booking_id: string; hospital_id: string; staff_id: string; assignment_role: HospitalORRole;
}
export interface HospitalOREvent {
  event_id: string; hospital_id: string; booking_id: string | null; room_id: string | null; actor_user_id: string;
  event_type: string; reason: string; before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown>; occurred_at: string;
}
export interface HospitalORSnapshot {
  rooms: HospitalORRoom[]; cases: HospitalORCase[]; bookings: HospitalORBooking[];
  assignments: HospitalORAssignment[]; events: HospitalOREvent[]; refreshedAt: string;
}
export interface HospitalORCapacities {
  roomMinutes: number;
  surgeonMinutes: number;
  anesthesiaMinutes: number;
  nursingMinutes: number;
  scheduledRoomMinutes: number;
}

const overlapMinutes = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart)) / 60000;

export function calculateHospitalORCapacities(
  rooms: HospitalORRoom[], bookings: HospitalORBooking[], assignments: HospitalORAssignment[],
  staff: HospitalStaffRecord[], shifts: HospitalShiftRecord[], from: Date, to: Date,
): HospitalORCapacities {
  const start = from.getTime(); const end = to.getTime();
  const horizonDays = Math.max(0, (end - start) / 86400000);
  const activeBookings = bookings.filter((b) => b.status === 'confirmed' || b.status === 'in_progress');
  const scheduledRoomMinutes = activeBookings.reduce((sum, booking) => sum + overlapMinutes(
    new Date(booking.starts_at).getTime(), new Date(booking.ends_at).getTime() + booking.turnaround_minutes * 60000, start, end,
  ), 0);
  const roomCapacityMinutes = rooms.filter((room) => room.status === 'available')
    .reduce((sum, room) => sum + room.operating_minutes_per_day * horizonDays, 0);
  const roomMinutes = Math.max(0, roomCapacityMinutes - scheduledRoomMinutes);

  const assigned = new Map<string, number>();
  assignments.forEach((assignment) => {
    const booking = activeBookings.find((b) => b.booking_id === assignment.booking_id);
    if (!booking) return;
    assigned.set(`${assignment.staff_id}:${assignment.assignment_role}`,
      (assigned.get(`${assignment.staff_id}:${assignment.assignment_role}`) || 0) + overlapMinutes(
        new Date(booking.starts_at).getTime(), new Date(booking.ends_at).getTime(), start, end,
      ));
  });
  const staffRoleMinutes = (role: HospitalORRole, discipline: HospitalStaffRecord['discipline'][]): number => {
    const eligibleIds = new Set(staff.filter((person) => person.employment_status === 'active' && discipline.includes(person.discipline)).map((p) => p.staff_id));
    const intervalsByStaff = new Map<string, Array<[number, number]>>();
    shifts.filter((shift) => shift.status === 'confirmed' && eligibleIds.has(shift.staff_id)).forEach((shift) => {
      const shiftStart = Math.max(start, new Date(shift.starts_at).getTime());
      const shiftEnd = Math.min(end, new Date(shift.ends_at).getTime());
      if (shiftEnd <= shiftStart) return;
      intervalsByStaff.set(shift.staff_id, [...(intervalsByStaff.get(shift.staff_id) || []), [shiftStart, shiftEnd]]);
    });
    const scheduled = [...intervalsByStaff.values()].reduce((total, intervals) => {
      const ordered = intervals.sort((a, b) => a[0] - b[0]);
      let mergedStart = -Infinity; let mergedEnd = -Infinity; let minutes = 0;
      ordered.forEach(([shiftStart, shiftEnd]) => {
        if (shiftStart > mergedEnd) { if (Number.isFinite(mergedStart)) minutes += Math.max(0, mergedEnd - mergedStart) / 60000; mergedStart = shiftStart; mergedEnd = shiftEnd; }
        else mergedEnd = Math.max(mergedEnd, shiftEnd);
      });
      minutes += Math.max(0, mergedEnd - mergedStart) / 60000;
      return total + minutes;
    }, 0);
    const occupied = [...assigned.entries()].filter(([key]) => {
      const [staffId, assignmentRole] = key.split(':');
      return assignmentRole === role && eligibleIds.has(staffId);
    }).reduce((sum, [, minutes]) => sum + minutes, 0);
    return Math.max(0, scheduled - occupied);
  };
  // Only confirmed shifts create capacity. Overlapping shifts for one person are unioned, not double-counted.
  return {
    roomMinutes,
    surgeonMinutes: staffRoleMinutes('surgeon', ['Surgeon','Physician']),
    anesthesiaMinutes: staffRoleMinutes('anesthesia', ['Anesthesiologist']),
    nursingMinutes: staffRoleMinutes('nurse', ['Nurse']),
    scheduledRoomMinutes,
  };
}

export interface ScheduleConflictInput {
  room: HospitalORRoom; startsAt: Date; durationMinutes: number; staffIds: string[];
  bookings: HospitalORBooking[]; assignments: HospitalORAssignment[]; excludeBookingId?: string;
}

/** Client-side preview only; the confirmation RPC repeats every check under row locks. */
export function findHospitalORScheduleConflict(input: ScheduleConflictInput): string | null {
  const start = input.startsAt.getTime(); const end = start + input.durationMinutes * 60000;
  const active = input.bookings.filter((b) => b.booking_id !== input.excludeBookingId && (b.status === 'confirmed' || b.status === 'in_progress'));
  if (input.room.status !== 'available') return 'This room is marked unavailable.';
  for (const booking of active.filter((b) => b.room_id === input.room.room_id)) {
    const priorEnds = new Date(booking.ends_at).getTime() + booking.turnaround_minutes * 60000;
    const newEndsWithTurnaround = end + input.room.turnaround_minutes * 60000;
    if (start < priorEnds && newEndsWithTurnaround > new Date(booking.starts_at).getTime()) {
      return `Room conflict with ${new Date(booking.starts_at).toLocaleString()} booking or turnaround.`;
    }
  }
  const staffSet = new Set(input.staffIds);
  const assignmentBookingIds = new Set(input.assignments.filter((a) => staffSet.has(a.staff_id)).map((a) => a.booking_id));
  const conflict = active.find((booking) => assignmentBookingIds.has(booking.booking_id) &&
    start < new Date(booking.ends_at).getTime() && end > new Date(booking.starts_at).getTime());
  return conflict ? 'A selected staff member is already assigned to an overlapping confirmed procedure.' : null;
}

export function staffCanFillORSpecialty(person: HospitalStaffRecord, role: HospitalORRole, requiredSkills: string[] = []): boolean {
  if (person.employment_status !== 'active') return false;
  const disciplineMatches = role === 'surgeon' ? ['Surgeon','Physician'].includes(person.discipline)
    : role === 'anesthesia' ? person.discipline === 'Anesthesiologist'
    : role === 'nurse' ? person.discipline === 'Nurse'
    : role === 'technician' ? person.discipline === 'Technician' : true;
  const skillSet = new Set(person.skills.map((skill) => skill.toLowerCase()));
  return disciplineMatches && requiredSkills.every((skill) => skillSet.has(skill.toLowerCase()));
}

export function shiftCoversProcedure(shifts: HospitalShiftRecord[], staffId: string, startsAt: Date, endsAt: Date): boolean {
  return shifts.some((shift) => shift.staff_id === staffId && shift.status === 'confirmed' &&
    new Date(shift.starts_at).getTime() <= startsAt.getTime() && new Date(shift.ends_at).getTime() >= endsAt.getTime());
}
