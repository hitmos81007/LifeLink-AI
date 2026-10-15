import React from 'react';
import { Building2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { HospitalOperationsModule } from './HospitalOperationsModule';
import { HospitalStaffORAssignments } from './HospitalStaffORAssignments';

export const HospitalStaffDashboard: React.FC = () => {
  const { userProfile } = useAuth();
  const hospitalId = userProfile?.hospital_id;
  if (!hospitalId) return <div className="rounded-2xl border border-rose-800 bg-rose-950/30 p-6 text-sm text-rose-200">This staff login is not linked to a hospital. Contact your hospital administrator for help.</div>;
  return <div className="space-y-5">
    <div className="rounded-2xl border border-cyan-900/70 bg-slate-900 p-5">
      <div className="flex items-center gap-2 text-cyan-300"><Building2 className="h-5 w-5"/><h1 className="text-xl font-black text-white">Hospital Team Portal</h1></div>
      <p className="mt-2 text-xs text-slate-300">Your hospital-scoped workspace shows your scheduled shifts and aggregate facility operations. You can record supply usage for the team.</p>
    </div>
    <HospitalOperationsModule hospitalId={hospitalId} mode="staff" />
    <HospitalStaffORAssignments hospitalId={hospitalId} />
  </div>;
};
