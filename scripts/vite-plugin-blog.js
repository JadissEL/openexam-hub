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
  faqJsonLd,
  examLabel,
  SITE_ORIGIN,
  REPO_ROOT
} from './blog-data.mjs';

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

function applyHead(template, { title, description, canonical, type = 'website', jsonLd = [], lang = 'en', image = null, imageAlt = null }) {
  let html = template;
  html = html.replace(/<html\s+lang="[^"]*"/, `<html lang="${escapeAttr(lang)}"`);
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
  const extra = [
    `    <link rel="alternate" type="application/rss+xml" title="OpenExam Hub Blog" href="${SITE_ORIGIN}/blog/rss.xml" />`,
    ...jsonLd.map(jsonLdScript)
  ].join('\n');
  html = html.replace('</head>', `${extra}\n  </head>`);
  return html;
}

function stripModuleScripts(html) {
  // Static blog HTML is complete; loading the SPA would replace #root and flash "Loading…".
  return html.replace(/<script type="module"[^>]*><\/script>/g, '').replace(/<script type="module"[^>]*>[\s\S]*?<\/script>/g, '');
}

function injectRoot(template, bodyHtml) {
  if (!/<div id="root"><\/div>/.test(template)) {
    throw new Error('prerender: dist/index.html is missing an empty #root');
  }
  return template.replace('<div id="root"></div>', `<div id="root">${bodyHtml}</div>`);
}

function writePage(distDir, urlPath, html) {
  const rel = urlPath === '/blog' ? 'blog/index.html' : `${urlPath.replace(/^\//, '')}/index.html`;
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
  const { renderBlog } = await import(pathToFileURL(ssrFile).href);

  const indexTitle = 'Blog · OpenExam Hub';
  const indexDesc =
    'Guides on language exams for students, professionals and immigration applicants: what they are used for, who asks for them, and when to start preparing.';
  const indexHtml = stripModuleScripts(
    injectRoot(
      applyHead(template, {
        title: indexTitle,
        description: indexDesc,
        canonical: `${SITE_ORIGIN}/blog`,
        type: 'website'
      }),
      renderBlog('/blog', posts)
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
          type: 'website'
        }),
        renderBlog(`/blog/tag/${exam}`, posts)
      )
    );
    writePage(distDir, `/blog/tag/${exam}`, html);
  }

  for (const post of posts) {
    const jsonLd = [articleJsonLd(post)];
    const faq = faqJsonLd(post);
    if (faq) jsonLd.push(faq);
    const html = stripModuleScripts(
      injectRoot(
        applyHead(template, {
          title: `${post.title} · OpenExam Hub`,
          description: post.description,
          canonical: post.canonical,
          type: 'article',
          jsonLd,
          lang: post.lang,
          image: post.cover?.imageUrl || `${SITE_ORIGIN}/og-image.jpg`,
          imageAlt: post.cover?.alt || null
        }),
        renderBlog(post.url, posts)
      )
    );
    writePage(distDir, post.url, html);
  }

  fs.writeFileSync(path.join(distDir, 'sitemap.xml'), buildSitemapXml(posts));
  const rssDir = path.join(distDir, 'blog');
  fs.mkdirSync(rssDir, { recursive: true });
  fs.writeFileSync(path.join(rssDir, 'rss.xml'), buildRssXml(posts));

  try {
    fs.unlinkSync(ssrFile);
  } catch {
    // ignore
  }

  return { posts: posts.length, draftsIncluded: includeDrafts() };
}

export default function blogPlugin() {
  return {
    name: 'oeh-blog',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
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
      // Serve prerendered blog HTML and RSS before Vite's SPA fallback,
      // so `vite preview` matches how Vercel serves the static files.
      const distDir = path.join(REPO_ROOT, 'dist');
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url || '').split('?')[0]);
        if (!url.startsWith('/blog') || url.includes('..')) return next();
        let file = null;
        if (url === '/blog/rss.xml') file = path.join(distDir, 'blog', 'rss.xml');
        else if (url === '/blog' || url === '/blog/') file = path.join(distDir, 'blog', 'index.html');
        else {
          const rel = url.replace(/^\/blog\//, '').replace(/\/$/, '');
          const candidate = path.join(distDir, 'blog', rel, 'index.html');
          const resolved = path.resolve(candidate);
          if (resolved.startsWith(path.resolve(distDir, 'blog') + path.sep) && fs.existsSync(resolved)) {
            file = resolved;
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
        `blog: prerendered ${result.posts} post(s), sitemap and RSS (${result.draftsIncluded ? 'drafts included' : 'production, drafts excluded'})`
      );
    }
  };
}
