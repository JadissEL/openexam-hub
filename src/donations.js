// Donation pages, shared by the app and the landing page.
// A platform with an empty link is hidden everywhere; paste its URL here to enable it.
export const DONATION_LINKS = {
  kofi: 'https://ko-fi.com/openexamhub',
  githubSponsors: '', // not live yet, e.g. 'https://github.com/sponsors/JadissEL'
  openCollective: '' // not live yet, e.g. 'https://opencollective.com/<collective>'
};

export const DONATION_PLATFORMS = [
  { key: 'kofi', name: 'Ko-fi' },
  { key: 'githubSponsors', name: 'GitHub Sponsors' },
  { key: 'openCollective', name: 'Open Collective' }
].map((p) => ({ ...p, url: DONATION_LINKS[p.key] })).filter((p) => !!p.url);
