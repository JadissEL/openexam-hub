import React, { useEffect } from 'react';
import { SiteHeader, SiteFooter } from './SiteChrome.jsx';
import { APP_PATH, CONTACT_EMAIL, REPO_URL } from './content.js';

const UPDATED = '20 November 2026';
const mail = <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;

// Plain-language legal pages. Keep them matching what the code actually does.
const PAGES = {
  privacy: {
    title: 'Privacy notice',
    intro:
      'OpenExam Hub is a small, independent project run by Jadiss El Antaki. This page explains, in plain words, what data the site handles and why.',
    sections: [
      {
        h: 'Who is responsible',
        body: (
          <p>
            Jadiss El Antaki runs OpenExam Hub and is responsible for your data. You can reach me at {mail}.
          </p>
        )
      },
      {
        h: 'What we store',
        body: (
          <ul>
            <li>
              <strong>Guest use.</strong> When you open the planner, Firebase Authentication creates an anonymous account
              with a random ID. It contains no name or email.
            </li>
            <li>
              <strong>Optional sign-in.</strong> If you sign in with email or Google, Firebase stores your email address
              (and, for Google, the basic profile Google shares, such as your name).
            </li>
            <li>
              <strong>Your plans.</strong> The plans you build and the tasks you tick are saved in Google Cloud Firestore
              (EU multi-region) under your account ID. Security rules allow only your account to read or change them.
            </li>
            <li>
              <strong>Shared plan cache.</strong> To save cost, a plan generated for an exam, level and length (for example
              “TCF, B2, 30 days”) can be reused for other learners who pick the same options. It contains no personal data.
            </li>
          </ul>
        )
      },
      {
        h: 'What we don’t do',
        body: (
          <ul>
            <li>No analytics tools. There are no ads yet; before dashboard ads go live, this notice will be updated to name the ad provider and what it collects, and ads will never appear on the landing page.</li>
            <li>We don’t sell, rent or share your personal data for marketing.</li>
            <li>We don’t ask for your real name, phone number or payment details.</li>
          </ul>
        )
      },
      {
        h: 'Services we rely on',
        body: (
          <ul>
            <li><strong>Vercel</strong> hosts the website and the server (Frankfurt region). Like any web host, it keeps short-lived technical logs such as IP addresses.</li>
            <li><strong>Google Firebase</strong> provides sign-in and the database.</li>
            <li><strong>Google Fonts</strong> serves the typefaces, so your browser contacts Google’s font servers.</li>
            <li>
              <strong>AI model providers</strong>, reached through our own gateway, may help write plan tasks, practice items and coaching
              advice. Those requests contain your exam, level, timeline and progress, never your name or email.
            </li>
            <li>When you open a resource, you go to that organisation’s own website, which has its own privacy policy.</li>
          </ul>
        )
      },
      {
        h: 'How long we keep it, and your rights',
        body: (
          <p>
            We keep your account and plans until you ask us to delete them. You can ask to see, correct or delete your data at any time
            by emailing {mail}; I’ll reply within 30 days. If you’re in the EU, you also have the right to complain to your data
            protection authority.
          </p>
        )
      },
      {
        h: 'Changes',
        body: <p>If this notice changes, the new version will be posted here with a new date. The full history is public on <a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a>.</p>
      }
    ]
  },
  terms: {
    title: 'Terms of use',
    intro: 'Short version: OpenExam Hub is free, comes with no guarantees, and links to other people’s websites. Please use it kindly.',
    sections: [
      {
        h: 'The service',
        body: (
          <p>
            OpenExam Hub builds study plans that point to free resources published by official exam bodies and public broadcasters.
            It is free to use. There is no paid tier.
          </p>
        )
      },
      {
        h: 'No guarantees',
        body: (
          <p>
            Plans are a study aid, not exam advice. We can’t promise any result, and the service is provided “as is”, without
            warranties. Always check exam dates, formats and rules with the official exam body.
          </p>
        )
      },
      {
        h: 'Other websites',
        body: (
          <p>
            We link to websites we don’t control. Their content belongs to them, and their own terms apply. OpenExam Hub is not
            affiliated with, endorsed by or sponsored by any exam body, publisher or broadcaster mentioned on the site.
          </p>
        )
      },
      {
        h: 'Fair use',
        body: (
          <p>
            Please don’t abuse the service: no attempts to break it, overload it or scrape it at scale, and no use of it to
            break the law. We may limit or block access that harms the service for others.
          </p>
        )
      },
      {
        h: 'Source code',
        body: (
          <p>
            The source code is public on <a href={REPO_URL} target="_blank" rel="noopener noreferrer">GitHub</a> under the{' '}
            <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noopener noreferrer">MIT licence</a>. The licence covers
            our code, not the third-party resources we link to.
          </p>
        )
      },
      {
        h: 'Changes and contact',
        body: <p>We may update these terms; the date below will change when we do. Questions: {mail}.</p>
      }
    ]
  }
};

export default function LegalPage({ kind }) {
  const page = PAGES[kind] || PAGES.privacy;
  useEffect(() => {
    document.title = `${page.title} · OpenExam Hub`;
  }, [page.title]);
  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1A1714] antialiased" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-5 sm:px-8 pt-10 sm:pt-16 pb-24">
        <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#C2410C]">Last updated {UPDATED}</p>
        <h1 className="mt-4 font-display text-5xl sm:text-6xl tracking-[-0.03em] font-medium leading-[1.02]">{page.title}</h1>
        <p className="mt-6 text-xl leading-[1.65] text-[#5C554C]">{page.intro}</p>
        <div className="mt-12 space-y-12 text-[17px] leading-[1.75] text-[#3B352F] [&_a]:text-[#C2410C] [&_a]:underline [&_a]:underline-offset-4 [&_ul]:space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_strong]:text-[#1A1714]">
          {page.sections.map((s) => (
            <section key={s.h}>
              <h2 className="font-display text-[28px] font-medium text-[#1A1714] mb-3">{s.h}</h2>
              {s.body}
            </section>
          ))}
        </div>
        <p className="mt-16">
          <a href={APP_PATH} className="inline-flex items-center h-12 px-6 rounded-full bg-[#1A1714] text-white font-semibold">Back to the planner</a>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
