import { useMemo } from 'react';
import type { ReactNode } from 'react';

export function RawArticle({ source }: { source: string }): ReactNode {
  const html = useMemo(() => new DOMParser().parseFromString(source, 'text/html').querySelector('.article')?.innerHTML ?? '', [source]);
  return <article className="article" dangerouslySetInnerHTML={{ __html: html }} />;
}