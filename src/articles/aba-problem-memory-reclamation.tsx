import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'aba-problem-memory-reclamation',
  title: 'The ABA Problem: When Compare-and-Swap Lies by Omission',
  subtitle: 'Why pointer equality is not proof of unchanged state.',
  category: 'Algorithms & Concurrency',
  description: 'A deep dive into ABA and safe memory reclamation.',
  date: '2026-10-19',
  readingTime: 22,
  tags: ['Concurrency', 'Algorithms', 'Memory Models'],
};

export function AbaProblemMemoryReclamationArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>Compare-and-swap checks a value at one instant. It does not remember the history of that value or prove an object is still alive.</p>
      <pre><code>{'std::atomic<Node*> head;\nNode* observed = head.load();\nNode* next = observed->next;'}</code></pre>
    </ArticleLayout>
  );
}
