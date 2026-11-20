# Contributing to OpenExam Hub

Thank you for wanting to help. OpenExam Hub is a free, MIT-licensed study-roadmap tool. The useful work is often unglamorous: checking official links, fixing accessibility, adding a well-sourced exam, or making the docs clearer.

Please also read the [Code of Conduct](CODE_OF_CONDUCT.md).

## If you are new here

1. Try the live site: [https://openexamhub.org](https://openexamhub.org).
2. Browse [open issues](https://github.com/JadissEL/openexam-hub/issues), especially those labelled [`good first issue`](https://github.com/JadissEL/openexam-hub/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).
3. Comment on the issue you want to take so two people do not do the same work.

## Development setup

You need Node.js 24. For the end-to-end test you also need Java 11+ (Firestore emulator).

```bash
git clone https://github.com/JadissEL/openexam-hub.git
cd openexam-hub
npm install
npm run dev:api      # API on http://127.0.0.1:3001
npm run dev          # frontend on http://localhost:5173, /api proxied to :3001
```

Copy [`.env.example`](.env.example) and fill in only what you need. Never commit secrets, service-account keys or API tokens.

To run the API against the local emulator instead of a cloud project:

```bash
npm run emulator     # Firebase project id must stay demo-openexam
# in another terminal, point the API at the emulator (see .env.example)
npm run dev:api
```

Do **not** write test data to the production `openexam-hub` Firebase project. `npm run e2e` will refuse any project id that does not start with `demo-`.

```bash
npm test             # offline unit suites
npm run e2e          # emulator + mock LLM + real HTTP to api/**
npm run build
```

## What makes a good contribution

- **Official resources only.** Library links should come from exam boards, official partners or public broadcasters, on their official domains. No scraped paywalled courses, no unofficial dumps, no invented “official” URLs.
- **No fabricated stats or testimonials** in the UI or the docs.
- **Accessibility matters.** If you change the UI, keep labels, dialog names, keyboard access and contrast usable. Treat accessibility bugs as bugs.
- **Keep ads off the landing page.** Ads, if any, belong on the planner/dashboard and must stay disclosed.
- **Small, focused pull requests** are easier to review than large mixed ones.

If you want to add a new exam, open an issue first (there is a “Official resource” template). Describe the exam, the official source, and the free material you want to include.

## Pull requests

- Branch from `main` and open a PR against `main`.
- Explain what changed and how you tested it (`npm test`, `npm run e2e`, or a short manual note).
- Do not include secrets, personal data, or production credentials.
- If your change affects the API, update [CONTRACT.md](CONTRACT.md) when the behaviour changes.

## Security and production access

If you think you have found a security issue, please email [hello@openexamhub.org](mailto:hello@openexamhub.org) rather than opening a public issue.

Production deploys, webhook secrets and Firebase admin access stay with the maintainer.

## License

By contributing, you agree that your contribution is licensed under the [MIT License](LICENSE).
