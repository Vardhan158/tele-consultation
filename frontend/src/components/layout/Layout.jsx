import { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout({ activeTab, onSelectTab, onSignOut, patient, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F0F5F7] font-sans text-[#162623] flex flex-col">
      <Sidebar
        activeTab={activeTab}
        onSelectTab={onSelectTab}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        patient={patient}
      />

      <div className="lg:pl-72 flex flex-col flex-1 min-h-screen">
        <Header
          activeTab={activeTab}
          onOpenMobile={() => setMobileOpen(true)}
          onSelectTab={onSelectTab}
          onSignOut={onSignOut}
          patient={patient}
        />
        <main className="flex-1 w-full bg-[#F0F5F7]">
          {children}
        </main>
      </div>
    </div>
  );
}
