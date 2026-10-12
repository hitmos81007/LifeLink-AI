import React, { lazy, Suspense, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { NavSection } from './types/landing';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { TrustBar } from './components/TrustBar';
import { FeatureCards } from './components/FeatureCards';
import { AboutSection } from './components/AboutSection';
import { LiveInteractiveDemo } from './components/LiveInteractiveDemo';
import { ContactSection } from './components/ContactSection';
import { Footer } from './components/Footer';
import { LoginModal } from './components/LoginModal';
import { GetStartedModal } from './components/GetStartedModal';
import { LearnMoreModal } from './components/LearnMoreModal';
const MassCasualtyGuestReporter = lazy(() => import('./components/mci/MassCasualtyGuestReporter').then((module) => ({ default: module.MassCasualtyGuestReporter })));

// Auth Pages
import { LoginPage } from './components/auth/LoginPage';
import { SignupPage } from './components/auth/SignupPage';
import { ForgotPasswordPage } from './components/auth/ForgotPasswordPage';
import { PendingApprovalPage } from './components/auth/PendingApprovalPage';

// Dashboards
import { DashboardLayout } from './components/dashboards/DashboardLayout';
import { normalizeRole } from './types/roles';

import { SupabaseStatusBanner } from './components/common/SupabaseStatusBanner';
import { AlertCircle, LogOut } from 'lucide-react';

const PatientDashboard = lazy(() => import('./components/dashboards/PatientDashboard').then((module) => ({ default: module.PatientDashboard })));
const HospitalDashboard = lazy(() => import('./components/dashboards/HospitalDashboard').then((module) => ({ default: module.HospitalDashboard })));
const BloodBankDashboard = lazy(() => import('./components/dashboards/BloodBankDashboard').then((module) => ({ default: module.BloodBankDashboard })));
const AmbulanceDashboard = lazy(() => import('./components/dashboards/AmbulanceDashboard').then((module) => ({ default: module.AmbulanceDashboard })));
const GovernmentDashboard = lazy(() => import('./components/dashboards/GovernmentDashboard').then((module) => ({ default: module.GovernmentDashboard })));
const ClinicianReviewDashboard = lazy(() => import('./components/dashboards/ClinicianReviewDashboard').then((module) => ({ default: module.ClinicianReviewDashboard })));
const HospitalApprovalsDashboard = lazy(() => import('./components/dashboards/HospitalApprovalsDashboard').then((module) => ({ default: module.HospitalApprovalsDashboard })));
const PlatformAdminDashboard = lazy(() => import('./components/dashboards/PlatformAdminDashboard').then((module) => ({ default: module.PlatformAdminDashboard })));

function MainAppContent() {
  const { viewMode, setViewMode, userProfile, profileUnconfigured, logout } = useAuth();
  const [activeSection, setActiveSection] = useState<NavSection>('home');
  
  // Modal states for landing page actions
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isGetStartedOpen, setIsGetStartedOpen] = useState(false);
  const [isLearnMoreOpen, setIsLearnMoreOpen] = useState(false);
  const [isMciModalOpen, setIsMciModalOpen] = useState(false);
  const [hasOpenedMci, setHasOpenedMci] = useState(false);

  const openMciReport = () => {
    setHasOpenedMci(true);
    setIsMciModalOpen(true);
  };

  const scrollToSection = (sectionId: NavSection) => {
    setActiveSection(sectionId);
    if (sectionId === 'resources') window.dispatchEvent(new Event('lifelink:open-public-resources'));
    if (sectionId === 'login') {
      setViewMode('login');
      return;
    }
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const openPatientPortal = () => {
    if (normalizeRole(userProfile?.role) === 'patient') {
      setViewMode('dashboard');
      return;
    }
    setViewMode('login');
  };

  // Render Full Page Auth Views
  if (viewMode === 'login') {
    return (
      <ErrorBoundary>
        <SupabaseStatusBanner />
        <LoginPage />
      </ErrorBoundary>
    );
  }

  if (viewMode === 'signup') {
    return (
      <ErrorBoundary>
        <SupabaseStatusBanner />
        <SignupPage />
      </ErrorBoundary>
    );
  }

  if (viewMode === 'forgot-password') {
    return (
      <ErrorBoundary>
        <SupabaseStatusBanner />
        <ForgotPasswordPage />
      </ErrorBoundary>
    );
  }

  if (viewMode === 'pending-approval') {
    return (
      <ErrorBoundary>
        <SupabaseStatusBanner />
        <PendingApprovalPage />
      </ErrorBoundary>
    );
  }

  // Render Role Dashboard
  if (viewMode === 'dashboard') {
    if (profileUnconfigured || !userProfile) {
      return (
        <ErrorBoundary>
          <SupabaseStatusBanner />
          <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-md w-full p-6 text-center space-y-4 shadow-2xl">
              <div className="w-12 h-12 rounded-full bg-rose-950 text-rose-400 border border-rose-800 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white">Your account profile is not configured</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Your authenticated account does not have a corresponding configuration entry in public.users.
              </p>
              <button
                onClick={logout}
                className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </ErrorBoundary>
      );
    }

    const canonicalRole = normalizeRole(userProfile.role);

    return (
      <ErrorBoundary>
        <SupabaseStatusBanner />
        <DashboardLayout activeRole={canonicalRole}>
          <Suspense fallback={<div className="min-h-64 flex items-center justify-center text-sm text-slate-500" role="status">Loading your dashboard…</div>}>
            {canonicalRole === 'patient' && <PatientDashboard />}
            {canonicalRole === 'hospital_admin' && <HospitalDashboard />}
            {canonicalRole === 'blood_bank_admin' && <BloodBankDashboard />}
            {canonicalRole === 'ambulance_admin' && <AmbulanceDashboard />}
            {canonicalRole === 'government_admin' && <GovernmentDashboard />}
            {canonicalRole === 'clinician_reviewer' && <ClinicianReviewDashboard />}
            {canonicalRole === 'hospital_approver' && <HospitalApprovalsDashboard />}
            {canonicalRole === 'platform_admin' && <PlatformAdminDashboard />}
            {!['patient', 'hospital_admin', 'blood_bank_admin', 'ambulance_admin', 'government_admin', 'clinician_reviewer', 'hospital_approver', 'platform_admin'].includes(canonicalRole) && (
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 text-center space-y-4">
                <p className="text-sm text-rose-400 font-bold">Access Denied: Unrecognized User Role ({userProfile.role})</p>
                <button
                  onClick={logout}
                  className="px-4 py-2 bg-rose-600 text-white font-bold text-xs rounded-xl inline-flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </Suspense>
        </DashboardLayout>
      </ErrorBoundary>
    );
  }

  // Default Landing Page View
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-blue-600 selection:text-white flex flex-col antialiased transition-colors duration-200">
      
      {/* Supabase Connection Status Bar */}
      <SupabaseStatusBanner />

      {/* Navigation Header */}
      <Navbar
        activeSection={activeSection}
        onNavigate={scrollToSection}
        onOpenLogin={() => setViewMode('login')}
        onOpenPatientPortal={openPatientPortal}
        onOpenGetStarted={() => setIsGetStartedOpen(true)}
        onOpenMciReport={openMciReport}
      />

      {/* Main Landing Content */}
      <main className="flex-1">
        {/* 1. Hero Section */}
        <Hero
          onExploreResources={() => scrollToSection('resources')}
          onOpenLearnMore={() => setIsLearnMoreOpen(true)}
          onExploreFeatures={() => scrollToSection('features')}
          onOpenMciReport={openMciReport}
        />

        {/* 2. Trust Metrics & Compliance Bar */}
        <TrustBar />

        {/* 3. Below Hero - Feature Cards */}
        <FeatureCards />

        {/* 4. Interactive Live Demo Sandbox */}
        <ErrorBoundary>
          <LiveInteractiveDemo />
        </ErrorBoundary>

        {/* 5. About Section */}
        <AboutSection
          onOpenGetStarted={() => setIsGetStartedOpen(true)}
        />

        {/* 6. Contact Section */}
        <ContactSection />
      </main>

      {/* 7. Footer */}
      <Footer
        onOpenLogin={() => setViewMode('login')}
        onOpenGetStarted={() => setIsGetStartedOpen(true)}
      />

      {/* Modal Dialogs */}
      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onSuccessLogin={() => {
          setIsLoginModalOpen(false);
          setViewMode('dashboard');
        }}
      />

      <GetStartedModal
        isOpen={isGetStartedOpen}
        onClose={() => setIsGetStartedOpen(false)}
      />

      <LearnMoreModal
        isOpen={isLearnMoreOpen}
        onClose={() => setIsLearnMoreOpen(false)}
        onOpenGetStarted={() => setIsGetStartedOpen(true)}
      />

      {hasOpenedMci && (
        <Suspense fallback={<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 text-sm font-semibold text-white" role="status">Loading synthetic report form…</div>}>
          <MassCasualtyGuestReporter
            isOpen={isMciModalOpen}
            onClose={() => setIsMciModalOpen(false)}
          />
        </Suspense>
      )}

    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <MainAppContent />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
