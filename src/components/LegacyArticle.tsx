import { useMemo } from 'react';

export function LegacyArticle({ source }: { source: string }) {
  const html = useMemo(
    () =>
      new DOMParser()
        .parseFromString(source, 'text/html')
        .querySelector('.article')?.innerHTML ?? '',
    [source],
  );

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
