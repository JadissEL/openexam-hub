import React, { useEffect } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { SiteHeader, SiteFooter } from './SiteChrome.jsx';
import { BrowserFrame, PhoneFrame } from './frames.jsx';
import { ink, muted, eyebrow, h2, lead, pageFont } from './theme.js';
import { APP_PATH, LEGACY_HASH_REDIRECTS, SOURCES } from './content.js';

// Marketing page: editorial, story-led, deliberately unlike the app UI (no cards, tiles or widgets).
// Every claim on this page must be true in the code today. No invented numbers or quotes.

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

function Hero() {
  return (
    <section className="relative overflow-hidden" aria-labelledby="hero-title">
      <div className="relative mx-auto max-w-6xl px-5 sm:px-8 pt-8 sm:pt-14 lg:pt-20 pb-16 sm:pb-24 grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-16 items-center">
        <div>
          <p className={eyebrow}>Free study plans · TEF Canada · TCF · IELTS · TOEFL · Goethe · DELE</p>
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
            Free. Create a free account to generate your plan. Open source (MIT).
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

const STEPS = [
  {
    title: 'Tell it about your exam',
    body: 'Choose TEF Canada, TCF, IELTS, TOEFL, Goethe or DELE, the level you’re aiming for (A1 to C2) and how many days you have. Not sure of your level? There’s a short placement check.'
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
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-20 grid lg:grid-cols-[1.25fr_1fr] gap-14 lg:gap-20 items-center">
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

function Exams() {
  return (
    <section id="exams" className="scroll-mt-6" aria-labelledby="exams-title">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-20">
        <div className="max-w-3xl">
          <p className={eyebrow}>Exams and sources</p>
          <h2 id="exams-title" className={`mt-4 ${h2}`}>TEF Canada, TCF, IELTS, TOEFL, Goethe and DELE. Only official, free sources.</h2>
          <p className={`mt-6 ${lead}`}>
            These are the organisations whose free pages are in our library today. We link; we never copy.
            Plans can only point to websites on an allowlist, and links are re-checked every night.
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

function FinalCTA() {
  return (
    <section aria-labelledby="cta-title" className="relative overflow-hidden">
      <div aria-hidden="true" className="absolute inset-0 opacity-90" style={{ background: 'linear-gradient(120deg, #FFE3CF 0%, #FCE4EE 100%)' }} />
      <div className="relative mx-auto max-w-4xl px-5 sm:px-8 py-20 sm:py-24 text-center">
        <h2 id="cta-title" className={`font-display ${ink} text-[38px] leading-[1.05] sm:text-6xl tracking-[-0.03em] font-medium`}>
          Your exam date is set.<br className="hidden sm:block" /> Make the weeks before it calmer.
        </h2>
        <p className={`mt-6 ${lead} max-w-xl mx-auto`}>
          Three choices and you have a plan. Free. Create a free account to generate yours — no card needed.
        </p>
        <div className="mt-9"><PrimaryCTA /></div>
      </div>
    </section>
  );
}

export default function Landing() {
  useEffect(() => {
    document.title = 'OpenExam Hub · Free study plans for TEF Canada, TCF, IELTS, TOEFL, Goethe and DELE';
    const hash = (window.location.hash || '').replace(/^#/, '');
    const dest = LEGACY_HASH_REDIRECTS[hash];
    if (dest) {
      if (dest.startsWith('/#')) {
        window.location.hash = dest.slice(1);
      } else {
        window.location.replace(dest);
      }
    }
  }, []);
  return (
    <div className="relative overflow-x-clip min-h-screen bg-[#F7F5F0] text-[#1A1714] antialiased" style={pageFont}>
      <div aria-hidden="true" className="pointer-events-none absolute -top-56 right-[-25%] sm:right-[-12%] w-[760px] h-[760px] rounded-full opacity-[0.35] blur-3xl" style={{ background: 'radial-gradient(closest-side, #FFB27A, rgba(247,168,216,0.6) 55%, transparent)' }} />
      <SiteHeader />
      <main id="main" className="relative">
        <Hero />
        <HowItWorks />
        <Exams />
        <FinalCTA />
      </main>
      <SiteFooter />
    </div>
  );
}
