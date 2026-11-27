import { useEffect, useMemo, useState } from 'react';
import seed from '@hub/scripts/seed-candidates.json';
import { PICKER_EXAMS, LEVELS, examLabel, normalizeVariant } from '@hub/lib/exams.js';
import { plansForGuide } from '@hub/src/seo/planPages.js';
import { hasSchedule, planDays, planProgress, currentDay } from '@hub/src/lib/plan.js';
import { toClientPhases } from '@hub/src/lib/roadmapStore.js';
import { useAuth, authMessage } from './auth.jsx';
import { useNav } from './nav.js';
import { apiGet, apiPost } from './api.js';
import { logNativeEvent, openExternal } from './native.js';
import { Empty, External, PullToRefresh, RowLink, prettyDate } from './ui.jsx';
import { FUNDING_URL, PRIVACY_URL } from './config.js';

const SKILLS = ['listening', 'reading', 'writing', 'speaking', 'grammar', 'vocabulary'];
const CACHE_KEY = 'oeh-library-cache-v1';

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

const EXAM_SLUG = {
  TEF_CANADA: 'tef-canada',
  TCF: 'tcf',
  IELTS: 'ielts',
  CELPIP: 'celpip',
  TOEFL: 'toefl',
  GOETHE: 'goethe',
  DELE: 'dele'
};

function seedRows(exam, level, skill) {
  return seed.filter((row) => {
    if (row.exam !== exam) return false;
    if (level && Array.isArray(row.levels) && row.levels.length && !row.levels.includes(level)) return false;
    if (skill && !(row.skills || []).includes(skill)) return false;
    return true;
  });
}

export function LibraryScreen() {
  const [exam, setExam] = useState('IELTS');
  const [level, setLevel] = useState('');
  const [skill, setSkill] = useState('');
  const [live, setLive] = useState(null);
  const [status, setStatus] = useState('');
  const exams = useMemo(() => [...new Set(seed.map((r) => r.exam))].sort(), []);
  const key = `${exam}|${level}|${skill}`;

  async function refresh() {
    const qs = new URLSearchParams({ exam });
    if (level) qs.set('level', level);
    if (skill) qs.set('skill', skill);
    try {
      const out = await apiGet(`/api/library?${qs}`);
      const cache = readCache();
      cache[key] = { at: new Date().toISOString(), resources: out.resources || [] };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      setLive(cache[key]);
      setStatus('');
    } catch (err) {
      setStatus(err?.message || 'Showing the copy saved in the app.');
    }
  }

  useEffect(() => {
    const cached = readCache()[key];
    setLive(cached || null);
    refresh();
    // refresh is recreated each render; the filters are the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const offline = seedRows(exam, level, skill).map((r) => ({
    id: r.url,
    title: r.title,
    url: r.url,
    category: r.category,
    org: r.source_org
  }));
  const rows = live?.resources?.length ? live.resources : offline;
  return (
    <PullToRefresh onRefresh={refresh}>
      <div className="stack">
        <header>
          <p className="eyebrow">Library</p>
          <h2 className="display" style={{ fontSize: '1.8rem' }}>Official free resources</h2>
          <p className="lead">The list shipped with the app works offline. Pull to refresh the link-checked library from OpenExam Hub.</p>
        </header>
        {status ? <p className="banner">{status} Showing the saved copy.</p> : null}
        {live?.at ? <p className="note">Updated {prettyDate(live.at)}.</p> : <p className="note">Showing the copy included with the app.</p>}
        <label className="field">Exam
          <select value={exam} onChange={(e) => setExam(e.target.value)}>
            {exams.map((id) => <option key={id} value={id}>{examLabel(id)}</option>)}
          </select>
        </label>
        <div className="chips">
          <button type="button" className="chip" aria-pressed={level === ''} onClick={() => setLevel('')}>All levels</button>
          {LEVELS.map((lv) => (
            <button key={lv} type="button" className="chip" aria-pressed={level === lv} onClick={() => setLevel(lv)}>{lv}</button>
          ))}
        </div>
        <div className="chips">
          <button type="button" className="chip" aria-pressed={skill === ''} onClick={() => setSkill('')}>All skills</button>
          {SKILLS.map((s) => (
            <button key={s} type="button" className="chip" aria-pressed={skill === s} onClick={() => setSkill(s)}>{s}</button>
          ))}
        </div>
        {rows.length === 0 ? <Empty title="Nothing for that filter" detail="Try another level or skill." /> : null}
        {rows.map((r) => (
          <a key={r.id || r.url} className="row-btn" href={r.url} onClick={(e) => { e.preventDefault(); openExternal(r.url); logNativeEvent('outbound_official_resource', { link_domain: hostOf(r.url) }); }}>
            <span className="grow">
              {r.title}
              <small>{r.org || r.category || 'Official resource'}</small>
            </span>
          </a>
        ))}
      </div>
    </PullToRefresh>
  );
}

function hostOf(url) {
  try { return new URL(url).hostname; } catch { return ''; }
}

function Ring({ pct }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <svg className="ring" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r={r} fill="none" stroke="var(--line)" strokeWidth="4" />
      <circle cx="20" cy="20" r={r} fill="none" stroke="var(--accent)" strokeWidth="4" strokeDasharray={`${(pct / 100) * c} ${c}`} strokeLinecap="round" transform="rotate(-90 20 20)" />
    </svg>
  );
}

export function PlannerScreen({ presetExam }) {
  const auth = useAuth();
  const { push } = useNav();
  const [exam, setExam] = useState(presetExam || 'TEF_CANADA');
  const [variant, setVariant] = useState('tout_public');
  const [level, setLevel] = useState('B2');
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const picker = PICKER_EXAMS.find((e) => e.id === exam) || PICKER_EXAMS[0];
  const guide = exam === 'TCF' && variant === 'canada' ? 'tcf-canada' : EXAM_SLUG[exam];
  const paths = guide ? plansForGuide(guide) : [];

  useEffect(() => {
    if (presetExam && PICKER_EXAMS.some((e) => e.id === presetExam)) setExam(presetExam);
  }, [presetExam]);

  async function build() {
    if (!auth.user) {
      logNativeEvent('plan_preview_signup_click', { exam, level, days });
      push({ name: 'account' });
      return;
    }
    setBusy(true);
    setError('');
    setNotice('Looking for a shared plan…');
    const resolvedVariant = exam === 'TCF' ? normalizeVariant('TCF', variant) : null;
    const qs = new URLSearchParams({ exam, level, days: String(days) });
    if (resolvedVariant) qs.set('variant', resolvedVariant);
    try {
      let roadmap;
      let source = 'global_cache';
      try {
        const cached = await apiGet(`/api/plan?${qs}`);
        roadmap = cached.roadmap;
        logNativeEvent('plan_preview', { exam, level, days: Number(days), result: 'hit' });
      } catch (err) {
        if (err.status !== 404) throw err;
        logNativeEvent('plan_preview', { exam, level, days: Number(days), result: 'miss' });
        setNotice('Building a plan from the official library. This can take a minute.');
        const token = await auth.user.getIdToken();
        const made = await apiPost('/api/generate-roadmap', {
          exam,
          level,
          days: Number(days),
          ...(resolvedVariant ? { variant: resolvedVariant } : {})
        }, token, 300000);
        roadmap = made.roadmap;
        source = 'live_discovery';
      }
      if (!roadmap) throw new Error('No plan came back.');
      roadmap.phases = toClientPhases(roadmap.phases);
      roadmap.createdAt = roadmap.createdAt || new Date().toISOString().slice(0, 10);
      roadmap.exam = roadmap.exam || exam;
      roadmap.level = roadmap.level || level;
      roadmap.days = Number(roadmap.days || days);
      const id = await auth.savePlan(roadmap);
      logNativeEvent('roadmap_generated', { exam, level, days: Number(days), source });
      setNotice('');
      push({ name: 'roadmap', id });
    } catch (err) {
      setNotice('');
      setError(authMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <header>
        <p className="eyebrow">Study planner</p>
        <h2 className="display" style={{ fontSize: '1.85rem' }}>A day-by-day plan from official free material.</h2>
        <p className="lead">A free account keeps the plan on this phone and on the website. You can read the published study paths without one.</p>
      </header>
      <div className="chips">
        {PICKER_EXAMS.map((item) => (
          <button key={item.id} type="button" className="chip" aria-pressed={exam === item.id} onClick={() => { setExam(item.id); logNativeEvent('exam_selected', { exam: item.id, context: 'planner' }); }}>{item.label}</button>
        ))}
      </div>
      {picker.variants ? (
        <div className="chips">
          {picker.variants.map((v) => (
            <button key={v.id} type="button" className="chip" aria-pressed={variant === v.id} onClick={() => setVariant(v.id)}>{v.label}</button>
          ))}
        </div>
      ) : null}
      {picker.note ? <p className="note">{picker.note}</p> : null}
      <div className="chips">
        {LEVELS.map((lv) => (
          <button key={lv} type="button" className="chip" aria-pressed={level === lv} onClick={() => setLevel(lv)}>{lv}</button>
        ))}
      </div>
      <div className="chips">
        {[14, 30, 60, 90].map((n) => (
          <button key={n} type="button" className="chip" aria-pressed={days === n} onClick={() => setDays(n)}>{n} days</button>
        ))}
      </div>
      <button type="button" className="primary" disabled={busy} onClick={build}>
        {busy ? 'Working…' : auth.user ? 'Build my plan' : 'Create a free account to build a plan'}
      </button>
      {notice ? <p className="banner">{notice}</p> : null}
      {error ? <p className="banner warn">{error}</p> : null}
      {paths.length ? (
        <section className="stack">
          <h2 className="section-title">Published study paths</h2>
          {paths.map((p) => (
            <RowLink key={p.slug} title={p.label} detail={`${p.level} · ${p.duration}`} onClick={() => { logNativeEvent('plan_preview_open', { exam }); push({ name: 'plan', guide, slug: p.slug }); }} />
          ))}
        </section>
      ) : null}
      <section className="stack">
        <h2 className="section-title">Your plans</h2>
        {!auth.user ? <p className="note">Sign in to see plans saved on your account.</p> : null}
        {auth.plansError ? <p className="warn">{auth.plansError}</p> : null}
        {auth.user && auth.plans.length === 0 ? <p className="note">No saved plan yet.</p> : null}
        {auth.plans.map((plan) => (
          <RowLink key={plan.id} title={`${examLabel(plan.exam)} · ${plan.level}`} detail={`${plan.days} days · ${plan.createdAt || ''}`} onClick={() => push({ name: 'roadmap', id: plan.id })} />
        ))}
      </section>
      <PracticePanel exam={exam} level={level} variant={exam === 'TCF' ? variant : null} />
      <p className="note">A banner ad can sit under this screen when you are signed in and have answered the consent question. Guides, study paths, comparisons and the calculators stay ad-free. <button type="button" className="text-btn" onClick={() => { logNativeEvent('donation_click', { platform: 'funding', provider: 'funding' }); openExternal(FUNDING_URL); }}>Why ads?</button></p>
    </div>
  );
}

function PracticePanel({ exam, level }) {
  const auth = useAuth();
  const { push } = useNav();
  const [skill, setSkill] = useState('reading');
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState({});
  async function make() {
    if (!auth.user) {
      push({ name: 'account' });
      return;
    }
    setBusy(true);
    setError('');
    try {
      const token = await auth.user.getIdToken();
      const out = await apiPost('/api/practice', { exam, level, skill, count: 5 }, token, 120000);
      setItems(out.items || []);
      setOpen({});
    } catch (err) {
      setError(authMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="stack">
      <h2 className="section-title">Unofficial practice</h2>
      <p className="note">Original questions, not from the exam board. A free account is required, same as the website.</p>
      <div className="chips">
        {SKILLS.map((s) => (
          <button key={s} type="button" className="chip" aria-pressed={skill === s} onClick={() => setSkill(s)}>{s}</button>
        ))}
      </div>
      <button type="button" className="ghost" disabled={busy} onClick={make}>{busy ? 'Writing questions…' : 'Make 5 questions'}</button>
      {error ? <p className="warn">{error}</p> : null}
      {items?.map((item, i) => (
        <div className="card" key={item.id || i}>
          <h3>{i + 1}. {item.prompt}</h3>
          {item.options?.map((opt) => <p key={opt}>{opt}</p>)}
          <button type="button" className="text-btn" onClick={() => setOpen((s) => ({ ...s, [i]: !s[i] }))}>{open[i] ? 'Hide answer' : 'Show answer'}</button>
          {open[i] ? <p>{item.answer}{item.explanation ? ` ${item.explanation}` : ''}</p> : null}
        </div>
      ))}
    </section>
  );
}

export function RoadmapScreen({ id }) {
  const auth = useAuth();
  const plan = auth.plans.find((p) => p.id === id);
  if (!auth.user) return <Empty title="Sign in to open a saved plan" />;
  if (!plan) return <Empty title="That plan is not on this account" detail={auth.plansError || 'It may still be loading.'} />;
  const scheduled = hasSchedule(plan);
  const days = scheduled ? planDays(plan) : [];
  const progress = scheduled ? planProgress(plan, days) : null;
  const today = scheduled ? currentDay(plan) : 1;
  let phasePct = 0;
  if (!scheduled) {
    const tasks = (plan.phases || []).reduce((n, p) => n + (p.tasks || []).length, 0);
    const done = Object.values(plan.completedTasks || {}).filter(Boolean).length;
    phasePct = tasks ? Math.round((done / tasks) * 100) : 0;
  }
  const pct = progress?.pct ?? phasePct;
  return (
    <article className="stack">
      <header style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
        <Ring pct={pct} />
        <div>
          <p className="eyebrow">{pct}% done</p>
          <h2 className="display" style={{ fontSize: '1.55rem' }}>{examLabel(plan.exam)} · {plan.level}</h2>
          <p className="note">{plan.days} days{plan.createdAt ? ` · started ${plan.createdAt}` : ''}</p>
        </div>
      </header>
      {plan.summary ? <p className="lead">{plan.summary}</p> : null}
      {progress ? <p className="note">{progress.onTrack ? 'On the pace this schedule set.' : 'Behind the pace this schedule set.'} {progress.insufficientHistory ? 'Too early to judge the pace.' : ''}</p> : null}
      {scheduled ? days.map((day) => (
        <section key={day.day} className="card">
          <h3>Day {day.day}{day.day === today ? ' · today' : ''}</h3>
          {day.tasks.map((task) => {
            const done = task.key in (plan.progress?.done || {});
            return (
              <button key={task.key} type="button" className="check" aria-pressed={done} onClick={() => auth.toggleCalendarTask(plan, task.key)}>
                <i />
                <span>{task.text}{task.minutes ? ` · ${task.minutes} min` : ''}</span>
              </button>
            );
          })}
        </section>
      )) : (plan.phases || []).map((phase, pi) => (
        <section key={phase.phaseTitle || pi} className="card">
          <h3>{phase.phaseTitle}</h3>
          {phase.focus ? <p>{phase.focus}</p> : null}
          {(phase.tasks || []).map((task, ti) => {
            const key = `${pi}-${ti}`;
            const done = !!plan.completedTasks?.[key];
            return (
              <button key={key} type="button" className="check" aria-pressed={done} onClick={() => auth.togglePhaseTask(plan, key)}>
                <i />
                <span>{typeof task === 'string' ? task : task.text}</span>
              </button>
            );
          })}
        </section>
      ))}
      {plan.verifiedResources?.length ? (
        <section className="stack">
          <h2 className="section-title">Resources in this plan</h2>
          {plan.verifiedResources.map((r) => (
            <External key={r.url} href={r.url}>{r.title}</External>
          ))}
        </section>
      ) : null}
      <button type="button" className="ghost" onClick={() => { if (window.confirm('Delete this plan from your account?')) auth.deletePlan(plan.id); }}>Delete this plan</button>
    </article>
  );
}

export function AccountScreen() {
  const auth = useAuth();
  const { setConsent } = useNav();
  const [mode, setMode] = useState('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      if (mode === 'reset') {
        await auth.reset(email);
        setInfo('If an account uses that email, a reset link is on its way.');
      } else if (mode === 'login') await auth.signIn(email, password);
      else await auth.signUp(email, password);
    } catch (err) {
      setError(authMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!auth.ready) return <p className="note">Checking your account…</p>;
  if (auth.user) {
    return (
      <div className="stack">
        <header>
          <p className="eyebrow">Your account</p>
          <h2 className="display" style={{ fontSize: '1.7rem' }}>{auth.user.email || 'Signed in'}</h2>
        </header>
        {auth.user.emailVerified === false ? <p className="banner">This email is not verified yet. You can still use your plans.</p> : null}
        <button type="button" className="ghost" onClick={() => auth.signOut()}>Sign out</button>
        <button type="button" className="ghost" onClick={() => setConsent(null)}>Cookie settings</button>
        <External href={PRIVACY_URL}>Privacy notice</External>
        <External href={FUNDING_URL}>How the project is funded</External>
        <section className="card">
          <h3>Delete my account</h3>
          <p>This removes your sign-in and everything stored under it: plans, progress and review cards. Type DELETE to confirm.</p>
          <label className="field">Confirmation
            <input data-clarity-mask="true" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          <button type="button" className="ghost" style={{ marginTop: '0.6rem' }} onClick={async () => {
            setError('');
            try { await auth.deleteAccount(confirm); } catch (err) { setError(authMessage(err)); }
          }}>Delete my account</button>
          {error ? <p className="warn">{error}</p> : null}
        </section>
      </div>
    );
  }
  return (
    <form className="stack" onSubmit={submit}>
      <header>
        <p className="eyebrow">{mode === 'login' ? 'Sign in' : mode === 'reset' ? 'Reset password' : 'Create a free account'}</p>
        <h2 className="display" style={{ fontSize: '1.7rem' }}>The same account as the website.</h2>
        <p className="lead">Email and password, or Google. Plans stay in Firebase under your account only.</p>
      </header>
      <label className="field">Email
        <input data-clarity-mask="true" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      {mode !== 'reset' ? (
        <label className="field">Password
          <input data-clarity-mask="true" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
      ) : null}
      {error ? <p className="warn">{error}</p> : null}
      {info ? <p className="good">{info}</p> : null}
      <button className="primary" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'reset' ? 'Send reset email' : 'Create account'}</button>
      <button className="ghost" type="button" onClick={async () => {
        setError('');
        setBusy(true);
        try { await auth.signInGoogle(); } catch (err) { setError(authMessage(err)); } finally { setBusy(false); }
      }}>Continue with Google</button>
      <button type="button" className="text-btn" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
        {mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
      </button>
      <button type="button" className="text-btn" onClick={() => setMode('reset')}>Forgot password</button>
      <p className="note">Password and email fields are masked in session recordings. <External href={PRIVACY_URL}>Privacy notice</External></p>
    </form>
  );
}
