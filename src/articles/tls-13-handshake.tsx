import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'tls-13-handshake',
  title: 'TLS 1.3 Under the Hood: The Handshake Is a Key Schedule',
  subtitle: 'A packet-level tour of TLS 1.3: transcript hashes, ephemeral keys, HKDF, encrypted handshakes, 0-RTT, key updates, and the design choices that made the protocol faster and easier to reason about.',
  category: 'Networking & Security',
  description: 'A senior-level deep dive into TLS 1.3, following the handshake from ClientHello to application traffic keys and exploring transcript binding, HKDF, forward secrecy, 0-RTT, key updates and operational sharp edges.',
  date: '2026-10-01',
  readingTime: 24,
  tags: ['TLS', 'TLS 1.3', 'Networking', 'Security', 'Cryptography', 'HTTP/3'],
};

export function Tls13HandshakeArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>TLS is often described as “encryption for HTTP”. That description is useful at the API level and almost useless when debugging a real connection. TLS 1.3 is better understood as a <strong>state machine that derives a sequence of keys from a transcript of the handshake</strong>.</p>
      <p>Once that mental model clicks, several otherwise mysterious behaviours become straightforward: why the server can encrypt its response before the handshake has visibly “finished”, why changing one handshake message changes later traffic keys, why TLS 1.3 removed a large amount of negotiation, why 0-RTT has replay risk, and why packet captures become much less readable after ServerHello.</p>

      <div className="article__callout"><strong>Core idea:</strong> TLS 1.3 is not “pick a cipher and encrypt everything”. It is a key schedule driven by an authenticated transcript, with different keys protecting different phases.</div>

      <h2>The handshake you should picture</h2>
      <p>A simplified TLS 1.3 exchange looks like this:</p>
      <pre><code>{`Client                                      Server
  |                                           |
  | ClientHello + key share ----------------> |
  |                                           |
  | <------------- ServerHello + key share   |
  |                                           |
  | <===== encrypted handshake messages ==== |
  |                                           |
  | Finished -------------------------------> |
  |                                           |
  | <------------- Finished                  |
  |                                           |
  | <========== application data ==========> |`}</code></pre>
      <p>The important transition is ServerHello. Before it, the peers negotiate enough information to derive shared secrets. After it, most of the remaining handshake is encrypted.</p>
      <p>TLS 1.3 deliberately removed many legacy handshake modes and cipher-suite combinations. It has a much clearer separation between <strong>key exchange</strong> and <strong>record protection</strong>.</p>

      <h2>Ephemeral key exchange</h2>
      <p>A modern TLS 1.3 client normally offers an ephemeral Diffie-Hellman key share, commonly using X25519 or an approved elliptic-curve group. The client sends a public value; the server sends its own public value in ServerHello. Each side combines its private value with the other side’s public value and arrives at the same shared secret.</p>
      <p>The private values are ephemeral: they are generated for the connection rather than being long-term identity keys. This gives TLS 1.3 <strong>forward secrecy</strong>: compromising the server’s long-term certificate private key later does not, by itself, reveal old captured application traffic.</p>

      <h2>The certificate is not the key exchange</h2>
      <p>This distinction causes a lot of confusion. The certificate authenticates the server’s identity. The ephemeral Diffie-Hellman exchange establishes the fresh shared secret used by the connection.</p>
      <pre><code>{`certificate / signature
        |
        +--> “I am the server for this identity.”

ephemeral Diffie-Hellman
        |
        +--> “We both know this fresh shared secret.”`}</code></pre>
      <p>The server signs handshake information using its authentication key. That signature binds the authenticated identity to the handshake rather than turning the certificate itself into an encryption key.</p>

      <h2>The key schedule</h2>
      <p>The most useful way to understand TLS 1.3 cryptography is through its key schedule. It is based heavily on HKDF, a key-derivation construction built from a hash function.</p>
      <pre><code>{`                    HKDF key schedule

                 early secret
                      |
                      v
               handshake secret
                      |
                      v
                master secret
                   /       \
                  /         \
       client traffic     server traffic
          secret             secret`}</code></pre>
      <p>The real schedule contains additional extract-and-expand steps, labels and transcript hashes. The architectural idea is more important: <strong>each stage derives purpose-specific secrets rather than reusing one key for everything.</strong></p>
      <p>TLS uses explicit labels to separate domains. When several consumers need keys derived from the same root secret, this is a general engineering pattern: derive independent values for independent purposes rather than handing every consumer the same bytes.</p>

      <h2>The transcript hash</h2>
      <p>TLS 1.3 continuously hashes the handshake transcript. Roughly speaking, the peers maintain a cryptographic fingerprint of the messages they have agreed on so far.</p>
      <pre><code>{`ClientHello
     |
     v
 hash(ClientHello)
     |
     + ServerHello
     |
     v
 hash(ClientHello || ServerHello)
     |
     + encrypted handshake messages
     |
     v
 final transcript hash`}</code></pre>
      <p>The transcript is not merely for logging. It feeds into key derivation and the Finished authentication step. An attacker cannot quietly alter an earlier handshake message and expect the peers to continue using the same cryptographic state.</p>
      <div className="article__callout"><strong>Mental model:</strong> the TLS handshake is a conversation whose history becomes an input to the cryptographic state. The protocol continuously binds “what we said” to “what keys we now use”.</div>

      <h2>Why ServerHello is the turning point</h2>
      <p>Once both sides have enough information to derive the handshake secret, TLS can derive handshake traffic keys. The server can then encrypt its Certificate, CertificateVerify and Finished messages.</p>
      <p>This is one of TLS 1.3’s major improvements. More of the handshake is protected earlier, reducing the amount of sensitive metadata exposed to passive observers.</p>
      <pre><code>{`negotiation
    |
    | ClientHello
    | ServerHello
    v
encrypted handshake
    |
    | Certificate
    | CertificateVerify
    | Finished
    v
encrypted application data`}</code></pre>

      <h2>Finished is a proof, not a goodbye</h2>
      <p>The Finished message is effectively a cryptographic confirmation that the sender possesses the expected handshake secret and has the expected transcript. The sender computes a value from a Finished key and the transcript hash; the receiver independently computes what that value should be. If the transcript differs, verification fails.</p>
      <p>Key agreement and authentication are therefore connected: the final authentication is tied to the exact sequence of handshake messages that produced the connection state.</p>

      <h2>Why TLS 1.3 simplified cipher suites</h2>
      <p>Older TLS versions used cipher-suite names that mixed together several decisions: key exchange, authentication, symmetric encryption and sometimes hash choices. TLS 1.3 separates these concerns.</p>
      <pre><code>{`TLS 1.2-style mental model
cipher suite
  +-- key exchange
  +-- authentication
  +-- bulk encryption
  +-- MAC / hash

TLS 1.3 mental model
key exchange ------> shared secret
authentication ----> signature
cipher suite ------> AEAD + hash
                         |
                         v
                    key schedule`}</code></pre>
      <p>This is protocol design by decomposition. Fewer combinations mean fewer awkward interactions and a smaller state space for implementations to get wrong.</p>

      <h2>AEAD and the record layer</h2>
      <p>TLS 1.3 uses authenticated encryption with associated data, such as AES-GCM or ChaCha20-Poly1305. Decryption therefore both recovers plaintext and verifies an authentication tag. Modification causes verification to fail.</p>
      <p>Each direction has its own traffic secret and record sequence state. Sequence numbers participate in nonce construction and advance as records are processed. Losing track of record ordering or key state is not a harmless counter error; it can make otherwise valid ciphertext impossible to authenticate.</p>

      <h2>Key updates and long-lived connections</h2>
      <p>TLS 1.3 can update application traffic keys without performing a new handshake. A peer sends KeyUpdate and the traffic secret advances through the key schedule.</p>
      <pre><code>{`traffic secret N
      |
    HKDF
      |
      v
traffic secret N+1
      |
    HKDF
      |
      v
traffic secret N+2`}</code></pre>
      <p>The connection behaves more like a ratchet than a single static encryption session. Fresh derived keys limit the amount of data protected under one traffic key and provide cleaner long-lived-session hygiene.</p>

      <h2>Where HTTP/2 and HTTP/3 fit</h2>
      <p>HTTP/2 normally runs over TCP with TLS. HTTP/3 runs over QUIC, and QUIC incorporates TLS 1.3 for its handshake and key schedule. TLS is therefore not an unrelated security layer in HTTP/3: it establishes authenticated cryptographic state while QUIC owns transport semantics around it.</p>
      <div className="article__callout"><strong>Useful connection:</strong> understanding the TLS key schedule makes QUIC’s multiple packet-protection levels much less mysterious.</div>

      <h2>0-RTT: the optimisation with a security price</h2>
      <p>TLS 1.3 can resume a previous connection using a PSK established during an earlier session. This can allow a client to send application data in its first flight: 0-RTT data.</p>
      <pre><code>{`previous connection
       |
       +--> resumption ticket
                    |
                    v
new connection
       |
       +--> ClientHello + early application data`}</code></pre>
      <p>The latency benefit is attractive, especially for short-lived connections. But 0-RTT deliberately has replay considerations: an attacker who captures early data may be able to replay it.</p>
      <p>Consequently, 0-RTT is appropriate only for operations where replay is safe or independently prevented. A cacheable read is very different from “charge the customer £500”.</p>
      <p>This is an important boundary: TLS can protect the channel while being unable to know whether your application operation is idempotent.</p>

      <h2>A practical experiment</h2>
      <p>You can make the handshake concrete without writing cryptographic code:</p>
      <pre><code>{`openssl s_client -connect example.com:443 -tls1_3 -servername example.com`}</code></pre>
      <p>Inspect the negotiated TLS version, cipher, peer certificate and handshake details. Then compare a fresh connection with a resumed one.</p>
      <p>For a deeper experiment, capture traffic with Wireshark. You should see ClientHello and ServerHello clearly, followed by records that become opaque unless you provide the appropriate session secrets. The useful lesson is that “encrypted” is a property of a particular record epoch, not a binary property of the TCP connection.</p>

      <h2>What middleboxes still see</h2>
      <p>TLS encrypts application payloads, but it does not make every property of a network connection invisible. IP addresses, transport metadata, packet sizes and timing remain observable to varying degrees. Technologies such as encrypted client hello can protect additional handshake metadata, but confidentiality of content is not confidentiality of all metadata.</p>

      <h2>Encryption and authentication are different</h2>
      <p>A client can establish cryptographic secrets with an endpoint whose certificate does not validate for the requested identity. Normal HTTPS clients reject that because confidentiality from an unknown endpoint is not enough.</p>
      <pre><code>{`Encryption:
  Can a passive observer recover the plaintext?

Authentication:
  Do I know who controls the endpoint I established this session with?`}</code></pre>

      <h2>Debugging the state machine</h2>
      <p>“TLS handshake failed” is not one problem. The failure might be DNS, transport establishment, protocol negotiation, certificate validation, signature verification, unsupported groups, ALPN selection, server policy, clock problems or application behaviour after the handshake.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Symptom</th><th>Useful question</th></tr></thead>
          <tbody>
            <tr><td>No connection</td><td>Did TCP or QUIC reach the endpoint?</td></tr>
            <tr><td>Negotiation failure</td><td>Which version, group or algorithm was rejected?</td></tr>
            <tr><td>Certificate error</td><td>Does identity and trust-chain validation succeed?</td></tr>
            <tr><td>Authentication failure</td><td>Did transcript or signature verification fail?</td></tr>
            <tr><td>Decryption failure</td><td>Are both peers using the same key/record epoch?</td></tr>
            <tr><td>Application error</td><td>Is the problem actually above TLS?</td></tr>
          </tbody>
        </table>
      </div>

      <h2>Why TLS 1.3 is simpler than it looks</h2>
      <p>The implementation still maintains several interacting pieces of state: transcript hashes, handshake secrets, traffic secrets, sequence numbers, cipher parameters, authentication state, resumption tickets and application protocol negotiation.</p>
      <p>The simplification comes from removing old branches and making the remaining states more explicit. Security and performance improvements often come from <strong>removing choices</strong>: every legacy mode creates another path to test and another interaction to secure.</p>

      <h2>Sharp edges</h2>
      <ul>
        <li><strong>Certificate keys are not the session keys.</strong> Authentication and fresh key exchange are separate jobs.</li>
        <li><strong>Forward secrecy is intentional.</strong> Long-term identity-key compromise should not automatically decrypt old captured sessions.</li>
        <li><strong>0-RTT is not ordinary application data.</strong> Design its operations with replay in mind.</li>
        <li><strong>Packet captures have epochs.</strong> Different phases use different traffic keys.</li>
        <li><strong>TLS does not hide all metadata.</strong> Payload confidentiality is not complete traffic analysis resistance.</li>
        <li><strong>Handshake failure is a state-transition problem.</strong> Find the exact stage before changing random configuration.</li>
      </ul>

      <h2>Takeaway</h2>
      <p>TLS 1.3 becomes much less mysterious when you stop picturing it as a black box that turns encryption on and instead see a sequence of cryptographic state transitions.</p>
      <p>An ephemeral key exchange establishes fresh shared material. HKDF turns that material into purpose-specific secrets. The transcript hash binds those secrets to what the peers actually said. Finished authenticates the resulting state. AEAD protects records, and key updates advance traffic secrets without restarting the connection.</p>
      <p>The most useful mental model is: <strong>TLS is a state machine whose cryptographic state is derived from both secrets and history.</strong></p>
      <div className="article__callout"><strong>Remember:</strong> when debugging a secure connection, ask “which state are both peers supposed to be in, which key epoch are they using, and what transcript produced it?” That question is often more productive than simply asking whether TLS is “working”.</div>
    </ArticleLayout>
  );
}
