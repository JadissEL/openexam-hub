// Donation pages, shared by the app and the landing page.
// A platform with an empty link is hidden everywhere; paste its URL here to enable it.
// Live checks (20 Nov 2026):
//  - paypal.com/paypalme/JadissEL is live (HTTP 200).
//  - ko-fi.com/openexamhub is the existing tip page.
//  - github.com/sponsors/JadissEL redirects to the profile — not a Sponsors page.
//  - opencollective.com/openexam-hub exists but is pending approval (Open Source Europe).
export const DONATION_LINKS = {
  paypal: 'https://www.paypal.com/paypalme/JadissEL',
  kofi: 'https://ko-fi.com/openexamhub',
  githubSponsors: '', // not live yet, e.g. 'https://github.com/sponsors/JadissEL'
  openCollective: '' // not live yet, e.g. 'https://opencollective.com/openexam-hub'
};

// EN/FR strings, same split as the cookie banner in public/oeh-consent.js.
export const DONATION_COPY = {
  en: {
    fundLabel: 'Fund this project',
    fundSubline: 'Keep OpenExam Hub free for every learner',
    supportOn: (name) => `Support on ${name}`,
    fundingHelp:
      'Want to help the ads disappear sooner? You can fund this project on PayPal, or leave a tip on Ko-fi. It’s optional and unlocks nothing: everyone gets the same planner.'
  },
  fr: {
    fundLabel: 'Financer ce projet',
    fundSubline: 'Pour que OpenExam Hub reste gratuit pour tous les candidats',
    supportOn: (name) => `Soutenir sur ${name}`,
    fundingHelp:
      'Envie que les publicités disparaissent plus tôt ? Vous pouvez financer ce projet sur PayPal, ou laisser un pourboire sur Ko-fi. C’est facultatif et ça ne débloque rien : tout le monde a le même planner.'
  }
};

export function donationLang() {
  if (typeof document === 'undefined') return 'en';
  const el = document.querySelector('#root [lang]');
  const l = (el && el.getAttribute('lang')) || document.documentElement.getAttribute('lang') || '';
  if (/^fr/i.test(l)) return 'fr';
  return 'en';
}

export function donationCopy(lang) {
  const key = lang || donationLang();
  return DONATION_COPY[key] || DONATION_COPY.en;
}

export const DONATION_PLATFORMS = [
  { key: 'paypal', name: 'PayPal', primary: true },
  { key: 'kofi', name: 'Ko-fi' },
  { key: 'githubSponsors', name: 'GitHub Sponsors' },
  { key: 'openCollective', name: 'Open Collective' }
].map((p) => ({ ...p, url: DONATION_LINKS[p.key] })).filter((p) => !!p.url);
