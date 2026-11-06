import PublicNavbar from "./PublicNavbar";

const journeySteps = [
  {
    title: "Find your doctor",
    description: "Explore care specialists by specialty, language, availability, and consultation fee.",
    icon: "person_search",
  },
  {
    title: "Book with confidence",
    description: "Choose an available appointment time and review the details before confirming your visit.",
    icon: "calendar_month",
  },
  {
    title: "Meet from anywhere",
    description: "Join your scheduled video appointment from a private, convenient place that works for you.",
    icon: "videocam",
  },
  {
    title: "Stay connected to care",
    description: "Keep your appointment details, clinician-released records, and follow-up information together.",
    icon: "folder_shared",
  },
];

export default function HowItWorksScreen() {
  return (
    <div className="min-h-screen bg-[#F0F5F7] font-sans text-[#162623]">
      <PublicNavbar />
      <main>
        <section className="bg-[#295255] px-6 py-20 text-white lg:px-10 lg:py-28">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#F0F5F7]/75">Your care journey</p>
            <h1 className="mt-4 text-4xl font-bold leading-tight text-white sm:text-5xl">How Your Care Journey Works</h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[#F0F5F7]/85 sm:text-lg">From finding the right specialist to staying on top of follow-up care, Kaizentrix Care keeps each step simple and connected.</p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl scroll-mt-24 px-6 py-20 lg:px-10 lg:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#577877]">A thoughtful path to care</span>
            <h2 className="mt-2 text-2xl font-bold text-[#162623] sm:text-3xl">One portal for your entire healthcare journey</h2>
            <p className="mt-3 text-sm leading-relaxed text-[#577877]">Designed with clinical clarity and an easy experience for modern patients.</p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {journeySteps.map((step, index) => (
              <article key={step.title} className="relative rounded-2xl border border-[rgba(87,120,119,0.15)] bg-white p-6 shadow-[0_4px_20px_-2px_rgba(22,38,35,0.05)]">
                <span className="absolute right-5 top-5 text-xs font-semibold text-[#577877]">0{index + 1}</span>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#F0F5F7]"><span className="material-symbols-outlined !text-[#295255] text-2xl">{step.icon}</span></span>
                <h3 className="mt-5 text-base font-bold text-[#162623]">{step.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-[#577877]">{step.description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
      <footer className="border-t border-[#577877]/20 bg-white px-6 py-8 text-xs text-[#577877] lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <p>© 2026 Kaizentrix Care · Patient Portal. All rights reserved.</p>
          <div className="flex gap-6"><span>Privacy Policy</span><span>Terms of Use</span></div>
        </div>
      </footer>
    </div>
  );
}
