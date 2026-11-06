import { useRef, useState } from 'react';
import { authApi } from '../../lib/api';

const initialForm = {
  full_name: '',
  email: '',
  mobile_number: '',
  password: '',
  confirm_password: '',
  terms_version: 'v1.0',
  terms_accepted: false,
};

function BrandPanel({ onBack }) {
  return (
    <aside className="relative hidden overflow-hidden bg-[#295255] text-white lg:flex lg:flex-col justify-between p-10 lg:p-14 xl:p-16 min-h-screen">
      <div className="space-y-8 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F0F5F7] text-[#295255] flex items-center justify-center font-bold shadow-sm">
              <span className="material-symbols-outlined !text-[#295255] text-2xl font-bold">
                health_and_safety
              </span>
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight text-white">Kaizentrix Care</p>
              <p className="text-[10px] tracking-[.18em] uppercase text-[#F0F5F7]/80 font-semibold">
                Patient Portal
              </p>
            </div>
          </div>

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-3.5 py-1.5 rounded-xl border border-white/10 transition"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              Back to Home
            </button>
          )}
        </div>

        <div className="pt-16 xl:pt-24 space-y-5">
          <span className="inline-block px-3 py-1 rounded-full bg-white/10 text-xs font-semibold text-[#F0F5F7] tracking-wider uppercase border border-white/10">
            Care That Connects
          </span>
          <h1 className="text-4xl xl:text-5xl font-bold leading-tight text-white">
            Your health journey.<br />In one trusted place.
          </h1>
          <p className="text-sm xl:text-base text-[#F0F5F7]/85 leading-relaxed max-w-md">
            Access certified physicians, schedule teleconsultations, review diagnostic reports, and manage electronic prescriptions with clinical confidence.
          </p>
        </div>
      </div>

      <div className="relative z-10 pt-10 border-t border-white/15 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-white">
          <span className="material-symbols-outlined !text-[#F0F5F7] text-base">verified_user</span>
          <span>HIPAA & DISHA Enterprise Standard</span>
        </div>
        <p className="text-xs text-[#F0F5F7]/75">
          256-bit encryption protects every teleconsultation and diagnostic release.
        </p>
      </div>

      {/* Decorative gradient overlay */}
      <div className="absolute -bottom-20 -right-20 w-96 h-96 rounded-full bg-[#577877]/25 blur-3xl pointer-events-none" />
    </aside>
  );
}

export default function AuthScreen({ onAuthenticated, onBack, initialMode = 'login' }) {
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState(initialForm);
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const otpRefs = useRef([]);

  const update = (e) =>
    setForm((curr) => ({
      ...curr,
      [e.target.name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }));

  const changeMode = (next) => {
    setMode(next);
    setError('');
    setMessage('');
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'register') {
        if (form.password.length < 8) {
          throw new Error('Password must be at least 8 characters.');
        }
        if (form.password !== form.confirm_password) {
          throw new Error('Passwords do not match.');
        }
        if (!form.terms_accepted) {
          throw new Error('Please accept the terms and privacy policy.');
        }
        await authApi.register(form);
        setMessage('A verification code was sent to your email address.');
        setCode(['', '', '', '', '', '']);
        setMode('verify');
      } else if (mode === 'recovery') {
        await authApi.requestRecovery(form.email);
        setMessage('If an account exists, a secure reset token has been sent.');
        setMode('reset');
      } else if (mode === 'reset') {
        await authApi.resetPassword({ token: resetToken, password: form.password });
        setMessage('Password reset. You can now sign in.');
        setMode('login');
      } else {
        await authApi.login({ email: form.email, password: form.password, ...(mfaRequired ? { mfa_code: mfaCode } : {}) });
        onAuthenticated();
      }
    } catch (err) {
      if (err.message?.toLowerCase().includes('mfa')) setMfaRequired(true);
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (code.join('').length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await authApi.verifyEmail(form.email, code.join(''));
      onAuthenticated();
    } catch (err) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'mt-1.5 w-full rounded-xl border border-[#577877]/30 bg-[#F0F5F7] px-3.5 py-2.5 text-xs text-[#162623] outline-none focus:border-[#295255] focus:bg-white transition';

  const isRegister = mode === 'register';
  const isRecovery = mode === 'recovery';
  const isReset = mode === 'reset';

  if (mode === 'verify') {
    return (
      <main className="min-h-screen w-full bg-white font-sans overflow-x-hidden">
        <section className="w-full min-h-screen grid lg:grid-cols-[45%_55%] bg-white">
          <BrandPanel onBack={onBack} />
          <div className="flex flex-col justify-between p-6 sm:p-10 lg:p-14 xl:p-16 min-h-screen overflow-y-auto">
            <div className="flex items-center justify-between text-xs text-[#577877]">
              <div className="flex items-center gap-2">
                {onBack && (
                  <button
                    type="button"
                    onClick={onBack}
                    className="lg:hidden inline-flex items-center gap-1 text-xs font-semibold text-[#295255] hover:underline"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                    Home
                  </button>
                )}
                <span>Kaizentrix Care Portal</span>
              </div>
              <span>Step 2 of 2: Multi-Factor Check</span>
            </div>

            <div className="max-w-md mx-auto w-full py-8 space-y-6 my-auto">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#577877]">
                  Identity Verification
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold text-[#162623] mt-1">
                  Enter 6-Digit Security Code
                </h2>
                <p className="text-xs sm:text-sm text-[#577877] mt-1">
                  A verification code has been sent to your registered email address.
                </p>
              </div>

              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <label className="text-xs font-semibold text-[#162623] block">
                  Security Code
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {code.map((digit, idx) => (
                    <input
                      key={idx}
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        if (!val) {
                          setCode((curr) => curr.map((item, i) => (i === idx ? '' : item)));
                          return;
                        }
                        const digit = val.slice(-1);
                        setCode((curr) => curr.map((item, i) => (i === idx ? digit : item)));
                        if (idx < 5) otpRefs.current[idx + 1]?.focus();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Backspace' && !code[idx] && idx > 0) {
                          otpRefs.current[idx - 1]?.focus();
                        }
                      }}
                      onPaste={(e) => {
                        e.preventDefault();
                        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                        if (!pasted) return;
                        setCode((curr) => curr.map((item, i) => pasted[i] || item));
                        otpRefs.current[Math.min(pasted.length, 6) - 1]?.focus();
                      }}
                      ref={(element) => { otpRefs.current[idx] = element; }}
                      className="h-12 w-full rounded-xl border border-[#577877]/30 text-center text-xl font-bold text-[#162623] outline-none focus:border-[#295255] focus:bg-[#F0F5F7]"
                    />
                  ))}
                </div>

                {error && <p className="text-xs text-red-700">{error}</p>}

                <button
                  type="submit"
                  className="w-full rounded-xl bg-[#295255] hover:bg-[#162623] text-white text-xs font-semibold py-3 transition shadow-sm cursor-pointer"
                >
                  Verify & Enter Patient Portal
                </button>
              </form>

              <div className="text-center text-xs text-[#577877] space-y-2">
                <p>
                  Didn't receive the code?{' '}
                  <button
                    type="button"
                    onClick={() => setMessage('Please request a new code after restarting registration.')}
                    className="font-semibold text-[#295255] hover:underline"
                  >
                    Resend code
                  </button>
                </p>
                {message && <p className="text-emerald-700 font-medium">{message}</p>}
                <button
                  type="button"
                  onClick={() => changeMode('login')}
                  className="text-[#577877] hover:text-[#162623] block mx-auto text-[11px]"
                >
                  ← Return to sign in
                </button>
              </div>
            </div>

            <p className="text-center text-[11px] text-[#577877]">
              © 2026 Kaizentrix Care · HIPAA & DISHA Certified
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full bg-white font-sans overflow-x-hidden">
      <section className="w-full min-h-screen grid lg:grid-cols-[45%_55%] bg-white">
        <BrandPanel onBack={onBack} />

        <div className="flex flex-col justify-between p-6 sm:p-10 lg:p-14 xl:p-16 min-h-screen overflow-y-auto">
          {/* Top Header */}
          <div className="flex items-center justify-between text-xs text-[#577877]">
            <div className="flex items-center gap-2">
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="lg:hidden inline-flex items-center gap-1 text-xs font-semibold text-[#295255] hover:underline"
                >
                  <span className="material-symbols-outlined text-sm">arrow_back</span>
                  Home
                </button>
              )}
              <span className="font-medium">Kaizentrix Care</span>
            </div>
            <span>Secure Patient Access</span>
          </div>

          {/* Centered Content Form */}
          <div className="max-w-md mx-auto w-full py-8 space-y-6 my-auto">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#577877]">
                {isRegister ? 'Patient Enrollment' : isRecovery ? 'Account Recovery' : 'Welcome Back'}
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold text-[#162623] mt-1">
                {isRegister
                  ? 'Create Your Health Account'
                  : isRecovery
                  ? 'Recover Access'
                  : isReset
                  ? 'Set a New Password'
                  : 'Sign In to Patient Portal'}
              </h2>
              <p className="text-xs sm:text-sm text-[#577877] mt-1">
                {isRegister
                  ? 'Connect with doctors and manage your records securely.'
                  : 'Enter your credentials to access your clinical dashboard.'}
              </p>
            </div>

            <form onSubmit={submit} className="space-y-3.5">
              {isRegister && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-[#162623]">Full Name</label>
                    <input
                      required
                      name="full_name"
                      value={form.full_name}
                      onChange={update}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[#162623]">Mobile Number</label>
                    <input
                      required
                      type="tel"
                      minLength={7}
                      maxLength={32}
                      pattern="[+0-9() .-]{7,32}"
                      name="mobile_number"
                      value={form.mobile_number}
                      onChange={update}
                      className={inputClass}
                    />
                  </div>
                </>
              )}

              <div>
                <label className="text-xs font-semibold text-[#162623]">Email Address</label>
                <input
                  required
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={update}
                  className={inputClass}
                />
              </div>

              {isReset && (
                <div>
                  <label className="text-xs font-semibold text-[#162623]">Recovery token</label>
                  <input required value={resetToken} onChange={(e) => setResetToken(e.target.value)} className={inputClass} />
                </div>
              )}

              {!isRecovery && (
                <div>
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-[#162623]">Password</label>
                    {!isRegister && (
                      <button
                        type="button"
                        onClick={() => changeMode('recovery')}
                        className="text-[11px] text-[#295255] hover:underline cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <input
                    required
                    minLength={8}
                    type="password"
                    name="password"
                    value={form.password}
                    onChange={update}
                    className={inputClass}
                  />
                </div>
              )}

              {mfaRequired && !isRegister && !isRecovery && !isReset && (
                <div>
                  <label className="text-xs font-semibold text-[#162623]">Authenticator code</label>
                  <input required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={mfaCode} onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))} className={inputClass} placeholder="6-digit MFA code" />
                </div>
              )}

              {isRegister && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-[#162623]">Confirm Password</label>
                    <input
                      required
                      minLength={8}
                      type="password"
                      name="confirm_password"
                      value={form.confirm_password}
                      onChange={update}
                      className={inputClass}
                    />
                  </div>
                  <label className="flex items-start gap-2 text-xs text-[#577877]">
                    <input
                      required
                      type="checkbox"
                      name="terms_accepted"
                      checked={form.terms_accepted}
                      onChange={update}
                      className="mt-0.5 accent-[#295255]"
                    />
                    <span>I accept the Terms of Service and Privacy Policy.</span>
                  </label>
                </>
              )}

              {error && <p className="text-xs text-red-700">{error}</p>}
              {message && <p className="text-xs text-emerald-700">{message}</p>}

              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-[#295255] hover:bg-[#162623] text-white text-xs font-semibold py-3 mt-2 transition shadow-sm cursor-pointer disabled:opacity-60"
              >
                {busy
                  ? 'Processing…'
                  : isRegister
                  ? 'Create Account'
                  : isRecovery
                  ? 'Send Recovery Code'
                  : isReset
                  ? 'Reset Password'
                  : 'Sign In Securely'}
              </button>
            </form>

            <div className="text-center text-xs text-[#577877]">
              {isRegister ? (
                <p>
                  Already registered?{' '}
                  <button
                    type="button"
                    onClick={() => changeMode('login')}
                    className="font-semibold text-[#295255] hover:underline cursor-pointer"
                  >
                    Sign in
                  </button>
                </p>
              ) : (
                <p>
                  New to Kaizentrix Care?{' '}
                  <button
                    type="button"
                    onClick={() => changeMode('register')}
                    className="font-semibold text-[#295255] hover:underline cursor-pointer"
                  >
                    Create an account
                  </button>
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-[11px] text-[#577877] pt-4">
            © 2026 Kaizentrix Care · Privacy Policy · Terms of Service
          </p>
        </div>
      </section>
    </main>
  );
}
