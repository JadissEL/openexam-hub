# IDEA-07: Global & local exam fee aggregator

**ID:** IDEA-07  
**Slug:** `exam-fee-aggregator`  
**Category:** Fees & Test Centers  
**Status:** pending  
**Exhaustion:** 0 / 8 tools complete

## Intent (full detail)

Structured pages by exam, country, city, and test center showing prices, currencies, center price ranges, rescheduling/cancellation penalties, one-skill retake options, travel/hotel caveats, and official booking links - starting with top countries and exams.

## Tools required to fully exhaust this idea

Use this checklist. An idea is **exhausted** only when every tool below exists (or is explicitly marked `wont-do` with a dated reason in the tracker).

- [ ] Fee data model: exam, country, city, center, currency, price range
- [ ] Fields: reschedule fee, cancel penalty, one-skill retake, caveats
- [ ] SEO pages: /fees/[exam]/[country]/[city]
- [ ] Official booking link field (outbound only)
- [ ] Currency display + last-verified date
- [ ] Filters and sort (price, city, verified)
- [ ] Seed pipeline for top countries/exams first
- [ ] Admin CRUD + CSV import for fee rows

## Exhaustion criteria

- [ ] Every tool above is built, documented, or `wont-do` with reason
- [ ] UX flow documented: start → action → result (including empty/error/success)
- [ ] Desktop-first layout considered if the idea has a user-facing surface
- [ ] Data model / storage needs listed (or N/A) and linked from implementation notes
- [ ] Official-link / copyright / disclosure rules respected
- [ ] Related ideas cross-linked and dependencies noted

## Related ideas

See [README.md](./README.md) category **Fees & Test Centers**.

## Implementation notes

_Add dated notes here as work proceeds. Do not store secrets._

## Change log

| Date | Note |
|------|------|
| 2026-11-24 | Idea page created from full 34-idea conversation dump. |
