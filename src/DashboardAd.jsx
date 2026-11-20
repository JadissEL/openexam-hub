import React, { useEffect, useRef, useState } from 'react';
import { ADSENSE_CLIENT, ADSENSE_SLOT, adsConfigured, isDashboardPath, loadAdSense, waitForConsentDecision } from './ads.js';

// One unobtrusive ad unit in the dashboard sidebar. Renders nothing unless AdSense is configured
// (VITE_ADSENSE_CLIENT + VITE_ADSENSE_SLOT), the page is /app and the user is signed in.
// The box has a fixed height so the layout never shifts when the ad arrives.
const AD_HEIGHT = 250;

export default function DashboardAd({ enabled }) {
  const insRef = useRef(null);
  const [state, setState] = useState('waiting'); // waiting | shown | off
  const active = !!enabled && adsConfigured() && isDashboardPath();

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    loadAdSense()
      .then(() => waitForConsentDecision())
      .then((decided) => {
        if (cancelled) return;
        if (!decided || !insRef.current || insRef.current.dataset.adsbygoogleStatus) {
          if (!decided) setState('off');
          return;
        }
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        setState('shown');
      })
      .catch(() => !cancelled && setState('off'));
    return () => {
      cancelled = true;
    };
  }, [active]);

  if (!active || state === 'off') return null;
  return (
    <section aria-label="Advertisement" className="rounded-3xl border border-black/5 bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
        Advertisement · <a href="/funding" className="underline underline-offset-2">why ads?</a>
      </p>
      <div style={{ minHeight: AD_HEIGHT }}>
        <ins
          ref={insRef}
          className="adsbygoogle"
          style={{ display: 'block', width: '100%', height: AD_HEIGHT }}
          data-ad-client={ADSENSE_CLIENT}
          data-ad-slot={ADSENSE_SLOT}
          data-full-width-responsive="false"
        />
      </div>
    </section>
  );
}
