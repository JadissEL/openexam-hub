/**
 * Load and render Markdown blog posts from content/blog.
 * Used by the Vite plugin, the prerender step, and tests.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import markdownItAnchor from 'markdown-it-anchor';
import { KNOWN_EXAMS, PLANNER_ALIASES } from '../lib/exams.js';
import { indexablePaths, ORG_ID, examPagesForTag } from '../src/seo/site.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '..');
export const CONTENT_DIR = path.join(REPO_ROOT, 'content', 'blog');
export const SITE_ORIGIN = 'https://openexamhub.org';

export const AUDIENCES = ['students', 'professionals', 'immigration'];

/** Frontmatter exam tags: planner exams plus aliases such as TCF_CANADA. */
export const BLOG_EXAMS = [...new Set([...KNOWN_EXAMS, ...Object.keys(PLANNER_ALIASES)])];

export const EXAM_LABELS = {
  TCF: 'TCF',
  TEF: 'TEF',
  TEF_CANADA: 'TEF Canada',
  TCF_CANADA: 'TCF Canada',
  DELF: 'DELF',
  DALF: 'DALF',
  IELTS: 'IELTS',
  CAMBRIDGE: 'Cambridge English',
  TOEFL: 'TOEFL',
  CELPIP: 'CELPIP',
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true
});

md.use(markdownItAnchor, {
  level: [2, 3],
  slugify,
  permalink: markdownItAnchor.permalink.linkInsideHeader({
    class: 'blog-anchor',
    symbol: '#',
    ariaHidden: false,
    placement: 'after'
  })
});

// Open outbound links in a new tab; keep blog and site links in the same tab.
const defaultLinkOpen = md.renderer.rules.link_open || function (tokens, idx, options, _env, self) {
  return self.renderToken(tokens, idx, options);
};
md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  const token = tokens[idx];
  const href = token.attrGet('href') || '';
  if (/^https?:\/\//i.test(href) && !href.startsWith(SITE_ORIGIN)) {
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noopener noreferrer');
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

/** Drafts are excluded only on Vercel production builds. Preview and local builds include them. */
export function includeDraftsFromEnv(env = process.env) {
  return env.VERCEL_ENV !== 'production';
}

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

function assertDate(value, field, label) {
  if (!DATE_RE.test(String(value || ''))) {
    throw new Error(`${label}: "${field}" must be YYYY-MM-DD (got ${JSON.stringify(value)})`);
  }
}

function wordCount(markdown) {
  return String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#>*_~\-]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function extractHeadings(html) {
  const headings = [];
  const re = /<h([23])\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = re.exec(html))) {
    const text = m[3]
      .replace(/<a class="blog-anchor"[\s\S]*?<\/a>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
    headings.push({ level: Number(m[1]), id: m[2], text });
  }
  return headings;
}

function normalizeFaq(raw, label) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new Error(`${label}: "faq" must be a list of {q, a}`);
  return raw.map((item, i) => {
    if (!item || typeof item !== 'object' || !item.q || !item.a) {
      throw new Error(`${label}: faq[${i}] must have q and a`);
    }
    return { q: String(item.q).trim(), a: String(item.a).trim() };
  });
}

function normalizeSources(raw, label) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new Error(`${label}: "sources" must be a list of {title, url}`);
  return raw.map((item, i) => {
    if (!item || typeof item !== 'object' || !item.title || !item.url) {
      throw new Error(`${label}: sources[${i}] must have title and url`);
    }
    const url = String(item.url).trim();
    if (!/^https:\/\//i.test(url)) {
      throw new Error(`${label}: sources[${i}].url must be an https URL`);
    }
    return { title: String(item.title).trim(), url };
  });
}

function normalizeList(raw, field, allowed, label) {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`${label}: "${field}" must be a non-empty list`);
  }
  return raw.map((value, i) => {
    const v = String(value || '').trim();
    const key = field === 'exams' ? v.toUpperCase().replace(/[\s-]+/g, '_') : v.toLowerCase();
    if (allowed && !allowed.includes(key)) {
      throw new Error(`${label}: ${field}[${i}] "${value}" is not one of ${allowed.join(', ')}`);
    }
    return key;
  });
}


export function resolveImageUrl(src) {
  const s = String(src || '').trim();
  if (!s) return null;
  if (s.startsWith(SITE_ORIGIN + '/')) {
    return { src: s.slice(SITE_ORIGIN.length), imageUrl: s };
  }
  if (s.startsWith('/') && !s.startsWith('//')) {
    return { src: s, imageUrl: `${SITE_ORIGIN}${s}` };
  }
  if (/^https:\/\//i.test(s)) return { src: s, imageUrl: s };
  return null;
}

function decodeEntities(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function sameSrc(a, b) {
  const ra = resolveImageUrl(a);
  const rb = resolveImageUrl(b);
  if (!ra || !rb) return false;
  return ra.imageUrl === rb.imageUrl;
}

export function normalizeCover(raw, label) {
  if (raw == null || raw === false) return null;
  if (typeof raw !== 'object' || Array.isArray(raw) || !raw.src || !raw.alt) {
    throw new Error(`${label}: "cover" must be {src, alt} (optional credit)`);
  }
  const resolved = resolveImageUrl(raw.src);
  if (!resolved) {
    throw new Error(`${label}: cover.src must be a site path (e.g. /blog/slug/cover.webp) or an https URL`);
  }
  const cover = { src: resolved.src, alt: String(raw.alt).trim(), imageUrl: resolved.imageUrl };
  if (!cover.alt) throw new Error(`${label}: cover.alt must not be empty`);
  if (raw.credit) cover.credit = String(raw.credit).trim();
  return cover;
}

/** First <p><img></p> in the rendered body, plus an optional following italic caption. */
export function firstBodyImage(html) {
  const m = String(html || '').match(/<p>\s*<img\b([^>]*)>\s*<\/p>(?:\s*<p>\s*<em>([\s\S]*?)<\/em>\s*<\/p>)?/i);
  if (!m) return null;
  const attrs = m[1];
  const src = (attrs.match(/\bsrc="([^"]+)"/i) || [])[1];
  const alt = (attrs.match(/\balt="([^"]*)"/i) || [])[1] || '';
  if (!src) return null;
  const resolved = resolveImageUrl(decodeEntities(src));
  if (!resolved) return null;
  const credit = m[2] ? decodeEntities(m[2].replace(/<[^>]+>/g, '')).trim() : '';
  return {
    src: resolved.src,
    imageUrl: resolved.imageUrl,
    alt: decodeEntities(alt),
    ...(credit ? { credit } : {}),
    matchedHtml: m[0]
  };
}

function applyCover(html, frontmatterCover, label) {
  const fromMatter = normalizeCover(frontmatterCover, label);
  const fromBody = firstBodyImage(html);
  let cover = fromMatter;
  if (!cover && fromBody) {
    cover = {
      src: fromBody.src,
      alt: fromBody.alt || 'Article image',
      imageUrl: fromBody.imageUrl,
      ...(fromBody.credit ? { credit: fromBody.credit } : {})
    };
  }
  let body = html;
  if (cover && fromBody && sameSrc(cover.src, fromBody.src)) {
    body = html.replace(fromBody.matchedHtml, '').trim();
  }
  return { cover, html: body };
}

export function parsePost(filename, raw) {
  const slug = filename.replace(/\.md$/i, '');
  const label = `content/blog/${filename}`;
  if (!SLUG_RE.test(slug)) {
    throw new Error(`${label}: filename must be a kebab-case slug (got "${filename}")`);
  }

  const parsed = matter(raw);
  const data = parsed.data || {};
  const body = String(parsed.content || '').trim();
  if (!body) throw new Error(`${label}: the Markdown body is empty`);

  for (const field of ['date', 'updated', 'lastVerified']) {
    if (data[field] instanceof Date && !Number.isNaN(data[field].getTime())) {
      data[field] = data[field].toISOString().slice(0, 10);
    }
  }
  for (const field of ['title', 'description', 'date', 'updated', 'lastVerified', 'lang']) {
    if (!data[field] || typeof data[field] !== 'string') {
      throw new Error(`${label}: missing or invalid "${field}"`);
    }
  }
  if (typeof data.draft !== 'boolean') {
    throw new Error(`${label}: "draft" must be true or false`);
  }

  assertDate(data.date, 'date', label);
  assertDate(data.updated, 'updated', label);
  assertDate(data.lastVerified, 'lastVerified', label);

  const lang = String(data.lang).trim().toLowerCase();
  if (!/^[a-z]{2}(?:-[a-z]{2})?$/.test(lang)) {
    throw new Error(`${label}: "lang" must be a language code such as en or fr`);
  }

  const exams = normalizeList(data.exams, 'exams', BLOG_EXAMS, label);
  const audience = normalizeList(data.audience, 'audience', AUDIENCES, label);
  const sources = normalizeSources(data.sources, label);
  const faq = normalizeFaq(data.faq, label);

  let seoTitle = null;
  if (data.seoTitle !== undefined && data.seoTitle !== null) {
    if (typeof data.seoTitle !== 'string' || !data.seoTitle.trim()) {
      throw new Error(`${label}: "seoTitle" must be a non-empty string when set`);
    }
    seoTitle = data.seoTitle.trim();
  }

  const rendered = md.render(body);
  const { cover, html } = applyCover(rendered, data.cover, label);
  const headings = extractHeadings(html);
  const words = wordCount(body);
  const readingMinutes = Math.max(1, Math.round(words / 220));

  return {
    slug,
    title: data.title.trim(),
    seoTitle,
    description: data.description.trim(),
    date: data.date,
    updated: data.updated,
    lastVerified: data.lastVerified,
    exams,
    audience,
    lang,
    sources,
    faq,
    cover,
    draft: data.draft,
    html,
    headings,
    readingMinutes,
    wordCount: words,
    url: `/blog/${slug}`,
    canonical: `${SITE_ORIGIN}/blog/${slug}`
  };
}

export function loadBlogPosts({ includeDrafts = includeDraftsFromEnv(), contentDir = CONTENT_DIR } = {}) {
  if (!fs.existsSync(contentDir)) return [];
  const files = fs.readdirSync(contentDir).filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md');
  const posts = files.map((file) => {
    const raw = fs.readFileSync(path.join(contentDir, file), 'utf8');
    return parsePost(file, raw);
  });
  const visible = includeDrafts ? posts : posts.filter((p) => !p.draft);
  visible.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));
  return visible;
}

export function allExamTags(posts) {
  const set = new Set();
  for (const post of posts) for (const exam of post.exams) set.add(exam);
  return [...set].sort((a, b) => examLabel(a).localeCompare(examLabel(b)));
}

export function postsForExam(posts, exam) {
  const id = String(exam || '').trim().toUpperCase();
  return posts.filter((p) => p.exams.includes(id));
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Suffix appended to a post's seoTitle (or title) to form the document <title>. */
export const POST_TITLE_SUFFIX = ' · OpenExam Hub';

/** Head title and meta description for the /blog index (shared with CollectionPage JSON-LD). */
export const BLOG_INDEX_TITLE = 'Blog · OpenExam Hub';
export const BLOG_INDEX_DESCRIPTION =
  'Guides on language exams for students, professionals and immigration applicants: what they are used for, who asks for them, and when to start preparing.';

/** CollectionPage + ItemList for /blog. Item order must match the visible listing. */
export function blogIndexJsonLd(posts = []) {
  const list = posts || [];
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_ORIGIN}/blog#webpage`,
    name: BLOG_INDEX_TITLE,
    description: BLOG_INDEX_DESCRIPTION,
    url: `${SITE_ORIGIN}/blog`,
    isPartOf: {
      '@type': 'Blog',
      '@id': `${SITE_ORIGIN}/blog#blog`,
      name: 'OpenExam Hub Blog',
      url: `${SITE_ORIGIN}/blog`
    },
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: list.length,
      itemListElement: list.map((post, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: post.title,
        url: post.canonical
      }))
    }
  };
}

/** Full <title> / og:title / twitter:title for a blog post. */
export function postHeadTitle(post) {
  const base = (post.seoTitle || post.title || '').trim();
  return `${base}${POST_TITLE_SUFFIX}`;
}

export function articleJsonLd(post) {
  // Dates, language and headline come from the post frontmatter. Posts have no named author
  // field, so the author is the publishing organisation (no invented people).
  const data = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.updated || post.date,
    inLanguage: post.lang,
    mainEntityOfPage: { '@type': 'WebPage', '@id': post.canonical },
    url: post.canonical,
    image: post.cover?.imageUrl || `${SITE_ORIGIN}/og-image.jpg`,
    wordCount: post.wordCount || undefined,
    keywords: post.exams.map(examLabel).join(', '),
    about: post.exams.map((id) => {
      const page = examPagesForTag(id)[0];
      return page
        ? { '@type': 'Thing', name: examLabel(id), url: `${SITE_ORIGIN}/exams/${page.slug}` }
        : { '@type': 'Thing', name: examLabel(id) };
    }),
    isPartOf: { '@type': 'Blog', '@id': `${SITE_ORIGIN}/blog#blog`, name: 'OpenExam Hub Blog', url: `${SITE_ORIGIN}/blog` },
    author: { '@type': 'Organization', '@id': ORG_ID, name: 'OpenExam Hub', url: `${SITE_ORIGIN}/` },
    publisher: {
      '@type': 'Organization',
      '@id': ORG_ID,
      name: 'OpenExam Hub',
      url: `${SITE_ORIGIN}/`,
      logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/icon-512.png` }
    }
  };
  if (!data.wordCount) delete data.wordCount;
  return data;
}

/** BreadcrumbList for blog routes: Home > Blog [> exam tag] [> post]. */
export function blogBreadcrumbJsonLd({ post = null, exam = null } = {}) {
  const items = [
    { name: 'Home', item: `${SITE_ORIGIN}/` },
    { name: 'Blog', item: `${SITE_ORIGIN}/blog` }
  ];
  if (exam) items.push({ name: examLabel(exam), item: `${SITE_ORIGIN}/blog/tag/${exam}` });
  if (post) items.push({ name: post.title, item: post.canonical });
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.item }))
  };
}

export function faqJsonLd(post) {
  if (!post.faq?.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: post.faq.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a }
    }))
  };
}

// Marketing pages and /exams guides come from src/seo/site.js so the sitemap and the prerender agree.
// Left out: /app (a sign-in wall, nothing to index) and /blog/tag/* (thin listing pages; the ones
// with fewer than TAG_INDEX_MIN_POSTS posts also carry noindex,follow).
export const SITEMAP_EXCLUDED = ['/app'];
export const TAG_INDEX_MIN_POSTS = 3;
export const SITEMAP_PATHS = [...indexablePaths().filter((p) => !SITEMAP_EXCLUDED.includes(p)), '/blog'];
const STATIC_PAGES = SITEMAP_PATHS;

export function buildSitemapXml(posts) {
  const urls = [];
  const latest = posts[0]?.updated || posts[0]?.date;
  for (const loc of STATIC_PAGES) {
    const lastmod = loc === '/blog' && latest ? `\n    <lastmod>${latest}</lastmod>` : '';
    urls.push(`  <url>\n    <loc>${SITE_ORIGIN}${loc === '/' ? '/' : loc}</loc>${lastmod}\n  </url>`);
  }
  for (const post of posts) {
    urls.push(
      `  <url>\n    <loc>${post.canonical}</loc>\n    <lastmod>${post.updated || post.date}</lastmod>\n  </url>`
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

function rfc822(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toUTCString();
}

export function buildRssXml(posts) {
  const items = posts
    .map((post) => {
      const desc = escapeHtml(post.description);
      return `    <item>
      <title>${escapeHtml(post.title)}</title>
      <link>${post.canonical}</link>
      <guid isPermaLink="true">${post.canonical}</guid>
      <pubDate>${rfc822(post.date)}</pubDate>
      <description>${desc}</description>
    </item>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>OpenExam Hub Blog</title>
    <link>${SITE_ORIGIN}/blog</link>
    <atom:link href="${SITE_ORIGIN}/blog/rss.xml" rel="self" type="application/rss+xml"/>
    <description>Guides on language exams for students, professionals and immigration applicants. Official sources only.</description>
    <language>en</language>
${items}
  </channel>
</rss>
`;
}
