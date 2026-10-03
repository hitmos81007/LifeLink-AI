import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserRole, ROLE_OPTIONS } from '../../types/database';
import {
  Activity,
  UserPlus,
  Lock,
  Mail,
  User,
  ShieldCheck,
  AlertCircle,
  ArrowLeft,
  Building2,
  HeartPulse,
  Droplets,
  Ambulance,
  CheckCircle2,
  Phone
} from 'lucide-react';

export const SignupPage: React.FC = () => {
  const { signup, setViewMode, authError, clearAuthError } = useAuth();

  const [selectedRole, setSelectedRole] = useState<UserRole>('patient');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Hospital registration fields
  const [hospitalName, setHospitalName] = useState('');
  const [hospitalAddress, setHospitalAddress] = useState('');
  const [district, setDistrict] = useState('');
  const [stateName, setStateName] = useState('');
  const [hospitalType, setHospitalType] = useState<string>('Government');
  const [traumaCenter, setTraumaCenter] = useState<boolean>(false);
  const [latitudeInput, setLatitudeInput] = useState('');
  const [longitudeInput, setLongitudeInput] = useState('');

  // Ambulance provider registration fields
  const [providerName, setProviderName] = useState('');

  // Blood bank registration fields
  const [bloodBankName, setBloodBankName] = useState('');
  const [bloodBankAddress, setBloodBankAddress] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearAuthError();

    if (!fullName.trim()) {
      setLocalError('Please enter your full name.');
      return;
    }

    if (!email.trim()) {
      setLocalError('Please enter your email address.');
      return;
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match. Please check and retry.');
      return;
    }

    let parsedLat: number | null = null;
    let parsedLng: number | null = null;

    if (selectedRole === 'hospital_admin') {
      if (!hospitalName.trim()) {
        setLocalError('Hospital Name is required.');
        return;
      }
      if (!hospitalAddress.trim()) {
        setLocalError('Hospital Address is required.');
        return;
      }
      if (!district.trim()) {
        setLocalError('District is required.');
        return;
      }
      if (!stateName.trim()) {
        setLocalError('State is required.');
        return;
      }
      if (!hospitalType) {
        setLocalError('Hospital Type is required.');
        return;
      }

      if (latitudeInput.trim() !== '') {
        const val = Number(latitudeInput);
        if (isNaN(val) || val < -90 || val > 90) {
          setLocalError('Latitude must be a valid number between -90 and 90.');
          return;
        }
        parsedLat = val;
      }

      if (longitudeInput.trim() !== '') {
        const val = Number(longitudeInput);
        if (isNaN(val) || val < -180 || val > 180) {
          setLocalError('Longitude must be a valid number between -180 and 180.');
          return;
        }
        parsedLng = val;
      }
    }

    if (selectedRole === 'ambulance_admin') {
      if (!providerName.trim()) {
        setLocalError('Ambulance Agency/Provider Name is required.');
        return;
      }
      if (!district.trim()) {
        setLocalError('District is required.');
        return;
      }
      if (!stateName.trim()) {
        setLocalError('State is required.');
        return;
      }
    }

    if (selectedRole === 'blood_bank_admin') {
      if (!bloodBankName.trim()) {
        setLocalError('Blood Bank Name is required.');
        return;
      }
      if (!bloodBankAddress.trim()) {
        setLocalError('Address is required.');
        return;
      }
      if (!district.trim()) {
        setLocalError('District is required.');
        return;
      }
      if (!stateName.trim()) {
        setLocalError('State is required.');
        return;
      }

      if (latitudeInput.trim() !== '') {
        const val = Number(latitudeInput);
        if (isNaN(val) || val < -90 || val > 90) {
          setLocalError('Latitude must be a valid number between -90 and 90.');
          return;
        }
        parsedLat = val;
      }

      if (longitudeInput.trim() !== '') {
        const val = Number(longitudeInput);
        if (isNaN(val) || val < -180 || val > 180) {
          setLocalError('Longitude must be a valid number between -180 and 180.');
          return;
        }
        parsedLng = val;
      }
    }

    setIsSubmitting(true);

    try {
      if (selectedRole === 'hospital_admin') {
        await signup({
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          role: 'hospital_admin',
          hospital_name: hospitalName.trim(),
          hospital_address: hospitalAddress.trim(),
          district: district.trim(),
          state: stateName.trim(),
          hospital_type: hospitalType,
          trauma_center: traumaCenter,
          latitude: parsedLat,
          longitude: parsedLng,
        });
      } else if (selectedRole === 'ambulance_admin') {
        await signup({
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          role: 'ambulance_admin',
          provider_name: providerName.trim(),
          district: district.trim(),
          state: stateName.trim(),
        });
      } else if (selectedRole === 'blood_bank_admin') {
        await signup({
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          role: 'blood_bank_admin',
          blood_bank_name: bloodBankName.trim(),
          blood_bank_address: bloodBankAddress.trim(),
          district: district.trim(),
          state: stateName.trim(),
          latitude: parsedLat,
          longitude: parsedLng,
        });
      } else {
        await signup({
          email: email.trim(),
          password,
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          role: selectedRole,
        });
      }
    } catch (err: any) {
      setLocalError(err.message || 'Registration failed. Please check inputs.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-[400px] h-[400px] bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Navigation Header Back Button */}
      <div className="absolute top-6 left-6 z-10">
        <button
          onClick={() => setViewMode('landing')}
          className="px-3.5 py-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10">
        <div className="flex justify-center items-center space-x-3">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/30">
            <Activity className="w-7 h-7" />
          </div>
          <span className="text-2xl font-black text-white tracking-tight">
            LifeLink <span className="text-blue-400">AI</span>
          </span>
        </div>
        <h2 className="mt-4 text-center text-xl font-extrabold text-white tracking-tight">
          Register Account
        </h2>
        <p className="mt-1 text-center text-xs text-slate-400">
          Create a new account on Supabase Auth &amp; public.users
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-xl z-10 px-4 sm:px-0">
        <div className="bg-slate-800/90 border border-slate-700/80 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 backdrop-blur-md">
          
          {/* STEP 1: ROLE SELECTION */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mono mb-2">
              1. Select Stakeholder Role *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ROLE_OPTIONS.map((opt) => {
                const isSel = selectedRole === opt.role;
                return (
                  <button
                    type="button"
                    key={opt.role}
                    onClick={() => {
                      setSelectedRole(opt.role);
                      setLocalError(null);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-3 relative ${
                      isSel
                        ? 'bg-blue-600/20 border-blue-500 text-white shadow-md ring-1 ring-blue-500/50'
                        : 'bg-slate-900/60 border-slate-700/70 text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
                    }`}
                  >
                    <div className={`p-2 rounded-lg shrink-0 ${isSel ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                      {opt.role === 'patient' && <HeartPulse className="w-4 h-4" />}
                      {opt.role === 'hospital_admin' && <Building2 className="w-4 h-4" />}
                      {opt.role === 'blood_bank_admin' && <Droplets className="w-4 h-4" />}
                      {opt.role === 'ambulance_admin' && <Ambulance className="w-4 h-4" />}
                      {opt.role === 'government_admin' && <ShieldCheck className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-white flex items-center justify-between">
                        <span>{opt.label}</span>
                        {isSel && <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-tight line-clamp-2">
                        {opt.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Alert Message */}
          {(localError || authError) && (
            <div className="bg-rose-950/80 border border-rose-800 text-rose-200 p-3 rounded-xl text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Registration Error</p>
                <p className="text-[11px] text-rose-300">{localError || authError}</p>
              </div>
            </div>
          )}

          {/* STEP 2: USER & ROLE DETAILS FORM */}
          <form onSubmit={handleSubmit} className="space-y-4 pt-2 border-t border-slate-700/60">
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mono">
              2. Profile &amp; Account Credentials
            </label>

            {/* Full Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Full Name *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  placeholder="e.g. Alex Smith"
                />
              </div>
            </div>

            {/* Email Field */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Email Address *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  placeholder="name@example.com"
                />
              </div>
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Phone Number (Optional)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Phone className="w-4 h-4" />
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  placeholder="+1 555-0199"
                />
              </div>
            </div>

            {/* Password Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Password *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-mono"
                    placeholder="Min 6 characters"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Confirm Password *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-900/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-mono"
                    placeholder="Re-enter password"
                  />
                </div>
              </div>
            </div>

            {/* Hospital Admin Registration Fields */}
            {selectedRole === 'hospital_admin' && (
              <div className="p-4 bg-slate-900/80 border border-slate-700/80 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-blue-400 border-b border-slate-700/60 pb-2">
                  <Building2 className="w-4 h-4" />
                  <span>Hospital Facility Details *</span>
                </div>

                {/* Hospital Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Hospital Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={hospitalName}
                    onChange={(e) => setHospitalName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. City General Hospital"
                  />
                </div>

                {/* Hospital Address */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Hospital Address *
                  </label>
                  <input
                    type="text"
                    required
                    value={hospitalAddress}
                    onChange={(e) => setHospitalAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. 100 Health Way, Suite 4"
                  />
                </div>

                {/* District & State */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      District *
                    </label>
                    <input
                      type="text"
                      required
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. Metro District"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      State *
                    </label>
                    <input
                      type="text"
                      required
                      value={stateName}
                      onChange={(e) => setStateName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. California"
                    />
                  </div>
                </div>

                {/* Hospital Type & Trauma Centre */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Hospital Type *
                    </label>
                    <select
                      required
                      value={hospitalType}
                      onChange={(e) => setHospitalType(e.target.value)}
                      className="w-full p-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="Government">Government</option>
                      <option value="Private">Private</option>
                      <option value="Trust">Trust</option>
                      <option value="Military">Military</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Trauma Centre *
                    </label>
                    <select
                      value={traumaCenter ? 'yes' : 'no'}
                      onChange={(e) => setTraumaCenter(e.target.value === 'yes')}
                      className="w-full p-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                </div>

                {/* Latitude & Longitude (Optional) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Latitude (Optional, -90 to 90)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={latitudeInput}
                      onChange={(e) => setLatitudeInput(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      placeholder="e.g. 37.7749"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Longitude (Optional, -180 to 180)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={longitudeInput}
                      onChange={(e) => setLongitudeInput(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                      placeholder="e.g. -122.4194"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Ambulance Provider Admin Registration Fields */}
            {selectedRole === 'ambulance_admin' && (
              <div className="p-4 bg-slate-900/80 border border-slate-700/80 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-400 border-b border-slate-700/60 pb-2">
                  <Ambulance className="w-4 h-4" />
                  <span>Ambulance Agency / Provider Details *</span>
                </div>

                {/* Provider Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Ambulance Agency / Provider Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={providerName}
                    onChange={(e) => setProviderName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="e.g. Emergency Rescue Services"
                  />
                </div>

                {/* District & State */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      District *
                    </label>
                    <input
                      type="text"
                      required
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="e.g. Central District"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      State *
                    </label>
                    <input
                      type="text"
                      required
                      value={stateName}
                      onChange={(e) => setStateName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      placeholder="e.g. California"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Blood Bank Admin Registration Fields */}
            {selectedRole === 'blood_bank_admin' && (
              <div className="p-4 bg-slate-900/80 border border-slate-700/80 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-red-400 border-b border-slate-700/60 pb-2">
                  <Droplets className="w-4 h-4" />
                  <span>Blood Bank Facility Details *</span>
                </div>

                {/* Blood Bank Name */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Blood Bank Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={bloodBankName}
                    onChange={(e) => setBloodBankName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="e.g. Red Cross Central Blood Bank"
                  />
                </div>

                {/* Address */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Address *
                  </label>
                  <input
                    type="text"
                    required
                    value={bloodBankAddress}
                    onChange={(e) => setBloodBankAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="e.g. 45 Red Cross Blvd, Suite 10"
                  />
                </div>

                {/* District & State */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      District *
                    </label>
                    <input
                      type="text"
                      required
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="e.g. Metro District"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      State *
                    </label>
                    <input
                      type="text"
                      required
                      value={stateName}
                      onChange={(e) => setStateName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                      placeholder="e.g. California"
                    />
                  </div>
                </div>

                {/* Latitude & Longitude (Optional) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Latitude (Optional, -90 to 90)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={latitudeInput}
                      onChange={(e) => setLatitudeInput(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
                      placeholder="e.g. 37.7749"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Longitude (Optional, -180 to 180)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={longitudeInput}
                      onChange={(e) => setLongitudeInput(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
                      placeholder="e.g. -122.4194"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.99]"
            >
              <UserPlus className="w-4 h-4" />
              <span>{isSubmitting ? 'Creating Account...' : 'Create Account'}</span>
            </button>
          </form>

          {/* Footer Navigation Link */}
          <div className="pt-4 border-t border-slate-700/60 text-center">
            <p className="text-xs text-slate-400">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setViewMode('login')}
                className="text-blue-400 hover:text-blue-300 font-bold hover:underline cursor-pointer"
              >
                Sign in instead
              </button>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
};
