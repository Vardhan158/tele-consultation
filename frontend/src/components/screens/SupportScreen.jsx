import { useState, useEffect } from 'react';
import { supportApi } from '../../lib/api';

const initialFaqs = [
  {
    id: 'faq-1',
    category: 'video',
    question: 'How do I join my video appointment?',
    answer:
      'Open My appointments and select your visit. The waiting room opens 10 minutes before your scheduled time. Allow camera and microphone access, test your setup, then check in.',
    defaultOpen: true,
  },
  {
    id: 'faq-2',
    category: 'appointments',
    question: 'Can I reschedule my appointment?',
    answer:
      'Yes. Go to My appointments, select your upcoming visit, and choose "Reschedule". You can select a new date and time with your doctor without incurring additional fees.',
    defaultOpen: false,
  },
  {
    id: 'faq-3',
    category: 'payments',
    question: 'When will I receive my refund?',
    answer:
      'Refunds for cancelled appointments are initiated immediately and typically post to your original payment method within 5–10 business days.',
    defaultOpen: false,
  },
  {
    id: 'faq-4',
    category: 'records',
    question: 'How do I share a medical record?',
    answer:
      'You can upload PDFs or images up to 10 MB directly under Medical records. Your care team can also review and attach records during consultations.',
    defaultOpen: false,
  },
  {
    id: 'faq-5',
    category: 'privacy',
    question: 'Who can see my health information?',
    answer:
      'Only you and your licensed care providers have access to your clinical documents and consultation records. You can review and adjust permissions under Consent management.',
    defaultOpen: false,
  },
];

export default function SupportScreen({ onNavigate }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [openFaqIds, setOpenFaqIds] = useState(['faq-1']);
  const [selectedCategory, setSelectedCategory] = useState(null);

  // Ticket Modal State
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketCategory, setTicketCategory] = useState('video_connection');
  const [ticketSubject, setTicketSubject] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketSuccess, setTicketSuccess] = useState(false);
  const [tickets, setTickets] = useState([]);

  useEffect(() => {
    supportApi.tickets().then((items) => setTickets(Array.isArray(items) ? items : [])).catch(() => setTickets([]));
  }, [ticketSuccess]);

  const toggleFaq = (id) => {
    setOpenFaqIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleCategoryClick = (cat, targetTab = null) => {
    if (selectedCategory === cat && targetTab && onNavigate) {
      onNavigate(targetTab);
      return;
    }
    if (selectedCategory === cat) {
      setSelectedCategory(null);
    } else {
      setSelectedCategory(cat);
      // Ensure the relevant FAQs are expanded
      const matching = [];
      if (matching.length > 0) {
        setOpenFaqIds((prev) => Array.from(new Set([...prev, matching[0].id])));
      }
    }
  };

  const filteredFaqs = initialFaqs.filter((faq) => {
    if (selectedCategory && faq.category !== selectedCategory) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      faq.question.toLowerCase().includes(q) ||
      faq.answer.toLowerCase().includes(q)
    );
  });

  const handleSubmitTicket = async (e) => {
    e.preventDefault();
    if (!ticketDescription.trim()) return;

    try {
      await supportApi.createTicket({
        category: ticketCategory,
        description: `${ticketSubject ? `${ticketSubject.trim()}\n` : ''}${ticketDescription.trim()}`,
      });
      setTicketSuccess(true);
    } catch (error) {
      setTicketSuccess(false);
      setTicketDescription(error.message || 'Unable to create support request.');
      return;
    }

    setTimeout(() => {
      setTicketSuccess(false);
      setShowTicketModal(false);
      setTicketSubject('');
      setTicketDescription('');
    }, 2000);
  };

  return (
    <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* Page Header matching Screenshot 1:1 */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#162623] tracking-tight">
            A little help goes a long way
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#577877]">
            Find answers, solve a technical issue, or reach the patient support team.
          </p>
        </div>

        {tickets.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#577877]/15 p-6 space-y-3">
            <h2 className="text-base font-bold text-[#162623]">Your support requests</h2>
            {tickets.map((ticket) => (
              <div key={ticket.id} className="flex items-center justify-between gap-3 border-t border-[#577877]/10 pt-3 text-xs">
                <div><p className="font-semibold text-[#162623]">{ticket.category.replaceAll('_', ' ')}</p><p className="text-[#577877]">{ticket.id}</p></div>
                <span className="rounded-full bg-[#E8F3F3] px-3 py-1 font-semibold text-[#295255]">{ticket.status}</span>
              </div>
            ))}
          </div>
        )}

        {/* Dark Hero Search Box matching Screenshot */}
        <div className="rounded-2xl p-6 sm:p-8 bg-[#182830] text-white space-y-3.5 shadow-md">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            How can we support you?
          </h2>

          <div className="space-y-1.5 pt-1">
            <label className="text-xs text-white/80 block font-medium">
              Search the help center
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-[#577877]">
                <span className="material-symbols-outlined text-lg">search</span>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='Try "reschedule" or "join a video visit"'
                className="w-full bg-white text-[#162623] placeholder-[#577877]/70 text-xs sm:text-sm rounded-xl py-3 pl-11 pr-4 focus:outline-none focus:ring-2 focus:ring-[#295255] transition shadow-sm"
              />
            </div>
          </div>
        </div>

        {/* Three Category Cards matching Screenshot 1:1 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Appointments */}
          <div
            onClick={() => handleCategoryClick('appointments', 'appointments')}
            className={`bg-white rounded-2xl border p-6 shadow-[0_4px_20px_-2px_rgba(22,38,35,0.05)] space-y-2 cursor-pointer transition ${
              selectedCategory === 'appointments'
                ? 'border-[#295255] ring-2 ring-[#295255]/20'
                : 'border-[#577877]/15 hover:border-[#295255]/40'
            }`}
          >
            <span className="material-symbols-outlined !text-[#295255] text-2xl block">
              calendar_month
            </span>
            <h3 className="text-sm sm:text-base font-bold text-[#162623] pt-1">
              Appointments
            </h3>
            <p className="text-xs text-[#577877]">
              Booking, changes &amp; cancellations
            </p>
            <div className="pt-2">
              <span className="text-xs font-semibold text-[#295255] hover:underline inline-flex items-center gap-1">
                Explore answers →
              </span>
            </div>
          </div>

          {/* Card 2: Video visits */}
          <div
            onClick={() => handleCategoryClick('video', 'appointments')}
            className={`bg-white rounded-2xl border p-6 shadow-[0_4px_20px_-2px_rgba(22,38,35,0.05)] space-y-2 cursor-pointer transition ${
              selectedCategory === 'video'
                ? 'border-[#295255] ring-2 ring-[#295255]/20'
                : 'border-[#577877]/15 hover:border-[#295255]/40'
            }`}
          >
            <span className="material-symbols-outlined !text-[#295255] text-2xl block">
              videocam
            </span>
            <h3 className="text-sm sm:text-base font-bold text-[#162623] pt-1">
              Video visits
            </h3>
            <p className="text-xs text-[#577877]">
              Devices, connection &amp; joining
            </p>
            <div className="pt-2">
              <span className="text-xs font-semibold text-[#295255] hover:underline inline-flex items-center gap-1">
                Explore answers →
              </span>
            </div>
          </div>

          {/* Card 3: Payments */}
          <div
            onClick={() => handleCategoryClick('payments', 'payments')}
            className={`bg-white rounded-2xl border p-6 shadow-[0_4px_20px_-2px_rgba(22,38,35,0.05)] space-y-2 cursor-pointer transition ${
              selectedCategory === 'payments'
                ? 'border-[#295255] ring-2 ring-[#295255]/20'
                : 'border-[#577877]/15 hover:border-[#295255]/40'
            }`}
          >
            <span className="material-symbols-outlined !text-[#295255] text-2xl block">
              credit_card
            </span>
            <h3 className="text-sm sm:text-base font-bold text-[#162623] pt-1">
              Payments
            </h3>
            <p className="text-xs text-[#577877]">
              Receipts, charges &amp; refunds
            </p>
            <div className="pt-2">
              <span className="text-xs font-semibold text-[#295255] hover:underline inline-flex items-center gap-1">
                Explore answers →
              </span>
            </div>
          </div>
        </div>

        {/* Main 2-Column Section matching Screenshot */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* Left Column (8 cols): Frequently Asked Questions */}
          <div className="lg:col-span-8 bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-[0_4px_20px_-2px_rgba(22,38,35,0.05)] space-y-4">
            <div className="flex items-center justify-between pb-1">
              <h2 className="text-base sm:text-lg font-bold text-[#162623]">
                Frequently asked questions
              </h2>
              {selectedCategory && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory(null)}
                  className="text-xs text-[#295255] font-semibold hover:underline cursor-pointer"
                >
                  Clear filter
                </button>
              )}
            </div>

            <div className="divide-y divide-[#577877]/10">
              {filteredFaqs.length === 0 ? (
                <div className="py-8 text-center text-[#577877]">
                  <p className="text-xs">No questions matched &quot;{searchQuery}&quot;.</p>
                </div>
              ) : (
                filteredFaqs.map((faq) => {
                  const isOpen = openFaqIds.includes(faq.id);
                  return (
                    <div key={faq.id} className="py-4 first:pt-2 last:pb-2">
                      <button
                        type="button"
                        onClick={() => toggleFaq(faq.id)}
                        className="w-full flex items-center justify-between gap-4 text-left cursor-pointer group"
                      >
                        <span className="text-xs sm:text-sm font-bold text-[#162623] group-hover:text-[#295255] transition">
                          {faq.question}
                        </span>
                        <span className="material-symbols-outlined text-[#577877] text-lg shrink-0">
                          {isOpen ? 'remove' : 'add'}
                        </span>
                      </button>

                      {isOpen && (
                        <p className="text-xs text-[#577877] leading-relaxed pt-2.5 animate-in fade-in">
                          {faq.answer}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column (4 cols): Talk to real person & Need medical advice */}
          <div className="lg:col-span-4 space-y-6">

            {/* CARD 1: Talk to a real person matching Screenshot 1:1 */}
            <div className="bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-[0_4px_20px_-2px_rgba(22,38,35,0.05)] space-y-4">
              <h2 className="text-base font-bold text-[#162623]">
                Talk to a real person
              </h2>

              <div>
                <span className="bg-[#E6F4EA] text-[#137333] text-xs font-medium px-3 py-1 rounded-full inline-block">
                  Support is available
                </span>
              </div>

              <p className="text-xs text-[#577877] leading-relaxed">
                Mon–Fri, 8:00 AM–6:00 PM PT. We usually reply within 1 business day.
              </p>

              {/* Blue Start Support Request Button */}
              <button
                type="button"
                onClick={() => setShowTicketModal(true)}
                className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 shadow-sm transition text-xs sm:text-sm cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">chat_bubble</span>
                <span>Start a support request</span>
              </button>

              {/* Contact information details */}
              <div className="space-y-1 pt-2">
                <p className="text-xs font-semibold text-[#162623]">
                  support@kaizentrix.example
                </p>
                <p className="text-xs font-semibold text-[#162623]">
                  (415) 555-0100
                </p>
              </div>

              <p className="text-[11px] text-[#577877] leading-relaxed pt-1">
                For account or technical help only. Do not include sensitive clinical details.
              </p>
            </div>

            {/* CARD 2: Need medical advice? amber card matching Screenshot */}
            <div className="bg-[#FEF3C7]/40 border border-[#FDE68A] rounded-2xl p-4 sm:p-5 flex items-start gap-3 shadow-2xs">
              <span className="material-symbols-outlined !text-[#92400E] text-lg shrink-0 mt-0.5">
                info
              </span>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-[#92400E]">
                  Need medical advice?
                </h3>
                <p className="text-xs text-[#92400E]/90 mt-1 leading-relaxed">
                  Contact your care team for clinical questions. In an emergency, call your local emergency number.
                </p>
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* Support Request Modal */}
      {showTicketModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-2xl border border-[#577877]/20 shadow-xl p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#2563EB]/10 flex items-center justify-center text-[#2563EB]">
                  <span className="material-symbols-outlined text-lg">support_agent</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#162623]">New support request</h3>
                  <p className="text-xs text-[#577877]">We reply within 1 business day</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTicketModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#577877] hover:bg-[#F0F5F7] transition cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {ticketSuccess ? (
              <div className="p-4 bg-[#E6F4EA] border border-[#137333]/20 rounded-xl text-center space-y-2">
                <span className="material-symbols-outlined text-3xl text-[#137333]">check_circle</span>
                <h4 className="text-sm font-bold text-[#137333]">Ticket submitted</h4>
                <p className="text-xs text-[#577877]">
                  Your request has been routed to patient assistance. A confirmation has been sent to your email.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmitTicket} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-[#162623] block mb-1">
                    Category
                  </label>
                  <select
                    value={ticketCategory}
                    onChange={(e) => setTicketCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] bg-white focus:outline-none focus:border-[#295255]"
                  >
                    <option value="video_connection">Video &amp; audio connection</option>
                    <option value="appointments">Appointment booking &amp; rescheduling</option>
                    <option value="billing">Payments &amp; refunds</option>
                    <option value="records">Medical records access</option>
                    <option value="other">General portal assistance</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#162623] block mb-1">
                    Subject
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Brief description of the issue"
                    value={ticketSubject}
                    onChange={(e) => setTicketSubject(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] focus:outline-none focus:border-[#295255]"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#162623] block mb-1">
                    How can we help?
                  </label>
                  <textarea
                    rows={4}
                    required
                    placeholder="Describe what happened or what assistance you need..."
                    value={ticketDescription}
                    onChange={(e) => setTicketDescription(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] focus:outline-none focus:border-[#295255] resize-none"
                  />
                </div>

                <p className="text-[11px] text-[#577877]">
                  Please do not include sensitive health details or emergency symptoms here.
                </p>

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#577877]/15">
                  <button
                    type="button"
                    onClick={() => setShowTicketModal(false)}
                    className="px-4 py-2 border border-[#577877]/30 rounded-xl text-xs font-semibold text-[#162623] hover:bg-[#F0F5F7]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-[#2563EB] hover:bg-[#1D4ED8] text-white px-5 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Submit request
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
