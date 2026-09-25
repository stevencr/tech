import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = { slug: 'javascript-garbage-collection', title: 'JavaScript Garbage Collection', subtitle: 'How V8 finds memory it can reclaim', category: 'JavaScript', description: 'A practical look at tracing garbage collection, generations, allocation and pauses in V8.', date: '2026-10-09', readingTime: 15, tags: ['JavaScript', 'V8', 'Garbage Collection', 'Memory'] };

export function JavascriptGarbageCollectionArticle() {
  return <ArticleLayout meta={meta}>
    <ArticleSection title="The problem"><p>JavaScript creates objects continuously without exposing explicit free(). A runtime must determine which objects can still be reached and reclaim the rest.</p><ArticleCallout>Garbage collection is fundamentally a reachability problem: an object is collectible when no live root can reach it.</ArticleCallout></ArticleSection>
    <ArticleSection title="Tracing"><ArticleDiagram items={[{title:'Roots',description:'Stacks, globals and runtime references'},{title:'Trace',description:'Follow object references'},{title:'Live graph',description:'Reachable objects remain'},{title:'Garbage',description:'Unreachable objects can be reclaimed'}]} /><p>Tracing starts from roots and follows references. Unlike reference counting, it can naturally handle cycles.</p></ArticleSection>
    <ArticleSection title="Why generations help"><p>Most newly allocated objects die young. V8 therefore separates young and old objects and can collect the young generation frequently, promoting survivors.</p></ArticleSection>
    <ArticleSection title="Not one big stop-the-world event"><p>Modern V8 uses incremental and concurrent techniques to reduce pauses. Collection remains observable as CPU and memory activity, but work need not all happen in one long pause.</p></ArticleSection>
    <ArticleSection title="Leaks still exist"><p>A garbage collector cannot distinguish an unwanted reference from an intentional one. Global caches, listeners, timers and closures can keep objects reachable forever.</p></ArticleSection>
    <ArticleSection title="Finding the problem"><p>Heap snapshots, allocation profiling and retained-object graphs reveal unexpected ownership paths more effectively than simply watching heap size.</p></ArticleSection>
  </ArticleLayout>;
}