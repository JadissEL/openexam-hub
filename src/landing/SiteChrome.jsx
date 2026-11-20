import React, { useState } from 'react';
import { Menu, X, ArrowRight } from 'lucide-react';
import { GithubMark } from './icons.jsx';
import { APP_PATH, CONTACT_EMAIL, REPO_URL } from './content.js';
import { DONATION_PLATFORMS } from '../donations.js';

export function Wordmark({ className = '' }) {
  return (
    <a href="/" className={`inline-flex items-center gap-2.5 font-semibold tracking-tight text-[#1A1714] ${className}`}>
      <img src="/favicon.svg" alt="" width="28" height="28" className="w-7 h-7 rounded-lg" />
      <span className="text-[17px]">OpenExam Hub</span>
    </a>
  );
}

const NAV = [
  { href: '/#story', label: 'Our story' },
  { href: '/#how', label: 'How it works' },
  { href: '/#sources', label: 'Sources' },
  { href: '/#free', label: 'Why it’s free' },
  { href: '/#faq', label: 'FAQ' }
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
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
          <button
            type="button"
            className="lg:hidden inline-flex items-center justify-center w-11 h-11 rounded-full text-[#1A1714] hover:bg-black/5"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="w-5 h-5" aria-hidden="true" /> : <Menu className="w-5 h-5" aria-hidden="true" />}
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-nav" aria-label="Primary" className="lg:hidden absolute inset-x-0 top-full bg-[#F7F5F0] border-y border-[#E7E1D7] shadow-[0_20px_40px_-24px_rgba(26,23,20,0.25)]">
          <ul className="mx-auto max-w-6xl px-5 py-3">
            {NAV.map((n) => (
              <li key={n.href}>
                <a href={n.href} onClick={() => setOpen(false)} className="block py-3 text-lg text-[#1A1714] border-b border-[#EDE7DD]">{n.label}</a>
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
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-[#E7E1D7] bg-[#F1EDE5]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-14 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-sm">
          <Wordmark />
          <p className="mt-4 text-[15px] leading-relaxed text-[#5C554C]">
            A free, independent study planner for language exams. Made by Jadiss El Antaki. Not affiliated with any exam body.
          </p>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8A8178]">Project</h2>
          <ul className="mt-4 space-y-2.5 text-[15px] text-[#3B352F]">
            <li><a className="hover:text-[#C2410C]" href={APP_PATH}>Study planner</a></li>
            <li><a className="hover:text-[#C2410C]" href={REPO_URL} target="_blank" rel="noopener noreferrer">Source code (GitHub)</a></li>
            <li><a className="hover:text-[#C2410C]" href={`${REPO_URL}/issues`} target="_blank" rel="noopener noreferrer">Report a problem</a></li>
            {DONATION_PLATFORMS.map((d) => (
              <li key={d.key}><a className="hover:text-[#C2410C]" href={d.url} target="_blank" rel="noopener noreferrer">Support on {d.name}</a></li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8A8178]">Contact &amp; legal</h2>
          <ul className="mt-4 space-y-2.5 text-[15px] text-[#3B352F]">
            <li><a className="hover:text-[#C2410C] break-all" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></li>
            <li><a className="hover:text-[#C2410C]" href="/privacy">Privacy</a></li>
            <li><a className="hover:text-[#C2410C]" href="/terms">Terms</a></li>
          </ul>
        </div>
      </div>
      <div className="mx-auto max-w-6xl px-5 sm:px-8 pb-10 text-[13px] text-[#8A8178]">
        © {new Date().getFullYear()} OpenExam Hub. Exam names belong to their owners and are used only to describe what a plan prepares you for.
      </div>
    </footer>
  );
}
