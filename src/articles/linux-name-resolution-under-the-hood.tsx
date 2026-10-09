import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'linux-name-resolution-under-the-hood',
  title: 'DNS Is Not the Resolver: Linux Name Resolution Under the Hood',
  subtitle: 'Follow a hostname from getaddrinfo through NSS, local caches, split DNS, search domains and the wire — and learn why dig, Node.js and your application can disagree.',
  category: 'Networking & Linux Internals',
  description: 'A senior-level deep dive into Linux hostname resolution: glibc getaddrinfo, NSS, systemd-resolved, DNS caching, search-domain expansion, Node.js, Kubernetes and practical debugging.',
  date: '2026-10-10',
  readingTime: 23,
  tags: ['DNS', 'Linux', 'Networking', 'glibc', 'Node.js', 'Kubernetes', 'Debugging'],
};

export function LinuxNameResolutionUnderTheHoodArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>You type <code>https://api.example.com</code> into a client and it connects. It is tempting to imagine a single operation: ask DNS for an address, receive an IP, open a socket. On a typical Linux machine, hostname resolution can pass through a library API, a configurable source-selection system, local files, a resolver daemon, multiple caches, search-domain expansion and one or more network queries.</p>
      <p>The surprising part is that <strong>DNS is only one possible source of name information</strong>. A program can resolve a name without sending a DNS packet, and two tools on the same host can return different answers because they use different resolution paths.</p>
      <div className="article__callout"><strong>Core idea:</strong> distinguish the application’s name-resolution API from the DNS protocol. The API decides which sources and policies are consulted; DNS is one protocol that may be used along the way.</div>

      <h2>The resolution pipeline</h2>
      <p>For a common glibc-based Linux application, the path looks roughly like this. The exact route depends on the host, container image, libraries and configuration.</p>
      <pre><code>{'application\\n    |\\n    v\\ngetaddrinfo()\\n    |\\n    v\\nNSS policy: /etc/nsswitch.conf\\n    |\\n    +--> files: /etc/hosts\\n    |\\n    +--> resolve: systemd-resolved API\\n    |\\n    +--> dns: resolver library and /etc/resolv.conf\\n                 |\\n                 v\\n           local stub or upstream resolver\\n                 |\\n                 v\\n           recursive DNS infrastructure'}</code></pre>
      <p>This is a map, not a universal call graph. Some systems have no systemd-resolved. Some applications use their own DNS stack. Containers may have a different <code>/etc/hosts</code>, <code>/etc/nsswitch.conf</code> or <code>/etc/resolv.conf</code> from the host. The task is to identify which path the failing process actually follows.</p>

      <h2>1. The API boundary: getaddrinfo</h2>
      <p>Most portable applications do not construct DNS packets themselves. They ask an operating-system API such as <code>getaddrinfo()</code> to turn a host and service into one or more socket addresses. It can return IPv4 and IPv6 candidates and apply address-family hints and platform policy.</p>
      <p>That abstraction is deliberately broader than DNS. The input might be present in a local hosts file, provided by an enterprise directory service, discovered through a local naming mechanism, or answered by DNS. The application generally asks for an address, not for a particular protocol exchange.</p>
      <p>It also means “the hostname resolves” is not quite a complete statement. Which API? Which address family? Which container? Which name sources? Which search rules? Those details can change the result.</p>

      <h2>2. NSS: the name service switch</h2>
      <p>On glibc systems, <code>/etc/nsswitch.conf</code> controls the sources used for databases such as users, groups and hostnames. Inspect the <code>hosts:</code> line:</p>
      <pre><code>{'grep \"^hosts:\" /etc/nsswitch.conf'}</code></pre>
      <p>A system might show something like:</p>
      <pre><code>{'hosts: files resolve [!UNAVAIL=return] dns'}</code></pre>
      <p>Read this as a policy sequence. The <code>files</code> source can consult <code>/etc/hosts</code>; <code>resolve</code> can send requests to systemd-resolved through its NSS module; and <code>dns</code> can use the traditional DNS NSS module. The actual line varies by distribution and configuration, so do not assume this example is yours.</p>
      <p>The bracketed expression is not decoration. NSS supports actions based on a source’s status, including success, not-found, unavailable and try-again. For example, <code>[!UNAVAIL=return]</code> says to stop if the source returns anything except “unavailable”. That can affect whether a later source gets a chance to answer.</p>
      <p>This is subtler than “try each source until one finds a name”. NSS policy can treat “the source is down” differently from “the source answered that the name does not exist”. Changing source order or action rules can therefore alter both correctness and failure behaviour.</p>

      <h2>Why /etc/hosts can beat DNS</h2>
      <p>Suppose <code>/etc/hosts</code> contains a mapping for <code>api.internal</code>. A normal NSS lookup may return it immediately, without a DNS packet. If that address is stale, querying a public resolver with <code>dig api.internal</code> can show something different from the application’s actual result.</p>
      <pre><code>{'getent ahosts api.internal\\ndig api.internal'}</code></pre>
      <p>These commands are intentionally not equivalent. <code>getent ahosts</code> uses the configured NSS host database, much closer to what a typical glibc application sees. <code>dig</code> is a DNS diagnostic client: it asks the DNS protocol and does not reproduce the full NSS decision process, including the ordinary <code>/etc/hosts</code> lookup.</p>
      <p>That makes <code>getent</code> a valuable first comparison when an application disagrees with a DNS tool. If <code>getent</code> returns an unexpected address, inspect the hosts file and NSS configuration before assuming the upstream DNS zone is wrong.</p>

      <h2>3. systemd-resolved: more than a localhost DNS server</h2>
      <p>On many Linux desktops and servers, systemd-resolved provides a local name-resolution service. It can cache DNS answers, validate DNSSEC where configured, handle certain local naming protocols and select DNS servers based on per-link configuration.</p>
      <p>Applications can reach it through different interfaces. A glibc application may use the NSS module <code>nss-resolve</code>; other clients can use its native API; and DNS clients can send packets to a local stub listener, commonly <code>127.0.0.53</code>.</p>
      <pre><code>{'resolvectl status\\nresolvectl query api.example.com\\ncat /etc/resolv.conf\\nreadlink -f /etc/resolv.conf'}</code></pre>
      <p>The commands answer different questions. <code>resolvectl status</code> reveals the resolver’s view of links and DNS servers. <code>resolvectl query</code> asks the local service to resolve a name. Inspecting <code>/etc/resolv.conf</code> and its symlink target shows what traditional resolver clients are configured to use.</p>
      <p>On a system using the stub configuration, <code>/etc/resolv.conf</code> may point to a generated file listing <code>127.0.0.53</code>. That address is loopback: the packet is sent to a service in the same network namespace, not directly to the router or public DNS server. The service then decides how to handle it.</p>
      <p>There is a distinction between the local stub and the native resolver API. The stub speaks DNS, so it cannot express every bit of richer local-resolution context. The native interface can preserve information that does not fit neatly into a conventional unicast DNS query, such as link scope or validation status.</p>

      <h2>Split DNS: one machine, several naming worlds</h2>
      <p>Per-link DNS configuration is especially useful for VPNs. A laptop might use a corporate DNS server for <code>corp.example</code> while sending ordinary public names to a home router or another resolver. A resolver that understands routing domains can send each query down the appropriate path.</p>
      <p>This is not the same as simply choosing one global DNS server. The destination for a query can depend on the name and the network link associated with a routing domain. A VPN may be connected and have an IP route to the corporate network while the name-resolution policy is wrong; conversely, DNS may resolve the corporate host while the route to its address is missing.</p>
      <div className="article__callout"><strong>Debugging clue:</strong> if an internal name fails only while a VPN is connected, inspect per-link DNS servers and routing domains before overwriting the global resolver configuration.</div>

      <h2>4. /etc/resolv.conf and the traditional DNS path</h2>
      <p>When the NSS <code>dns</code> source is used, the resolver library consults resolver configuration, typically through <code>/etc/resolv.conf</code>. The file can specify nameservers, search domains and options that influence query behaviour.</p>
      <pre><code>{'nameserver 127.0.0.53\\nsearch dev.example.com example.com\\noptions ndots:2 timeout:2 attempts:2'}</code></pre>
      <p>This illustrative configuration says that a local stub should be queried, and gives the resolver suffixes and retry settings. It is not a recommendation to copy these exact values: search domains and retry behaviour should reflect the environment, and a local stub is useful only if something is listening there.</p>
      <p>One operational trap is treating <code>/etc/resolv.conf</code> as the single source of truth on every modern Linux system. It may be generated by NetworkManager, systemd-resolved, DHCP tooling, a container runtime or an orchestration platform. Editing a generated file directly may be overwritten, may not change the component actually used by an application, or may bypass split-DNS policy.</p>

      <h2>5. Search domains turn one name into several queries</h2>
      <p>A short hostname such as <code>payments</code> is ambiguous outside a naming environment. Search domains let a resolver try candidates such as <code>payments.dev.example.com</code> before treating the original string as an absolute name.</p>
      <p>The <code>ndots</code> option changes when a name is tried as absolute relative to search-list expansion. If a name has fewer dots than the configured threshold, the search list may be tried first. A trailing dot, as in <code>payments.example.com.</code>, explicitly marks the name as absolute and avoids ordinary suffix expansion.</p>
      <p>This becomes a latency and load issue when the search list is long. A single application-level lookup may fan out into several DNS queries, each of which can be retried or wait for a timeout. The user sees one stalled connection; the resolver sees a sequence of candidate names and attempts.</p>

      <h2>Kubernetes makes this effect visible</h2>
      <p>Kubernetes commonly configures Pods with search domains for the Pod namespace and cluster service domain, plus an <code>ndots</code> setting that favours cluster-relative names. This makes a short name such as <code>payments</code> convenient for talking to a Service in the same namespace.</p>
      <p>The trade-off is that an external name such as <code>api.vendor.example</code> can be tried against several cluster search suffixes before the resolver sends the fully qualified candidate. Depending on the client and resolver, that can create extra queries, latency and noise in DNS metrics. With many outbound requests, small per-lookup overheads can become noticeable aggregate load.</p>
      <pre><code>{'cat /etc/resolv.conf\\ngetent ahosts payments\\ngetent ahosts api.vendor.example.'}</code></pre>
      <p>Inside a Pod, inspect the Pod’s own resolver configuration rather than the node’s. The Pod has its own network namespace and may have a resolver file injected by kubelet. The trailing dot in the last example is a useful experiment: compare the absolute name with the unqualified one and observe how many queries are emitted.</p>
      <p>Do not reflexively remove search domains to fix performance. They are part of Kubernetes service discovery. Instead, measure the actual query expansion, decide whether the application needs short names, and use fully qualified names where appropriate. Any change to <code>ndots</code> should be tested against the workload’s real naming patterns.</p>

      <h2>6. Caching is distributed across layers</h2>
      <p>“DNS cache” is often spoken of as if there were one cache. In reality, an answer may be reused by a browser, an application runtime, a local resolver service, a recursive resolver and additional infrastructure. Not every layer is present on every machine, and cache keys and lifetimes may differ.</p>
      <pre><code>{'application or browser cache\\n          | miss\\n          v\\nOS name-resolution path\\n          | miss\\n          v\\nlocal resolver cache\\n          | miss\\n          v\\nrecursive resolver cache\\n          | miss\\n          v\\nauthoritative DNS'}</code></pre>
      <p>DNS record TTLs constrain how long a compliant cache may reuse ordinary cached data, but the operational story includes negative caching, implementation policy and sometimes deliberate stale-answer serving. A cached “name does not exist” result can be just as confusing as a cached address when a record has just been created.</p>
      <p>RFC 8767 describes serving stale DNS data when an authoritative server cannot be reached to refresh an expired answer. This can improve resilience during an upstream outage, but it means an expired TTL does not always imply that every recursive resolver will immediately stop returning the old address. Resilience and freshness are competing goals.</p>
      <p>Also distinguish cache expiry from connection lifetime. Updating a DNS record does not migrate an already-established TCP connection. Applications may keep sockets in pools, cache resolved addresses themselves, or retry against a previously selected endpoint. A deployment can therefore be healthy in DNS and still have clients talking to the old destination for a while.</p>

      <h2>7. Node.js has two importantly different DNS APIs</h2>
      <p>The Node.js API makes the distinction unusually explicit. <code>dns.lookup()</code> uses the operating system’s name-resolution facilities. On a typical Linux build, that means the host’s NSS and resolver policy, and therefore potentially <code>/etc/hosts</code> or systemd-resolved.</p>
      <p>By contrast, functions such as <code>dns.resolve4()</code> and <code>dns.resolve6()</code> perform DNS queries using Node’s DNS implementation. They do not reproduce the full OS lookup path and do not use the same host-file and NSS configuration. These functions are useful when an application specifically needs DNS records, rather than the address result that the operating system would give a normal socket client.</p>
      <pre><code>{'import dns from \"node:dns/promises\";\\n\\nconst osResult = await dns.lookup(\"service.internal\");\\nconst dnsResult = await dns.resolve4(\"service.internal\");\\n\\nconsole.log({ osResult, dnsResult });'}</code></pre>
      <p>The two calls can differ without either API being broken. A hosts-file override may affect <code>lookup()</code> but not <code>resolve4()</code>. Split-DNS or local naming behaviour may be available through the system path but not through a direct DNS query.</p>
      <p>There is also a performance consequence. In Node.js, <code>dns.lookup()</code> is backed by the operating system’s synchronous resolution API, which Node integrates through its worker pool. Slow name lookups can consume worker-pool capacity and contribute to latency in other work that shares that pool. A DNS query is not automatically an event-loop-blocking JavaScript call, but neither is it free of runtime scheduling consequences.</p>
      <p>Do not switch to <code>resolve4()</code> solely to make a latency chart look better. First decide what semantics the application needs. Direct DNS lookup is not a drop-in replacement for operating-system resolution: it can change hosts-file behaviour, split-DNS handling, address-family selection and the answers seen in a container or corporate environment.</p>

      <h2>8. Why dig can succeed while the application fails</h2>
      <p>When two tools disagree, they may be asking different questions. A direct query to a public resolver is not the same as a lookup through a local stub; a fully qualified name is not the same as a short name with search domains; an A-record query is not the same as requesting all usable socket addresses; and a DNS answer is not the same as a successful TCP connection.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Tool or check</th><th>What it helps answer</th><th>What it does not prove</th></tr></thead>
          <tbody>
            <tr><td><code>getent ahosts name</code></td><td>What the configured NSS path returns</td><td>That a specific upstream DNS server answered</td></tr>
            <tr><td><code>dig name</code></td><td>What a DNS query returns using dig’s resolver settings</td><td>That /etc/hosts or every NSS source agrees</td></tr>
            <tr><td><code>dig @server name</code></td><td>What a specific DNS server returns</td><td>That applications use that server</td></tr>
            <tr><td><code>resolvectl query name</code></td><td>What systemd-resolved can resolve</td><td>That the process is configured to use it</td></tr>
            <tr><td><code>curl https://name</code></td><td>Whether the full client connection succeeds</td><td>That DNS alone is the failing layer</td></tr>
          </tbody>
        </table>
      </div>
      <p>A public resolver might have no knowledge of an internal zone while a normal application resolves it through a VPN-specific resolver. The opposite can happen too: a public DNS query succeeds, while a local hosts-file entry points the application at an obsolete address.</p>

      <h2>A practical debugging sequence</h2>
      <p>When a service name unexpectedly fails, work from the application’s effective behaviour outward. Avoid changing several resolver settings at once, because that destroys evidence about which layer was responsible.</p>
      <pre><code>{'1. getent ahosts api.example.com\\n2. grep \"^hosts:\" /etc/nsswitch.conf\\n3. grep -n \"api.example.com\" /etc/hosts\\n4. cat /etc/resolv.conf\\n5. resolvectl status\\n6. resolvectl query api.example.com\\n7. dig api.example.com'}</code></pre>
      <p>Run only the relevant commands for the host you are on; for example, <code>resolvectl</code> is not available on every Linux system. If the application runs in a container, run the comparisons inside that container too. Host success does not imply container success.</p>
      <p>If the result is still surprising, capture DNS traffic with a packet analyser and check whether queries are emitted, where they go, and whether responses arrive. This will not reveal every local API call, and encrypted DNS traffic will not appear as ordinary port-53 queries, but it can sharply narrow the possibilities.</p>
      <p>For a deeper system-call experiment, trace a small program that calls <code>getaddrinfo()</code>. Look for reads of resolver configuration and hosts files, local IPC with resolver services, and network socket activity. The exact trace depends on the NSS modules and resolver daemon, which is precisely the point: resolution is a configurable path through several components.</p>

      <h2>Common misconceptions</h2>
      <ul>
        <li><strong>“Every hostname lookup is a DNS query.”</strong> Local files and other NSS sources can answer without network traffic.</li>
        <li><strong>“dig shows what every application sees.”</strong> It diagnoses DNS, not the entire NSS policy and application stack.</li>
        <li><strong>“There is one DNS server configured on the machine.”</strong> Split DNS and per-link configuration can route different names to different servers.</li>
        <li><strong>“TTL expiry instantly changes every client.”</strong> Multiple caches, negative answers, stale serving and existing connections complicate the timeline.</li>
        <li><strong>“Node’s DNS functions are interchangeable.”</strong> OS lookup and direct DNS-record queries have different semantics.</li>
        <li><strong>“If DNS returns an IP, the service should work.”</strong> Routing, address-family choice, TLS identity, proxies and application health still matter.</li>
      </ul>

      <h2>Further reading</h2>
      <ul>
        <li><a href="https://man7.org/linux/man-pages/man5/nsswitch.conf.5.html" target="_blank" rel="noreferrer">Linux man-pages: nsswitch.conf</a> — source order and status actions.</li>
        <li><a href="https://www.man7.org/linux/man-pages/man8/systemd-resolved.service.8.html" target="_blank" rel="noreferrer">systemd-resolved.service</a> — local resolver interfaces and DNS configuration.</li>
        <li><a href="https://nodejs.org/api/dns.html" target="_blank" rel="noreferrer">Node.js DNS documentation</a> — operating-system lookup versus direct DNS queries.</li>
        <li><a href="https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/" target="_blank" rel="noreferrer">Kubernetes DNS for Services and Pods</a> — search domains and cluster service names.</li>
        <li><a href="https://www.rfc-editor.org/rfc/rfc8767" target="_blank" rel="noreferrer">RFC 8767: Serving Stale Data</a> — resilience when authoritative DNS is unavailable.</li>
      </ul>

      <h2>Takeaway</h2>
      <p>Hostname resolution is a policy-driven operating-system service, and DNS is only one possible mechanism inside it. NSS chooses sources; local files and resolver daemons may answer; search domains can multiply queries; caches can preserve both positive and negative answers; and language runtimes can expose different semantics through APIs that look deceptively similar.</p>
      <p>When a name behaves unexpectedly, do not start by asking only “what does DNS say?” Ask <strong>which resolution path did this process use, which sources did that path consult, and what exact name did it query?</strong> That turns a vague networking problem into a sequence of testable boundaries.</p>
      <div className="article__callout"><strong>Remember:</strong> compare the application-facing lookup (<code>getent</code> or the actual program) with the DNS-facing lookup (<code>dig</code>). The difference between them is often the clue, not the contradiction.</div>
    </ArticleLayout>
  );
}
