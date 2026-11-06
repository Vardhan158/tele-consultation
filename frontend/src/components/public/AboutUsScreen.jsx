import PublicNavbar from "./PublicNavbar";

const principles = [
  { title: "Patient-first by design", description: "Every interaction is shaped around clarity, dignity, and helping patients feel confident about their next step.", icon: "favorite" },
  { title: "Connected care", description: "Appointments, conversations, and clinician-released information come together in one thoughtful patient experience.", icon: "hub" },
  { title: "Care with clarity", description: "Simple workflows help patients find the right specialist, understand their options, and stay engaged with follow-up care.", icon: "lightbulb" },
];

export default function AboutUsScreen() {
  return (
    <div className="min-h-screen bg-[#F0F5F7] font-sans text-[#162623]">
      <PublicNavbar />
      <main>
        <section className="bg-[#295255] px-6 py-20 text-white lg:px-10 lg:py-28">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#F0F5F7]/75">About Kaizentrix Care</p>
            <h1 className="mt-4 text-4xl font-bold leading-tight text-white sm:text-5xl">Care that feels connected, personal, and clear.</h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[#F0F5F7]/85 sm:text-lg">Kaizentrix Care brings the essential parts of a modern healthcare journey together so patients can spend less time navigating systems and more time focusing on their wellbeing.</p>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:px-10 lg:py-24">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-[#577877]">Our mission</span>
            <h2 className="mt-3 text-2xl font-bold text-[#162623] sm:text-3xl">Make high-quality care easier to find and easier to follow.</h2>
            <p className="mt-5 text-sm leading-7 text-[#577877]">Healthcare can feel fragmented. We are building a calmer, more connected way for patients to discover trusted care specialists, arrange appointments, meet their care team, and keep track of what comes next.</p>
            <p className="mt-4 text-sm leading-7 text-[#577877]">Our patient-first approach means every workflow is designed to be understandable, respectful, and useful at the moment it matters.</p>
          </div>
          <div className="rounded-[1.75rem] border border-[rgba(87,120,119,0.15)] bg-white p-7 shadow-[0_10px_30px_-8px_rgba(22,38,35,0.12)] sm:p-9">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#577877]">The platform</p>
            <h3 className="mt-3 text-xl font-bold text-[#162623]">One place for your healthcare journey</h3>
            <div className="mt-6 space-y-4 text-sm text-[#577877]">
              {['Find care specialists by what matters to you', 'Choose appointment times that fit your life', 'Meet your care team through a simple patient portal', 'Keep follow-up details close at hand'].map((item) => <div key={item} className="flex items-start gap-3"><span className="material-symbols-outlined !text-[#295255] text-lg">check_circle</span><span>{item}</span></div>)}
            </div>
          </div>
        </section>

        <section className="border-y border-[#577877]/15 bg-white px-6 py-20 lg:px-10">
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl"><span className="text-xs font-semibold uppercase tracking-wider text-[#577877]">What guides us</span><h2 className="mt-3 text-2xl font-bold text-[#162623] sm:text-3xl">Built around the patient experience</h2></div>
            <div className="mt-10 grid gap-6 md:grid-cols-3">{principles.map((principle) => <article key={principle.title} className="rounded-2xl border border-[rgba(87,120,119,0.15)] bg-[#F0F5F7] p-6"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white"><span className="material-symbols-outlined !text-[#295255]">{principle.icon}</span></span><h3 className="mt-5 text-base font-bold text-[#162623]">{principle.title}</h3><p className="mt-2 text-xs leading-relaxed text-[#577877]">{principle.description}</p></article>)}</div>
          </div>
        </section>
      </main>
      <footer className="border-t border-[#577877]/20 bg-[#F0F5F7] px-6 py-8 text-xs text-[#577877] lg:px-10"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row"><p>© 2026 Kaizentrix Care · Patient Portal. All rights reserved.</p><div className="flex gap-6"><span>Privacy Policy</span><span>Terms of Use</span></div></div></footer>
    </div>
  );
}
