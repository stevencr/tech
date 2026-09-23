import type { ReactNode } from 'react';

type ArticleCalloutProps = {
  children: ReactNode;
};

export function ArticleCallout({ children }: ArticleCalloutProps) {
  return <div className="article__callout">{children}</div>;
}
