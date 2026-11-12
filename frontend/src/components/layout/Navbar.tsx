import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

const links = [
  ["Home", "/"],
  ["Find Doctors", "/find-doctors"],
  ["How It Works", "/how-it-works"],
  ["About Us", "/about-us"],
  ["Contact", "/contact"],
];

const linkClass = ({ isActive }) => `rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25836F] focus-visible:ring-offset-2 ${isActive ? "bg-[#F0F5F7] text-[#25836F]" : "text-[#577877] hover:bg-[#F0F5F7] hover:text-[#162623]"}`;

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const closeOnEscape = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, []);

  const go = (path) => {
    setOpen(false);
    navigate(path);
  };

  const renderLink = ([label, path]) => <NavLink key={label} to={path} onClick={() => setOpen(false)} className={linkClass} end>{label}</NavLink>;

  return <header className="sticky top-0 z-40 border-b border-[rgba(87,120,119,0.15)] bg-white/95 backdrop-blur-md"><div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-4 lg:px-10"><NavLink to="/" aria-label="Kaizen Care home" className="flex shrink-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25836F] focus-visible:ring-offset-2"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#125747] text-white shadow-sm"><svg width="24" height="28" viewBox="0 0 35 42" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-6 w-auto text-white" aria-hidden="true"><path d="M14.451 5.223A7.466 7.466 0 0 1 24.9 15.891q-.3.293-.584.512L13.933 5.802q.22-.285.518-.579M7.093 25.239A7.466 7.466 0 0 0 17.607 35.84a7 7 0 0 0 .518-.574L7.675 24.73a6 6 0 0 0-.582.508" fill="currentColor"/><rect width="12.629" height="32.626" rx="6.315" transform="rotate(-45 16.202 6.711)" fill="currentColor"/></svg></div><div><p className="text-lg font-bold leading-none tracking-tight text-[#162623]">Kaizen Care</p><p className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#577877]">Patient Portal</p></div></NavLink><nav aria-label="Primary navigation" className="hidden items-center gap-1 xl:flex">{links.map(renderLink)}</nav><div className="hidden items-center gap-3 lg:flex"><button type="button" onClick={() => go("/doctor/register")} className="rounded-lg px-2 py-2 text-xs font-semibold text-[#25836F] hover:bg-[#F0F5F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25836F]">Clinician Registration</button><button type="button" onClick={() => go("/login")} className="inline-flex items-center justify-center rounded-xl border border-[rgba(87,120,119,0.35)] bg-white px-4 py-2 text-xs font-semibold text-[#25836F] shadow-sm hover:bg-[#F0F5F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25836F]">Sign In</button><button type="button" onClick={() => go("/register")} className="inline-flex items-center justify-center rounded-xl bg-[#25836F] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#1F3F41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25836F]">Create Account</button></div><button type="button" aria-label="Toggle navigation menu" aria-expanded={open} aria-controls="public-mobile-navigation" onClick={() => setOpen((value) => !value)} className="rounded-lg p-2 text-[#25836F] hover:bg-[#F0F5F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25836F] lg:hidden"><span className="material-symbols-outlined" aria-hidden="true">{open ? "close" : "menu"}</span></button></div>{open && <div id="public-mobile-navigation" className="border-t border-[rgba(87,120,119,0.15)] bg-white px-5 py-4 lg:hidden"><nav aria-label="Mobile navigation" className="flex flex-col gap-1">{links.map(renderLink)}<button type="button" onClick={() => go("/doctor/register")} className="rounded-lg px-3 py-2 text-left text-sm font-medium text-[#25836F] hover:bg-[#F0F5F7]">Clinician Registration</button><div className="mt-3 flex gap-2 border-t border-[rgba(87,120,119,0.15)] pt-4"><button type="button" onClick={() => go("/login")} className="flex-1 rounded-xl border border-[rgba(87,120,119,0.35)] bg-white px-3 py-2 text-xs font-semibold text-[#25836F]">Sign In</button><button type="button" onClick={() => go("/register")} className="flex-1 rounded-xl bg-[#25836F] px-3 py-2 text-xs font-semibold text-white">Create Account</button></div></nav></div>}</header>;
}
