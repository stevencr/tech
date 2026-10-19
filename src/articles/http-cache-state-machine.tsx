import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'http-cache-state-machine',
  title: 'HTTP Caching Is a Distributed Consistency Protocol',
  subtitle: 'Freshness, validators, Vary, stale responses and CDN behaviour are not isolated headers. Together they form a state machine that decides which representation a client is allowed to reuse.',
  category: 'Networking & Web Platform',
  description: 'A senior-level deep dive into HTTP caching internals: cache keys, freshness calculations, ETags, 304 responses, Vary, stale serving, invalidation, cache stampedes, security and production debugging.',
  date: '2026-10-20',
  readingTime: 22,
  tags: ['HTTP', 'Networking', 'Browsers', 'CDNs', 'Caching', 'Performance', 'Web Security'],
};

export function HttpCachingStateMachineArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        A web page can return the right response from the wrong place. A browser
        may reuse an old representation from disk, a service worker may answer
        from Cache Storage, a CDN may serve an edge copy, and an origin may
        itself sit behind a reverse-proxy cache. Every layer can be behaving
        according to its own rules while the user still sees stale data.
      </p>

      <p>
        HTTP caching is often taught as a handful of response headers:
        <code> max-age</code>, <code> ETag</code>, <code> Last-Modified</code> and
        <code> Cache-Control</code>. That view misses the interesting part.
        A cache has to decide whether a stored response matches the request,
        whether it is fresh enough to reuse, whether it can be validated, and
        whether policy permits it to be stored or shared at all. It must do
        that while accounting for time spent in transit and other caches.
      </p>

      <div className="article__callout">
        <strong>Mental model:</strong> an HTTP cache is a small distributed
        state machine. It stores a representation plus metadata, selects a
        candidate for a request, calculates its age, and either reuses it,
        validates it, replaces it or refuses to serve it.
      </div>

      <h2>1. There is rarely just one cache</h2>

      <p>
        Consider a request for a JavaScript bundle. The browser's HTTP cache
        may satisfy it without a network request. If it cannot, the request
        may pass through a corporate proxy, a CDN point of presence, a load
        balancer and an application-side cache before reaching the origin.
        The response can then be stored on the way back through the chain.
      </p>

      <div className="diagram">
        <div><strong>Browser</strong><small>Memory and disk HTTP cache</small></div>
        <div><strong>Edge</strong><small>CDN or shared proxy cache</small></div>
        <div><strong>Origin</strong><small>Application and data sources</small></div>
      </div>

      <p>
        These layers do not necessarily share storage, configuration or
        freshness decisions. A browser cache hit says nothing by itself about
        whether the CDN has a hit. A CDN can revalidate against the origin and
        still return a representation from its own store. A service worker can
        implement a separate policy that bypasses or wraps the browser's normal
        HTTP cache.
      </p>

      <p>
        This distinction matters when debugging. “The server returned the new
        file” may mean the origin did; it does not prove that every intermediary
        has stopped serving the old one. Conversely, a browser showing stale
        content does not prove that the origin is stale. You need to identify
        which layer answered and which policy it applied.
      </p>

      <h2>2. Cache selection comes before freshness</h2>

      <p>
        A cache cannot ask whether a response is fresh until it has decided
        whether that stored response is a candidate for the current request.
        The primary cache key is generally based on the request method and
        target URI, with additional selection rules for request headers named
        by the stored response's <code>Vary</code> field.
      </p>

      <p>
        Imagine the same URL returning compressed or uncompressed content
        according to <code>Accept-Encoding</code>. Those responses are not
        interchangeable. The origin can send
        <code> Vary: Accept-Encoding</code> to tell caches that the request
        header value is part of selecting the stored representation.
      </p>

      <pre><code>{["Request A", "GET /app.js", "Accept-Encoding: br, gzip", "", "Request B", "GET /app.js", "Accept-Encoding: identity", "", "Response", "Vary: Accept-Encoding"].join('\n')}</code></pre>

      <p>
        Without the variation rule, a cache might reuse a compressed response
        for a client that did not request that content coding, or reuse a
        representation selected for a different language or media type.
        <code> Vary</code> is therefore part of correctness, not merely a
        performance hint.
      </p>

      <p>
        A response with <code>Vary: *</code> cannot be selected for reuse by
        ordinary request-header matching. And a cache that sees a URL match
        but cannot match the request fields named by <code>Vary</code> has a
        variation miss, not a normal hit.
      </p>

      <h2>3. Freshness is a calculation, not a feeling</h2>

      <p>
        A response is fresh when its current age is less than its freshness
        lifetime. The lifetime may be explicit, usually through
        <code> Cache-Control: max-age=N</code> or <code>Expires</code>, or it
        may be inferred heuristically when the response provides suitable
        metadata but no explicit freshness.
      </p>

      <p>
        The subtlety is that a response can already have spent time travelling
        through the network or sitting in an upstream cache before the next
        cache receives it. A downstream cache must not blindly start a new
        freshness timer at zero.
      </p>

      <p>
        HTTP's age calculation accounts for the apparent age derived from
        the response's <code>Date</code> field, any received <code>Age</code>
        value, the request and response delay, and the time the response has
        resided in the current cache. Conceptually, the cache carries forward
        the best estimate of the response's age instead of treating each hop
        as a fresh origin response.
      </p>

      <pre><code>{["freshness_lifetime = max-age, Expires-derived lifetime, or heuristic", "current_age = corrected age when received + time in this cache", "", "Reusable without validation when:", "current_age < freshness_lifetime"].join('\n')}</code></pre>

      <p>
        The exact standard algorithm includes corrected received age and
        corrected initial age; the simplified expression above is a mental
        model, not an implementation recipe. The key point is that a response
        with <code>Age: 240</code> and <code>max-age=300</code> has roughly
        sixty seconds of freshness left, not five fresh minutes.
      </p>

      <p>
        The <code>Age</code> header is an estimate in seconds of time since
        generation or successful validation at the origin. It is useful
        evidence when tracing a cache chain, but it is not a universal
        stopwatch for the whole request and it does not identify which layer
        stored the response.
      </p>

      <h2>4. Cache-Control directives answer different questions</h2>

      <p>
        Several directives sound similar but control different decisions.
        Mixing them up can produce either unnecessary traffic or accidental
        exposure of personalised responses.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Directive</th><th>Meaning</th><th>Common trap</th></tr>
          </thead>
          <tbody>
            <tr><td><code>max-age=300</code></td><td>Fresh for up to 300 seconds, subject to age calculation.</td><td>Assuming every downstream cache starts a new 300-second clock.</td></tr>
            <tr><td><code>no-cache</code></td><td>Storage is allowed, but reuse requires successful validation.</td><td>Reading it as “do not store”.</td></tr>
            <tr><td><code>no-store</code></td><td>Do not store this request or response in a cache.</td><td>Using it as a substitute for correct application data handling.</td></tr>
            <tr><td><code>private</code></td><td>A shared cache must not store the response; a private cache may.</td><td>Assuming it means encrypted or safe to log elsewhere.</td></tr>
            <tr><td><code>public</code></td><td>Explicitly permits shared-cache storage in cases where that would otherwise be restricted.</td><td>Applying it to responses containing user-specific data.</td></tr>
            <tr><td><code>s-maxage=60</code></td><td>Overrides max-age for shared caches and also carries shared-cache revalidation semantics.</td><td>Assuming browser and CDN freshness must be identical.</td></tr>
            <tr><td><code>must-revalidate</code></td><td>Once stale, the response cannot be reused without successful validation.</td><td>Expecting a cache to serve stale content just because the origin is down.</td></tr>
          </tbody>
        </table>
      </div>

      <p>
        In particular, <code>no-cache</code> does not mean “never cache this”.
        It means that a stored response cannot be reused without checking
        whether it remains valid. That can be exactly what you want for a
        frequently viewed page whose body changes rarely: keep the bytes
        locally, but ask the origin whether they still represent the current
        resource.
      </p>

      <p>
        <code>no-store</code> is the directive that prohibits storage. It is
        appropriate when caching itself is unacceptable, but it should not
        be treated as a general security boundary. It does not prevent an
        application from accidentally writing the same sensitive value to
        logs, analytics, local application state or another storage mechanism.
      </p>

      <p>
        The word “private” is also easy to overread. In HTTP caching, it
        distinguishes private caches such as a user's browser from shared
        caches such as a CDN. It does not mean private in the cryptographic
        sense, and it does not make a response safe to expose to another
        user through a badly configured application cache.
      </p>

