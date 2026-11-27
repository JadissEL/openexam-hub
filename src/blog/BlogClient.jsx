import React, { useEffect } from 'react';
import { posts } from 'virtual:blog-posts';
import BlogApp, { parseBlogPath, examLabel } from './BlogApp.jsx';

export default function BlogClient() {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '/blog';
  const route = parseBlogPath(pathname);

  useEffect(() => {
    if (!route || route.kind === 'skip') {
      document.title = 'Post not found · OpenExam Hub';
      return;
    }
    if (route.kind === 'post') {
      const post = posts.find((p) => p.slug === route.slug);
      document.title = post ? `${post.seoTitle || post.title} · OpenExam Hub` : 'Post not found · OpenExam Hub';
      return;
    }
    if (route.kind === 'tag') {
      document.title = `Blog · ${examLabel(route.exam)} · OpenExam Hub`;
      return;
    }
    document.title = 'Blog · OpenExam Hub';
  }, [pathname]);

  return <BlogApp pathname={pathname} posts={posts} />;
}
