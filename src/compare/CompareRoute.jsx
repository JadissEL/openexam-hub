import React from 'react';
import { ComparePage } from './ComparePage.jsx';
import { ClbTablePage, CompareHub } from './CompareHub.jsx';
import { CLB_TABLE_PAGE } from './comparePages.js';

/** Client fallback for /compare routes (dev server, or a host that serves the SPA shell). */
export default function CompareRoute({ slug }) {
  if (!slug) return <CompareHub />;
  if (slug === CLB_TABLE_PAGE.slug) return <ClbTablePage />;
  return <ComparePage slug={slug} />;
}
