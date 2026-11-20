// /api/webhooks/<provider>, one Vercel function for every donation webhook.
// Signature/token checks need the RAW body: nothing in this file or lib/dispatch.js touches req.body
// (Vercel parses it lazily, only on access), so each handler reads the untouched stream with
// lib/http.js rawBody(). bodyParser:false is kept for runtimes that honour it.
import { createDispatcher } from '../../lib/dispatch.js';
import githubSponsors from '../../lib/routes/webhooks/github-sponsors.js';
import kofi from '../../lib/routes/webhooks/kofi.js';
import openCollective from '../../lib/routes/webhooks/open-collective.js';

export const config = { api: { bodyParser: false } };

export const ROUTES = {
  'github-sponsors': githubSponsors, // POST /api/webhooks/github-sponsors (X-Hub-Signature-256)
  kofi, // POST /api/webhooks/kofi (form field data.verification_token)
  'open-collective': openCollective // POST /api/webhooks/open-collective?token=
};

export default createDispatcher(ROUTES, 'provider');
