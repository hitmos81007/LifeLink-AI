import { describe, expect, it } from 'vitest';
import { calculateHospitalORCapacities, findHospitalORScheduleConflict, shiftCoversProcedure, staffCanFillORSpecialty, type HospitalORBooking, type HospitalORRoom } from '../services/hospitalORPlanning';
import type { HospitalShiftRecord, HospitalStaffRecord } from '../services/hospitalOperationsService';

const room: HospitalORRoom = { room_id:'room-1',hospital_id:'hospital-1',room_code:'OR1',display_name:'Operating Room 1',capabilities:['general'],status:'available',operating_minutes_per_day:720,turnaround_minutes:30,created_at:'',updated_at:'' };
const booking: HospitalORBooking = { booking_id:'booking-1',hospital_id:'hospital-1',room_id:'room-1',case_id:'case-1',starts_at:'2026-10-14T10:00:00.000Z',ends_at:'2026-10-14T11:00:00.000Z',turnaround_minutes:30,status:'confirmed',version:1,created_by:'admin',confirmed_by:'admin',confirmed_at:'',started_at:null,completed_at:null,created_at:'',updated_at:'' };
const staff: HospitalStaffRecord[] = [
  { staff_id:'surgeon-1',hospital_id:'hospital-1',auth_user_id:null,full_name:'S',email:'',phone:null,department:'Surgery',discipline:'Surgeon',skills:['general'],contract_hours_per_week:40,employment_status:'active',created_at:'' },
  { staff_id:'anesthesia-1',hospital_id:'hospital-1',auth_user_id:null,full_name:'A',email:'',phone:null,department:'Anesthesia',discipline:'Anesthesiologist',skills:['general'],contract_hours_per_week:40,employment_status:'active',created_at:'' },
  { staff_id:'nurse-1',hospital_id:'hospital-1',auth_user_id:null,full_name:'N',email:'',phone:null,department:'OR',discipline:'Nurse',skills:['general'],contract_hours_per_week:40,employment_status:'active',created_at:'' },
];
const shifts: HospitalShiftRecord[] = staff.map((person, index) => ({ shift_id:`shift-${index}`,staff_id:person.staff_id,hospital_id:'hospital-1',starts_at:'2026-10-14T08:00:00.000Z',ends_at:'2026-10-14T16:00:00.000Z',status:'confirmed',shift_note:null }));

describe('hospital OR planning', () => {
  it('counts operating minutes and confirmed qualified shift minutes, then subtracts scheduled use', () => {
    const overlappingSurgeonShift = { ...shifts[0], shift_id:'shift-overlap', starts_at:'2026-10-14T09:00:00.000Z', ends_at:'2026-10-14T15:00:00.000Z' };
    const result = calculateHospitalORCapacities([room],[booking],[{booking_id:booking.booking_id,hospital_id:'hospital-1',staff_id:'surgeon-1',assignment_role:'surgeon'}],staff,[...shifts,overlappingSurgeonShift],new Date('2026-10-14T00:00:00Z'),new Date('2026-10-15T00:00:00Z'));
    expect(result.roomMinutes).toBe(630);
    expect(result.scheduledRoomMinutes).toBe(90);
    expect(result.surgeonMinutes).toBe(420);
    expect(result.anesthesiaMinutes).toBe(480);
    expect(result.nursingMinutes).toBe(480);
  });

  it('blocks same-room overlap including turnaround and overlapping staff', () => {
    expect(findHospitalORScheduleConflict({room,startsAt:new Date('2026-10-14T11:15:00Z'),durationMinutes:45,staffIds:[],bookings:[booking],assignments:[]})).toContain('Room conflict');
    const otherRoomBooking = { ...booking, booking_id:'booking-2', room_id:'room-2' };
    expect(findHospitalORScheduleConflict({room,startsAt:new Date('2026-10-14T10:30:00Z'),durationMinutes:45,staffIds:['surgeon-1'],bookings:[otherRoomBooking],assignments:[{booking_id:otherRoomBooking.booking_id,hospital_id:'hospital-1',staff_id:'surgeon-1',assignment_role:'surgeon'}]})).toContain('staff member');
    expect(findHospitalORScheduleConflict({room,startsAt:new Date('2026-10-14T12:00:00Z'),durationMinutes:45,staffIds:[],bookings:[booking],assignments:[]})).toBeNull();
  });

  it('requires an active matching discipline, required skills, and a confirmed full-coverage shift', () => {
    expect(staffCanFillORSpecialty(staff[0],'surgeon',['general'])).toBe(true);
    expect(staffCanFillORSpecialty(staff[0],'anesthesia')).toBe(false);
    expect(shiftCoversProcedure(shifts,'surgeon-1',new Date('2026-10-14T09:00:00Z'),new Date('2026-10-14T10:00:00Z'))).toBe(true);
    expect(shiftCoversProcedure(shifts.map((shift) => ({ ...shift,status:'planned' as const })),'surgeon-1',new Date('2026-10-14T09:00:00Z'),new Date('2026-10-14T10:00:00Z'))).toBe(false);
  });
});
