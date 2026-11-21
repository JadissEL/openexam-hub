import React from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { SiteHeader, SiteFooter } from '../landing/SiteChrome.jsx';
import { ink, muted, eyebrow, lead, pageFont } from '../landing/theme.js';
import { EXAM_PAGES, EXAMS_INDEX } from './site.js';
import { examContent } from './examContent.js';
import { planPage, planPath, plansForGuide } from './planPages.js';

function formatDate(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function Shell({ children }) {
  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1A1714] antialiased" style={pageFont}>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  );
}

export function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="text-[14px] text-[#6B635A]">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((item, i) => (
          <li key={item.path} className="flex items-center gap-2">
            {i > 0 ? <span aria-hidden="true">/</span> : null}
            {i === items.length - 1 ? (
              <span aria-current="page">{item.name}</span>
            ) : (
              <a href={item.path} className="text-[#C2410C] underline underline-offset-4">{item.name}</a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function examBreadcrumbs(page) {
  const items = [
    { name: 'Home', path: '/' },
    { name: 'Exams', path: '/exams' }
  ];
  if (page) items.push({ name: page.label, path: `/exams/${page.slug}` });
  return items;
}

function relatedPosts(posts, tags) {
  return (posts || []).filter((p) => !p.draft && (p.exams || []).some((e) => tags.includes(e)));
}

function SectionTitle({ id, children }) {
  return (
    <h2 id={id} className={`font-display ${ink} text-[28px] sm:text-[34px] tracking-[-0.02em] font-medium`}>
      {children}
    </h2>
  );
}

function FormatTable({ format }) {
  if (!format?.sections?.length) return null;
  return (
    <section aria-labelledby="format-title" className="mt-14">
      <SectionTitle id="format-title">Official format</SectionTitle>
      <div className="mt-5 overflow-x-auto rounded-2xl border border-[#E7E1D7] bg-white/70">
        <table className="w-full text-left text-[15px] leading-snug">
          <thead className="bg-[#F1EDE5] text-[#3B352F]">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Paper</th>
              <th scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">Time</th>
              <th scope="col" className="px-4 py-3 font-semibold">Items</th>
              <th scope="col" className="px-4 py-3 font-semibold">What it involves</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E7E1D7]">
            {format.sections.map((s) => (
              <tr key={s.name}>
                <th scope="row" className={`px-4 py-3 font-semibold ${ink} align-top`}>{s.name}</th>
                <td className="px-4 py-3 align-top whitespace-nowrap">{s.duration}</td>
                <td className="px-4 py-3 align-top">{s.items}</td>
                <td className={`px-4 py-3 align-top ${muted}`}>{s.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {format.scoring ? <p className={`mt-5 text-[16px] leading-[1.7] ${muted} max-w-3xl`}><strong className={ink}>Scoring.</strong> {format.scoring}</p> : null}
      {format.notes ? <p className={`mt-3 text-[16px] leading-[1.7] ${muted} max-w-3xl`}>{format.notes}</p> : null}
      {format.sourceUrl ? (
        <p className="mt-3 text-[14px] text-[#6B635A]">
          Source: <a href={format.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[#C2410C] underline underline-offset-4 break-all">{format.sourceUrl}</a>
        </p>
      ) : null}
    </section>
  );
}

function DeleLevels({ rows, scoring }) {
  if (!rows?.length) return null;
  return (
    <section aria-labelledby="levels-title" className="mt-14">
      <SectionTitle id="levels-title">Papers and timings by level</SectionTitle>
      <div className="mt-5 overflow-x-auto rounded-2xl border border-[#E7E1D7] bg-white/70">
        <table className="w-full text-left text-[15px] leading-snug">
          <thead className="bg-[#F1EDE5] text-[#3B352F]">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Level</th>
              <th scope="col" className="px-4 py-3 font-semibold">Papers</th>
              <th scope="col" className="px-4 py-3 font-semibold whitespace-nowrap">Exam time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E7E1D7]">
            {rows.map((r) => (
              <tr key={r.level}>
                <th scope="row" className={`px-4 py-3 font-semibold ${ink} align-top`}>DELE {r.level}</th>
                <td className={`px-4 py-3 align-top ${muted}`}>{r.sections.join(' · ')}</td>
                <td className="px-4 py-3 align-top whitespace-nowrap">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`mt-3 text-[14px] text-[#6B635A] max-w-3xl`}>
        Exam time adds up the papers and does not include the preparation time before the oral test.
      </p>
      {scoring ? <p className={`mt-5 text-[16px] leading-[1.7] ${muted} max-w-3xl`}><strong className={ink}>Result.</strong> {scoring}</p> : null}
    </section>
  );
}

function Resources({ groups, lastChecked }) {
  if (!groups?.length) return null;
  const checked = formatDate(lastChecked);
  return (
    <section aria-labelledby="resources-title" className="mt-14">
      <SectionTitle id="resources-title">Free official material</SectionTitle>
      <p className={`mt-3 text-[16px] ${muted} max-w-3xl`}>
        Every link goes to the exam body, a public broadcaster or another official source. We don’t host or copy any of it.
        {checked ? ` Links last checked ${checked}.` : ''}
      </p>
      <div className="mt-6 grid gap-8 md:grid-cols-2">
        {groups.map((g) => (
          <div key={g.category}>
            <h3 className={`text-[13px] font-semibold uppercase tracking-[0.14em] text-[#9A3412]`}>{g.category}</h3>
            <ul className="mt-3 space-y-3 text-[16px] leading-snug">
              {g.items.map((r) => (
                <li key={r.url}>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]">
                    {r.title}
                  </a>
                  <span className="block text-[14px] text-[#6B635A]">
                    {r.org}{r.levels?.length ? ` · ${r.levels.join(', ')}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

function Faq({ faq }) {
  if (!faq?.length) return null;
  return (
    <section aria-labelledby="exam-faq-title" className="mt-14">
      <SectionTitle id="exam-faq-title">Questions people ask</SectionTitle>
      <div className="mt-4 divide-y divide-[#E7E1D7] border-y border-[#E7E1D7] max-w-3xl">
        {faq.map((item) => (
          <details key={item.q} className="group py-5">
            <summary className={`cursor-pointer list-none font-semibold text-[17px] sm:text-lg ${ink} [&::-webkit-details-marker]:hidden flex items-start justify-between gap-4`}>
              {item.q}
              <span className="text-[#C2410C] group-open:rotate-45 transition-transform text-xl leading-none" aria-hidden="true">+</span>
            </summary>
            <p className={`mt-3 pr-8 text-[16px] leading-[1.7] ${muted}`}>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function PlannerCta({ planner, label, relatedPlanner }) {
  const cta = planner || relatedPlanner;
  return (
    <section aria-labelledby="plan-title" className="mt-14 rounded-3xl bg-[#1A1714] text-white px-6 sm:px-8 py-8 sm:py-10">
      <h2 id="plan-title" className="font-display text-[28px] sm:text-[32px] tracking-[-0.02em] font-medium">
        {planner
          ? `Turn this into a ${planner.label} study plan`
          : `Personalised ${label} plans are coming soon`}
      </h2>
      <p className="mt-3 text-[16px] sm:text-[17px] leading-relaxed text-[#D9D2C8] max-w-xl">
        {planner
          ? 'OpenExam Hub builds a free day-by-day plan from official, free material like the links on this page. Pick your level and exam date. Free account, no paywall.'
          : relatedPlanner
            ? `The official material above is free to use now. Until a ${label} plan is ready, you can build a ${relatedPlanner.label} plan — it uses many of the same official sources.`
            : `The planner doesn’t cover ${label} yet. The official material above is free to use now.`}
      </p>
      <a
        href={cta ? `/app?exam=${encodeURIComponent(cta.exam)}` : '/app'}
        className="mt-6 inline-flex items-center gap-2 h-12 px-6 rounded-full bg-[#C2410C] hover:bg-[#9A3412] text-white font-semibold"
      >
        {planner ? `Build a free ${planner.label} plan` : relatedPlanner ? `Build a free ${relatedPlanner.label} plan` : 'Open the planner'} <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </a>
    </section>
  );
}

function RelatedReading({ posts, related }) {
  return (
    <section aria-labelledby="related-title" className="mt-14 grid gap-10 md:grid-cols-2">
      <div>
        <h2 id="related-title" className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>From the blog</h2>
        {posts.length ? (
          <ul className="mt-4 space-y-3 text-[16px] leading-snug">
            {posts.map((p) => (
              <li key={p.slug}>
                <a href={p.url} className="text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]">{p.title}</a>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`mt-4 text-[16px] ${muted}`}>
            No articles on this exam yet. <a href="/blog" className="text-[#C2410C] underline underline-offset-4">Browse the blog</a>.
          </p>
        )}
      </div>
      <div>
        <h2 className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>Related exam guides</h2>
        <ul className="mt-4 space-y-3 text-[16px] leading-snug">
          {related.map((r) => (
            <li key={r.slug}>
              <a href={`/exams/${r.slug}`} className="text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]">{r.label}</a>
            </li>
          ))}
          <li>
            <a href="/exams" className="text-[#C2410C] underline underline-offset-4">All exam guides</a>
          </li>
        </ul>
      </div>
    </section>
  );
}

function StudyPlans({ guide }) {
  const plans = plansForGuide(guide);
  if (!plans.length) return null;
  return (
    <section aria-labelledby="study-plans-title" className="mt-14">
      <SectionTitle id="study-plans-title">Free study plans</SectionTitle>
      <ul className="mt-5 grid gap-5 sm:grid-cols-2">
        {plans.map((p) => (
          <li key={p.slug} className="rounded-2xl border border-[#E7E1D7] bg-white/70 p-6">
            <h3 className={`font-display ${ink} text-[22px] tracking-[-0.02em] font-medium`}>
              <a href={planPath(p)} className="hover:text-[#C2410C]">{p.label}</a>
            </h3>
            <p className={`mt-2 text-[16px] leading-[1.6] ${muted}`}>{p.description}</p>
            <p className="mt-4 text-[15px]">
              <a href={planPath(p)} className="inline-flex items-center gap-1.5 font-semibold text-[#C2410C] underline underline-offset-4">
                Open the {p.duration} plan <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </a>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function planBreadcrumbs(plan) {
  const guide = EXAM_PAGES.find((g) => g.slug === plan.guide);
  return [
    { name: 'Home', path: '/' },
    { name: 'Exams', path: '/exams' },
    { name: guide ? guide.label : plan.guide, path: `/exams/${plan.guide}` },
    { name: plan.breadcrumb, path: planPath(plan) }
  ];
}

function relatedLinks(plan) {
  return (plan.related || [])
    .map((r) => {
      if (r.type === 'plan') {
        const p = planPage(r.guide, r.slug);
        return p ? { href: planPath(p), label: p.label } : null;
      }
      const g = EXAM_PAGES.find((x) => x.slug === r.guide);
      return g ? { href: `/exams/${g.slug}`, label: `${g.label} guide` } : null;
    })
    .filter(Boolean);
}

function LinkList({ links }) {
  if (!links?.length) return null;
  return (
    <span className="mt-1 block text-[15px]">
      {links.map((l, i) => (
        <React.Fragment key={l.url}>
          {i > 0 ? <span className="text-[#6B635A]"> · </span> : null}
          <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-[#C2410C] underline underline-offset-4">{l.label}</a>
        </React.Fragment>
      ))}
    </span>
  );
}

export function PlanPage({ guide, slug, posts = [] }) {
  const plan = planPage(guide, slug);
  if (!plan) return null;
  const guidePage = EXAM_PAGES.find((g) => g.slug === plan.guide);
  const blogPosts = relatedPosts(posts, plan.tags);
  const checked = formatDate(plan.lastChecked);
  const related = relatedLinks(plan);
  return (
    <Shell>
      <article className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 sm:pt-16 pb-24">
        <Breadcrumbs items={planBreadcrumbs(plan)} />
        <header className="mt-6 max-w-3xl">
          <p className={eyebrow}>Study plan · {plan.duration} · {plan.level}</p>
          <h1 className={`mt-4 font-display ${ink} text-[38px] sm:text-5xl lg:text-6xl tracking-[-0.03em] font-medium leading-[1.05]`}>{plan.h1}</h1>
          <p className={`mt-6 ${lead}`}>{plan.subhead}</p>
          {checked ? <p className="mt-4 text-[14px] text-[#6B635A]">Last checked against the official sources: <time dateTime={plan.lastChecked}>{checked}</time></p> : null}
        </header>

        <section aria-labelledby="who-title" className="mt-12 max-w-3xl">
          <SectionTitle id="who-title">Who this plan is for</SectionTitle>
          <ul className={`mt-4 list-disc pl-5 space-y-2 text-[17px] leading-[1.7] ${muted}`}>
            {plan.whoFor.map((t) => <li key={t.slice(0, 40)}>{t}</li>)}
          </ul>
        </section>

        <section aria-labelledby="facts-title" className="mt-14 max-w-4xl">
          <SectionTitle id="facts-title">The exam at a glance</SectionTitle>
          <dl className="mt-4 divide-y divide-[#E7E1D7] border-y border-[#E7E1D7]">
            {plan.facts.map(([k, v]) => (
              <div key={k} className="py-4 grid sm:grid-cols-[14rem_1fr] gap-1 sm:gap-6">
                <dt className={`${ink} font-semibold text-[16px]`}>{k}</dt>
                <dd className={`text-[16px] leading-[1.6] ${muted}`}>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[14px] text-[#6B635A]">{plan.factsNote} Full details in the <a href={`/exams/${plan.guide}`} className="text-[#C2410C] underline underline-offset-4">{guidePage ? guidePage.label : plan.guide} guide</a>.</p>
        </section>

        <section aria-labelledby="schedule-title" className="mt-14 max-w-4xl">
          <SectionTitle id="schedule-title">The plan</SectionTitle>
          <ol className="mt-6 space-y-10">
            {plan.phases.map((ph, i) => (
              <li key={ph.title}>
                <h3 id={`phase-${i + 1}`} className={`font-display ${ink} text-[22px] sm:text-[24px] tracking-[-0.02em] font-medium`}>{ph.title}</h3>
                <p className={`mt-1 text-[16px] ${muted}`}>{ph.focus}</p>
                <ul className="mt-4 divide-y divide-[#E7E1D7] border-y border-[#E7E1D7]">
                  {ph.tasks.map((t) => (
                    <li key={t.when} className="py-4 grid sm:grid-cols-[9rem_1fr] gap-1 sm:gap-6">
                      <span className={`${ink} font-semibold text-[16px]`}>{t.when}</span>
                      <span className={`text-[16px] leading-[1.65] ${muted}`}>
                        {t.text}
                        <LinkList links={t.links} />
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          <p className={`mt-8 rounded-2xl border border-[#E7C9B4] bg-[#FBF1E9] px-5 py-4 text-[16px] leading-[1.6] text-[#3B352F]`}>{plan.caution}</p>
        </section>

        <section aria-labelledby="materials-title" className="mt-14 max-w-3xl">
          <SectionTitle id="materials-title">Free material used in this plan</SectionTitle>
          <p className={`mt-3 text-[16px] ${muted}`}>Every link goes to the exam body, a public broadcaster or a government site. We don’t host or copy any of it.</p>
          <ul className="mt-4 space-y-3 text-[16px] leading-snug">
            {plan.materials.map((m) => (
              <li key={m.url}>
                <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]">{m.label}</a>
              </li>
            ))}
          </ul>
        </section>

        <Faq faq={plan.faq} />

        <section aria-labelledby="sources-title" className="mt-14 pt-10 border-t border-[#E7E1D7] max-w-3xl">
          <h2 id="sources-title" className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>Sources</h2>
          <ol className="mt-4 space-y-2 text-[16px] leading-snug">
            {plan.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[#C2410C] underline underline-offset-4 break-words">
                  {s.label} <ArrowUpRight className="inline w-3.5 h-3.5" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[14px] text-[#6B635A]">
            {checked ? `Last checked ${checked}. ` : ''}Exam rules, score tables, fees and dates change. Always confirm on the official site before you book or apply. OpenExam Hub is independent and not affiliated with any exam body or government.
          </p>
        </section>

        <section aria-labelledby="related-title" className="mt-14 grid gap-10 md:grid-cols-2">
          <div>
            <h2 id="related-title" className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>From the blog</h2>
            {blogPosts.length ? (
              <ul className="mt-4 space-y-3 text-[16px] leading-snug">
                {blogPosts.map((p) => (
                  <li key={p.slug}>
                    <a href={p.url} className="text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]">{p.title}</a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={`mt-4 text-[16px] ${muted}`}>
                No articles on this exam yet. <a href="/blog" className="text-[#C2410C] underline underline-offset-4">Browse the blog</a>.
              </p>
            )}
          </div>
          <div>
            <h2 className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>Related guides and plans</h2>
            <ul className="mt-4 space-y-3 text-[16px] leading-snug">
              <li>
                <a href={`/exams/${plan.guide}`} className="text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]">{guidePage ? guidePage.label : plan.guide} guide</a>
              </li>
              {related.map((r) => (
                <li key={r.href}>
                  <a href={r.href} className="text-[#1A1714] underline decoration-[#E7C9B4] underline-offset-4 hover:text-[#C2410C]">{r.label}</a>
                </li>
              ))}
              <li>
                <a href="/exams" className="text-[#C2410C] underline underline-offset-4">All exam guides</a>
              </li>
            </ul>
          </div>
        </section>
      </article>
    </Shell>
  );
}

export function ExamPage({ slug, posts = [] }) {
  const c = examContent(slug);
  if (!c) return null;
  const blogPosts = relatedPosts(posts, c.tags);
  return (
    <Shell>
      <article className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 sm:pt-16 pb-24">
        <Breadcrumbs items={examBreadcrumbs(c)} />
        <header className="mt-6 max-w-3xl">
          <p className={eyebrow}>Exam guide</p>
          <h1 className={`mt-4 font-display ${ink} text-[38px] sm:text-5xl lg:text-6xl tracking-[-0.03em] font-medium leading-[1.05]`}>{c.h1}</h1>
          {c.intro.map((p) => (
            <p key={p.slice(0, 32)} className={`mt-6 ${lead}`}>{p}</p>
          ))}
        </header>

        <section aria-label="At a glance" className="mt-10 max-w-4xl">
          <dl className="divide-y divide-[#E7E1D7] border-y border-[#E7E1D7]">
            {c.facts.map(([k, v]) => (
              <div key={k} className="py-4 grid sm:grid-cols-[12rem_1fr] gap-1 sm:gap-6">
                <dt className={`${ink} font-semibold text-[16px]`}>{k}</dt>
                <dd className={`text-[16px] leading-[1.6] ${muted}`}>{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <StudyPlans guide={slug} />
        <FormatTable format={c.format} />
        <DeleLevels rows={c.deleLevels} scoring={c.scoring} />
        <Resources groups={c.resources} lastChecked={c.lastChecked} />
        <PlannerCta planner={c.planner} label={c.label} relatedPlanner={c.relatedPlanner} />
        <Faq faq={c.faq} />

        <section aria-labelledby="sources-title" className="mt-14 pt-10 border-t border-[#E7E1D7] max-w-3xl">
          <h2 id="sources-title" className={`font-display ${ink} text-[24px] tracking-[-0.02em] font-medium`}>Sources</h2>
          <ol className="mt-4 space-y-2 text-[16px] leading-snug">
            {c.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[#C2410C] underline underline-offset-4 break-words">
                  {s.title} <ArrowUpRight className="inline w-3.5 h-3.5" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ol>
          <p className={`mt-4 text-[14px] text-[#6B635A]`}>
            Exam rules, fees and dates change. Always confirm on the official site before you book. OpenExam Hub is independent and not affiliated with any exam body.
          </p>
        </section>

        <RelatedReading posts={blogPosts} related={c.related} />
      </article>
    </Shell>
  );
}

export function ExamsIndex({ posts = [] }) {
  return (
    <Shell>
      <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 sm:pt-16 pb-24">
        <Breadcrumbs items={examBreadcrumbs(null)} />
        <header className="mt-6 max-w-3xl">
          <p className={eyebrow}>Exam guides</p>
          <h1 className={`mt-4 font-display ${ink} text-5xl sm:text-6xl tracking-[-0.03em] font-medium leading-[1.02]`}>Language exam guides</h1>
          <p className={`mt-6 ${lead}`}>{EXAMS_INDEX.description}</p>
        </header>
        <ul className="mt-12 grid gap-5 sm:grid-cols-2">
          {EXAM_PAGES.map((p) => {
            const count = relatedPosts(posts, p.tags).length;
            return (
              <li key={p.slug} className="rounded-2xl border border-[#E7E1D7] bg-white/70 p-6">
                <h2 className={`font-display ${ink} text-[26px] tracking-[-0.02em] font-medium`}>
                  <a href={`/exams/${p.slug}`} className="hover:text-[#C2410C]">{p.label}</a>
                </h2>
                <p className={`mt-2 text-[16px] leading-[1.6] ${muted}`}>{p.description}</p>
                <p className="mt-4 text-[15px]">
                  <a href={`/exams/${p.slug}`} className="inline-flex items-center gap-1.5 font-semibold text-[#C2410C] underline underline-offset-4">
                    {p.label} guide <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </a>
                  {count ? <span className="text-[#6B635A]"> · {count} blog {count === 1 ? 'article' : 'articles'}</span> : null}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    </Shell>
  );
}
