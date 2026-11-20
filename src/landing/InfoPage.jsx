import React, { useEffect } from 'react';
import { ArrowRight, ArrowUpRight, Plus } from 'lucide-react';
import { SiteHeader, SiteFooter } from './SiteChrome.jsx';
import { BrowserFrame } from './frames.jsx';
import { GithubMark } from './icons.jsx';
import { ink, muted, eyebrow, h2, lead, pageFont } from './theme.js';
import { APP_PATH, CONTACT_EMAIL, FAQ, REPO_URL } from './content.js';
import { DONATION_LINKS } from '../donations.js';

function PageShell({ title, eyebrowText, intro, children }) {
  useEffect(() => {
    document.title = `${title} · OpenExam Hub`;
  }, [title]);
  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1A1714] antialiased" style={pageFont}>
      <SiteHeader />
      <main id="main">
        <header className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 sm:pt-16 pb-6 sm:pb-8">
          {eyebrowText ? <p className={eyebrow}>{eyebrowText}</p> : null}
          <h1 className={`mt-4 font-display ${ink} text-5xl sm:text-6xl tracking-[-0.03em] font-medium leading-[1.02]`}>{title}</h1>
          {intro ? <p className={`mt-6 max-w-3xl ${lead}`}>{intro}</p> : null}
        </header>
        {children}
      </main>
      <SiteFooter />
    </div>
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
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24 grid lg:grid-cols-[1fr_1.6fr] gap-10 lg:gap-20">
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
            The strange part is that the good material already exists. The CCI Paris, France Éducation international,
            ETS, Instituto Cervantes, the Goethe-Institut, the British Council and public broadcasters publish free
            sample papers and practice for these exams. It is just scattered across dozens of pages, in different
            languages, with no plan attached.
          </p>
          <p>
            So we built the tool we wished we’d had: pick your exam, your level and your date, and get a schedule
            that points only to those official, free pages. No paywall, now or later. Free. Create a free account
            to generate your plan.
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

function ProductPeek() {
  return (
    <section aria-labelledby="peek-title" className="bg-[#1A1714] text-white">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24">
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

function OpenSource() {
  return (
    <section aria-labelledby="code-title">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24 grid lg:grid-cols-[1fr_1.4fr] gap-10 lg:gap-20 items-start">
        <div>
          <p className={eyebrow}>Built in the open</p>
          <h2 id="code-title" className={`mt-4 ${h2}`}>Don’t take our word for it. Read the code.</h2>
        </div>
        <div>
          <p className={lead}>
            Everything on this site can be checked: the resource allowlist, the link checker, how plans are paced,
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

export function AboutPage() {
  return (
    <PageShell
      title="About OpenExam Hub"
      eyebrowText="The project"
      intro="A family project that turns official free exam material into a day-by-day study plan."
    >
      <HonestNote />
      <Story />
      <ProductPeek />
      <OpenSource />
    </PageShell>
  );
}

export function FaqPage() {
  return (
    <PageShell
      title="Fair questions"
      eyebrowText="FAQ"
      intro={
        <>
          Something missing? <a className="text-[#C2410C] underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>Ask me directly</a>.
        </>
      }
    >
      <section aria-labelledby="faq-list-title" className="mx-auto max-w-6xl px-5 sm:px-8 pb-24">
        <h2 id="faq-list-title" className="sr-only">Frequently asked questions</h2>
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
      </section>
    </PageShell>
  );
}

export function FundingPage() {
  const promises = [
    ['No paywall', 'Every feature is free, forever. There is no premium tier waiting behind it.'],
    ['Open books', 'Every euro from donations and dashboard ads is shown publicly, so you can see exactly how the site is paid for.'],
    ['No selling data', 'We don’t sell or rent personal data, and never will.']
  ];
  return (
    <PageShell
      title="How the lights stay on"
      eyebrowText="Funding and ads"
      intro="Free forever. Funded openly by donations and a few dashboard ads, which go away once the next 5 years are covered."
    >
      <section aria-labelledby="funding-detail-title" className="mx-auto max-w-6xl px-5 sm:px-8 pb-8">
        <h2 id="funding-detail-title" className="sr-only">How OpenExam Hub is funded</h2>
        <p className={`text-[17px] leading-[1.7] ${muted} max-w-3xl`}>
          The expensive part of exam prep is usually the course, not the content. We skip the course. What’s left
          is hosting and AI calls for writing plans. Ads appear only on the study dashboard, never on the landing
          page, and all earnings from ads and donations are published so anyone can check them.
        </p>
        <dl className="mt-10 divide-y divide-[#E7E1D7] border-y border-[#E7E1D7] max-w-4xl">
          {promises.map(([t, d]) => (
            <div key={t} className="py-5 grid sm:grid-cols-[11rem_1fr] gap-1 sm:gap-6">
              <dt className={`${ink} font-display text-[22px] font-medium`}>{t}</dt>
              <dd className={`text-[17px] leading-[1.65] ${muted}`}>{d}</dd>
            </div>
          ))}
        </dl>
        <p className={`mt-8 text-[17px] leading-[1.7] ${muted} max-w-3xl`}>
          Want to help the ads disappear sooner? You can leave a tip on{' '}
          <a className="text-[#C2410C] underline underline-offset-4" href={DONATION_LINKS.kofi} target="_blank" rel="noopener noreferrer">Ko-fi</a>.
          It’s optional and unlocks nothing: everyone gets the same planner.
        </p>
        <a
          href={DONATION_LINKS.kofi}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 mb-16 inline-flex items-center gap-2 h-12 px-6 rounded-full border border-[#1A1714] text-[#1A1714] font-semibold hover:bg-[#1A1714] hover:text-white transition-colors"
        >
          Support on Ko-fi <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
        </a>
        <p className={`pb-24 text-[17px] leading-[1.7] ${muted}`}>
          The live totals are also on the Transparency tab inside the{' '}
          <a className="text-[#C2410C] underline underline-offset-4" href="/app">planner</a> (free account).
        </p>
      </section>
    </PageShell>
  );
}

export default function InfoPage({ kind }) {
  if (kind === 'faq') return <FaqPage />;
  if (kind === 'funding') return <FundingPage />;
  return <AboutPage />;
}
