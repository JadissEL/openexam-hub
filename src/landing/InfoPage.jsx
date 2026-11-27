import React from 'react';
import { ArrowRight, ArrowUpRight, Plus } from 'lucide-react';
import { SiteHeader, SiteFooter } from './SiteChrome.jsx';
import { BrowserFrame } from './frames.jsx';
import { GithubMark } from './icons.jsx';
import { ink, muted, eyebrow, h2, lead, pageFont } from './theme.js';
import { APP_PATH, CONTACT_EMAIL, REPO_URL } from './content.js';
import { DONATION_LINKS, donationCopy } from '../donations.js';
import { FundProjectButton } from '../FundProject.jsx';
import { BooksPanel, usePublicBooks } from '../BooksPanel.jsx';
import { useHref, useLocale, useT, useUnit } from '../i18n/LocaleContext.jsx';

const arrow = 'w-4 h-4 rtl:-scale-x-100';

function withTokens(template, tokens) {
  return String(template).split(/(\{[a-zA-Z0-9]+\})/g).map((part, i) => {
    const m = /^\{([a-zA-Z0-9]+)\}$/.exec(part);
    if (m && Object.prototype.hasOwnProperty.call(tokens, m[1])) {
      return <React.Fragment key={i}>{tokens[m[1]]}</React.Fragment>;
    }
    return part;
  });
}

// <title> and meta tags come from src/seo/site.js (prerendered, and synced in src/main.jsx).
function PageShell({ title, eyebrowText, intro, children }) {
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

function HonestNote({ page }) {
  return (
    <section aria-label={page.todayLabel} className="border-y border-[#E7E1D7]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-10 sm:py-12 grid md:grid-cols-[auto_1fr] gap-4 md:gap-12 items-baseline">
        <p className={eyebrow}>{page.todayEyebrow}</p>
        <p className={`font-display ${ink} text-[22px] sm:text-[26px] leading-[1.4] tracking-[-0.01em]`}>
          {page.today}
        </p>
      </div>
    </section>
  );
}

function Story({ page }) {
  return (
    <section id="story" className="scroll-mt-6" aria-labelledby="story-title">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24 grid lg:grid-cols-[1fr_1.6fr] gap-10 lg:gap-20">
        <div>
          <p className={eyebrow}>{page.whoEyebrow}</p>
          <h2 id="story-title" className={`mt-4 ${h2}`}>{page.whoTitle}</h2>
        </div>
        <div className={`space-y-6 text-[18px] sm:text-[20px] leading-[1.75] ${muted}`}>
          <p className={`${ink} first-letter:font-display first-letter:text-[64px] first-letter:leading-[0.8] first-letter:float-left first-letter:me-3 first-letter:mt-1.5 first-letter:text-[#C2410C]`}>
            {page.p1}
          </p>
          <p>{page.p2}</p>
          <p>{page.p3}</p>
          <div className="pt-4 flex items-center gap-4">
            <span aria-hidden="true" className="w-12 h-12 rounded-full bg-[#1A1714] text-white font-display text-lg flex items-center justify-center">J</span>
            <div className="leading-tight">
              <p className={`${ink} font-semibold text-[17px]`}>Jadiss El Antaki</p>
              <p className="text-[15px] text-[#6B635A]">
                {withTokens(page.role, {
                  write: <a className="underline underline-offset-4 hover:text-[#C2410C]" href={`mailto:${CONTACT_EMAIL}`}>{page.roleWrite}</a>
                })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductPeek({ page }) {
  const href = useHref();
  return (
    <section aria-labelledby="peek-title" className="bg-[#1A1714] text-white">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#FDBA8C]">{page.peekEyebrow}</p>
          <h2 id="peek-title" className="mt-4 font-display text-[34px] leading-[1.08] sm:text-5xl tracking-[-0.02em] font-medium">
            {page.peekTitle}
          </h2>
          <p className="mt-6 text-[18px] leading-[1.7] text-[#D9D2C8]">
            {page.peekBody}
          </p>
          <a href={href(APP_PATH)} className="mt-8 inline-flex items-center gap-2 text-[17px] font-semibold text-white underline decoration-[#EA580C] decoration-2 underline-offset-[6px]">
            {page.peekCta} <ArrowRight className={arrow} aria-hidden="true" />
          </a>
        </div>
        <BrowserFrame
          src="/landing/desk-library.webp"
          alt={page.peekAlt}
          width={1024}
          height={272}
          className="mt-12"
        />
      </div>
    </section>
  );
}

function OpenSource({ page }) {
  return (
    <section aria-labelledby="code-title">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-24 grid lg:grid-cols-[1fr_1.4fr] gap-10 lg:gap-20 items-start">
        <div>
          <p className={eyebrow}>{page.codeEyebrow}</p>
          <h2 id="code-title" className={`mt-4 ${h2}`}>{page.codeTitle}</h2>
        </div>
        <div>
          <p className={lead}>{page.codeBody}</p>
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

function MoreToRead({ page }) {
  const href = useHref();
  return (
    <section aria-labelledby="more-read-title" className="border-t border-[#E7E1D7]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-16 sm:py-20">
        <h2 id="more-read-title" className={`font-display ${ink} text-[28px] sm:text-[32px] tracking-[-0.02em] font-medium`}>
          {page.moreTitle}
        </h2>
        <p className={`mt-4 max-w-3xl text-[17px] leading-[1.7] ${muted}`}>
          {withTokens(page.moreBody, {
            faq: <a href={href('/faq')} className="text-[#C2410C] underline underline-offset-4">{page.moreFaq}</a>,
            blog: <a href={href('/blog')} className="text-[#C2410C] underline underline-offset-4">{page.moreBlog}</a>
          })}
        </p>
      </div>
    </section>
  );
}

export function AboutPage() {
  const page = useUnit('landing:about');
  return (
    <PageShell
      title={page.title}
      eyebrowText={page.eyebrow}
      intro={page.intro}
    >
      <HonestNote page={page} />
      <Story page={page} />
      <ProductPeek page={page} />
      <OpenSource page={page} />
      <MoreToRead page={page} />
    </PageShell>
  );
}

export function FaqPage() {
  const faq = useUnit('landing:faq');
  return (
    <PageShell
      title={faq.title}
      eyebrowText={faq.eyebrow}
      intro={
        <>
          {faq.intro}{' '}
          <a className="text-[#C2410C] underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>{faq.ask}</a>.
        </>
      }
    >
      <section aria-labelledby="faq-list-title" className="mx-auto max-w-6xl px-5 sm:px-8 pb-24">
        <h2 id="faq-list-title" className="sr-only">{faq.srTitle}</h2>
        <div className="border-t border-[#D9D1C5]">
          {(faq.items || []).map((f) => (
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

function FundingBooks() {
  const { treasury, usage, usageTotal, stats, loaded, error, asOf } = usePublicBooks();
  return (
    <div className="mt-14 mb-4">
      <BooksPanel variant="page" treasury={treasury} usage={usage} usageTotal={usageTotal} stats={stats} loaded={loaded} error={error} asOf={asOf} />
    </div>
  );
}

function FundingCta() {
  const locale = useLocale();
  const t = useT();
  const copy = donationCopy(locale);
  return (
    <>
      <p className={`mt-8 text-[17px] leading-[1.7] ${muted} max-w-3xl`}>
        {copy.fundingHelp}
      </p>
      <div className="mt-6 mb-16 flex flex-col sm:flex-row sm:items-center gap-3">
        <FundProjectButton lang={locale} />
        {DONATION_LINKS.kofi ? (
          <a
            href={DONATION_LINKS.kofi}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 min-h-[48px] px-6 rounded-full border border-[#1A1714] text-[#1A1714] font-semibold hover:bg-[#1A1714] hover:text-white transition-colors"
          >
            {copy.supportOn('Ko-fi')} <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
            <span className="sr-only"> {t('donate.newTab')}</span>
          </a>
        ) : null}
      </div>
    </>
  );
}

export function FundingPage() {
  const page = useUnit('landing:funding');
  const href = useHref();
  return (
    <PageShell
      title={page.title}
      eyebrowText={page.eyebrow}
      intro={page.intro}
    >
      <section aria-labelledby="funding-detail-title" className="mx-auto max-w-6xl px-5 sm:px-8 pb-8">
        <h2 id="funding-detail-title" className="sr-only">{page.h2}</h2>
        <p className={`text-[17px] leading-[1.7] ${muted} max-w-3xl`}>
          {page.body}
        </p>
        <dl className="mt-10 divide-y divide-[#E7E1D7] border-y border-[#E7E1D7] max-w-4xl">
          {page.promises.map(([title, detail]) => (
            <div key={title} className="py-5 grid sm:grid-cols-[11rem_1fr] gap-1 sm:gap-6">
              <dt className={`${ink} font-display text-[22px] font-medium`}>{title}</dt>
              <dd className={`text-[17px] leading-[1.65] ${muted}`}>{detail}</dd>
            </div>
          ))}
        </dl>
        <FundingBooks />
        <FundingCta />
        <p className={`text-[17px] leading-[1.7] ${muted} max-w-3xl`}>
          {withTokens(page.more, {
            faq: <a href={href('/faq')} className="text-[#C2410C] underline underline-offset-4">{page.moreFaq}</a>,
            blog: <a href={href('/blog')} className="text-[#C2410C] underline underline-offset-4">{page.moreBlog}</a>
          })}
        </p>
        <p className={`pt-8 pb-24 text-[17px] leading-[1.7] ${muted}`}>
          {withTokens(page.planner, {
            planner: <a className="text-[#C2410C] underline underline-offset-4" href={href('/app')}>{page.plannerLink}</a>
          })}
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
