import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'tcp-listen-backlog',
  title: 'TCP Listen Backlog: The Two Queues Behind Connection Failures',
  subtitle: 'How Linux moves a TCP connection from SYN to accept(), why backlog is not one queue, and what overload actually looks like.',
  category: 'Networking Internals',
  description: 'A senior-level dive into TCP listening sockets, handshake state, accept queues, SYN cookies, resource limits and production debugging.',
  date: '2026-09-30',
  readingTime: 20,
  tags: ['Networking', 'TCP', 'Linux', 'Performance', 'Distributed Systems'],
};

export function TcpListenBacklogArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        A TCP server can be healthy at the application level and still fail to
        accept new connections. CPU can be idle, the listening socket can exist,
        and yet clients can see timeouts or immediate failures.
      </p>

      <p>
        The useful mental model is that a listening socket is not one queue. It
        is a pipeline through several states. A connection can be waiting for
        its handshake to complete, or it can already be established and waiting
        for the application to call <code>accept()</code>. Those are different
        resources with different failure modes.
      </p>

      <div className="diagram">
        <div><strong>SYN</strong><small>Client requests a connection</small></div>
        <div><strong>handshake state</strong><small>SYN-RECV</small></div>
        <div><strong>accept queue</strong><small>Established socket</small></div>
        <div><strong>accept()</strong><small>User space takes ownership</small></div>
      </div>

      <h2>The three-way handshake is kernel work</h2>

      <p>
        The client starts with a SYN. The server replies with SYN-ACK. The
        client sends the final ACK. Only then is the connection fully
        established from TCP's perspective.
      </p>

      <pre><code>client                         server

  SYN ------------------------&gt;

      &lt;------------------------ SYN-ACK

  ACK ------------------------&gt;

             established</code></pre>

      <p>
        Your process normally does not participate directly in this exchange.
        The kernel owns the listening socket and processes the packets. It has
        to retain enough state to recognise the final ACK and retransmit the
        SYN-ACK when necessary.
      </p>

      <p>
        That gives us the first important resource: <strong>incomplete
        connection state</strong>. This is the part of the system targeted by a
        SYN flood. An attacker does not need to complete connections if the
        expensive part is making the server remember them.
      </p>

      <h2>The accept queue is a different problem</h2>

      <p>
        Once the final ACK arrives, the kernel can create the established child
        socket. It is now ready for application traffic, but the application
        may not have called <code>accept()</code> yet.
      </p>

      <p>
        Conceptually, Linux therefore has a transition like this:
      </p>

      <pre><code>SYN
 |
 v
[ handshake / request state ]
 |
 | final ACK
 v
[ established ]
 |
 v
[ accept queue ]
 |
 | accept()
 v
application socket</code></pre>

      <p>
        This distinction explains a common production mystery. A server can
        have plenty of CPU and still have connection pressure because user space
        is consuming established sockets more slowly than the network is
        producing them.
      </p>

      <div className="article__callout">
        <strong>Key idea:</strong> the backlog is not simply “how many clients
        can connect”. TCP handshake state and established sockets waiting for
        <code>accept()</code> are separate stages.
      </div>

      <h2>What listen(backlog) means</h2>

      <p>
        Server code often looks like this:
      </p>

      <pre><code>int fd = socket(AF_INET, SOCK_STREAM, 0);
bind(fd, ...);
listen(fd, 1024);

for (;;) &#123;
    int client = accept(fd, NULL, NULL);
    handle(client);
&#125;</code></pre>

      <p>
        The integer passed to <code>listen()</code> is commonly called the
        backlog. It is tempting to interpret 1024 as “1024 TCP connections”.
        That is not a safe mental model.
      </p>

      <p>
        On Linux, the backlog primarily limits the queue of completed
        connections waiting to be accepted. Incomplete handshake handling has
        separate kernel mechanisms and limits. Exact behaviour also depends on
        kernel version and configuration.
      </p>

      <p>
        Frameworks can make this more confusing because they expose their own
        backlog setting, which may be capped or translated before it reaches
        the kernel.
      </p>

      <h2>A backlog absorbs bursts; it does not create capacity</h2>

      <p>
        Suppose an application can accept and initialise 5,000 connections per
        second, but a deploy causes 20,000 clients to reconnect immediately.
        A queue can absorb some of that burst. It cannot change the long-term
        service rate.
      </p>

      <p>
        If arrivals remain faster than consumption, every finite queue
        eventually fills. At that point the system has to reject, drop, delay
        or otherwise apply backpressure.
      </p>

      <p>
        This is queueing theory hiding inside a socket API. The same shape
        appears in message brokers, thread pools, database pools and kernel
        network buffers.
      </p>

      <h2>Why connection storms are especially nasty</h2>

      <p>
        New connections can be expensive before the application has processed a
        single request. The kernel may perform packet processing, routing,
        firewall checks, socket allocation and memory accounting. TLS adds
        cryptographic negotiation above TCP. The application then allocates its
        own state.
      </p>

      <p>
        Short-lived HTTP traffic can therefore spend more effort creating
        connections than doing useful work. Connection reuse changes the
        economics dramatically: HTTP keep-alive avoids repeated TCP setup, while
        HTTP/2 can multiplex many requests over one TCP connection.
      </p>

      <h2>SYN cookies: changing where state lives</h2>

      <p>
        SYN cookies are a particularly elegant defensive technique. Normally,
        the server retains state after receiving a SYN. Under SYN-flood
        pressure, that state itself becomes a target.
      </p>

      <p>
        A SYN cookie instead encodes enough information into the server's
        initial sequence number that the state can be reconstructed when the
        client's final ACK arrives.
      </p>

      <pre><code>normal:

SYN -&gt; allocate state -&gt; SYN-ACK
                       -&gt; wait for ACK

cookie:

SYN -&gt; encode state -&gt; SYN-ACK
                     -&gt; reconstruct after ACK</code></pre>

      <p>
        The deeper systems idea is more important than the TCP detail:
        <strong>when remembering every request is too expensive, encode state
        into something the peer must return.</strong>
      </p>

      <p>
        Cookies do not make capacity infinite. They reduce the amount of
        per-request state needed while the peer is untrusted. Modern Linux
        implementations have evolved substantially, but the trade-off remains:
        reconstructing state later is cheaper than storing all of it immediately
        when an attacker controls the number of attempts.
      </p>

      <h2>Watch the state instead of guessing</h2>

      <p>
        Linux exposes useful information through <code>ss</code>. On a test
        machine:
      </p>

      <pre><code>ss -lnt
ss -nt state syn-recv
ss -s</code></pre>

      <p>
        A growing <code>SYN-RECV</code> population points you toward handshake
        pressure. A large established population can instead indicate that the
        application is not consuming accepted connections quickly enough.
      </p>

      <p>
        Do not treat one counter as proof. Correlate socket state with packet
        captures, application accept rates, CPU, memory pressure and resource
        limits.
      </p>

      <h2>Make the consumer deliberately slow</h2>

      <p>
        A useful lab experiment is to create a listener with a small backlog and
        intentionally delay the consumer:
      </p>

      <pre><code>listen(fd, 8);

/* artificial consumer bottleneck */
sleep(5);

for (;;) &#123;
    int client = accept(fd, NULL, NULL);
    /* handle client */
&#125;</code></pre>

      <p>
        Generate a burst of connections and watch <code>ss</code> while varying
        the backlog and the delay. You can see a physical version of the
        queueing model: the producer is faster than the consumer.
      </p>

      <p>
        This experiment is more useful than memorising a recommended backlog
        value because it teaches what the number is actually buying you: time
        during a burst.
      </p>

      <h2>File descriptors: the bottleneck one layer later</h2>

      <p>
        An accepted socket eventually becomes a file descriptor visible to the
        process. That creates another finite resource.
      </p>

      <pre><code>network
  |
  v
TCP state
  |
  v
accept queue
  |
  v
accept()
  |
  v
process file-descriptor table</code></pre>

      <p>
        If the process reaches its descriptor limit, <code>accept()</code> can
        fail even though TCP itself is able to establish connections.
      </p>

      <p>
        This is a recurring systems debugging lesson: the symptom can appear
        several layers away from the exhausted resource. For connection
        exhaustion, inspect descriptor limits, memory, cgroups, connection
        tracking, ephemeral ports and firewall state as well as TCP queues.
      </p>

      <h2>Load balancers create more queues</h2>

      <p>
        In a modern deployment, your application may not terminate the user's
        TCP connection. A load balancer or reverse proxy may terminate one
        connection and create another to your service.
      </p>

      <div className="diagram">
        <div><strong>client</strong><small>Connection burst</small></div>
        <div><strong>load balancer</strong><small>Front-end state</small></div>
        <div><strong>proxy</strong><small>Pooling and retries</small></div>
        <div><strong>application</strong><small>Listen and accept</small></div>
      </div>

      <p>
        This means a client-side connection spike does not necessarily produce
        the same spike at the application. Connection pooling can absorb it.
        Conversely, a proxy restart can create a thundering herd of backend
        connections.
      </p>

      <p>
        Tuning the application's backlog therefore may do nothing if the real
        bottleneck is an ingress worker limit, proxy pool, NAT table, firewall
        state table or another queue upstream.
      </p>

      <h2>Read the failure symptom</h2>

      <p>
        The shape of the client error contains useful information.
      </p>

      <ul>
        <li><strong>Immediate refusal:</strong> investigate listeners, active rejection and firewall behaviour.</li>
        <li><strong>Long timeout:</strong> investigate packet loss, filtering, retransmission and saturation.</li>
        <li><strong>Intermittent failure:</strong> investigate queue saturation and burstiness.</li>
        <li><strong>Deploy-only failure:</strong> investigate draining, readiness and reconnect storms.</li>
      </ul>

      <p>
        These are clues, not diagnoses. A packet capture plus socket state and
        application metrics will tell you much more than a single error string.
      </p>

      <h2>Production debugging checklist</h2>

      <pre><code>ss -lnt
ss -nt state syn-recv
ss -s

ulimit -n
cat /proc/sys/fs/file-nr

nstat -az

tcpdump -nn 'tcp port 443'</code></pre>

      <p>
        Correlate these measurements with application-level accept rates. If
        SYN-RECV rises, investigate the handshake path. If established sockets
        accumulate, investigate acceptance and downstream work. If descriptors
        are exhausted, increasing the TCP backlog is fixing the wrong layer.
      </p>

      <h2>The bigger connection: every queue is a contract</h2>

      <p>
        The TCP listen path is a compact example of a principle that appears
        throughout distributed systems. A queue exists because a producer and
        consumer operate at different rates.
      </p>

      <p>
        The useful questions are always the same:
      </p>

      <ol>
        <li>Who produces work?</li>
        <li>Who consumes it?</li>
        <li>What is the finite capacity between them?</li>
        <li>What happens when it fills?</li>
        <li>Does the producer retry, block, drop or fail?</li>
        <li>Can retries make overload worse?</li>
      </ol>

      <p>
        That final question is especially important for networks. A failed
        connection can trigger a retry, which creates another connection
        attempt, which increases load on the already saturated system. A
        seemingly helpful retry policy can become a positive feedback loop.
      </p>

      <h2>Takeaway</h2>

      <p>
        A TCP listening socket is not a magic doorway where connections wait for
        your program. It is the front of a state machine with multiple queues,
        resource limits and overload behaviours.
      </p>

      <p>
        The best production question is not “what backlog should we use?” It is:
        <strong>which layer is producing work, which layer consumes it, what
        finite queue sits between them, and what happens when that queue
        fills?</strong>
      </p>

      <p>
        Once you reason about TCP this way, connection storms stop looking like
        mysterious network failures. They become a concrete resource and
        queueing problem inside the protocol stack.
      </p>
    </ArticleLayout>
  );
}
