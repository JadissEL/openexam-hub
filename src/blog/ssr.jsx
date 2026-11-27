import React from 'react';
import { renderToString } from 'react-dom/server';
import BlogApp from './BlogApp.jsx';
import { LocaleProvider } from '../i18n/LocaleContext.jsx';
import { splitLocale } from '../i18n/paths.js';
export { registerCatalog } from '../i18n/runtime.js';

/** Server-render a blog route to HTML for the prerender step. */
export function renderBlog(pathname, posts, locale) {
  const split = splitLocale(pathname);
  const loc = locale || split.locale;
  return renderToString(
    <LocaleProvider locale={loc} path={split.path}>
      <BlogApp pathname={split.path} posts={posts} />
    </LocaleProvider>
  );
}
