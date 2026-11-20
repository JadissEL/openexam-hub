import React from 'react';
import { posts } from 'virtual:blog-posts';
import { ExamPage, ExamsIndex } from './ExamPages.jsx';
import { examPageBySlug } from './site.js';

/** Client fallback for /exams routes (dev server, or a host that serves the SPA shell). */
export default function ExamRoute({ pathname }) {
  const m = String(pathname || '').match(/^\/exams\/([a-z0-9-]+)$/);
  if (m && examPageBySlug(m[1])) return <ExamPage slug={m[1]} posts={posts} />;
  if (pathname === '/exams') return <ExamsIndex posts={posts} />;
  return <ExamsIndex posts={posts} />;
}
