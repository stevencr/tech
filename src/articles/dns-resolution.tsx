import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = { slug: 'dns-resolution', title: 'DNS Resolution Under the Hood', subtitle: 'What really happens when you type a hostname', category: 'Networking', description: 'Recursive resolvers, authoritative servers, caching and the path from a name to an IP address.', date: '2026-10-11', readingTime: 14, tags: ['DNS', 'Networking', 'Caching', 'Infrastructure'] };

export function DnsResolutionArticle() {
  return <ArticleLayout meta={meta}>
    <ArticleSection title="Names are data"><p>DNS maps names to records. Applications usually talk to a local or recursive resolver rather than directly to an authoritative server.</p></ArticleSection>
    <ArticleSection title="The chain"><ArticleDiagram items={[{title:'Application',description:'Needs a record'},{title:'Stub resolver',description:'Asks configured DNS service'},{title:'Recursive resolver',description:'Finds or caches answer'},{title:'Root',description:'Points to TLD servers'},{title:'TLD',description:'Points to authoritative servers'},{title:'Authoritative',description:'Owns domain data'}]} /><p>The recursive resolver may already have the answer cached. Otherwise it follows referrals through the DNS hierarchy.</p></ArticleSection>
    <ArticleSection title="TTL is a consistency mechanism"><p>Records carry a time-to-live. Caches can reuse an answer until it expires, trading immediate global consistency for lower latency and query volume.</p><ArticleCallout>Changing a DNS record does not instantly replace every cached copy. TTL defines part of the propagation behaviour.</ArticleCallout></ArticleSection>
    <ArticleSection title="More than A records"><p>A and AAAA records map names to IPv4 and IPv6 addresses, but DNS also carries aliases, mail routing, service information, text and delegation records.</p></ArticleSection>
    <ArticleSection title="DNS is application latency"><p>Cold DNS resolution can add network round trips before TCP or QUIC and TLS work begin. Browser, OS and resolver caches can visibly affect startup latency.</p></ArticleSection>
    <ArticleSection title="Debugging"><p>dig lets you ask specific resolvers and inspect TTLs, authority and delegation. When environments differ, compare the resolver path rather than assuming the application receives the same answer everywhere.</p></ArticleSection>
  </ArticleLayout>;
}