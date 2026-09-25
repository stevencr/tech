import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = { slug: 'redis-internals', title: 'Redis Under the Hood', subtitle: 'Why an in-memory data structure server can be so fast', category: 'Databases', description: 'Redis event processing, data structures, persistence and the trade-offs behind low latency.', date: '2026-10-10', readingTime: 14, tags: ['Redis', 'Databases', 'Data Structures', 'Performance'] };

export function RedisInternalsArticle() {
  return <ArticleLayout meta={meta}>
    <ArticleSection title="Fast is an architectural property"><p>Redis keeps its primary working data in memory and exposes operations designed around compact data structures. That removes many storage waits from the common request path.</p><ArticleCallout>Redis is not fast simply because it is a hash map. Its latency comes from memory residency, efficient structures, a simple execution model and bounded work.</ArticleCallout></ArticleSection>
    <ArticleSection title="The request path"><ArticleDiagram items={[{title:'Client',description:'RESP request'},{title:'Socket',description:'Network I/O'},{title:'Event loop',description:'Read and dispatch'},{title:'Command',description:'Data-structure operation'},{title:'Reply',description:'Encode and write response'}]} /><p>The traditional execution model avoids per-command thread scheduling for ordinary command processing. One expensive command can therefore delay other clients.</p></ArticleSection>
    <ArticleSection title="Data structures"><p>Strings, hashes, lists, sets, sorted sets and streams have different internal representations. Choosing a Redis type is an algorithmic decision, not just a schema decision.</p></ArticleSection>
    <ArticleSection title="Persistence changes the picture"><p>Redis can persist through snapshots and append-only logging. Persistence introduces storage and recovery trade-offs, so “in memory” does not mean “never written to disk”.</p></ArticleSection>
    <ArticleSection title="The single-threaded myth"><p>Modern Redis uses additional threads for selected I/O and background work. The useful mental model is serialized command execution, not that every byte of work happens on one CPU thread.</p></ArticleSection>
    <ArticleSection title="When Redis hurts"><p>Large keys, expensive commands, unbounded scans and memory pressure can destroy its latency characteristics. Measure command latency and memory rather than assuming Redis is universally cheap.</p></ArticleSection>
  </ArticleLayout>;
}