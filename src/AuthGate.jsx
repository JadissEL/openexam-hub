import React, { useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup
} from 'firebase/auth';
import { examLabel } from '../lib/exams.js';

// Sign-up / log-in page shown on /app to anyone who is not signed in with a real account.
// The dashboard (tabs, plans, ads, data fetches) is never rendered behind it. The URL (including
// ?exam=&level=) is left untouched, so once the user signs in the planner opens with that exam.

const WHY = 'A free account saves your plan and progress across devices and keeps the AI free for everyone by preventing repeated requests.';

function friendlyAuthError(err) {
  const code = (err && err.code) || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found'))
    return 'That email and password don’t match. Try again or reset your password.';
  if (code.includes('email-already-in-use')) return 'There is already an account with this email. Log in instead.';
  if (code.includes('weak-password')) return 'Please use a password with at least 6 characters.';
  if (code.includes('invalid-email')) return 'Please enter a valid email address.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Please wait a minute and try again.';
  if (code.includes('popup-closed') || code.includes('cancelled-popup')) return 'The Google window was closed before signing in.';
  if (code.includes('popup-blocked')) return 'Your browser blocked the Google window. Allow pop-ups and try again.';
  if (code.includes('network')) return 'No connection. Check your internet and try again.';
  return 'Something went wrong. Please try again.';
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="w-5 h-5">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function SamplePlan({ roadmap, onBack }) {
  if (!roadmap) return null;
  return (
    <div className="mt-6" data-testid="sample-plan">
      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#C2410C]">Sample · read only</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">
        {examLabel(roadmap.exam)} · {roadmap.level} · {roadmap.days} days
      </h2>
      <p className="mt-3 text-[15px] leading-relaxed text-[#5C554C]">{roadmap.summary}</p>
      <ol className="mt-5 space-y-4">
        {(roadmap.phases || []).map((ph) => (
          <li key={ph.phaseTitle} className="rounded-2xl border border-black/5 bg-white p-4">
            <h3 className="font-semibold text-[15px]">{ph.phaseTitle}</h3>
            {ph.focus && <p className="mt-1 text-sm text-[#5C554C]">{ph.focus}</p>}
            <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-[#3B352F]">
              {(ph.tasks || []).slice(0, 4).map((t) => (
                <li key={typeof t === 'string' ? t : t.title}>{typeof t === 'string' ? t : t.title}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onBack}
        className="mt-6 w-full min-h-[48px] rounded-full bg-[#1A1714] text-white font-semibold"
      >
        Create your free account to build your own plan
      </button>
    </div>
  );
}

export default function AuthGate({ auth, sampleRoadmap }) {
  const [mode, setMode] = useState('signup'); // signup | login | reset
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [showSample, setShowSample] = useState(false);

  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const wantedExam = params && params.get('exam') ? examLabel(params.get('exam').toUpperCase().replace(/[\s-]+/g, '_')) : null;

  useEffect(() => {
    document.title = mode === 'login' ? 'Log in · OpenExam Hub' : 'Create your free account · OpenExam Hub';
  }, [mode]);

  const switchMode = (m) => {
    setMode(m);
    setError(null);
    setNotice(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!auth || busy) return;
    setError(null);
    setNotice(null);
    const em = email.trim();
    if (!em) return setError('Please enter your email address.');
    setBusy(true);
    try {
      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, em);
        setNotice('If an account exists for this email, a reset link is on its way. Check your inbox.');
      } else if (!password) {
        setError('Please enter your password.');
      } else if (mode === 'signup') {
        await createUserWithEmailAndPassword(auth, em, password);
      } else {
        await signInWithEmailAndPassword(auth, em, password);
      }
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    if (!auth || busy) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const tab = (m, label) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === m}
      onClick={() => switchMode(m)}
      className={`flex-1 min-h-[44px] rounded-full text-sm font-semibold transition ${
        mode === m ? 'bg-white text-[#1A1714] shadow-sm' : 'text-[#6B635A]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      className="min-h-screen bg-[#F7F5F0] text-[#1A1714] antialiased"
      style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}
      data-testid="auth-gate"
    >
      <main className="mx-auto w-full max-w-md px-5 pt-8 pb-16 sm:pt-16">
        <a href="/" className="inline-flex items-center gap-2.5 font-semibold tracking-tight">
          <img src="/favicon.svg" alt="" width="32" height="32" className="w-8 h-8 rounded-lg" />
          <span className="text-[18px]">OpenExam Hub</span>
        </a>

        {showSample ? (
          <SamplePlan roadmap={sampleRoadmap} onBack={() => { setShowSample(false); switchMode('signup'); }} />
        ) : (
          <>
            <h1 className="mt-8 text-[28px] sm:text-3xl font-semibold tracking-tight leading-tight">
              {mode === 'login' ? 'Welcome back' : mode === 'reset' ? 'Reset your password' : 'Create your free account'}
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-[#5C554C]">
              {wantedExam && mode !== 'reset' ? `Then we’ll open the planner for ${wantedExam}. ` : ''}
              {WHY}
            </p>

            {mode !== 'reset' && (
              <div role="tablist" aria-label="Account" className="mt-6 flex gap-1 rounded-full bg-[#ECE7DF] p-1">
                {tab('signup', 'Create account')}
                {tab('login', 'Log in')}
              </div>
            )}

            {mode !== 'reset' && (
              <>
                <button
                  type="button"
                  onClick={google}
                  disabled={busy}
                  className="mt-5 w-full min-h-[48px] rounded-full border border-black/10 bg-white font-semibold text-[15px] inline-flex items-center justify-center gap-2.5 disabled:opacity-60"
                >
                  <GoogleIcon />
                  Continue with Google
                </button>
                <div className="my-5 flex items-center gap-3 text-xs text-[#8A8178]">
                  <span className="h-px flex-1 bg-black/10" />
                  or with email
                  <span className="h-px flex-1 bg-black/10" />
                </div>
              </>
            )}

            <form onSubmit={submit} className={`space-y-3 ${mode === 'reset' ? 'mt-6' : ''}`} noValidate>
              <label className="block">
                <span className="text-sm font-medium">Email</span>
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full min-h-[48px] rounded-xl border border-black/15 bg-white px-4 text-[16px] focus:outline-none focus:ring-2 focus:ring-[#C2410C]"
                  required
                />
              </label>
              {mode !== 'reset' && (
                <label className="block">
                  <span className="text-sm font-medium">Password</span>
                  <input
                    type="password"
                    name="password"
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    className="mt-1 w-full min-h-[48px] rounded-xl border border-black/15 bg-white px-4 text-[16px] focus:outline-none focus:ring-2 focus:ring-[#C2410C]"
                    required
                  />
                  {mode === 'signup' && <span className="mt-1 block text-xs text-[#8A8178]">At least 6 characters.</span>}
                </label>
              )}

              {error && (
                <p role="alert" className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-800">
                  {error}
                </p>
              )}
              {notice && (
                <p role="status" className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
                  {notice}
                </p>
              )}

              <button
                type="submit"
                disabled={busy}
                className="w-full min-h-[48px] rounded-full bg-[#1A1714] text-white font-semibold text-[15px] disabled:opacity-60"
              >
                {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : mode === 'reset' ? 'Send reset link' : 'Create free account'}
              </button>
            </form>

            <div className="mt-4 text-sm text-center text-[#5C554C] space-y-2">
              {mode === 'login' && (
                <button type="button" onClick={() => switchMode('reset')} className="underline underline-offset-4">
                  Forgot your password?
                </button>
              )}
              {mode === 'reset' && (
                <button type="button" onClick={() => switchMode('login')} className="underline underline-offset-4">
                  Back to log in
                </button>
              )}
            </div>

            {sampleRoadmap && (
              <p className="mt-10 text-center text-sm">
                <button
                  type="button"
                  onClick={() => setShowSample(true)}
                  className="text-[#C2410C] underline underline-offset-4"
                >
                  See a sample TEF Canada plan
                </button>
              </p>
            )}
            <p className="mt-6 text-center text-xs text-[#8A8178]">
              Free, no payment details. <a href="/privacy" className="underline">Privacy</a> · <a href="/terms" className="underline">Terms</a>
            </p>
          </>
        )}
      </main>
    </div>
  );
}
