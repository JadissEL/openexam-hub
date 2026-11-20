import React, { useEffect } from 'react';
import { ArrowRight, ArrowUpRight, Plus } from 'lucide-react';
import { SiteHeader, SiteFooter } from './SiteChrome.jsx';
import { GithubMark } from './icons.jsx';
import { APP_PATH, CONTACT_EMAIL, FAQ, REPO_URL, SOURCES } from './content.js';
import { DONATION_LINKS } from '../donations.js';

// Marketing page: editorial, story-led, deliberately unlike the app UI (no cards, tiles or widgets).
// Every claim on this page must be true in the code today. No invented numbers or quotes.

const ink = 'text-[#1A1714]';
const muted = 'text-[#5C554C]';
const eyebrow = 'text-[13px] font-semibold uppercase tracking-[0.16em] text-[#C2410C]';
const h2 = `font-display ${ink} text-[34px] leading-[1.08] sm:text-5xl sm:leading-[1.05] tracking-[-0.02em] font-medium`;
const lead = `${muted} text-[18px] sm:text-xl leading-[1.65]`;

function PrimaryCTA({ children = 'Build my free plan', className = '' }) {
  return (
    <a
      href={APP_PATH}
      className={`group inline-flex items-center justify-center gap-2 h-14 px-7 rounded-full bg-[#EA580C] hover:bg-[#C2410C] text-white text-[17px] font-semibold shadow-[0_14px_30px_-14px_rgba(234,88,12,0.75)] transition-colors ${className}`}
    >
      {children}
      <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </a>
  );
}

function BrowserFrame({ src, alt, width, height, className = '', eager = false }) {
  return (
    <figure className={`rounded-[18px] bg-white ring-1 ring-black/[0.07] shadow-[0_40px_80px_-40px_rgba(60,40,20,0.45)] overflow-hidden ${className}`}>
      <div className="flex items-center gap-1.5 px-4 h-9 border-b border-black/[0.06] bg-[#FBFAF8]" aria-hidden="true">
        <span className="w-2.5 h-2.5 rounded-full bg-[#E9E4DC]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#E9E4DC]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#E9E4DC]" />
        <span className="ml-3 text-[11px] text-[#8A8178] truncate">openexamhub.org/app</span>
      </div>
      <img src={src} alt={alt} width={width} height={height} loading={eager ? 'eager' : 'lazy'} decoding="async" fetchpriority={eager ? 'high' : undefined} className="block w-full h-auto" />
    </figure>
  );
}

function PhoneFrame({ src, alt, width, height, className = '', eager = false }) {
  return (
    <figure className={`rounded-[34px] bg-[#1A1714] p-[7px] shadow-[0_40px_70px_-30px_rgba(60,40,20,0.55)] ${className}`}>
      <div className="rounded-[28px] overflow-hidden bg-[#F4F4F2]">
        <img src={src} alt={alt} width={width} height={height} loading={eager ? 'eager' : 'lazy'} decoding="async" className="block w-full h-auto" />
      </div>
    </figure>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden" aria-labelledby="hero-title">
      <div className="relative mx-auto max-w-6xl px-5 sm:px-8 pt-8 sm:pt-14 lg:pt-20 pb-16 sm:pb-24 grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-16 items-center">
        <div>
          <p className={eyebrow}>Free study plans · TCF · IELTS · Goethe</p>
          <h1 id="hero-title" className={`mt-5 font-display ${ink} text-[44px] leading-[1.02] sm:text-6xl lg:text-[68px] lg:leading-[1.0] tracking-[-0.03em] font-medium`}>
            Prepare for your language exam <em className="italic text-[#C2410C]">without</em> paying for a course.
          </h1>
          <p className={`mt-6 ${lead} max-w-xl`}>
            OpenExam Hub started at our kitchen table, while my wife was preparing for her language certification
            exams. It turns the free material that exam bodies already publish into a calm, day-by-day plan.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row sm:items-center gap-4">
            <PrimaryCTA />
            <a href="#how" className={`inline-flex items-center justify-center gap-1.5 h-14 px-2 text-[17px] font-medium ${ink} underline decoration-[#E7C9B4] decoration-2 underline-offset-[6px] hover:decoration-[#EA580C]`}>
              See how it works
            </a>
          </div>
          <p className={`mt-6 text-[15px] ${muted}`}>
            Free forever · No account needed · Open source (MIT)
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-[560px] lg:max-w-none">
          <BrowserFrame
            src="/landing/desk-plan.webp"
            alt="Screenshot of a 30-day TCF B2 plan in OpenExam Hub: three official resources with verified links, and a checklist with a progress coach."
            width={1024}
            height={896}
            eager
            className="hidden sm:block"
          />
          <PhoneFrame
            src="/landing/mob-builder.webp"
            alt="Screenshot of the plan builder on a phone: pick your exam, target level and days until the exam."
            width={560}
            height={1017}
            eager
            className="w-[250px] mx-auto sm:mx-0 sm:w-[210px] sm:absolute sm:-bottom-10 sm:-left-8 lg:-left-14"
          />
        </div>
      </div>
    </section>
  );
}

function HonestNote() {
  return (
    <section aria-label="Where the project is today" className="border-y border-[#E7E1D7]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-10 sm:py-12 grid md:grid-cols-[auto_1fr] gap-4 md:gap-12 items-baseline">
        <p className={eyebrow}>Where we are today</p>
        <p className={`font-display ${ink} text-[22px] sm:text-[26px] leading-[1.4] tracking-[-0.01em]`}>
          OpenExam Hub is new. We don’t have thousands of users or press quotes to show you, and we won’t make
          them up. What we can show you is how it works, where every resource comes from, and the code itself.
        </p>
      </div>
    </section>
  );
}

function Story() {
  return (
    <section id="story" className="scroll-mt-6" aria-labelledby="story-title">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-20 sm:py-28 grid lg:grid-cols-[1fr_1.6fr] gap-10 lg:gap-20">
        <div>
          <p className={eyebrow}>Who’s behind this</p>
          <h2 id="story-title" className={`mt-4 ${h2}`}>A family project, not a startup.</h2>
        </div>
        <div className={`space-y-6 text-[18px] sm:text-[20px] leading-[1.75] ${muted}`}>
          <p className={`${ink} first-letter:font-display first-letter:text-[64px] first-letter:leading-[0.8] first-letter:float-left first-letter:mr-3 first-letter:mt-1.5 first-letter:text-[#C2410C]`}>
            OpenExam Hub started at our kitchen table when my wife was preparing for her language certification
            exams. We saw first-hand how stressful it is to hunt for reliable study material without getting
            pulled into expensive coaching agencies or ending up on broken links.
          </p>
          <p>
            The strange part is that the good material already exists. France Éducation international, the
            Goethe-Institut, the British Council and public broadcasters publish free sample papers and practice
            for these exams. It is just scattered across dozens of pages, in different languages, with no plan
            attached.
          </p>
          <p>
            So we built the tool we wished we’d had: pick your exam, your level and your date, and get a schedule
            that points only to those official, free pages. No paywall, now or later.
          </p>
          <div className="pt-4 flex items-center gap-4">
            <span aria-hidden="true" className="w-12 h-12 rounded-full bg-[#1A1714] text-white font-display text-lg flex items-center justify-center">J</span>
            <div className="leading-tight">
              <p className={`${ink} font-semibold text-[17px]`}>Jadiss El Antaki</p>
              <p className="text-[15px] text-[#8A8178]">Built OpenExam Hub · <a className="underline underline-offset-4 hover:text-[#C2410C]" href={`mailto:${CONTACT_EMAIL}`}>write to me</a></p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  {
    title: 'Tell it about your exam',
    body: 'Choose TCF, IELTS or Goethe, the level you’re aiming for (A2 to C1) and how many days you have. Not sure of your level? There’s a short placement check.'
  },
  {
    title: 'Get a day-by-day plan',
    body: 'You get phases and daily tasks, each pointing to a free page from an official source. Every link is checked automatically, and its status is shown right next to it.'
  },
  {
    title: 'Tick things off, adjust as you go',
    body: 'Ticks are saved as you go. If you fall behind, the progress coach re-paces the rest of the plan. You can also export your plan as Markdown or JSON.'
  }
];

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-6 bg-[#F1EDE5]" aria-labelledby="how-title">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-20 sm:py-28 grid lg:grid-cols-[1.25fr_1fr] gap-14 lg:gap-20 items-center">
        <div>
          <p className={eyebrow}>How it works</p>
          <h2 id="how-title" className={`mt-4 ${h2}`}>Three choices, then a plan you can actually follow.</h2>
          <ol className="mt-12 space-y-10">
            {STEPS.map((s, i) => (
              <li key={s.title} className="grid grid-cols-[3.25rem_1fr] gap-4">
                <span aria-hidden="true" className="font-display text-[40px] leading-none text-[#E2A27A]">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3 className={`${ink} text-xl sm:text-[22px] font-semibold tracking-[-0.01em]`}>{s.title}</h3>
                  <p className={`mt-2 text-[17px] leading-[1.7] ${muted}`}>{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-12"><PrimaryCTA>Try it now, no sign-up</PrimaryCTA></div>
        </div>
        <PhoneFrame
          src="/landing/mob-plan.webp"
          alt="Screenshot of a TCF B2 plan on a phone, showing official resources marked ‘link checked, reachable’."
          width={512}
          height={1024}
          className="w-[260px] sm:w-[300px] mx-auto"
        />
      </div>
    </section>
  );
}

function Sources() {
  return (
    <section id="sources" className="scroll-mt-6" aria-labelledby="sources-title">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-20 sm:py-28">
        <div className="max-w-3xl">
          <p className={eyebrow}>Where resources come from</p>
          <h2 id="sources-title" className={`mt-4 ${h2}`}>Only official, free sources. We link; we never copy.</h2>
          <p className={`mt-6 ${lead}`}>
            These are the organisations whose free pages are in our library today. Plans can only point to
            websites on an allowlist, and links are re-checked every night.
          </p>
        </div>
        <div className="mt-14 grid md:grid-cols-3 gap-x-12 gap-y-12">
          {SOURCES.map((group) => (
            <div key={group.exam} className="border-t-2 border-[#1A1714] pt-5">
              <h3 className={`font-display ${ink} text-[28px] font-medium`}>{group.exam}</h3>
              <p className="text-[15px] text-[#8A8178]">{group.language}</p>
              <ul className="mt-6 divide-y divide-[#E7E1D7] border-t border-[#E7E1D7]">
                {group.orgs.map((o) => (
                  <li key={o.name}>
                    <a href={o.url} target="_blank" rel="noopener noreferrer" className="group flex items-start justify-between gap-3 py-4">
                      <span>
                        <span className={`block ${ink} text-[17px] font-semibold group-hover:text-[#C2410C]`}>{o.name}</span>
                        <span className={`block text-[15px] ${muted}`}>{o.note}</span>
                      </span>
                      <ArrowUpRight className="w-4 h-4 mt-1.5 shrink-0 text-[#B5ABA0] group-hover:text-[#C2410C]" aria-hidden="true" />
                      <span className="sr-only">(opens the official site in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className={`mt-12 text-[15px] leading-relaxed ${muted} max-w-3xl`}>
          OpenExam Hub is independent. We are not affiliated with, endorsed by or sponsored by any of these
          organisations. Their names are used only to tell you where a link leads.
        </p>
      </div>
    </section>
  );
}

function ProductPeek() {
  return (
    <section aria-labelledby="peek-title" className="bg-[#1A1714] text-white">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-20 sm:py-28">
        <div className="max-w-2xl">
          <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#FDBA8C]">What you actually get</p>
          <h2 id="peek-title" className="mt-4 font-display text-[34px] leading-[1.08] sm:text-5xl tracking-[-0.02em] font-medium">
            Real resources, checked every night.
          </h2>
          <p className="mt-6 text-[18px] leading-[1.7] text-[#D9D2C8]">
            This is the real library inside the app. Every resource shows which official site it comes from,
            whether its link was reachable, and the date it was last checked.
          </p>
          <a href={APP_PATH} className="mt-8 inline-flex items-center gap-2 text-[17px] font-semibold text-white underline decoration-[#EA580C] decoration-2 underline-offset-[6px]">
            Open the planner <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </a>
        </div>
        <BrowserFrame
          src="/landing/desk-library.webp"
          alt="Screenshot of the OpenExam Hub library for TCF: France Éducation international, TV5Monde and RFI, each marked ‘official domain, link checked, reachable’ with the date of the last check."
          width={1024}
          height={272}
          className="mt-12"
        />
      </div>
    </section>
  );
}

function Free() {
  const promises = [
    ['No paywall', 'Every feature is free, forever. There is no premium tier waiting behind it.'],
    ['Open books', 'Every euro from donations and dashboard ads is shown publicly, so you can see exactly how the site is paid for.'],
    ['No selling data', 'We don’t sell or rent personal data, and never will.']
  ];
  return (
    <section id="free" className="scroll-mt-6" aria-labelledby="free-title">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-20 sm:py-28 grid lg:grid-cols-[1fr_1.4fr] gap-12 lg:gap-20">
        <div>
          <p className={eyebrow}>How it’s free</p>
          <h2 id="free-title" className={`mt-4 ${h2}`}>How the lights stay on.</h2>
        </div>
        <div>
          <p className={lead}>
            Free forever. Funded openly by donations and a few dashboard ads, which go away once the next 5 years
            are covered.
          </p>
          <p className={`mt-5 text-[17px] leading-[1.7] ${muted}`}>
            The expensive part of exam prep is usually the course, not the content. We skip the course. What’s left
            is hosting and AI calls for writing plans. Ads appear only on the study dashboard, never on this page,
            and all earnings from ads and donations are published so anyone can check them.
          </p>
          <dl className="mt-10 divide-y divide-[#E7E1D7] border-y border-[#E7E1D7]">
            {promises.map(([t, d]) => (
              <div key={t} className="py-5 grid sm:grid-cols-[11rem_1fr] gap-1 sm:gap-6">
                <dt className={`${ink} font-display text-[22px] font-medium`}>{t}</dt>
                <dd className={`text-[17px] leading-[1.65] ${muted}`}>{d}</dd>
              </div>
            ))}
          </dl>
          <p className={`mt-8 text-[17px] leading-[1.7] ${muted}`}>
            Want to help the ads disappear sooner? You can leave a tip on{' '}
            <a className="text-[#C2410C] underline underline-offset-4" href={DONATION_LINKS.kofi} target="_blank" rel="noopener noreferrer">Ko-fi</a>.
            It’s optional and unlocks nothing: everyone gets the same planner.
          </p>
          <a
            href={DONATION_LINKS.kofi}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-2 h-12 px-6 rounded-full border border-[#1A1714] text-[#1A1714] font-semibold hover:bg-[#1A1714] hover:text-white transition-colors"
          >
            Support on Ko-fi <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}

function Privacy() {
  const points = [
    ['Use it as a guest', 'When you open the planner, it creates an anonymous account in your browser. No name, no email.'],
    ['Your plans are yours', 'Plans and ticks are stored in Google Firebase (EU region), under your account only. Other people can’t read them.'],
    ['Sign in only to sync', 'Signing in with email or Google is optional and only lets you use your plans on more than one device.'],
    ['No analytics', 'We don’t use analytics tools. AI requests contain your exam, level, timeline and progress, never your name or email.']
  ];
  return (
    <section id="privacy" className="scroll-mt-6 bg-[#F1EDE5]" aria-labelledby="privacy-title">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-20 sm:py-28">
        <div className="max-w-3xl">
          <p className={eyebrow}>Your data</p>
          <h2 id="privacy-title" className={`mt-4 ${h2}`}>What we keep, in plain words.</h2>
        </div>
        <div className="mt-12 grid sm:grid-cols-2 gap-x-14 gap-y-10">
          {points.map(([t, d]) => (
            <div key={t} className="border-l-2 border-[#EA580C] pl-5">
              <h3 className={`${ink} text-xl font-semibold`}>{t}</h3>
              <p className={`mt-2 text-[17px] leading-[1.7] ${muted}`}>{d}</p>
            </div>
          ))}
        </div>
        <p className={`mt-12 text-[17px] ${muted}`}>
          Want everything deleted? Email{' '}
          <a className="text-[#C2410C] underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          The details are in the <a className="text-[#C2410C] underline underline-offset-4" href="/privacy">privacy notice</a>.
        </p>
      </div>
    </section>
  );
}

function OpenSource() {
  return (
    <section aria-labelledby="code-title">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-20 sm:py-28 grid lg:grid-cols-[1fr_1.4fr] gap-10 lg:gap-20 items-start">
        <div>
          <p className={eyebrow}>Built in the open</p>
          <h2 id="code-title" className={`mt-4 ${h2}`}>Don’t take our word for it. Read the code.</h2>
        </div>
        <div>
          <p className={lead}>
            Everything on this page can be checked: the resource allowlist, the link checker, how plans are paced,
            and exactly what is stored in the database. The full source code is on GitHub under the MIT licence, and
            issues and suggestions for new official resources are welcome.
          </p>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex items-center gap-3 h-14 px-6 rounded-full border border-[#1A1714] text-[#1A1714] text-[17px] font-semibold hover:bg-[#1A1714] hover:text-white transition-colors"
          >
            <GithubMark className="w-5 h-5" /> github.com/JadissEL/openexam-hub
          </a>
        </div>
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" className="scroll-mt-6 border-t border-[#E7E1D7]" aria-labelledby="faq-title">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-20 sm:py-28 grid lg:grid-cols-[1fr_1.6fr] gap-10 lg:gap-20">
        <div>
          <p className={eyebrow}>FAQ</p>
          <h2 id="faq-title" className={`mt-4 ${h2}`}>Fair questions.</h2>
          <p className={`mt-6 text-[17px] ${muted}`}>
            Something missing? <a className="text-[#C2410C] underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>Ask me directly</a>.
          </p>
        </div>
        <div className="border-t border-[#D9D1C5]">
          {FAQ.map((f) => (
            <details key={f.q} className="group border-b border-[#D9D1C5]">
              <summary className={`flex cursor-pointer list-none items-start justify-between gap-6 py-6 ${ink} text-[18px] sm:text-xl font-semibold [&::-webkit-details-marker]:hidden`}>
                {f.q}
                <Plus className="w-5 h-5 mt-1 shrink-0 text-[#C2410C] transition-transform group-open:rotate-45" aria-hidden="true" />
              </summary>
              <p className={`-mt-1 pb-6 pr-10 text-[17px] leading-[1.75] ${muted}`}>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section aria-labelledby="cta-title" className="relative overflow-hidden">
      <div aria-hidden="true" className="absolute inset-0 opacity-90" style={{ background: 'linear-gradient(120deg, #FFE3CF 0%, #FCE4EE 100%)' }} />
      <div className="relative mx-auto max-w-4xl px-5 sm:px-8 py-20 sm:py-28 text-center">
        <h2 id="cta-title" className={`font-display ${ink} text-[38px] leading-[1.05] sm:text-6xl tracking-[-0.03em] font-medium`}>
          Your exam date is set.<br className="hidden sm:block" /> Make the weeks before it calmer.
        </h2>
        <p className={`mt-6 ${lead} max-w-xl mx-auto`}>Three choices and you have a plan. No account, no card.</p>
        <div className="mt-9"><PrimaryCTA /></div>
      </div>
    </section>
  );
}

export default function Landing() {
  useEffect(() => {
    document.title = 'OpenExam Hub · Free study plans for TCF, IELTS and Goethe exams';
  }, []);
  return (
    <div className="relative overflow-x-clip min-h-screen bg-[#F7F5F0] text-[#1A1714] antialiased" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}>
      {/* soft brand glow behind header + hero, purely decorative */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-56 right-[-25%] sm:right-[-12%] w-[760px] h-[760px] rounded-full opacity-[0.35] blur-3xl" style={{ background: 'radial-gradient(closest-side, #FFB27A, rgba(247,168,216,0.6) 55%, transparent)' }} />
      <SiteHeader />
      <main id="main" className="relative">
        <Hero />
        <HonestNote />
        <Story />
        <HowItWorks />
        <Sources />
        <ProductPeek />
        <Free />
        <Privacy />
        <OpenSource />
        <Faq />
        <FinalCTA />
      </main>
      <SiteFooter />
    </div>
  );
}
