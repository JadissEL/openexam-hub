import React from 'react';
import { renderToString } from 'react-dom/server';
import InfoPage from '../landing/InfoPage.jsx';
import LegalPage from '../landing/LegalPage.jsx';
import { ExamPage, ExamsIndex } from './ExamPages.jsx';
import { examContent } from './examContent.js';
import { FAQ } from '../landing/content.js';

/** Build-time HTML for marketing and exam-guide routes (see scripts/prerender-pages.mjs). */
export function renderPage(pathname, posts = []) {
  const p = String(pathname).replace(/\/+$/, '') || '/';
  if (p === '/about') return renderToString(<InfoPage kind="about" />);
  if (p === '/faq') return renderToString(<InfoPage kind="faq" />);
  if (p === '/funding') return renderToString(<InfoPage kind="funding" />);
  if (p === '/privacy') return renderToString(<LegalPage kind="privacy" />);
  if (p === '/terms') return renderToString(<LegalPage kind="terms" />);
  if (p === '/exams') return renderToString(<ExamsIndex posts={posts} />);
  const m = p.match(/^\/exams\/([a-z0-9-]+)$/);
  if (m) return renderToString(<ExamPage slug={m[1]} posts={posts} />);
  return null;
}

export { examContent, FAQ };
