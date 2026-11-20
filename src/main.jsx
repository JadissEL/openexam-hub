import React, { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

// Tiny path router. The marketing pages ship without Firebase; the study app (App.jsx and the
// Firebase SDK) is code-split and only downloaded on /app.
const Landing = lazy(() => import('./landing/Landing.jsx'));
const LegalPage = lazy(() => import('./landing/LegalPage.jsx'));
const App = lazy(() => import('./App.jsx'));

function pickRoute(pathname) {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/') return <Landing />;
  if (p === '/privacy') return <LegalPage kind="privacy" />;
  if (p === '/terms') return <LegalPage kind="terms" />;
  return <App />; // /app and any other path open the study app
}

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F7F5F0] text-neutral-500 text-sm" role="status">
      Loading…
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Suspense fallback={<Loading />}>{pickRoute(window.location.pathname)}</Suspense>
  </React.StrictMode>
);
