import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  Sparkles,
  BookOpen,
  CheckCircle2,
  Circle,
  ExternalLink,
  Search,
  FileCheck2,
  Link2,
  Calendar,
  HeartHandshake,
  Coins,
  Server,
  Code2,
  Lock,
  UserCheck,
  LogOut,
  TrendingUp,
  Info,
  ArrowRight,
  Zap,
  Globe,
  Award,
  RefreshCw,
  Layers,
  EyeOff,
  Check,
  Download,
  FileText,
  FileJson,
  Database,
  PlusCircle,
  Mail,
  KeyRound,
  UserPlus,
  LogIn,
  ShieldAlert,
  Activity,
  Home,
  Heart,
  ChevronDown,
  Trash2
} from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  connectAuthEmulator
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  collection,
  query,
  where,
  orderBy,
  limit,
  updateDoc,
  deleteDoc,
  deleteField,
  connectFirestoreEmulator
} from 'firebase/firestore';
import { firebaseConfig, APP_ID, API_BASE, SERVER_ENABLED } from './firebaseConfig.js';
import { DONATION_LINKS } from './donations.js';
import { FIVE_YEAR_GOAL_EUR, FUNDING_PROMISE } from './funding.js';
import { BooksPanel } from './BooksPanel.jsx';
import { PICKER_EXAMS, DEFAULT_PICKER_EXAM, examLabel, pickerExam, normalizeVariant, defaultVariant, parsePlannerQuery, IELTS_BANDS, ieltsBandLevel } from '../lib/exams.js';
import StudyToday from './StudyToday.jsx';
import DashboardAd from './DashboardAd.jsx';
import AuthGate from './AuthGate.jsx';
import ReviewDeck, { SaveToDeckButton, cardFromPractice, cardIdFor } from './ReviewDeck.jsx';
import { dueQueue, retention as srsRetention } from '../lib/algo/srs.js';
import { quantiseProfile, localDate, hasSchedule, planDays, currentDay } from './lib/plan.js';

// ============================================================================
// FIREBASE INITIALIZATION (MANDATORY CONFIG + SAFE FALLBACK)
// ============================================================================
let db = null;
let auth = null;
let appId = APP_ID;

try {
  // Gemini Canvas / embedded hosts may inject __firebase_config; otherwise use src/firebaseConfig.js (Vite env + defaults).
  const injected =
    typeof __firebase_config !== 'undefined' && __firebase_config ? JSON.parse(__firebase_config) : null;
  const config = injected || firebaseConfig;
  if (config && config.apiKey && config.projectId) {
    const app = getApps().length === 0 ? initializeApp(config) : getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);
    // Local testing only: VITE_FIREBASE_EMULATORS=true points the app at the Auth (9099) and
    // Firestore (8085) emulators. Never set in production builds.
    if (import.meta.env.VITE_FIREBASE_EMULATORS === 'true') {
      const authPort = import.meta.env.VITE_AUTH_EMULATOR_PORT || '9099';
      const fsPort = Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || 8085);
      connectAuthEmulator(auth, `http://127.0.0.1:${authPort}`, { disableWarnings: true });
      connectFirestoreEmulator(db, '127.0.0.1', fsPort);
    }
  }
  if (typeof __app_id !== 'undefined' && __app_id) appId = __app_id;
} catch (err) {
  console.warn('Firebase initialization standby:', err);
}

// ============================================================================
// OFFICIAL DOMAIN ALLOWLIST (COPYRIGHT & LICENSE AUDITOR GUARDRAIL)
// ============================================================================
const OFFICIAL_DOMAIN_ALLOWLIST = [
  'france-education-international.fr',
  'tv5monde.com',
  'rfi.fr',
  'britishcouncil.org',
  'ielts.org',
  'cambridgeenglish.org',
  'goethe.de',
  'dw.com',
  'vhs-lernportal.de',
  'europa.eu',
  'lefrancaisdesaffaires.fr',
  'canada.ca',
  'ets.org',
  'cervantes.es',
  'cervantes.org',
  'testdaf.de',
  'ambafrance-ca.org'
];

/**
 * Strict allowlist check ONLY. This does not prove a link works; reachability
 * comes from the server's real HTTP check (see linkStatusBadge / /api/check-link).
 */
function verifyOfficialDomain(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    const isAllowlisted =
      parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      OFFICIAL_DOMAIN_ALLOWLIST.some(
        (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
      );
    return { isOfficial: isAllowlisted, hostname };
  } catch {
    return { isOfficial: false, hostname: null };
  }
}

/** Truthful label + colour for a resource's link state. Never claims "verified" without a real check. */
function linkStatusBadge(res, liveStatus) {
  const { isOfficial } = verifyOfficialDomain(res.url);
  if (!isOfficial) return { label: 'Not on official allowlist', tone: 'red' };
  const status = liveStatus || res.linkStatus;
  switch (status) {
    case 'ok':
      return { label: 'Official domain • link checked, reachable', tone: 'green' };
    case 'unverified':
      return { label: 'Official domain • site blocks automated checks', tone: 'amber' };
    case 'dead':
      return { label: 'Official domain • link appears broken', tone: 'red' };
    case 'error':
      return { label: 'Official domain • check failed, try later', tone: 'amber' };
    case 'checking':
      return { label: 'Checking link…', tone: 'slate' };
    default:
      return { label: 'Official domain • link not checked yet', tone: 'slate' };
  }
}

// ============================================================================
// SERVER + DONATION CONFIG
// ============================================================================
// API_BASE and SERVER_ENABLED come from src/firebaseConfig.js (VITE_API_BASE / VITE_SERVER_ENABLED).
// '' = same-origin /api (the Vercel functions in this repo). SERVER_ENABLED=false = preview mode:
// fallback roadmaps + in-browser generation, nothing link-checked, nothing written to shared data.

// Errors shown in the UI never carry raw server text: only 400 input errors (written for users)
// pass through; everything else becomes the caller's friendly fallback. Details go to the console.
class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
function friendlyError(err, fallback) {
  return err instanceof ApiError && err.status === 400 && err.message ? err.message : fallback;
}

async function apiPost(path, body, { token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Server error ${res.status}`, res.status);
  return data;
}

async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Server error ${res.status}`, res.status);
  return data;
}

// Real donation pages. Amounts reach the public ledger only through
// signature-verified server webhooks, never from this browser.
// Donation links live in src/donations.js (empty link = hidden).

// ============================================================================
// CURATED OFFICIAL FALLBACK REPOSITORIES
// ============================================================================
const FALLBACK_ROADMAPS = {
  TCF: {
    exam: 'TCF',
    level: 'B2',
    days: 30,
    summary:
      'Structured 30-day TCF preparation leveraging official France Éducation international sample papers, TV5Monde comprehension drills, and RFI Savoirs audio archives.',
    verifiedResources: [
      {
        title: 'France Éducation international — Official TCF Candidate Manual & Samples',
        url: 'https://www.france-education-international.fr/test/tcf-tout-public',
        license: 'Official Public Exam Portal (Free Access)',
        category: 'Official Mock Tests'
      },
      {
        title: 'TV5Monde — Apprendre le français (TCF Simulation Series)',
        url: 'https://apprendre.tv5monde.com/fr/tcf',
        license: 'Public Service Broadcaster Educational Commons',
        category: 'Listening & Grammar'
      },
      {
        title: 'RFI Savoirs — Le journal en français facile & TCF Exercises',
        url: 'https://francaisfacile.rfi.fr/fr/',
        license: 'Open Public Media Archive',
        category: 'Oral Comprehension'
      }
    ],
    phases: [
      {
        phaseTitle: 'Days 1–10: Diagnostic & Listening Mechanics (Compréhension Orale)',
        focus: 'Audio speed adaptation, radio broadcasts, and fast multiple-choice elimination',
        tasks: [
          'Day 1–3: Complete 1 full official diagnostic listening set on TV5Monde TCF simulator.',
          'Day 4–7: Listen daily to 15 minutes of RFI Journal en français facile without subtitles, then verify transcript.',
          'Day 8–10: Master B2 discourse markers (cependant, néanmoins, en revanche) using official grammar sheets.'
        ]
      },
      {
        phaseTitle: 'Days 11–20: Reading Speed & Language Structures (Structures de la langue)',
        focus: 'Subjunctive triggers, relative pronouns (dont, auquel), and timed press reading',
        tasks: [
          'Day 11–14: Complete 3 timed 25-minute reading comprehension drills using France Éducation sample items.',
          'Day 15–17: Drill 50 high-frequency TCF grammar structure questions focusing on verb mood and prepositions.',
          'Day 18–20: Summarize 2 Francophone editorial articles in 120 words to build syntactic precision.'
        ]
      },
      {
        phaseTitle: 'Days 21–30: Full Exam Simulation & Weakness Calibration',
        focus: 'Strict time management (90 minutes total core sections) and error logging',
        tasks: [
          'Day 21–25: Take 2 full back-to-back mock exams under strict timer conditions.',
          'Day 26–28: Audit every missed question from Days 1–20 and re-test weak grammar patterns.',
          'Day 29–30: Final light audio warm-up and rest 24 hours prior to exam day.'
        ]
      }
    ]
  },
  IELTS: {
    exam: 'IELTS',
    level: 'C1',
    days: 30,
    summary:
      'High-efficiency 30-day IELTS Academic/General roadmap built exclusively from British Council TakeIELTS free practice tests, IDP official sample tasks, and Cambridge open sample papers.',
    verifiedResources: [
      {
        title: 'British Council — Free Online IELTS Practice Tests (All 4 Skills)',
        url: 'https://takeielts.britishcouncil.org/prepare/ielts-free-practice-mock-tests',
        license: 'Official Co-Owner Public Resource',
        category: 'Full Practice Tests'
      },
      {
        title: 'IDP / IELTS.org — Official Sample Test Questions & Band Descriptors',
        url: 'https://ielts.org/take-a-test/preparation-resources/sample-test-questions',
        license: 'Official IELTS Partners Open Samples',
        category: 'Writing & Speaking'
      },
      {
        title: 'Cambridge English — Official IELTS Preparation Guides & Sample Papers',
        url: 'https://www.cambridgeenglish.org/exams-and-tests/ielts/preparation/',
        license: 'Official Assessment Board Free Downloads',
        category: 'Reading & Listening'
      }
    ],
    phases: [
      {
        phaseTitle: 'Days 1–10: Question Archetypes & Skimming/Scanning Precision',
        focus: 'True/False/Not Given logic, Matching Headings, and Section 3/4 Listening',
        tasks: [
          'Day 1–3: Complete British Council Reading & Listening diagnostic tests under strict 60/30 min clocks.',
          'Day 4–7: Build keyword paraphrasing tables for Academic Reading passages.',
          'Day 8–10: Record 5 two-minute Speaking Part 2 cue-card monologues and evaluate coherence.'
        ]
      },
      {
        phaseTitle: 'Days 11–20: Task 1 Data Synthesis & Task 2 Essay Architecture',
        focus: 'Cohesion & Coherence (25% of Writing score) and Lexical Resource',
        tasks: [
          'Day 11–14: Write 4 Task 1 visual reports (trend charts, process diagrams) comparing against official samples.',
          'Day 15–18: Write 4 Task 2 argumentative essays in 40 minutes each using clear PEEL paragraph structure.',
          'Day 19–20: Practice Listening Section 4 academic lectures at 1.1x speed.'
        ]
      },
      {
        phaseTitle: 'Days 21–30: Full Timed Simulations & Band Descriptor Audit',
        focus: 'Endurance across 2h 45m continuous testing without fatigue drops',
        tasks: [
          'Day 21–25: Execute 2 complete uninterrupted IELTS mock sittings.',
          'Day 26–28: Cross-check all writing essays against official public IELTS Band Descriptors.',
          'Day 29–30: Review personal vocabulary collocation bank and exam logistics.'
        ]
      }
    ]
  },
  GOETHE: {
    exam: 'GOETHE',
    level: 'B1',
    days: 30,
    summary:
      'Focused 30-day Goethe-Zertifikat preparation utilizing official Goethe-Institut Modellsätze, Deutsche Welle (DW) Nicos Weg / Top-Thema, and VHS Lernportal open curriculum.',
    verifiedResources: [
      {
        title: 'Goethe-Institut — Official Modellsätze & Übungsmaterialien (A1–C2)',
        url: 'https://www.goethe.de/de/spr/prf/ueb.html',
        license: 'Official Examination Board Free Downloads (PDF + MP3)',
        category: 'Official Mock Sets'
      },
      {
        title: 'Deutsche Welle (DW) — Deutsch Lernen & Top-Thema mit Vokabeln',
        url: 'https://learngerman.dw.com/de/deutsch-lernen/s-9095',
        license: 'Public Broadcaster Open Educational Resource',
        category: 'Listening & Vocabulary'
      },
      {
        title: 'VHS-Lernportal — Deutscher Volkshochschul-Verband Free Courses',
        url: 'https://www.vhs-lernportal.de/',
        license: 'Federal Ministry Funded Public Education Portal',
        category: 'Structured Modules'
      }
    ],
    phases: [
      {
        phaseTitle: 'Days 1–10: Goethe Modellsatz Familiarization & Core Connectors',
        focus: 'Nebensätze (weil, obwohl, damit), Hören Teil 1–4 formats',
        tasks: [
          'Day 1–4: Download official Goethe Modellsatz 1 PDF + MP3s and complete Lesen & Hören.',
          'Day 5–7: Complete 5 Deutsche Welle Top-Thema audio lessons with interactive comprehension checks.',
          'Day 8–10: Build a template bank of Redemittel (fixed phrases) for Schreiben & Sprechen.'
        ]
      },
      {
        phaseTitle: 'Days 11–20: Schreiben Modules & Sprechen Partner Simulation',
        focus: 'Formal/informal emails, opinion forum posts, and joint planning dialogue',
        tasks: [
          'Day 11–14: Write 4 complete Schreiben tasks adhering strictly to word-count and all 4 Leitpunkte.',
          'Day 15–17: Practice Sprechen Teil 1 (Gemeinsam etwas planen) using Redemittel prompts.',
          'Day 18–20: Work through VHS-Lernportal grammar units for passive voice and Konjunktiv II.'
        ]
      },
      {
        phaseTitle: 'Days 21–30: Modellsatz 2 Under Exam Conditions',
        focus: 'Strict module timing and zero missed Leitpunkte',
        tasks: [
          'Day 21–25: Run full Goethe Modellsatz 2 under strict official clock rules.',
          'Day 26–28: Review every false friend and preposition-case pair (warten auf + Akk, etc.).',
          'Day 29–30: Light review of speaking Redemittel cards before test day.'
        ]
      }
    ]
  },
  TEF_CANADA: {
    exam: 'TEF_CANADA',
    level: 'B2',
    days: 30,
    summary:
      'A 30-day TEF Canada plan built from official CCI Paris / Le français des affaires presentation, preparation and sample papers, plus IRCC’s page on approved language tests. The four compulsory immigration papers are Compréhension écrite, Compréhension orale, Expression écrite and Expression orale.',
    verifiedResources: [
      {
        title: 'TEF Canada — official exam overview and format (CCI Paris / Le français des affaires)',
        url: 'https://www.lefrancaisdesaffaires.fr/candidat/test-evaluation-francais/tef-canada/presentation/',
        license: 'Official exam-board page (free public access)',
        category: 'Official exam info'
      },
      {
        title: 'Préparer le TEF Canada — official preparation hub (all four sections)',
        url: 'https://www.lefrancaisdesaffaires.fr/candidat/test-evaluation-francais/tef-canada/preparation/',
        license: 'Official exam-board page (free public access)',
        category: 'Practice tests'
      },
      {
        title: 'IRCC — language tests for Express Entry',
        url: 'https://www.canada.ca/en/immigration-refugees-citizenship/services/immigrate-canada/express-entry/documents/language-test.html',
        license: 'Government of Canada page (free public access)',
        category: 'Official exam info'
      }
    ],
    phases: [
      {
        phaseTitle: 'Days 1–10: Format and official samples',
        focus: 'Learn the four compulsory papers and work through the official sample tasks',
        tasks: [
          'Read the official TEF Canada presentation so you know the timing and task types for each paper.',
          'Work through the official sample papers for Compréhension écrite and Compréhension orale (PDF and audio on the exam-board site).',
          'Read IRCC’s language-test page and the official TEF–NCLC correspondence table so you know how scores are reported.'
        ]
      },
      {
        phaseTitle: 'Days 11–20: Writing and speaking tasks',
        focus: 'Official Expression écrite (fait divers + argumentation) and Expression orale',
        tasks: [
          'Practise official Expression écrite section A (continue a short article, 80 words minimum, 25 minutes) and section B (justify a point of view, 200 words minimum, 35 minutes) using the exam-board sample and prep articles.',
          'Practise official Expression orale section A (obtain information, 5 minutes) and section B (argue to convince, 10 minutes) with the official sample tasks.',
          'Revisit any paper whose official sample felt hardest, still using only the exam-board materials.'
        ]
      },
      {
        phaseTitle: 'Days 21–30: Timed run-through and rest',
        focus: 'Sit the official samples under the published timings',
        tasks: [
          'Sit the official listening and reading samples under the published timings (40 and 60 minutes).',
          'Repeat one timed writing paper and one timed speaking practice from the official tasks.',
          'Light review of the official format page, then rest the day before the exam.'
        ]
      }
    ]
  },
  TOEFL: {
    exam: 'TOEFL',
    level: 'B2',
    days: 30,
    summary:
      'A 30-day TOEFL iBT plan built from official ETS pages for the test updated on 21 January 2026: the section overview, the official preparation page and ETS sample tests. The four sections are Reading, Listening, Writing and Speaking.',
    verifiedResources: [
      {
        title: 'ETS — TOEFL iBT test content (official overview)',
        url: 'https://www.ets.org/toefl/test-takers/ibt/about/content.html',
        license: 'Official exam-board page (free public access)',
        category: 'Official exam info'
      },
      {
        title: 'ETS — prepare for the TOEFL iBT test',
        url: 'https://www.ets.org/toefl/test-takers/ibt/prepare.html',
        license: 'Official exam-board page (free public access)',
        category: 'Practice tests'
      },
      {
        title: 'ETS — TOEFL iBT full-length official practice test 1 (PDF)',
        url: 'https://www.ets.org/pdfs/toefl/toefl-ibt-full-length-practice-test-1.pdf',
        license: 'Official exam-board sample (free public access)',
        category: 'Full Practice Tests'
      }
    ],
    phases: [
      {
        phaseTitle: 'Days 1–10: Know the 2026 format',
        focus: 'Official section order, task types and timings',
        tasks: [
          'Read the official ETS content and 2026 overview pages (Reading and Listening are adaptive; Writing and Speaking are linear).',
          'Skim the official speaking and writing rubrics published by ETS.',
          'Start the official preparation page activities for Reading and Listening.'
        ]
      },
      {
        phaseTitle: 'Days 11–20: Official samples by section',
        focus: 'ETS sample items for each section',
        tasks: [
          'Work through official ETS sample tasks for Writing (Build a Sentence, Write an Email, Write for an Academic Discussion).',
          'Work through official ETS sample tasks for Speaking (Listen and Repeat, Take an Interview).',
          'Continue official Reading and Listening practice on the ETS prepare and sample-test pages.'
        ]
      },
      {
        phaseTitle: 'Days 21–30: Official practice tests',
        focus: 'Sit ETS full-length official practice tests',
        tasks: [
          'Sit official ETS practice test 1 under exam conditions.',
          'Review missed items, then sit official ETS practice test 2 if you have time.',
          'Light review of the official format page, then rest the day before the exam.'
        ]
      }
    ]
  },
  DELE: {
    exam: 'DELE',
    level: 'B2',
    days: 30,
    summary:
      'A 30-day DELE plan built from official Instituto Cervantes pages: the diploma overview, the exam structure, and the candidate guide. Each CEFR level from A1 to C2 is a separate exam.',
    verifiedResources: [
      {
        title: 'Instituto Cervantes — Diplomas DELE (official overview)',
        url: 'https://cervantes.org/es/examenes/dele',
        license: 'Official exam-board page (free public access)',
        category: 'Official exam info'
      },
      {
        title: 'Instituto Cervantes — DELE exam structure and content',
        url: 'https://atenas.cervantes.es/es/examenes_espanol/diplomas_espanol/estructura_contenido.htm',
        license: 'Official exam-board page (free public access)',
        category: 'Official exam info'
      },
      {
        title: 'Instituto Cervantes — DELE candidate guide',
        url: 'https://atenas.cervantes.es/es/examenes_espanol/diplomas_espanol/guia_candidato.htm',
        license: 'Official exam-board page (free public access)',
        category: 'Official exam info'
      }
    ],
    phases: [
      {
        phaseTitle: 'Days 1–10: Format for your level',
        focus: 'Official papers, timings and candidate guide',
        tasks: [
          'Read the official Cervantes overview and the structure page for your diploma level (A1–C1 have four papers; C2 has three tests).',
          'Read the official candidate guide for registration and exam-day rules.',
          'List the official papers you must sit and their published timings.'
        ]
      },
      {
        phaseTitle: 'Days 11–20: Official practice by paper',
        focus: 'Reading, listening, writing and speaking as described by Cervantes',
        tasks: [
          'Practise reading and listening with official Cervantes materials or sample papers for your level, when they are available on an official page.',
          'Practise official writing task types described in the structure page for your level.',
          'Practise official speaking task types, including the published preparation time before the interview.'
        ]
      },
      {
        phaseTitle: 'Days 21–30: Timed papers and rest',
        focus: 'Sit official tasks under the published timings',
        tasks: [
          'Sit one official reading paper and one official listening paper under the published timings for your level.',
          'Repeat one timed official writing paper and one speaking practice.',
          'Light review of the official structure page, then rest the day before the exam.'
        ]
      }
    ]
  }
};

// Shown only while the visitor has no plan of their own. Read-only: ticks are not recorded.
const SAMPLE_ROADMAP = {
  ...FALLBACK_ROADMAPS.TEF_CANADA,
  id: 'sample-TEF_CANADA-B2-30',
  sample: true,
  createdAt: new Date().toISOString().slice(0, 10),
  completedTasks: {}
};

const TAB_FROM_HASH = {
  library: 'library',
  transparency: 'treasury',
  support: 'treasury',
  dashboard: 'generator',
  planner: 'generator',
  saved: 'saved',
  practice: 'practice'
};

// Linkable tabs: /app/library, /app/plans, /app/practice, /app/support (also ?tab=<name> and the
// older #hash form). Home is plain /app. The auth gate still wraps every one of these URLs.
const TAB_FROM_SLUG = { ...TAB_FROM_HASH, plans: 'saved', home: 'generator' };
const SLUG_FOR_TAB = { generator: '', saved: 'plans', library: 'library', practice: 'practice', treasury: 'support' };

function tabFromLocation() {
  if (typeof window === 'undefined') return null;
  const { pathname, search, hash } = window.location;
  let q = null;
  try {
    q = new URLSearchParams(search).get('tab');
  } catch {
    q = null;
  }
  const fromQuery = TAB_FROM_SLUG[String(q || '').toLowerCase()];
  if (fromQuery) return fromQuery;
  const m = /^\/app\/([a-z-]+)\/?$/i.exec(pathname || '');
  const fromPath = m ? TAB_FROM_SLUG[m[1].toLowerCase()] : null;
  if (fromPath) return fromPath;
  const h = (hash || '').replace(/^#/, '').toLowerCase();
  return TAB_FROM_HASH[h] || null;
}

/** Canonical URL for a tab, keeping other query params (e.g. ?exam=) but dropping ?tab and #hash. */
function urlForTab(tab) {
  const params = new URLSearchParams(window.location.search);
  params.delete('tab');
  const qs = params.toString();
  const slug = SLUG_FOR_TAB[tab] ?? '';
  return `/app${slug ? `/${slug}` : ''}${qs ? `?${qs}` : ''}`;
}

function isRegisteredUser(user) {
  return !!(user && !user.isAnonymous);
}

// ============================================================================
// DESIGN SYSTEM: neutral surfaces + warm orange accent (defined once, reused)
// ============================================================================
const THEME = {
  page: 'bg-[#F4F4F2] text-[#111111]',
  card: 'bg-white rounded-3xl border border-black/5 shadow-[0_1px_2px_rgba(17,17,17,0.04),0_12px_32px_-18px_rgba(17,17,17,0.14)]',
  label: 'text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500',
  primaryBtn:
    'inline-flex items-center justify-center gap-2 rounded-full bg-[#111111] hover:bg-neutral-800 text-white font-semibold transition disabled:opacity-60',
  accentBtn:
    'inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#C2410C] hover:bg-[#9A3412] text-white text-lg font-bold min-h-[56px] px-6 shadow-[0_12px_28px_-12px_rgba(255,107,26,0.8)] transition disabled:opacity-70',
  ghostBtn:
    'inline-flex items-center justify-center gap-2 rounded-full border border-black/10 bg-white hover:bg-neutral-50 text-neutral-800 font-semibold transition',
  segWrap: 'flex p-1 gap-1 rounded-full bg-[#F4F4F2] border border-black/5',
  seg: (active) =>
    `flex-1 min-h-[44px] px-2 sm:px-3 rounded-full text-sm font-semibold transition ${
      active ? 'bg-[#111111] text-white shadow-sm' : 'text-neutral-600 hover:text-neutral-950 hover:bg-white/70'
    }`,
  chip: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-black/5 text-xs font-semibold text-neutral-700',
  dot: { green: 'bg-green-500', amber: 'bg-amber-500', red: 'bg-red-500', slate: 'bg-neutral-300', orange: 'bg-[#FF6B1A]' },
  iconTile: 'w-10 h-10 rounded-xl bg-[#F4F4F2] text-neutral-800 flex items-center justify-center shrink-0',
  heroStyle: {
    backgroundImage:
      'radial-gradient(120% 120% at 0% 0%, #FF7A1A 0%, #FF6B1A 30%, rgba(255,107,26,0) 60%), radial-gradient(110% 120% at 100% 100%, #F7A8D8 0%, #F58BB8 35%, rgba(247,168,216,0) 70%), linear-gradient(135deg, #FF6B1A 0%, #F4708A 55%, #EFA0CF 100%)'
  },
  backdropStyle: {
    backgroundColor: 'rgba(17,17,17,0.28)',
    backgroundImage: 'linear-gradient(160deg, rgba(255,122,26,0.55) 0%, rgba(247,168,216,0.55) 100%)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)'
  }
};

const OE_GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
.oe-root { -webkit-tap-highlight-color: transparent; }
.oe-root h1, .oe-root h2, .oe-root h3 { letter-spacing: -0.02em; }
.oe-root :focus { outline: none; }
.oe-root :focus-visible { outline: 2px solid #FF6B1A; outline-offset: 2px; }
@keyframes oe-pop { 0% { transform: scale(.9); opacity: 0 } 60% { transform: scale(1.04); opacity: 1 } 100% { transform: scale(1); opacity: 1 } }
@keyframes oe-glow { 0% { box-shadow: 0 0 0 0 rgba(255,107,26,.35) } 100% { box-shadow: 0 0 0 16px rgba(255,107,26,0) } }
@keyframes oe-sheet { from { transform: translateY(28px); opacity: 0 } to { transform: none; opacity: 1 } }
.oe-pop { animation: oe-pop .45s cubic-bezier(.2,.8,.2,1) both; }
.oe-celebrate { animation: oe-glow 1.2s ease-out 1; }
.oe-sheet { animation: oe-sheet .28s cubic-bezier(.2,.8,.2,1) both; }
@media (prefers-reduced-motion: reduce) {
  .oe-root *, .oe-root *::before, .oe-root *::after {
    animation-duration: .01ms !important; animation-iteration-count: 1 !important;
    transition-duration: .01ms !important; scroll-behavior: auto !important;
  }
}
`;

// Build-log ("How we built it") step names: friendly labels instead of internal agent ids.
const AGENT_LABELS = {
  orchestrator: 'Request',
  global_cache: 'Shared plans',
  exam_format: 'Exam format',
  resource_library: 'Library',
  link_verifier: 'Link check',
  discovery: 'Find sources',
  copyright_auditor: 'Copyright check',
  scheduler: 'Schedule',
  planner: 'Wording',
  diagnostic: 'Level check',
  coach: 'Coach',
  practice: 'Practice'
};
function agentLabel(id) {
  const k = String(id || '');
  return AGENT_LABELS[k] || k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

const LEVEL_OPTIONS = [
  { value: 'A1', hint: 'Beginner' },
  { value: 'A2', hint: 'Elementary' },
  { value: 'B1', hint: 'Intermediate' },
  { value: 'B2', hint: 'Upper intermediate' },
  { value: 'C1', hint: 'Advanced' },
  { value: 'C2', hint: 'Mastery' }
];
const DAY_OPTIONS = [
  { value: 14, hint: 'Sprint' },
  { value: 30, hint: 'Steady' },
  { value: 60, hint: 'Deep' }
];

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function ProgressRing({ pct = 0, size = 64, stroke = 7 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${pct}% complete`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EFEFEC" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#FF6B1A"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(100, Math.max(0, pct)) / 100)}
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-neutral-950">{pct}%</span>
    </div>
  );
}

function StatusDot({ tone = 'slate', className = '' }) {
  return <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full shrink-0 ${THEME.dot[tone] || THEME.dot.slate} ${className}`} />;
}

// ============================================================================
// ROADMAP SHAPE GUARD: keeps personal saves inside the Firestore rule
// (<= 25 keys, integer days 1..180, CEFR level, id == doc id, bounded lists)
// ============================================================================
const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const ROADMAP_ALLOWED_KEYS = [
  'id', 'exam', 'level', 'days', 'createdAt', 'summary', 'completedTasks',
  'verifiedResources', 'phases', 'examProfile', 'pipeline', 'source',
  // v3 (deterministic scheduler): compact day codes + per-task completion map
  'planKey', 'scheduleMethod', 'calendar', 'allocation', 'progress',
  // IELTS target band label, e.g. 'Band 6.5' (the plan level is the mapped CEFR level)
  'targetScore'
];
function sanitizeRoadmapForStore(raw, docId) {
  if (!raw || typeof raw !== 'object' || !docId) return null;
  const days = Math.round(Number(raw.days));
  const exam = String(raw.exam || '').slice(0, 24);
  if (!CEFR_LEVELS.includes(raw.level) || !Number.isInteger(days) || days < 1 || days > 180) return null;
  if (exam.length < 2 || !Array.isArray(raw.phases)) return null;
  const out = {};
  ROADMAP_ALLOWED_KEYS.forEach((k) => {
    if (raw[k] !== undefined && raw[k] !== null) out[k] = raw[k];
  });
  out.id = docId;
  out.exam = exam;
  out.days = days;
  out.phases = raw.phases.slice(0, 60);
  if (typeof out.summary === 'string') out.summary = out.summary.slice(0, 5000);
  else delete out.summary;
  if (out.completedTasks && (typeof out.completedTasks !== 'object' || Array.isArray(out.completedTasks))) delete out.completedTasks;
  if (out.completedTasks) out.completedTasks = Object.fromEntries(Object.entries(out.completedTasks).slice(0, 2000));
  if (out.verifiedResources) out.verifiedResources = Array.isArray(out.verifiedResources) ? out.verifiedResources.slice(0, 60) : undefined;
  if (out.pipeline) out.pipeline = Array.isArray(out.pipeline) ? out.pipeline.slice(0, 40) : undefined;
  if (out.createdAt !== undefined && typeof out.createdAt !== 'string') out.createdAt = String(out.createdAt);
  if (out.planKey !== undefined) out.planKey = String(out.planKey).slice(0, 64);
  if (out.targetScore !== undefined) out.targetScore = String(out.targetScore).slice(0, 24);
  if (out.scheduleMethod !== undefined) out.scheduleMethod = String(out.scheduleMethod).slice(0, 32);
  // calendar must have exactly one entry per day, otherwise the plan falls back to the phase checklist.
  if (out.calendar && (!Array.isArray(out.calendar) || out.calendar.length !== days)) {
    delete out.calendar;
    delete out.progress;
  }
  if (out.allocation && (typeof out.allocation !== 'object' || Array.isArray(out.allocation))) delete out.allocation;
  if (out.progress) {
    const p = out.progress;
    const done = p && typeof p.done === 'object' && !Array.isArray(p.done) ? p.done : {};
    out.progress = { done: Object.fromEntries(Object.entries(done).filter(([, v]) => Number.isInteger(v)).slice(0, 2000)) };
    if (typeof p.onTrack === 'boolean') out.progress.onTrack = p.onTrack;
  }
  // JSON round-trip drops undefined values, which Firestore rejects.
  return JSON.parse(JSON.stringify(out));
}

// Coach agent returns {phaseTitle, focus, days, dayStart, dayEnd, tasks}; the checklist
// (and orchestrator roadmaps) use {phaseTitle, focus, tasks, startDay, endDay}.
function toClientPhases(serverPhases) {
  return (serverPhases || []).map((p, i) => ({
    phaseTitle: String(p.phaseTitle || `Phase ${i + 1}`),
    focus: String(p.focus || ''),
    tasks: Array.isArray(p.tasks) ? p.tasks.map(String) : [],
    ...(Number.isInteger(p.dayStart) ? { startDay: p.dayStart } : {}),
    ...(Number.isInteger(p.dayEnd) ? { endDay: p.dayEnd } : {})
  }));
}

// ============================================================================
// MAIN APPLICATION COMPONENT
// ============================================================================
// ============================================================================
// AUTH GATE: /app shows the dashboard only to signed-in, non-anonymous users.
// Nothing of the dashboard (shell, tabs, ad slot, Firestore listeners, API calls) is rendered or
// started before Firebase Auth has resolved and confirmed a real account.
// ============================================================================
const PUBLIC_HASH_REDIRECTS = { transparency: '/funding', support: '/funding', funding: '/funding' };

function GateLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F5F0] text-neutral-500 text-sm" role="status" data-testid="auth-loading">
      Loading…
    </div>
  );
}

export default function App() {
  const [state, setState] = useState(() => ({ ready: !auth, user: null }));

  useEffect(() => {
    if (!auth) return undefined;
    return onAuthStateChanged(auth, (user) => setState({ ready: true, user }));
  }, []);

  const signedIn = isRegisteredUser(state.user);

  // Signed-out deep links to public info (e.g. /app#transparency) go to the public page instead.
  const publicTarget =
    state.ready && !signedIn && typeof window !== 'undefined'
      ? PUBLIC_HASH_REDIRECTS[(window.location.hash || '').replace(/^#/, '').toLowerCase()]
      : null;
  useEffect(() => {
    if (publicTarget) window.location.replace(publicTarget);
  }, [publicTarget]);

  if (!state.ready || publicTarget) return <GateLoading />;
  if (!auth) return <Dashboard initialUser={null} />; // no Firebase config (local UI preview only)
  if (!signedIn) return <AuthGate auth={auth} sampleRoadmap={SAMPLE_ROADMAP} />;
  return <Dashboard key={state.user.uid} initialUser={state.user} />;
}

function Dashboard({ initialUser }) {
  // Navigation & Modal State
  const [activeTab, setActiveTab] = useState(() => tabFromLocation() || 'generator');
  const [showOriginModal, setShowOriginModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showContributeModal, setShowContributeModal] = useState(false);

  // Firebase Auth State
  const [firebaseUser, setFirebaseUser] = useState(initialUser || null);
  const [authReady, setAuthReady] = useState(!!initialUser);
  const [authMode, setAuthMode] = useState('signin'); // 'signin' | 'signup'
  const [authPrompt, setAuthPrompt] = useState('Free. Create a free account to generate your plan.');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authFeedback, setAuthFeedback] = useState(null);

  // Multi-Agent Generator Inputs
  const [selectedExam, setSelectedExam] = useState(() => parsePlannerQuery(typeof window !== 'undefined' ? window.location.search : '').exam || DEFAULT_PICKER_EXAM);
  const [selectedTcfVariant, setSelectedTcfVariant] = useState('tout_public');
  const [selectedLevel, setSelectedLevel] = useState(() => parsePlannerQuery(typeof window !== 'undefined' ? window.location.search : '').level || 'B2');
  // IELTS target band (e.g. '6.5'); null = not picked yet. The plan uses the mapped CEFR level.
  const [selectedBand, setSelectedBand] = useState(() => parsePlannerQuery(typeof window !== 'undefined' ? window.location.search : '').band || null);
  const [daysUntilExam, setDaysUntilExam] = useState(30);
  const [publicStats, setPublicStats] = useState(null);
  const [publicUsage, setPublicUsage] = useState(null);
  const [publicUsageTotal, setPublicUsageTotal] = useState(null);
  const [booksLoaded, setBooksLoaded] = useState(!SERVER_ENABLED);

  // Agent Pipeline & 2-Layer Cache Metrics State
  const [isGenerating, setIsGenerating] = useState(false);
  const [agentStep, setAgentStep] = useState(0); // 0 = idle, 1..4 = running agents, 5 = complete
  const [cacheLayerHit, setCacheLayerHit] = useState('personal'); // 'personal' | 'global' | 'live'
  const [cacheHitsCount, setCacheHitsCount] = useState(0); // this session only
  const [pipelineTrace, setPipelineTrace] = useState([]);
  const [srsCards, setSrsCards] = useState([]); // spaced-repetition cards for the selected exam
  const [diagnosticResult, setDiagnosticResult] = useState(null); // {skillScores, estimatedLevel, advice}
  const [linkStatuses, setLinkStatuses] = useState({});
  const [statusNotice, setStatusNotice] = useState(null);

  // Saved Roadmaps (Layer 1 Personal Cache)
  // A fresh visitor starts with no saved plans. Until they build one, the plan view shows a
  // clearly labelled read-only sample with no progress (never someone else's ticks).
  const [savedRoadmaps, setSavedRoadmaps] = useState([]);
  // Account self-service (account dialog + My plans)
  const [pendingDeletePlanId, setPendingDeletePlanId] = useState(null);
  const [deletingPlanId, setDeletingPlanId] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [accountDeleting, setAccountDeleting] = useState(false);
  const [accountDeleteError, setAccountDeleteError] = useState(null);
  const [activeRoadmapId, setActiveRoadmapId] = useState(null);

  // Public Financial Ledger & Ad-Sunset Engine (Backed by Firestore)
  // Real figures only: start at zero, filled from the server-written Firestore ledger.
  const [fundingSources, setFundingSources] = useState({
    githubSponsors: 0,
    githubOneTime: 0,
    openCollective: 0,
    koFiTips: 0,
    adsenseBridge: 0,
    communityTotalEur: null // server-computed total; preferred when present
  });
  const [ledgerLoaded, setLedgerLoaded] = useState(false);
  const [ledgerEvents, setLedgerEvents] = useState([]);

  // Real donation + ad totals from the server-written ledger only.
  const totalDonations = useMemo(() => {
    if (fundingSources.communityTotalEur != null) {
      return Number(Number(fundingSources.communityTotalEur).toFixed(2));
    }
    return Number(
      (
        fundingSources.githubSponsors +
        fundingSources.githubOneTime +
        fundingSources.openCollective +
        fundingSources.koFiTips
      ).toFixed(2)
    );
  }, [fundingSources]);
  const totalAdIncome = useMemo(
    () => Number((Number(fundingSources.adsenseBridge) || 0).toFixed(2)),
    [fundingSources]
  );
  const totalFunding = useMemo(
    () => Number((totalDonations + totalAdIncome).toFixed(2)),
    [totalDonations, totalAdIncome]
  );
  const hasFundingData = ledgerLoaded && (totalFunding > 0 || ledgerEvents.length > 0);
  const fundingPercentage = useMemo(() => {
    if (!ledgerLoaded || FIVE_YEAR_GOAL_EUR == null || !(FIVE_YEAR_GOAL_EUR > 0)) return null;
    return Math.min(100, Math.round((totalFunding / FIVE_YEAR_GOAL_EUR) * 100));
  }, [ledgerLoaded, totalFunding]);
  const adsOffAtGoal = ledgerLoaded && FIVE_YEAR_GOAL_EUR != null && FIVE_YEAR_GOAL_EUR > 0 && totalFunding >= FIVE_YEAR_GOAL_EUR;

  const activeRoadmap = useMemo(() => {
    return (
      savedRoadmaps.find((r) => r.id === activeRoadmapId) || savedRoadmaps[0] || SAMPLE_ROADMAP
    );
  }, [savedRoadmaps, activeRoadmapId]);

  // ==========================================================================
  // 1. FIREBASE AUTHENTICATION LISTENER (RULE 3 COMPLIANT)
  // ==========================================================================
  useEffect(() => {
    if (!auth) {
      setAuthReady(true);
      return;
    }

    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        }
      } catch (e) {
        console.warn('Initial auth fallback:', e);
      }
    };

    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const onNav = () => setActiveTab(tabFromLocation() || 'generator');
    window.addEventListener('hashchange', onNav);
    window.addEventListener('popstate', onNav);
    return () => {
      window.removeEventListener('hashchange', onNav);
      window.removeEventListener('popstate', onNav);
    };
  }, []);

  // Keep the address bar in step with the open tab so it can be bookmarked, shared and refreshed.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.history?.pushState) return;
    const target = urlForTab(activeTab);
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (current === target) return;
    const sameTab = (tabFromLocation() || 'generator') === activeTab;
    if (sameTab) window.history.replaceState(window.history.state, '', target); // normalise ?tab= / #hash forms
    else window.history.pushState({ tab: activeTab }, '', target);
  }, [activeTab]);

  // ==========================================================================
  // 2. FIRESTORE REAL-TIME SYNC: PERSONAL ROADMAPS + PUBLIC TREASURY LEDGER
  // ==========================================================================
  useEffect(() => {
    if (!db || !firebaseUser) return;

    // A) Sync User's Personal Saved Roadmaps (Layer 1 Cache)
    const userRoadmapsCol = collection(
      db,
      'artifacts',
      appId,
      'users',
      firebaseUser.uid,
      'roadmaps'
    );

    const unsubUserRoadmaps = onSnapshot(
      userRoadmapsCol,
      (snapshot) => {
        if (!snapshot.empty) {
          const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
          setSavedRoadmaps(docs);
        }
      },
      (err) => console.warn('User roadmaps sync standby:', err)
    );

    // B) Sync Global Public Treasury Metrics (Ad-Sunset Source of Truth)
    const treasuryDocRef = doc(
      db,
      'artifacts',
      appId,
      'public',
      'data',
      'treasury',
      'monthly_ledger'
    );

    const unsubTreasury = onSnapshot(
      treasuryDocRef,
      (docSnap) => {
        setLedgerLoaded(true);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setFundingSources({
            githubSponsors: Number(data.githubSponsors ?? 0) || 0,
            githubOneTime: Number(data.githubOneTime ?? 0) || 0,
            openCollective: Number(data.openCollective ?? 0) || 0,
            koFiTips: Number(data.koFiTips ?? 0) || 0,
            adsenseBridge: Number(data.adsenseBridge ?? 0) || 0,
            communityTotalEur:
              data.communityTotalEur != null && Number.isFinite(Number(data.communityTotalEur))
                ? Number(data.communityTotalEur)
                : null
          });
        }
      },
      (err) => console.warn('Treasury sync standby:', err)
    );

    // C) Sync Public Patronage Transactions Feed
    const eventsColRef = collection(
      db,
      'artifacts',
      appId,
      'public',
      'data',
      'ledger_events'
    );

    // Bounded feed: newest 20 only (the v3 rules reject unbounded lists of public collections).
    const unsubEvents = onSnapshot(
      query(eventsColRef, orderBy('createdAt', 'desc'), limit(20)),
      (snapshot) => {
        const fetched = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data()
        }));
        fetched.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        setLedgerEvents(fetched);
      },
      (err) => console.warn('Ledger events sync standby:', err)
    );

    return () => {
      unsubUserRoadmaps();
      unsubTreasury();
      unsubEvents();
    };
  }, [firebaseUser]);

  // Spaced-repetition deck for the selected exam (users/{uid}/srs, one doc per card, bounded).
  useEffect(() => {
    if (!db || !firebaseUser) return undefined;
    const col = collection(db, 'artifacts', appId, 'users', firebaseUser.uid, 'srs');
    const unsub = onSnapshot(
      query(col, where('exam', '==', String(selectedExam).toUpperCase()), limit(200)),
      (snap) => setSrsCards(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => console.warn('Review deck sync standby:', err)
    );
    return () => unsub();
  }, [firebaseUser, selectedExam]);

  const SRS_KEYS = ['id', 'exam', 'skill', 'front', 'back', 'state', 'due', 'stability', 'difficulty', 'reps', 'lapses', 'lastReview', 'interval', 'retrievability', 'source', 'createdAt'];
  const saveSrsCard = async (card) => {
    setSrsCards((prev) => [card, ...prev.filter((c) => c.id !== card.id)]);
    if (!db || !firebaseUser) return;
    const clean = Object.fromEntries(SRS_KEYS.filter((k) => card[k] !== undefined && card[k] !== null).map((k) => [k, card[k]]));
    try {
      await setDoc(doc(db, 'artifacts', appId, 'users', firebaseUser.uid, 'srs', card.id), clean);
    } catch (err) {
      console.warn('Review card save skipped:', err);
    }
  };
  const srsSummary = useMemo(() => {
    const now = Date.now();
    return { due: dueQueue(srsCards, now).length, retentionBySkill: srsRetention(srsCards, now).bySkill };
  }, [srsCards]);
  const openReview = () => {
    setActiveTab('practice');
    setTimeout(() => document.getElementById('oe-review')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' }), 60);
  };

  // Helper: Persist roadmap to user's Layer 1 personal cache
  const saveToPersonalCache = async (roadmapObj) => {
    if (!db || !firebaseUser) return;
    try {
      const ref = doc(
        db,
        'artifacts',
        appId,
        'users',
        firebaseUser.uid,
        'roadmaps',
        roadmapObj.id
      );
      const clean = sanitizeRoadmapForStore(roadmapObj, roadmapObj.id);
      if (!clean) {
        console.warn('Roadmap failed the saved-roadmap shape check; kept locally only.');
        return;
      }
      await setDoc(ref, clean);
    } catch (err) {
      console.warn('Personal cache write skipped:', err);
    }
  };

  // The shared community cache and usage metrics are written only by the server
  // (after real link checks). The browser just counts hits for this session.
  const recordCacheHitMetric = async () => {
    setCacheHitsCount((c) => c + 1);
  };

  useEffect(() => {
    if (!SERVER_ENABLED) return;
    let cancelled = false;
    apiGet('/api/stats')
      .then((out) => {
        if (cancelled) return;
        setPublicStats(out.stats || null);
        setPublicUsage(out.usage || null);
        setPublicUsageTotal(out.usageTotal || null);
        setBooksLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setPublicStats(null);
        setBooksLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ==========================================================================
  // 3. 2-LAYER TOKEN-COST DEFENSE + 4-STAGE MULTI-AGENT GENERATOR
  // ==========================================================================
  const examVariant = selectedExam === 'TCF' ? normalizeVariant('TCF', selectedTcfVariant) : null;
  const needsAccount = !!auth && !isRegisteredUser(firebaseUser);
  const getAccessToken = async () => (isRegisteredUser(firebaseUser) ? firebaseUser.getIdToken() : null);
  const openSignUp = (line) => {
    const message = line || 'Free. Create a free account to generate your plan.';
    setAuthMode('signup');
    setAuthPrompt(message);
    setShowAuthModal(true);
    setStatusNotice(message);
  };

  // IELTS: the band the learner picked is kept on the plan (the plan itself is built for the mapped CEFR level).
  const targetTag = (exam) => (exam === 'IELTS' && selectedExam === 'IELTS' && selectedBand ? { targetScore: `Band ${selectedBand}` } : {});

  const handleGenerateStudyPath = async (forceRefresh = false) => {
    // Firebase is configured: a real (non-anonymous) account is required before
    // we spend AI tokens or hit the shared plan cache on behalf of a learner.
    if (needsAccount) {
      openSignUp('Create a free account to generate your plan.');
      return;
    }

    const planName = `${examLabel(selectedExam)} ${selectedLevel}, ${daysUntilExam} days`;
    const cacheKey = `${selectedExam}${examVariant && examVariant !== defaultVariant(selectedExam) ? `-${examVariant.toUpperCase()}` : ''}-${selectedLevel}-${daysUntilExam}`;
    setStatusNotice(null);

    // LAYER 1 DEFENSE: Check user's personal saved roadmaps first (€0.00 cost)
    const personalHit = savedRoadmaps.find((r) => r.id === cacheKey);
    if (personalHit && !forceRefresh) {
      setActiveRoadmapId(personalHit.id);
      setCacheLayerHit('personal');
      setAgentStep(5);
      await recordCacheHitMetric();
      setStatusNotice(
        `Opened your saved plan for ${planName}.`
      );
      return;
    }

    // LAYER 2 DEFENSE: shared plan cache (€0.00 cost).
    //  - server mode: GET /api/plan (CDN-cached, rescheduled for exactly these days); 404 = miss
    //  - preview mode: legacy client read of global_verified_roadmaps
    if (!forceRefresh && SERVER_ENABLED) {
      try {
        const profile = diagnosticResult ? quantiseProfile(diagnosticResult.skillScores) : null;
        const qs = new URLSearchParams({
          exam: selectedExam.toUpperCase(),
          level: selectedLevel,
          days: String(Number(daysUntilExam)),
          ...(profile ? { profile } : {}),
          ...(examVariant ? { variant: examVariant } : {})
        });
        const { roadmap } = await apiGet(`/api/plan?${qs}`);
        if (roadmap && Array.isArray(roadmap.phases)) {
          const clonedForUser = {
            ...roadmap,
            id: cacheKey,
            exam: selectedExam,
            createdAt: localDate(),
            completedTasks: {},
            progress: { done: {} }
          };
          Object.assign(clonedForUser, targetTag(clonedForUser.exam));
          setSavedRoadmaps((prev) => [clonedForUser, ...prev.filter((item) => item.id !== cacheKey)]);
          setActiveRoadmapId(cacheKey);
          setCacheLayerHit('global');
          setAgentStep(5);
          setPipelineTrace(roadmap.pipeline || []);
          await saveToPersonalCache(clonedForUser);
          await recordCacheHitMetric();
          setStatusNotice(
            `Loaded a ${planName} plan that other learners already built, rescheduled for your ${daysUntilExam} days.`
          );
          return;
        }
      } catch (err) {
        // 404 = no shared plan yet; anything else: fall through to the generator.
        if (!/No shared plan/i.test(String(err?.message))) console.warn('Shared plan lookup skipped:', err);
      }
    } else if (db && firebaseUser && !forceRefresh) {
      try {
        const globalRef = doc(db, 'artifacts', appId, 'public', 'data', 'global_verified_roadmaps', cacheKey);
        const globalSnap = await getDoc(globalRef);
        if (globalSnap.exists()) {
          const sharedDoc = globalSnap.data();
          const sharedData = sharedDoc.roadmap ?? sharedDoc;
          const clonedForUser = {
            id: cacheKey,
            exam: sharedData.exam || selectedExam,
            level: sharedData.level || selectedLevel,
            days: Number(sharedData.days || daysUntilExam),
            createdAt: localDate(),
            completedTasks: {},
            summary: sharedData.summary,
            verifiedResources: sharedData.verifiedResources,
            phases: sharedData.phases
          };
          Object.assign(clonedForUser, targetTag(clonedForUser.exam));
          setSavedRoadmaps((prev) => [clonedForUser, ...prev.filter((item) => item.id !== cacheKey)]);
          setActiveRoadmapId(cacheKey);
          setCacheLayerHit('global');
          setAgentStep(5);
          await saveToPersonalCache(clonedForUser);
          await recordCacheHitMetric();
          setStatusNotice(`Loaded a ${planName} plan that other learners already built.`);
          return;
        }
      } catch (err) {
        console.warn('Global cache lookup skipped:', err);
      }
    }

    setIsGenerating(true);
    setCacheLayerHit('live');
    setAgentStep(1);
    setPipelineTrace([]);
    const today = new Date().toISOString().split('T')[0];

    // A) SERVER MODE: the real orchestrator runs server-side (library first,
    //    discovery only when needed, real link checks, then planning).
    if (SERVER_ENABLED) {
      const stepTimers = [
        setTimeout(() => setAgentStep(2), 900),
        setTimeout(() => setAgentStep(3), 1800),
        setTimeout(() => setAgentStep(4), 2700)
      ];
      try {
        const token = isRegisteredUser(firebaseUser) ? await firebaseUser.getIdToken() : null;
        const { roadmap } = await apiPost('/api/generate-roadmap', {
          exam: selectedExam.toUpperCase(),
          level: selectedLevel,
          days: Number(daysUntilExam),
          forceRefresh,
          ...(examVariant ? { variant: examVariant } : {}),
          diagnostic: diagnosticResult
            ? { skillScores: diagnosticResult.skillScores }
            : undefined
        }, { token });
        const newRoadmap = {
          ...roadmap,
          id: cacheKey,
          exam: selectedExam,
          completedTasks: {},
          // The plan's day 1 is the learner's local today (server dates are UTC).
          createdAt: localDate(),
          ...(Array.isArray(roadmap.calendar) ? { progress: { done: {} } } : {})
        };
        stepTimers.forEach(clearTimeout);
        setAgentStep(5);
        setPipelineTrace(roadmap.pipeline || []);
        if (roadmap.source === 'global_cache') setCacheLayerHit('global');
        Object.assign(newRoadmap, targetTag(newRoadmap.exam));
        setSavedRoadmaps((prev) => [
          newRoadmap,
          ...prev.filter((item) => item.id !== cacheKey)
        ]);
        setActiveRoadmapId(cacheKey);
        await saveToPersonalCache(newRoadmap);
        const n = newRoadmap.verifiedResources?.length || 0;
        setStatusNotice(
          roadmap.source === 'library'
            ? `Built from ${n} resources already in the OpenExam library. No outside search was needed.`
            : roadmap.source === 'global_cache'
            ? `Another learner already built a ${planName} plan, so we loaded it for you.`
            : `Searched official sources, link-checked every result, and added ${n} resources to the shared library.`
        );
      } catch (err) {
        stepTimers.forEach(clearTimeout);
        console.warn('Roadmap server error:', err);
        await loadFallbackRoadmap(cacheKey, "We couldn't reach the plan builder, so here's a hand-picked plan for now.");
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    // B) PREVIEW MODE (no server configured): in-browser generation. Results are
    //    filtered to the official allowlist but NOT link-checked, are labeled so,
    //    and are never written to the shared community cache.
    const stepTimers = [
      setTimeout(() => setAgentStep(2), 650),
      setTimeout(() => setAgentStep(3), 1300),
      setTimeout(() => setAgentStep(4), 1950)
    ];

    try {
      const apiKey = '';
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;

      const systemPrompt = `You are an exam-preparation planner for OpenExam Hub.
Suggest only free resources hosted on these official domains: ${OFFICIAL_DOMAIN_ALLOWLIST.join(', ')}.
Build a day-by-day study roadmap for ${selectedExam} at CEFR level ${selectedLevel} spanning ${daysUntilExam} days.
Never include pirated PDFs, paywalled courses, or third-party blogs. Output strictly valid JSON.`;

      const userQuery = `Build a chronological ${daysUntilExam}-day preparation roadmap for ${selectedExam} (CEFR ${selectedLevel}) with 3 official free resource portals and 3 structured study phases. Return JSON with summary, verifiedResources (title, url, license, category) and phases (phaseTitle, focus, tasks).`;

      const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              summary: { type: 'STRING' },
              verifiedResources: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    title: { type: 'STRING' },
                    url: { type: 'STRING' },
                    license: { type: 'STRING' },
                    category: { type: 'STRING' }
                  },
                  required: ['title', 'url', 'license', 'category']
                }
              },
              phases: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    phaseTitle: { type: 'STRING' },
                    focus: { type: 'STRING' },
                    tasks: { type: 'ARRAY', items: { type: 'STRING' } }
                  },
                  required: ['phaseTitle', 'focus', 'tasks']
                }
              }
            },
            required: ['summary', 'verifiedResources', 'phases']
          }
        }
      };

      let response = null;
      let delay = 1000;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (response.ok) break;
        } catch (err) {
          if (attempt === 2) throw err;
        }
        await new Promise((res) => setTimeout(res, delay));
        delay *= 2;
      }
      if (!response || !response.ok) throw new Error('Live inference unavailable.');

      const result = await response.json();
      const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error('Empty payload');
      const parsed = JSON.parse(rawText);

      // Drop anything off the allowlist; mark the rest as not yet link-checked.
      const allowed = (parsed.verifiedResources || [])
        .filter((r) => verifyOfficialDomain(r.url).isOfficial)
        .map((r) => ({ ...r, linkStatus: 'not_checked' }));
      const dropped = (parsed.verifiedResources || []).length - allowed.length;
      if (allowed.length === 0) throw new Error('No allowlisted resources returned.');

      const newRoadmap = {
        id: cacheKey,
        exam: selectedExam,
        level: selectedLevel,
        days: Number(daysUntilExam),
        createdAt: today,
        completedTasks: {},
        summary: parsed.summary,
        verifiedResources: allowed,
        phases: parsed.phases,
        source: 'preview'
      };

      stepTimers.forEach(clearTimeout);
      setAgentStep(5);
      Object.assign(newRoadmap, targetTag(newRoadmap.exam));
      setSavedRoadmaps((prev) => [newRoadmap, ...prev.filter((item) => item.id !== cacheKey)]);
      setActiveRoadmapId(cacheKey);
      await saveToPersonalCache(newRoadmap);
      setStatusNotice(
        `Preview mode: generated in your browser. Links are on official domains but have not been checked${
          dropped > 0 ? `, and ${dropped} off-allowlist link${dropped > 1 ? 's were' : ' was'} removed` : ''
        }. Connect the server for verified, shared results.`
      );
    } catch (err) {
      stepTimers.forEach(clearTimeout);
      await loadFallbackRoadmap(cacheKey, 'Loaded a hand-curated roadmap and saved it to your profile.');
    } finally {
      setIsGenerating(false);
    }
  };

  const loadFallbackRoadmap = async (cacheKey, notice) => {
    const baseFallback = FALLBACK_ROADMAPS[selectedExam.toUpperCase()] || FALLBACK_ROADMAPS.TEF_CANADA;
    const fallbackRoadmap = {
      ...baseFallback,
      id: cacheKey,
      exam: selectedExam,
      level: selectedLevel,
      days: Number(daysUntilExam),
      createdAt: new Date().toISOString().split('T')[0],
      completedTasks: {},
      source: 'fallback',
      summary: `${daysUntilExam}-day ${examLabel(selectedExam)} (${selectedLevel}) study roadmap built from hand-picked official examination portals.`
    };
    setAgentStep(5);
    Object.assign(fallbackRoadmap, targetTag(fallbackRoadmap.exam));
    setSavedRoadmaps((prev) => [fallbackRoadmap, ...prev.filter((item) => item.id !== cacheKey)]);
    setActiveRoadmapId(cacheKey);
    await saveToPersonalCache(fallbackRoadmap);
    setStatusNotice(notice);
  };

  // Toggle task completion & persist to Firestore
  const toggleTaskCompletion = async (phaseIdx, taskIdx) => {
    if (!activeRoadmap) return;
    if (activeRoadmap.sample) {
      setStatusNotice('This is a sample plan. Build your own plan above to track your progress.');
      return;
    }
    const key = `${phaseIdx}-${taskIdx}`;
    const updatedCompleted = {
      ...(activeRoadmap.completedTasks || {}),
      [key]: !activeRoadmap.completedTasks?.[key]
    };

    const updatedRoadmap = {
      ...activeRoadmap,
      completedTasks: updatedCompleted
    };

    setSavedRoadmaps((prev) =>
      prev.map((r) => (r.id === updatedRoadmap.id ? updatedRoadmap : r))
    );
    await saveToPersonalCache(updatedRoadmap);
  };

  // v3 plans: one checkable task per calendar slot, stored as progress.done[key] = epoch seconds.
  // A field-path update touches one key, so ticks on two devices never overwrite each other.
  const toggleCalendarTask = async (task) => {
    if (!activeRoadmap || !task?.key) return;
    if (activeRoadmap.sample) {
      setStatusNotice('This is a sample plan. Build your own plan above to track your progress.');
      return;
    }
    const prevDone = activeRoadmap.progress?.done || {};
    const wasDone = task.key in prevDone;
    const nextDone = { ...prevDone };
    const stamp = Math.floor(Date.now() / 1000);
    if (wasDone) delete nextDone[task.key];
    else nextDone[task.key] = stamp;
    const updatedRoadmap = { ...activeRoadmap, progress: { ...(activeRoadmap.progress || {}), done: nextDone } };
    setSavedRoadmaps((prev) => prev.map((r) => (r.id === updatedRoadmap.id ? updatedRoadmap : r)));
    if (db && firebaseUser) {
      const ref = doc(db, 'artifacts', appId, 'users', firebaseUser.uid, 'roadmaps', updatedRoadmap.id);
      try {
        await updateDoc(ref, { [`progress.done.${task.key}`]: wasDone ? deleteField() : stamp });
      } catch (err) {
        // Doc not saved yet (or offline first write): fall back to a full, rule-checked save.
        await saveToPersonalCache(updatedRoadmap);
      }
    }
    // Anonymous completion signal for resource ranking (no user id is sent).
    if (!wasDone && task.resourceId && SERVER_ENABLED && activeRoadmap.planKey) {
      apiPost('/api/events', { type: 'task_done', planKey: activeRoadmap.planKey, resourceId: task.resourceId }).catch(() => {});
    }
  };

  // ==========================================================================
  // 4. EXPORT STUDY PLAN (MARKDOWN & JSON DOWNLOADS)
  // ==========================================================================
  const handleExportMarkdown = () => {
    if (!activeRoadmap) return;
    const lines = [
      `# OpenExam Hub — ${examLabel(activeRoadmap.exam)} (Level ${activeRoadmap.level}) ${activeRoadmap.days}-Day Study Plan`,
      `Generated: ${activeRoadmap.createdAt} | License: 100% Free & Open Source`,
      '',
      `## Executive Summary`,
      activeRoadmap.summary,
      '',
      `## Verified Free & Non-Copyrighted Official Portals`,
      ...(activeRoadmap.verifiedResources || []).map(
        (r) => `- **[${r.title}](${r.url})** — *${r.license}* (${r.category})`
      ),
      '',
      ...(hasSchedule(activeRoadmap)
        ? [
            `## Day-by-Day Schedule`,
            ...planDays(activeRoadmap).flatMap((d) => [
              `### Day ${d.day}`,
              ...d.tasks.map((t) => `- [${activeRoadmap.progress?.done?.[t.key] !== undefined ? 'x' : ' '}] ${t.text} (${t.minutes} min)`),
              ''
            ])
          ]
        : []),
      `## Chronological Study Schedule`,
      ...(activeRoadmap.phases || []).flatMap((p, pIdx) => [
        `### ${p.phaseTitle}`,
        `*Focus: ${p.focus}*`,
        ...p.tasks.map((t, tIdx) => {
          const checked = activeRoadmap.completedTasks?.[`${pIdx}-${tIdx}`]
            ? 'x'
            : ' ';
          return `- [${checked}] ${t}`;
        }),
        ''
      ])
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OpenExam-${activeRoadmap.exam}-${activeRoadmap.level}-${activeRoadmap.days}d.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    if (!activeRoadmap) return;
    const blob = new Blob([JSON.stringify(activeRoadmap, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OpenExam-${activeRoadmap.exam}-${activeRoadmap.level}-${activeRoadmap.days}d.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ==========================================================================
  // 5. FIREBASE AUTH HANDLERS (GOOGLE + EMAIL/PASSWORD + SIGN OUT)
  // ==========================================================================
  const handleGoogleSignIn = async () => {
    if (!auth) return;
    setAuthLoading(true);
    setAuthFeedback(null);
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setShowAuthModal(false);
    } catch (err) {
      setAuthFeedback(err.message || 'Google sign-in popup closed or blocked.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailAuthSubmit = async (e) => {
    e.preventDefault();
    if (!auth || !authEmail.trim() || !authPassword.trim()) return;
    setAuthLoading(true);
    setAuthFeedback(null);
    try {
      if (authMode === 'signup') {
        await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      } else {
        await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      }
      setAuthEmail('');
      setAuthPassword('');
      setShowAuthModal(false);
    } catch (err) {
      setAuthFeedback(err.message || 'Authentication error. Please verify credentials.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleDeletePlan = async (planId) => {
    if (!planId) return;
    setDeletingPlanId(planId);
    try {
      if (db && isRegisteredUser(firebaseUser)) {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', firebaseUser.uid, 'roadmaps', planId));
      }
      setSavedRoadmaps((prev) => prev.filter((r) => r.id !== planId));
      if (activeRoadmapId === planId) setActiveRoadmapId(null);
      setStatusNotice('Plan deleted.');
    } catch (err) {
      console.warn('Plan delete failed:', err);
      setStatusNotice('Could not delete that plan. Please try again.');
    } finally {
      setDeletingPlanId(null);
      setPendingDeletePlanId(null);
    }
  };

  const handleDeleteAccount = async () => {
    if (!auth || !isRegisteredUser(firebaseUser) || deleteConfirmText !== 'DELETE') return;
    setAccountDeleting(true);
    setAccountDeleteError(null);
    try {
      const token = await firebaseUser.getIdToken(true);
      await apiPost('/api/account', { action: 'delete', confirm: 'DELETE' }, { token });
      setSavedRoadmaps([]);
      setActiveRoadmapId(null);
      setShowAuthModal(false);
      try {
        sessionStorage.setItem('oe-account-deleted', '1');
      } catch {
        /* storage blocked: the gate just won't show the confirmation */
      }
      await signOut(auth).catch(() => {});
    } catch (err) {
      console.warn('Account delete failed:', err);
      setAccountDeleteError(friendlyError(err, 'Could not delete your account. Please try again, or email privacy@openexamhub.org.'));
    } finally {
      setAccountDeleting(false);
    }
  };

  const handleSignOut = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      setSavedRoadmaps([]);
      setActiveRoadmapId(null);
      setShowAuthModal(false);
    } catch (err) {
      console.warn('Sign-out notice:', err);
    }
  };

  // Real link checks for resources that haven't been checked yet (server mode only).
  useEffect(() => {
    if (!SERVER_ENABLED || !activeRoadmap?.verifiedResources) return;
    const pending = activeRoadmap.verifiedResources.filter(
      (r) =>
        !['ok', 'unverified', 'dead'].includes(r.linkStatus) &&
        !linkStatuses[r.url] &&
        verifyOfficialDomain(r.url).isOfficial
    );
    if (!pending.length) return;
    setLinkStatuses((prev) => ({
      ...prev,
      ...Object.fromEntries(pending.map((r) => [r.url, 'checking']))
    }));
    pending.forEach(async (r) => {
      let status = 'error';
      try {
        const out = await apiGet(`/api/check-link?url=${encodeURIComponent(r.url)}`);
        status = out.status;
      } catch {
        /* keep 'error' */
      }
      setLinkStatuses((prev) => ({ ...prev, [r.url]: status }));
    });
  }, [activeRoadmap]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scheduled (v3) plans carry a compact calendar; older plans only have phase checklists.
  const activeIsScheduled = hasSchedule(activeRoadmap);
  const activeDays = useMemo(() => (activeIsScheduled ? planDays(activeRoadmap) : []), [activeRoadmap, activeIsScheduled]);

  // Active roadmap milestone progress calculation
  const roadmapProgress = useMemo(() => {
    if (activeIsScheduled) {
      const done = activeRoadmap.progress?.done || {};
      let total = 0;
      let n = 0;
      activeDays.forEach((d) => d.tasks.forEach((t) => { total += 1; if (t.key in done) n += 1; }));
      return { done: n, total, pct: total > 0 ? Math.round((n / total) * 100) : 0 };
    }
    if (!activeRoadmap?.phases) return { done: 0, total: 0, pct: 0 };
    let total = 0;
    let done = 0;
    activeRoadmap.phases.forEach((p, pIdx) => {
      p.tasks.forEach((_, tIdx) => {
        total += 1;
        if (activeRoadmap.completedTasks?.[`${pIdx}-${tIdx}`]) done += 1;
      });
    });
    return {
      done,
      total,
      pct: total > 0 ? Math.round((done / total) * 100) : 0
    };
  }, [activeRoadmap, activeIsScheduled, activeDays]);

  // Next open task (for "Continue your plan"): scheduled plans start at today's day.
  const nextTask = useMemo(() => {
    if (activeIsScheduled) {
      const done = activeRoadmap.progress?.done || {};
      const today = Math.max(1, currentDay(activeRoadmap));
      const ordered = [...activeDays.filter((d) => d.day >= today), ...activeDays.filter((d) => d.day < today)];
      for (const d of ordered) {
        const t = d.tasks.find((x) => !(x.key in done));
        if (t) return { cal: t, task: t.text, phaseTitle: `Day ${d.day} of ${activeDays.length}${d.day < today ? ' (catch-up)' : ''}` };
      }
      return null;
    }
    if (!activeRoadmap?.phases) return null;
    for (let p = 0; p < activeRoadmap.phases.length; p++) {
      const tasks = activeRoadmap.phases[p].tasks || [];
      for (let t = 0; t < tasks.length; t++) {
        if (!activeRoadmap.completedTasks?.[`${p}-${t}`]) {
          return { pIdx: p, tIdx: t, task: tasks[t], phaseTitle: activeRoadmap.phases[p].phaseTitle };
        }
      }
    }
    return null;
  }, [activeRoadmap, activeIsScheduled, activeDays]);
  const markNextDone = () => {
    if (!nextTask) return;
    if (nextTask.cal) toggleCalendarTask(nextTask.cal);
    else toggleTaskCompletion(nextTask.pIdx, nextTask.tIdx);
  };

  const isSupportTab = activeTab === 'treasury';
  const showAside = activeTab === 'generator' || isSupportTab;
  const greetingName =
    firebaseUser && !firebaseUser.isAnonymous && firebaseUser.displayName
      ? firebaseUser.displayName.trim().split(/\s+/)[0]
      : null;
  const noticeIsError = !!statusNotice && /couldn't|could not|unavailable|failed|error/i.test(statusNotice);
  const scrollToId = (id) =>
    document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  const NAV_TABS = [
    { id: 'generator', label: 'Home', short: 'Home', icon: Home },
    { id: 'saved', label: 'My plans', short: 'Plans', icon: Database, count: savedRoadmaps.length },
    { id: 'library', label: 'Library', short: 'Library', icon: Layers },
    { id: 'practice', label: 'Level & practice', short: 'Practice', icon: Award },
    { id: 'treasury', label: 'Support', short: 'Support', icon: Heart }
  ];
  const isNavActive = (id) => (id === 'treasury' ? isSupportTab : activeTab === id);

  return (
    <div
      className={`oe-root min-h-screen ${THEME.page} font-sans antialiased selection:bg-orange-100 selection:text-neutral-900`}
      style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}
    >
      <style>{OE_GLOBAL_CSS}</style>
      {/* ====================================================================
          SLIM TRANSPARENCY STRIP (tablet/desktop; on phones it lives in Support)
      ==================================================================== */}
      <div className="hidden md:block bg-[#111111] text-neutral-300">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-9 flex items-center justify-between gap-4 text-xs">
          <span className="inline-flex items-center gap-2 min-w-0">
            <StatusDot tone="green" />
            <span className="truncate">
              Free forever · funded openly
              {ledgerLoaded && hasFundingData ? (
                <>
                  {' '}·{' '}
                  <strong className="text-white font-semibold">€{totalFunding.toFixed(2)}</strong>
                  {FIVE_YEAR_GOAL_EUR != null ? (
                    <> toward the 5-year goal{fundingPercentage != null ? ` (${fundingPercentage}%)` : ''}</>
                  ) : (
                    <> recorded</>
                  )}
                </>
              ) : (
                <> · 5-year goal amount coming soon</>
              )}
            </span>
          </span>
          <span className="inline-flex items-center gap-3 whitespace-nowrap">
            <span className="text-neutral-400">Donations and ads published here</span>
            <a href="/" className="text-white font-semibold hover:text-orange-200 transition">About this project →</a>
          </span>
        </div>
      </div>

      {/* ====================================================================
          COMPACT STICKY HEADER + PILL NAV (lg inline, sm–md second row)
      ==================================================================== */}
      <header className="sticky top-0 z-30 bg-[#F4F4F2]/85 backdrop-blur-md border-b border-black/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('generator')}
            aria-label="OpenExam Hub home"
            className="flex items-center gap-2.5 min-w-0 min-h-[44px] rounded-full"
          >
            <span className="w-9 h-9 rounded-full bg-[#111111] text-white flex items-center justify-center shrink-0" aria-hidden="true">
              <BookOpen className="w-[18px] h-[18px]" />
            </span>
            <span className="min-w-0 text-left">
              <span className="block font-bold text-[17px] tracking-tight leading-none text-neutral-950">OpenExam Hub</span>
              <span className="hidden 2xl:block whitespace-nowrap text-[11px] text-neutral-500 mt-1">Free official exam prep · MIT open source</span>
            </span>
          </button>

          <nav aria-label="Main" className="hidden lg:flex items-center gap-1 p-1 rounded-full bg-white border border-black/5 shadow-sm">
            {NAV_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = isNavActive(tab.id);
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex items-center gap-2 h-10 px-4 rounded-full text-sm font-semibold whitespace-nowrap transition ${
                    active ? 'bg-[#111111] text-white' : 'text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100'
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`text-[11px] px-1.5 rounded-full ${active ? 'bg-white/20' : 'bg-neutral-100 text-neutral-600'}`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowOriginModal(true)}
              aria-label="Why OpenExam Hub exists"
              title="Why OpenExam Hub exists"
              className="w-11 h-11 rounded-full flex items-center justify-center text-neutral-700 hover:bg-white hover:text-neutral-950 transition"
            >
              <HeartHandshake className="w-5 h-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setShowContributeModal(true)}
              className={`${THEME.ghostBtn} hidden md:inline-flex h-11 px-4 text-sm`}
            >
              <PlusCircle className="w-4 h-4 text-[#EA580C]" aria-hidden="true" />
              Back the pool
            </button>
            {authReady && firebaseUser && !firebaseUser.isAnonymous ? (
              <button
                type="button"
                onClick={() => setShowAuthModal(true)}
                aria-label="Your account"
                className="h-11 pl-1.5 pr-1.5 sm:pr-4 rounded-full bg-white border border-black/5 inline-flex items-center gap-2 text-sm font-semibold hover:bg-neutral-50 transition"
              >
                <span className="w-8 h-8 rounded-full bg-[#111111] text-white flex items-center justify-center" aria-hidden="true">
                  <UserCheck className="w-4 h-4" />
                </span>
                <span className="hidden sm:inline max-w-[120px] truncate">
                  {firebaseUser.displayName || firebaseUser.email || 'Member'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAuthPrompt('Free. Create a free account to generate your plan. An account also keeps your plans and ticks in sync across devices.');
                  setShowAuthModal(true);
                }}
                className={`${THEME.primaryBtn} h-11 px-4 text-sm`}
              >
                <LogIn className="w-4 h-4" aria-hidden="true" />
                Sign in
              </button>
            )}
          </div>
        </div>

        {/* Tablet: full-width segmented nav row */}
        <div className="hidden sm:block lg:hidden max-w-7xl mx-auto px-6 pb-3">
          <nav aria-label="Main" className={`${THEME.segWrap} bg-white`}>
            {NAV_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = isNavActive(tab.id);
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`${THEME.seg(active)} inline-flex items-center justify-center gap-1.5 whitespace-nowrap`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {tab.short}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 lg:pt-8 pb-32 sm:pb-12">
        {/* HOME HERO: greeting over the orange → pink glow, with real stats only */}
        {activeTab === 'generator' && (
          <section
            aria-labelledby="oe-greeting"
            className="relative overflow-hidden rounded-[28px] sm:rounded-[32px] p-6 sm:p-8 lg:p-10 mb-5 sm:mb-6 text-white"
            style={THEME.heroStyle}
          >
            <div aria-hidden="true" className="absolute -top-24 -right-10 w-72 h-72 rounded-full bg-[#F7A8D8] blur-3xl opacity-70" />
            <div aria-hidden="true" className="absolute -bottom-32 -left-16 w-80 h-80 rounded-full bg-[#FF7A1A] blur-3xl opacity-60" />
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/5 to-black/10" />
            <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 lg:items-end">
              <div className="lg:col-span-7">
                <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 border border-white/30 text-xs font-semibold backdrop-blur-sm">
                  <StatusDot tone="green" />
                  100% free · no paywalls
                </span>
                <h1 id="oe-greeting" className="mt-4 text-[32px] sm:text-4xl lg:text-5xl font-bold leading-[1.05] [text-shadow:0_1px_12px_rgba(0,0,0,0.12)]">
                  {greetingName ? `Welcome back, ${greetingName}` : 'Welcome'}
                </h1>
                <p className="mt-2 text-base sm:text-lg font-medium text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.18)]">
                  Let's plan your exam prep.
                </p>
              </div>
              <dl className="lg:col-span-5 grid grid-cols-3 gap-2 sm:gap-3">
                {[
                  { label: 'Saved plans', value: savedRoadmaps.length, sub: 'in your profile' },
                  { label: 'Reused plans', value: cacheHitsCount, sub: 'this session' },
                  { label: 'Funding', value: !ledgerLoaded ? '—' : hasFundingData ? `€${totalFunding.toFixed(2)}` : '€0', sub: !ledgerLoaded ? 'loading' : FIVE_YEAR_GOAL_EUR != null && fundingPercentage != null ? `${fundingPercentage}% of 5-year goal` : 'goal coming soon' }
                ].map((st) => (
                  <div key={st.label} className="rounded-2xl bg-white/95 text-neutral-950 p-3 sm:p-4 shadow-[0_8px_24px_-14px_rgba(0,0,0,0.35)]">
                    <dt className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-500 leading-tight">{st.label}</dt>
                    <dd className="mt-1 text-xl sm:text-2xl font-bold leading-none">{st.value}</dd>
                    <dd className="mt-1 text-[10px] sm:text-[11px] text-neutral-500">{st.sub}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start">
          {/* PRIMARY COLUMN */}
          <div className={`${showAside ? 'lg:col-span-8' : 'lg:col-span-12'} space-y-5 sm:space-y-6 min-w-0`}>
            {/* SUPPORT AREA: transparency heading */}
            {isSupportTab && (
              <section className={`${THEME.card} p-5 sm:p-6`}>
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <p className={THEME.label}>Transparency</p>
                    <h1 className="text-xl sm:text-2xl font-bold mt-1">How OpenExam Hub is funded</h1>
                    <p className="text-sm text-neutral-500 mt-1">{FUNDING_PROMISE}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowContributeModal(true)}
                    className={`${THEME.primaryBtn} w-full md:w-auto shrink-0 whitespace-nowrap min-h-[48px] px-5 text-sm`}
                  >
                    <Heart className="w-4 h-4" aria-hidden="true" />
                    Back the pool
                  </button>
                </div>

              </section>
            )}

            {/* ==============================================================
                TAB 1: HOME — PLAN BUILDER
            ============================================================== */}
            {activeTab === 'generator' && (
              <>
                <section id="oe-builder" aria-labelledby="oe-builder-title" className={`${THEME.card} p-5 sm:p-7 scroll-mt-24`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={THEME.label}>New plan</p>
                      <h2 id="oe-builder-title" className="text-xl sm:text-2xl font-bold mt-1">
                        Build your study plan
                      </h2>
                      <p className="text-sm text-neutral-500 mt-1">
                        Three quick picks. We only use free, official sources.
                      </p>
                    </div>
                    <span className={`${THEME.chip} hidden sm:inline-flex`}>
                      <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                      Free forever
                    </span>
                  </div>

                  <div className="mt-6 space-y-6">
                    <fieldset>
                      <legend className="text-sm font-semibold text-neutral-900 mb-2">
                        <span className="text-[#C2410C] mr-1.5">1</span>Which exam?
                      </legend>
                      <div className="flex flex-wrap gap-2">
                        {PICKER_EXAMS.map((exam) => (
                          <button
                            key={exam.id}
                            type="button"
                            aria-pressed={selectedExam === exam.id}
                            onClick={() => setSelectedExam(exam.id)}
                            className={`min-h-[44px] px-3 sm:px-4 rounded-full text-sm font-semibold border transition ${
                              selectedExam === exam.id
                                ? 'bg-[#111111] text-white border-[#111111]'
                                : 'bg-white border-black/10 text-neutral-700 hover:bg-neutral-50'
                            }`}
                          >
                            {exam.label}
                          </button>
                        ))}
                      </div>
                      {pickerExam(selectedExam)?.variants && (
                        <div className="mt-3">
                          <p className="text-xs font-semibold text-neutral-700 mb-2">Which TCF will you sit?</p>
                          <div className="flex flex-wrap gap-2">
                            {pickerExam(selectedExam).variants.map((v) => (
                              <button
                                key={v.id}
                                type="button"
                                aria-pressed={selectedTcfVariant === v.id}
                                onClick={() => setSelectedTcfVariant(v.id)}
                                className={`min-h-[44px] px-3 sm:px-4 rounded-full text-sm font-semibold border transition ${
                                  selectedTcfVariant === v.id
                                    ? 'bg-[#111111] text-white border-[#111111]'
                                    : 'bg-white border-black/10 text-neutral-700 hover:bg-neutral-50'
                                }`}
                              >
                                {v.label}
                                <span className={`ml-1.5 text-[11px] font-medium ${selectedTcfVariant === v.id ? 'text-neutral-300' : 'text-neutral-500'}`}>
                                  {v.short}
                                </span>
                              </button>
                            ))}
                          </div>
                          <p className="mt-2 text-xs text-neutral-500 leading-relaxed">
                            {pickerExam(selectedExam).variants.find((v) => v.id === selectedTcfVariant)?.note || pickerExam(selectedExam).note}
                          </p>
                        </div>
                      )}
                      {pickerExam(selectedExam)?.note && !pickerExam(selectedExam)?.variants && (
                        <p className="mt-2 text-xs text-neutral-500 leading-relaxed">{pickerExam(selectedExam).note}</p>
                      )}
                    </fieldset>

                    <fieldset>
                      <legend className="text-sm font-semibold text-neutral-900 mb-2">
                        <span className="text-[#C2410C] mr-1.5">2</span>Target level
                      </legend>
                      {selectedExam === 'IELTS' ? (
                        <>
                          <p id="oe-band-help" className="text-xs text-neutral-600 mb-2">IELTS band score you need</p>
                          <div className="flex flex-wrap gap-2" role="group" aria-describedby="oe-band-help">
                            {IELTS_BANDS.map((band) => (
                              <button
                                key={band}
                                type="button"
                                aria-pressed={selectedBand === band}
                                aria-label={`Band ${band}`}
                                onClick={() => {
                                  setSelectedBand(band);
                                  setSelectedLevel(ieltsBandLevel(band));
                                }}
                                className={`min-h-[44px] min-w-[44px] px-3 rounded-full text-sm font-semibold border transition ${
                                  selectedBand === band
                                    ? 'bg-[#111111] text-white border-[#111111]'
                                    : 'bg-white border-black/10 text-neutral-700 hover:bg-neutral-50'
                                }`}
                              >
                                {band}
                              </button>
                            ))}
                          </div>
                        </>
                      ) : (
                      <div className="flex flex-wrap gap-2">
                        {LEVEL_OPTIONS.map((lv) => (
                          <button
                            key={lv.value}
                            type="button"
                            aria-pressed={selectedLevel === lv.value}
                            onClick={() => setSelectedLevel(lv.value)}
                            className={`min-h-[44px] min-w-[44px] px-3 rounded-full text-sm font-semibold border transition ${
                              selectedLevel === lv.value
                                ? 'bg-[#111111] text-white border-[#111111]'
                                : 'bg-white border-black/10 text-neutral-700 hover:bg-neutral-50'
                            }`}
                          >
                            {lv.value}
                          </button>
                        ))}
                      </div>
                      )}
                      <div className="mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <p className="text-xs text-neutral-500" aria-live="polite">
                          {selectedExam === 'IELTS'
                            ? selectedBand
                              ? `Band ${selectedBand} ≈ CEFR ${selectedLevel} (${LEVEL_OPTIONS.find((l) => l.value === selectedLevel)?.hint}), per the official IELTS–CEFR alignment`
                              : `Pick a band. Planning for CEFR ${selectedLevel} until you do.`
                            : LEVEL_OPTIONS.find((l) => l.value === selectedLevel)?.hint}
                        </p>
                        <button
                          type="button"
                          onClick={() => setActiveTab('practice')}
                          className="self-start sm:self-auto min-h-[44px] -mx-2 px-2 rounded-full text-sm font-semibold text-[#C2410C] hover:text-[#9A3412] inline-flex items-center gap-1 text-left"
                        >
                          Not sure of your level? Take the 2-minute check
                          <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
                        </button>
                      </div>
                    </fieldset>

                    <fieldset>
                      <legend className="text-sm font-semibold text-neutral-900 mb-2">
                        <span className="text-[#C2410C] mr-1.5">3</span>Days until your exam
                      </legend>
                      <div className={THEME.segWrap}>
                        {DAY_OPTIONS.map((d) => (
                          <button
                            key={d.value}
                            type="button"
                            aria-pressed={daysUntilExam === d.value}
                            onClick={() => setDaysUntilExam(Number(d.value))}
                            className={`${THEME.seg(daysUntilExam === d.value)} flex flex-col items-center justify-center leading-tight py-1`}
                          >
                            <span>{d.value} days</span>
                            <span className={`text-[11px] font-medium ${daysUntilExam === d.value ? 'text-white/80' : 'text-neutral-500'}`}>
                              {d.hint}
                            </span>
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  </div>

                  <div className="mt-7 space-y-3">
                    <button
                      type="button"
                      onClick={() => handleGenerateStudyPath(false)}
                      disabled={isGenerating}
                      className={THEME.accentBtn}
                    >
                      <Sparkles className={`w-5 h-5 ${isGenerating ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
                      {isGenerating ? 'Building your plan…' : 'Build my plan'}
                    </button>
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-1 text-xs text-neutral-500">
                      <span className="inline-flex items-center gap-2 text-center">
                        <StatusDot tone="green" />
                        {auth && !isRegisteredUser(firebaseUser)
                          ? 'Free. Create a free account to generate your plan.'
                          : "Plans you've built before open instantly, at no cost."}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleGenerateStudyPath(true)}
                        disabled={isGenerating}
                        title="Skip saved copies and build a fresh plan"
                        className="min-h-[44px] px-3 rounded-full text-neutral-700 hover:bg-neutral-100 font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-50"
                      >
                        <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                        Rebuild from scratch
                      </button>
                    </div>
                  </div>
                </section>

                {/* LOADING: skeleton cards while agents work */}
                {isGenerating && (
                  <div aria-hidden="true" className="space-y-4">
                    <div className={`${THEME.card} p-6 space-y-3`}>
                      <div className="h-3 w-28 rounded-full bg-neutral-200 motion-safe:animate-pulse" />
                      <div className="h-6 w-2/3 rounded-full bg-neutral-200 motion-safe:animate-pulse" />
                      <div className="h-3 w-full rounded-full bg-neutral-100 motion-safe:animate-pulse" />
                      <div className="h-3 w-5/6 rounded-full bg-neutral-100 motion-safe:animate-pulse" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className={`${THEME.card} p-4 space-y-3`}>
                          <div className="w-10 h-10 rounded-xl bg-neutral-100 motion-safe:animate-pulse" />
                          <div className="h-3 w-3/4 rounded-full bg-neutral-200 motion-safe:animate-pulse" />
                          <div className="h-3 w-1/2 rounded-full bg-neutral-100 motion-safe:animate-pulse" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* LIVE AGENT STEPS + WHERE THE PLAN CAME FROM */}
                {(isGenerating || agentStep > 0) && (
                  <section aria-live="polite" className={`${THEME.card} p-5 sm:p-6`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                      <h3 className={THEME.label}>{isGenerating ? 'Building your plan' : 'How we built it'}</h3>
                      {cacheLayerHit === 'personal' && (
                        <span className={THEME.chip}>
                          <StatusDot tone="green" />
                          From your saved plans · free
                        </span>
                      )}
                      {cacheLayerHit === 'global' && (
                        <span className={THEME.chip}>
                          <StatusDot tone="green" />
                          Shared plan · built by other learners
                        </span>
                      )}
                      {cacheLayerHit === 'live' && (
                        <span className={THEME.chip}>
                          <StatusDot tone="orange" />
                          Live build
                        </span>
                      )}
                    </div>

                    <ol className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {[
                        { step: 1, name: 'Find', desc: 'Official sources', icon: Search },
                        { step: 2, name: 'Copyright check', desc: 'Free to use?', icon: FileCheck2 },
                        { step: 3, name: 'Link check', desc: 'Live & allowed', icon: Link2 },
                        { step: 4, name: 'Plan', desc: 'Day-by-day path', icon: Calendar }
                      ].map((agent) => {
                        const Icon = agent.icon;
                        const isDone = cacheLayerHit !== 'live' || agentStep > agent.step;
                        const isCurrent = cacheLayerHit === 'live' && agentStep === agent.step;
                        return (
                          <li
                            key={agent.step}
                            className={`p-3 rounded-2xl border transition ${
                              isDone
                                ? 'bg-[#FAFAF8] border-black/5 text-neutral-950'
                                : isCurrent
                                ? 'bg-orange-50 border-orange-200 text-neutral-950'
                                : 'bg-white border-black/5 text-neutral-500'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${isCurrent ? 'bg-[#111111] text-white' : 'bg-white border border-black/5'}`}>
                                <Icon className="w-4 h-4" aria-hidden="true" />
                              </span>
                              {isDone && <CheckCircle2 className="w-4 h-4 text-green-600" aria-label="Done" />}
                              {isCurrent && (
                                <span className="relative flex w-2.5 h-2.5" aria-label="In progress">
                                  <span className="absolute inline-flex h-full w-full rounded-full bg-[#FF6B1A] opacity-60 motion-safe:animate-ping" />
                                  <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-[#FF6B1A]" />
                                </span>
                              )}
                            </div>
                            <div className="text-sm font-bold">{agent.name}</div>
                            <div className="text-[11px] text-neutral-500">{agent.desc}</div>
                          </li>
                        );
                      })}
                    </ol>

                    {statusNotice && (
                      <div
                        role={noticeIsError ? 'alert' : 'status'}
                        className={`mt-4 p-3 sm:p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-3 ${
                          noticeIsError ? 'bg-amber-50 border border-amber-200' : 'bg-[#FAFAF8] border border-black/5'
                        }`}
                      >
                        <span className="flex items-start gap-3 flex-1 min-w-0">
                          <span className={`${THEME.iconTile} w-9 h-9 bg-white`}>
                            <Info className="w-4 h-4" aria-hidden="true" />
                          </span>
                          <span className="text-sm text-neutral-700 leading-snug pt-1.5">{statusNotice}</span>
                        </span>
                        {noticeIsError && (
                          <button
                            type="button"
                            onClick={() => handleGenerateStudyPath(false)}
                            disabled={isGenerating}
                            className={`${THEME.primaryBtn} min-h-[44px] px-5 text-sm w-full sm:w-auto`}
                          >
                            <RefreshCw className="w-4 h-4" aria-hidden="true" />
                            Try again
                          </button>
                        )}
                      </div>
                    )}
                    {pipelineTrace.length > 0 && (
                      <ul className="mt-4 divide-y divide-black/5 text-xs text-neutral-600 border-t border-black/5">
                        {pipelineTrace.map((step, i) => (
                          <li key={i} className="flex items-start gap-2.5 py-2">
                            <StatusDot
                              className="mt-1"
                              tone={step.status === 'ok' ? 'green' : step.status === 'skipped' ? 'slate' : 'amber'}
                            />
                            <strong className="text-neutral-900 font-semibold whitespace-nowrap">{agentLabel(step.agent)}</strong>
                            <span className="min-w-0">{step.detail}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}

                {/* ACTIVE PLAN */}
                {activeRoadmap && !isGenerating && (
                  <section id="oe-plan" aria-labelledby="oe-plan-title" className={`${THEME.card} overflow-hidden scroll-mt-24`}>
                    <div className="p-5 sm:p-7 border-b border-black/5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {activeRoadmap.sample && (
                            <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs">
                              Sample plan
                            </span>
                          )}
                          <span className="px-3 py-1 rounded-full bg-[#111111] text-white font-bold text-xs">
                            {examLabel(activeRoadmap.exam)} · {activeRoadmap.targetScore ? `${activeRoadmap.targetScore} (${activeRoadmap.level})` : activeRoadmap.level}
                          </span>
                          <span className={THEME.chip}>
                            <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                            {activeRoadmap.days}-day plan
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleExportMarkdown}
                            title="Download plan as Markdown"
                            className={`${THEME.ghostBtn} h-11 px-4 text-xs`}
                          >
                            <FileText className="w-4 h-4" aria-hidden="true" />
                            .md<span className="sr-only"> download (plan as Markdown)</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleExportJSON}
                            title="Download plan as JSON"
                            className={`${THEME.ghostBtn} h-11 px-4 text-xs`}
                          >
                            <FileJson className="w-4 h-4" aria-hidden="true" />
                            .json<span className="sr-only"> download (plan as JSON)</span>
                          </button>
                        </div>
                      </div>

                      <div className="mt-5 flex items-center gap-4 sm:gap-5">
                        <ProgressRing pct={roadmapProgress.pct} size={76} />
                        <div className="min-w-0">
                          <h2 id="oe-plan-title" className="text-xl sm:text-2xl font-bold leading-tight">
                            {activeRoadmap.sample
                              ? `Sample ${examLabel(activeRoadmap.exam)} plan`
                              : `Your ${examLabel(activeRoadmap.exam)} plan`}
                          </h2>
                          <p className="text-sm text-neutral-500 mt-1">
                            {roadmapProgress.done} of {roadmapProgress.total} tasks done
                          </p>
                        </div>
                      </div>
                      {activeRoadmap.sample && (
                        <p className="mt-4 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                          This is a sample TEF Canada plan, so you can see how a plan looks. Create a free account, then pick your exam, level and date above and press “Build my plan” to get your own.
                        </p>
                      )}
                      <p className="mt-4 text-sm text-neutral-600 leading-relaxed">{activeRoadmap.summary}</p>
                    </div>

                    {activeIsScheduled && (
                      <StudyToday
                        roadmap={activeRoadmap}
                        onToggle={toggleCalendarTask}
                        dueCards={firebaseUser ? srsSummary.due : 0}
                        onOpenReview={firebaseUser ? openReview : null}
                        abilityScores={diagnosticResult?.skillScores}
                        retentionBySkill={srsSummary.retentionBySkill}
                      />
                    )}

                    {/* FREE OFFICIAL RESOURCES */}
                    <div className="p-5 sm:p-7 border-b border-black/5 bg-[#FAFAF8]">
                      <h3 className={`${THEME.label} mb-3 flex items-center gap-1.5`}>
                        <ShieldCheck className="w-4 h-4 text-neutral-700" aria-hidden="true" />
                        Free official resources
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                        {activeRoadmap.verifiedResources?.map((res, idx) => {
                          const badge = linkStatusBadge(res, linkStatuses[res.url]);
                          const toneClass = {
                            green: 'text-green-700',
                            amber: 'text-amber-700',
                            red: 'text-red-700',
                            slate: 'text-neutral-500'
                          }[badge.tone];
                          return (
                            <a
                              key={idx}
                              href={res.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="group p-4 rounded-2xl bg-white border border-black/5 hover:border-orange-200 hover:shadow-[0_12px_28px_-18px_rgba(17,17,17,0.25)] transition flex flex-col justify-between min-h-[132px]"
                            >
                              <div>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#F4F4F2] text-neutral-700">
                                    {res.category}
                                  </span>
                                  <ExternalLink className="w-4 h-4 text-neutral-500 group-hover:text-[#C2410C] transition" aria-hidden="true" />
                                </div>
                                <div className="text-sm font-bold text-neutral-950 leading-snug">{res.title}</div>
                                {Array.isArray(res.skills) && res.skills.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {res.skills.slice(0, 4).map((sk) => (
                                      <span key={sk} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#F4F4F2] text-neutral-600">
                                        {SKILL_LABELS[sk] || sk}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="mt-3 pt-2.5 border-t border-black/5 space-y-1">
                                <div className={`text-[11px] font-semibold flex items-center gap-1.5 ${toneClass}`}>
                                  <StatusDot tone={badge.tone} />
                                  <span>{badge.label}</span>
                                  {badge.tone === 'red' && <ShieldAlert className="w-3 h-3 shrink-0" aria-hidden="true" />}
                                </div>
                                <div className="text-[10px] text-neutral-500 truncate">{res.license}</div>
                              </div>
                            </a>
                          );
                        })}
                      </div>
                    </div>

                    {/* CHECKLIST BY PHASE */}
                    <div className="p-5 sm:p-7 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className={THEME.label}>{activeIsScheduled ? 'Plan overview' : 'Your checklist'}</h3>
                        <span className="text-xs text-neutral-500">{activeRoadmap.sample ? 'Sample only: build your own plan to tick tasks' : activeIsScheduled ? 'Tick tasks in the day view above' : 'Ticks save to your profile'}</span>
                      </div>
{!activeRoadmap.sample && (
                      <CoachPanel
                        roadmap={activeRoadmap}
                        needsAccount={needsAccount}
                        getAccessToken={getAccessToken}
                        onNeedAccount={() => openSignUp('Create a free account to use the progress coach.')}
                        onApply={async (phases) => {
                          // A rebalanced plan is a phase checklist again (the day calendar no longer applies).
                          const { calendar, progress, allocation, scheduleMethod, ...rest } = activeRoadmap; // eslint-disable-line no-unused-vars
                          const updated = { ...rest, phases: toClientPhases(phases), completedTasks: {} };
                          setSavedRoadmaps((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
                          await saveToPersonalCache(updated);
                        }}
                      />
                      )}
                      {activeIsScheduled ? (
                        <details className="group rounded-2xl border border-black/5 bg-[#FAFAF8]">
                          <summary className="cursor-pointer list-none min-h-[52px] px-4 py-3 flex items-center justify-between gap-3 text-sm font-semibold text-neutral-900">
                            <span>{activeRoadmap.phases?.length || 0} phases · how your {activeRoadmap.days} days are split</span>
                            <ChevronDown className="w-4 h-4 text-neutral-500 transition group-open:rotate-180" aria-hidden="true" />
                          </summary>
                          <ol className="px-4 pb-4 space-y-3">
                            {activeRoadmap.phases?.map((phase, pIdx) => (
                              <li key={pIdx} className="rounded-xl bg-white border border-black/5 p-3.5">
                                <p className="font-bold text-sm text-neutral-950">{phase.phaseTitle}</p>
                                <p className="text-xs text-neutral-500 mt-0.5">
                                  {phase.startDay && phase.endDay ? `Days ${phase.startDay}–${phase.endDay} · ` : ''}
                                  {phase.focus}
                                </p>
                                <ul className="mt-2 list-disc pl-5 text-xs text-neutral-700 space-y-1">
                                  {(phase.tasks || []).slice(0, 6).map((t, i) => <li key={i}>{t}</li>)}
                                  {(phase.tasks || []).length > 6 && <li className="list-none -ml-5 text-neutral-500">+{phase.tasks.length - 6} more</li>}
                                </ul>
                              </li>
                            ))}
                          </ol>
                        </details>
                      ) : (
                      <ol className="space-y-4">
                        {activeRoadmap.phases?.map((phase, pIdx) => {
                          const phaseTotal = phase.tasks?.length || 0;
                          const phaseDone = (phase.tasks || []).filter(
                            (_, tIdx) => !!activeRoadmap.completedTasks?.[`${pIdx}-${tIdx}`]
                          ).length;
                          const phaseComplete = phaseTotal > 0 && phaseDone === phaseTotal;
                          return (
                            <li
                              key={pIdx}
                              className={`rounded-2xl border p-4 sm:p-5 transition ${
                                phaseComplete
                                  ? 'border-orange-200 bg-gradient-to-br from-orange-50 to-pink-50 oe-celebrate'
                                  : 'border-black/5 bg-[#FAFAF8]'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3 mb-3">
                                <div className="flex items-start gap-3 min-w-0">
                                  <span
                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-white ${
                                      phaseComplete ? 'bg-[#EA580C]' : 'bg-[#111111]'
                                    }`}
                                    aria-hidden="true"
                                  >
                                    {phaseComplete ? <Check className="w-4 h-4" /> : pIdx + 1}
                                  </span>
                                  <div className="min-w-0">
                                    <h4 className="font-bold text-neutral-950 text-base leading-snug">{phase.phaseTitle}</h4>
                                    <p className="text-xs text-neutral-500 mt-0.5">
                                      Focus: {phase.focus}
                                      {phase.startDay && phase.endDay ? ` · Days ${phase.startDay}–${phase.endDay}` : ''}
                                    </p>
                                  </div>
                                </div>
                                <span className="text-xs font-semibold text-neutral-500 whitespace-nowrap pt-1">
                                  {phaseDone}/{phaseTotal}
                                </span>
                              </div>
                              <div
                                className="h-1.5 rounded-full bg-black/5 overflow-hidden mb-3"
                                role="progressbar"
                                aria-label={`${phase.phaseTitle} progress`}
                                aria-valuemin={0}
                                aria-valuemax={phaseTotal}
                                aria-valuenow={phaseDone}
                              >
                                <div
                                  className="h-full rounded-full bg-[#FF6B1A] transition-all duration-500"
                                  style={{ width: `${phaseTotal ? Math.round((phaseDone / phaseTotal) * 100) : 0}%` }}
                                />
                              </div>
                              {phaseComplete && (
                                <p role="status" className="oe-pop mb-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-xs font-bold text-[#C2410C] border border-orange-200">
                                  <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                                  Phase complete. Nice work!
                                </p>
                              )}
                              <ul className="divide-y divide-black/5 rounded-xl bg-white border border-black/5 overflow-hidden">
                                {phase.tasks?.map((task, tIdx) => {
                                  const isChecked = !!activeRoadmap.completedTasks?.[`${pIdx}-${tIdx}`];
                                  return (
                                    <li key={tIdx}>
                                      <button
                                        type="button"
                                        aria-pressed={isChecked}
                                        onClick={() => toggleTaskCompletion(pIdx, tIdx)}
                                        className="w-full text-left min-h-[52px] px-3.5 py-3 flex items-start gap-3 hover:bg-neutral-50 transition"
                                      >
                                        {isChecked ? (
                                          <CheckCircle2 className="w-5 h-5 text-[#EA580C] shrink-0 mt-0.5 oe-pop" aria-hidden="true" />
                                        ) : (
                                          <Circle className="w-5 h-5 text-neutral-300 shrink-0 mt-0.5" aria-hidden="true" />
                                        )}
                                        <span className={`text-sm leading-snug ${isChecked ? 'text-neutral-500 line-through' : 'text-neutral-800'}`}>
                                          {task}
                                        </span>
                                      </button>
                                    </li>
                                  );
                                })}
                              </ul>
                            </li>
                          );
                        })}
                      </ol>
                      )}
                    </div>
                  </section>
                )}

                {/* EMPTY STATE: no plan yet */}
                {!activeRoadmap && !isGenerating && (
                  <section className={`${THEME.card} p-8 text-center`}>
                    <div className="mx-auto w-12 h-12 rounded-full bg-[#111111] text-white flex items-center justify-center">
                      <Calendar className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <h2 className="mt-4 text-lg font-bold">No plan yet</h2>
                    <p className="mt-1 text-sm text-neutral-500">Pick your exam above and we'll map out every day for you.</p>
                    <button
                      type="button"
                      onClick={() => scrollToId('oe-builder')}
                      className={`${THEME.primaryBtn} mt-5 min-h-[48px] px-6 text-sm`}
                    >
                      Start building
                    </button>
                  </section>
                )}
              </>
            )}

            {/* ==============================================================
                TAB 2: 2-LAYER CACHE & SAVED ROADMAPS
            ============================================================== */}
            {activeTab === 'saved' && (
              <section className="bg-white rounded-3xl border border-black/5 shadow-[0_1px_2px_rgba(17,17,17,0.04),0_12px_32px_-18px_rgba(17,17,17,0.14)] p-5 sm:p-7 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-black/5">
                  <div>
                    <p className={THEME.label}>My plans</p>
                    <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mt-1">
                      Your saved plans
                    </h2>
                    <p className="text-sm text-neutral-600 mt-1">
                      Every plan is saved to your account, so you can open it again any time, on any device.
                    </p>
                  </div>
                  <div className="min-h-[44px] px-3.5 py-2 rounded-xl bg-orange-50 border border-orange-200 text-right">
                    <div className="text-xs font-bold text-neutral-900">
                      {cacheHitsCount} reused plan{cacheHitsCount === 1 ? '' : 's'}
                    </div>
                    <div className="text-[11px] text-orange-700">this session</div>
                  </div>
                </div>

                {savedRoadmaps.length === 0 && (
                  <div className="py-10 text-center">
                    <div className="mx-auto w-12 h-12 rounded-full bg-[#111111] text-white flex items-center justify-center">
                      <Database className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <h3 className="mt-4 text-lg font-bold">No saved plans yet</h3>
                    <p className="mt-1 text-sm text-neutral-500">Your first plan will show up here.</p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('generator')}
                      className={`${THEME.primaryBtn} mt-5 min-h-[48px] px-6 text-sm`}
                    >
                      Build my first plan
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {savedRoadmaps.map((rm) => {
                    const isSelected = rm.id === activeRoadmap?.id;
                    return (
                      <div
                        key={rm.id}
                        className={`p-4 rounded-xl border transition flex flex-col justify-between ${
                          isSelected
                            ? 'border-orange-400 bg-orange-50/30'
                            : 'border-black/[0.08] bg-white hover:border-neutral-300'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="px-2.5 py-0.5 rounded bg-[#111111] text-white text-xs font-bold">
                              {examLabel(rm.exam)} • {rm.targetScore ? `${rm.targetScore} (${rm.level})` : rm.level}
                            </span>
                            <span className="text-xs text-neutral-500">
                              Saved {rm.createdAt}
                            </span>
                          </div>
                          <h3 className="font-bold text-neutral-900 text-base">
                            {rm.days}-day {examLabel(rm.exam)} plan
                          </h3>
                          <p className="text-xs text-neutral-600 mt-1 line-clamp-2">
                            {rm.summary}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveRoadmapId(rm.id);
                            setCacheLayerHit('personal');
                            setAgentStep(5);
                            setActiveTab('generator');
                          }}
                          className={`${THEME.primaryBtn} mt-4 w-full min-h-[44px] px-4 text-sm`}
                        >
                          Open plan
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                        {pendingDeletePlanId === rm.id ? (
                          <div className="mt-2 flex gap-2" role="group" aria-label={`Confirm deleting the ${rm.days}-day ${examLabel(rm.exam)} plan`}>
                            <button
                              type="button"
                              onClick={() => handleDeletePlan(rm.id)}
                              disabled={deletingPlanId === rm.id}
                              className="flex-1 min-h-[44px] px-3 rounded-full bg-rose-700 hover:bg-rose-800 text-white text-sm font-semibold disabled:opacity-60"
                            >
                              {deletingPlanId === rm.id ? 'Deleting…' : 'Yes, delete'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDeletePlanId(null)}
                              className="flex-1 min-h-[44px] px-3 rounded-full border border-neutral-300 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setPendingDeletePlanId(rm.id)}
                            aria-label={`Delete plan: ${rm.days}-day ${examLabel(rm.exam)} plan`}
                            className="mt-2 w-full min-h-[44px] px-4 rounded-full text-sm font-semibold text-rose-700 hover:bg-rose-50 inline-flex items-center justify-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            Delete plan
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {activeTab === 'library' && <LibraryTab defaultExam={selectedExam} />}

            {activeTab === 'practice' && (
              <div className="space-y-6">
                <DiagnosticPanel
                  exam={selectedExam}
                  level={selectedLevel}
                  result={diagnosticResult}
                  onResult={setDiagnosticResult}
                  needsAccount={needsAccount}
                  getAccessToken={getAccessToken}
                  onNeedAccount={() => openSignUp('Create a free account to start the placement self-check.')}
                  onBuild={() => {
                    setActiveTab('generator');
                    handleGenerateStudyPath(true);
                  }}
                />
                {firebaseUser && (
                  <ReviewDeck exam={selectedExam} cards={srsCards} onGrade={saveSrsCard} />
                )}
                <PracticePanel
                  exam={selectedExam}
                  level={selectedLevel}
                  deckIds={new Set(srsCards.map((c) => c.id))}
                  needsAccount={needsAccount}
                  getAccessToken={getAccessToken}
                  onNeedAccount={() => openSignUp('Create a free account to generate practice questions.')}
                  onSaveToDeck={firebaseUser ? (item, sk) => saveSrsCard(cardFromPractice(item, selectedExam, sk)) : null}
                />
              </div>
            )}

            {/* ==============================================================
                TAB 3: TRANSPARENCY — real ledger only, no invented totals
            ============================================================== */}
            {activeTab === 'treasury' && (
              <div className="space-y-6">
                <section className="bg-white rounded-3xl border border-black/5 shadow-[0_1px_2px_rgba(17,17,17,0.04),0_12px_32px_-18px_rgba(17,17,17,0.14)] p-5 sm:p-7 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-black/5">
                    <div>
                      <h2 className="text-xl font-bold text-neutral-900">Transparency</h2>
                      <p className="text-sm text-neutral-600 mt-1 max-w-2xl">{FUNDING_PROMISE}</p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-bold border bg-amber-50 text-amber-800 border-amber-300 shrink-0">
                      Ads not live yet
                    </span>
                  </div>

                  <div>
                    <div className="flex items-end justify-between gap-3 mb-2">
                      <div>
                        <p className={THEME.label}>Progress toward 5 years of running costs</p>
                        {ledgerLoaded && hasFundingData ? (
                          <p className="mt-2 text-2xl font-bold">
                            €{totalFunding.toFixed(2)}
                            {FIVE_YEAR_GOAL_EUR != null ? (
                              <span className="text-sm font-medium text-neutral-500"> / €{Number(FIVE_YEAR_GOAL_EUR).toLocaleString('en-GB')} goal</span>
                            ) : (
                              <span className="text-sm font-medium text-neutral-500"> recorded so far</span>
                            )}
                          </p>
                        ) : (
                          <p className="mt-2 text-2xl font-bold text-neutral-900">No income recorded yet</p>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-neutral-600">
                        {FIVE_YEAR_GOAL_EUR == null
                          ? 'Goal amount coming soon'
                          : fundingPercentage != null
                            ? `${fundingPercentage}%`
                            : '—'}
                      </p>
                    </div>
                    <div
                      className="h-2.5 rounded-full bg-[#F4F4F2] overflow-hidden"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={fundingPercentage ?? 0}
                      aria-label="Progress toward the 5-year funding goal"
                    >
                      <div
                        className="h-full rounded-full bg-[#FF6B1A] transition-all duration-500"
                        style={{ width: `${FIVE_YEAR_GOAL_EUR != null && fundingPercentage != null ? fundingPercentage : 0}%` }}
                      />
                    </div>
                    <p className="mt-2 text-xs text-neutral-500">
                      {adsOffAtGoal
                        ? 'The 5-year goal is covered, so ads stay off.'
                        : FIVE_YEAR_GOAL_EUR == null
                          ? 'The euro amount for that 5-year goal has not been set yet, so this bar stays empty rather than showing a made-up target.'
                          : 'Ads come off once this goal is reached. Figures here come only from the public donation ledger (and ad income, when any is recorded).'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-black/[0.08] p-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">Donations</h3>
                      {!ledgerLoaded ? (
                        <p className="text-sm text-neutral-500">Loading the ledger…</p>
                      ) : !hasFundingData && totalDonations === 0 ? (
                        <p className="text-sm text-neutral-500">No donations recorded yet.</p>
                      ) : (
                        <div className="space-y-2.5 text-sm">
                          <div className="flex justify-between py-1.5 border-b border-black/5">
                            <span className="text-neutral-700">GitHub Sponsors</span>
                            <span className="font-bold">€{(fundingSources.githubSponsors + fundingSources.githubOneTime).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between py-1.5 border-b border-black/5">
                            <span className="text-neutral-700">Open Collective</span>
                            <span className="font-bold">€{fundingSources.openCollective.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between py-1.5">
                            <span className="text-neutral-700">Ko-fi</span>
                            <span className="font-bold">€{fundingSources.koFiTips.toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl border border-black/[0.08] p-4">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">Dashboard ads</h3>
                      {!ledgerLoaded ? (
                        <p className="text-sm text-neutral-500">Loading the ledger…</p>
                      ) : (
                        <>
                          <p className="text-sm text-neutral-600">Ads are not live yet. When they are, income will appear here.</p>
                          <p className="mt-3 text-lg font-bold">€{totalAdIncome.toFixed(2)}</p>
                          {publicStats?.approvedResources != null && (
                            <p className="mt-3 text-xs text-neutral-500">
                              Library (from /api/stats): {publicStats.approvedResources} approved resource{publicStats.approvedResources === 1 ? '' : 's'}
                              {publicStats.plansBuilt != null ? ` · ${publicStats.plansBuilt} plans built` : ''}.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <BooksPanel
                    variant="app"
                    earnings={ledgerLoaded ? totalFunding : 0}
                    usage={publicUsage}
                    usageTotal={publicUsageTotal}
                    stats={publicStats}
                    loaded={ledgerLoaded && booksLoaded}
                  />

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-orange-700" />
                        Public donation ledger
                      </h3>
                      {DONATION_LINKS.kofi && (
                        <a
                          href={DONATION_LINKS.kofi}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-h-[44px] px-2 -mr-2 rounded-full text-xs font-semibold text-orange-700 hover:underline inline-flex items-center"
                        >
                          Support on Ko-fi →
                        </a>
                      )}
                    </div>
                    <div className="divide-y divide-black/5 border border-black/[0.08] rounded-xl overflow-hidden">
                      {ledgerEvents.length === 0 && (
                        <div className="p-6 bg-white text-center text-sm text-neutral-500">
                          {db
                            ? 'No contributions yet. Confirmed donations appear here automatically.'
                            : 'Ledger not connected in this preview.'}
                        </div>
                      )}
                      {ledgerEvents.map((ev) => (
                        <div
                          key={ev.id}
                          className="p-3.5 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-neutral-900">{ev.contributor}</span>
                              <span className="px-2 py-0.5 rounded bg-[#F4F4F2] text-neutral-600 font-medium">{ev.source}</span>
                              <span className="text-neutral-500">{ev.date}</span>
                            </div>
                            <p className="text-neutral-600 mt-0.5">{ev.note}</p>
                          </div>
                          <span className="font-bold text-orange-700 text-sm whitespace-nowrap">
                            +€{Number(ev.amount).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            )}

          </div>

          {/* ==================================================================
              RIGHT SIDEBAR: PATRONAGE POOL, AD-SUNSET UNIT & ECOSYSTEM BRIDGE
          ================================================================== */}
          {showAside && (
          <aside
            className={`lg:col-span-4 space-y-5 sm:space-y-6 min-w-0 ${
              activeTab === 'generator' ? 'order-first lg:order-none lg:sticky lg:top-24' : ''
            }`}
          >
            {activeTab === 'generator' ? (
              <>
                {activeRoadmap && !activeRoadmap.sample ? (
                  <section aria-labelledby="oe-continue" className={`${THEME.card} p-5 sm:p-6`}>
                    <p className={THEME.label}>Continue your plan</p>
                    <div className="mt-3 flex items-center gap-4">
                      <ProgressRing pct={roadmapProgress.pct} size={64} />
                      <div className="min-w-0">
                        <h2 id="oe-continue" className="font-bold text-lg leading-tight">
                          {examLabel(activeRoadmap.exam)} · {activeRoadmap.targetScore ? `${activeRoadmap.targetScore} (${activeRoadmap.level})` : activeRoadmap.level}
                        </h2>
                        <p className="text-sm text-neutral-500">
                          {activeRoadmap.days}-day plan · {roadmapProgress.done}/{roadmapProgress.total} done
                        </p>
                      </div>
                    </div>
                    {nextTask ? (
                      <div className="mt-4 p-3.5 rounded-2xl bg-[#FAFAF8] border border-black/5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-neutral-500 flex items-center gap-1.5">
                          <StatusDot tone="orange" />
                          Up next
                        </p>
                        <p className="mt-1.5 text-sm font-semibold text-neutral-950 leading-snug">{nextTask.task}</p>
                        <p className="mt-0.5 text-xs text-neutral-500 truncate">{nextTask.phaseTitle}</p>
                      </div>
                    ) : (
                      <p className="mt-4 p-3.5 rounded-2xl bg-orange-50 border border-orange-200 text-sm font-semibold text-neutral-900">
                        Every task is done. Time for a full mock exam!
                      </p>
                    )}
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => scrollToId('oe-plan')}
                        className={`${THEME.primaryBtn} min-h-[48px] px-4 text-sm`}
                      >
                        Open plan
                      </button>
                      <button
                        type="button"
                        onClick={markNextDone}
                        disabled={!nextTask}
                        className={`${THEME.ghostBtn} min-h-[48px] px-4 text-sm disabled:opacity-50`}
                      >
                        <Check className="w-4 h-4" aria-hidden="true" />
                        Mark done
                      </button>
                    </div>
                  </section>
                ) : (
                  <section className={`${THEME.card} p-5 sm:p-6 text-center`}>
                    <p className={THEME.label}>Continue your plan</p>
                    <p className="mt-3 text-sm text-neutral-600">You don't have a plan yet.</p>
                    <button
                      type="button"
                      onClick={() => scrollToId('oe-builder')}
                      className={`${THEME.primaryBtn} mt-4 w-full min-h-[48px] px-4 text-sm`}
                    >
                      Build my plan
                    </button>
                  </section>
                )}

                <section className={`${THEME.card} p-5 sm:p-6 hidden lg:block`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className={THEME.label}>Keep it free</p>
                    <span className={THEME.chip}>
                      <StatusDot tone={adsOffAtGoal ? 'green' : 'orange'} />
                      {adsOffAtGoal ? 'Ads off' : 'Ads not live yet'}
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-bold">
                    {ledgerLoaded && hasFundingData ? `€${totalFunding.toFixed(2)}` : '€0'}
                    <span className="text-sm font-medium text-neutral-500">
                      {FIVE_YEAR_GOAL_EUR != null ? (
                        <> / €{Number(FIVE_YEAR_GOAL_EUR).toLocaleString('en-GB')} 5-year goal</>
                      ) : (
                        <> · goal amount coming soon</>
                      )}
                    </span>
                  </p>
                  <div className="mt-3 h-2 rounded-full bg-[#F4F4F2] overflow-hidden" aria-hidden="true">
                    <div className="h-full rounded-full bg-[#FF6B1A] transition-all duration-500" style={{ width: `${fundingPercentage ?? 0}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-neutral-500">Donations and dashboard ads (not live yet) are published on the transparency page. Ads come off once 5 years of running costs are covered.</p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('treasury')}
                    className={`${THEME.ghostBtn} mt-4 w-full min-h-[44px] px-4 text-sm`}
                  >
                    See how we're funded
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                </section>
              </>
            ) : (
              <>
            {/* Transparency summary when the Support tab is open */}
            <div className="bg-white rounded-3xl border border-black/5 shadow-[0_1px_2px_rgba(17,17,17,0.04),0_12px_32px_-18px_rgba(17,17,17,0.14)] p-5 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-orange-700">
                  Transparency
                </span>
                <span className="text-xs font-semibold text-neutral-500">
                  Ads not live yet
                </span>
              </div>

              <h3 className="text-lg font-bold text-neutral-900">
                Keep OpenExam Hub free for everyone
              </h3>
              <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
                {FUNDING_PROMISE}
              </p>

              <div className="mt-4 p-3.5 rounded-xl bg-[#FAFAF8] border border-black/[0.08]">
                <div className="flex justify-between text-xs font-semibold mb-1.5">
                  <span className="text-neutral-700">5-year running costs</span>
                  <span className="text-orange-700">
                    {ledgerLoaded && hasFundingData ? `€${totalFunding.toFixed(2)}` : '€0'}
                    {FIVE_YEAR_GOAL_EUR != null ? ` / €${Number(FIVE_YEAR_GOAL_EUR).toLocaleString('en-GB')}` : ''}
                  </span>
                </div>
                <div
                  className="w-full h-2.5 bg-neutral-200 rounded-full overflow-hidden"
                  role="progressbar"
                  aria-label="Progress toward the 5-year funding goal"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={fundingPercentage ?? 0}
                  aria-valuetext={fundingPercentage != null ? `${fundingPercentage}% funded` : 'No income yet'}
                >
                  <div
                    className="h-full bg-[#111111] transition-all duration-500"
                    style={{ width: `${fundingPercentage ?? 0}%` }}
                  />
                </div>
                <div className="mt-2 text-[11px] text-neutral-500 flex justify-between">
                  <span>{FIVE_YEAR_GOAL_EUR == null ? 'Goal amount coming soon' : fundingPercentage != null ? `${fundingPercentage}% funded` : 'No income yet'}</span>
                  <span>Ads come off at the goal</span>
                </div>
              </div>

              <div className="mt-4 space-y-2">
                {DONATION_LINKS.githubSponsors && (
                <button
                  type="button"
                  onClick={() => {
                    setShowContributeModal(true);
                  }}
                  className="min-h-[44px] w-full py-2.5 px-3.5 rounded-full bg-[#111111] hover:bg-neutral-800 text-white text-xs font-semibold flex items-center justify-between transition"
                >
                  <span className="flex items-center gap-2">
                    <Code2 className="w-4 h-4 text-orange-400" />
                    GitHub Sponsors (0% Fee)
                  </span>
                  <span className="text-orange-300">Back Pool →</span>
                </button>
                )}

                {DONATION_LINKS.openCollective && (
                <button
                  type="button"
                  onClick={() => {
                    setShowContributeModal(true);
                  }}
                  className="min-h-[44px] w-full py-2.5 px-3.5 rounded-full bg-[#111111] hover:bg-neutral-800 text-white text-xs font-semibold flex items-center justify-between transition"
                >
                  <span className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" />
                    Open Collective (Public Ledger)
                  </span>
                  <span className="text-orange-100">Back Pool →</span>
                </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowContributeModal(true);
                  }}
                  className="min-h-[44px] w-full py-2.5 px-3.5 rounded-full bg-white hover:bg-[#FAFAF8] text-neutral-800 border border-neutral-300 text-xs font-semibold flex items-center justify-between transition"
                >
                  <span className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-amber-600" />
                    Ko-fi One-Off Token Tip
                  </span>
                  <span className="text-neutral-600">Tip →</span>
                </button>
              </div>
            </div>

            {/* Removed: placeholder ad slot and an upsell for a paid product that doesn't exist. */}
              </>
            )}
            {/* AdSense: signed-in dashboard only; renders nothing until configured and consented. */}
            <DashboardAd enabled={isRegisteredUser(firebaseUser)} />
          </aside>
          )}
        </div>
      </main>

      {/* ====================================================================
          MOBILE BOTTOM TAB BAR
      ==================================================================== */}
      <nav
        aria-label="Main"
        className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-black/5"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-5">
          {NAV_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = isNavActive(tab.id);
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={active ? 'page' : undefined}
                className="flex flex-col items-center justify-center gap-1 min-h-[62px] text-[11px] font-semibold"
              >
                <span
                  className={`w-12 h-7 rounded-full flex items-center justify-center transition ${
                    active ? 'bg-[#111111] text-white' : 'text-neutral-500'
                  }`}
                >
                  <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
                </span>
                <span className={active ? 'text-neutral-950' : 'text-neutral-500'}>{tab.short}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ====================================================================
          ORIGIN STORY MODAL ("WHY THIS EXISTS")
      ==================================================================== */}
      {showOriginModal && (
        <div role="dialog" aria-modal="true" aria-labelledby="oe-about-title" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6" style={THEME.backdropStyle}>
          <div className="oe-sheet bg-white w-full max-w-lg rounded-t-[28px] sm:rounded-[28px] p-6 sm:p-7 pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-h-[92vh] overflow-y-auto shadow-2xl">
            <div aria-hidden="true" className="sm:hidden mx-auto -mt-2 mb-4 h-1.5 w-10 rounded-full bg-neutral-200" />
            <div className="flex items-center justify-between pb-3 border-b border-black/5">
              <div className="flex items-center gap-2">
                <span className="w-10 h-10 rounded-full bg-[#111111] text-white flex items-center justify-center shrink-0"><HeartHandshake className="w-5 h-5" aria-hidden="true" /></span>
                <h3 id="oe-about-title" className="font-bold text-neutral-900 text-lg">
                  Why OpenExam Hub Exists
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowOriginModal(false)}
                aria-label="Close" className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 text-base font-bold"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm text-neutral-700 leading-relaxed">
              <p>
                <strong>OpenExam Hub</strong> started at our kitchen table when my wife was preparing for her language certification exams. We saw firsthand how stressful it is to hunt for reliable study materials without getting trapped in expensive coaching agencies or broken links.
              </p>
              <p>
                Official bodies like <em>CCI Paris / Le français des affaires</em>, <em>France Éducation international</em>, ETS, the Instituto Cervantes, the <em>Goethe-Institut</em> and the <em>British Council</em> already publish high-quality free sample exams—they are simply scattered across dozens of pages.
              </p>
              <p>
                So we built a multi-agent AI engine that gathers only verified, non-copyrighted official resources and organizes them into a chronological study roadmap.{' '}
                <strong>There are no paywalls here, and there never will be.</strong> Every euro of community backing goes openly into our API token pool and keeping the platform maintained for learners worldwide.
              </p>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowOriginModal(false)}
                className="min-h-[44px] px-4 py-2 rounded-full bg-[#111111] hover:bg-neutral-800 text-white text-sm font-semibold transition"
              >
                Back to Study Planner
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          FIREBASE AUTH MODAL (GOOGLE + EMAIL/PASSWORD)
      ==================================================================== */}
      {showAuthModal && (
        <div role="dialog" aria-modal="true" aria-labelledby="oe-auth-title" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6" style={THEME.backdropStyle}>
          <div className="oe-sheet bg-white w-full max-w-md rounded-t-[28px] sm:rounded-[28px] p-6 sm:p-7 pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-h-[92vh] overflow-y-auto shadow-2xl">
            <div aria-hidden="true" className="sm:hidden mx-auto -mt-2 mb-4 h-1.5 w-10 rounded-full bg-neutral-200" />
            <div className="flex items-center justify-between pb-3 border-b border-black/5">
              <h3 id="oe-auth-title" className="font-bold text-neutral-900 text-lg">
                {firebaseUser && !firebaseUser.isAnonymous ? 'Your account' : authMode === 'signup' ? 'Create your free account' : 'Sign in'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAuthModal(false)}
                aria-label="Close" className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 text-base font-bold"
              >
                ✕
              </button>
            </div>

            {!(firebaseUser && !firebaseUser.isAnonymous) && (
            <p className="text-xs text-neutral-600 mt-3 leading-relaxed">
              {authPrompt}
            </p>
            )}
            {authMode === 'signup' && !(firebaseUser && !firebaseUser.isAnonymous) && (
              <p className="text-xs text-neutral-500 mt-2 leading-relaxed">
                A free account saves your plan and progress across devices and keeps the AI free for everyone by preventing repeated requests.
              </p>
            )}

            {firebaseUser && !firebaseUser.isAnonymous ? (
              <div className="mt-4 p-4 rounded-xl bg-orange-50 border border-orange-200 space-y-3">
                <div className="text-xs text-neutral-900">
                  Signed in as <strong>{firebaseUser.email}</strong>
                </div>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full py-2 rounded-lg bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out
                </button>
                <details className="pt-3 border-t border-orange-200" data-testid="delete-account">
                  <summary className="min-h-[44px] flex items-center text-xs font-semibold text-rose-700 cursor-pointer">
                    Delete my account
                  </summary>
                  <div className="space-y-2 pb-1">
                    <p className="text-xs text-neutral-700 leading-relaxed">
                      This permanently deletes your account, all your saved plans, progress, review cards and level checks. It cannot be undone.
                    </p>
                    <label htmlFor="oe-delete-confirm" className="block text-xs font-semibold text-neutral-900">
                      Type DELETE to confirm
                    </label>
                    <input
                      id="oe-delete-confirm"
                      type="text"
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-lg border border-neutral-300 bg-white text-sm"
                    />
                    {accountDeleteError && (
                      <p role="alert" className="text-xs text-rose-700">{accountDeleteError}</p>
                    )}
                    <button
                      type="button"
                      onClick={handleDeleteAccount}
                      disabled={deleteConfirmText !== 'DELETE' || accountDeleting}
                      className="w-full min-h-[44px] rounded-lg bg-rose-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition hover:bg-rose-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      {accountDeleting ? 'Deleting…' : 'Permanently delete my account'}
                    </button>
                  </div>
                </details>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={authLoading}
                  className="min-h-[44px] w-full py-2.5 px-4 rounded-full bg-[#111111] hover:bg-neutral-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition"
                >
                  <Globe className="w-4 h-4 text-orange-400" />
                  Continue with Google
                </button>

                <div className="relative flex py-1 items-center">
                  <div className="grow border-t border-black/[0.08]" />
                  <span className="shrink mx-3 text-[11px] uppercase text-neutral-500 font-semibold">
                    or email account
                  </span>
                  <div className="grow border-t border-black/[0.08]" />
                </div>

                <form onSubmit={handleEmailAuthSubmit} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
                      <input
                        type="email"
                        required
                        placeholder="learner@example.com"
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        className="min-h-[44px] w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Password
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-neutral-500 absolute left-3 top-3" />
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        value={authPassword}
                        onChange={(e) => setAuthPassword(e.target.value)}
                        className="min-h-[44px] w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  </div>

                  {authFeedback && (
                    <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>{authFeedback}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="min-h-[44px] w-full py-2.5 rounded-full bg-[#111111] hover:bg-neutral-800 text-white text-sm font-semibold inline-flex items-center justify-center gap-1.5 transition"
                  >
                    {authMode === 'signup' ? (
                      <>
                        <UserPlus className="w-4 h-4" />
                        Create free account
                      </>
                    ) : (
                      <>
                        <LogIn className="w-4 h-4" />
                        Sign in
                      </>
                    )}
                  </button>
                </form>

                <div className="text-center text-xs text-neutral-600">
                  {authMode === 'signin' ? (
                    <>
                      Need an account?{' '}
                      <button
                        type="button"
                        onClick={() => setAuthMode('signup')}
                        className="text-orange-700 font-semibold hover:underline"
                      >
                        Create one free
                      </button>
                    </>
                  ) : (
                    <>
                      Already have an account?{' '}
                      <button
                        type="button"
                        onClick={() => setAuthMode('signin')}
                        className="text-orange-700 font-semibold hover:underline"
                      >
                        Sign in
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          CONTRIBUTE MODAL (LINKS OUT; LEDGER IS UPDATED ONLY BY SERVER WEBHOOKS)
      ==================================================================== */}
      {showContributeModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6" style={THEME.backdropStyle}>
          <div className="oe-sheet bg-white w-full max-w-md rounded-t-[28px] sm:rounded-[28px] p-6 sm:p-7 pb-[calc(1.5rem+env(safe-area-inset-bottom))] max-h-[92vh] overflow-y-auto shadow-2xl">
            <div aria-hidden="true" className="sm:hidden mx-auto -mt-2 mb-4 h-1.5 w-10 rounded-full bg-neutral-200" />
            <div className="flex items-center justify-between pb-3 border-b border-black/5">
              <div className="flex items-center gap-2">
                <span className="w-10 h-10 rounded-full bg-[#111111] text-white flex items-center justify-center shrink-0"><Coins className="w-5 h-5" aria-hidden="true" /></span>
                <h3 className="font-bold text-neutral-900 text-lg">
                  Support OpenExam Hub
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowContributeModal(false)}
                aria-label="Close" className="w-11 h-11 -mr-2 rounded-full flex items-center justify-center text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 text-base font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-neutral-600 mt-3 leading-relaxed">
              Donations are made on the platforms below. Once a payment is confirmed, the platform notifies our server and the public ledger updates automatically. All ad and donation income is published on the transparency page. Ads come off once the next 5 years of running costs are covered
              {FIVE_YEAR_GOAL_EUR != null ? ` (€${Number(FIVE_YEAR_GOAL_EUR).toLocaleString('en-GB')} goal).` : ' (goal amount coming soon).'}
            </p>
            <div className="mt-4 space-y-2">
              {[
                { label: 'GitHub Sponsors (0% fee, monthly)', url: DONATION_LINKS.githubSponsors, icon: Code2 },
                { label: 'Open Collective (public fiscal host)', url: DONATION_LINKS.openCollective, icon: ShieldCheck },
                { label: 'Ko-fi (one-off tip)', url: DONATION_LINKS.kofi, icon: Coins }
              ].filter(({ url }) => !!url).map(({ label, url, icon: Icon }) => (
                  <a
                    key={label}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[44px] w-full py-2.5 px-3.5 rounded-xl border border-neutral-300 hover:border-orange-300 text-sm font-semibold flex items-center justify-between transition"
                  >
                    <span className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-orange-700" aria-hidden="true" />
                      {label}
                    </span>
                    <ExternalLink className="w-4 h-4 text-neutral-500" aria-hidden="true" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SHARED UI HELPERS
// ============================================================================
const SKILL_LABELS = {
  listening: 'Listening',
  reading: 'Reading',
  writing: 'Writing',
  speaking: 'Speaking',
  grammar: 'Grammar',
  vocabulary: 'Vocabulary',
  mock_exam: 'Mock exams',
  exam_format: 'Exam format'
};

function ServerRequired({ what }) {
  return (
    <div className="p-6 rounded-3xl border border-dashed border-black/10 bg-[#FAFAF8] text-center">
      <div className="mx-auto w-11 h-11 rounded-full bg-[#111111] text-white flex items-center justify-center">
        <Server className="w-5 h-5" aria-hidden="true" />
      </div>
      <p className="mt-3 font-semibold text-neutral-900">{what} is almost ready</p>
      <p className="mt-1 text-sm text-neutral-500">
        It needs the OpenExam Hub server. Set <code>VITE_SERVER_ENABLED</code> / <code>VITE_API_BASE</code> once the API is deployed.
      </p>
    </div>
  );
}

// ============================================================================
// RESOURCE LIBRARY: every link the platform has already checked, reused by all roadmaps
// ============================================================================
function LibraryTab({ defaultExam }) {
  const [exam, setExam] = useState(defaultExam);
  const [skill, setSkill] = useState('');
  const [items, setItems] = useState([]);
  const [state, setState] = useState('idle');
  const [reloadKey, setReloadKey] = useState(0); // bumps to retry after an error

  useEffect(() => {
    if (!SERVER_ENABLED) return;
    let cancelled = false;
    setState('loading');
    const qs = new URLSearchParams({ exam: exam.toUpperCase(), ...(skill ? { skill } : {}) });
    apiGet(`/api/library?${qs}`)
      .then((out) => {
        if (!cancelled) {
          setItems(out.resources || []);
          setState('done');
        }
      })
      .catch(() => !cancelled && setState('error'));
    return () => {
      cancelled = true;
    };
  }, [exam, skill, reloadKey]);

  return (
    <section className="bg-white rounded-3xl border border-black/5 shadow-[0_1px_2px_rgba(17,17,17,0.04),0_12px_32px_-18px_rgba(17,17,17,0.14)] p-5 sm:p-7 space-y-4">
      <div>
        <p className={THEME.label}>Library</p>
        <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mt-1">Free official resources</h2>
        <p className="text-sm text-neutral-600 mt-0.5">
          Official free resources the platform has already found and link-checked. New roadmaps use these first and only search outside when something is missing.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {PICKER_EXAMS.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => setExam(e.id)}
            aria-pressed={exam === e.id}
            className={`min-h-[44px] px-4 rounded-full text-sm font-semibold border transition ${
              exam === e.id ? 'bg-[#111111] text-white border-[#111111]' : 'bg-white border-black/10 text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            {e.label}
          </button>
        ))}
        <select
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
          aria-label="Filter by skill"
          className="min-h-[44px] px-4 rounded-full text-sm font-semibold border border-black/10 bg-white text-neutral-800"
        >
          <option value="">All skills</option>
          {Object.entries(SKILL_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {!SERVER_ENABLED ? (
        <ServerRequired what="The shared library" />
      ) : state === 'loading' ? (
        <div aria-hidden="true" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="p-4 rounded-2xl border border-black/5 space-y-3">
              <div className="h-3 w-20 rounded-full bg-neutral-100 motion-safe:animate-pulse" />
              <div className="h-4 w-3/4 rounded-full bg-neutral-200 motion-safe:animate-pulse" />
              <div className="h-3 w-1/2 rounded-full bg-neutral-100 motion-safe:animate-pulse" />
            </div>
          ))}
        </div>
      ) : state === 'error' ? (
        <div role="alert" className="p-6 rounded-3xl bg-amber-50 border border-amber-200 text-center">
          <p className="font-semibold text-neutral-900">We couldn't load the library.</p>
          <p className="mt-1 text-sm text-neutral-600">Check your connection and try again.</p>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            className={`${THEME.primaryBtn} mt-4 min-h-[44px] px-5 text-sm`}
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Try again
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="p-6 rounded-3xl bg-[#FAFAF8] border border-black/5 text-center">
          <p className="font-semibold text-neutral-900">Nothing here yet for this filter</p>
          <p className="mt-1 text-sm text-neutral-500">Build a plan for this exam and its resources land here.</p>
          {skill && (
            <button
              type="button"
              onClick={() => setSkill('')}
              className={`${THEME.ghostBtn} mt-4 min-h-[44px] px-5 text-sm`}
            >
              Show all skills
            </button>
          )}
        </div>
      ) : (

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map((r) => {
            const badge = linkStatusBadge(r);
            return (
              <a
                key={r.id || r.url}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3.5 rounded-xl border border-black/[0.08] hover:border-orange-300 transition block"
              >
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {(r.skills || []).map((sk) => (
                    <span key={sk} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#F4F4F2] text-neutral-700">
                      {SKILL_LABELS[sk] || sk}
                    </span>
                  ))}
                </div>
                <div className="text-sm font-bold text-neutral-900 leading-snug">{r.title}</div>
                <div className="text-[11px] text-neutral-500 mt-2 flex items-center gap-1.5">
                  <StatusDot tone={badge.tone} />
                  {badge.label}
                </div>
                {r.lastCheckedAt && (
                  <div className="text-[10px] text-neutral-500">
                    Last checked {String(r.lastCheckedAt).slice(0, 10)}
                  </div>
                )}
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ============================================================================
// DIAGNOSTIC AGENT: short self-check that weights the roadmap toward weak skills
// ============================================================================
function DiagnosticPanel({ exam, level, result, onResult, onBuild, needsAccount, getAccessToken, onNeedAccount }) {
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);

  const start = async () => {
    if (needsAccount) {
      onNeedAccount?.();
      return;
    }
    setState('loading');
    setError(null);
    setAnswers({});
    try {
      const token = getAccessToken ? await getAccessToken() : null;
      const out = await apiPost('/api/diagnostic', { action: 'create', exam: exam.toUpperCase(), level }, { token });
      setQuestions(out.questions || []);
      setState('quiz');
    } catch (e) {
      console.warn('Diagnostic create failed:', e);
      setError(friendlyError(e, 'The placement self-check is temporarily unavailable, please try again shortly.'));
      setState('idle');
    }
  };

  const submit = async () => {
    if (needsAccount) {
      onNeedAccount?.();
      return;
    }
    setState('loading');
    try {
      const payload = questions.map((q) => ({
        id: q.id,
        skill: q.skill,
        cefr: q.cefr,
        // IRT scoring + calibration: stable item key and difficulty sent back with the answer
        ...(q.itemKey ? { itemKey: q.itemKey } : {}),
        ...(typeof q.b === 'number' ? { b: q.b } : {}),
        correct: answers[q.id] === q.answerIndex
      }));
      const token = getAccessToken ? await getAccessToken() : null;
      const out = await apiPost('/api/diagnostic', { action: 'score', exam: exam.toUpperCase(), level, answers: payload }, { token });
      onResult(out);
      setState('done');
    } catch (e) {
      console.warn('Diagnostic scoring failed:', e);
      setError(friendlyError(e, 'We could not score your answers right now, please try again shortly.'));
      setState('quiz');
    }
  };

  return (
    <section className="bg-white rounded-3xl border border-black/5 shadow-[0_1px_2px_rgba(17,17,17,0.04),0_12px_32px_-18px_rgba(17,17,17,0.14)] p-5 sm:p-7 space-y-4">
      <div>
        <h2 className="text-xl font-bold text-neutral-900">Placement Self-Check</h2>
        <p className="text-sm text-neutral-600 mt-0.5">
          12 quick questions for {examLabel(exam)} around {level}. Your roadmap then gives more days to your weaker skills. This is an unofficial self-check, not an official placement test.
        </p>
      </div>
      {!SERVER_ENABLED ? (
        <ServerRequired what="The placement check" />
      ) : (
        <>
          {state === 'idle' && (
            <button type="button" onClick={start} className="min-h-[44px] px-4 py-2 rounded-full bg-[#111111] hover:bg-neutral-800 text-white text-sm font-semibold">
              Start self-check
            </button>
          )}
          {state === 'loading' && <p className="text-xs text-neutral-500">Working…</p>}
          {error && <p className="text-xs text-red-700">{error}</p>}
          {state === 'quiz' && (
            <div className="space-y-4">
              {questions.map((q, i) => (
                <div key={q.id} className="p-4 rounded-xl border border-black/[0.08]">
                  <div className="text-[11px] font-semibold text-neutral-500 mb-1">
                    {i + 1}. {SKILL_LABELS[q.skill] || q.skill}
                  </div>
                  {q.transcript && (
                    <p className="text-xs text-neutral-600 italic bg-[#FAFAF8] rounded-lg p-2.5 mb-2 whitespace-pre-line">
                      Transcript: {q.transcript}
                    </p>
                  )}
                  <p className="text-sm text-neutral-900 whitespace-pre-line">{q.prompt}</p>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {q.options.map((opt, oi) => (
                      <button
                        key={oi}
                        type="button"
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                        className={`text-left px-3 py-2 rounded-lg border text-sm ${
                          answers[q.id] === oi ? 'border-orange-400 bg-orange-50' : 'border-black/[0.08]'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button
                type="button"
                disabled={Object.keys(answers).length < questions.length}
                onClick={submit}
                className="min-h-[44px] px-4 py-2 rounded-full bg-[#111111] disabled:bg-neutral-300 text-white text-sm font-semibold"
              >
                See my results
              </button>
            </div>
          )}
          {state === 'done' && result && (
            <div className="space-y-3">
              <p className="text-sm text-neutral-800">
                Estimated level: <strong>{result.estimatedLevel || 'not enough data'}</strong>
              </p>
              {typeof result.confidence === 'number' && (
                <p className="text-xs text-neutral-500">
                  Confidence: <strong className="text-neutral-800">{result.confidence >= 0.75 ? 'high' : result.confidence >= 0.5 ? 'medium' : 'low'}</strong>
                  {' '}({Math.round(result.confidence * 100)}%). Scored with an item-response model; more questions make it sharper.
                </p>
              )}
              <div className="space-y-1.5">
                {Object.entries(result.skillScores || {}).map(([sk, v]) => (
                  <div key={sk} className="flex items-center gap-2 text-xs">
                    <span className="w-24 text-neutral-600">{SKILL_LABELS[sk] || sk}</span>
                    <div className="flex-1 h-2 bg-[#F4F4F2] rounded-full overflow-hidden">
                      <div className="h-full bg-[#111111]" style={{ width: `${Math.round(v * 100)}%` }} />
                    </div>
                    <span className="w-10 text-right">{Math.round(v * 100)}%</span>
                  </div>
                ))}
              </div>
              {result.notice && <p className="text-[11px] text-amber-800">{result.notice}</p>}
              {(result.advice || []).map((a, i) => (
                <p key={i} className="text-xs text-neutral-600">{a}</p>
              ))}
              <div className="flex gap-2">
                <button type="button" onClick={onBuild} className="min-h-[44px] px-4 py-2 rounded-full bg-[#111111] hover:bg-neutral-800 text-white text-sm font-semibold">
                  Build my personalised roadmap
                </button>
                <button type="button" onClick={start} className="min-h-[44px] px-4 py-2 rounded-xl border border-neutral-300 text-sm">
                  Retake
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ============================================================================
// PRACTICE GENERATOR: original, clearly-labelled unofficial practice items
// ============================================================================
function PracticePanel({ exam, level, deckIds, onSaveToDeck, needsAccount, getAccessToken, onNeedAccount }) {
  const [skill, setSkill] = useState('reading');
  const [data, setData] = useState(null);
  const [revealed, setRevealed] = useState({});
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);

  const generate = async () => {
    if (needsAccount) {
      onNeedAccount?.();
      return;
    }
    setState('loading');
    setError(null);
    setRevealed({});
    try {
      const token = getAccessToken ? await getAccessToken() : null;
      const out = await apiPost('/api/practice', { exam: exam.toUpperCase(), level, skill, count: 5 }, { token });
      setData(out);
      setState('done');
    } catch (e) {
      console.warn('Practice generation failed:', e);
      setError(friendlyError(e, 'Practice is temporarily unavailable, please try again shortly.'));
      setState('idle');
    }
  };

  return (
    <section className="bg-white rounded-3xl border border-black/5 shadow-[0_1px_2px_rgba(17,17,17,0.04),0_12px_32px_-18px_rgba(17,17,17,0.14)] p-5 sm:p-7 space-y-4">
      <div>
        <h2 className="text-xl font-bold text-neutral-900">Extra Practice</h2>
        <p className="text-sm text-neutral-600 mt-0.5">
          Original practice in the {examLabel(exam)} style to use between official sample papers.
        </p>
      </div>
      {!SERVER_ENABLED ? (
        <ServerRequired what="Practice generation" />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            {['listening', 'reading', 'grammar', 'vocabulary', 'writing', 'speaking'].map((sk) => (
              <button
                key={sk}
                type="button"
                onClick={() => setSkill(sk)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                  skill === sk ? 'bg-[#111111] text-white border-neutral-900' : 'border-neutral-300 text-neutral-700'
                }`}
              >
                {SKILL_LABELS[sk]}
              </button>
            ))}
            <button
              type="button"
              onClick={generate}
              disabled={state === 'loading'}
              className="min-h-[44px] ml-auto px-4 py-2 rounded-full bg-[#111111] hover:bg-neutral-800 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {state === 'loading' ? 'Generating…' : 'Get 5 items'}
            </button>
          </div>
          {error && <p className="text-xs text-red-700">{error}</p>}
          {data && (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                {data.disclaimer}
              </p>
              {(data.items || []).map((it, i) => (
                <div key={it.id || i} className="p-4 rounded-xl border border-black/[0.08]">
                  {it.transcript && (
                    <p className="text-xs text-neutral-600 italic bg-[#FAFAF8] rounded-lg p-2.5 mb-2 whitespace-pre-line">
                      Transcript: {it.transcript}
                    </p>
                  )}
                  <p className="text-sm text-neutral-900 whitespace-pre-line">{i + 1}. {it.prompt}</p>
                  {Array.isArray(it.options) && (
                    <ul className="mt-2 text-sm text-neutral-700 list-[upper-alpha] pl-5 space-y-0.5">
                      {it.options.map((o, oi) => (
                        <li key={oi}>{o}</li>
                      ))}
                    </ul>
                  )}
                  {onSaveToDeck && (
                    <div className="mt-3 flex justify-end">
                      <SaveToDeckButton saved={deckIds?.has(cardIdFor(exam, it))} onSave={() => onSaveToDeck(it, data.skill || skill)} />
                    </div>
                  )}
                  {revealed[i] ? (
                    <div className="mt-2 text-xs text-neutral-700 bg-[#FAFAF8] rounded-lg p-2.5 whitespace-pre-line">
                      <strong>{it.modelAnswer ? 'Model answer:' : 'Answer:'}</strong> {it.modelAnswer ?? String(it.answer)}
                      {it.explanation && <div className="mt-1">{it.explanation}</div>}
                      {Array.isArray(it.checklist) && (
                        <ul className="mt-1 list-disc pl-4">
                          {it.checklist.map((c, ci) => (
                            <li key={ci}>{c}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRevealed((r) => ({ ...r, [i]: true }))}
                      className="mt-2 text-xs font-semibold text-orange-700 hover:underline"
                    >
                      Show answer
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ============================================================================
// PROGRESS COACH: checks pace and offers to rebalance the remaining tasks
// ============================================================================
function CoachPanel({ roadmap, onApply, needsAccount, getAccessToken, onNeedAccount }) {
  const scheduled = hasSchedule(roadmap);
  const [daysElapsed, setDaysElapsed] = useState(() => (scheduled ? Math.min(Math.max(currentDay(roadmap), 1), roadmap.days) : 1));
  const [advice, setAdvice] = useState(null);
  const [state, setState] = useState('idle');

  if (!SERVER_ENABLED || !roadmap?.phases) return null;

  const ask = async () => {
    if (needsAccount) {
      onNeedAccount?.();
      return;
    }
    setState('loading');
    try {
      // Scheduled plans: the server derives the day from createdAt and scores pace from progress.done.
      const body = scheduled
        ? { roadmap: { ...roadmap, calendar: roadmap.calendar, progress: roadmap.progress || { done: {} } }, daysElapsed: Number(daysElapsed) }
        : { roadmap, daysElapsed: Number(daysElapsed) };
      const token = getAccessToken ? await getAccessToken() : null;
      const out = await apiPost('/api/coach', body, { token });
      setAdvice(out);
      setState('done');
    } catch (e) {
      console.warn('Coach request failed:', e);
      setAdvice({ summary: friendlyError(e, 'The progress coach is temporarily unavailable, please try again shortly.'), tips: [] });
      setState('done');
    }
  };

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Activity className="w-4 h-4 text-orange-700" />
        <span className="font-semibold text-neutral-900">Progress coach</span>
        <label htmlFor="oe-coach-day" className="text-xs text-neutral-600">I'm on day</label>
        <input
          id="oe-coach-day"
          type="number"
          min="1"
          max={roadmap.days}
          value={daysElapsed}
          onChange={(e) => setDaysElapsed(e.target.value)}
          className="w-16 px-2 py-1 rounded-lg border border-neutral-300 text-xs"
        />
        <span className="text-xs text-neutral-600">of {roadmap.days}</span>
        <button
          type="button"
          onClick={ask}
          disabled={state === 'loading'}
          className="min-h-[44px] ml-auto px-3 py-1.5 rounded-full bg-[#111111] hover:bg-neutral-800 text-white text-xs font-semibold"
        >
          {state === 'loading' ? 'Checking…' : 'Check my pace'}
        </button>
      </div>
      {advice && (
        <div className="text-xs text-neutral-700 space-y-1.5">
          <p>
            {typeof advice.onTrack === 'boolean' && (
              <strong className={advice.insufficientHistory ? 'text-neutral-800' : advice.onTrack ? 'text-orange-700' : 'text-amber-700'}>
                {advice.insufficientHistory ? 'Just getting started. ' : advice.onTrack ? 'On track. ' : 'Behind schedule. '}
              </strong>
            )}
            {advice.summary}
          </p>
          {typeof advice.pace === 'number' && !advice.insufficientHistory && (
            <p className="text-neutral-600">
              Pace {advice.pace} tasks/day · planned {advice.plannedPace} · needed {advice.requiredPace}
              {advice.projectedFinishDate ? ` · projected finish ${advice.projectedFinishDate}` : advice.behindText ? ` · ${advice.behindText}` : ''}
            </p>
          )}
          {(advice.tips || []).map((t, i) => (
            <p key={i}>• {t}</p>
          ))}
          {!advice.onTrack && advice.rebalancedPhases?.length > 0 && (
            <button
              type="button"
              onClick={() => onApply(advice.rebalancedPhases)}
              className="px-3 py-1.5 rounded-lg border border-orange-400 text-orange-700 font-semibold"
            >
              Use the rebalanced plan for my remaining days
            </button>
          )}
          {!advice.onTrack && advice.rebalancedPhases?.length > 0 && scheduled && (
            <p className="text-[11px] text-neutral-500">This swaps the day-by-day view for a checklist of your remaining tasks.</p>
          )}
        </div>
      )}
    </div>
  );
}
