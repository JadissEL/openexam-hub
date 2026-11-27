# AY Automate free-backlink list audit

**Source:** https://www.ayautomate.com/blog/free-backlink-sites (scraped 2026-11-24)  
**Product:** OpenExam Hub (web edtech / language-exam planner, Athens, free OSS)

Same rule as TrafficGo: take the **real free placements**, skip spam and bad-fit local junk.

## Verdict

| Bucket | Action |
|--------|--------|
| SaaS / product directories already in our CSV | **Use** (Product Hunt, Crunchbase, G2, Capterra, AlternativeTo, SaaSHub, StackShare, Wellfound, Futurepedia, Indie Hackers, Hotfrog, Bing Places, …) |
| Net-new high value | **Add + pursue** (StartupStash, Gravatar, SlideShare, Qwoted, Source of Sources, Featured.com if missing, GitHub Pages note) |
| US local SMB directories | **Skip** for now (Yelp, Angi, Nextdoor, YellowPages, …). OpenExam Hub is not a storefront; NAP spam hurts more than it helps |
| SEO affiliate forums | **Skip** (Warrior Forum, Digital Point, Traffic Planet signature schemes) |
| AY Rank paid app | **Skip paid**; use **free no-signup tools** on ayrank.com/tools |
| Guest posts (SEJ, SEW, …) | **Later** (real pitch required; not a form dump) |

## Already covered in `free-backlink-targets-1000.csv` (examples)

Product Hunt, Crunchbase, Wellfound, Capterra, GetApp, G2, AlternativeTo, SaaSHub, StackShare, Indie Hackers, Futurepedia, Medium, LinkedIn, Reddit, Quora, GitHub, Hotfrog, Bing Places, Brownbook, Behance, Dribbble, Featured (EverFeatured row exists; Featured.com HARO-style is separate).

## Net-new rows added (ids 1001+)

See CSV append + `progress` overrides for submit status.

## Free tools from the same ecosystem (no signup)

Run against https://openexamhub.org:

1. https://ayrank.com/tools/ai-crawler-access-checker
2. https://ayrank.com/tools/robots-txt-tester
3. https://ayrank.com/tools/sitemap-validator
4. https://ayrank.com/tools/llms-txt-generator (only if we decide to add `llms.txt` later)
5. https://ayrank.com/tools/geo-readiness-checker

## Done this session (2026-11-24)

- [x] Triage written (this file)
- [x] CSV append ids 1001–1008
- [x] AY Rank AI crawler access: **all 4 Allowed** (GPTBot, ClaudeBot, PerplexityBot, Google-Extended)
- [x] SaaSHub free submit: https://www.saashub.com/openexam-hub/added (pending approval; verify via partners@)

## Still open

1. SaaSHub: register/login → Verify listing + logo  
2. AlternativeTo account + add software  
3. StartupStash submit  
4. Gravatar website field  
5. Crunchbase free company profile  
6. Defer: Product Hunt launch day, G2/Capterra, guest posts, press desks  
