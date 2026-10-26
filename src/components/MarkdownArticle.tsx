import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type MarkdownArticleProps = { content: string };

export function MarkdownArticle({ content }: MarkdownArticleProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children, ...props }) => (
          <a href={href} {...props} target={href?.startsWith('http') ? '_blank' : undefined}
            rel={href?.startsWith('http') ? 'noreferrer noopener' : undefined}>{children}</a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
