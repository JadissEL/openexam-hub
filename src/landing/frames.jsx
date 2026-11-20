import React from 'react';

export function BrowserFrame({ src, alt, width, height, className = '', eager = false }) {
  return (
    <figure className={`rounded-[18px] bg-white ring-1 ring-black/[0.07] shadow-[0_40px_80px_-40px_rgba(60,40,20,0.45)] overflow-hidden ${className}`}>
      <div className="flex items-center gap-1.5 px-4 h-9 border-b border-black/[0.06] bg-[#FBFAF8]" aria-hidden="true">
        <span className="w-2.5 h-2.5 rounded-full bg-[#E9E4DC]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#E9E4DC]" />
        <span className="w-2.5 h-2.5 rounded-full bg-[#E9E4DC]" />
        <span className="ml-3 text-[11px] text-[#6B635A] truncate">openexamhub.org/app</span>
      </div>
      <img src={src} alt={alt} width={width} height={height} loading={eager ? 'eager' : 'lazy'} decoding="async" fetchpriority={eager ? 'high' : undefined} className="block w-full h-auto" />
    </figure>
  );
}

export function PhoneFrame({ src, alt, width, height, className = '', eager = false }) {
  return (
    <figure className={`rounded-[34px] bg-[#1A1714] p-[7px] shadow-[0_40px_70px_-30px_rgba(60,40,20,0.55)] ${className}`}>
      <div className="rounded-[28px] overflow-hidden bg-[#F4F4F2]">
        <img src={src} alt={alt} width={width} height={height} loading={eager ? 'eager' : 'lazy'} decoding="async" className="block w-full h-auto" />
      </div>
    </figure>
  );
}
