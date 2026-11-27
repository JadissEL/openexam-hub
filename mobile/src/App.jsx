import { useCallback, useEffect, useMemo, useState } from 'react';
import { examPageBySlug } from '@hub/src/seo/site.js';
import { AuthProvider, useAuth } from './auth.jsx';
import { NavContext } from './nav.js';
import { TABS, TAB_ROOT, tabOf, isAdRoute, screenName, routeFromUrl } from './paths.js';
import {
  exitApp, lightHaptic, logNativeEvent, onAppUrl, onBackButton, openExternal,
  requestAdConsent, setAnalyticsEnabled, setBanner, setClarityEnabled, setNativeScreen, setSensitive, syncStatusBar
} from './native.js';
import { Icon, Mark } from './ui.jsx';
import { CompareHub, CompareScreen, ExamList, ExamScreen, HomeScreen, PlanScreen } from './browse.jsx';
import { CefrTool, ClbTool, CrsTool, ToolsHome } from './tools.jsx';
import { AccountScreen, LibraryScreen, PlannerScreen, RoadmapScreen } from './study.jsx';

const CONSENT_KEY = 'oeh_consent_v1';

function readConsent() {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

function titleFor(route) {
  if (!route || route.name === 'home') return '';
  if (route.name === 'exams') return 'Exams';
  if (route.name === 'exam') return examPageBySlug(route.slug)?.label || 'Exam';
  if (route.name === 'plan') return 'Study path';
  if (route.name === 'tools') return 'Tools';
  if (route.name === 'clb') return 'CLB converter';
  if (route.name === 'cefr') return 'CEFR converter';
  if (route.name === 'crs') return 'CRS points';
  if (route.name === 'compare') return 'Compare';
  if (route.name === 'compareDetail') return 'Comparison';
  if (route.name === 'library') return 'Library';
  if (route.name === 'planner') return 'Study';
  if (route.name === 'roadmap') return 'Your plan';
  if (route.name === 'account') return 'Account';
  return 'OpenExam Hub';
}

function Screen({ route, query, setQuery, setClbMode }) {
  switch (route.name) {
    case 'home':
      return <HomeScreen />;
    case 'exams':
      return <ExamList query={query} onQuery={setQuery} />;
    case 'exam':
      return <ExamScreen slug={route.slug} />;
    case 'plan':
      return <PlanScreen guide={route.guide} slug={route.slug} />;
    case 'tools':
      return <ToolsHome />;
    case 'clb':
      return <ClbTool mode={route.mode} onMode={(mode) => setClbMode(mode)} />;
    case 'cefr':
      return <CefrTool />;
    case 'crs':
      return <CrsTool />;
    case 'compare':
      return <CompareHub />;
    case 'compareDetail':
      return <CompareScreen slug={route.slug} />;
    case 'library':
      return <LibraryScreen />;
    case 'planner':
      return <PlannerScreen presetExam={route.exam} />;
    case 'roadmap':
      return <RoadmapScreen id={route.id} />;
    case 'account':
      return <AccountScreen />;
    default:
      return <HomeScreen />;
  }
}

function Shell() {
  const auth = useAuth();
  const [tab, setTab] = useState('home');
  const [stacks, setStacks] = useState({
    home: [{ name: 'home' }],
    exams: [{ name: 'exams' }],
    tools: [{ name: 'tools' }],
    library: [{ name: 'library' }],
    study: [{ name: 'planner' }]
  });
  const [query, setQuery] = useState('');
  const [consent, setConsentState] = useState(readConsent);
  const [online, setOnline] = useState(() => navigator.onLine);
  const route = stacks[tab][stacks[tab].length - 1];

  const setConsent = useCallback((value) => {
    setConsentState(value);
    try {
      if (value) localStorage.setItem(CONSENT_KEY, value);
      else localStorage.removeItem(CONSENT_KEY);
    } catch {
      /* private mode */
    }
  }, []);

  const push = useCallback((next) => {
    const t = tabOf(next);
    setTab(t);
    setStacks((prev) => {
      const stack = prev[t];
      const top = stack[stack.length - 1];
      if (top?.name === next.name) {
        return { ...prev, [t]: stack.slice(0, -1).concat(next) };
      }
      return { ...prev, [t]: [...stack, next] };
    });
  }, []);

  const pop = useCallback(() => {
    setStacks((prev) => {
      const stack = prev[tab];
      if (stack.length < 2) return prev;
      return { ...prev, [tab]: stack.slice(0, -1) };
    });
  }, [tab]);

  const openUrl = useCallback((url) => {
    const next = routeFromUrl(url);
    if (!next) return;
    if (next.external) {
      openExternal(next.external);
      return;
    }
    const t = tabOf(next);
    const root = { name: TAB_ROOT[t] };
    setTab(t);
    setStacks((prev) => ({
      ...prev,
      [t]: next.name === root.name ? [next] : [root, next]
    }));
  }, []);

  useEffect(() => syncStatusBar(), []);
  useEffect(() => {
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => syncStatusBar();
    dark.addEventListener('change', apply);
    return () => dark.removeEventListener('change', apply);
  }, []);
  useEffect(() => onBackButton(() => {
    if (stacks[tab].length > 1) pop();
    else if (tab !== 'home') setTab('home');
    else exitApp();
  }), [stacks, tab, pop]);
  useEffect(() => onAppUrl(openUrl), [openUrl]);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    const granted = consent === 'granted';
    setAnalyticsEnabled(granted);
    setClarityEnabled(granted);
    if (consent) requestAdConsent();
  }, [consent]);

  useEffect(() => {
    setSensitive(route.name === 'account');
    if (consent === 'granted') {
      setNativeScreen(screenName(route));
      logNativeEvent('screen_view', { screen_name: screenName(route) });
    }
  }, [consent, route]);

  useEffect(() => {
    const show = !!consent && !!auth.user && isAdRoute(route);
    setBanner(show, consent === 'granted').then((res) => {
      const height = Number(res?.height) || 0;
      document.documentElement.style.setProperty('--ad', show && height ? `${height}px` : '0px');
    });
  }, [consent, auth.user, route]);

  const nav = useMemo(() => ({ push, pop, route, tab, consent, setConsent }), [push, pop, route, tab, consent, setConsent]);
  const rooted = stacks[tab].length > 1;
  const heading = titleFor(route);

  return (
    <NavContext.Provider value={nav}>
      <div className="app">
        <header className="top">
          {rooted ? (
            <button type="button" className="back-btn" onClick={pop} aria-label="Back">
              <Icon name="back" /> Back
            </button>
          ) : (
            <div className="brand">
              <Mark />
              <strong>OpenExam Hub</strong>
            </div>
          )}
          <div className="grow">{rooted ? <h1>{heading}</h1> : null}</div>
          <button type="button" className="icon-btn" aria-label={auth.user ? 'Your account' : 'Sign in'} onClick={() => push({ name: 'account' })}>
            <Icon name="study" />
          </button>
        </header>
        <main className="main">
          {!online ? <p className="banner">You are offline. Guides, tools and saved pages in this app still open.</p> : null}
          <Screen route={route} query={query} setQuery={setQuery} setClbMode={(mode) => push({ name: 'clb', mode })} />
        </main>
        <nav className="tabs" aria-label="Primary">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={tab === item.id ? 'page' : undefined}
              onClick={() => {
                lightHaptic();
                if (tab === item.id) setStacks((s) => ({ ...s, [item.id]: [item.root] }));
                else setTab(item.id);
              }}
            >
              <Icon name={item.id} />
              {item.label}
            </button>
          ))}
        </nav>
        {consent == null ? (
          <div className="sheet" role="dialog" aria-labelledby="consent-title">
            <p className="eyebrow" id="consent-title">Cookies and ads</p>
            <p className="note">
              With your OK, the app uses Google Analytics for Firebase and Microsoft Clarity (heatmaps and session recordings).
              A banner ad can appear only in the signed-in study planner. Nothing starts until you choose. Password fields stay masked.
            </p>
            <div className="actions">
              <button type="button" className="ghost" onClick={() => setConsent('denied')}>Reject</button>
              <button type="button" className="primary" onClick={() => setConsent('granted')}>Accept</button>
            </div>
            <button type="button" className="text-btn" onClick={() => openExternal('https://openexamhub.org/privacy')}>Privacy notice</button>
          </div>
        ) : null}
      </div>
    </NavContext.Provider>
  );
}

export default function App() {
  const [consent] = useState(readConsent);
  return (
    <AuthProvider analyticsOn={consent === 'granted'}>
      <Shell />
    </AuthProvider>
  );
}
