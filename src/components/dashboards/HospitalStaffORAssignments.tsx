import React, { useCallback, useEffect, useState } from 'react';
import { getHospitalORSnapshot } from '../../services/hospitalORService';
import { getHospitalShifts, getHospitalStaff, type HospitalShiftRecord, type HospitalStaffRecord } from '../../services/hospitalOperationsService';
import type { HospitalORSnapshot } from '../../services/hospitalORPlanning';
import { OperatingRoomManager } from './OperatingRoomManager';

export const HospitalStaffORAssignments: React.FC<{ hospitalId: string }> = ({ hospitalId }) => {
  const [snapshot, setSnapshot] = useState<HospitalORSnapshot | null>(null);
  const [staff, setStaff] = useState<HospitalStaffRecord[]>([]);
  const [shifts, setShifts] = useState<HospitalShiftRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const now = new Date(); const end = new Date(now.getTime() + 14 * 86400000);
    try {
      const [snapshotRows, staffRows, shiftRows] = await Promise.all([
        getHospitalORSnapshot(hospitalId, new Date(now.getTime() - 86400000), end),
        getHospitalStaff(hospitalId), getHospitalShifts(hospitalId, new Date(now.getTime() - 86400000), end),
      ]);
      setSnapshot(snapshotRows); setStaff(staffRows); setShifts(shiftRows); setError(null);
    } catch (e: any) { setSnapshot(null); setError(e?.message || 'Your operating-room assignments could not be loaded.'); }
  }, [hospitalId]);
  useEffect(() => { void reload(); }, [reload]);
  return <div className="space-y-3">{error && <p role="alert" className="rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-xs text-amber-100">{error}. Your hospital admin may need to apply the OR scheduling migration.</p>}<OperatingRoomManager hospitalId={hospitalId} staff={staff} shifts={shifts} snapshot={snapshot} onChanged={reload}/></div>;
};
