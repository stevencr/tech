import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'replace-me',
  title: 'Article title',
  subtitle: 'A concise description of the idea this article explores.',
  category: 'Category',
  description: 'A short description used on the home page and article library.',
};

export function ReplaceMeArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>Start the article here.</p>

      <h2>How it works</h2>
      <p>Explain the underlying mechanism, not just the API.</p>

      <h2>Practical example</h2>
      <pre>
        <code>{`// Add a focused example here`}</code>
      </pre>

      <h2>Trade-offs and sharp edges</h2>
      <p>Cover limitations, misconceptions and real-world failure modes.</p>

      <div className="article__callout">
        <strong>Takeaway:</strong> Finish with the key idea the reader should remember.
      </div>
    </ArticleLayout>
  );
}
