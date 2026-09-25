import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = { slug: 'tls-handshake', title: 'The TLS Handshake', subtitle: 'How HTTPS establishes trust and keys', category: 'Security', description: 'Certificates, authentication, ephemeral key exchange and symmetric session keys.', date: '2026-10-14', readingTime: 15, tags: ['TLS', 'HTTPS', 'Security', 'Cryptography'] };

export function TlsHandshakeArticle() {
  return <ArticleLayout meta={meta}>
    <ArticleSection title="What TLS needs to establish"><p>An HTTPS connection needs confidentiality, integrity and authenticated server identity. TLS 1.3 establishes these properties while simplifying older handshake patterns.</p></ArticleSection>
    <ArticleSection title="The shape of TLS 1.3"><ArticleDiagram items={[{title:'ClientHello',description:'Capabilities and key share'},{title:'ServerHello',description:'Select parameters and key share'},{title:'Certificate',description:'Server identity evidence'},{title:'Verification',description:'Chain and hostname checks'},{title:'Finished',description:'Transcript authentication'},{title:'Application data',description:'Encrypted symmetric traffic'}]} /><p>Ephemeral Diffie–Hellman normally establishes shared secrets without transmitting the final symmetric key itself.</p></ArticleSection>
    <ArticleSection title="Certificates do not encrypt traffic"><p>A certificate binds a public key to an identity through a certificate authority chain. The client verifies that chain and hostname before trusting the authenticated key exchange.</p><ArticleCallout>The certificate answers “who is this key associated with?” The key schedule answers “which secrets protect this connection?”</ArticleCallout></ArticleSection>
    <ArticleSection title="Symmetric encryption takes over"><p>After the handshake derives shared secrets, bulk application data uses efficient symmetric authenticated encryption.</p></ArticleSection>
    <ArticleSection title="Forward secrecy"><p>Ephemeral key exchange means later compromise of a long-term private key does not normally reveal old captured session traffic.</p></ArticleSection>
    <ArticleSection title="Debugging"><p>Certificate errors, protocol negotiation, SNI, trust stores, clock problems and missing intermediates can all fail before application code runs. Understanding the handshake makes HTTPS failures inspectable.</p></ArticleSection>
  </ArticleLayout>;
}