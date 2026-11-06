import { useState } from "react";
import PublicNavbar from "./PublicNavbar";
import { contactApi } from "../../lib/api";

const initialForm = { name: "", email: "", phone: "", subject: "", message: "", privacyConsent: false };

export default function ContactScreen() {
  const [form, setForm] = useState(initialForm);
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");

  const update = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setState("loading");
    setError("");
    try {
      await contactApi.createInquiry({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        subject: form.subject.trim(),
        message: form.message.trim(),
        privacy_consent: form.privacyConsent,
      });
      setForm(initialForm);
      setState("success");
    } catch (requestError) {
      setState("error");
      setError(requestError.message || "We could not send your message. Please try again.");
    }
  };

  return <div className="min-h-screen bg-[#F0F5F7] font-sans text-[#162623]"><PublicNavbar /><main><section className="bg-[#295255] px-6 py-20 text-white lg:px-10 lg:py-24"><div className="mx-auto max-w-3xl text-center"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#F0F5F7]/75">Contact Kaizentrix Care</p><h1 className="mt-4 text-4xl font-bold text-white sm:text-5xl">How can we help?</h1><p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[#F0F5F7]/85">Send us a question about care, appointments, or the patient experience.</p></div></section><section className="mx-auto max-w-3xl px-6 py-16 lg:px-10 lg:py-20"><form onSubmit={submit} className="rounded-3xl border border-[rgba(87,120,119,0.15)] bg-white p-6 shadow-[0_10px_30px_-8px_rgba(22,38,35,0.12)] sm:p-8"><div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-medium text-[#162623]">Name<input required name="name" value={form.name} onChange={update} className="mt-2 w-full rounded-xl border border-[#577877]/25 px-4 py-3 text-sm focus:border-[#295255] focus:outline-none focus:ring-2 focus:ring-[#295255]/20" /></label><label className="text-sm font-medium text-[#162623]">Email<input required type="email" name="email" value={form.email} onChange={update} className="mt-2 w-full rounded-xl border border-[#577877]/25 px-4 py-3 text-sm focus:border-[#295255] focus:outline-none focus:ring-2 focus:ring-[#295255]/20" /></label><label className="text-sm font-medium text-[#162623]">Phone <span className="font-normal text-[#577877]">(optional)</span><input name="phone" value={form.phone} onChange={update} className="mt-2 w-full rounded-xl border border-[#577877]/25 px-4 py-3 text-sm focus:border-[#295255] focus:outline-none focus:ring-2 focus:ring-[#295255]/20" /></label><label className="text-sm font-medium text-[#162623]">Inquiry subject<select required name="subject" value={form.subject} onChange={update} className="mt-2 w-full rounded-xl border border-[#577877]/25 bg-white px-4 py-3 text-sm focus:border-[#295255] focus:outline-none focus:ring-2 focus:ring-[#295255]/20"><option value="">Choose a subject</option><option>Finding care</option><option>Appointments</option><option>Patient account</option><option>Technical help</option><option>Other</option></select></label></div><label className="mt-5 block text-sm font-medium text-[#162623]">Message<textarea required name="message" value={form.message} onChange={update} rows="6" className="mt-2 w-full resize-y rounded-xl border border-[#577877]/25 px-4 py-3 text-sm focus:border-[#295255] focus:outline-none focus:ring-2 focus:ring-[#295255]/20" /></label><label className="mt-5 flex items-start gap-3 text-xs leading-relaxed text-[#577877]"><input required type="checkbox" name="privacyConsent" checked={form.privacyConsent} onChange={update} className="mt-0.5 h-4 w-4 accent-[#295255]" />I agree that Kaizentrix Care may use these details to respond to my inquiry.</label>{error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}{state === "success" && <p role="status" className="mt-4 text-sm font-medium text-[#295255]">Your inquiry was sent successfully.</p>}<button disabled={state === "loading"} className="mt-6 inline-flex rounded-xl bg-[#295255] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#1F3F41] disabled:cursor-not-allowed disabled:opacity-60">{state === "loading" ? "Sending…" : "Send inquiry"}</button></form></section></main><footer className="border-t border-[#577877]/20 bg-white px-6 py-8 text-xs text-[#577877] lg:px-10"><div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row"><p>© 2026 Kaizentrix Care · Patient Portal. All rights reserved.</p><div className="flex gap-6"><span>Privacy Policy</span><span>Terms of Use</span></div></div></footer></div>;
}
