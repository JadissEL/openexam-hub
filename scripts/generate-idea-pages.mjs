import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "docs", "ideas");

/**
 * Execution cockpit metadata (Wave 1 stamped as phase=now / P0).
 * phase: now | next | later | adjacent
 * priority: P0 | P1 | P2
 * workType: product | ops | content | strategy
 * impact/effort: H | M | L
 */
const META = {
  "01": { phase: "now", priority: "P0", workType: "product", impact: "H", effort: "M", dependsOn: [] },
  "02": { phase: "now", priority: "P0", workType: "product", impact: "H", effort: "M", dependsOn: [] },
  "03": { phase: "now", priority: "P0", workType: "product", impact: "H", effort: "M", dependsOn: ["IDEA-02"] },
  "04": { phase: "next", priority: "P1", workType: "product", impact: "H", effort: "M", dependsOn: ["IDEA-02"] },
  "05": { phase: "next", priority: "P1", workType: "product", impact: "M", effort: "M", dependsOn: ["IDEA-03"] },
  "06": { phase: "next", priority: "P1", workType: "product", impact: "M", effort: "M", dependsOn: ["IDEA-01"] },
  "07": { phase: "now", priority: "P0", workType: "product", impact: "H", effort: "H", dependsOn: [] },
  "08": { phase: "next", priority: "P1", workType: "ops", impact: "H", effort: "H", dependsOn: ["IDEA-07"] },
  "09": { phase: "next", priority: "P1", workType: "product", impact: "H", effort: "M", dependsOn: ["IDEA-07"] },
  "10": { phase: "later", priority: "P1", workType: "product", impact: "M", effort: "M", dependsOn: ["IDEA-07", "IDEA-09"] },
  "11": { phase: "now", priority: "P0", workType: "product", impact: "H", effort: "M", dependsOn: [] },
  "12": { phase: "now", priority: "P0", workType: "product", impact: "H", effort: "M", dependsOn: ["IDEA-02"] },
  "13": { phase: "now", priority: "P0", workType: "content", impact: "H", effort: "L", dependsOn: [] },
  "14": { phase: "next", priority: "P1", workType: "ops", impact: "M", effort: "M", dependsOn: ["IDEA-30"] },
  "15": { phase: "later", priority: "P2", workType: "product", impact: "M", effort: "H", dependsOn: ["IDEA-07"] },
  "16": { phase: "later", priority: "P2", workType: "ops", impact: "M", effort: "H", dependsOn: ["IDEA-14"] },
  "17": { phase: "next", priority: "P1", workType: "product", impact: "H", effort: "H", dependsOn: ["IDEA-07"] },
  "18": { phase: "next", priority: "P1", workType: "ops", impact: "H", effort: "M", dependsOn: ["IDEA-17"] },
  "19": { phase: "later", priority: "P1", workType: "ops", impact: "M", effort: "M", dependsOn: ["IDEA-17", "IDEA-18"] },
  "20": { phase: "adjacent", priority: "P2", workType: "ops", impact: "M", effort: "H", dependsOn: ["IDEA-24"] },
  "21": { phase: "later", priority: "P2", workType: "ops", impact: "M", effort: "M", dependsOn: ["IDEA-34"] },
  "22": { phase: "later", priority: "P2", workType: "ops", impact: "M", effort: "M", dependsOn: ["IDEA-16"] },
  "23": { phase: "later", priority: "P2", workType: "content", impact: "M", effort: "L", dependsOn: ["IDEA-03"] },
  "24": { phase: "adjacent", priority: "P2", workType: "product", impact: "M", effort: "H", dependsOn: [] },
  "25": { phase: "later", priority: "P2", workType: "ops", impact: "M", effort: "M", dependsOn: ["IDEA-34"] },
  "26": { phase: "adjacent", priority: "P2", workType: "product", impact: "H", effort: "H", dependsOn: [] },
  "27": { phase: "now", priority: "P0", workType: "product", impact: "M", effort: "L", dependsOn: [] },
  "28": { phase: "adjacent", priority: "P2", workType: "ops", impact: "H", effort: "H", dependsOn: ["IDEA-31", "IDEA-30"] },
  "29": { phase: "now", priority: "P1", workType: "strategy", impact: "H", effort: "L", dependsOn: [] },
  "30": { phase: "now", priority: "P0", workType: "strategy", impact: "H", effort: "L", dependsOn: [] },
  "31": { phase: "adjacent", priority: "P1", workType: "product", impact: "H", effort: "M", dependsOn: ["IDEA-30"] },
  "32": { phase: "next", priority: "P1", workType: "ops", impact: "M", effort: "M", dependsOn: ["IDEA-02", "IDEA-11"] },
  "33": { phase: "next", priority: "P1", workType: "strategy", impact: "M", effort: "L", dependsOn: ["IDEA-34"] },
  "34": { phase: "now", priority: "P0", workType: "strategy", impact: "H", effort: "M", dependsOn: ["IDEA-11", "IDEA-13"] },
};

const ideas = [
  {
    id: "01",
    slug: "anti-fluff-transparent-positioning",
    title: "High-trust anti-fluff & transparent positioning",
    category: "Positioning & Trust",
    summary:
      "Free, open-source, non-commercial framing; explicit independence from exam boards; last verified / checked dates; direct official links without hosting copyrighted material.",
    tools: [
      "Trust badge / independence statement component (site chrome + about)",
      "Last-verified date field on every official resource and fee row",
      "Link policy UI: official outbound links only, no copyrighted PDFs hosted",
      "Open-source / MIT license callouts on landing and footer",
      "Non-commercial / no exam-board affiliation disclosure block",
      "Changelog or freshness strip on dashboard and SEO pages",
      "Admin tool to set/update verifiedAt per resource",
      "Automated link health status surface (ok / unverified / broken)",
    ],
  },
  {
    id: "02",
    slug: "try-first-save-later-onboarding",
    title: "Zero-friction try first, save later onboarding",
    category: "Onboarding & Product UX",
    summary:
      "Let visitors preview or generate a study plan immediately before prompting sign-in to save or sync.",
    tools: [
      "Anonymous plan generator (exam, level, days, daily minutes)",
      "Local/session storage for unsaved preview plans",
      "Plan preview page with clear Save & sync CTA",
      "Auth gate only on save/sync (not on generate)",
      "Merge-on-login tool: attach local plan to account",
      "Soft signup prompt after N days previewed or first checkoff",
      "Analytics events: preview_started, preview_completed, save_clicked",
    ],
  },
  {
    id: "03",
    slug: "todays-tasks-countdown-workspace",
    title: "Daily Today's Tasks & countdown workspace",
    category: "Onboarding & Product UX",
    summary:
      "Open returning users onto their exam countdown, today's tasks with direct links to official exercises and durations, 1-click checkoffs, and streaks.",
    tools: [
      "Exam countdown widget (days remaining, target date)",
      "Today's Tasks list with official exercise links + durations",
      "1-click task checkoff with optimistic UI",
      "Streak counter + miss-day recovery copy",
      "Default landing route for returning signed-in users",
      "Empty / no-plan / exam-passed states",
      "Offline or failed-sync retry for checkoffs",
      "Desktop multi-column workspace layout (countdown | tasks | streak)",
    ],
  },
  {
    id: "04",
    slug: "shareable-public-study-plans",
    title: "Shareable public study plans",
    category: "Growth & Viral Loops",
    summary:
      "Read-only share links so learners posting schedules in study groups bring peers into the platform.",
    tools: [
      "Generate read-only share token / slug per plan",
      "Public plan view page (no auth required)",
      "Copy link + Open Graph / social meta for shares",
      "Fork / use this plan CTA into try-first flow",
      "Privacy controls: public vs unlisted vs private",
      "Revoke / rotate share link",
      "Share analytics: views, forks, referrals",
    ],
  },
  {
    id: "05",
    slug: "daily-weekly-reminder-nudges",
    title: "Lightweight daily/weekly reminder nudges",
    category: "Engagement",
    summary:
      "Optional task reminders tied to the user's exam date that link back to their dashboard.",
    tools: [
      "Reminder preference center (email and/or push; opt-in)",
      "Schedule engine keyed to exam date + timezone",
      "Daily and weekly nudge templates with deep link to dashboard",
      "Quiet hours / frequency caps",
      "Unsubscribe one-click + preference sync",
      "Delivery log / failure retry",
      "Preview reminder tool for the user",
    ],
  },
  {
    id: "06",
    slug: "non-intrusive-ux-freshness-checks",
    title: "Non-intrusive workspace UX & automated freshness checks",
    category: "Trust & Ops",
    summary:
      "Keep dashboard ads minimal/non-intrusive and run automated/scheduled checks for broken links or outdated rules.",
    tools: [
      "Ad placement policy + density controls on dashboard",
      "Scheduled link checker cron / worker",
      "Broken-link queue for admin review",
      "Outdated exam-rules detector (manual override + last-checked)",
      "User-facing freshness badges",
      "Alert when a plan resource goes dead",
      "Ops dashboard: health %, last run, failures",
    ],
  },
  {
    id: "07",
    slug: "exam-fee-aggregator",
    title: "Global & local exam fee aggregator",
    category: "Fees & Test Centers",
    summary:
      "Structured pages by exam, country, city, and test center showing prices, currencies, center price ranges, rescheduling/cancellation penalties, one-skill retake options, travel/hotel caveats, and official booking links - starting with top countries and exams.",
    tools: [
      "Fee data model: exam, country, city, center, currency, price range",
      "Fields: reschedule fee, cancel penalty, one-skill retake, caveats",
      "SEO pages: /fees/[exam]/[country]/[city]",
      "Official booking link field (outbound only)",
      "Currency display + last-verified date",
      "Filters and sort (price, city, verified)",
      "Seed pipeline for top countries/exams first",
      "Admin CRUD + CSV import for fee rows",
    ],
  },
  {
    id: "08",
    slug: "batched-test-center-email-outreach",
    title: "50/day batched test-center email outreach",
    category: "Fees & Test Centers",
    summary:
      "Contact ~50 test centers per day (grouped by time zone and language, sent from a dedicated outreach domain/subdomain with proper email authentication and a 2-touch follow-up) asking for fees, upcoming session dates, and registration URLs.",
    tools: [
      "Outreach CRM / queue with daily cap (~50)",
      "Timezone + language grouping for send windows",
      "Dedicated outreach domain/subdomain + SPF/DKIM/DMARC checklist",
      "Template library (ask fees, sessions, registration URL)",
      "2-touch follow-up sequencer",
      "Reply parser / inbox tagging (manual or assisted)",
      "Link replies back to center fee records",
      "Suppression list and bounce handling",
    ],
  },
  {
    id: "09",
    slug: "pending-verification-center-listings",
    title: "Publish pending verification official center listings",
    category: "Fees & Test Centers",
    summary:
      "List official center info and booking links marked pending verification / submit update even before a reply to capture local search traffic and prompt centers to share data.",
    tools: [
      "Listing status: pending_verification | verified | disputed",
      "SEO-indexable center pages with clear pending badge",
      "Submit update form for centers and users",
      "Official booking URL field",
      "Claim / verify this listing CTA for centers",
      "Sitemap inclusion for pending listings",
      "Moderation queue for submitted updates",
    ],
  },
  {
    id: "10",
    slug: "crowdsourced-price-date-link-verification",
    title: "Crowdsourced price, date & link verification",
    category: "Fees & Test Centers",
    summary:
      "Let users and centers submit updates or flag broken links (with contributor credit or easy update workflows).",
    tools: [
      "Flag broken link / wrong price / wrong date forms",
      "Contributor credit display (optional handle)",
      "Easy update workflow for centers (tokenized edit link)",
      "Review/approve pipeline before publish",
      "Diff view: old vs proposed values",
      "Anti-spam / rate limit",
      "Thank-you + credit email",
    ],
  },
  {
    id: "11",
    slug: "score-readiness-calculators",
    title: "Interactive score & readiness calculators",
    category: "SEO Tools & Calculators",
    summary:
      "Free tools like a CLB/NCLC & CRS points calculator or a How many weeks from Level X to Level Y? readiness estimator funneling into pre-filled study plans.",
    tools: [
      "CLB/NCLC converter UI",
      "CRS / language points estimator",
      "Weeks from Level X to Y readiness estimator",
      "Shareable result URL + embeddable snippet",
      "CTA: load pre-filled study plan from calculator output",
      "Assumptions / methodology disclosure",
      "Print / PDF result (optional)",
      "SEO landing + schema for each calculator",
    ],
  },
  {
    id: "12",
    slug: "level-timeline-study-plan-pages",
    title: "High-intent level + timeline study plan pages",
    category: "SEO Tools & Calculators",
    summary:
      "Dedicated pages for specific exam/level/timeframe combinations with 1-click plan loading.",
    tools: [
      "Programmatic page matrix: exam x level x timeframe",
      "1-click Load this plan into try-first / account",
      "Canonical plan snapshot embedded on page",
      "Internal links between related combinations",
      "Sitemap generator for the matrix",
      "Last-updated and official-source citations",
    ],
  },
  {
    id: "13",
    slug: "exam-score-comparison-pages",
    title: "Side-by-side exam & score comparison pages",
    category: "SEO Tools & Calculators",
    summary:
      "Structured comparison tables (e.g. TEF Canada vs TCF Canada, band/score equivalencies) for SEO and AI citations.",
    tools: [
      "Comparison table component (exam A vs B)",
      "Score / band equivalency tables with sources",
      "Citation-friendly structured data / FAQ schema",
      "Pair pages: TEF vs TCF, IELTS vs TOEFL, etc.",
      "Disclaimer: not affiliated; verify with official boards",
      "Export CSV of equivalencies for transparency",
    ],
  },
  {
    id: "14",
    slug: "value-first-community-participation",
    title: "Value-first participation in study & immigration communities",
    category: "Community & Partnerships",
    summary:
      "Genuine answers, schedules, and official resource breakdowns in Reddit, Facebook, Telegram/WhatsApp, and Discord communities.",
    tools: [
      "Community outreach tracker (platform, thread, status)",
      "Answer / resource snippet library (non-spammy)",
      "Shareable plan + official link packs",
      "Disclosure checklist for each post",
      "Weekly participation cadence board",
      "Outcomes log: helpful replies, referral traffic",
    ],
  },
  {
    id: "15",
    slug: "booking-through-platform",
    title: "Booking through the platform",
    category: "Booking & Conversion",
    summary:
      "Tracked partner/referral booking links (where available) or direct official links, paired with a pre-booking checklist and post-booking study plan handoff, plus selective direct center booking later.",
    tools: [
      "Tracked referral / UTM booking link wrapper",
      "Fallback: direct official booking links",
      "Pre-booking checklist (ID, passport, fees, deadlines)",
      "Post-booking handoff: attach exam date to study plan",
      "Booking status: researching | booked | completed",
      "Future: selective direct center booking adapter",
      "Disclosure when affiliate/referral applies",
    ],
  },
  {
    id: "16",
    slug: "broad-partnership-ecosystem",
    title: "Broad partnership ecosystem (skipping exam makers for now)",
    category: "Community & Partnerships",
    summary:
      "Partner with radios/podcasts, blogs, schools, tutors/creators, immigration advisors, student clubs, open-source/EdTech tools, communities, and events - with authentic badges and clear disclosures. Skip exam makers for now.",
    tools: [
      "Partner CRM (type, contact, stage, disclosure)",
      "Partner / contributor / community badges",
      "Disclosure templates",
      "Partner directory page (optional public)",
      "Co-marketing asset kit (logos, blurbs, UTMs)",
      "Exclusion rule: exam makers out of scope for now",
      "Event / webinar collaboration checklist",
    ],
  },
  {
    id: "17",
    slug: "university-email-discount-checker",
    title: "University email & institutional discount/perk checker",
    category: "University & Student Deals",
    summary:
      "Let students enter their university email (or pick university/domain) to surface hidden institutional/center exam discounts, eligibility notes, partner/voucher offers, and student study perks alongside standard city prices and study-plan CTAs.",
    tools: [
      "University / email-domain picker",
      "Domain verification (optional magic link)",
      "Discount / perk catalog by institution",
      "Eligibility notes + voucher offer display",
      "Side-by-side with standard city fee prices",
      "Study-plan CTA after perk result",
      "Privacy: minimal retention of student emails",
      "Admin CRUD for institutional deals",
    ],
  },
  {
    id: "18",
    slug: "university-direct-outreach",
    title: "Direct outreach to universities for student deals",
    category: "University & Student Deals",
    summary:
      "Email university language centers (such as CLAs), international relations/mobility offices, and student services/welfare offices to uncover non-public exam discounts, vouchers, or agreements.",
    tools: [
      "University contact database (CLA, IR, student services)",
      "Outreach templates per office type",
      "Send / follow-up queue",
      "Deal capture form linked to discount checker",
      "Status: contacted | replied | deal live | declined",
      "Evidence vault (no secrets in git; store refs only)",
    ],
  },
  {
    id: "19",
    slug: "erasmus-esn-deals-visibility",
    title: "Erasmus office & ESN chapter deals and visibility",
    category: "University & Student Deals",
    summary:
      "Reach out to Erasmus/international mobility offices and ESN chapters for mobility-specific or ESN member discounts/vouchers; tag deal scope; tie to mobility-deadline study plans; join pre-departure sessions or resource lists.",
    tools: [
      "ESN / Erasmus office contact list",
      "Deal scope tags: University-Wide | Erasmus/Mobility | ESN Member",
      "Mobility-deadline study plan presets",
      "Resource-list / pre-departure session pitch kit",
      "Visibility badges on deal pages",
      "Outreach + reply tracker",
    ],
  },
  {
    id: "20",
    slug: "bank-student-credit-financing-partnerships",
    title: "Bank & student-credit / financing partnerships for visa-approved high scorers",
    category: "Financing & Perks",
    summary:
      "Explore partnerships with student-friendly banks, youth/international banking, or education lenders for priority pathways, credit-building/starter products, or financing for candidates with approved visas and top-tier/C2 credentials - positioned realistically with underwriting and compliance rules.",
    tools: [
      "Partner exploration CRM (banks, lenders)",
      "Eligibility gate UI: visa-approved + score tier",
      "Compliance / underwriting disclaimer blocks",
      "Lead handoff form to partner (consent-based)",
      "Realistic positioning copy guidelines",
      "Legal review checklist before any public offer",
    ],
  },
  {
    id: "21",
    slug: "local-community-radio-segments",
    title: "Local & community radio exam prep & mobility segments",
    category: "Media & Distribution",
    summary:
      "Short radio segments or call-ins on exam timelines, study routines, and student exam/mobility perks that earn show-note links and local listener reach.",
    tools: [
      "Radio/podcast target list + contact tracker",
      "Segment script library (timelines, routines, perks)",
      "Show-notes link pack (canonical URLs)",
      "UTM / vanity URLs for on-air mentions",
      "Recording / clip archive refs",
      "Post-air backlink confirmation checklist",
    ],
  },
  {
    id: "22",
    slug: "relocation-study-abroad-job-board-partners",
    title: "Relocation portals, study-abroad directories & international job/internship boards",
    category: "Media & Distribution",
    summary:
      "Partner with sites covering visas, relocation, or international roles so they link to openexamhub.org when candidates need a target language score or prep plan.",
    tools: [
      "Partner directory of portals/boards",
      "Embeddable score-need / plan CTA widget",
      "Co-branded landing for each vertical",
      "Referral tracking",
      "Pitch one-pager for relocation / study-abroad / jobs",
    ],
  },
  {
    id: "23",
    slug: "study-tool-creator-starter-kits",
    title: "Non-competing study-tool & creator starter kit pairings",
    category: "Community & Partnerships",
    summary:
      "Cross-link or co-create starter kits with standalone vocabulary, flashcard, pronunciation, or listening creators/tools paired with free daily study schedules.",
    tools: [
      "Starter kit page template (schedule + partner tools)",
      "Partner tool allowlist (non-competing only)",
      "Cross-link / reciprocal link tracker",
      "Co-create brief + asset checklist",
      "Disclosure of partner relationships",
    ],
  },
  {
    id: "24",
    slug: "tiered-score-milestone-perks",
    title: "Tiered score-milestone perks (B2/C1 stepping stones up to C2 + visa)",
    category: "Financing & Perks",
    summary:
      "Pair top-tier C2 + approved-visa banking/credit perks with earlier B2/C1 milestones so more learners get meaningful rewards along the way.",
    tools: [
      "Milestone ladder: B2 | C1 | C2 (+ visa flag)",
      "Perk catalog per milestone",
      "Unlock rules + evidence of score (self-attest or upload)",
      "Progress celebration UI",
      "Clear separation from paid tutoring upsell",
      "Fraud / abuse review for high-value perks",
    ],
  },
  {
    id: "25",
    slug: "student-union-handbooks-orientation-kits",
    title: "Student-union handbooks & semester orientation resource kits",
    category: "University & Student Deals",
    summary:
      "Get openexamhub.org added to student-union welcome guides, society resource lists, and orientation handouts each semester for recurring backlinks and student signups.",
    tools: [
      "Student union / society contact CRM",
      "Printable one-pager + QR to plan generator",
      "Orientation resource kit PDF",
      "Semester cadence reminders (outreach calendar)",
      "Backlink confirmation log",
      "UTM landing for orientation traffic",
    ],
  },
  {
    id: "26",
    slug: "c2-psychometric-tutoring-pipeline",
    title: "C2 + psychometric screening pipeline into paid immersive tutoring platform",
    category: "Monetization & Adjacent Platform",
    summary:
      "Invite openexamhub.org account holders who achieve a C2 exam level - and pass a short psychometric interview/assessment - to become tutors on the paid, unconventional book-and-immersion language platform.",
    tools: [
      "C2 achievement detection / self-report + proof upload",
      "Psychometric interview/assessment short form",
      "Invite / waitlist pipeline UI",
      "Handoff API or secure link to paid tutoring platform",
      "Consent and data-sharing disclosure",
      "Admin approve/reject tutor candidates",
      "Status: eligible | invited | assessed | accepted | declined",
    ],
  },
  {
    id: "27",
    slug: "supporter-tips-sponsorships",
    title: "Fast-setup supporter tips, open-source sponsorships & aligned small sponsors",
    category: "Monetization & Adjacent Platform",
    summary:
      "Enable quick tipping/sponsorship rails (GitHub Sponsors, Ko-fi, or Buy Me a Coffee) and clear, non-intrusive small sponsorships to cover running costs while keeping the core planner free.",
    tools: [
      "Tip / sponsor CTA block (non-intrusive)",
      "Integrations: GitHub Sponsors, Ko-fi, Buy Me a Coffee links",
      "Small sponsor slot policy + disclosure",
      "Expenses transparency page (optional)",
      "Keep core planner free enforcement checklist",
      "Revenue note linking larger $ to paid platform/partnerships",
    ],
  },
  {
    id: "28",
    slug: "kickstarter-tiered-immersive-access",
    title: "Kickstarter campaign with tiered access to paid immersive platform",
    category: "Monetization & Adjacent Platform",
    summary:
      "Finish building/polishing the paid immersive platform and run a Kickstarter campaign rewarding backers with 1-, 2-, 3-year, or capped lifetime access tiers while keeping openexamhub.org free and open.",
    tools: [
      "Immersive platform readiness checklist",
      "Kickstarter tier definitions (1y / 2y / 3y / lifetime cap)",
      "Campaign page assets + demo video brief",
      "Backer fulfillment / access provisioning tool",
      "Keep openexamhub.org free & open guardrail",
      "Pre-launch waitlist sync (see IDEA-31)",
    ],
  },
  {
    id: "29",
    slug: "active-outreach-over-passive-waiting",
    title: "Active outreach over passive waiting (tips & EU grants realism)",
    category: "Strategy & Launch",
    summary:
      "Avoid leaving the project sitting passively hoping for random tips or slow institutional/EU grants; actively pursue faster revenue/distribution channels and show visible progress to attract supporters.",
    tools: [
      "Weekly active-outreach scoreboard",
      "Channel priority matrix (fast vs slow capital)",
      "Public progress / changelog feed",
      "Grant tracker (optional, not blocking)",
      "Kill passive-only tactics checklist",
    ],
  },
  {
    id: "30",
    slug: "zero-audience-prelaunch-borrow-attention",
    title: "Zero-audience pre-launch strategy (borrow attention & proof first)",
    category: "Strategy & Launch",
    summary:
      "Treat starting with zero audience as a pre-launch phase - use free tools/answers to borrow existing communities and partner audiences rather than launching a cold Kickstarter without pre-launch demand.",
    tools: [
      "Pre-launch phase checklist",
      "Borrow-attention playbook (communities, partners)",
      "Proof artifacts: free tools, answers, fee pages live",
      "Cold Kickstarter block rule until demand signals met",
      "Demand signal dashboard (emails, shares, backlinks)",
    ],
  },
  {
    id: "31",
    slug: "early-bird-waitlist-capture",
    title: "Early-bird / waitlist capture before any crowdfunding push",
    category: "Strategy & Launch",
    summary:
      "Collect high-intent emails from genuinely interested learners/supporters on a pre-launch page and set a realistic funding goal before launching a campaign.",
    tools: [
      "Pre-launch / waitlist landing page",
      "Email capture + double opt-in",
      "Segment: learner vs supporter vs tutor-candidate",
      "Funding goal calculator worksheet",
      "Waitlist count + conversion metrics",
      "Export to campaign tools (CSV)",
    ],
  },
  {
    id: "32",
    slug: "new-platform-tool-reviewer-outreach",
    title: "Outreach to new platform / new tool reviewers",
    category: "Media & Distribution",
    summary:
      "Pitch creators, newsletters, and reviewers who spotlight new tools - prioritizing education/study reviewers while also targeting general new-app/productivity/indie-tool reviewers with a clear hook and friction-free demo.",
    tools: [
      "Reviewer CRM (edu-first + general indie/productivity)",
      "Pitch templates + clear hook",
      "Friction-free demo account / shareable preview",
      "Press kit (screenshots, one-liner, FAQs)",
      "Follow-up sequencer",
      "Coverage log + backlink capture",
    ],
  },
  {
    id: "33",
    slug: "kickstarter-not-fallback-backlink-play",
    title: "Don't rely on Kickstarter as a fallback backlink play",
    category: "Strategy & Launch",
    summary:
      "Unsuccessful Kickstarter pages are typically hidden or noindexed from search, so treat backlinks from niche blogs, podcasts, universities/ESN, and directories as the primary link strategy - using any campaign PR to earn external links that persist either way.",
    tools: [
      "Primary backlink strategy board (blogs, podcasts, uni/ESN, directories)",
      "Campaign PR → persistent external link checklist",
      "Do-not-count Kickstarter as SEO asset rule",
      "Link inventory separate from crowdfunding status",
      "Post-campaign link persistence audit",
    ],
  },
  {
    id: "34",
    slug: "backlink-stacking-google-footprint",
    title: "Backlink stacking + Google footprint trust strategy",
    category: "Strategy & Launch",
    summary:
      "Aim for a steady base of relevant external mentions and backlinks (early milestones like 10-15+ real links across blogs, podcasts/radios, directories, and student/school pages) anchored to link-worthy reference pages (calculators, fee tables, timelines, comparisons) so people Googling the project see real activity and trust signals.",
    tools: [
      "Backlink inventory tracker (source, type, live URL)",
      "Milestone goals: 10, 15+ quality links",
      "Link-worthy page kit: calculators, fees, timelines, comparisons",
      "Google footprint checklist (brand SERP review)",
      "Mention monitoring (manual or alerts)",
      "Trust signal report for supporters/partners",
    ],
  },
];

function enrich(idea) {
  const meta = META[idea.id] || {
    phase: "later",
    priority: "P2",
    workType: "product",
    impact: "M",
    effort: "M",
    dependsOn: [],
  };
  return {
    id: `IDEA-${idea.id}`,
    slug: idea.slug,
    title: idea.title,
    category: idea.category,
    status: "pending",
    phase: meta.phase,
    priority: meta.priority,
    workType: meta.workType,
    impact: meta.impact,
    effort: meta.effort,
    dependsOn: meta.dependsOn,
    toolCount: idea.tools.length,
    file: `IDEA-${idea.id}-${idea.slug}.md`,
    summary: idea.summary,
    tools: idea.tools,
  };
}

function page(idea, meta) {
  const tools = idea.tools.map((t) => `- [ ] ${t}`).join("\n");
  const deps = (meta.dependsOn || []).length
    ? meta.dependsOn.join(", ")
    : "none";
  return `# IDEA-${idea.id}: ${idea.title}

**ID:** IDEA-${idea.id}  
**Slug:** \`${idea.slug}\`  
**Category:** ${idea.category}  
**Phase:** ${meta.phase}  
**Priority:** ${meta.priority}  
**Work type:** ${meta.workType}  
**Impact / effort:** ${meta.impact} / ${meta.effort}  
**Depends on:** ${deps}  
**Status:** pending  
**Exhaustion:** 0 / ${idea.tools.length} tools complete

## Intent (full detail)

${idea.summary}

## Tools required to fully exhaust this idea

Use this checklist. An idea is **exhausted** only when every tool below exists (or is explicitly marked \`wont-do\` with a dated reason in the tracker).

${tools}

## Exhaustion criteria

- [ ] Every tool above is built, documented, or \`wont-do\` with reason
- [ ] UX flow documented: start → action → result (including empty/error/success)
- [ ] Desktop-first layout considered if the idea has a user-facing surface
- [ ] Data model / storage needs listed (or N/A) and linked from implementation notes
- [ ] Official-link / copyright / disclosure rules respected
- [ ] Related ideas cross-linked and dependencies noted

## Related ideas

See [README.md](./README.md) category **${idea.category}**.

## Implementation notes

_Add dated notes here as work proceeds. Do not store secrets._

## Change log

| Date | Note |
|------|------|
| 2026-11-24 | Idea page created from full 34-idea conversation dump. |
| 2026-11-24 | Execution metadata added (phase, priority, workType, dependsOn). |
`;
}

fs.mkdirSync(root, { recursive: true });

const enriched = ideas.map(enrich);

const indexRows = enriched
  .map(
    (i) =>
      `| ${i.id} | [${i.title}](./${i.file}) | ${i.phase} | ${i.priority} | ${i.workType} | ${i.category} | pending | 0/${i.toolCount} |`
  )
  .join("\n");

const byCat = {};
for (const i of enriched) {
  (byCat[i.category] ||= []).push(i);
}
const catSections = Object.entries(byCat)
  .map(([cat, list]) => {
    const items = list
      .map((i) => `- [${i.id}: ${i.title}](./${i.file}) (${i.phase} / ${i.priority})`)
      .join("\n");
    return `### ${cat}\n\n${items}`;
  })
  .join("\n\n");

const byPhase = { now: [], next: [], later: [], adjacent: [] };
for (const i of enriched) {
  (byPhase[i.phase] || byPhase.later).push(i);
}
const phaseSections = ["now", "next", "later", "adjacent"]
  .map((ph) => {
    const items = (byPhase[ph] || [])
      .map((i) => `- [${i.id}: ${i.title}](./${i.file}) (${i.priority}, ${i.workType})`)
      .join("\n");
    return `### ${ph}\n\n${items || "_none_"}`;
  })
  .join("\n\n");

const readme = `# OpenExam Hub idea exhaustion pages

**Not part of the live website.** Repo planning docs only. Each idea has a dedicated page listing the **tools** required so the idea can be fully exhausted (built, verified, or explicitly deferred).

**Cockpit UI:** [../growth/ideas.html](../growth/ideas.html) (local tracker)  
**Canonical site:** https://openexamhub.org  
**Tracker:** [../../PROJECT_TRACKER.md](../../PROJECT_TRACKER.md)

## How to use

1. Open the Ideas board in the local growth tracker (default filter: **Now**).
2. Expand an idea, check off tools, add notes.
3. When all tools are done (or \`wont-do\` with reason), set status to \`exhausted\`.
4. Markdown pages here are the deep spec; the HTML board is the execution cockpit.

## Phases

- **now** - Wave 1 / do this week (P0 free-tool and trust work)
- **next** - after Wave 1 foundations
- **later** - valuable but not blocking launch
- **adjacent** - paid platform, Kickstarter, banking (do not compete with core free tools)

## Index (all 34)

| ID | Idea | Phase | Priority | Type | Category | Status | Tools |
|----|------|-------|----------|------|----------|--------|-------|
${indexRows}

## By phase

${phaseSections}

## By category

${catSections}

## Regenerating / editing

\`\`\`bash
node scripts/generate-idea-pages.mjs
\`\`\`

Re-running refreshes \`ideas.json\`, \`docs/growth/ideas.json\`, and \`README.md\`. Existing \`IDEA-*-*.md\` files are **not** overwritten (keeps implementation notes). Missing pages are created. Keep IDs stable (IDEA-01 … IDEA-34).
`;

fs.writeFileSync(path.join(root, "README.md"), readme, "utf8");

let created = 0;
let skipped = 0;
for (const idea of ideas) {
  const file = path.join(root, `IDEA-${idea.id}-${idea.slug}.md`);
  if (fs.existsSync(file)) {
    skipped += 1;
    continue;
  }
  const meta = META[idea.id] || {};
  fs.writeFileSync(file, page(idea, meta), "utf8");
  created += 1;
}

const payload = {
  generatedAt: new Date().toISOString().slice(0, 10),
  count: enriched.length,
  wave1: enriched.filter((i) => i.phase === "now" && i.priority === "P0").map((i) => i.id),
  ideas: enriched,
};
const json = JSON.stringify(payload, null, 2);
fs.writeFileSync(path.join(root, "ideas.json"), json, "utf8");
fs.writeFileSync(path.join(__dirname, "..", "docs", "growth", "ideas.json"), json, "utf8");

console.log(`Wrote ideas.json (${enriched.length}) + README → ${root}`);
console.log(`Markdown: created ${created}, skipped existing ${skipped}`);
console.log("Also copied ideas.json → docs/growth/ideas.json for the tracker UI");
console.log(`Wave 1 (now/P0): ${payload.wave1.join(", ")}`);
