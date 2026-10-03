import React, { useState } from 'react';
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
import { MassCasualtyGuestReporter } from './components/mci/MassCasualtyGuestReporter';

// Auth Pages
import { LoginPage } from './components/auth/LoginPage';
import { SignupPage } from './components/auth/SignupPage';
import { ForgotPasswordPage } from './components/auth/ForgotPasswordPage';

// Dashboards
import { DashboardLayout } from './components/dashboards/DashboardLayout';
import { PatientDashboard } from './components/dashboards/PatientDashboard';
import { HospitalDashboard } from './components/dashboards/HospitalDashboard';
import { BloodBankDashboard } from './components/dashboards/BloodBankDashboard';
import { AmbulanceDashboard } from './components/dashboards/AmbulanceDashboard';
import { GovernmentDashboard } from './components/dashboards/GovernmentDashboard';
import { ClinicianReviewDashboard } from './components/dashboards/ClinicianReviewDashboard';
import { HospitalApprovalsDashboard } from './components/dashboards/HospitalApprovalsDashboard';
import { normalizeRole } from './types/roles';

import { SupabaseStatusBanner } from './components/common/SupabaseStatusBanner';
import { AlertCircle, LogOut } from 'lucide-react';

function MainAppContent() {
  const { viewMode, setViewMode, userProfile, profileUnconfigured, logout } = useAuth();
  const [activeSection, setActiveSection] = useState<NavSection>('home');
  
  // Modal states for landing page actions
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isGetStartedOpen, setIsGetStartedOpen] = useState(false);
  const [isLearnMoreOpen, setIsLearnMoreOpen] = useState(false);
  const [isMciModalOpen, setIsMciModalOpen] = useState(false);

  const scrollToSection = (sectionId: NavSection) => {
    setActiveSection(sectionId);
    if (sectionId === 'login') {
      setViewMode('login');
      return;
    }
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
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
          {canonicalRole === 'patient' && <PatientDashboard />}
          {canonicalRole === 'hospital_admin' && <HospitalDashboard />}
          {canonicalRole === 'blood_bank_admin' && <BloodBankDashboard />}
          {canonicalRole === 'ambulance_admin' && <AmbulanceDashboard />}
          {canonicalRole === 'government_admin' && <GovernmentDashboard />}
          {canonicalRole === 'clinician_reviewer' && <ClinicianReviewDashboard />}
          {canonicalRole === 'hospital_approver' && <HospitalApprovalsDashboard />}
          {!['patient', 'hospital_admin', 'blood_bank_admin', 'ambulance_admin', 'government_admin', 'clinician_reviewer', 'hospital_approver'].includes(canonicalRole) && (
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
        onOpenGetStarted={() => setIsGetStartedOpen(true)}
        onOpenMciReport={() => setIsMciModalOpen(true)}
      />

      {/* Main Landing Content */}
      <main className="flex-1">
        {/* 1. Hero Section */}
        <Hero
          onOpenGetStarted={() => setIsGetStartedOpen(true)}
          onOpenLearnMore={() => setIsLearnMoreOpen(true)}
          onExploreFeatures={() => scrollToSection('features')}
          onOpenMciReport={() => setIsMciModalOpen(true)}
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

      <MassCasualtyGuestReporter
        isOpen={isMciModalOpen}
        onClose={() => setIsMciModalOpen(false)}
      />

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
