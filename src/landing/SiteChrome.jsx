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

export function Wordmark({ className = '' }) {
  return (
    <a href="/" className={`inline-flex items-center gap-2.5 font-semibold tracking-tight text-[#1A1714] ${className}`}>
      <img src="/favicon.svg" alt="" width="28" height="28" className="w-7 h-7 rounded-lg" />
      <span className="text-[17px]">OpenExam Hub</span>
    </a>
  );
}

const NAV = [
  { href: '/#how', label: 'How it works' },
  { href: '/exams', label: 'Exams' },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' },
  { href: '/faq', label: 'FAQ' }
];

export function SiteHeader() {
  return (
    <header className="relative z-20">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-[#1A1714] focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>
      <div className="mx-auto max-w-6xl px-5 sm:px-8 h-16 sm:h-20 flex items-center justify-between gap-4">
        <Wordmark />
        <nav aria-label="Primary" className="hidden lg:flex items-center gap-7 text-[15px] text-[#4A443D]">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="hover:text-[#1A1714] transition-colors">{n.label}</a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="hidden sm:inline-flex items-center gap-2 h-10 px-3 rounded-full text-[15px] text-[#4A443D] hover:text-[#1A1714] transition-colors">
            <GithubMark /> Code
          </a>
          <a href={APP_PATH} className="hidden sm:inline-flex items-center gap-1.5 h-10 px-5 rounded-full bg-[#1A1714] text-white text-[15px] font-medium hover:bg-black transition-colors">
            Open the planner
          </a>
          <details className="lg:hidden group">
            <summary className="list-none inline-flex items-center justify-center w-11 h-11 rounded-full text-[#1A1714] hover:bg-black/5 cursor-pointer [&::-webkit-details-marker]:hidden">
              <span className="sr-only">Menu</span>
              <Menu className="w-5 h-5 group-open:hidden" aria-hidden="true" />
              <X className="w-5 h-5 hidden group-open:inline" aria-hidden="true" />
            </summary>
            <nav id="mobile-nav" aria-label="Primary" className="absolute inset-x-0 top-full bg-[#F7F5F0] border-y border-[#E7E1D7] shadow-[0_20px_40px_-24px_rgba(26,23,20,0.25)]">
              <ul className="mx-auto max-w-6xl px-5 py-3">
                {NAV.map((n) => (
                  <li key={n.href}>
                    <a href={n.href} className="block py-3 text-lg text-[#1A1714] border-b border-[#EDE7DD]">{n.label}</a>
                  </li>
                ))}
                <li>
                  <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 py-3 text-lg text-[#1A1714] border-b border-[#EDE7DD]">
                    <GithubMark /> Source code on GitHub
                  </a>
                </li>
                <li className="py-4">
                  <a href={APP_PATH} className="flex items-center justify-center gap-2 h-12 rounded-full bg-[#EA580C] text-white font-semibold">
                    Build my free plan <ArrowRight className="w-4 h-4" aria-hidden="true" />
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

const FOOTER_COLS = [
  {
    title: 'Exam guides',
    links: EXAM_PAGES.map((p) => ({ href: `/exams/${p.slug}`, label: p.label }))
  },
  {
    title: 'Product',
    links: [
      { href: '/exams', label: 'All exams' },
      { href: LIBRARY_PATH, label: 'Library' },
      { href: APP_PATH, label: 'Dashboard' }
    ]
  },
  {
    title: 'Project',
    links: [
      { href: '/about', label: 'About' },
      { href: '/blog', label: 'Blog' },
      { href: TRANSPARENCY_PATH, label: 'Transparency' },
      { href: '/funding', label: 'Funding & donate' },
      { href: REPO_URL, label: 'Open source on GitHub', external: true },
      { href: `${REPO_URL}/issues`, label: 'Report a problem', external: true },
      ...DONATION_PLATFORMS.map((d) => ({ href: d.url, labelKey: d.primary ? 'fund' : 'support', name: d.name, external: true }))
    ]
  },
  {
    title: 'Help',
    links: [
      { href: '/faq', label: 'FAQ' },
      { href: `mailto:${CONTACT_EMAIL}`, label: CONTACT_EMAIL },
      { href: `mailto:${SUPPORT_EMAIL}`, label: SUPPORT_EMAIL }
    ]
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
      { action: 'consent', label: 'Cookie settings' },
      { href: `mailto:${LEGAL_EMAIL}`, label: LEGAL_EMAIL }
    ]
  }
];

export function SiteFooter() {
  return (
    <footer className="border-t border-[#E7E1D7] bg-[#F1EDE5]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.3fr_repeat(5,1fr)]">
        <div className="max-w-sm sm:col-span-2 lg:col-span-1">
          <Wordmark />
          <p className="mt-4 text-[15px] leading-relaxed text-[#5C554C]">
            A free, independent study planner for language exams. Made by Jadiss El Antaki. Not affiliated with any exam body.
          </p>
          <p className="mt-3 text-[15px] leading-relaxed text-[#5C554C]">
            Free. Create a free account to generate your plan.
          </p>
          <div className="mt-5">
            <FundProjectButton showSubline={false} />
            <p className="mt-2 text-[13px] leading-relaxed text-[#5C554C]">{donationCopy().fundSubline}</p>
          </div>
        </div>
        {FOOTER_COLS.map((col) => (
          <div key={col.title}>
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6B635A]">{col.title}</h2>
            <ul className="mt-4 space-y-2.5 text-[15px] text-[#3B352F]">
              {col.links.map((l) => {
                const copy = donationCopy();
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
                    href={l.href}
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
      <div className="mx-auto max-w-6xl px-5 sm:px-8 pb-10 text-[13px] text-[#6B635A]">
        © {new Date().getFullYear()} OpenExam Hub. Exam names belong to their owners and are used only to describe what a plan prepares you for.
      </div>
    </footer>
  );
}
