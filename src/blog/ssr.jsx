import React from 'react';
import { renderToString } from 'react-dom/server';
import BlogApp from './BlogApp.jsx';

/** Server-render a blog route to HTML for the prerender step. */
export function renderBlog(pathname, posts) {
  return renderToString(<BlogApp pathname={pathname} posts={posts} />);
}
