import { ToastProvider } from "../common/Toast";
import ClinicOverviewTab from "./tabs/ClinicOverviewTab";
import DoctorManagementTab from "./tabs/DoctorManagementTab";
import ServiceFeeConfigTab from "./tabs/ServiceFeeConfigTab";
import ScheduleManagementTab from "./tabs/ScheduleManagementTab";
import AppointmentManagementTab from "./tabs/AppointmentManagementTab";
import PaymentOversightTab from "./tabs/PaymentOversightTab";
import OperationalReportsTab from "./tabs/OperationalReportsTab";
import ClinicSettingsTab from "./tabs/ClinicSettingsTab";
import SupportStaffManagementTab from "./tabs/SupportStaffManagementTab";
import AuditLogsTab from "./tabs/AuditLogsTab";
import SupportScreen from "../screens/SupportScreen";
import SecOpsDashboardScreen from "../secops/SecOpsDashboardScreen";

export default function ClinicAdminDashboard({ activeTab = "overview", onSelectTab }) {
  const normalizeTab = (tab) => {
    switch (tab) {
      case "overview":
      case "clinic-overview":
      case "clinic-approvals":
        return "overview";
      case "doctors":
      case "clinic-doctors":
        return "doctors";
      case "services":
      case "clinic-services":
        return "services";
      case "schedules":
      case "clinic-schedules":
        return "schedules";
      case "appointments":
      case "clinic-appointments":
        return "appointments";
      case "payments":
      case "clinic-payments":
        return "payments";
      case "reports":
      case "clinic-reports":
        return "reports";
      case "audit":
      case "clinic-audit":
        return "audit";
      case "support-staff":
      case "clinic-support-staff":
        return "support-staff";
      case "secops":
      case "clinic-secops":
        return "secops";
      case "support":
      case "clinic-support":
        return "support";
      case "settings":
      case "clinic-settings":
        return "settings";
      default:
        return "overview";
    }
  };

  const current = normalizeTab(activeTab);

  const renderCurrentTab = () => {
    switch (current) {
      case "overview":
        return <ClinicOverviewTab onSelectTab={(target) => onSelectTab(`clinic-${target}`)} />;
      case "doctors":
        return <DoctorManagementTab />;
      case "services":
        return <ServiceFeeConfigTab />;
      case "schedules":
        return <ScheduleManagementTab />;
      case "appointments":
        return <AppointmentManagementTab />;
      case "payments":
        return <PaymentOversightTab />;
      case "reports":
        return <OperationalReportsTab />;
      case "audit":
        return <AuditLogsTab />;
      case "support-staff":
        return <SupportStaffManagementTab />;
      case "secops":
        return <SecOpsDashboardScreen />;
      case "support":
        return <SupportScreen onNavigate={onSelectTab} />;
      case "settings":
        return <ClinicSettingsTab />;
      default:
        return <ClinicOverviewTab onSelectTab={(target) => onSelectTab(`clinic-${target}`)} />;
    }
  };

  return (
    <ToastProvider>
      <div className="space-y-6 font-sans">{renderCurrentTab()}</div>
    </ToastProvider>
  );
}
