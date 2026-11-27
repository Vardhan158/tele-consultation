import { lazy, Suspense, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { authApi, patientApi } from "./lib/api";
import ServicesScreen from "./components/public/ServicesScreen";
import LandingScreen from "./components/public/LandingScreen";
import AboutUsScreen from "./components/public/AboutUsScreen";
import FaqsScreen from "./components/public/FaqsScreen";
import ContactScreen from "./components/public/ContactScreen";
import DoctorDashboardScreen from "./components/screens/DoctorDashboardScreen";
import DoctorRegistrationScreen from "./components/auth/DoctorRegistrationScreen";
import DoctorVerifyEmailScreen from "./components/auth/DoctorVerifyEmailScreen";
import DoctorPendingApprovalScreen from "./components/auth/DoctorPendingApprovalScreen";
import DoctorAppointmentsScreen from "./components/screens/DoctorAppointmentsScreen";
import DoctorPatientsScreen from "./components/screens/DoctorPatientsScreen";
import DoctorAvailabilityScreen from "./components/screens/DoctorAvailabilityScreen";
import DoctorSettingsScreen from "./components/screens/DoctorSettingsScreen";
import DoctorConsultationScreen from "./components/screens/DoctorConsultationScreen";
import DoctorNotificationsScreen from "./components/screens/DoctorNotificationsScreen";
import MyInsuranceScreen from "./components/screens/MyInsuranceScreen";
import ClinicAdminDashboard from "./components/admin/ClinicAdminDashboard";
import SupportDashboardScreen from "./components/support/SupportDashboardScreen";
import SecOpsDashboardScreen from "./components/secops/SecOpsDashboardScreen";

const PATH_TO_TAB = {
  "/dashboard": "dashboard",
  "/find-doctors": "find-doctors",
  "/about-us": "about-us",
  "/contact": "contact",
  "/appointments": "appointments",
  "/video-consultation": "video-consultation",
  "/medical-records": "medical-records",
  "/prescriptions": "prescriptions",
  "/consultation-summaries": "summaries",
  "/follow-up": "follow-up",
  "/my-insurance": "my-insurance",
  "/payments": "payments",
  "/notifications": "notifications",
  "/settings": "settings",
  "/profile": "profile",
  "/consent": "consent",
  "/support": "support",
  "/secops": "secops",
  "/doctor/dashboard": "doctor-dashboard",
  "/doctor/appointments": "doctor-appointments",
  "/doctor/patients": "doctor-patients",
  "/doctor/availability": "doctor-availability",
  "/doctor/settings": "doctor-settings",
  "/doctor/consultation": "doctor-consultation",
  "/clinic/overview": "clinic-overview",
  "/clinic/doctors": "clinic-doctors",
  "/clinic/services": "clinic-services",
  "/clinic/schedules": "clinic-schedules",
  "/clinic/appointments": "clinic-appointments",
  "/clinic/payments": "clinic-payments",
  "/clinic/insurance": "clinic-insurance",
  "/clinic/insurance-management": "clinic-insurance",
  "/clinic/insurance-providers": "clinic-insurance",
  "/clinic/reports": "clinic-reports",
  "/clinic/audit": "clinic-audit",
  "/clinic/support-staff": "clinic-support-staff",
  "/clinic/secops": "clinic-secops",
  "/clinic/settings": "clinic-settings",
  "/clinic/approvals": "clinic-doctors",
};

const TAB_TO_PATH = Object.fromEntries(
  Object.entries(PATH_TO_TAB).map(([path, tab]) => [tab, path]),
);

const PUBLIC_PATHS = {
  "/": "landing",
  "/login": "login",
  "/register": "register",
  "/find-doctors": "find-doctors",
  "/doctor/register": "doctor-register",
  "/doctor/verify-email": "doctor-verify-email",
};

function tabFromLocation() {
  return PATH_TO_TAB[window.location.pathname] || "dashboard";
}

function entryModeFromLocation() {
  return PUBLIC_PATHS[window.location.pathname] || "landing";
}

export default function App() {
  return <Suspense fallback={null}><AppContent /></Suspense>;
}

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(() => tabFromLocation());
  const [navParams, setNavParams] = useState(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [entryMode, setEntryMode] = useState(() => entryModeFromLocation());
  const [patient, setPatient] = useState(null);
  const [registeredDoctorEmail, setRegisteredDoctorEmail] = useState("");

  const refreshUser = async () => {
    try {
      const result = await authApi.me();
      if (result?.authenticated) {
        setAuthenticated(true);
        let userState = { ...result };
        if (result.role === "patient") {
          try {
            const profile = await patientApi.getProfile();
            if (profile) {
              userState = {
                ...userState,
                ...profile,
                avatar_url: profile.avatar_url || result.avatar_url,
                full_name: profile.full_name || result.full_name,
              };
            }
          } catch {
            // fallback to authApi.me result
          }
        }
        setPatient(userState);
        return userState;
      } else {
        setAuthenticated(false);
        setPatient(null);
        return null;
      }
    } catch {
      setAuthenticated(false);
      setPatient(null);
      return null;
    }
  };

  useEffect(() => {
    refreshUser().finally(() => setAuthChecking(false));
  }, []);

  const navigateEntry = (mode) => {
    const path =
      Object.entries(PUBLIC_PATHS).find(([, value]) => value === mode)?.[0] ||
      "/";
    setEntryMode(mode);
    if (location.pathname !== path) navigate(path);
  };

  const handleNavigate = (tab, params = null) => {
    setNavParams(params);
    setActiveTab(tab);
    const path = TAB_TO_PATH[tab];
    if (path && location.pathname !== path) navigate(path);
  };

  const routedTab = PATH_TO_TAB[location.pathname] || activeTab;
  const routedEntryMode =
    PUBLIC_PATHS[location.pathname] ||
    (PATH_TO_TAB[location.pathname] ? "login" : entryMode);

  if (authChecking) return null;

  if (location.pathname === "/services") return <ServicesScreen />;
  if (location.pathname === "/about" || location.pathname === "/about-us") return <AboutUsScreen />;
  if (location.pathname === "/faqs") return <FaqsScreen />;
  if (location.pathname === "/contact") return <ContactScreen />;

  if (!authenticated) {
    if (routedEntryMode === "landing")
      return (
        <LandingScreen
          onSignIn={() => navigateEntry("login")}
          onRegister={() => navigateEntry("register")}
          onDoctorRegister={() => navigateEntry("doctor-register")}
          onFindDoctor={() => navigate("/find-doctors")}
        />
      );
    if (routedEntryMode === "doctor-register")
      return (
        <DoctorRegistrationScreen
          onBack={() => navigateEntry("landing")}
          onSuccess={(email) => {
            setRegisteredDoctorEmail(email);
            navigate("/doctor/verify-email");
          }}
        />
      );
    if (routedEntryMode === "doctor-verify-email")
      return (
        <DoctorVerifyEmailScreen
          initialEmail={registeredDoctorEmail}
          onBack={() => navigate("/doctor/register")}
          onVerified={() => {
            refreshUser().then((res) => {
              if (res?.authenticated && res?.role === "doctor") {
                navigate("/doctor/dashboard", { replace: true });
              }
            });
          }}
        />
      );
    if (routedEntryMode === "find-doctors") {
      return (
        <FindDoctorsScreen
          onNavigate={handleNavigate}
          onRequireAuth={() => navigateEntry("register")}
          authenticated={false}
        />
      );
    }
    return (
      <AuthScreen
        onBack={() => navigateEntry("landing")}
        initialMode={routedEntryMode}
        onAuthenticated={() => {
          refreshUser().then((res) => {
            if (!res?.authenticated) {
              setAuthenticated(false);
              setPatient(null);
              navigate("/login", { replace: true });
            } else if (res.role === "clinic_admin") {
              navigate("/clinic/overview", { replace: true });
            } else if (res.role === "support") {
              navigate("/support", { replace: true });
            } else if (res.role === "doctor") {
              navigate("/doctor/dashboard", { replace: true });
            } else {
              setActiveTab("dashboard");
              navigate("/dashboard", { replace: true });
            }
          });
        }}
      />
    );
  }

  const signOut = async () => {
    await authApi.logout().catch(() => {});
    setAuthenticated(false);
    setPatient(null);
    navigate("/", { replace: true });
  };

  const isDoctor = patient?.role === "doctor";

  // Support Agent Dashboard View
  if (patient?.role === "support" || (patient?.role === "clinic_admin" && location.pathname === "/support")) {
    return (
      <SupportDashboardScreen
        user={patient}
        onLogout={signOut}
      />
    );
  }

  // Prevent clinician dashboard access until clinic approval is completed
  if (isDoctor && patient?.approval_status !== "approved") {
    return (
      <DoctorPendingApprovalScreen
        patient={patient}
        onRefresh={refreshUser}
        onSignOut={signOut}
      />
    );
  }

  const renderScreen = () => {
    if (patient?.role === "secops" || patient?.role === "security_ops" || routedTab === "secops") {
      return <SecOpsDashboardScreen user={patient} onLogout={signOut} />;
    }
    if (patient?.role === "clinic_admin") {
      return (
        <ClinicAdminDashboard
          activeTab={routedTab}
          onSelectTab={handleNavigate}
          navParams={navParams}
        />
      );
    }
    if (isDoctor) {
      switch (routedTab) {
        case "doctor-dashboard":
          return <DoctorDashboardScreen onNavigate={handleNavigate} />;
        case "notifications":
          return <DoctorNotificationsScreen onNavigate={handleNavigate} />;
        case "doctor-appointments":
          return <DoctorAppointmentsScreen onNavigate={handleNavigate} />;
        case "doctor-patients":
          return <DoctorPatientsScreen />;
        case "doctor-availability":
          return <DoctorAvailabilityScreen />;
        case "doctor-settings":
          return <DoctorSettingsScreen />;
        case "doctor-consultation":
          return (
            <DoctorConsultationScreen
              appointment={navParams}
              onBack={() => handleNavigate("doctor-appointments")}
            />
          );
        default:
          return <DoctorDashboardScreen onNavigate={handleNavigate} />;
      }
    }
    switch (routedTab) {
      case "dashboard":
        return <DashboardScreen onNavigate={handleNavigate} />;
      case "find-doctors":
        return <FindDoctorsScreen onNavigate={handleNavigate} authenticated />;
      case "appointments":
        return (
          <AppointmentsScreen
            onNavigate={handleNavigate}
            navParams={navParams}
          />
        );
      case "video-consultation":
        return <VideoConsultationScreen onNavigate={handleNavigate} />;
      case "medical-records":
        return <MedicalRecordsScreen onNavigate={handleNavigate} />;
      case "prescriptions":
        return <PrescriptionsScreen onNavigate={handleNavigate} />;
      case "summaries":
        return <ConsultationSummariesScreen onNavigate={handleNavigate} />;
      case "follow-up":
        return <FollowUpCareScreen onNavigate={handleNavigate} />;
      case "my-insurance":
        return <MyInsuranceScreen onNavigate={handleNavigate} patient={patient} navParams={navParams} />;
      case "payments":
        return (
          <PaymentsScreen
            onNavigate={handleNavigate}
            navParams={navParams}
            patient={patient}
          />
        );
      case "notifications":
        return <NotificationsScreen onNavigate={handleNavigate} />;
      case "settings":
        return <SettingsScreen onNavigate={handleNavigate} />;
      case "profile":
        return (
          <ProfileScreen
            onNavigate={handleNavigate}
            onUserUpdate={(updates) => setPatient((prev) => (prev ? { ...prev, ...updates } : prev))}
          />
        );
      case "consent":
        return <ConsentScreen onNavigate={handleNavigate} />;
      case "support":
        return <SupportScreen onNavigate={handleNavigate} />;
      default:
        return <DashboardScreen onNavigate={handleNavigate} />;
    }
  };

  return (
    <Layout
      activeTab={patient?.role === "clinic_admin" ? routedTab : routedTab}
      onSelectTab={handleNavigate}
      onSignOut={signOut}
      patient={patient}
    >
      {renderScreen()}
    </Layout>
  );
}
