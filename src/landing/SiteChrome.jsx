import React from 'react';
import { Menu, X, ArrowRight } from 'lucide-react';
import { GithubMark } from './icons.jsx';
import {
  APP_PATH,
  CONTACT_EMAIL,
  LEGAL_EMAIL,
  LIBRARY_PATH,
  REPO_URL,
  SUPPORT_EMAIL,
  TRANSPARENCY_PATH
} from './content.js';
import { DONATION_PLATFORMS, donationCopy } from '../donations.js';
import { FundProjectButton } from '../FundProject.jsx';
import { EXAM_PAGES } from '../seo/site.js';
import { useHref, useLocale, usePathname, useT } from '../i18n/LocaleContext.jsx';
import { publishedLocales } from '../i18n/publish.js';
import { localizePath } from '../i18n/paths.js';
import { localeMeta } from '../i18n/locales.js';

const arrow = 'w-4 h-4 rtl:-scale-x-100';

export function Wordmark({ className = '' }) {
  const href = useHref();
  return (
    <a href={href('/')} className={`inline-flex items-center gap-2.5 font-semibold tracking-tight text-[#1A1714] ${className}`}>
      <img src="/brand/mark.svg" alt="" width="30" height="30" className="w-[30px] h-[30px]" />
      <span className="text-[17px]">OpenExam <span className="text-[#BC3D0B]">Hub</span></span>
    </a>
  );
}

function LanguageSwitcher({ className = '' }) {
  const t = useT();
  const locale = useLocale();
  const path = usePathname();
  const codes = publishedLocales(path);
  if (codes.length < 2) return null;
  return (
    <nav aria-label={t('lang.switch')} className={className}>
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {codes.map((code) => {
          const meta = localeMeta(code);
          const active = code === locale;
          return (
            <li key={code}>
              <a
                href={localizePath(code, path)}
                hrefLang={meta.htmlLang}
                lang={meta.htmlLang}
                aria-current={active ? 'true' : undefined}
                className={active ? 'font-semibold text-[#1A1714]' : 'hover:text-[#1A1714]'}
              >
                {meta.nativeName}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SiteHeader() {
  const t = useT();
  const href = useHref();
  const nav = [
    { href: '/#how', label: t('nav.how') },
    { href: '/exams', label: t('nav.exams') },
    { href: '/blog', label: t('nav.blog') },
    { href: '/about', label: t('nav.about') },
    { href: '/faq', label: t('nav.faq') }
  ];
  return (
    <header className="relative z-20">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-[#1A1714] focus:px-4 focus:py-2 focus:text-white">
        {t('nav.skip')}
      </a>
      <div className="mx-auto max-w-6xl px-5 sm:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
        <Wordmark />
        <nav aria-label={t('nav.primary')} className="hidden lg:flex items-center gap-7 text-[15px] text-[#4A443D]">
          {nav.map((n) => (
            <a key={n.href} href={href(n.href)} className="hover:text-[#1A1714] transition-colors">{n.label}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSwitcher className="hidden md:block text-[14px] text-[#4A443D]" />
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="hidden sm:inline-flex items-center gap-2 h-10 px-3 rounded-full text-[15px] text-[#4A443D] hover:text-[#1A1714] transition-colors">
            <GithubMark /> {t('nav.code')}
          </a>
          <a href={href(APP_PATH)} className="hidden sm:inline-flex items-center gap-1.5 h-10 px-5 rounded-full bg-[#1A1714] text-white text-[15px] font-medium hover:bg-black transition-colors">
            {t('nav.openPlanner')}
          </a>
          <details className="lg:hidden group">
            <summary className="list-none inline-flex items-center justify-center w-11 h-11 rounded-full text-[#1A1714] hover:bg-black/5 cursor-pointer [&::-webkit-details-marker]:hidden">
              <span className="sr-only">{t('nav.menu')}</span>
              <Menu className="w-5 h-5 group-open:hidden" aria-hidden="true" />
              <X className="w-5 h-5 hidden group-open:inline" aria-hidden="true" />
            </summary>
            <nav id="mobile-nav" aria-label={t('nav.primary')} className="absolute inset-x-0 top-full bg-[#F7F5F0] border-y border-[#E7E1D7] shadow-[0_20px_40px_-24px_rgba(26,23,20,0.25)]">
              <ul className="mx-auto max-w-6xl px-5 py-3">
                {nav.map((n) => (
                  <li key={n.href}>
                    <a href={href(n.href)} className="block py-3 text-lg text-[#1A1714] border-b border-[#EDE7DD]">{n.label}</a>
                  </li>
                ))}
                <li>
                  <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 py-3 text-lg text-[#1A1714] border-b border-[#EDE7DD]">
                    <GithubMark /> {t('nav.source')}
                  </a>
                </li>
                <li className="py-3 border-b border-[#EDE7DD]">
                  <LanguageSwitcher className="text-[16px] text-[#1A1714]" />
                </li>
                <li className="py-4">
                  <a href={href(APP_PATH)} className="flex items-center justify-center gap-2 h-12 rounded-full bg-[#EA580C] text-white font-semibold">
                    {t('nav.build')} <ArrowRight className={arrow} aria-hidden="true" />
                  </a>
                </li>
              </ul>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const t = useT();
  const href = useHref();
  const locale = useLocale();
  const copy = donationCopy(locale);
  const cols = [
    {
      title: t('footer.guides'),
      links: EXAM_PAGES.map((p) => ({ href: `/exams/${p.slug}`, label: p.label }))
    },
    {
      title: t('footer.product'),
      links: [
        { href: '/exams', label: t('footer.allExams') },
        { href: '/tools/clb-converter', label: t('footer.clb') },
        { href: '/tools/crs-language-points', label: t('footer.crs') },
        { href: '/tools/cefr-converter', label: t('footer.cefr') },
        { href: '/compare', label: t('footer.compare') },
        { href: LIBRARY_PATH, label: t('footer.library') },
        { href: APP_PATH, label: t('footer.dashboard') }
      ]
    },
    {
      title: t('footer.project'),
      links: [
        { href: '/about', label: t('footer.about') },
        { href: '/blog', label: t('footer.blog') },
        { href: TRANSPARENCY_PATH, label: t('footer.transparency') },
        { href: '/funding', label: t('footer.funding') },
        { href: REPO_URL, label: t('footer.github'), external: true },
        { href: `${REPO_URL}/issues`, label: t('footer.report'), external: true },
        ...DONATION_PLATFORMS.map((d) => ({ href: d.url, labelKey: d.primary ? 'fund' : 'support', name: d.name, external: true }))
      ]
    },
    {
      title: t('footer.help'),
      links: [
        { href: '/faq', label: t('footer.faq') },
        { href: `mailto:${CONTACT_EMAIL}`, label: CONTACT_EMAIL },
        { href: `mailto:${SUPPORT_EMAIL}`, label: SUPPORT_EMAIL }
      ]
    },
    {
      title: t('footer.legal'),
      links: [
        { href: '/privacy', label: t('footer.privacy') },
        { href: '/terms', label: t('footer.terms') },
        { action: 'consent', label: t('footer.cookies') },
        { href: `mailto:${LEGAL_EMAIL}`, label: LEGAL_EMAIL }
      ]
    }
  ];
  return (
    <footer className="border-t border-[#E7E1D7] bg-[#F1EDE5]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_repeat(5,1fr)]">
        <div className="max-w-sm sm:col-span-2 lg:col-span-1">
          <Wordmark />
          <p className="mt-4 text-[15px] leading-relaxed text-[#5C554C]">
            {t('footer.blurb')}
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-[#5C554C]">
            {t('footer.free')}
          </p>
          <div className="mt-5">
            <FundProjectButton lang={locale} showSubline={false} />
            <p className="mt-2 text-[13px] leading-relaxed text-[#5C554C]">{copy.fundSubline}</p>
          </div>
        </div>
        {cols.map((col) => (
          <div key={col.title}>
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6B635A]">{col.title}</h2>
            <ul className="mt-4 space-y-2.5 text-[15px] text-[#3B352F]">
              {col.links.map((l) => {
                const label = l.labelKey === 'fund' ? copy.fundLabel : l.labelKey === 'support' ? copy.supportOn(l.name) : l.label;
                return (
                <li key={(l.href || l.action) + label}>
                  {l.action === 'consent' ? (
                    // Reopens the cookie banner (handled by public/oeh-consent.js).
                    <button type="button" data-oe-consent-open className="hover:text-[#C2410C] text-left">
                      {l.label}
                    </button>
                  ) : (
                  <a
                    className="hover:text-[#C2410C] break-all"
                    href={l.external ? l.href : href(l.href)}
                    {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  >
                    {label}
                  </a>
                  )}
                </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto max-w-6xl px-5 sm:px-8 pb-10 text-[13px] text-[#6B635A] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p>{t('footer.legalLine', { year: new Date().getFullYear() })}</p>
        <LanguageSwitcher className="text-[13px] text-[#6B635A]" />
      </div>
    </footer>
  );
}
