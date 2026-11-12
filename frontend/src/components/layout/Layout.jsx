import { useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function Layout({
  activeTab,
  onSelectTab,
  onSignOut,
  patient,
  children,
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("kaizen_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const handleToggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("kaizen_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-[#F0F5F7] font-sans text-[#162623] flex flex-col lg:flex-row">
      {/* Persistent Flex Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        patient={patient}
        collapsed={collapsed}
        onToggleCollapse={handleToggleCollapse}
      />

      {/* Main Content Workspace using remaining available width */}
      <div className="flex flex-col flex-1 min-w-0 min-h-screen bg-[#F0F5F7] transition-[margin] duration-300">
        <Header
          activeTab={activeTab}
          onOpenMobile={() => setMobileOpen(true)}
          collapsed={collapsed}
          onToggleCollapse={handleToggleCollapse}
          onSelectTab={onSelectTab}
          onSignOut={onSignOut}
          patient={patient}
        />
        <main className="flex-1 w-full bg-[#F0F5F7] p-6 space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
}
