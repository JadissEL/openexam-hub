/*
 * OpenExam Hub: cookie consent + Google Analytics 4 (Consent Mode v2) + Microsoft Clarity.
 *
 * Plain script, loaded with `defer` on every page (including the static blog and exam guides),
 * before the app bundle. What it does:
 *  - sets Consent Mode v2 defaults to DENIED (ad_storage, analytics_storage, ad_user_data,
 *    ad_personalization) with wait_for_update, before any Google tag can load;
 *  - shows a small EN/FR banner with equally weighted Accept / Reject buttons and stores the choice
 *    in localStorage ("oeh_consent_v1");
 *  - loads gtag.js only after Accept, only on the production hostname, and only when the build
 *    set a Measurement ID (meta[name="oeh-ga-id"], filled from VITE_GA_ID at build time);
 *  - loads Microsoft Clarity the same way (meta[name="oeh-clarity-id"], from VITE_CLARITY_PROJECT_ID),
 *    only after Accept. Reject never inserts the tag. Revoking calls Clarity's consent API and
 *    stops it. Inputs stay masked (Clarity's default); this script never unmasks anything;
 *  - sends page_view on first load and on SPA route changes (history.pushState / popstate);
 *  - exposes window.oeh = { track, consent, open, require } for the app and the AdSense loader.
 * Any element with [data-oe-consent-open] reopens the banner ("Cookie settings").
 */
(function () {
  'use strict';
  var w = window;
  var d = document;
  if (w.oeh && w.oeh.__v) return;

  var KEY = 'oeh_consent_v1';
  var PROD_HOSTS = ['openexamhub.org'];
  var meta = d.querySelector('meta[name="oeh-ga-id"]');
  var GA_ID = meta ? String(meta.getAttribute('content') || '').trim() : '';
  var gaOn = /^G-[A-Z0-9]{4,20}$/.test(GA_ID) && PROD_HOSTS.indexOf(location.hostname) !== -1;
  var clarityMeta = d.querySelector('meta[name="oeh-clarity-id"]');
  var CLARITY_ID = clarityMeta ? String(clarityMeta.getAttribute('content') || '').trim() : '';
  var clarityOn = /^[a-z0-9]{6,32}$/.test(CLARITY_ID) && PROD_HOSTS.indexOf(location.hostname) !== -1;

  // Keep in sync with lib/allowlist.js (BASE_DOMAIN_ALLOWLIST).
  var OFFICIAL = [
    'france-education-international.fr', 'tv5monde.com', 'rfi.fr', 'britishcouncil.org', 'ielts.org',
    'cambridgeenglish.org', 'goethe.de', 'dw.com', 'vhs-lernportal.de', 'europa.eu', 'lefrancaisdesaffaires.fr',
    'canada.ca', 'ets.org', 'cervantes.es', 'cervantes.org', 'testdaf.de', 'telc.net', 'ambafrance-ca.org', 'celpip.ca', 'paragontesting.ca', 'youtube.com', 'youtu.be'
  ];

  w.dataLayer = w.dataLayer || [];
  w.gtag = w.gtag || function gtag() {
    // eslint-disable-next-line prefer-rest-params
    w.dataLayer.push(arguments);
  };
  var gtag = w.gtag;
  if (!w.__oeConsentDefaults) {
    gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      functionality_storage: 'denied',
      personalization_storage: 'denied',
      security_storage: 'granted',
      wait_for_update: 500
    });
    w.__oeConsentDefaults = true;
  }
  gtag('set', 'ads_data_redaction', true);

  function readChoice() {
    try {
      var v = JSON.parse(w.localStorage.getItem(KEY) || 'null');
      if (v && (v.choice === 'granted' || v.choice === 'denied')) return v;
    } catch (e) { /* storage blocked */ }
    return null;
  }
  function signals(c) {
    return { ad_storage: c, analytics_storage: c, ad_user_data: c, ad_personalization: c };
  }

  var state = readChoice();
  if (state) gtag('consent', 'update', signals(state.choice));

  // ---- Google Analytics -------------------------------------------------------------------
  var loaded = false;
  var lastUrl = null;
  function granted() {
    return !!state && state.choice === 'granted';
  }
  function pageView() {
    if (!loaded || !granted()) return;
    var u = location.pathname + location.search;
    if (u === lastUrl) return;
    lastUrl = u;
    gtag('event', 'page_view', { page_location: location.href, page_title: d.title });
  }
  function loadGa() {
    if (!gaOn || loaded || !granted()) return;
    loaded = true;
    gtag('js', new Date());
    gtag('config', GA_ID, { send_page_view: false });
    var s = d.createElement('script');
    s.async = true;
    s.id = 'oeh-gtag';
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    d.head.appendChild(s);
    pageView();
  }

  // ---- Microsoft Clarity (heatmaps + session replay) --------------------------------------
  // Same gate as GA: production hostname, and only after analytics consent is granted.
  // The tag is async and inserted after consent, so it is not on the critical path.
  // consentv2 is Clarity's current consent API (ad_Storage / analytics_Storage, case-sensitive).
  // The site's banner is one choice for analytics and ads, so both flags follow that choice.
  // Rejecting after a grant calls consent(false), which tells Clarity to delete its cookies and
  // stop tracking until consent is granted again. Inputs stay masked; nothing here unmasks them.
  var clarityLoaded = false;
  function claritySignals(choice) {
    var v = choice === 'granted' ? 'granted' : 'denied';
    return { ad_Storage: v, analytics_Storage: v };
  }
  function ensureClarityStub() {
    if (typeof w.clarity === 'function') return;
    w.clarity = function () {
      (w.clarity.q = w.clarity.q || []).push(arguments);
    };
  }
  function clearClarityCookies() {
    var host = location.hostname;
    d.cookie.split(';').forEach(function (c) {
      var n = c.split('=')[0].trim();
      if (n === '_clck' || n === '_clsk' || n === 'CLID') {
        ['', host, '.' + host].forEach(function (dom) {
          d.cookie = n + '=; Max-Age=0; path=/' + (dom ? '; domain=' + dom : '');
        });
      }
    });
  }
  function loadClarity() {
    if (!clarityOn || !granted()) return;
    ensureClarityStub();
    w.clarity('consentv2', claritySignals('granted'));
    if (clarityLoaded) return;
    clarityLoaded = true;
    var s = d.createElement('script');
    s.async = true;
    s.id = 'oeh-clarity';
    s.src = 'https://www.clarity.ms/tag/' + CLARITY_ID;
    d.head.appendChild(s);
  }
  function stopClarity() {
    if (!clarityLoaded || typeof w.clarity !== 'function') return;
    w.clarity('consentv2', claritySignals('denied'));
    w.clarity('consent', false);
    clearClarityCookies();
  }
  // ---- Cookieless visit counter (no consent needed: nothing is stored on the device) ---------
  // One small POST to /api/hit per page view and per funnel event. It carries only the page path,
  // the referring page (for the first page of a visit), utm_source and the event name. The Worker
  // drops bots and keeps aggregate daily counts; no cookie, ID, IP address or user agent is stored.
  var lastCounted = null;
  function automated() {
    try {
      return !!navigator.webdriver || /HeadlessChrome|bot|crawl|spider|Lighthouse/i.test(navigator.userAgent || '');
    } catch (e) {
      return true;
    }
  }
  function beacon(obj) {
    if (PROD_HOSTS.indexOf(location.hostname) === -1 || automated()) return;
    try {
      var body = JSON.stringify(obj);
      if (navigator.sendBeacon && navigator.sendBeacon('/api/hit', body)) return;
      fetch('/api/hit', { method: 'POST', body: body, keepalive: true, credentials: 'omit' });
    } catch (e) { /* counting must never break the page */ }
  }
  function countView() {
    var path = location.pathname;
    if (path === lastCounted) return;
    var first = lastCounted === null;
    lastCounted = path;
    var utm = null;
    try { utm = new URLSearchParams(location.search).get('utm_source'); } catch (e) { /* old browser */ }
    var rec = { t: 'view', p: path, r: first ? d.referrer || '' : location.origin + '/' };
    if (utm) rec.u = utm;
    beacon(rec);
  }
  function countEvent(name) {
    beacon({ t: 'event', e: String(name || '') });
  }

  function routeChanged() {
    // Let the page update its <title> first.
    setTimeout(pageView, 60);
    setTimeout(countView, 60);
    setTimeout(function () { if (banner) reservePageSpace(); }, 60);
  }
  ['pushState', 'replaceState'].forEach(function (m) {
    var orig = history[m];
    if (typeof orig !== 'function') return;
    history[m] = function () {
      var r = orig.apply(this, arguments);
      routeChanged();
      return r;
    };
  });
  w.addEventListener('popstate', routeChanged);

  function track(name, params) {
    if (!loaded || !granted() || !name) return;
    gtag('event', String(name), params || {});
  }

  function clearGaCookies() {
    var host = location.hostname;
    d.cookie.split(';').forEach(function (c) {
      var n = c.split('=')[0].trim();
      if (/^_ga/.test(n)) {
        ['', host, '.' + host].forEach(function (dom) {
          d.cookie = n + '=; Max-Age=0; path=/' + (dom ? '; domain=' + dom : '');
        });
      }
    });
  }

  // ---- Banner -----------------------------------------------------------------------------
  var TEXT = {
    en: {
      label: 'Cookie consent',
      title: 'Cookies on OpenExam Hub',
      body: 'With your OK, we use Google Analytics and Microsoft Clarity (heatmaps and session recordings) to see which pages help, and Google may set ad cookies on the study dashboard. Nothing loads until you choose; change it anytime in “Cookie settings”.',
      more: 'Privacy notice',
      accept: 'Accept',
      reject: 'Reject'
    },
    fr: {
      label: 'Consentement aux cookies',
      title: 'Cookies sur OpenExam Hub',
      body: 'Avec votre accord, nous utilisons Google Analytics et Microsoft Clarity (cartes de chaleur et enregistrements de session) pour voir quelles pages aident, et Google peut déposer des cookies publicitaires sur le tableau de bord. Rien n’est chargé avant votre choix ; modifiable à tout moment via « Cookie settings ».',
      more: 'Politique de confidentialité',
      accept: 'Accepter',
      reject: 'Refuser'
    }
  };
  function lang() {
    var el = d.querySelector('#root [lang]');
    var l = (el && el.getAttribute('lang')) || d.documentElement.getAttribute('lang') || '';
    if (/^fr/i.test(l)) return 'fr';
    if (/^en/i.test(l) && el) return 'en';
    return /^fr/i.test(navigator.language || '') ? 'fr' : 'en';
  }

  var banner = null;
  function btnStyle(b) {
    b.type = 'button';
    b.tabIndex = 0;
    b.style.cssText =
      'flex:1 1 0;min-height:40px;padding:0 16px;border-radius:999px;border:1.5px solid #1A1714;' +
      'background:#1A1714;color:#fff;font:600 15px/1 Inter,system-ui,sans-serif;cursor:pointer';
  }
  // Pin the banner to the top of the viewport (with the iOS safe-area) and reserve that height as
  // padding-top. A bottom banner needed a scroll adjustment that often ran before the /app CTA
  // mounted and never re-ran, leaving "Create free account" under the Accept/Reject bar. Top
  // placement does not depend on scroll timing. On /app the banner is slightly more compact and
  // AuthGate (min-h-screen) consumes --oeh-consent-space itself, so we do not also pad <body>.
  var padWas = null;
  var listening = false;
  function isAppPath() {
    var path = location.pathname || '';
    return path === '/app' || path.indexOf('/app/') === 0;
  }
  function bannerSpace() {
    if (!banner) return '0px';
    // Use the painted bottom edge so compact (flush-top, safe-area in padding) and
    // the regular floating card share one reservation formula.
    return Math.ceil(banner.getBoundingClientRect().bottom + 8) + 'px';
  }
  function applyBannerChrome() {
    if (!banner) return;
    var compact = isAppPath();
    var title = banner.querySelector('#oeh-consent-title');
    var p = banner.querySelector('p');
    var row = banner.querySelector('[data-oe-consent-actions]');
    if (compact) {
      // Slim full-width bar so the /app gate CTA stays above the fold without scrolling.
      banner.style.top = '0';
      banner.style.left = '0';
      banner.style.right = '0';
      banner.style.maxWidth = 'none';
      banner.style.borderRadius = '0';
      banner.style.padding = 'calc(8px + env(safe-area-inset-top, 0px)) 12px 8px';
      banner.style.display = 'flex';
      banner.style.flexWrap = 'wrap';
      banner.style.alignItems = 'center';
      banner.style.gap = '8px 12px';
      banner.style.boxShadow = '0 8px 24px -16px rgba(26,23,20,.35)';
      if (title) {
        title.style.margin = '0';
        title.style.font = '700 13px/1.3 Inter,system-ui,sans-serif';
        title.style.flex = '1 1 12rem';
      }
      if (p) p.style.display = 'none';
      if (row) {
        row.style.flex = '0 1 auto';
        row.style.marginLeft = 'auto';
        row.style.minWidth = '220px';
      }
    } else {
      banner.style.top = 'calc(8px + env(safe-area-inset-top, 0px))';
      banner.style.left = '12px';
      banner.style.right = '12px';
      banner.style.maxWidth = '38rem';
      banner.style.borderRadius = '18px';
      banner.style.padding = '12px 14px';
      banner.style.display = 'block';
      banner.style.flexWrap = '';
      banner.style.alignItems = '';
      banner.style.gap = '';
      banner.style.boxShadow = '0 18px 40px -18px rgba(26,23,20,.35)';
      if (title) {
        title.style.margin = '0 0 4px';
        title.style.font = '700 14px/1.3 Inter,system-ui,sans-serif';
        title.style.flex = '';
      }
      if (p) {
        p.style.display = '';
        p.style.margin = '0 0 10px';
      }
      if (row) {
        row.style.flex = '';
        row.style.marginLeft = '';
        row.style.minWidth = '';
      }
    }
  }
  function reservePageSpace() {
    if (!banner || !d.body) return;
    applyBannerChrome();
    var space = bannerSpace();
    d.documentElement.style.setProperty('--oeh-consent-space', space);
    d.documentElement.style.scrollPaddingTop = space;
    d.documentElement.style.scrollPaddingBottom = '';
    if (padWas === null) padWas = d.body.style.paddingTop || '';
    d.body.style.paddingTop = isAppPath() ? (padWas || '') : space;
  }
  function onResize() { reservePageSpace(); }
  function listenResize(on) {
    if (on && !listening) {
      w.addEventListener('resize', onResize);
      if (w.visualViewport) w.visualViewport.addEventListener('resize', onResize);
      listening = true;
    } else if (!on && listening) {
      w.removeEventListener('resize', onResize);
      if (w.visualViewport) w.visualViewport.removeEventListener('resize', onResize);
      listening = false;
    }
  }
  function hide() {
    listenResize(false);
    if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
    banner = null;
    if (padWas !== null && d.body) d.body.style.paddingTop = padWas;
    padWas = null;
    d.documentElement.style.removeProperty('--oeh-consent-space');
    d.documentElement.style.scrollPaddingTop = '';
  }
  function show(focus) {
    if (banner) {
      if (focus) banner.querySelector('button').focus();
      return;
    }
    var t = TEXT[lang()];
    banner = d.createElement('section');
    banner.id = 'oeh-consent';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', t.label);
    banner.setAttribute('lang', lang());
    banner.style.cssText =
      'position:fixed;z-index:2147483000;left:12px;right:12px;top:calc(8px + env(safe-area-inset-top, 0px));bottom:auto;margin:0 auto;max-width:38rem;' +
      'background:#fff;color:#1A1714;border:1px solid #E7E1D7;border-radius:18px;padding:12px 14px;' +
      'box-shadow:0 18px 40px -18px rgba(26,23,20,.35);font:13px/1.45 Inter,system-ui,sans-serif';
    var h = d.createElement('h2');
    h.id = 'oeh-consent-title';
    h.textContent = t.title;
    h.style.cssText = 'margin:0 0 4px;font:700 14px/1.3 Inter,system-ui,sans-serif';
    var p = d.createElement('p');
    p.style.cssText = 'margin:0 0 10px;color:#4A443D';
    p.appendChild(d.createTextNode(t.body + ' '));
    var a = d.createElement('a');
    a.href = '/privacy';
    a.textContent = t.more;
    a.style.cssText = 'color:#C2410C;text-decoration:underline';
    p.appendChild(a);
    var row = d.createElement('div');
    row.setAttribute('data-oe-consent-actions', '');
    row.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap';
    var acc = d.createElement('button');
    btnStyle(acc);
    acc.textContent = t.accept;
    acc.setAttribute('data-oe-consent', 'granted');
    var rej = d.createElement('button');
    btnStyle(rej);
    rej.textContent = t.reject;
    rej.setAttribute('data-oe-consent', 'denied');
    acc.addEventListener('click', function () { choose('granted'); });
    rej.addEventListener('click', function () { choose('denied'); });
    row.appendChild(acc);
    row.appendChild(rej);
    banner.appendChild(h);
    banner.appendChild(p);
    banner.appendChild(row);
    banner.setAttribute('aria-labelledby', 'oeh-consent-title');
    if (!d.getElementById('oeh-consent-focus')) {
      var focusCss = d.createElement('style');
      focusCss.id = 'oeh-consent-focus';
      focusCss.textContent =
        '#oeh-consent button:focus{outline:3px solid #C2410C;outline-offset:3px}' +
        '#oeh-consent button:focus-visible{outline:3px solid #C2410C;outline-offset:3px}';
      d.head.appendChild(focusCss);
    }
    banner.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state) hide();
    });
    // First in tab order so Accept/Reject are reachable without walking the whole page.
    d.body.insertBefore(banner, d.body.firstChild);
    reservePageSpace();
    if (w.requestAnimationFrame) w.requestAnimationFrame(reservePageSpace);
    listenResize(true);
    if (focus) acc.focus();
  }

  function choose(choice) {
    var was = state && state.choice;
    state = { choice: choice, ts: Date.now(), v: 1 };
    try {
      w.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) { /* storage blocked: choice holds for this page view */ }
    gtag('consent', 'update', signals(choice));
    if (choice === 'granted') {
      loadGa();
      loadClarity();
    } else {
      if (was === 'granted') clearGaCookies();
      stopClarity();
    }
    hide();
    try {
      w.dispatchEvent(new CustomEvent('oeh:consent', { detail: { choice: choice } }));
    } catch (e) { /* old browser */ }
  }

  var required = gaOn || clarityOn;
  function requireConsent() {
    required = true;
    if (!state) whenReady(function () { show(false); });
  }

  // ---- Click tracking (works on static pages too) -------------------------------------------
  function hostMatches(host, list) {
    for (var i = 0; i < list.length; i++) {
      if (host === list[i] || host.slice(-(list[i].length + 1)) === '.' + list[i]) return true;
    }
    return false;
  }
  d.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var opener = t.closest('[data-oe-consent-open]');
    if (opener) {
      e.preventDefault();
      show(true);
      return;
    }
    var a = t.closest('a[href]');
    if (!a) return;
    var u;
    try {
      u = new URL(a.href, location.href);
    } catch (err) {
      return;
    }
    var host = u.hostname.toLowerCase();
    var provider = null;
    if (host === 'ko-fi.com' || host.slice(-8) === '.ko-fi.com') provider = 'kofi';
    else if (host === 'opencollective.com' || host.slice(-17) === '.opencollective.com') provider = 'opencollective';
    else if (host === 'github.com' && /^\/sponsors\//.test(u.pathname)) provider = 'github_sponsors';
    else if (host === 'paypal.com' || host === 'paypal.me' || host.slice(-11) === '.paypal.com' || host.slice(-10) === '.paypal.me') provider = 'paypal';
    if (provider) {
      track('donation_click', { platform: provider, provider: provider, link_url: u.href });
    } else if (u.origin === location.origin && /^\/blog(\/|$)/.test(location.pathname) && /^\/(app|exams)(\/|$)/.test(u.pathname) && !a.closest('header, footer, nav')) {
      track('blog_cta_click', { cta_target: u.pathname + u.search, post_path: location.pathname, link_text: (a.textContent || '').trim().slice(0, 100) });
    } else if (u.origin !== location.origin && hostMatches(host, OFFICIAL)) {
      track('outbound_official_resource', { link_url: u.href.slice(0, 500), link_domain: host });
    }
  }, true);

  function whenReady(fn) {
    if (d.body) fn();
    else d.addEventListener('DOMContentLoaded', fn);
  }

  w.oeh = {
    __v: 1,
    track: track,
    consent: function () { return state ? state.choice : null; },
    open: function () { whenReady(function () { show(true); }); },
    require: requireConsent,
    count: countEvent
  };
  whenReady(countView);

  if (granted()) {
    loadGa();
    loadClarity();
  } else if (!state && required) whenReady(function () { show(false); });
})();
