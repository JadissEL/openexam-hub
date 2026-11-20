import React from 'react';
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
        h: 'In short',
        body: (
          <ul>
            <li>
              <strong>A free account to generate a plan.</strong> Creating a plan uses AI, so you need a free account
              (email or Google). You can still look at a sample TEF Canada plan before you sign up.
            </li>
            <li>
              <strong>Your plans are yours.</strong> Plans and ticks are stored in Google Firebase (EU region), under
              your account only. Other people can’t read them.
            </li>
            <li>
              <strong>Your account keeps your plans.</strong> Signing in with email or Google lets you generate plans
              and use them on more than one device.
            </li>
            <li>
              <strong>Analytics only if you say yes.</strong> With your consent we use Google Analytics to see which pages
              and features help learners. If you click “Reject”, or don’t choose, it never loads. AI requests contain your
              exam, level, timeline and progress, never your name or email.
            </li>
          </ul>
        )
      },
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
              <strong>Accounts.</strong> To generate a plan you create a free account with email or Google. Firebase
              stores your email address (and, for Google, the basic profile Google shares, such as your name). You can
              look at a sample TEF Canada plan before you sign up.
            </li>
            <li>
              <strong>Your plans.</strong> The plans you build and the tasks you tick are saved in Google Cloud Firestore
              (EU multi-region) under your account ID. Security rules allow only your account to read or change them.
            </li>
            <li>
              <strong>Shared plan cache.</strong> To save cost, a plan generated for an exam, level and length (for example
              “TCF, B2, 30 days”) can be reused for other learners who pick the same options. It contains no personal data.
            </li>
            <li>
              <strong>AI usage totals.</strong> The server keeps monthly totals of how many AI calls were made and how many
              tokens they used, with no account or personal data attached. Those totals are published on the funding page.
            </li>
          </ul>
        )
      },
      {
        h: 'What we don’t do',
        body: (
          <ul>
            <li>No analytics without your consent, and no ads on the home page or on any information page.</li>
            <li>We don’t send your name, email or plan contents to Google Analytics.</li>
            <li>We don’t sell, rent or share your personal data for marketing.</li>
            <li>We don’t ask for your real name, phone number or payment details.</li>
          </ul>
        )
      },
      {
        h: 'Cookies and Google Analytics',
        body: (
          <>
            <p>
              When you first visit, a small banner asks whether we may use cookies for analytics and ads. “Accept” and
              “Reject” are equally easy, and nothing is loaded until you choose. Your choice is saved in your browser’s
              local storage (<code>oeh_consent_v1</code>) so we don’t ask again. You can change it at any time with the{' '}
              <button type="button" data-oe-consent-open className="underline">Cookie settings</button> link at the bottom
              of every page (and in your account panel on the dashboard).
            </p>
            <ul className="mt-4">
              <li>
                <strong>If you accept:</strong> we load Google Analytics 4 (provided by Google Ireland Ltd). It sets first-party
                cookies named <code>_ga</code> and <code>_ga_&lt;ID&gt;</code> (kept up to 2 years) to tell visits apart, and records
                the pages you view, your approximate location (country/city, derived from your IP address, which Google does not
                store), device and browser type, the site that sent you, and a few actions: creating an account or signing in,
                choosing an exam, generating a plan (exam, level and number of days), and clicking a donation link, a blog
                call-to-action or an official exam resource. Google Analytics keeps this event data for 14 months.
              </li>
              <li>
                <strong>If you reject (or don’t choose):</strong> Google Analytics is not loaded and no analytics cookies are set.
                Google Consent Mode stays “denied” for analytics and ads.
              </li>
              <li>
                <strong>If you change your mind:</strong> choosing “Reject” later stops Google Analytics and deletes its cookies on
                this site. See <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">how Google uses data from sites that use its services</a>.
              </li>
            </ul>
          </>
        )
      },
      {
        h: 'Ads',
        body: (
          <>
            <p>
              Ads are not live yet (Google AdSense is under review). To keep the site free, we plan to show a small number of
              Google AdSense ads, and they will only ever appear inside the study dashboard
              (<code>/app</code>) for signed-in users. There are never ads on the home page, the information pages or these legal
              pages. Adult, gambling, dating and other sensitive ad categories are blocked. All ad income is published on the
              transparency page, and ads come off once five years of running costs (€200,000) are covered.
            </p>
            <ul className="mt-4">
              <li>
                <strong>Your choice first.</strong> No ad is requested until you have answered the cookie banner. If you reject
                cookies, Google Consent Mode stays “denied” and only non-personalised ads are requested. If Google’s own consent
                message (a Google-certified consent tool) appears on the dashboard, it asks the same question for ads.
              </li>
              <li>
                <strong>What Google may collect.</strong> If ads load, Google receives technical data such as your IP address, browser
                and device details and the page you are on, and, only if you agree, uses cookies to personalise or measure ads. See{' '}
                <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">how Google uses data from sites that use its services</a>.
              </li>
              <li>
                <strong>Changing your mind.</strong> You can change or withdraw your choice at any time from “Cookie settings”, or
                by clearing this site’s cookies and storage. You can also turn off personalised
                ads at <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">Google’s ad settings</a>.
              </li>
              <li>
                <strong>Our own storage.</strong> The site itself uses your browser’s local storage and Firebase’s sign-in storage only to
                keep you signed in, remember your plans and settings, and remember your cookie choice. These are strictly necessary and
                are not used for ads or analytics.
              </li>
            </ul>
          </>
        )
      },
      {
        h: 'Services we rely on',
        body: (
          <ul>
            <li><strong>Cloudflare</strong> serves the website and <strong>Vercel</strong> runs the server (Frankfurt region). Like any web host, they keep short-lived technical logs such as IP addresses.</li>
            <li><strong>Google Firebase</strong> provides sign-in and the database.</li>
            <li><strong>Google Analytics</strong> (only if you accept cookies) measures visits and the actions listed above.</li>
            <li><strong>Google AdSense</strong> (only on the signed-in dashboard, once ads are switched on) shows ads and runs the consent message described above.</li>
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
            We keep your account and plans until you delete them. In the dashboard you can delete a single plan from <strong>My
            plans</strong>, or delete your whole account from <strong>Your account → Delete my account</strong> (you type DELETE to
            confirm). Deleting your account immediately and permanently removes your sign-in and everything stored under it: your
            profile, saved plans and progress, review cards and level checks. You can also ask to see, correct or delete your data
            at any time by emailing {mail}; I’ll reply within 30 days. If you’re in the EU, you also have the right to complain to
            your data protection authority.
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
            It is free to use and there is no paid tier. Generating a plan requires a free account, so the AI budget
            cannot be reused for repeat requests. You can look at a sample TEF Canada plan before you sign up.
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
  // <title> and meta tags come from src/seo/site.js (prerendered, and synced in src/main.jsx).
  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1A1714] antialiased" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-3xl px-5 sm:px-8 pt-10 sm:pt-16 pb-24">
        <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#9A3412]">Last updated {UPDATED}</p>
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
