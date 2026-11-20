import React from 'react';
import { donationCopy, donationLang, DONATION_LINKS, DONATION_PLATFORMS } from './donations.js';

// Compact PayPal mark (Simple Icons path), tinted with currentColor.
export function PaypalMark({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797H8.84c-.62 0-1.162.44-1.262 1.052l-.99 6.275c-.086.546-.534.954-1.086.954h.574zm14.237-14.43a8.54 8.54 0 0 1-.077.437c-1.134 5.825-5.078 7.83-10.05 7.83H8.304l-1.032 6.54h3.295a.85.85 0 0 0 .84-.72l.035-.18.67-4.253.043-.23a.85.85 0 0 1 .84-.72h.53c3.433 0 6.121-1.394 6.907-5.422.328-1.684.158-3.094-.677-4.076z" />
    </svg>
  );
}

const PRIMARY_BTN =
  'inline-flex items-center justify-center gap-2.5 min-h-[48px] px-6 rounded-full bg-[#003087] hover:bg-[#002B73] text-white font-semibold transition-colors';

export function FundProjectButton({
  className = '',
  lang,
  showSubline = true,
  fullWidth = false
}) {
  const copy = donationCopy(lang);
  const url = DONATION_LINKS.paypal;
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${PRIMARY_BTN} ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      <PaypalMark className="w-5 h-5 shrink-0" />
      <span className={showSubline ? 'flex flex-col items-start text-left leading-tight' : undefined}>
        <span>{copy.fundLabel}</span>
        {showSubline ? (
          <span className="mt-0.5 text-[12px] font-medium text-white/85">{copy.fundSubline}</span>
        ) : null}
      </span>
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export function SecondaryDonationLinks({ lang, className = '', linkClassName = '' }) {
  const copy = donationCopy(lang);
  const others = DONATION_PLATFORMS.filter((p) => p.key !== 'paypal');
  if (!others.length) return null;
  return (
    <div className={className}>
      {others.map((p) => (
        <a
          key={p.key}
          href={p.url}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          {copy.supportOn(p.name)}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ))}
    </div>
  );
}

export function donationUiLang() {
  return donationLang();
}
