import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = { slug: 'consistent-hashing', title: 'Consistent Hashing', subtitle: 'How distributed systems move data without moving everything', category: 'Distributed Systems', description: 'The hash ring, virtual nodes and why consistent hashing reduces remapping when servers change.', date: '2026-10-13', readingTime: 14, tags: ['Distributed Systems', 'Hashing', 'Sharding', 'Caching'] };

export function ConsistentHashingArticle() {
  return <ArticleLayout meta={meta}>
    <ArticleSection title="The scaling problem"><p>With hash(key) modulo N, adding one server changes N and remaps a large fraction of keys. That causes cache misses or data movement.</p><ArticleCallout>Consistent hashing changes the problem from “divide by node count” to “find the next node on an ordered hash space”.</ArticleCallout></ArticleSection>
    <ArticleSection title="The ring"><ArticleDiagram items={[{title:'Hash space',description:'A circular ordered range'},{title:'Node A',description:'Owns a region'},{title:'Node B',description:'Owns the next region'},{title:'Node C',description:'Owns the next region'},{title:'Key',description:'Hash then walk clockwise'}]} /><p>Hash both nodes and keys into the same space. A key belongs to the first node encountered while walking around the ring.</p></ArticleSection>
    <ArticleSection title="Adding a node"><p>A joining node takes only the interval between itself and its predecessor. Most keys remain assigned to their previous nodes.</p></ArticleSection>
    <ArticleSection title="Virtual nodes"><p>Multiple virtual positions spread each machine's ownership around the ring, improving balance and reducing the impact of topology changes.</p></ArticleSection>
    <ArticleSection title="It is not magic"><p>Consistent hashing addresses ownership remapping, not replication, hot keys, node health, consistency or data transfer. Production systems layer other mechanisms on top.</p></ArticleSection>
    <ArticleSection title="Where it appears"><p>Caches, distributed databases, request routing and sharded services all have versions of this problem. The deeper lesson is to design scaling algorithms around how much state must move when topology changes.</p></ArticleSection>
  </ArticleLayout>;
}