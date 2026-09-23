import type { ReactNode } from 'react';
import type { ArticleMeta } from '../articles/types';

type ArticleLayoutProps = {
  meta: Pick<ArticleMeta, 'category' | 'title' | 'subtitle'>;
  children: ReactNode;
};

export function ArticleLayout({ meta, children }: ArticleLayoutProps) {
  return (
    <article className="article">
      <div className="article__meta">
        <span>{meta.category}</span>
        <span>Deep dive</span>
      </div>
      <header className="article__header">
        <h1>{meta.title}</h1>
        <p className="article__lead">{meta.subtitle}</p>
      </header>
      <div className="article__content">{children}</div>
    </article>
  );
}
