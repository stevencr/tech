import type { ReactNode } from 'react';

type ArticleSectionProps = {
  title: string;
  children: ReactNode;
};

export function ArticleSection({ title, children }: ArticleSectionProps) {
  return (
    <section className="article__section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
