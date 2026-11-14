import { useId, useState } from "react";
import PublicNavbar from "./PublicNavbar";
import "./landing-theme.css";

const FAQS = [
  ["How do I book an online doctor consultation?", "Browse available medical specialists by specialty or availability, select your preferred date and time slot, and confirm your booking through the patient portal."],
  ["How do I pay for an appointment?", "You can complete your appointment payment securely online using integrated payment gateways during the booking flow."],
  ["How do I join my video consultation?", "Log into your patient portal account, navigate to Appointments or Video Consultation, and click 'Join Video Room' when your scheduled time arrives."],
  ["Can I reschedule or cancel my appointment?", "Yes, you can easily reschedule or cancel an upcoming consultation directly from your Appointments tab up to 24 hours prior to the scheduled start time."],
  ["Where can I access my prescriptions and consultation records?", "After your consultation is completed, doctor-issued prescriptions, consultation summaries, and available medical records are securely stored under your portal account."],
  ["What happens if my video connection is interrupted?", "If your connection drops, simply refresh your browser page or click 'Rejoin Video Room' to reconnect to your ongoing secure consultation."],
];

export default function FaqsScreen() {
  const [openIndex, setOpenIndex] = useState(null);
  const idPrefix = useId();
  return (
    <div className="min-h-screen bg-white font-sans text-[#162623] antialiased selection:bg-[#1A7D67] selection:text-white overflow-x-hidden">
      <PublicNavbar />
      <main>
        <section id="faqs" className="scroll-mt-16 w-full max-w-4xl mx-auto px-6 sm:px-10 py-16 md:py-24">
          <div className="flex flex-col items-center text-center space-y-3 mb-12">
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-zinc-300 text-xs sm:text-sm text-zinc-600 uppercase font-semibold"><span className="size-2 rounded-full bg-[#1A7D67]"></span>Common Questions</div>
            <h1 className="text-3xl sm:text-4xl font-medium text-zinc-800 tracking-tight">Frequently Asked Questions</h1>
            <p className="text-zinc-600 text-sm sm:text-base">Everything you need to know about online doctor consultations, appointment booking, and portal features.</p>
          </div>
          <div className="space-y-4">
            {FAQS.map(([question, answer], index) => {
              const panelId = `${idPrefix}-answer-${index}`;
              const isOpen = openIndex === index;
              return (
                <div key={question} className="rounded-xl border border-zinc-200 bg-white shadow-sm transition-all duration-300 hover:border-[#1A7D67] hover:shadow-md">
                  <button id={`${idPrefix}-question-${index}`} type="button" className="flex w-full cursor-pointer items-center justify-between gap-4 p-5 text-left text-base font-semibold text-zinc-800" aria-expanded={isOpen} aria-controls={panelId} onClick={() => setOpenIndex(isOpen ? null : index)}>
                    <span>{question}</span>
                    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 text-zinc-500 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                  <div id={panelId} role="region" aria-labelledby={`${idPrefix}-question-${index}`} hidden={!isOpen} className="border-t border-zinc-100 px-5 pb-5 pt-3 text-sm leading-relaxed text-zinc-600">{answer}</div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
