import type { ReactNode } from 'react';
import type { ArticleMeta } from '../articles/types';

type ArticleLayoutProps = {
  meta: Pick<ArticleMeta, 'category' | 'title' | 'subtitle' | 'date' | 'readingTime' | 'tags'>;
  children: ReactNode;
  onDelete?: () => void;
};

export function ArticleLayout({ meta, children, onDelete }: ArticleLayoutProps) {
  return (
    <article className="article">
      <div className="article__meta">
        <span>{meta.category}</span>
        <span>{meta.readingTime} min read</span>
        <time dateTime={meta.date}>{meta.date}</time>
      </div>
      <header className="article__header">
        <h1>{meta.title}</h1>
        <p className="article__lead">{meta.subtitle}</p>
        <div className="article__toolbar">
          <div className="article__tags">
            {meta.tags.map((tag) => <span className="article__tag" key={tag}>{tag}</span>)}
          </div>
          {onDelete && <button className="delete-button" type="button" onClick={onDelete}>Delete article</button>}
        </div>
      </header>
      <div className="article__content">{children}</div>
      <p className="article__delete-note">
        Delete removes this article from this browser's library. It does not delete the Markdown source from GitHub.
      </p>
    </article>
  );
}
