import { useEffect, useState } from 'react';
import Layout from './components/layout/Layout';
import DashboardScreen from './components/screens/DashboardScreen';
import FindDoctorsScreen from './components/screens/FindDoctorsScreen';
import AppointmentsScreen from './components/screens/AppointmentsScreen';
import VideoConsultationScreen from './components/screens/VideoConsultationScreen';
import MedicalRecordsScreen from './components/screens/MedicalRecordsScreen';
import PrescriptionsScreen from './components/screens/PrescriptionsScreen';
import ConsultationSummariesScreen from './components/screens/ConsultationSummariesScreen';
import FollowUpCareScreen from './components/screens/FollowUpCareScreen';
import PaymentsScreen from './components/screens/PaymentsScreen';
import NotificationsScreen from './components/screens/NotificationsScreen';
import SettingsScreen from './components/screens/SettingsScreen';
import ProfileScreen from './components/screens/ProfileScreen';
import SupportScreen from './components/screens/SupportScreen';
import ConsentScreen from './components/screens/ConsentScreen';
import AuthScreen from './components/auth/AuthScreen';
import { authApi } from './lib/api';
import LandingScreen from './components/public/LandingScreen';
import DoctorDashboardScreen from './components/screens/DoctorDashboardScreen';
import DoctorRegistrationScreen from './components/auth/DoctorRegistrationScreen';
import DoctorAppointmentsScreen from './components/screens/DoctorAppointmentsScreen';
import DoctorPatientsScreen from './components/screens/DoctorPatientsScreen';
import DoctorAvailabilityScreen from './components/screens/DoctorAvailabilityScreen';
import DoctorSettingsScreen from './components/screens/DoctorSettingsScreen';
import DoctorConsultationScreen from './components/screens/DoctorConsultationScreen';
import ClinicAdminScreen from './components/screens/ClinicAdminScreen';

const PATH_TO_TAB = {
  '/dashboard': 'dashboard',
  '/find-doctors': 'find-doctors',
  '/appointments': 'appointments',
  '/video-consultation': 'video-consultation',
  '/medical-records': 'medical-records',
  '/prescriptions': 'prescriptions',
  '/consultation-summaries': 'summaries',
  '/follow-up': 'follow-up',
  '/payments': 'payments',
  '/notifications': 'notifications',
  '/settings': 'settings',
  '/profile': 'profile',
  '/consent': 'consent',
  '/support': 'support',
  '/doctor/dashboard': 'doctor-dashboard',
  '/doctor/appointments': 'doctor-appointments',
  '/doctor/patients': 'doctor-patients',
  '/doctor/availability': 'doctor-availability',
  '/doctor/settings': 'doctor-settings',
  '/doctor/consultation': 'doctor-consultation',
  '/clinic/admin': 'clinic-admin',
};

const TAB_TO_PATH = Object.fromEntries(Object.entries(PATH_TO_TAB).map(([path, tab]) => [tab, path]));

function tabFromLocation() {
  return PATH_TO_TAB[window.location.pathname] || 'dashboard';
}

export default function App() {
  const [activeTab, setActiveTab] = useState(() => tabFromLocation());
  const [navParams, setNavParams] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [entryMode, setEntryMode] = useState('landing');
  const [patient, setPatient] = useState(null);

  useEffect(() => {
    authApi.me()
      .then((result) => {
        setAuthenticated(Boolean(result?.authenticated));
        if (result?.authenticated) setPatient(result);
      })
      .catch(() => setAuthenticated(false))
      .finally(() => setAuthChecking(false));
  }, []);

  useEffect(() => {
    const onPopState = () => setActiveTab(tabFromLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleNavigate = (tab, params = null) => {
    setNavParams(params);
    setActiveTab(tab);
    const path = TAB_TO_PATH[tab];
    if (path && window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
  };

  if (authChecking) return null;

  if (!authenticated) {
    if (entryMode === 'landing') return <LandingScreen onSignIn={() => setEntryMode('login')} onRegister={() => setEntryMode('register')} onDoctorRegister={() => setEntryMode('doctor-register')} />;
    if (entryMode === 'doctor-register') return <DoctorRegistrationScreen onBack={() => setEntryMode('landing')} />;
    return <AuthScreen onBack={() => setEntryMode('landing')} initialMode={entryMode} onAuthenticated={async () => {
      setAuthenticated(true);
      const current = await authApi.me().catch(() => null);
      if (current?.authenticated) setPatient(current);
    }} />;
  }

  const signOut = async () => {
    await authApi.logout().catch(() => {});
    setAuthenticated(false);
  };

  const isDoctor = patient?.role === 'doctor';
  const renderScreen = () => {
    if (patient?.role === 'clinic_admin') {
      return <ClinicAdminScreen />;
    }
    if (isDoctor) {
      switch (activeTab) {
        case 'doctor-dashboard': return <DoctorDashboardScreen onNavigate={handleNavigate} />;
        case 'doctor-appointments': return <DoctorAppointmentsScreen onNavigate={handleNavigate} />;
        case 'doctor-patients': return <DoctorPatientsScreen />;
        case 'doctor-availability': return <DoctorAvailabilityScreen />;
        case 'doctor-settings': return <DoctorSettingsScreen />;
        case 'doctor-consultation': return <DoctorConsultationScreen appointment={navParams} onBack={() => handleNavigate('doctor-appointments')} />;
        default: return <DoctorDashboardScreen onNavigate={handleNavigate} />;
      }
    }
    switch (activeTab) {
      case 'dashboard':
        return <DashboardScreen onNavigate={handleNavigate} />;
      case 'find-doctors':
        return <FindDoctorsScreen onNavigate={handleNavigate} />;
      case 'appointments':
        return <AppointmentsScreen onNavigate={handleNavigate} navParams={navParams} />;
      case 'video-consultation':
        return <VideoConsultationScreen onNavigate={handleNavigate} />;
      case 'medical-records':
        return <MedicalRecordsScreen onNavigate={handleNavigate} />;
      case 'prescriptions':
        return <PrescriptionsScreen onNavigate={handleNavigate} />;
      case 'summaries':
        return <ConsultationSummariesScreen onNavigate={handleNavigate} />;
      case 'follow-up':
        return <FollowUpCareScreen onNavigate={handleNavigate} />;
      case 'payments':
        return <PaymentsScreen onNavigate={handleNavigate} navParams={navParams} />;
      case 'notifications':
        return <NotificationsScreen onNavigate={handleNavigate} />;
      case 'settings':
        return <SettingsScreen onNavigate={handleNavigate} />;
      case 'profile':
        return <ProfileScreen onNavigate={handleNavigate} />;
      case 'consent':
        return <ConsentScreen onNavigate={handleNavigate} />;
      case 'support':
        return <SupportScreen onNavigate={handleNavigate} />;
      default:
        return <DashboardScreen onNavigate={handleNavigate} />;
    }
  };

  return (
    <Layout activeTab={patient?.role === 'clinic_admin' ? 'clinic-admin' : activeTab} onSelectTab={handleNavigate} onSignOut={signOut} patient={patient}>
      {renderScreen()}
    </Layout>
  );
}
