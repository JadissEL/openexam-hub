/**
 * Learner-facing account emails, sent right after sign-up (same POST /api/account
 * {action:'signup-notify'} call as the founder alert, see lib/signupAlert.js):
 *
 *  - Email/password accounts that are not verified yet -> branded "Verify your email" with a
 *    Firebase verification link generated server-side (firebase-admin generateEmailVerificationLink,
 *    continue URL https://openexamhub.org/app).
 *  - Accounts already verified by their provider (Google) -> a one-time branded welcome email.
 *
 * Both go through Resend (RESEND_API_KEY). Verification sends are rate limited per uid
 * (VERIFY_COOLDOWN_MS between sends, VERIFY_DAILY_MAX per 24h) in the server-only doc
 * public/data/user_emails/{uid}. When Resend is missing or fails, the result is 'fallback' and
 * the app sends Firebase's own verification email instead (sendEmailVerification), so a learner
 * is never left without a link. Nothing here throws into the request.
 */
import { getAuth } from 'firebase-admin/auth';
import { pub, getDb } from './firebaseAdmin.js';
import { BRAND, SITE_URL, esc, renderEmailShell, buttonHtml, p, strong, link } from './emailTemplate.js';
import { sendResendEmail, SIGNUP_ALERT_MAX_AGE_MS } from './signupAlert.js';
import { examLabel } from './exams.js';

export const USER_EMAIL_DEFAULT_FROM = 'OpenExam Hub <hello@openexamhub.org>';
export const USER_EMAIL_REPLY_TO = 'hello@openexamhub.org';
export const VERIFY_CONTINUE_URL = `${SITE_URL}/app`;
export const VERIFY_COOLDOWN_MS = 60 * 1000;
export const VERIFY_DAILY_MAX = 5;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const USER_EMAILS_COLLECTION = 'user_emails';
export const REPO_URL = 'https://github.com/JadissEL/openexam-hub';
export const DEMO_VIDEO_URL = 'https://www.youtube.com/watch?v=dtRC_QJzLtU';
export const DEMO_THUMB_URL = `${SITE_URL}/email/demo-thumb.jpg`; // public/email/demo-thumb.jpg, 1200x675

export function userEmailSender() {
  return String(process.env.USER_EMAIL_FROM || '').trim() || USER_EMAIL_DEFAULT_FROM;
}

export function emailLang(locale) {
  return /^fr\b/i.test(String(locale || '')) ? 'fr' : 'en';
}

function firstName(displayName) {
  const s = String(displayName || '').trim().split(/\s+/)[0] || '';
  return s.slice(0, 40);
}

// ---------------------------------------------------------------------------------- templates

const COPY = {
  en: {
    verify: {
      subject: 'Verify your email for OpenExam Hub',
      preheader: 'One click to confirm your email and keep your account safe.',
      eyebrow: 'Confirm your email',
      headline: 'One click to confirm it’s you',
      hello: (n) => (n ? `Hi ${n}, welcome to OpenExam Hub!` : 'Welcome to OpenExam Hub!'),
      body: (email) => `Please confirm that ${email} is your address. It keeps your account safe and lets you reset your password if you ever forget it.`,
      button: 'Verify my email',
      fallback: 'If the button doesn’t work, copy this link into your browser:',
      ignore: 'Didn’t create an account? You can ignore this email. Nothing happens unless you click the link.',
      footer: 'You’re receiving this because someone signed up for OpenExam Hub with this address. This is a one-time account email, not a newsletter.'
    },
    demo: {
      title: 'See how it works',
      body: 'A short demo (2:31) of building a free study plan, from picking your exam to today’s tasks.',
      alt: 'Play the OpenExam Hub demo video (2:31) on YouTube',
      cta: 'Watch the demo on YouTube'
    },
    welcome: {
      subject: 'Welcome to OpenExam Hub: your free study plan is waiting',
      preheader: 'Pick your exam, choose your days, and follow today’s tasks.',
      eyebrow: 'Welcome aboard',
      headline: 'Your free study plan is waiting',
      hello: (n) => (n ? `Hi ${n}, thanks for joining OpenExam Hub.` : 'Thanks for joining OpenExam Hub.'),
      what: 'OpenExam Hub builds free, day-by-day study roadmaps for language exams such as TEF Canada, TCF, DELF, IELTS, TOEFL, Goethe and DELE, using official and openly available resources.',
      examLine: (e) => `You came for ${e}, so that’s a great place to start.`,
      stepsTitle: 'Your next step',
      steps: ['Pick your exam and target level.', 'Choose how many days you have until the exam.', 'Follow today’s tasks and tick them off as you go.'],
      button: 'Open my study plan',
      free: 'It’s free and open source: no course to buy and nothing locked behind a paywall. The code is public on',
      footer: 'You’re receiving this one-time email because you just created an OpenExam Hub account. It’s a service message, not marketing: we don’t send newsletters. Questions? Just reply to this email.'
    }
  },
  fr: {
    verify: {
      subject: 'Confirmez votre adresse e-mail pour OpenExam Hub',
      preheader: 'Un clic pour confirmer votre e-mail et protéger votre compte.',
      eyebrow: 'Confirmez votre e-mail',
      headline: 'Un clic pour confirmer que c’est bien vous',
      hello: (n) => (n ? `Bonjour ${n}, bienvenue sur OpenExam Hub !` : 'Bienvenue sur OpenExam Hub !'),
      body: (email) => `Merci de confirmer que ${email} est bien votre adresse. Cela protège votre compte et vous permet de réinitialiser votre mot de passe si vous l’oubliez.`,
      button: 'Confirmer mon e-mail',
      fallback: 'Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :',
      ignore: 'Vous n’avez pas créé de compte ? Ignorez simplement cet e-mail : rien ne se passe sans clic sur le lien.',
      footer: 'Vous recevez ce message parce que quelqu’un a créé un compte OpenExam Hub avec cette adresse. C’est un e-mail de compte ponctuel, pas une newsletter.'
    },
    demo: {
      title: 'Voir comment ça marche',
      body: 'Une courte démo (2:31) : on crée un plan d’étude gratuit, du choix de l’examen jusqu’aux tâches du jour.',
      alt: 'Lire la vidéo de démonstration d’OpenExam Hub (2:31) sur YouTube',
      cta: 'Regarder la démo sur YouTube'
    },
    welcome: {
      subject: 'Bienvenue sur OpenExam Hub : votre plan d’étude gratuit vous attend',
      preheader: 'Choisissez votre examen, vos jours, et suivez les tâches du jour.',
      eyebrow: 'Bienvenue',
      headline: 'Votre plan d’étude gratuit vous attend',
      hello: (n) => (n ? `Bonjour ${n}, merci de rejoindre OpenExam Hub.` : 'Merci de rejoindre OpenExam Hub.'),
      what: 'OpenExam Hub crée des plans de révision gratuits, jour par jour, pour les examens de langue comme le TEF Canada, le TCF, le DELF, l’IELTS, le TOEFL, le Goethe et le DELE, à partir de ressources officielles et librement accessibles.',
      examLine: (e) => `Vous êtes venu pour le ${e} : c’est le bon point de départ.`,
      stepsTitle: 'Prochaine étape',
      steps: ['Choisissez votre examen et votre niveau visé.', 'Indiquez combien de jours il vous reste avant l’examen.', 'Suivez les tâches du jour et cochez-les au fur et à mesure.'],
      button: 'Ouvrir mon plan d’étude',
      free: 'C’est gratuit et open source : aucun cours à acheter, rien de caché derrière un paywall. Le code est public sur',
      footer: 'Vous recevez cet e-mail unique parce que vous venez de créer un compte OpenExam Hub. C’est un message de service, pas de la publicité : nous n’envoyons pas de newsletter. Une question ? Répondez simplement à cet e-mail.'
    }
  }
};

/** Clickable thumbnail (play button baked into the image) + caption, linking to the YouTube demo. */
export function demoBlockHtml(lang = 'en', { compact = false } = {}) {
  const d = COPY[lang === 'fr' ? 'fr' : 'en'].demo;
  const B = BRAND;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:${compact ? 28 : 30}px;">
                    <tr>
                      <td class="oeh-ink" style="padding-bottom:10px;font-family:${B.sans};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${B.ink};">${esc(d.title)}</td>
                    </tr>
                    <tr>
                      <td>
                        <a href="${DEMO_VIDEO_URL}" target="_blank" style="display:block;text-decoration:none;">
                          <img src="${DEMO_THUMB_URL}" width="520" alt="${esc(d.alt)}" style="display:block;width:100%;max-width:520px;height:auto;border:1px solid ${B.line};border-radius:16px;outline:none;text-decoration:none;font-family:${B.sans};font-size:14px;color:${B.accent};">
                        </a>
                      </td>
                    </tr>
                    <tr>
                      <td class="oeh-muted" style="padding-top:10px;font-family:${B.sans};font-size:14px;line-height:22px;color:${B.muted};">${esc(d.body)} ${link(DEMO_VIDEO_URL, d.cta)}</td>
                    </tr>
                  </table>`;
}

export function demoText(lang = 'en') {
  const d = COPY[lang === 'fr' ? 'fr' : 'en'].demo;
  return `${d.title}: ${d.body}\n${d.cta}: ${DEMO_VIDEO_URL}`;
}

export function renderVerifyEmail({ link: href, email = '', displayName = '', lang = 'en' }) {
  const L = lang === 'fr' ? 'fr' : 'en';
  const c = COPY[L].verify;
  const n = firstName(displayName);
  const bodyHtml = [
    p(esc(c.hello(n)), 'margin-top:16px;'),
    p(esc(c.body('\u0000')).replace('\u0000', strong(email || (L === 'fr' ? 'votre adresse' : 'your address')))),
    `<div style="padding-top:26px;">${buttonHtml(href, c.button)}</div>`,
    p(esc(c.fallback), 'margin-top:26px;font-size:13px;line-height:20px;'),
    `<p style="margin:6px 0 0;font-family:${BRAND.sans};font-size:12px;line-height:18px;word-break:break-all;"><a class="oeh-accent" href="${esc(href)}" target="_blank" style="color:${BRAND.accent};text-decoration:underline;">${esc(href)}</a></p>`,
    demoBlockHtml(L, { compact: true }),
    p(esc(c.ignore), 'margin-top:22px;font-size:14px;line-height:22px;')
  ].join('\n');
  const html = renderEmailShell({ lang: L, title: c.subject, preheader: c.preheader, eyebrow: c.eyebrow, headline: c.headline, bodyHtml, footerHtml: esc(c.footer) });
  const text = [c.headline, '', c.hello(n), '', c.body(email || ''), '', `${c.button}: ${href}`, '', demoText(L), '', c.ignore, '', `— OpenExam Hub · ${SITE_URL}`, c.footer].join('\n');
  return { subject: c.subject, html, text };
}

export function renderWelcomeEmail({ displayName = '', exam = null, lang = 'en' }) {
  const L = lang === 'fr' ? 'fr' : 'en';
  const c = COPY[L].welcome;
  const n = firstName(displayName);
  const examName = exam ? examLabel(exam) : null;
  const appUrl = exam ? `${SITE_URL}/app?exam=${encodeURIComponent(exam)}` : `${SITE_URL}/app`;
  const steps = c.steps
    .map(
      (s, i) => `<tr>
                      <td valign="top" width="34" style="width:34px;padding:8px 0;">
                        <div style="width:26px;height:26px;border-radius:13px;background-color:${BRAND.sand};font-family:${BRAND.sans};font-size:13px;line-height:26px;font-weight:700;color:${BRAND.accentDark};text-align:center;">${i + 1}</div>
                      </td>
                      <td class="oeh-ink" valign="top" style="padding:10px 0 8px;font-family:${BRAND.sans};font-size:15px;line-height:22px;color:${BRAND.ink};">${esc(s)}</td>
                    </tr>`
    )
    .join('');
  const bodyHtml = [
    p(esc(c.hello(n)), 'margin-top:16px;'),
    p(esc(c.what)),
    examName ? p(esc(c.examLine('\u0000')).replace('\u0000', strong(examName))) : '',
    `<div class="oeh-ink" style="padding-top:24px;font-family:${BRAND.sans};font-size:12px;line-height:16px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${BRAND.ink};">${esc(c.stepsTitle)}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;">${steps}</table>`,
    `<div style="padding-top:22px;">${buttonHtml(appUrl, c.button)}</div>`,
    demoBlockHtml(L),
    p(`${esc(c.free)} ${link(REPO_URL, 'GitHub')}.`, 'margin-top:26px;font-size:14px;line-height:22px;')
  ].join('\n');
  const html = renderEmailShell({ lang: L, title: c.subject, preheader: c.preheader, eyebrow: c.eyebrow, headline: c.headline, bodyHtml, footerHtml: esc(c.footer) });
  const text = [
    c.headline,
    '',
    c.hello(n),
    '',
    c.what,
    examName ? c.examLine(examName) : null,
    '',
    `${c.stepsTitle}:`,
    ...c.steps.map((s, i) => `${i + 1}. ${s}`),
    '',
    `${c.button}: ${appUrl}`,
    '',
    demoText(L),
    '',
    `${c.free} GitHub: ${REPO_URL}`,
    '',
    `— OpenExam Hub · ${SITE_URL}`,
    c.footer
  ]
    .filter((l) => l !== null)
    .join('\n');
  return { subject: c.subject, html, text };
}

// ---------------------------------------------------------------------------------- rate limit

/** Pure: may another verification email go out now? `sends` = past send times (ms). */
export function checkVerifyRate(sends, now) {
  const recent = (Array.isArray(sends) ? sends : []).filter((t) => Number.isFinite(t) && now - t < DAY_MS).sort((a, b) => a - b);
  const last = recent[recent.length - 1];
  if (last != null && now - last < VERIFY_COOLDOWN_MS) {
    return { ok: false, reason: 'cooldown', retryAfterSec: Math.ceil((VERIFY_COOLDOWN_MS - (now - last)) / 1000), recent };
  }
  if (recent.length >= VERIFY_DAILY_MAX) {
    return { ok: false, reason: 'daily', retryAfterSec: Math.ceil((DAY_MS - (now - recent[0])) / 1000), recent };
  }
  return { ok: true, recent };
}

// ---------------------------------------------------------------------------------- sending

let sendImpl = (msg) => sendResendEmail(msg);
let linkImpl = (email) => getAuth().generateEmailVerificationLink(email, { url: VERIFY_CONTINUE_URL });
let txImpl = (fn) => getDb().runTransaction(fn);
/** Test seams. Pass null/undefined to restore. */
export function setUserEmailSeamsForTests({ send, generateLink, transaction } = {}) {
  sendImpl = send || ((msg) => sendResendEmail(msg));
  linkImpl = generateLink || ((email) => getAuth().generateEmailVerificationLink(email, { url: VERIFY_CONTINUE_URL }));
  txImpl = transaction || ((fn) => getDb().runTransaction(fn));
}

const stateRef = (uid) => pub().collection(USER_EMAILS_COLLECTION).doc(uid);

export function isPasswordAccount(userRecord) {
  return (userRecord?.providerData || []).some((p) => p?.providerId === 'password');
}

/**
 * Reserve a verification slot (rate limit + optional signup dedupe), then send.
 * @returns {Promise<{status:'sent'|'fallback'|'duplicate'|'rate-limited'|'already-verified'|'not-password'|'failed', retryAfterSec?:number, reason?:string}>}
 */
export async function sendVerificationEmail({ userRecord, lang = 'en', reason = 'resend', now = Date.now() }) {
  if (!userRecord?.uid || !userRecord.email) return { status: 'failed' };
  if (userRecord.emailVerified) return { status: 'already-verified' };
  if (!isPasswordAccount(userRecord)) return { status: 'not-password' };
  const ref = stateRef(userRecord.uid);
  let verdict;
  try {
    verdict = await txImpl(async (tx) => {
      const snap = await tx.get(ref);
      const d = (snap.exists && snap.data()) || {};
      if (reason === 'signup' && d.verifyInitialAt) return { status: 'duplicate' };
      const rate = checkVerifyRate(d.verifySends, now);
      if (!rate.ok) return { status: 'rate-limited', retryAfterSec: rate.retryAfterSec, reason: rate.reason };
      const update = { verifySends: [...rate.recent, now] };
      if (reason === 'signup') update.verifyInitialAt = now;
      tx.set(ref, update, { merge: true });
      return { status: 'reserved' };
    });
  } catch (err) {
    console.error('[user-email] rate-limit transaction failed', err?.code || err?.message);
    return { status: 'failed' };
  }
  if (verdict.status !== 'reserved') return verdict;

  // From here a slot is spent; any problem means the app sends Firebase's own email instead.
  if (!process.env.RESEND_API_KEY) {
    console.warn('[user-email] RESEND_API_KEY is not set; the app will send the Firebase verification email');
    return { status: 'fallback' };
  }
  let href;
  try {
    href = await linkImpl(userRecord.email);
  } catch (err) {
    console.error('[user-email] could not generate the verification link', err?.code || err?.message);
    return { status: 'fallback' };
  }
  const msg = renderVerifyEmail({ link: href, email: userRecord.email, displayName: userRecord.displayName, lang });
  const r = await sendImpl({ to: userRecord.email, from: userEmailSender(), replyTo: USER_EMAIL_REPLY_TO, tag: 'verify_email', ...msg });
  if (!r.ok) return { status: 'fallback' };
  console.log(`[user-email] verification email sent (${reason})`);
  return { status: 'sent' };
}

/** One-time welcome for provider-verified accounts (Google). */
export async function sendWelcomeEmail({ userRecord, lang = 'en', exam = null, now = Date.now() }) {
  if (!userRecord?.uid || !userRecord.email) return { status: 'failed' };
  if (!process.env.RESEND_API_KEY) {
    console.warn('[user-email] RESEND_API_KEY is not set; skipping the welcome email');
    return { status: 'not-configured' };
  }
  const ref = stateRef(userRecord.uid);
  let claimed;
  try {
    claimed = await txImpl(async (tx) => {
      const snap = await tx.get(ref);
      const d = (snap.exists && snap.data()) || {};
      if (d.welcomeAt) return false;
      tx.set(ref, { welcomeAt: now }, { merge: true });
      return true;
    });
  } catch (err) {
    console.error('[user-email] welcome claim failed', err?.code || err?.message);
    return { status: 'failed' };
  }
  if (!claimed) return { status: 'duplicate' };
  const msg = renderWelcomeEmail({ displayName: userRecord.displayName, exam, lang });
  const r = await sendImpl({ to: userRecord.email, from: userEmailSender(), replyTo: USER_EMAIL_REPLY_TO, tag: 'welcome', idempotencyKey: `welcome-${userRecord.uid}`, ...msg });
  if (!r.ok) {
    await stateRef(userRecord.uid).set({ welcomeAt: null }, { merge: true }).catch(() => {});
    return { status: 'failed' };
  }
  console.log('[user-email] welcome email sent');
  return { status: 'sent' };
}

/**
 * Called from signup-notify. Picks the right email for a fresh account.
 * @returns {Promise<{kind:'verify'|'welcome'|null, status:string, retryAfterSec?:number}>}
 */
export async function handleSignupUserEmail({ userRecord, hints = {}, now = Date.now() }) {
  try {
    const created = Date.parse(userRecord?.metadata?.creationTime || '');
    if (!Number.isFinite(created) || now - created > SIGNUP_ALERT_MAX_AGE_MS) return { kind: null, status: 'not-new' };
    if (!userRecord.email) return { kind: null, status: 'skipped' };
    const lang = emailLang(hints.locale);
    if (!userRecord.emailVerified && isPasswordAccount(userRecord)) {
      return { kind: 'verify', ...(await sendVerificationEmail({ userRecord, lang, reason: 'signup', now })) };
    }
    if (userRecord.emailVerified) {
      return { kind: 'welcome', ...(await sendWelcomeEmail({ userRecord, lang, exam: hints.exam || null, now })) };
    }
    return { kind: null, status: 'skipped' };
  } catch (err) {
    console.error('[user-email] signup email failed', err?.message);
    return { kind: null, status: 'failed' };
  }
}
