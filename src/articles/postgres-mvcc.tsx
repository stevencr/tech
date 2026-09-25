import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCode } from '../components/article/ArticleCode';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = {
  slug: 'postgres-mvcc',
  title: 'PostgreSQL MVCC',
  subtitle: 'How a database lets readers and writers coexist',
  category: 'Databases',
  description: 'Tuple versions, snapshots, vacuum, transaction isolation and the storage mechanics behind PostgreSQL concurrency.',
  date: '2026-10-03',
  readingTime: 15,
  tags: ['PostgreSQL', 'MVCC', 'Transactions', 'Databases'],
};

export function PostgresMvccArticle() {
  return <ArticleLayout meta={meta}>
    <ArticleSection title="Concurrency without every read blocking every write">
      <p>PostgreSQL uses multiversion concurrency control. Instead of overwriting a row in place and forcing every reader to coordinate around that mutation, transactions can observe versions according to their snapshot.</p>
      <ArticleCallout>MVCC trades some storage and cleanup complexity for powerful concurrency semantics.</ArticleCallout>
    </ArticleSection>
    <ArticleSection title="Rows have history">
      <p>PostgreSQL heap tuples carry transaction visibility information. An UPDATE generally creates a new tuple version rather than simply changing bytes in the old one. A reader determines which version is visible to its snapshot.</p>
      <ArticleDiagram items={[
        { title: 'Old tuple', description: 'May remain physically present after an update.' },
        { title: 'New tuple', description: 'Contains the updated row version.' },
        { title: 'Snapshot', description: 'Determines which transaction effects are visible.' },
        { title: 'VACUUM', description: 'Reclaims storage from versions no longer needed.' },
      ]} />
    </ArticleSection>
    <ArticleSection title="Isolation is a visibility rule">
      <p>Transaction isolation levels determine which concurrent effects a transaction may observe. PostgreSQL's implementation combines snapshots, locking and transaction metadata rather than relying on one universal “database lock”.</p>
    </ArticleSection>
    <ArticleSection title="Why VACUUM matters">
      <p>Old tuple versions cannot remain forever. VACUUM helps reclaim dead tuples and maintain storage structures. Autovacuum is therefore part of normal database operation, not an optional housekeeping job you can ignore indefinitely.</p>
      <ArticleCode>{`VACUUM (ANALYZE) orders;
SELECT relname, n_live_tup, n_dead_tup
FROM pg_stat_user_tables;`}</ArticleCode>
    </ArticleSection>
    <ArticleSection title="Indexes complicate the picture">
      <p>Updating a row can also require index maintenance. PostgreSQL can sometimes use HOT updates when indexed columns do not change and there is room on the page, reducing index churn.</p>
    </ArticleSection>
    <ArticleSection title="Long transactions are dangerous">
      <p>A transaction holding an old snapshot can prevent PostgreSQL from treating some old row versions as reclaimable. This is one reason an apparently harmless forgotten transaction can contribute to table and database bloat.</p>
      <ArticleCallout>When diagnosing database growth, ask not only “how many rows exist?” but also “how long are old row versions being kept visible?”</ArticleCallout>
    </ArticleSection>
    <ArticleSection title="The bigger idea">
      <p>MVCC is a lesson in separating logical state from physical storage. What your query sees is a versioned interpretation of the heap, not necessarily the latest bytes physically stored on disk.</p>
    </ArticleSection>
  </ArticleLayout>;
}
