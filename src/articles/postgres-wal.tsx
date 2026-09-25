import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = { slug: 'postgres-wal', title: 'PostgreSQL WAL', subtitle: 'How a database survives a power cut', category: 'Databases', description: 'Write-ahead logging, checkpoints and crash recovery inside PostgreSQL.', date: '2026-10-07', readingTime: 14, tags: ['PostgreSQL', 'WAL', 'Durability', 'Databases'] };

export function PostgresWalArticle() {
  return <ArticleLayout meta={meta}>
    <ArticleSection title="The core rule"><p>PostgreSQL does not need to flush every changed table page before reporting a transaction as committed. Instead it records enough information in its write-ahead log to reproduce changes after a crash.</p><ArticleCallout>WAL means the durable description of a change reaches storage before the corresponding data page is allowed to lag behind it.</ArticleCallout></ArticleSection>
    <ArticleSection title="The write path"><ArticleDiagram items={[{title:'Transaction',description:'Changes rows and indexes'},{title:'Shared buffers',description:'Data pages become dirty'},{title:'WAL buffers',description:'Records describe changes'},{title:'WAL files',description:'Sequential durable log'},{title:'Data files',description:'Dirty pages written later'}]} /><p>The WAL is predominantly sequential, which is easier to persist efficiently than scattered random data-page writes.</p></ArticleSection>
    <ArticleSection title="Commit is a durability boundary"><p>At commit, PostgreSQL must ensure the relevant WAL records satisfy configured durability semantics. Data pages can still be dirty in shared buffers.</p><p>This separation lets PostgreSQL acknowledge transactions without synchronously rewriting every affected table and index page.</p></ArticleSection>
    <ArticleSection title="Checkpoints"><p>Checkpoints push older dirty pages to data files and establish a recovery point, bounding how much WAL normally needs replaying after a crash.</p></ArticleSection>
    <ArticleSection title="Crash recovery"><p>After an unclean shutdown, PostgreSQL starts from the last checkpoint and replays WAL records describing changes made afterwards.</p></ArticleSection>
    <ArticleSection title="Why this matters"><p>WAL underpins crash recovery, replication and point-in-time recovery. Replication slots, archiving and recovery targets are variations on the durable-log idea.</p></ArticleSection>
  </ArticleLayout>;
}