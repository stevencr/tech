import type { ReactNode } from 'react';

type ArticleCodeProps = {
  children: ReactNode;
};

export function ArticleCode({ children }: ArticleCodeProps) {
  return (
    <pre>
      <code>{children}</code>
    </pre>
  );
}
