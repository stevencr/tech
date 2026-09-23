import { useMemo } from 'react';

export function LegacyArticle({ source }: { source: string }) {
  const html = useMemo(() => {
    const document = new DOMParser().parseFromString(source, 'text/html');
    const article = document.querySelector('.article');

    if (!article) return '';

    article.querySelector('h1')?.remove();
    article.querySelector('.article__eyebrow')?.remove();
    article.querySelector('.article__meta')?.remove();
    article.querySelector('.lead')?.remove();

    return article.innerHTML;
  }, [source]);

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
