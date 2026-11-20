import React from 'react';
import { ArrowRight, Rss } from 'lucide-react';
import { SiteHeader, SiteFooter } from '../landing/SiteChrome.jsx';
import { ink, muted, eyebrow, lead, pageFont } from '../landing/theme.js';

export const EXAM_LABELS = {
  TCF: 'TCF',
  TEF: 'TEF',
  TEF_CANADA: 'TEF Canada',
  DELF: 'DELF',
  DALF: 'DALF',
  IELTS: 'IELTS',
  CAMBRIDGE: 'Cambridge English',
  TOEFL: 'TOEFL',
  GOETHE: 'Goethe',
  TELC: 'telc',
  TESTDAF: 'TestDaF',
  DELE: 'DELE'
};

export const AUDIENCE_LABELS = {
  students: 'Students',
  professionals: 'Professionals',
  immigration: 'Immigration'
};

export function examLabel(id) {
  const key = String(id || '').trim().toUpperCase();
  return EXAM_LABELS[key] || key;
}

export function plannerUrl(examId) {
  const id = String(examId || '').trim().toUpperCase();
  return id ? `/app?exam=${encodeURIComponent(id)}` : '/app';
}

export function formatDate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

function PageShell({ title, children, lang = 'en' }) {
  return (
    <div className="min-h-screen bg-[#F7F5F0] text-[#1A1714] antialiased" style={pageFont} lang={lang}>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </div>
  );
}

function ExamFilter({ exams, active }) {
  const allActive = !active;
  return (
    <nav aria-label="Filter by exam" className="flex flex-wrap gap-2">
      <a
        href="/blog"
        aria-current={allActive ? 'page' : undefined}
        className={`inline-flex items-center h-9 px-3.5 rounded-full text-[14px] font-medium transition-colors ${
          allActive ? 'bg-[#1A1714] text-white' : 'bg-white border border-[#E7E1D7] text-[#3B352F] hover:border-[#1A1714]'
        }`}
      >
        All exams
      </a>
      {exams.map((id) => {
        const isActive = active === id;
        return (
          <a
            key={id}
            href={`/blog/tag/${id}`}
            aria-current={isActive ? 'page' : undefined}
            className={`inline-flex items-center h-9 px-3.5 rounded-full text-[14px] font-medium transition-colors ${
              isActive ? 'bg-[#1A1714] text-white' : 'bg-white border border-[#E7E1D7] text-[#3B352F] hover:border-[#1A1714]'
            }`}
          >
            {examLabel(id)}
          </a>
        );
      })}
    </nav>
  );
}

function CoverImage({ cover, href, className = '' }) {
  if (!cover?.src) return null;
  const img = (
    <img
      src={cover.src}
      alt={cover.alt || ''}
      className={`w-full h-auto object-cover ${className}`}
    />
  );
  return href ? <a href={href} className="block">{img}</a> : img;
}

function PostCard({ post }) {
  return (
    <article className="border-b border-[#D9D1C5] py-8 sm:py-10">
      {post.cover ? (
        <div className="mb-5 overflow-hidden rounded-2xl bg-[#EDE7DD]">
          <CoverImage cover={post.cover} href={post.url} />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[#6B635A]">
        <time dateTime={post.date}>{formatDate(post.date)}</time>
        <span aria-hidden="true">·</span>
        <span>{post.readingMinutes} min read</span>
        {post.draft ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="uppercase tracking-[0.14em] font-semibold text-[#C2410C]">Example draft</span>
          </>
        ) : null}
      </div>
      <h2 className={`mt-3 font-display ${ink} text-[28px] sm:text-[34px] leading-[1.15] tracking-[-0.02em] font-medium`}>
        <a href={post.url} className="hover:text-[#C2410C]">{post.title}</a>
      </h2>
      <p className={`mt-3 ${lead} max-w-3xl text-[17px] sm:text-[18px]`}>{post.description}</p>
      <ul className="mt-4 flex flex-wrap gap-2" aria-label="Exams and audiences">
        {post.exams.map((id) => (
          <li key={id}>
            <a href={`/blog/tag/${id}`} className="inline-flex items-center h-7 px-2.5 rounded-full bg-[#EDE7DD] text-[13px] font-medium text-[#3B352F] hover:bg-[#E7C9B4]">
              {examLabel(id)}
            </a>
          </li>
        ))}
        {post.audience.map((id) => (
          <li key={id}>
            <span className="inline-flex items-center h-7 px-2.5 rounded-full border border-[#E7E1D7] text-[13px] text-[#5C554C]">
              {AUDIENCE_LABELS[id] || id}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function EmptyList() {
  return (
    <div className="py-16 max-w-2xl">
      <h2 className={`font-display ${ink} text-[28px] sm:text-[32px] tracking-[-0.02em] font-medium`}>
        Articles coming soon
      </h2>
      <p className={`mt-4 ${lead}`}>
        The first guides on language exams — for students, professionals and immigration applicants — are on the way.
        If you want to be notified, write to{' '}
        <a className="text-[#C2410C] underline underline-offset-4" href="mailto:hello@openexamhub.org">hello@openexamhub.org</a>.
      </p>
    </div>
  );
}

export function BlogIndex({ posts, exam = null }) {
  const exams = [...new Set(posts.flatMap((p) => p.exams))].sort((a, b) => examLabel(a).localeCompare(examLabel(b)));
  const list = exam ? posts.filter((p) => p.exams.includes(exam)) : posts;
  const knownExam = exam && (EXAM_LABELS[exam] || exam);
  const title = exam ? `Blog · ${examLabel(exam)}` : 'Blog';
  const intro = exam
    ? `Articles about ${examLabel(exam)} for students, professionals and immigration applicants.`
    : 'Practical guides on language exams: what they are used for, who asks for them, and when to start preparing. Written for students, professionals and immigration applicants.';

  return (
    <PageShell title={title}>
      <header className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 sm:pt-16 pb-6 sm:pb-8">
        <p className={eyebrow}>{exam ? 'Blog' : 'From OpenExam Hub'}</p>
        <h1 className={`mt-4 font-display ${ink} text-5xl sm:text-6xl tracking-[-0.03em] font-medium leading-[1.02]`}>
          {exam ? `${examLabel(exam)} guides` : 'Blog'}
        </h1>
        <p className={`mt-6 max-w-3xl ${lead}`}>{intro}</p>
        <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
          <ExamFilter exams={exams} active={exam} />
          <a href="/blog/rss.xml" className={`inline-flex items-center gap-2 text-[14px] font-medium ${muted} hover:text-[#C2410C]`}>
            <Rss className="w-4 h-4" aria-hidden="true" /> RSS feed
          </a>
        </div>
        {exam && !knownExam ? (
          <p className={`mt-8 ${muted}`}>There is no exam called “{exam}” on OpenExam Hub.</p>
        ) : null}
      </header>
      <section className="mx-auto max-w-6xl px-5 sm:px-8 pb-24" aria-label="Articles">
        {list.length ? list.map((post) => <PostCard key={post.slug} post={post} />) : <EmptyList />}
        {exam ? (
          <p className="mt-10">
            <a href="/blog" className="text-[#C2410C] underline underline-offset-4">All blog posts</a>
          </p>
        ) : null}
      </section>
    </PageShell>
  );
}

function TableOfContents({ headings }) {
  if (!headings?.length) return null;
  return (
    <nav aria-labelledby="toc-title" className="lg:sticky lg:top-8">
      <details className="group rounded-2xl border border-[#E7E1D7] bg-white/70 px-5 py-4" open>
        <summary className="cursor-pointer list-none font-semibold text-[15px] text-[#1A1714] [&::-webkit-details-marker]:hidden flex items-center justify-between gap-3">
          <span id="toc-title">On this page</span>
          <span className="lg:hidden text-[13px] font-medium text-[#6B635A] group-open:hidden">Show</span>
          <span className="lg:hidden text-[13px] font-medium text-[#6B635A] hidden group-open:inline">Hide</span>
        </summary>
        <ol className="mt-3 space-y-2 text-[15px] leading-snug text-[#3B352F]">
          {headings.map((h) => (
            <li key={h.id} className={h.level === 3 ? 'pl-4' : ''}>
              <a href={`#${h.id}`} className="hover:text-[#C2410C]">{h.text}</a>
            </li>
          ))}
        </ol>
      </details>
    </nav>
  );
}

function RoadmapCta({ exams }) {
  if (!exams?.length) {
    return (
      <a href="/app" className="mt-4 inline-flex items-center gap-2 h-12 px-6 rounded-full bg-[#EA580C] hover:bg-[#C2410C] text-white font-semibold">
        Build a free study plan <ArrowRight className="w-4 h-4" aria-hidden="true" />
      </a>
    );
  }
  return (
    <ul className="mt-5 flex flex-col sm:flex-row flex-wrap gap-3">
      {exams.map((id) => (
        <li key={id}>
          <a
            href={plannerUrl(id)}
            className="inline-flex items-center gap-2 h-12 px-6 rounded-full bg-[#EA580C] hover:bg-[#C2410C] text-white font-semibold"
          >
            Build a free {examLabel(id)} plan <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  );
}

export function BlogPost({ post }) {
  if (!post) return <BlogNotFound />;
  const verified = formatDate(post.lastVerified);
  const published = formatDate(post.date);
  const updated = post.updated && post.updated !== post.date ? formatDate(post.updated) : null;

  return (
    <PageShell title={post.title} lang={post.lang}>
      <article className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 sm:pt-16 pb-24">
        <p className="text-[14px]">
          <a href="/blog" className="text-[#C2410C] underline underline-offset-4">Blog</a>
          <span className="text-[#6B635A]"> / {post.exams.map(examLabel).join(', ')}</span>
        </p>
        <header className="mt-5 max-w-3xl">
          {post.draft ? (
            <p className="mb-5 rounded-2xl border border-[#E7C9B4] bg-[#FDF3EC] px-4 py-3 text-[15px] leading-relaxed text-[#7C2D12]" role="note">
              Example post — this is a format sample for writers and is not published on the live site while it remains a draft.
            </p>
          ) : null}
          <p className={eyebrow}>OpenExam Hub blog</p>
          <h1 className={`mt-4 font-display ${ink} text-[36px] sm:text-5xl lg:text-6xl tracking-[-0.03em] font-medium leading-[1.05]`}>
            {post.title}
          </h1>
          <p className={`mt-6 ${lead}`}>{post.description}</p>
          <p className={`mt-6 text-[15px] ${muted}`}>
            <span className="font-semibold text-[#1A1714]">As of {verified}.</span>
            {' '}Published {published}
            {updated ? ` · Updated ${updated}` : ''}.
            {' '}{post.readingMinutes} min read.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Exams and audiences">
            {post.exams.map((id) => (
              <li key={id}>
                <a href={`/blog/tag/${id}`} className="inline-flex items-center h-7 px-2.5 rounded-full bg-[#EDE7DD] text-[13px] font-medium text-[#3B352F] hover:bg-[#E7C9B4]">
                  {examLabel(id)}
                </a>
              </li>
            ))}
            {post.audience.map((id) => (
              <li key={id}>
                <span className="inline-flex items-center h-7 px-2.5 rounded-full border border-[#E7E1D7] text-[13px] text-[#5C554C]">
                  {AUDIENCE_LABELS[id] || id}
                </span>
              </li>
            ))}
          </ul>
        </header>

        {post.cover ? (
          <figure className="mt-10 max-w-3xl">
            <div className="overflow-hidden rounded-2xl bg-[#EDE7DD]">
              <CoverImage cover={post.cover} />
            </div>
            {post.cover.credit ? (
              <figcaption className={`mt-3 text-[14px] leading-relaxed ${muted}`}>{post.cover.credit}</figcaption>
            ) : null}
          </figure>
        ) : null}

        <div className="mt-12 grid lg:grid-cols-[minmax(0,1fr)_16rem] gap-10 lg:gap-16 items-start">
          <aside className="lg:col-start-2 lg:row-start-1">
            <TableOfContents headings={post.headings} />
          </aside>
          <div className="lg:col-start-1 lg:row-start-1">
            <div className="blog-prose" dangerouslySetInnerHTML={{ __html: post.html }} />

            {post.faq?.length ? (
              <section aria-labelledby="post-faq-title" className="mt-14 pt-10 border-t border-[#E7E1D7]">
                <h2 id="post-faq-title" className={`font-display ${ink} text-[28px] sm:text-[32px] tracking-[-0.02em] font-medium`}>
                  Questions people ask
                </h2>
                <div className="mt-4 divide-y divide-[#E7E1D7] border-y border-[#E7E1D7]">
                  {post.faq.map((item) => (
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
            ) : null}

            {post.sources?.length ? (
              <section aria-labelledby="sources-title" className="mt-14 pt-10 border-t border-[#E7E1D7]">
                <h2 id="sources-title" className={`font-display ${ink} text-[28px] sm:text-[32px] tracking-[-0.02em] font-medium`}>
                  Sources
                </h2>
                <p className={`mt-3 text-[15px] ${muted}`}>Official pages this article draws on. Last checked {verified}.</p>
                <ol className="mt-5 space-y-3 text-[16px] leading-snug">
                  {post.sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[#C2410C] underline underline-offset-4 break-words">
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            <section aria-labelledby="cta-title" className="mt-14 rounded-3xl bg-[#1A1714] text-white px-6 sm:px-8 py-8 sm:py-10">
              <h2 id="cta-title" className="font-display text-[28px] sm:text-[32px] tracking-[-0.02em] font-medium">
                Turn this into a day-by-day plan
              </h2>
              <p className="mt-3 text-[16px] sm:text-[17px] leading-relaxed text-[#D9D2C8] max-w-xl">
                OpenExam Hub builds a free study plan from official, free exam material. Create a free account to generate yours.
              </p>
              <RoadmapCta exams={post.exams} />
            </section>
          </div>

        </div>
      </article>
    </PageShell>
  );
}

export function BlogNotFound() {
  return (
    <PageShell title="Post not found">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-16 pb-32">
        <p className={eyebrow}>Blog</p>
        <h1 className={`mt-4 font-display ${ink} text-5xl tracking-[-0.03em] font-medium`}>This post isn’t here</h1>
        <p className={`mt-6 max-w-xl ${lead}`}>
          The link may be mistyped, or the article is still a draft. See every published post on the blog.
        </p>
        <a href="/blog" className="mt-8 inline-flex items-center gap-2 text-[#C2410C] font-semibold underline underline-offset-4">
          Back to the blog <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </a>
      </div>
    </PageShell>
  );
}

/** Tiny path router for /blog, /blog/:slug and /blog/tag/:exam. */
export function parseBlogPath(pathname) {
  const p = String(pathname || '').replace(/\/+$/, '') || '/';
  if (p === '/blog') return { kind: 'index' };
  const tag = p.match(/^\/blog\/tag\/([^/]+)$/i);
  if (tag) return { kind: 'tag', exam: decodeURIComponent(tag[1]).toUpperCase() };
  const slug = p.match(/^\/blog\/([^/]+)$/i);
  if (slug) {
    const value = decodeURIComponent(slug[1]);
    if (value.toLowerCase() === 'rss.xml' || value.toLowerCase() === 'tag') return { kind: 'skip' };
    return { kind: 'post', slug: value };
  }
  return null;
}

export default function BlogApp({ pathname, posts }) {
  const route = parseBlogPath(pathname);
  if (!route || route.kind === 'skip') return <BlogNotFound />;
  if (route.kind === 'index') return <BlogIndex posts={posts} />;
  if (route.kind === 'tag') return <BlogIndex posts={posts} exam={route.exam} />;
  const post = posts.find((p) => p.slug === route.slug);
  return <BlogPost post={post} />;
}
