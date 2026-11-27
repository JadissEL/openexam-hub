import React, { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { SiteHeader, SiteFooter } from './SiteChrome.jsx';
import { BrowserFrame, PhoneFrame } from './frames.jsx';
import { ink, muted, eyebrow, h2, lead, pageFont } from './theme.js';
import { APP_PATH, LEGACY_HASH_REDIRECTS } from './content.js';
import { EXAM_PAGES } from '../seo/site.js';
import { API_BASE, SERVER_ENABLED } from '../firebaseConfig.js';
import { learnersProof } from './learners.js';
import { useHref, useLocale, useUnit } from '../i18n/LocaleContext.jsx';
import { isPagePublished, localizedUnit } from '../i18n/publish.js';

// Marketing page: editorial, story-led, deliberately unlike the app UI (no cards, tiles or widgets).
// Every claim on this page must be true in the code today. No invented numbers or quotes.

const arrow = 'w-5 h-5 transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100';

function PrimaryCTA({ children, className = '' }) {
  const href = useHref();
  return (
    <a
      href={href(APP_PATH)}
      className={`group inline-flex items-center justify-center gap-2 h-14 px-7 rounded-full bg-[#C2410C] hover:bg-[#9A3412] text-white text-[17px] font-semibold shadow-[0_14px_30px_-14px_rgba(234,88,12,0.75)] transition-colors ${className}`}
    >
      {children}
      <ArrowRight className={arrow} aria-hidden="true" />
    </a>
  );
}

function CtaTitle({ text }) {
  const split = text.indexOf('. ');
  if (split < 0) return text;
  return (
    <>
      {text.slice(0, split + 1)}
      <br className="hidden sm:block" /> {text.slice(split + 2)}
    </>
  );
}

function LearnersProof({ templates }) {
  const [count, setCount] = useState(undefined);
  useEffect(() => {
    if (!SERVER_ENABLED) return undefined;
    let cancelled = false;
    fetch(`${API_BASE}/api/stats`, { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('stats'))))
      .then((out) => {
        if (!cancelled) setCount(out?.registeredUsers);
      })
      .catch(() => {
        if (!cancelled) setCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const copy = count === undefined ? null : learnersProof(count, templates);
  return (
    <p className={`mt-4 text-[15px] leading-6 ${muted} min-h-6`} aria-live="polite" aria-hidden={copy ? undefined : true}>
      {copy || '\u00a0'}
    </p>
  );
}

function Hero({ home }) {
  const href = useHref();
  return (
    <section className="relative overflow-hidden" aria-labelledby="hero-title">
      <div className="relative mx-auto max-w-6xl px-5 sm:px-8 pt-8 sm:pt-14 lg:pt-20 pb-10 sm:pb-14 grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-16 items-center">
        <div>
          <p className={eyebrow}>{home.eyebrow}</p>
          <h1 id="hero-title" className={`mt-5 font-display ${ink} text-[44px] leading-[1.02] sm:text-6xl lg:text-[68px] lg:leading-[1.0] tracking-[-0.03em] font-medium`}>
            {home.h1Before} <em className="italic text-[#C2410C]">{home.h1Em}</em> {home.h1After}
          </h1>
          <p className={`mt-6 ${lead} max-w-xl`}>
            {home.lead}
          </p>
          <div className="mt-9 flex flex-col sm:flex-row sm:items-center gap-4">
            <PrimaryCTA>{home.cta}</PrimaryCTA>
            <a href={href('#how')} className={`inline-flex items-center justify-center gap-1.5 h-14 px-2 text-[17px] font-medium ${ink} underline decoration-[#E7C9B4] decoration-2 underline-offset-[6px] hover:decoration-[#EA580C]`}>
              {home.seeHow}
            </a>
          </div>
          <LearnersProof templates={{ first: home.learnersFirst, join: home.learnersJoin }} />
          <p className={`mt-4 text-[15px] ${muted}`}>
            {home.freeLine}
          </p>
        </div>

        <div className="relative mx-auto w-full max-w-[560px] lg:max-w-none">
          <BrowserFrame
            src="/landing/desk-plan.webp"
            alt={home.heroAltDesk}
            width={1024}
            height={896}
            eager
            className="hidden sm:block"
          />
          <PhoneFrame
            src="/landing/mob-builder.webp"
            alt={home.heroAltPhone}
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

function HowItWorks({ home }) {
  return (
    <section id="how" className="scroll-mt-6 bg-[#F1EDE5]" aria-labelledby="how-title">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-12 sm:py-16">
        <div className="max-w-3xl">
          <p className={eyebrow}>{home.howEyebrow}</p>
          <h2 id="how-title" className={`mt-4 ${h2}`}>{home.howTitle}</h2>
          <p className={`mt-4 text-[17px] leading-[1.7] ${muted}`}>
            {home.howLead}
          </p>
        </div>
        <figure className="mt-8 max-w-3xl rounded-[18px] bg-[#1A1714] ring-1 ring-black/[0.07] shadow-[0_40px_80px_-40px_rgba(60,40,20,0.45)] overflow-hidden">
          <video
            controls
            preload="none"
            playsInline
            poster="/demo/poster.jpg"
            width={1280}
            height={720}
            className="block w-full h-auto aspect-video bg-[#1A1714]"
            aria-label={home.videoLabel}
          >
            <source src="/demo/desktop.mp4" type="video/mp4" />
            <track kind="captions" src="/demo/desktop.vtt" srcLang="en" label="English" default />
          </video>
        </figure>
        <p className={`mt-3 max-w-3xl text-[13px] leading-relaxed ${muted}`}>
          {home.captions}
        </p>
        <ol className="mt-12 grid md:grid-cols-3 gap-x-10 gap-y-10">
          {home.steps.map((s, i) => (
            <li key={s.title}>
              <span aria-hidden="true" className="font-display text-[40px] leading-none text-[#C76A3A]">{String(i + 1).padStart(2, '0')}</span>
              <h3 className={`mt-3 ${ink} text-xl sm:text-[22px] font-semibold tracking-[-0.01em]`}>{s.title}</h3>
              <p className={`mt-2 text-[17px] leading-[1.7] ${muted}`}>{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Exams({ home, sources }) {
  const href = useHref();
  const locale = useLocale();
  const guides = EXAM_PAGES.filter((g) => isPagePublished(locale, `/exams/${g.slug}`));
  return (
    <section id="exams" className="scroll-mt-6" aria-labelledby="exams-title">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-20">
        <div className="max-w-3xl">
          <p className={eyebrow}>{home.examsEyebrow}</p>
          <h2 id="exams-title" className={`mt-4 ${h2}`}>{home.examsTitle}</h2>
          <p className={`mt-6 ${lead}`}>
            {home.examsLead}
          </p>
        </div>
        <div className="mt-14 grid md:grid-cols-3 gap-x-12 gap-y-12">
          {sources.groups.map((group) => (
            <div key={group.exam} className="border-t-2 border-[#1A1714] pt-5">
              <h3 className={`font-display ${ink} text-[28px] font-medium`}>{group.exam}</h3>
              <p className="text-[15px] text-[#6B635A]">{group.language}</p>
              <ul className="mt-6 divide-y divide-[#E7E1D7] border-t border-[#E7E1D7]">
                {group.orgs.map((o) => (
                  <li key={o.name}>
                    <a href={o.url} target="_blank" rel="noopener noreferrer" className="group flex items-start justify-between gap-3 py-4">
                      <span>
                        <span className={`block ${ink} text-[17px] font-semibold group-hover:text-[#C2410C]`}>{o.name}</span>
                        <span className={`block text-[15px] ${muted}`}>{o.note}</span>
                      </span>
                      <ArrowUpRight className="w-4 h-4 mt-1.5 shrink-0 text-[#B5ABA0] group-hover:text-[#C2410C]" aria-hidden="true" />
                      <span className="sr-only">{home.newTab}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <nav aria-labelledby="guides-title" className="mt-14 border-t border-[#E7E1D7] pt-8">
          <h3 id="guides-title" className={`${ink} text-xl sm:text-[22px] font-semibold tracking-[-0.01em]`}>{home.guidesTitle}</h3>
          <p className={`mt-2 text-[17px] leading-[1.7] ${muted} max-w-3xl`}>
            {home.guidesLead}
          </p>
          <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-3">
            {guides.map((g) => {
              const label = localizedUnit(locale, `exam:${g.slug}`)?.label || g.label;
              return (
                <li key={g.slug}>
                  <a href={href(`/exams/${g.slug}`)} className={`text-[17px] font-medium ${ink} underline decoration-[#E7C9B4] decoration-2 underline-offset-[6px] hover:decoration-[#EA580C]`}>
                    {label} {home.guideSuffix}
                  </a>
                </li>
              );
            })}
            <li>
              <a href={href('/exams')} className="text-[17px] font-medium text-[#C2410C] underline decoration-[#E7C9B4] decoration-2 underline-offset-[6px] hover:decoration-[#EA580C]">
                {home.allGuides}
              </a>
            </li>
          </ul>
        </nav>
        <p className={`mt-12 text-[15px] leading-relaxed ${muted} max-w-3xl`}>
          {home.independent}
        </p>
      </div>
    </section>
  );
}

function HomeFAQ({ home, faq }) {
  const href = useHref();
  const items = (faq.items || []).slice(0, 5);
  return (
    <section id="common-questions" className="scroll-mt-6 bg-[#F1EDE5]" aria-labelledby="faq-title">
      <div className="mx-auto max-w-3xl px-5 sm:px-8 py-16 sm:py-20">
        <p className={eyebrow}>{home.faqEyebrow}</p>
        <h2 id="faq-title" className={`mt-4 ${h2}`}>{home.faqTitle}</h2>
        <div className="mt-10 divide-y divide-[#E2DBCF] border-y border-[#E2DBCF]">
          {items.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className={`cursor-pointer list-none flex items-start justify-between gap-4 ${ink} text-[18px] font-semibold`}>
                <span>{f.q}</span>
                <span aria-hidden="true" className="mt-0.5 text-[#C2410C] transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className={`mt-3 text-[17px] leading-[1.7] ${muted}`}>{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8">
          <a href={href('/faq')} className={`text-[17px] font-medium ${ink} underline decoration-[#E7C9B4] decoration-2 underline-offset-[6px] hover:decoration-[#EA580C]`}>
            {home.faqAll}
          </a>
        </p>
      </div>
    </section>
  );
}

function FinalCTA({ home }) {
  return (
    <section aria-labelledby="cta-title" className="relative overflow-hidden">
      <div aria-hidden="true" className="absolute inset-0 opacity-90" style={{ background: 'linear-gradient(120deg, #FFE3CF 0%, #FCE4EE 100%)' }} />
      <div className="relative mx-auto max-w-4xl px-5 sm:px-8 py-20 sm:py-24 text-center">
        <h2 id="cta-title" className={`font-display ${ink} text-[38px] leading-[1.05] sm:text-6xl tracking-[-0.03em] font-medium`}>
          <CtaTitle text={home.ctaTitle} />
        </h2>
        <p className={`mt-6 ${lead} max-w-xl mx-auto`}>
          {home.ctaLead}
        </p>
        <div className="mt-9"><PrimaryCTA>{home.cta}</PrimaryCTA></div>
      </div>
    </section>
  );
}

export default function Landing() {
  const home = useUnit('landing:home');
  const faq = useUnit('landing:faq');
  const sources = useUnit('landing:sources');
  const href = useHref();
  useEffect(() => {
    document.title = home.headTitle;
    const hash = (window.location.hash || '').replace(/^#/, '');
    const dest = LEGACY_HASH_REDIRECTS[hash];
    if (dest) {
      if (dest.startsWith('/#')) {
        window.location.hash = dest.slice(1);
      } else {
        window.location.replace(href(dest));
      }
    }
  }, [home.headTitle, href]);
  return (
    <div className="relative overflow-x-clip min-h-screen bg-[#F7F5F0] text-[#1A1714] antialiased" style={pageFont}>
      <div aria-hidden="true" className="pointer-events-none absolute -top-56 right-[-25%] sm:right-[-12%] w-[760px] h-[760px] rounded-full opacity-[0.35] blur-3xl" style={{ background: 'radial-gradient(closest-side, #FFB27A, rgba(247,168,216,0.6) 55%, transparent)' }} />
      <SiteHeader />
      <main id="main" className="relative">
        <Hero home={home} />
        <HowItWorks home={home} />
        <Exams home={home} sources={sources} />
        <HomeFAQ home={home} faq={faq} />
        <FinalCTA home={home} />
      </main>
      <SiteFooter />
    </div>
  );
}
