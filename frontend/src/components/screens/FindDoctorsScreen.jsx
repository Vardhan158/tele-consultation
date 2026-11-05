import { useState, useMemo, useEffect } from 'react';
import { patientApi } from '../../lib/api';

//
/* const defaultDoctorsList = [
  {
    id: '00000000-0000-0000-0000-000000000201',
    name: 'Dr. Sarah Chen',
    fullName: 'Dr. Sarah Chen, MD',
    specialty: 'Internal medicine',
    subSpecialty: 'Primary & preventive care',
    badge: 'Your care team',
    badgeText: 'Part of your care team',
    badgeType: 'care-team',
    experience: '12 years of experience · California · English & Mandarin',
    experienceShort: '12 years of experience · English & Mandarin',
    rating: 4.9,
    reviewsCount: 128,
    fee: 85,
    feeDisplay: '$85',
    feeVideoVisit: '$85 per video visit',
    duration: '30-minute appointment',
    durationShort: '30 minutes',
    nextSlot: 'Thu, Nov 12 · 2:30 PM',
    nextSlotDate: 'Thu, November 12',
    nextSlotTime: '2:30 PM · Pacific Time',
    nextSlotIso: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
    image: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=400',
    initials: 'SC',
    availableToday: true,
    languages: ['English', 'Mandarin'],
    clinic: 'Kaizentrix Medical Center',
    practice: 'Kaizentrix Medical Center · 2014–present',
    education: 'MD · University of California, San Francisco',
    residency: 'Internal Medicine · UCSF Medical Center',
    quote:
      '“I believe good care begins with understanding your everyday life. Together, we’ll build a practical plan that fits your goals and helps you feel confident about your health.”',
    bio: 'Dr. Chen supports adults with preventive care, blood pressure management, and long-term wellness. She takes a collaborative, evidence-informed approach to each appointment.',
    areasOfFocus: ['Preventive care', 'Hypertension', 'Chronic conditions'],
    patientReviews: [
      { author: 'Emma M.', date: 'Oct 14, 2026', rating: 5, text: 'Dr. Chen is compassionate and thorough. She helped me get my blood pressure under control without feeling overwhelmed.' },
      { author: 'Robert T.', date: 'Sep 28, 2026', rating: 5, text: 'Best teleconsultation experience. Very attentive to lab history and lifestyle factors.' },
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000202',
    name: 'Dr. Michael Patel',
    fullName: 'Dr. Michael Patel, MD',
    specialty: 'Internal medicine',
    subSpecialty: 'Adult primary care & metabolic health',
    badge: 'Available today',
    badgeText: 'Available today',
    badgeType: 'available-today',
    experience: '10 years of experience · California · English & Spanish',
    experienceShort: '10 years of experience · English & Spanish',
    rating: 4.8,
    reviewsCount: 96,
    fee: 95,
    feeDisplay: '$95',
    feeVideoVisit: '$95 per video visit',
    duration: '30-minute appointment',
    durationShort: '30 minutes',
    nextSlot: 'Today · 4:00 PM',
    nextSlotDate: 'Today, November 4',
    nextSlotTime: '4:00 PM · Pacific Time',
    nextSlotIso: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    image: null,
    initials: 'MP',
    availableToday: true,
    languages: ['English', 'Spanish', 'Hindi'],
    clinic: 'Bay Area Health',
    practice: 'Bay Area Health · 2016–present',
    education: 'MD · Stanford University School of Medicine',
    residency: 'Internal Medicine · Stanford Health Care',
    quote:
      '“Listening actively and tailoring diagnostics to your routine is the key to lasting metabolic wellness.”',
    bio: 'Dedicated primary care internist with extensive clinical background in managing adult diabetes, cardiovascular risk reduction, and acute episodic consultations.',
    areasOfFocus: ['Type 2 Diabetes', 'Metabolic Health', 'Preventive Screenings'],
    patientReviews: [
      { author: 'Marcus D.', date: 'Oct 20, 2026', rating: 5, text: 'Exceptional doctor who takes time to explain blood test results thoroughly.' },
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000203',
    name: 'Dr. Olivia Brooks',
    fullName: 'Dr. Olivia Brooks, MD',
    specialty: 'Family medicine',
    subSpecialty: 'Whole-family health & wellness',
    badge: 'Accepting patients',
    badgeText: 'Accepting patients',
    badgeType: 'accepting',
    experience: '14 years of experience · California · English & Spanish',
    experienceShort: '14 years of experience · English & Spanish',
    rating: 4.9,
    reviewsCount: 164,
    fee: 75,
    feeDisplay: '$75',
    feeVideoVisit: '$75 per video visit',
    duration: '30-minute appointment',
    durationShort: '30 minutes',
    nextSlot: 'Tomorrow · 9:00 AM',
    nextSlotDate: 'Tomorrow, November 5',
    nextSlotTime: '9:00 AM · Pacific Time',
    nextSlotIso: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    image: null,
    initials: 'OB',
    availableToday: false,
    languages: ['English', 'Spanish'],
    clinic: 'Pacific Skin Care',
    practice: 'Pacific Skin Care · 2012–present',
    education: 'MD · University of Washington School of Medicine',
    residency: 'Family Medicine · UCLA Medical Center',
    quote:
      '“Healthcare should feel accessible and collaborative for every family member across every age.”',
    bio: 'Family practitioner providing compassionate, patient-centered guidance for families, adolescent health, routine health screenings, and wellness plans.',
    areasOfFocus: ['Family Health', 'Preventive Wellness', 'Immunizations'],
    patientReviews: [
      { author: 'Sarah K.', date: 'Oct 02, 2026', rating: 5, text: 'Wonderful, empathetic physician. Very prompt and detailed consultation notes.' },
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000204',
    name: 'Dr. Avery Wilson',
    fullName: 'Dr. Avery Wilson, MD',
    specialty: 'Dermatology',
    subSpecialty: 'Clinical & Cosmetic Dermatology',
    badge: 'Accepting patients',
    badgeText: 'Accepting patients',
    badgeType: 'accepting',
    experience: '8 years of experience · California · English',
    experienceShort: '8 years of experience · English',
    rating: 4.7,
    reviewsCount: 78,
    fee: 65,
    feeDisplay: '$65',
    feeVideoVisit: '$65 per video visit',
    duration: '30-minute appointment',
    durationShort: '30 minutes',
    nextSlot: 'Fri, Nov 6 · 11:00 AM',
    nextSlotDate: 'Fri, November 6',
    nextSlotTime: '11:00 AM · Pacific Time',
    nextSlotIso: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    image: null,
    initials: 'AW',
    availableToday: false,
    languages: ['English'],
    clinic: 'San Francisco Health Hub',
    practice: 'San Francisco Health Hub · 2018–present',
    education: 'MD · Harvard Medical School',
    residency: 'Dermatology · UCSF',
    quote: '“Healthy skin is a reflection of overall wellness. I provide clear, evidence-based dermatological care.”',
    bio: 'Specialist in dermatological health, skin lesions, routine screenings, and telehealth guidance.',
    areasOfFocus: ['Dermatology', 'Skin Health', 'Preventive Care'],
    patientReviews: [
      { author: 'Jennifer L.', date: 'Oct 11, 2026', rating: 5, text: 'Very thorough and explained my treatment clearly.' },
    ],
  },
];
    nextSlot: 'Tomorrow · 9:00 AM',
    nextSlotDate: 'Tomorrow, November 5',
    nextSlotTime: '9:00 AM · Pacific Time',
    nextSlotIso: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    image: null,
    initials: 'OB',
    availableToday: false,
    languages: ['English', 'Spanish'],
    clinic: 'Pacific Family Medicine Associates',
    practice: 'Pacific Family Practice · 2012–present',
    education: 'MD · University of Washington School of Medicine',
    residency: 'Family Medicine · UCLA Medical Center',
    quote:
      '“Healthcare should feel accessible and collaborative for every family member across every age.”',
    bio: 'Family practitioner providing compassionate, patient-centered guidance for families, adolescent health, routine health screenings, and wellness plans.',
    areasOfFocus: ['Family Health', 'Preventive Wellness', 'Immunizations'],
    patientReviews: [
      { author: 'Sarah K.', date: 'Oct 02, 2026', rating: 5, text: 'Wonderful, empathetic physician. Very prompt and detailed consultation notes.' },
    ],
  },
];

*/

// November 2026 Calendar Grid (Monday start: Oct 26 to Dec 6)
const calendarMatrix = [
  // Previous month (October)
  { day: 26, isCurrentMonth: false },
  { day: 27, isCurrentMonth: false },
  { day: 28, isCurrentMonth: false },
  { day: 29, isCurrentMonth: false },
  { day: 30, isCurrentMonth: false },
  { day: 31, isCurrentMonth: false },
  // Current month (November 2026)
  { day: 1, isCurrentMonth: true },
  { day: 2, isCurrentMonth: true },
  { day: 3, isCurrentMonth: true },
  { day: 4, isCurrentMonth: true },
  { day: 5, isCurrentMonth: true },
  { day: 6, isCurrentMonth: true },
  { day: 7, isCurrentMonth: true },
  { day: 8, isCurrentMonth: true },
  { day: 9, isCurrentMonth: true },
  { day: 10, isCurrentMonth: true },
  { day: 11, isCurrentMonth: true },
  { day: 12, isCurrentMonth: true }, // Default selected in Mockup
  { day: 13, isCurrentMonth: true },
  { day: 14, isCurrentMonth: true },
  { day: 15, isCurrentMonth: true },
  { day: 16, isCurrentMonth: true },
  { day: 17, isCurrentMonth: true },
  { day: 18, isCurrentMonth: true },
  { day: 19, isCurrentMonth: true },
  { day: 20, isCurrentMonth: true },
  { day: 21, isCurrentMonth: true },
  { day: 22, isCurrentMonth: true },
  { day: 23, isCurrentMonth: true },
  { day: 24, isCurrentMonth: true },
  { day: 25, isCurrentMonth: true },
  { day: 26, isCurrentMonth: true },
  { day: 27, isCurrentMonth: true },
  { day: 28, isCurrentMonth: true },
  { day: 29, isCurrentMonth: true },
  { day: 30, isCurrentMonth: true },
  // Next month (December)
  { day: 1, isCurrentMonth: false },
  { day: 2, isCurrentMonth: false },
  { day: 3, isCurrentMonth: false },
  { day: 4, isCurrentMonth: false },
  { day: 5, isCurrentMonth: false },
  { day: 6, isCurrentMonth: false },
];

const availableSlots = [
  { time: '1:00 PM', available: false },
  { time: '1:30 PM', available: true },
  { time: '2:00 PM', available: true },
  { time: '2:30 PM', available: true },
  { time: '3:00 PM', available: true },
  { time: '3:30 PM', available: true },
];

function getSlotEndTime(slotTime) {
  switch (slotTime) {
    case '1:00 PM': return '1:30 PM';
    case '1:30 PM': return '2:00 PM';
    case '2:00 PM': return '2:30 PM';
    case '2:30 PM': return '3:00 PM';
    case '3:00 PM': return '3:30 PM';
    case '3:30 PM': return '4:00 PM';
    default: return '3:00 PM';
  }
}

export default function FindDoctorsScreen({ onNavigate }) {
  const [doctors, setDoctors] = useState([]);

  useEffect(() => {
    let cancelled = false;
    patientApi.doctors().then(async (items) => {
      if (!Array.isArray(items)) return;
      const mapped = await Promise.all(items.map(async (doctor) => {
        const slots = await patientApi.availability(doctor.id).catch(() => []);
        const nextSlot = Array.isArray(slots) && slots.length ? slots[0] : null;
        return {
          ...doctor,
          name: doctor.full_name,
          fullName: doctor.full_name,
          clinic: doctor.clinic_name,
          languages: doctor.supported_languages || [],
          fee: doctor.fee_paise / 100,
          feeDisplay: `${(doctor.fee_paise / 100).toFixed(2)}`,
          feeVideoVisit: `${(doctor.fee_paise / 100).toFixed(2)} per video visit`,
          availableToday: Boolean(nextSlot && new Date(nextSlot.starts_at).toDateString() === new Date().toDateString()),
          nextSlot,
          nextSlotLabel: nextSlot ? new Date(nextSlot.starts_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null,
          experienceShort: doctor.registration_number ? `Registration ${doctor.registration_number}` : 'Verified clinic doctor',
          badge: nextSlot ? 'Available' : 'No slots available',
          badgeType: nextSlot ? 'available-today' : 'accepting',
          durationShort: '30 minutes',
          initials: doctor.full_name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
        };
      }));
      if (!cancelled) setDoctors(mapped);
    }).catch(() => { if (!cancelled) setDoctors([]); });
    return () => { cancelled = true; };
  }, []);

  // Navigation: Directory List View | "Meet your doctor" Profile View | "Book appointment" View
  const [selectedDoctorView, setSelectedDoctorView] = useState(null);
  const [doctorProfileTab, setDoctorProfileTab] = useState('overview'); // 'overview' | 'experience' | 'reviews'

  // Search inputs matching screenshot
  const [searchQuery, setSearchQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');

  // Filters matching screenshot defaults
  const [selectedSpecialties, setSelectedSpecialties] = useState([]);
  const [availabilityFilter, setAvailabilityFilter] = useState('Any time');
  const [priceRange, setPriceRange] = useState('$50 – $150');
  const [selectedLanguages, setSelectedLanguages] = useState([]);
  const [sortOption, setSortOption] = useState('Recommended');
  const [page, setPage] = useState(1);

  // Booking Flow State (Matches Screenshot 5)
  const [bookingDoctor, setBookingDoctor] = useState(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [selectedDate, setSelectedDate] = useState({
    day: 12,
    monthName: 'November',
    year: 2026,
    formatted: 'Thu, November 12',
    displayShort: 'Nov 12, 2026',
  });
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('2:30 PM');
  const [appointmentType, setAppointmentType] = useState('Follow-up consultation');
  const [visitFormat, setVisitFormat] = useState('Video appointment');
  const [visitReason, setVisitReason] = useState('Blood pressure follow-up and medication review.');
  const [doctorNotes, setDoctorNotes] = useState("I've been logging my readings since our last visit.");
  const [hasAttachment, setHasAttachment] = useState(true);
  const [policyAgreed, setPolicyAgreed] = useState(true);
  const [consentGranted, setConsentGranted] = useState(true);

  const toggleSpecialty = (spec) => {
    setSelectedSpecialties((prev) =>
      prev.includes(spec) ? prev.filter((s) => s !== spec) : [...prev, spec]
    );
  };

  const toggleLanguage = (lang) => {
    setSelectedLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setSelectedSpecialties([]);
    setAvailabilityFilter('Any time');
    setSelectedLanguages([]);
  };

  const startBooking = (doctor) => {
    setBookingDoctor(doctor);
    setBookingSuccess(false);
    if (doctor.nextSlot) {
      const slotDate = new Date(doctor.nextSlot.starts_at);
      setSelectedDate({
        day: slotDate.getDate(),
        monthName: slotDate.toLocaleDateString(undefined, { month: 'long' }),
        year: slotDate.getFullYear(),
        formatted: slotDate.toLocaleDateString(undefined, { weekday: 'short', month: 'long', day: 'numeric' }),
        displayShort: slotDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
      });
      setSelectedTimeSlot(slotDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    }
  };

  const filteredDoctors = useMemo(() => {
    return doctors.filter((doc) => {
      if (
        selectedSpecialties.length > 0 &&
        !selectedSpecialties.includes(doc.specialty)
      ) {
        return false;
      }

      if (availabilityFilter === 'Available today' && !doc.availableToday) {
        return false;
      }

      if (
        selectedLanguages.length > 0 &&
        !(doc.languages || []).some((lang) => selectedLanguages.includes(lang))
      ) {
        return false;
      }

      if (searchQuery.trim() && searchQuery !== 'Internal medicine or family medicine') {
        const q = searchQuery.toLowerCase();
        const matchesName = doc.name.toLowerCase().includes(q);
        const matchesSpec = doc.specialty.toLowerCase().includes(q);
        const matchesClinic = (doc.clinic || '').toLowerCase().includes(q);
        if (!matchesName && !matchesSpec && !matchesClinic) return false;
      }

      if (locationQuery.trim() && !(doc.clinic || '').toLowerCase().includes(locationQuery.trim().toLowerCase())) return false;
      if (priceRange === '$0 – $50' && doc.fee > 50) return false;
      if (priceRange === '$50 – $100' && (doc.fee < 50 || doc.fee > 100)) return false;
      if (priceRange === '$100+' && doc.fee < 100) return false;

      return true;
    });
  }, [doctors, selectedSpecialties, availabilityFilter, selectedLanguages, searchQuery, locationQuery, priceRange]);

  const sortedDoctors = useMemo(() => [...filteredDoctors].sort((a, b) => {
    if (sortOption === 'Fee: Low to high') return a.fee - b.fee;
    if (sortOption === 'Fee: High to low') return b.fee - a.fee;
    return a.full_name.localeCompare(b.full_name);
  }), [filteredDoctors, sortOption]);
  const pageSize = 6;
  const pageCount = Math.max(1, Math.ceil(sortedDoctors.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleDoctors = sortedDoctors.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState('');

  const handleConfirmBooking = async () => {
    if (!bookingDoctor) return;
    setBookingLoading(true);
    setBookingError('');
    try {
      const parts = selectedTimeSlot.replace(/ (AM|PM)/, '').split(':');
      let hour = parseInt(parts[0], 10);
      if (selectedTimeSlot.includes('PM') && hour !== 12) hour += 12;
      if (selectedTimeSlot.includes('AM') && hour === 12) hour = 0;
      const minute = parts[1] || '00';
      const monthIndex = new Date(`${selectedDate.monthName} 1, ${selectedDate.year}`).getMonth();
      const slotIso = new Date(selectedDate.year, monthIndex, selectedDate.day, hour, Number(minute), 0).toISOString();

      const booked = await patientApi.bookAppointment({
        doctor_id: bookingDoctor.id,
        starts_at: slotIso,
        duration_minutes: 30,
        reason: `${appointmentType}: ${visitReason}`,
      });

      onNavigate('payments', {
        view: 'checkout',
        appointment: {
          id: booked.id,
          doctor: bookingDoctor,
          dateFormatted: selectedDate.formatted ? `${selectedDate.formatted}, ${selectedDate.year}` : 'Thursday, November 12, 2026',
          dateShort: selectedDate.displayShort || 'Nov 12, 2026',
          timeFormatted: `${selectedTimeSlot}–${getSlotEndTime(selectedTimeSlot)} · Pacific Time`,
          timeRange: `${selectedTimeSlot} PT`,
          patient: 'Emma Mitchell',
          visitFormatted: `${visitFormat.includes('Video') ? 'Video' : 'Audio'} · ${appointmentType}`,
          visitType: `${visitFormat.includes('Video') ? 'Video' : 'Audio'} · Follow-up · 30 minutes`,
          fee: `${bookingDoctor.feeDisplay}.00`,
          feeNum: bookingDoctor.fee || 85,
          cardLast4: '4242',
        },
      });
    } catch (err) {
      setBookingError(err.message || 'Unable to book appointment');
    } finally {
      setBookingLoading(false);
    }
  };

  // ========================================================
  // VIEW 3: "BOOK APPOINTMENT" VIEW (Matches User Screenshot 5)
  // ========================================================
  if (bookingDoctor) {
    const doc = bookingDoctor;

    return (
      <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
        <div className="mx-auto max-w-7xl space-y-6">

          {/* Top navigation row */}
          <div className="flex items-center justify-between pb-1">
            <button
              type="button"
              onClick={() => {
                setBookingDoctor(null);
                setBookingSuccess(false);
              }}
              className="btn-secondary !px-3.5 !py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-2xs"
            >
              <span className="material-symbols-outlined !text-[#295255] text-sm">arrow_back</span>
              <span>{selectedDoctorView ? 'Back to doctor profile' : 'Back to doctor search'}</span>
            </button>
            <span className="text-xs text-[#577877]">
              Booking with <strong className="text-[#162623]">{doc.name}</strong>
            </span>
          </div>

          {/* Heading and Subtitle matching Screenshot */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
              Let's make time for your health
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#577877]">
              Choose a time, tell us what you need, and review your appointment.
            </p>
          </div>

          {/* Stepper Progress Bar matching Screenshot */}
          <div className="flex flex-wrap items-center gap-6 sm:gap-10 pt-2 pb-1">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full bg-[#295255] text-white flex items-center justify-center text-xs font-bold shrink-0">
                <span className="material-symbols-outlined !text-white text-sm font-bold">check</span>
              </div>
              <span className="text-xs sm:text-sm font-semibold text-[#162623]">Date &amp; time</span>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full bg-[#295255] text-white flex items-center justify-center text-xs font-bold shrink-0">
                <span className="material-symbols-outlined !text-white text-sm font-bold">check</span>
              </div>
              <span className="text-xs sm:text-sm font-semibold text-[#162623]">Visit details</span>
            </div>

            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full bg-[#295255] text-white flex items-center justify-center text-xs font-bold shrink-0">
                3
              </div>
              <span className="text-xs sm:text-sm font-semibold text-[#295255]">Review &amp; confirm</span>
            </div>
          </div>

          {/* Two-Column Booking Layout matching Screenshot */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

            {/* Left Column: Card 1 (Calendar & Slots) + Card 2 (Visit Details) */}
            <div className="lg:col-span-8 space-y-6">

              {/* CARD 1: Choose your date & time */}
              <div className="care-card p-6 sm:p-7 space-y-5">
                <h2 className="text-base sm:text-lg font-bold text-[#162623]">
                  1. Choose your date &amp; time
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-1">

                  {/* Calendar Side */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-sm text-[#162623]">November 2026</h3>
                      <div className="flex items-center gap-2 text-[#577877]">
                        <button
                          type="button"
                          disabled={!doc.nextSlot}
                          className="p-1 hover:text-[#162623] rounded-lg transition"
                          aria-label="Previous month"
                        >
                          <span className="material-symbols-outlined text-base">chevron_left</span>
                        </button>
                        <button
                          type="button"
                          className="p-1 hover:text-[#162623] rounded-lg transition"
                          aria-label="Next month"
                        >
                          <span className="material-symbols-outlined text-base">chevron_right</span>
                        </button>
                      </div>
                    </div>

                    {/* Weekdays Header */}
                    <div className="grid grid-cols-7 text-center text-xs font-medium text-[#577877]">
                      {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, idx) => (
                        <span key={`weekday-${idx}`} className="py-1">
                          {day}
                        </span>
                      ))}
                    </div>

                    {/* Days Matrix */}
                    <div className="grid grid-cols-7 text-center gap-y-1 text-xs">
                      {calendarMatrix.map((item, idx) => {
                        const isSelected = item.isCurrentMonth && item.day === selectedDate.day;
                        return (
                          <div key={`cal-${idx}`} className="flex items-center justify-center py-1">
                            {item.isCurrentMonth ? (
                              <button
                                type="button"
                                onClick={() => {
                                  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                                  const dateObj = new Date(2026, 10, item.day);
                                  const dayName = daysOfWeek[dateObj.getDay()];
                                  setSelectedDate({
                                    day: item.day,
                                    monthName: 'November',
                                    year: 2026,
                                    formatted: `${dayName}, November ${item.day}`,
                                    displayShort: `Nov ${item.day}, 2026`,
                                  });
                                }}
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition font-medium ${
                                  isSelected
                                    ? 'bg-[#295255] text-white font-bold shadow-xs'
                                    : 'text-[#162623] hover:bg-[#E8F3F3]'
                                }`}
                              >
                                {item.day}
                              </button>
                            ) : (
                              <span className="w-8 h-8 flex items-center justify-center text-[#577877]/35">
                                {item.day}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Slots Side */}
                  <div className="space-y-3">
                    <div>
                      <span className="inline-block px-3.5 py-1 rounded-full bg-[#E8F3F3] text-[#295255] text-xs font-semibold">
                        {selectedDate.formatted}
                      </span>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-[#162623]">Afternoon · 6 slots</h4>
                      <p className="text-[11px] text-[#577877] mt-0.5">All times in Pacific Time (PT)</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      {availableSlots.map((slot) => {
                        if (!slot.available) {
                          return (
                            <div
                              key={slot.time}
                              className="py-3 px-3 rounded-xl border border-gray-200 bg-[#F0F5F7] text-center text-xs font-medium text-[#577877]/50 cursor-not-allowed select-none"
                            >
                              {slot.time}
                            </div>
                          );
                        }

                        const isSlotSelected = selectedTimeSlot === slot.time;
                        return (
                          <button
                            key={slot.time}
                            type="button"
                            onClick={() => setSelectedTimeSlot(slot.time)}
                            className={`py-3 px-3 rounded-xl text-center text-xs font-semibold transition cursor-pointer ${
                              isSlotSelected
                                ? 'border-2 border-[#295255] bg-[#E8F3F3] text-[#295255] font-bold shadow-xs'
                                : 'border border-[#577877]/25 bg-white text-[#162623] hover:border-[#295255]'
                            }`}
                          >
                            {slot.time}
                          </button>
                        );
                      })}
                    </div>

                    <p className="text-[11px] text-[#577877] pt-1">
                      Gray slots are no longer available.
                    </p>
                  </div>

                </div>
              </div>

              {/* CARD 2: Tell us about your visit */}
              <div className="care-card p-6 sm:p-7 space-y-4">
                <h2 className="text-base sm:text-lg font-bold text-[#162623]">
                  2. Tell us about your visit
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#162623] mb-1.5">
                      Appointment type
                    </label>
                    <div className="relative">
                      <select
                        value={appointmentType}
                        onChange={(e) => setAppointmentType(e.target.value)}
                        className="w-full appearance-none px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] font-medium focus:outline-none focus:border-[#295255] cursor-pointer pr-8"
                      >
                        <option value="Follow-up consultation">Follow-up consultation</option>
                        <option value="New patient consultation">New patient consultation</option>
                        <option value="Medication review">Medication review</option>
                        <option value="Routine wellness checkup">Routine wellness checkup</option>
                      </select>
                      <span className="material-symbols-outlined !text-[#577877] text-base absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                        expand_more
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#162623] mb-1.5">
                      Visit format
                    </label>
                    <div className="relative">
                      <select
                        value={visitFormat}
                        onChange={(e) => setVisitFormat(e.target.value)}
                        className="w-full appearance-none px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] font-medium focus:outline-none focus:border-[#295255] cursor-pointer pr-8"
                      >
                        <option value="Video appointment">Video appointment</option>
                        <option value="Audio consultation">Audio consultation</option>
                        <option value="In-person clinic visit">In-person clinic visit</option>
                      </select>
                      <span className="material-symbols-outlined !text-[#577877] text-base absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                        expand_more
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#162623] mb-1.5">
                    Reason for your visit
                  </label>
                  <input
                    type="text"
                    value={visitReason}
                    onChange={(e) => setVisitReason(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] focus:outline-none focus:border-[#295255]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#162623] mb-1.5">
                    Notes for {doc.name} (optional)
                  </label>
                  <input
                    type="text"
                    value={doctorNotes}
                    onChange={(e) => setDoctorNotes(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] focus:outline-none focus:border-[#295255]"
                  />
                  <p className="text-[11px] text-[#577877] mt-1.5">
                    Please don't use this form for urgent symptoms.
                  </p>
                </div>

                {/* Attached Document Row */}
                {hasAttachment ? (
                  <div className="border border-[#577877]/25 rounded-xl px-4 py-3 bg-white flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-[#295255] font-bold text-sm">✓</span>
                      <span className="font-semibold text-[#162623]">blood-pressure-log.pdf</span>
                      <span className="text-[#577877]">· 245 KB</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setHasAttachment(false)}
                      className="text-xs text-[#577877] hover:text-rose-600 font-medium transition cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setHasAttachment(true)}
                    className="border border-dashed border-[#577877]/35 rounded-xl px-4 py-3 bg-white flex items-center justify-center gap-2 mt-3 text-xs font-semibold text-[#295255] hover:bg-[#F0F5F7] transition cursor-pointer w-full"
                  >
                    <span className="material-symbols-outlined text-base">attach_file</span>
                    <span>Attach medical record or reading log (PDF, max 25MB)</span>
                  </button>
                )}

              </div>

            </div>

            {/* Right Column: Card 3 (Review & Confirm) */}
            <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-24">

              {/* CARD 3: Review your appointment */}
              <div className="care-card p-6 sm:p-7 space-y-4">
                <h3 className="text-base sm:text-lg font-bold text-[#162623]">
                  3. Review your appointment
                </h3>

                {/* Doctor Mini-Hero */}
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-full bg-[#E0F0EC] text-[#295255] font-bold text-sm flex items-center justify-center shrink-0">
                    {doc.initials}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-[#162623]">{doc.name}</h4>
                    <p className="text-xs font-medium text-[#295255]">{doc.specialty}</p>
                    <p className="text-[11px] text-[#577877]">{doc.experienceShort || '12 years of experience'}</p>
                  </div>
                </div>

                <div className="border-t border-[#577877]/15 my-3" />

                {/* Metadata List */}
                <div className="space-y-3 text-xs">
                  <div>
                    <span className="text-[#577877] block text-[11px]">Patient</span>
                    <span className="font-semibold text-[#162623]">Emma Mitchell</span>
                  </div>

                  <div>
                    <span className="text-[#577877] block text-[11px]">Date &amp; time</span>
                    <span className="font-semibold text-[#162623]">
                      {selectedDate.displayShort} · {selectedTimeSlot}–{getSlotEndTime(selectedTimeSlot)} PT
                    </span>
                  </div>

                  <div>
                    <span className="text-[#577877] block text-[11px]">Appointment</span>
                    <span className="font-semibold text-[#162623]">
                      {visitFormat.includes('Video') ? 'Video' : 'Audio'} · {appointmentType}
                    </span>
                  </div>
                </div>

                <div className="border-t border-[#577877]/15 my-3" />

                {/* Consultation Fee */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#162623]">Consultation fee</span>
                    <span className="text-base font-bold text-[#162623]">{doc.feeDisplay}.00</span>
                  </div>
                  <span className="text-[11px] text-[#577877] block mt-1">
                    Self-pay · No additional platform fee.
                  </span>
                </div>

                {/* Checkboxes */}
                <div className="space-y-3 pt-3">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={policyAgreed}
                      onChange={(e) => setPolicyAgreed(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-[#577877]/40 text-[#295255] focus:ring-[#295255] accent-[#295255]"
                    />
                    <div className="text-xs">
                      <span className="font-semibold text-[#162623]">I agree to the appointment policy.</span>
                      <span className="text-[11px] text-[#577877] block mt-0.5 leading-normal">
                        Cancel or reschedule at least 24 hours before your visit for a full refund.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={consentGranted}
                      onChange={(e) => setConsentGranted(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-[#577877]/40 text-[#295255] focus:ring-[#295255] accent-[#295255]"
                    />
                    <div className="text-xs">
                      <span className="font-semibold text-[#162623]">Telehealth consent granted</span>
                      <span className="text-[11px] text-[#577877] block mt-0.5 leading-normal">
                        You can review your consent at any time.
                      </span>
                    </div>
                  </label>
                </div>

                {/* Error message */}
                {bookingError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">error</span>
                    <span>{bookingError}</span>
                  </div>
                )}

                {/* Submit button */}
                <div className="pt-3">
                  <button
                    type="button"
                    disabled={!policyAgreed || !consentGranted || bookingLoading}
                    onClick={handleConfirmBooking}
                    className={`btn-primary w-full !py-3 rounded-xl font-semibold text-xs shadow-sm flex items-center justify-center gap-2 ${
                      !policyAgreed || !consentGranted || bookingLoading ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {bookingLoading ? (
                      <>
                        <span className="material-symbols-outlined text-sm font-bold animate-spin">progress_activity</span>
                        <span>Reserving appointment...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm font-bold">arrow_forward</span>
                        <span>Continue to payment</span>
                      </>
                    )}
                  </button>
                  <p className="text-[11px] text-[#577877] text-center mt-2.5">
                    You'll review payment before confirming.
                  </p>
                </div>

              </div>

              {/* Disclaimer Note */}
              <p className="text-[11px] text-[#577877] px-1 leading-relaxed">
                Need an urgent appointment? Contact your care team. In an emergency, call your local emergency number.
              </p>

            </div>

          </div>

          {/* Global Footer */}
          <div className="pt-10 pb-6 border-t border-[#577877]/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#577877]">
            <p>© 2026 Kaizentrix Care · Your health, thoughtfully connected.</p>
            <div className="flex items-center gap-4">
              <span className="hover:text-[#162623] cursor-pointer">Privacy</span>
              <span>·</span>
              <span className="hover:text-[#162623] cursor-pointer">Terms</span>
              <span>·</span>
              <span
                className="hover:text-[#162623] cursor-pointer"
                onClick={() => onNavigate('support')}
              >
                Need help?
              </span>
            </div>
          </div>

        </div>

        {/* Confirmation Modal */}
        {bookingSuccess && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-7 shadow-2xl space-y-5 text-center">
              <div className="w-14 h-14 rounded-full bg-[#E7F3F1] text-[#295255] flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-3xl font-bold">check_circle</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#162623]">Appointment Scheduled!</h3>
                <p className="text-xs text-[#577877] mt-1.5 leading-relaxed">
                  Your teleconsultation with <strong>{doc.name}</strong> is scheduled for{' '}
                  <strong>{selectedDate.displayShort} at {selectedTimeSlot} PT</strong>.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#F0F5F7] text-left text-xs space-y-1.5 text-[#162623]">
                <div className="flex justify-between">
                  <span className="text-[#577877]">Physician:</span>
                  <span className="font-bold">{doc.fullName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#577877]">Format:</span>
                  <span className="font-semibold">{visitFormat}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#577877]">Consultation Fee:</span>
                  <span className="font-bold">{doc.feeDisplay}.00</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setBookingDoctor(null);
                    setBookingSuccess(false);
                    onNavigate('appointments');
                  }}
                  className="btn-primary w-full text-xs !py-2.5"
                >
                  View in My Appointments
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBookingDoctor(null);
                    setBookingSuccess(false);
                    onNavigate('payments');
                  }}
                  className="btn-secondary w-full text-xs !py-2.5"
                >
                  Go to Payments
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  // ========================================================
  // VIEW 2: "MEET YOUR DOCTOR" PROFILE VIEW (Matches Screenshot 4)
  // ========================================================
  if (selectedDoctorView) {
    const doc = selectedDoctorView;

    return (
      <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
        <div className="mx-auto max-w-7xl space-y-6">

          {/* Header Row: Meet your doctor + Back to results */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-[#162623]">
                Meet your doctor
              </h1>
              <p className="mt-1 text-xs text-[#577877]">
                Find doctors / {doc.specialty} / {doc.name}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedDoctorView(null)}
              className="btn-secondary !px-4 !py-2 text-xs font-semibold rounded-xl flex items-center gap-2 shadow-2xs shrink-0"
            >
              <span className="material-symbols-outlined !text-[#295255] text-sm">arrow_back</span>
              <span>Back to results</span>
            </button>
          </div>

          {/* Hero Doctor Summary Card */}
          <div className="care-card p-7 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              {doc.image ? (
                <img
                  src={doc.image}
                  alt={doc.fullName}
                  className="w-32 h-32 rounded-2xl object-cover shrink-0 border border-[#577877]/20 shadow-2xs"
                />
              ) : (
                <div className="w-32 h-32 rounded-2xl bg-[#E4EDF0] text-[#295255] flex items-center justify-center font-bold text-3xl shrink-0 border border-[#577877]/20">
                  {doc.initials}
                </div>
              )}

              <div className="space-y-1.5">
                <div>
                  <span className="inline-flex items-center text-[11px] font-semibold px-3 py-1 rounded-full bg-[#E7F3F1] text-[#295255]">
                    {doc.badgeText}
                  </span>
                </div>

                <h2 className="text-2xl font-bold text-[#162623]">{doc.fullName}</h2>

                <p className="text-xs font-semibold text-[#295255]">
                  {doc.specialty} · {doc.subSpecialty}
                </p>

                <p className="text-xs text-[#577877]">{doc.experience}</p>

                <div className="flex items-center gap-1.5 text-xs text-[#162623] pt-0.5">
                  <span className="material-symbols-outlined !text-amber-500 text-sm">star</span>
                  <span className="font-bold">{doc.rating} / 5</span>
                  <span className="text-[#577877]">· {doc.reviewsCount} patient reviews</span>
                </div>
              </div>
            </div>

            {/* Price & Book Action Box */}
            <div className="flex sm:flex-col items-start sm:items-end justify-between sm:justify-start gap-3 pt-4 sm:pt-0 border-t sm:border-t-0 border-[#577877]/15 shrink-0 min-w-[200px]">
              <div className="text-left sm:text-right">
                <span className="text-xs text-[#577877] block">Video consultation</span>
                <span className="text-3xl font-bold text-[#162623] block mt-0.5">
                  {doc.feeDisplay}
                </span>
                <span className="text-xs text-[#577877] block mt-0.5">{doc.duration}</span>
              </div>

              <button
                type="button"
                onClick={() => {
                  startBooking(doc);
                }}
                className="btn-primary !px-7 !py-3 rounded-xl font-semibold text-xs shadow-sm w-full sm:w-auto"
              >
                Book appointment
              </button>
            </div>
          </div>

          {/* Tabs: Overview | Experience | Patient reviews */}
          <div className="flex items-center gap-8 border-b border-[#577877]/20 pt-2 text-sm font-medium">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'experience', label: 'Experience' },
              { id: 'reviews', label: 'Patient reviews' },
            ].map((tab) => {
              const isActive = doctorProfileTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDoctorProfileTab(tab.id)}
                  className={`pb-3 font-semibold transition-all relative ${
                    isActive ? 'text-[#295255]' : 'text-[#577877] hover:text-[#162623]'
                  }`}
                >
                  <span>{tab.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#295255] rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          {/* 2-Column Content Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

            {/* Left 8 Cols: Tab Content */}
            <div className="lg:col-span-8 space-y-6">

              {doctorProfileTab === 'overview' && (
                <>
                  {/* Card 1: Care that starts with listening */}
                  <div className="care-card p-6 sm:p-7 space-y-4">
                    <h3 className="text-base font-bold text-[#162623]">
                      Care that starts with listening
                    </h3>
                    <p className="text-xs text-[#577877] italic leading-relaxed">
                      {doc.quote}
                    </p>
                    <p className="text-xs text-[#577877] leading-relaxed">
                      {doc.bio}
                    </p>

                    <div className="pt-2">
                      <h4 className="text-xs font-bold text-[#162623] mb-2.5">Areas of focus</h4>
                      <div className="flex flex-wrap gap-2">
                        {doc.areasOfFocus.map((area) => (
                          <span
                            key={area}
                            className="inline-flex items-center text-xs font-medium px-3 py-1 rounded-full bg-[#E7F3F1] text-[#295255]"
                          >
                            {area}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Card 2: Education & experience */}
                  <div className="care-card p-6 sm:p-7 space-y-4">
                    <h3 className="text-base font-bold text-[#162623]">
                      Education &amp; experience
                    </h3>

                    <div className="space-y-3 text-xs">
                      <div>
                        <span className="text-[#577877] block text-[11px]">Medical education</span>
                        <p className="font-semibold text-[#162623] mt-0.5">{doc.education}</p>
                      </div>

                      <div>
                        <span className="text-[#577877] block text-[11px]">Residency</span>
                        <p className="font-semibold text-[#162623] mt-0.5">{doc.residency}</p>
                      </div>

                      <div>
                        <span className="text-[#577877] block text-[11px]">Clinical practice</span>
                        <p className="font-semibold text-[#162623] mt-0.5">{doc.practice}</p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {doctorProfileTab === 'experience' && (
                <div className="care-card p-6 sm:p-7 space-y-4">
                  <h3 className="text-base font-bold text-[#162623]">Clinical Background</h3>
                  <div className="space-y-3 text-xs text-[#577877] leading-relaxed">
                    <p>
                      {doc.fullName} has over a decade of dedicated clinical practice in high-acuity
                      and outpatient telehealth settings. Specializing in preventative chronic disease
                      management and coordinated care pathways.
                    </p>
                    <div className="p-4 rounded-xl bg-[#F0F5F7] space-y-2 text-[#162623]">
                      <div className="flex justify-between">
                        <span className="text-[#577877]">Board Certification</span>
                        <span className="font-semibold">American Board of Internal Medicine</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#577877]">State License</span>
                        <span className="font-semibold">California Medical Board (Active)</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#577877]">Telehealth Experience</span>
                        <span className="font-semibold">5+ Years (Over 2,400 Consultations)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {doctorProfileTab === 'reviews' && (
                <div className="care-card p-6 sm:p-7 space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-[#577877]/15">
                    <div>
                      <h3 className="text-base font-bold text-[#162623]">Patient Reviews</h3>
                      <p className="text-xs text-[#577877]">Verified consultation feedback</p>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm font-bold text-[#162623]">
                      <span className="material-symbols-outlined !text-amber-500 text-base">star</span>
                      <span>{doc.rating} / 5</span>
                      <span className="text-xs text-[#577877]">({doc.reviewsCount})</span>
                    </div>
                  </div>

                  <div className="space-y-3.5 pt-2">
                    {doc.patientReviews.map((rev, idx) => (
                      <div key={idx} className="p-4 rounded-xl bg-[#F0F5F7] space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-[#162623]">{rev.author}</span>
                          <span className="text-[11px] text-[#577877]">{rev.date}</span>
                        </div>
                        <div className="flex text-amber-500 text-xs">
                          {Array.from({ length: rev.rating }).map((_, i) => (
                            <span key={i} className="material-symbols-outlined text-xs">star</span>
                          ))}
                        </div>
                        <p className="text-[#577877] leading-relaxed">{rev.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Right 4 Cols: "Next available" + Support Card */}
            <div className="lg:col-span-4 space-y-4">

              {/* Card 1: Next available */}
              <div className="care-card p-6 sm:p-7 space-y-4">
                <h3 className="text-base font-bold text-[#162623]">Next available</h3>

                <div>
                  <span className="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#E7F3F1] text-[#295255]">
                    Video visits available
                  </span>
                </div>

                <div>
                  <h4 className="text-lg font-bold text-[#162623]">{doc.nextSlotDate}</h4>
                  <p className="text-xs text-[#295255] font-semibold mt-1">
                    {doc.nextSlotTime}
                  </p>
                </div>

                <div className="space-y-2 pt-1 text-xs">
                  <div>
                    <span className="text-[#577877] block text-[11px]">Visit type</span>
                    <p className="font-semibold text-[#162623] mt-0.5">Follow-up consultation</p>
                  </div>

                  <div>
                    <span className="text-[#577877] block text-[11px]">Practice</span>
                    <p className="font-semibold text-[#162623] mt-0.5">{doc.clinic}</p>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      startBooking(doc);
                    }}
                    className="btn-primary w-full !py-2.5 rounded-xl font-semibold text-xs shadow-2xs"
                  >
                    Choose a time
                  </button>
                  <p className="text-[11px] text-[#577877] text-center mt-3">
                    Self-pay fee. Review all charges before confirming.
                  </p>
                </div>
              </div>

              {/* Card 2: Not sure who to choose? */}
              <div className="p-5 rounded-2xl bg-[#E8F3F3] border border-[#577877]/20 flex items-start gap-3">
                <span className="material-symbols-outlined !text-[#295255] text-lg shrink-0 mt-0.5">
                  info
                </span>
                <div className="text-xs space-y-1">
                  <p className="font-bold text-[#162623]">Not sure who to choose?</p>
                  <p className="text-[#577877] leading-relaxed">
                    Our support team can help you find the right specialty. For emergencies, call your local emergency number.
                  </p>
                </div>
              </div>

            </div>

          </div>

          {/* Global Footer */}
          <div className="pt-10 pb-6 border-t border-[#577877]/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#577877]">
            <p>© 2026 Kaizentrix Care · Your health, thoughtfully connected.</p>
            <div className="flex items-center gap-4">
              <span className="hover:text-[#162623] cursor-pointer">Privacy</span>
              <span>·</span>
              <span className="hover:text-[#162623] cursor-pointer">Terms</span>
              <span>·</span>
              <span
                className="hover:text-[#162623] cursor-pointer"
                onClick={() => onNavigate('support')}
              >
                Need help?
              </span>
            </div>
          </div>

        </div>

      </div>
    );
  }

  // ========================================================
  // VIEW 1: DIRECTORY LIST VIEW (Matches Screenshot 3)
  // ========================================================
  return (
    <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Page Heading & Subtitle */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#162623]">
            Find the right care for you
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#577877]">
            Thoughtful expertise, on your schedule. Choose a doctor who fits your needs.
          </p>
        </div>

        {/* Search & Location Bar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
          {/* Search Doctors Input */}
          <div className="md:col-span-5 relative">
            <span className="material-symbols-outlined !text-[#577877] absolute left-3.5 top-1/2 -translate-y-1/2 text-lg">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by specialty, condition or doctor name"
              className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white border border-[#577877]/25 text-xs text-[#162623] placeholder-[#577877] focus:outline-none focus:border-[#295255] shadow-2xs"
            />
          </div>

          {/* Location Input */}
          <div className="md:col-span-5 relative">
            <span className="material-symbols-outlined !text-[#577877] absolute left-3.5 top-1/2 -translate-y-1/2 text-lg">
              location_on
            </span>
            <input
              type="text"
              value={locationQuery}
              onChange={(e) => setLocationQuery(e.target.value)}
              placeholder="City, State, or Video visits"
              className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white border border-[#577877]/25 text-xs text-[#162623] placeholder-[#577877] focus:outline-none focus:border-[#295255] shadow-2xs"
            />
          </div>

          {/* Search Button */}
          <div className="md:col-span-2">
            <button
              type="button"
              className="btn-primary w-full !py-3 rounded-2xl text-xs font-semibold flex items-center justify-center gap-2 shadow-2xs"
            >
              <span className="material-symbols-outlined text-base">search</span>
              <span>Search</span>
            </button>
          </div>
        </div>

        {/* Main 2-Column Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* Left Column (4 cols): Refine your search filters */}
          <div className="lg:col-span-4 care-card p-6 sm:p-7 space-y-6">
            <h2 className="text-base font-bold text-[#162623]">Refine your search</h2>

            {/* Specialty Filter */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-[#162623] block">Specialty</label>
              <div className="space-y-2.5 text-xs">
                {['Internal medicine', 'Family medicine', 'Cardiology', 'Dermatology'].map((spec) => {
                  const isChecked = selectedSpecialties.includes(spec);
                  return (
                    <label
                      key={spec}
                      className="flex items-center gap-2.5 text-[#162623] cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSpecialty(spec)}
                        className="w-4 h-4 rounded border-[#577877]/40 text-[#295255] focus:ring-[#295255] accent-[#295255]"
                      />
                      <span className={isChecked ? 'font-medium' : 'text-[#577877]'}>{spec}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Availability Filter */}
            <div className="space-y-3 pt-2 border-t border-[#577877]/15">
              <label className="text-xs font-bold text-[#162623] block">Availability</label>
              <div className="space-y-2.5 text-xs">
                {['Any time', 'Available today', 'This week'].map((avail) => {
                  const isChecked = availabilityFilter === avail;
                  return (
                    <label
                      key={avail}
                      className="flex items-center gap-2.5 text-[#162623] cursor-pointer select-none"
                    >
                      <input
                        type="radio"
                        name="availability"
                        checked={isChecked}
                        onChange={() => setAvailabilityFilter(avail)}
                        className="w-4 h-4 text-[#295255] focus:ring-[#295255] accent-[#295255]"
                      />
                      <span className={isChecked ? 'font-medium' : 'text-[#577877]'}>{avail}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Consultation Fee / Price Range Filter */}
            <div className="space-y-3 pt-2 border-t border-[#577877]/15">
              <label className="text-xs font-bold text-[#162623] block">Consultation fee</label>
              <div>
                <span className="text-[11px] text-[#577877] block mb-1">Price range</span>
                <input
                  type="text"
                  value={priceRange}
                  onChange={(e) => setPriceRange(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-[#F0F5F7]/50 text-xs text-[#162623] font-medium focus:outline-none focus:border-[#295255]"
                />
              </div>
            </div>

            {/* Language Filter */}
            <div className="space-y-3 pt-2 border-t border-[#577877]/15">
              <label className="text-xs font-bold text-[#162623] block">Language</label>
              <div className="space-y-2.5 text-xs">
                {['English', 'Spanish'].map((lang) => {
                  const isChecked = selectedLanguages.includes(lang);
                  return (
                    <label
                      key={lang}
                      className="flex items-center gap-2.5 text-[#162623] cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleLanguage(lang)}
                        className="w-4 h-4 rounded border-[#577877]/40 text-[#295255] focus:ring-[#295255] accent-[#295255]"
                      />
                      <span className={isChecked ? 'font-medium' : 'text-[#577877]'}>{lang}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Clear All Filters */}
            <div className="pt-2">
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs font-semibold text-[#295255] hover:underline"
              >
                Clear all filters
              </button>
            </div>
          </div>

          {/* Right Column (8 cols): Doctor Cards Feed */}
          <div className="lg:col-span-8 space-y-4">

            {/* Filter Meta & Sort */}
            <div className="flex items-center justify-between text-xs text-[#577877] px-1">
              <span>{filteredDoctors.length} doctors match your preferences</span>
              <div className="flex items-center gap-1.5">
                <span>Sort:</span>
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value)}
                  className="bg-transparent font-semibold text-[#162623] focus:outline-none cursor-pointer"
                >
                  <option value="Recommended">Recommended</option>
                  <option value="Rating">Highest Rated</option>
                  <option value="Fee">Lowest Fee</option>
                </select>
              </div>
            </div>

            {/* Doctor Cards */}
            <div className="space-y-4">
              {visibleDoctors.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#577877]/30 bg-white p-8 text-center">
                  <span className="material-symbols-outlined !text-[#295255] text-3xl">person_search</span>
                  <h3 className="mt-3 text-base font-bold text-[#162623]">No doctors found</h3>
                  <p className="mt-1 text-sm text-[#577877]">Try clearing a filter or broadening your search.</p>
                  <button type="button" onClick={clearAllFilters} className="btn-secondary mt-4">Clear filters</button>
                </div>
              ) : visibleDoctors.map((doc) => {
                return (
                  <div
                    key={doc.id}
                    className="care-card p-6 sm:p-7 space-y-5 transition-all hover:shadow-md"
                  >
                    {/* Top Row: Doctor Info + Avatar */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        {doc.image ? (
                          <img
                            src={doc.image}
                            alt={doc.name}
                            className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl object-cover shrink-0 border border-[#577877]/20"
                          />
                        ) : (
                          <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl bg-[#E4EDF0] text-[#295255] flex items-center justify-center font-bold text-xl shrink-0 border border-[#577877]/20">
                            {doc.initials}
                          </div>
                        )}

                        <div className="space-y-1">
                          <h3 className="text-base font-bold text-[#162623]">{doc.name}</h3>
                          <p className="text-xs font-medium text-[#295255]">{doc.specialty}</p>
                          <p className="text-xs text-[#577877]">{doc.experienceShort}</p>

                          <div className="flex items-center gap-1.5 text-xs text-[#162623] pt-0.5">
                            <span className="material-symbols-outlined !text-amber-500 text-sm">star</span>
                            <span className="font-bold">{doc.rating}</span>
                            <span className="text-[#577877]">({doc.reviewsCount} reviews)</span>
                          </div>

                          <p className="text-xs font-bold text-[#162623] pt-1">
                            {doc.feeVideoVisit}
                          </p>
                        </div>
                      </div>

                      {/* Right Tag/Badge & Duration */}
                      <div className="flex sm:flex-col items-start sm:items-end justify-between sm:justify-start gap-2 shrink-0">
                        <span
                          className={`inline-flex items-center text-[11px] font-semibold px-3 py-1 rounded-full ${
                            doc.badgeType === 'care-team'
                              ? 'bg-[#E7F3F1] text-[#295255]'
                              : doc.badgeType === 'available-today'
                              ? 'bg-[#E6F4EA] text-[#1E7E34]'
                              : 'bg-[#EBF5F5] text-[#295255]'
                          }`}
                        >
                          {doc.badge}
                        </span>
                        <span className="text-[11px] text-[#577877]">{doc.durationShort}</span>
                      </div>
                    </div>

                    {/* Bottom Row: Next Slot & Actions */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-[#577877]/15">
                      <div className="flex items-center gap-2 text-xs font-semibold text-[#295255]">
                        <span className="material-symbols-outlined text-base">calendar_today</span>
                        <span>{doc.nextSlotLabel || 'No available appointment slots'}</span>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedDoctorView(doc);
                            setDoctorProfileTab('overview');
                          }}
                          className="btn-secondary !px-4 !py-2 text-xs font-semibold rounded-xl"
                        >
                          View profile
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            startBooking(doc);
                          }}
                          className="btn-primary !px-5 !py-2 text-xs font-semibold rounded-xl shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Book appointment
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {pageCount > 1 && (
              <div className="flex items-center justify-center gap-3 pt-2">
                <button type="button" disabled={page === 1} onClick={() => setPage((current) => current - 1)} className="btn-secondary !px-3 !py-1.5 text-xs disabled:opacity-40">Previous</button>
                <span className="text-xs text-[#577877]">Page {page} of {pageCount}</span>
                <button type="button" disabled={page === pageCount} onClick={() => setPage((current) => current + 1)} className="btn-secondary !px-3 !py-1.5 text-xs disabled:opacity-40">Next</button>
              </div>
            )}

            {/* Sub-footer Note from Screenshot */}
            <p className="text-[11px] text-[#577877] text-center pt-2">
              Fees shown are self-pay estimates. Final pricing is confirmed before payment.
            </p>
          </div>

        </div>

        {/* Global Footer matching screenshot */}
        <div className="pt-10 pb-6 border-t border-[#577877]/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#577877]">
          <p>© 2026 Kaizentrix Care · Your health, thoughtfully connected.</p>
          <div className="flex items-center gap-4">
            <span className="hover:text-[#162623] cursor-pointer">Privacy</span>
            <span>·</span>
            <span className="hover:text-[#162623] cursor-pointer">Terms</span>
            <span>·</span>
            <span
              className="hover:text-[#162623] cursor-pointer"
              onClick={() => onNavigate('support')}
            >
              Need help?
            </span>
          </div>
        </div>

      </div>

    </div>
  );
}
