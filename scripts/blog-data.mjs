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
import { KNOWN_EXAMS } from '../lib/exams.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '..');
export const CONTENT_DIR = path.join(REPO_ROOT, 'content', 'blog');
export const SITE_ORIGIN = 'https://openexamhub.org';

export const AUDIENCES = ['students', 'professionals', 'immigration'];

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

  const exams = normalizeList(data.exams, 'exams', KNOWN_EXAMS, label);
  const audience = normalizeList(data.audience, 'audience', AUDIENCES, label);
  const sources = normalizeSources(data.sources, label);
  const faq = normalizeFaq(data.faq, label);

  const html = md.render(body);
  const headings = extractHeadings(html);
  const words = wordCount(body);
  const readingMinutes = Math.max(1, Math.round(words / 220));

  return {
    slug,
    title: data.title.trim(),
    description: data.description.trim(),
    date: data.date,
    updated: data.updated,
    lastVerified: data.lastVerified,
    exams,
    audience,
    lang,
    sources,
    faq,
    draft: data.draft,
    html,
    headings,
    readingMinutes,
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

export function articleJsonLd(post) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.updated || post.date,
    inLanguage: post.lang,
    mainEntityOfPage: post.canonical,
    url: post.canonical,
    image: `${SITE_ORIGIN}/og-image.jpg`,
    author: { '@type': 'Organization', name: 'OpenExam Hub', url: SITE_ORIGIN },
    publisher: {
      '@type': 'Organization',
      name: 'OpenExam Hub',
      url: SITE_ORIGIN,
      logo: { '@type': 'ImageObject', url: `${SITE_ORIGIN}/icon-512.png` }
    }
  };
  return data;
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

const STATIC_PAGES = ['/', '/app', '/about', '/faq', '/funding', '/privacy', '/terms', '/blog'];

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
  for (const exam of allExamTags(posts)) {
    urls.push(`  <url>\n    <loc>${SITE_ORIGIN}/blog/tag/${exam}</loc>\n  </url>`);
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
