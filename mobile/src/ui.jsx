import { useRef, useState } from 'react';
import { openExternal } from './native.js';
import { routeFromUrl } from './paths.js';
import { useNav } from './nav.js';

export function Icon({ name }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (name === 'home') return <svg {...common}><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" /></svg>;
  if (name === 'exams') return <svg {...common}><path d="M5 4.5h10.5A2.5 2.5 0 0 1 18 7v13H8.5A2.5 2.5 0 0 1 6 17.5V6.5" /><path d="M6 6.5h10" /><path d="M8 4.5v13" /></svg>;
  if (name === 'tools') return <svg {...common}><path d="M14.5 5.5a3.5 3.5 0 0 0-4.9 4.9L4 16l4 4 5.6-5.6a3.5 3.5 0 0 0 4.9-4.9L16 12l-2-2z" /></svg>;
  if (name === 'library') return <svg {...common}><path d="M4 5h6v14H4zM14 5h6v14h-6z" /><path d="M10 7h4M10 12h4M10 17h4" /></svg>;
  if (name === 'study') return <svg {...common}><path d="M12 3v18" /><path d="M5 7.5c2-1 4.2-.4 7 .8 2.8-1.2 5-1.8 7-.8v10c-2-1-4.2-.4-7 .8-2.8-1.2-5-1.8-7-.8z" /></svg>;
  return <svg {...common}><path d="M15 6 9 12l6 6" /></svg>;
}

export function Mark() {
  return (
    <picture>
      <source srcSet="./mark-on-dark.svg" media="(prefers-color-scheme: dark)" />
      <img src="./mark.svg" alt="" width="32" height="32" />
    </picture>
  );
}

export function useOpenHref() {
  const { push } = useNav();
  return (href) => {
    if (!href) return;
    if (/^https?:\/\//.test(href)) {
      const route = routeFromUrl(href);
      if (route && !route.external) push(route);
      else openExternal(route?.external || href);
      return;
    }
    const route = routeFromUrl(href);
    if (route?.external) openExternal(route.external);
    else if (route) push(route);
  };
}

export function TextLink({ href, children }) {
  const open = useOpenHref();
  return (
    <button type="button" className="text-btn" onClick={() => open(href)}>
      {children}
    </button>
  );
}

export function RowLink({ title, detail, onClick }) {
  return (
    <button type="button" className="row-btn" onClick={onClick}>
      <span className="grow">
        {title}
        {detail ? <small>{detail}</small> : null}
      </span>
      <span className="chev" aria-hidden="true">›</span>
    </button>
  );
}

export function Facts({ rows }) {
  if (!rows?.length) return null;
  return (
    <div className="facts">
      {rows.map(([label, value]) => (
        <div className="fact" key={label}>
          <span>{label}</span>
          <p>{value}</p>
        </div>
      ))}
    </div>
  );
}

export function Faq({ items }) {
  if (!items?.length) return null;
  return (
    <div className="faq">
      <h2 className="section-title">Questions people ask</h2>
      {items.map((item) => (
        <details key={item.q}>
          <summary>{item.q}</summary>
          <p>{item.a}</p>
        </details>
      ))}
    </div>
  );
}

export function External({ href, children }) {
  return (
    <button type="button" className="text-btn" onClick={() => openExternal(href)}>
      {children}
    </button>
  );
}

export function Empty({ title, detail }) {
  return (
    <div className="card">
      <h2 className="display" style={{ fontSize: '1.6rem' }}>{title}</h2>
      {detail ? <p className="lead">{detail}</p> : null}
    </div>
  );
}

export function PullToRefresh({ onRefresh, children }) {
  const [label, setLabel] = useState('');
  const startY = useRef(0);
  const pulling = useRef(false);
  return (
    <div
      onTouchStart={(e) => {
        const scroller = e.currentTarget.closest('.main');
        if (scroller && scroller.scrollTop <= 0) {
          startY.current = e.touches[0].clientY;
          pulling.current = true;
        }
      }}
      onTouchMove={(e) => {
        if (!pulling.current) return;
        const dy = e.touches[0].clientY - startY.current;
        if (dy > 64) setLabel('Release to refresh');
        else if (dy > 16) setLabel('Pull to refresh');
      }}
      onTouchEnd={async () => {
        if (label === 'Release to refresh' && onRefresh) {
          setLabel('Refreshing…');
          try { await onRefresh(); } finally { setLabel(''); }
        } else setLabel('');
        pulling.current = false;
      }}
    >
      {label ? <p className="pull" style={{ height: '1.6rem' }}>{label}</p> : null}
      {children}
    </div>
  );
}

export function prettyDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}
