import PublicNavbar from "./PublicNavbar";
import { ServicesSection } from "./LandingScreen";
import "./landing-theme.css";

export default function ServicesScreen() {
  return (
    <div className="min-h-screen bg-white font-sans text-[#162623] antialiased selection:bg-[#1A7D67] selection:text-white overflow-x-hidden">
      <PublicNavbar />
      <main className="pt-20 sm:pt-24">
        <ServicesSection limit={6} />
      </main>
    </div>
  );
}
