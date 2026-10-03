import { USER_ROLES_DATA } from '../data/rolesData';
import { RoleDetail, UserRole } from '../types/architecture';
import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Key, 
  User, 
  Building2, 
  Droplet, 
  Ambulance, 
  Shield, 
  Check, 
  X, 
  FileCode,
  Sparkles
} from 'lucide-react';

interface RoleMatrixViewProps {
  currentRole: UserRole;
  onSelectRole: (role: UserRole) => void;
}

export const RoleMatrixView: React.FC<RoleMatrixViewProps> = ({
  currentRole,
  onSelectRole
}) => {
  const [selectedRole, setSelectedRole] = useState<RoleDetail>(
    USER_ROLES_DATA.find(r => r.id === currentRole) || USER_ROLES_DATA[0]
  );

  const getRoleIcon = (iconName: string) => {
    switch (iconName) {
      case 'User': return <User className="w-5 h-5" />;
      case 'Building2': return <Building2 className="w-5 h-5" />;
      case 'Droplet': return <Droplet className="w-5 h-5" />;
      case 'Ambulance': return <Ambulance className="w-5 h-5" />;
      case 'ShieldCheck': return <ShieldCheck className="w-5 h-5" />;
      default: return <Shield className="w-5 h-5" />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded bg-purple-50 text-purple-700 border border-purple-200">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Role-Based Access Control (RBAC) & Stakeholder Matrix</h2>
            <p className="text-xs text-slate-500">Firebase Custom Claims, Security Scopes, and Perspective Simulator</p>
          </div>
        </div>
      </div>

      {/* Role Selector Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
        {USER_ROLES_DATA.map((role) => {
          const isSelected = selectedRole.id === role.id;
          return (
            <button
              key={role.id}
              onClick={() => {
                setSelectedRole(role);
                onSelectRole(role.id);
              }}
              className={`p-3 rounded border text-left transition-all relative overflow-hidden cursor-pointer ${
                isSelected
                  ? 'bg-purple-50 border-purple-400 text-purple-900 font-semibold shadow-xs ring-1 ring-purple-400/30'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className={`p-1.5 rounded ${isSelected ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {getRoleIcon(role.icon)}
                </div>
                <span className="text-[9px] mono font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  {role.id}
                </span>
              </div>
              <h3 className="text-xs font-bold text-slate-900 truncate">{role.name}</h3>
              <p className="text-[10px] text-slate-500 truncate">{role.title}</p>
            </button>
          );
        })}
      </div>

      {/* Detailed Role Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Permission Table */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-tight flex items-center gap-2">
                {getRoleIcon(selectedRole.icon)}
                <span>{selectedRole.name} — Resource Privileges</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">{selectedRole.description}</p>
            </div>
            <span className="px-2.5 py-0.5 text-[10px] mono font-bold rounded bg-purple-100 text-purple-800 border border-purple-200">
              Active Simulator Role
            </span>
          </div>

          <div className="border border-slate-200 rounded overflow-x-auto bg-white">
            <table className="w-full text-left text-xs text-slate-800">
              <thead className="bg-slate-50 text-slate-600 mono text-[10px] uppercase border-b border-slate-200">
                <tr>
                  <th className="p-2">Resource Collection</th>
                  <th className="p-2 text-center">Create</th>
                  <th className="p-2 text-center">Read</th>
                  <th className="p-2 text-center">Update</th>
                  <th className="p-2 text-center">Delete</th>
                  <th className="p-2">Security Scope</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 mono text-[11px]">
                {selectedRole.permissions.map((perm, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="p-2 font-bold text-purple-800">{perm.resource}</td>
                    <td className="p-2 text-center">
                      {perm.create ? <Check className="w-3.5 h-3.5 text-emerald-600 mx-auto" /> : <X className="w-3.5 h-3.5 text-slate-300 mx-auto" />}
                    </td>
                    <td className="p-2 text-center">
                      {perm.read ? <Check className="w-3.5 h-3.5 text-emerald-600 mx-auto" /> : <X className="w-3.5 h-3.5 text-slate-300 mx-auto" />}
                    </td>
                    <td className="p-2 text-center">
                      {perm.update ? <Check className="w-3.5 h-3.5 text-emerald-600 mx-auto" /> : <X className="w-3.5 h-3.5 text-slate-300 mx-auto" />}
                    </td>
                    <td className="p-2 text-center">
                      {perm.delete ? <Check className="w-3.5 h-3.5 text-emerald-600 mx-auto" /> : <X className="w-3.5 h-3.5 text-slate-300 mx-auto" />}
                    </td>
                    <td className="p-2 text-slate-600 font-sans text-xs">{perm.scope}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Key UI Modules */}
          <div>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-tight mb-2 mono flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              Role-Tailored UI Capabilities & Modules
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {selectedRole.keyUIModules.map((mod, i) => (
                <div key={i} className="bg-slate-50 p-2 rounded border border-slate-200 text-xs text-slate-700 flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-600"></span>
                  <span>{mod}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Custom Claims JSON */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h3 className="text-xs font-bold text-slate-900 mono flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-amber-600" />
              Firebase Auth Custom Claims JWT
            </h3>
            <span className="text-[10px] mono text-slate-500">Decoded Token</span>
          </div>

          <div className="bg-[#0F172A] p-3.5 rounded font-mono text-xs text-purple-300 border border-slate-800 overflow-x-auto shadow-inner">
            <pre>{JSON.stringify(selectedRole.customClaims, null, 2)}</pre>
          </div>

          <div className="bg-slate-50 p-3 rounded border border-slate-200 text-xs text-slate-600 leading-relaxed">
            <p className="font-bold text-slate-900 mb-1">FastAPI Role Guard Verification:</p>
            Custom claims are verified in FastAPI backend middleware on every API request. The <code className="text-purple-700 mono font-bold">role</code> claim determines resource read/write authorization and multi-tenant domain scoping.
          </div>
        </div>
      </div>
    </div>
  );
};
