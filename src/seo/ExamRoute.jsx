import React from 'react';
import { posts } from 'virtual:blog-posts';
import { ExamPage, ExamsIndex, PlanPage } from './ExamPages.jsx';
import { examPageBySlug } from './site.js';
import { planPage } from './planPages.js';

/** Client fallback for /exams routes (dev server, or a host that serves the SPA shell). */
export default function ExamRoute({ pathname }) {
  const p = String(pathname || '');
  const m = p.match(/^\/exams\/([a-z0-9-]+)$/);
  if (m && examPageBySlug(m[1])) return <ExamPage slug={m[1]} posts={posts} />;
  const pm = p.match(/^\/exams\/([a-z0-9-]+)\/([a-z0-9-]+)$/);
  if (pm && planPage(pm[1], pm[2])) return <PlanPage guide={pm[1]} slug={pm[2]} posts={posts} />;
  return <ExamsIndex posts={posts} />;
}
