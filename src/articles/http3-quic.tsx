import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCode } from '../components/article/ArticleCode';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = {
  slug: 'http3-quic',
  title: 'HTTP/3 & QUIC',
  subtitle: 'Why the web put transport logic into user space',
  category: 'Networking',
  description: 'QUIC streams, UDP, TLS 1.3, connection migration and the transport ideas behind HTTP/3.',
  date: '2026-10-02',
  readingTime: 15,
  tags: ['HTTP/3', 'QUIC', 'Networking', 'TLS', 'UDP'],
};

export function Http3QuicArticle() {
  return <ArticleLayout meta={meta}>
    <ArticleSection title="HTTP/3 is more than HTTP over UDP">
      <p>HTTP/3 uses QUIC as its transport. QUIC runs over UDP but implements reliable delivery, congestion control, encryption and multiplexed streams above UDP.</p>
      <ArticleCallout>UDP provides packets, not reliability. QUIC builds a modern transport protocol without requiring a new kernel TCP implementation everywhere.</ArticleCallout>
    </ArticleSection>
    <ArticleSection title="The stack">
      <ArticleDiagram items={[
        { title: 'HTTP/3', description: 'Maps HTTP semantics onto QUIC streams.' },
        { title: 'QUIC', description: 'Provides streams, reliability, congestion control and security.' },
        { title: 'UDP', description: 'Provides datagram transport to the network.' },
        { title: 'IP', description: 'Moves packets between endpoints.' },
      ]} />
    </ArticleSection>
    <ArticleSection title="Streams change head-of-line blocking">
      <p>TCP presents one ordered byte stream. Loss of a packet can therefore delay delivery of later bytes. QUIC exposes independent streams, so loss affecting one stream need not block application data from unrelated streams in the same connection.</p>
    </ArticleSection>
    <ArticleSection title="TLS is built into the handshake">
      <p>QUIC integrates TLS 1.3 into connection establishment. Encryption is not an optional layer added after transport negotiation; it is part of the protocol's normal operation.</p>
    </ArticleSection>
    <ArticleSection title="Connection migration">
      <p>QUIC connections are not tied as tightly to the traditional four-tuple of IP addresses and ports. Connection identifiers allow a connection to survive some network changes, such as moving between Wi-Fi and cellular.</p>
    </ArticleSection>
    <ArticleSection title="Why user-space transport is interesting">
      <p>TCP behaviour is constrained by operating-system implementations and deployment cycles. QUIC can evolve as an application protocol implemented in libraries and user-space stacks, while still using UDP as the broadly available kernel interface.</p>
      <ArticleCode>{`curl --http3 https://example.com
curl -I --http3 https://example.com`}</ArticleCode>
    </ArticleSection>
    <ArticleSection title="The bigger idea">
      <p>QUIC demonstrates a recurring systems pattern: when a kernel abstraction becomes difficult to evolve, move a carefully designed layer upward while retaining a stable primitive underneath. The result can be faster protocol evolution without replacing the entire network stack.</p>
    </ArticleSection>
  </ArticleLayout>;
}
