/**
 * Vite plugin for the OpenExam Hub blog.
 * - Virtual module `virtual:blog-posts` for the client app.
 * - After the client build: prerender blog HTML, sitemap.xml and /blog/rss.xml.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import {
  loadBlogPosts,
  includeDraftsFromEnv,
  buildSitemapXml,
  buildRssXml,
  articleJsonLd,
  blogBreadcrumbJsonLd,
  blogIndexJsonLd,
  faqJsonLd,
  examLabel,
  SITE_ORIGIN,
  REPO_ROOT,
  postHeadTitle,
  BLOG_INDEX_TITLE,
  BLOG_INDEX_DESCRIPTION
} from './blog-data.mjs';
import { prerenderPages } from './prerender-pages.mjs';
import { TAG_INDEX_MIN_POSTS } from './blog-data.mjs';
import { organizationJsonLd, websiteJsonLd } from '../src/seo/site.js';
import { localeHead, isPagePublished } from '../src/i18n/publish.js';
import { ENABLED_LOCALES } from '../src/i18n/locales.js';
import { registerCatalog } from '../src/i18n/runtime.js';
import { loadCatalog } from './load-catalog.mjs';
import { postsForLocale } from './blog-data.mjs';

const VIRTUAL_ID = 'virtual:blog-posts';
const RESOLVED_VIRTUAL_ID = '\0' + VIRTUAL_ID;

function includeDrafts() {
  return includeDraftsFromEnv();
}

function moduleSource() {
  const posts = loadBlogPosts({ includeDrafts: includeDrafts() });
  return `export const includeDrafts = ${JSON.stringify(includeDrafts())};
export const posts = ${JSON.stringify(posts)};
`;
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function jsonLdScript(data) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `    <script type="application/ld+json">${json}</script>`;
}

export function applyHead(template, { title, description, canonical, type = 'website', jsonLd = [], lang = 'en', dir = 'ltr', image = null, imageAlt = null, rss = true, alternates = [], ogLocale = null, ogLocaleAlternates = [], fontHref = null }) {
  let html = template;
  html = html.replace(/<html\b[^>]*>/, `<html lang="${escapeAttr(lang)}" dir="${escapeAttr(dir)}">`);
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeAttr(title)}</title>`);
  html = html.replace(
    /<meta name="description" content="[^"]*"\s*\/>/,
    `<meta name="description" content="${escapeAttr(description)}" />`
  );
  html = html.replace(
    /<link rel="canonical" href="[^"]*"\s*\/>/,
    `<link rel="canonical" href="${escapeAttr(canonical)}" />`
  );
  html = html.replace(/<meta property="og:type" content="[^"]*"\s*\/>/, `<meta property="og:type" content="${escapeAttr(type)}" />`);
  html = html.replace(/<meta property="og:url" content="[^"]*"\s*\/>/, `<meta property="og:url" content="${escapeAttr(canonical)}" />`);
  html = html.replace(/<meta property="og:title" content="[^"]*"\s*\/>/, `<meta property="og:title" content="${escapeAttr(title)}" />`);
  html = html.replace(
    /<meta property="og:description" content="[^"]*"\s*\/>/,
    `<meta property="og:description" content="${escapeAttr(description)}" />`
  );
  html = html.replace(/<meta name="twitter:title" content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${escapeAttr(title)}" />`);
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*"\s*\/>/,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`
  );
  if (image) {
    html = html.replace(/<meta property="og:image" content="[^"]*"\s*\/>/, `<meta property="og:image" content="${escapeAttr(image)}" />`);
    html = html.replace(/<meta name="twitter:image" content="[^"]*"\s*\/>/, `<meta name="twitter:image" content="${escapeAttr(image)}" />`);
    if (imageAlt) {
      html = html.replace(/<meta property="og:image:alt" content="[^"]*"\s*\/>/, `<meta property="og:image:alt" content="${escapeAttr(imageAlt)}" />`);
    }
  }
  const alternateLinks = [
    ...alternates.map((alt) => `    <link rel="alternate" hreflang="${escapeAttr(alt.hreflang)}" href="${escapeAttr(alt.href)}" />`),
    ...(ogLocale ? [`    <meta property="og:locale" content="${escapeAttr(ogLocale)}" />`] : []),
    ...ogLocaleAlternates.map((value) => `    <meta property="og:locale:alternate" content="${escapeAttr(value)}" />`),
    ...(fontHref ? [`    <link rel="stylesheet" href="${escapeAttr(fontHref)}" />`] : [])
  ];
  const extra = [
    ...(rss ? [`    <link rel="alternate" type="application/rss+xml" title="OpenExam Hub Blog" href="${SITE_ORIGIN}/blog/rss.xml" />`] : []),
    ...alternateLinks,
    ...jsonLd.filter(Boolean).map(jsonLdScript)
  ].join('\n');
  html = html.replace('</head>', `${extra}\n  </head>`);
  return html;
}

export function stripModuleScripts(html) {
  // Static blog HTML is complete; loading the SPA would replace #root and flash "Loading…".
  return html.replace(/<script type="module"[^>]*><\/script>/g, '').replace(/<script type="module"[^>]*>[\s\S]*?<\/script>/g, '');
}

export function injectRoot(template, bodyHtml) {
  if (!/<div id="root"><\/div>/.test(template)) {
    throw new Error('prerender: dist/index.html is missing an empty #root');
  }
  return template.replace('<div id="root"></div>', `<div id="root">${bodyHtml}</div>`);
}

export function writePage(distDir, urlPath, html) {
  const clean = String(urlPath || '/').replace(/\/+$/, '') || '/';
  const rel = clean === '/' ? 'index.html' : `${clean.replace(/^\//, '')}/index.html`;
  const file = path.join(distDir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}

async function bundleSsr() {
  const outfile = path.join(REPO_ROOT, 'dist', '.blog-ssr.mjs');
  await esbuild.build({
    entryPoints: [path.join(REPO_ROOT, 'src/blog/ssr.jsx')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    logLevel: 'silent'
  });
  return outfile;
}

async function prerender(distDir) {
  const templatePath = path.join(distDir, 'index.html');
  if (!fs.existsSync(templatePath)) {
    throw new Error('prerender: dist/index.html not found');
  }
  const template = fs.readFileSync(templatePath, 'utf8');
  const posts = loadBlogPosts({ includeDrafts: includeDrafts() });

  const ssrFile = await bundleSsr();
  const ssr = await import(pathToFileURL(ssrFile).href);
  const { renderBlog } = ssr;
  for (const code of ENABLED_LOCALES) {
    const cat = loadCatalog(code);
    if (!cat) continue;
    registerCatalog(code, cat);
    if (ssr.registerCatalog) ssr.registerCatalog(code, cat);
  }

  const blogHead = (locale, path, title, description) => localeHead(locale, path, title, description);
  const indexHead = blogHead('en', '/blog', BLOG_INDEX_TITLE, BLOG_INDEX_DESCRIPTION);
  const indexHtml = stripModuleScripts(
    injectRoot(
      applyHead(template, {
        ...indexHead,
        type: 'website',
        jsonLd: [blogIndexJsonLd(posts), blogBreadcrumbJsonLd()],
        rss: true
      }),
      renderBlog('/blog', posts, 'en')
    )
  );
  writePage(distDir, '/blog', indexHtml);

  const exams = [...new Set(posts.flatMap((p) => p.exams))];
  for (const exam of exams) {
    const title = `Blog · ${examLabel(exam)} · OpenExam Hub`;
    const description = `Articles about ${examLabel(exam)} for students, professionals and immigration applicants.`;
    const html = stripModuleScripts(
      injectRoot(
        applyHead(template, {
          title,
          description,
          canonical: `${SITE_ORIGIN}/blog/tag/${exam}`,
          type: 'website',
          jsonLd: [blogBreadcrumbJsonLd({ exam })]
        }),
        renderBlog(`/blog/tag/${exam}`, posts, 'en')
      )
    );
    // Thin tag pages stay crawlable (follow) but out of the index until they list enough posts.
    const count = posts.filter((p) => p.exams.includes(exam)).length;
    const robots = count < TAG_INDEX_MIN_POSTS ? html.replace('</head>', '    <meta name="robots" content="noindex,follow" />\n  </head>') : html;
    writePage(distDir, `/blog/tag/${exam}`, robots);
  }

  for (const post of posts) {
    const jsonLd = [articleJsonLd(post), blogBreadcrumbJsonLd({ post, exam: post.exams[0] || null })];
    const faq = faqJsonLd(post);
    if (faq) jsonLd.push(faq);
    const postHead = blogHead('en', post.url, postHeadTitle(post), post.description);
    const html = stripModuleScripts(
      injectRoot(
        applyHead(template, {
          ...postHead,
          type: 'article',
          jsonLd,
          image: post.cover?.imageUrl || `${SITE_ORIGIN}/og-image.jpg`,
          imageAlt: post.cover?.alt || null,
          rss: true
        }),
        renderBlog(post.url, posts, 'en')
      )
    );
    writePage(distDir, post.url, html);
  }

  for (const code of ENABLED_LOCALES) {
    if (!isPagePublished(code, '/blog')) continue;
    const localized = postsForLocale(posts, code);
    if (!localized.length) continue;
    const head = blogHead(code, '/blog', BLOG_INDEX_TITLE, BLOG_INDEX_DESCRIPTION);
    writePage(distDir, `/${code}/blog`, stripModuleScripts(injectRoot(
      applyHead(template, { ...head, type: 'website', jsonLd: [blogIndexJsonLd(localized, { url: head.canonical, name: head.title, description: head.description }), blogBreadcrumbJsonLd()], rss: false }),
      renderBlog('/blog', localized, code)
    )));
    for (const post of localized) {
      const jsonLd = [articleJsonLd(post), blogBreadcrumbJsonLd({ post, exam: post.exams[0] || null })];
      const faq = faqJsonLd(post);
      if (faq) jsonLd.push(faq);
      const one = blogHead(code, `/blog/${post.slug}`, postHeadTitle(post), post.description);
      writePage(distDir, post.url, stripModuleScripts(injectRoot(
        applyHead(template, {
          ...one,
          type: 'article',
          jsonLd,
          image: post.cover?.imageUrl || `${SITE_ORIGIN}/og-image.jpg`,
          imageAlt: post.cover?.alt || null,
          rss: false
        }),
        renderBlog(`/blog/${post.slug}`, localized, code)
      )));
    }
  }

  const pages = await prerenderPages(distDir, template, { applyHead, injectRoot, stripModuleScripts, writePage, posts });

  fs.writeFileSync(path.join(distDir, 'sitemap.xml'), buildSitemapXml(posts));
  const rssDir = path.join(distDir, 'blog');
  fs.mkdirSync(rssDir, { recursive: true });
  fs.writeFileSync(path.join(rssDir, 'rss.xml'), buildRssXml(posts));

  try {
    fs.unlinkSync(ssrFile);
  } catch {
    // ignore
  }

  return { posts: posts.length, pages: pages.length, draftsIncluded: includeDrafts() };
}

export default function blogPlugin() {
  return {
    name: 'oeh-blog',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
    },
    transformIndexHtml(html) {
      // Sitewide Organization + WebSite JSON-LD, so every page (SPA shell, prerendered pages, blog) carries it.
      const graph = { '@context': 'https://schema.org', '@graph': [organizationJsonLd(), websiteJsonLd()].map(({ '@context': _c, ...rest }) => rest) };
      return html.replace('</head>', `${jsonLdScript(graph)}\n  </head>`);
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_ID) return moduleSource();
    },
    configureServer(server) {
      const dir = path.join(REPO_ROOT, 'content', 'blog');
      if (fs.existsSync(dir)) server.watcher.add(dir);
      const reload = (file) => {
        if (file.includes(`${path.sep}content${path.sep}blog${path.sep}`) && file.endsWith('.md')) {
          const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
          if (mod) server.reloadModule(mod);
        }
      };
      server.watcher.on('change', reload);
      server.watcher.on('add', reload);
      server.watcher.on('unlink', reload);
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];
        if (url !== '/blog/rss.xml') return next();
        const xml = buildRssXml(loadBlogPosts({ includeDrafts: includeDrafts() }));
        res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
        res.end(xml);
      });
    },
    configurePreviewServer(server) {
      // Serve prerendered HTML (blog, exam guides, info pages) and RSS before Vite's SPA fallback,
      // so `vite preview` matches how Vercel serves the static files.
      const distDir = path.join(REPO_ROOT, 'dist');
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url || '').split('?')[0]);
        if (url.includes('..') || url.startsWith('/api')) return next();
        let file = null;
        if (url === '/blog/rss.xml') file = path.join(distDir, 'blog', 'rss.xml');
        else if (url !== '/') {
          // Any prerendered route (/blog/..., /exams/..., /about, ...) is served from <route>/index.html.
          const rel = url.replace(/^\//, '').replace(/\/$/, '');
          const candidate = path.resolve(distDir, rel, 'index.html');
          if (candidate.startsWith(path.resolve(distDir) + path.sep) && fs.existsSync(candidate)) {
            file = candidate;
          }
        }
        if (!file || !fs.existsSync(file)) return next();
        res.setHeader('Content-Type', file.endsWith('.xml') ? 'application/rss+xml; charset=utf-8' : 'text/html; charset=utf-8');
        fs.createReadStream(file).pipe(res);
      });
    },
    async writeBundle(options) {
      const distDir = options.dir || path.join(REPO_ROOT, 'dist');
      const result = await prerender(distDir);
      this.info(
        `blog: prerendered ${result.posts} post(s), ${result.pages} site page(s), sitemap and RSS (${result.draftsIncluded ? 'drafts included' : 'production, drafts excluded'})`
      );
    }
  };
}
