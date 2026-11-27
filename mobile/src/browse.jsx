import { EXAM_PAGES } from '@hub/src/seo/site.js';
import { examContent } from '@hub/src/seo/examContent.js';
import { plansForGuide, planPage } from '@hub/src/seo/planPages.js';
import { COMPARE_PAGES, CLB_TABLE_PAGE } from '@hub/src/compare/comparePages.js';
import { TEST_FORMATS, clbRows, TABLES, SKILLS, SKILL_LABELS, tableVerified, cellKind } from '@hub/src/compare/compareData.js';
import { useNav } from './nav.js';
import { Empty, External, Facts, Faq, RowLink, prettyDate, useOpenHref } from './ui.jsx';

const LANG = {
  'tef-canada': 'French',
  'tcf-canada': 'French',
  tcf: 'French',
  delf: 'French',
  ielts: 'English',
  toefl: 'English',
  celpip: 'English',
  goethe: 'German',
  telc: 'German',
  dele: 'Spanish'
};

export function examCards(query = '') {
  const q = query.trim().toLowerCase();
  return EXAM_PAGES.filter((p) => !q || `${p.label} ${p.description} ${LANG[p.slug] || ''}`.toLowerCase().includes(q));
}

export function HomeScreen() {
  const { push } = useNav();
  const groups = ['French', 'English', 'German', 'Spanish'];
  return (
    <div className="stack">
      <header>
        <p className="eyebrow">Official sources only</p>
        <h2 className="display" style={{ fontSize: '2.15rem', marginTop: '0.35rem' }}>Study plans from the material exam boards already publish for free.</h2>
        <p className="lead">IELTS, CELPIP, PTE Core, TEF Canada, TCF, DELF, Goethe, telc, DELE and the CLB, CEFR and CRS tools. No ads on these pages.</p>
      </header>
      <button type="button" className="primary" onClick={() => push({ name: 'planner' })}>Open the study planner</button>
      {groups.map((lang) => {
        const items = EXAM_PAGES.filter((p) => LANG[p.slug] === lang);
        if (!items.length) return null;
        return (
          <section key={lang} className="stack">
            <h2 className="section-title">{lang}</h2>
            {items.map((p) => (
              <RowLink
                key={p.slug}
                title={p.label}
                detail={plansForGuide(p.slug).length ? `${plansForGuide(p.slug).length} study path${plansForGuide(p.slug).length === 1 ? '' : 's'}` : 'Format and free official practice'}
                onClick={() => push({ name: 'exam', slug: p.slug })}
              />
            ))}
            {lang === 'English' ? (
              <RowLink title="PTE Core" detail="CLB scores and how it compares with IELTS" onClick={() => push({ name: 'compareDetail', slug: 'ielts-vs-pte' })} />
            ) : null}
          </section>
        );
      })}
      <section className="stack">
        <h2 className="section-title">Tools</h2>
        <RowLink title="CLB / NCLC converter" detail="IELTS, CELPIP, PTE Core, TEF Canada, TCF Canada" onClick={() => push({ name: 'clb', mode: 'TEF_EXPRESS_ENTRY' })} />
        <RowLink title="CEFR converter" detail="IELTS, CELPIP, PTE Academic, TCF" onClick={() => push({ name: 'cefr' })} />
        <RowLink title="CRS language points" detail="First and second official language" onClick={() => push({ name: 'crs' })} />
        <RowLink title="Compare tests" detail="Side by side, with the sources named" onClick={() => push({ name: 'compare' })} />
      </section>
    </div>
  );
}

export function ExamList({ query, onQuery }) {
  const { push } = useNav();
  const items = examCards(query);
  return (
    <div className="stack">
      <label className="field">
        Search exams
        <input className="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="IELTS, Goethe, TEF…" enterKeyHint="search" />
      </label>
      {items.length === 0 ? <Empty title="No exam matches that" detail="Try IELTS, CELPIP, TEF, TCF, DELF, Goethe, telc or DELE." /> : null}
      {items.map((p) => (
        <RowLink key={p.slug} title={p.label} detail={LANG[p.slug]} onClick={() => push({ name: 'exam', slug: p.slug })} />
      ))}
      <RowLink title="PTE Core" detail="English · Express Entry. Compared on the CLB table." onClick={() => push({ name: 'compareDetail', slug: 'ielts-vs-pte' })} />
    </div>
  );
}

export function ExamScreen({ slug }) {
  const { push } = useNav();
  const open = useOpenHref();
  const page = examContent(slug);
  if (!page) return <Empty title="That guide is not on OpenExam Hub" />;
  const paths = plansForGuide(slug);
  return (
    <article className="stack">
      <header>
        <p className="eyebrow">{LANG[slug] || 'Exam guide'}</p>
        <h2 className="display" style={{ fontSize: '1.85rem', marginTop: '0.3rem' }}>{page.h1}</h2>
        {page.intro?.map((p) => <p className="lead" key={p.slice(0, 24)}>{p}</p>)}
      </header>
      {page.runBy ? <External href={page.runBy.url}>Run by {page.runBy.name}</External> : null}
      <div className="card"><Facts rows={page.facts} /></div>
      {page.format?.sections?.length ? (
        <section>
          <h2 className="section-title">Format</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Section</th><th>Time</th><th>Items</th></tr></thead>
              <tbody>
                {page.format.sections.map((s) => (
                  <tr key={s.name}><td>{s.name}</td><td>{s.duration}</td><td>{s.items}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {page.format.scoring ? <p className="note">{page.format.scoring}</p> : null}
          {page.format.sourceUrl ? <External href={page.format.sourceUrl}>Official format page</External> : null}
        </section>
      ) : null}
      {paths.length ? (
        <section className="stack">
          <h2 className="section-title">Study paths</h2>
          {paths.map((p) => (
            <RowLink key={p.slug} title={p.breadcrumb || p.label} detail={`${p.level} · ${p.duration}`} onClick={() => push({ name: 'plan', guide: slug, slug: p.slug })} />
          ))}
        </section>
      ) : null}
      {page.planner ? (
        <button type="button" className="primary" onClick={() => push({ name: 'planner', exam: page.planner.exam })}>
          Build a {page.planner.label} plan
        </button>
      ) : null}
      {page.resources?.map((group) => (
        <section key={group.category} className="stack">
          <h2 className="section-title">{group.category}</h2>
          {group.items.map((item) => (
            <RowLink key={item.url} title={item.title} detail={item.org} onClick={() => open(item.url)} />
          ))}
        </section>
      ))}
      {page.lastChecked ? <p className="note">Links last checked {prettyDate(page.lastChecked)}.</p> : null}
      <Faq items={page.faq} />
      {page.related?.length ? (
        <section className="stack">
          <h2 className="section-title">Related guides</h2>
          {page.related.map((r) => (
            <RowLink key={r.slug} title={r.label} onClick={() => push({ name: 'exam', slug: r.slug })} />
          ))}
        </section>
      ) : null}
      <p className="note">OpenExam Hub is independent. It is not affiliated with the exam body named on this page, and a study path is not a promise of a score.</p>
    </article>
  );
}

export function PlanScreen({ guide, slug }) {
  const open = useOpenHref();
  const { push } = useNav();
  const plan = planPage(guide, slug);
  if (!plan) return <Empty title="That study path is not on OpenExam Hub" />;
  return (
    <article className="stack">
      <header>
        <p className="eyebrow">{plan.level} · {plan.duration}</p>
        <h2 className="display" style={{ fontSize: '1.8rem', marginTop: '0.3rem' }}>{plan.h1}</h2>
        {plan.subhead ? <p className="lead">{plan.subhead}</p> : null}
      </header>
      {plan.whoFor?.length ? (
        <section className="card">
          <h2 className="section-title" style={{ marginTop: 0 }}>Who this path is for</h2>
          {plan.whoFor.map((line) => <p key={line.slice(0, 32)} className="note">{line}</p>)}
        </section>
      ) : null}
      <div className="card"><Facts rows={plan.facts} /></div>
      {plan.factsNote ? <p className="note">{plan.factsNote}</p> : null}
      {plan.phases?.map((phase) => (
        <section key={phase.title} className="card">
          <h2 className="section-title" style={{ marginTop: 0 }}>{phase.title}</h2>
          {phase.focus ? <p className="note">{phase.focus}</p> : null}
          <ol className="stack" style={{ margin: '0.6rem 0 0', paddingLeft: '1.1rem' }}>
            {(phase.tasks || []).map((task) => (
              <li key={task.when + task.text.slice(0, 24)}>
                <strong>{task.when}.</strong> {task.text}
                {task.links?.length ? (
                  <span>
                    {' '}
                    {task.links.map((l) => (
                      <button type="button" key={l.href || l.url} className="text-btn" onClick={() => open(l.href || l.url)}>{l.label || l.title}</button>
                    ))}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ))}
      {plan.caution ? <p className="banner">{plan.caution}</p> : null}
      {plan.materials?.length ? (
        <section className="stack">
          <h2 className="section-title">Materials</h2>
          {plan.materials.map((m) => (
            <RowLink key={m.href || m.url} title={m.label || m.title} onClick={() => open(m.href || m.url)} />
          ))}
        </section>
      ) : null}
      <Faq items={plan.faq} />
      {plan.sources?.length ? (
        <section className="stack">
          <h2 className="section-title">Sources</h2>
          {plan.sources.map((s) => (
            <External key={s.href || s.url} href={s.href || s.url}>{s.label || s.title}</External>
          ))}
        </section>
      ) : null}
      {plan.lastChecked ? <p className="note">Checked {prettyDate(plan.lastChecked)}.</p> : null}
      <button type="button" className="ghost" onClick={() => push({ name: 'exam', slug: guide })}>Back to the guide</button>
    </article>
  );
}

function comparePage(slug) {
  if (slug === CLB_TABLE_PAGE.slug) return CLB_TABLE_PAGE;
  return COMPARE_PAGES.find((p) => p.slug === slug) || null;
}

export function CompareHub() {
  const { push } = useNav();
  return (
    <div className="stack">
      <header>
        <p className="eyebrow">Compare</p>
        <h2 className="display" style={{ fontSize: '1.8rem' }}>Tests side by side</h2>
        <p className="lead">IRCC’s CLB and NCLC tables, plus French diplomas and German exams by CEFR level. Each page names its sources. Nothing here converts one test’s score into another’s.</p>
      </header>
      {COMPARE_PAGES.map((p) => (
        <RowLink key={p.slug} title={p.label} detail={p.description} onClick={() => push({ name: 'compareDetail', slug: p.slug })} />
      ))}
      <RowLink title={CLB_TABLE_PAGE.label} detail="All five Express Entry tests, per skill" onClick={() => push({ name: 'compareDetail', slug: CLB_TABLE_PAGE.slug })} />
    </div>
  );
}

export function CompareScreen({ slug }) {
  const page = comparePage(slug);
  const { push } = useNav();
  const open = useOpenHref();
  if (!page) return <Empty title="That comparison is not on OpenExam Hub" />;
  const tests = page.tests || [];
  return (
    <article className="stack">
      <header>
        <p className="eyebrow">{page.eyebrow || 'Side-by-side comparison'}</p>
        <h2 className="display" style={{ fontSize: '1.75rem', marginTop: '0.3rem' }}>{page.h1}</h2>
        {page.intro?.map((p) => <p className="lead" key={p.slice(0, 28)}>{p}</p>)}
      </header>
      {tests.length ? (
        <section className="stack">
          <h2 className="section-title">CLB / NCLC by skill</h2>
          <ul className="note" style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {tests.map((id) => (
              <li key={id}><strong>{TABLES[id].label}.</strong> {cellKind(id)}. Checked {prettyDate(tableVerified(id))}.</li>
            ))}
          </ul>
          {SKILLS.map((skill) => (
            <div key={skill}>
              <h3 className="section-title">{SKILL_LABELS[skill].en}</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th className="sticky">Level</th>
                      {tests.map((id) => <th key={id}>{TABLES[id].short || TABLES[id].label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {clbRows(tests, skill).map((row) => (
                      <tr key={row.level}>
                        <td className="sticky">{row.level === 10 ? '10+' : row.level}</td>
                        {row.cells.map((cell) => <td key={cell.tableId}>{cell.text}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      ) : null}
      {page.formats?.length ? (
        <section className="stack">
          {page.formatNote ? <p className="note">{page.formatNote}</p> : null}
          {page.formatRows.map(([key, label]) => (
            <div className="card" key={key}>
              <h3>{label}</h3>
              {page.formats.map((id) => (
                <p key={id}><strong>{TEST_FORMATS[id].name}. </strong>{TEST_FORMATS[id].rows[key]}</p>
              ))}
            </div>
          ))}
        </section>
      ) : null}
      {page.cefr?.map((table) => (
        <section key={table.id} className="card">
          <h2 className="section-title" style={{ marginTop: 0 }}>{table.exam} and the CEFR</h2>
          <Facts rows={table.rows.map((r) => [r.cefr, r.score])} />
          {table.note ? <p className="note">{table.note}</p> : null}
        </section>
      ))}
      {page.tabs?.length ? (
        <section className="stack">
          {page.tabs.map((t) => (
            <RowLink key={t.href} title={t.label} onClick={() => open(t.href)} />
          ))}
        </section>
      ) : null}
      <Faq items={page.faq} />
      {page.guides?.length ? (
        <section className="stack">
          <h2 className="section-title">Guides</h2>
          {page.guides.map((g) => <RowLink key={g.href} title={g.label} onClick={() => open(g.href)} />)}
        </section>
      ) : null}
      {page.disclaimer ? <p className="note">{page.disclaimer}</p> : null}
      <button type="button" className="ghost" onClick={() => push({ name: 'compare' })}>All comparisons</button>
    </article>
  );
}
