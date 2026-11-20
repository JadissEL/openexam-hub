import React, { useCallback, useEffect, useState } from 'react';
import { MailCheck, X } from 'lucide-react';
import { VERIFY_COPY, needsVerification, resendVerification, uiLang } from './verifyEmail.js';

const dismissKey = (uid) => `oeh_verify_banner_dismissed_${uid}`;

// Gentle, dismissible reminder for email/password accounts that haven't clicked their link yet.
// Never blocks the app. Re-checks the account whenever the tab regains focus, so it disappears
// on its own right after the learner verifies in another tab.
export default function VerifyEmailBanner({ user }) {
  const [, force] = useState(0);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return !!(user && window.sessionStorage.getItem(dismissKey(user.uid)));
    } catch {
      return false;
    }
  });
  const [state, setState] = useState({ busy: false, msg: null, tone: 'info' });
  const [justVerified, setJustVerified] = useState(false);
  const t = VERIFY_COPY[uiLang()] || VERIFY_COPY.en;

  const refresh = useCallback(async () => {
    if (!user || user.emailVerified) return;
    try {
      await user.reload();
      if (user.emailVerified) {
        await user.getIdToken(true).catch(() => {});
        setJustVerified(true);
        setTimeout(() => setJustVerified(false), 6000);
      }
      force((n) => n + 1);
    } catch {
      /* offline: try again on next focus */
    }
  }, [user]);

  useEffect(() => {
    if (!needsVerification(user)) return undefined;
    refresh();
    const onFocus = () => refresh();
    const onVis = () => document.visibilityState === 'visible' && refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [user, refresh]);

  if (justVerified) {
    return (
      <div role="status" className="mb-4 sm:mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
        {t.verified}
      </div>
    );
  }
  if (!needsVerification(user) || dismissed) return null;

  const onResend = async () => {
    setState({ busy: true, msg: null, tone: 'info' });
    const r = await resendVerification(user);
    if (r.status === 'sent') setState({ busy: false, msg: t.sent, tone: 'ok' });
    else if (r.status === 'already-verified') {
      setState({ busy: false, msg: null, tone: 'info' });
      refresh();
    } else if (r.status === 'rate-limited')
      setState({ busy: false, msg: r.reason === 'daily' ? t.daily : t.wait(Math.max(1, Math.min(r.retryAfterSec || 60, 3600))), tone: 'warn' });
    else setState({ busy: false, msg: t.failed, tone: 'warn' });
  };

  const onDismiss = () => {
    try {
      window.sessionStorage.setItem(dismissKey(user.uid), '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  return (
    <div
      role="region"
      aria-label={t.title}
      data-testid="verify-email-banner"
      className="mb-4 sm:mb-5 rounded-2xl border border-[#F3D9C6] bg-[#FFF7F0] px-4 py-3.5 sm:px-5 flex items-start gap-3"
    >
      <MailCheck className="w-5 h-5 mt-0.5 shrink-0 text-[#C2410C]" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#1A1714]">{t.title}</p>
        <p className="mt-0.5 text-sm text-[#5C554C] break-words">{t.body(user.email)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={onResend}
            disabled={state.busy}
            className="min-h-[36px] rounded-full bg-[#C2410C] hover:bg-[#9A3412] disabled:opacity-60 px-4 text-sm font-semibold text-white transition-colors"
          >
            {state.busy ? t.sending : t.resend}
          </button>
          {state.msg && (
            <span role="status" className={`text-sm ${state.tone === 'ok' ? 'text-emerald-800' : 'text-[#9A3412]'}`}>
              {state.msg}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t.dismiss}
        className="-mr-1 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#6B635A] hover:bg-black/5"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
