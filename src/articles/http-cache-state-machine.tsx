import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'http-cache-state-machine',
  title: 'HTTP Caching Is a Distributed Consistency Protocol',
  subtitle: 'Freshness, validators, Vary, stale responses and CDN behaviour form a state machine that decides which representation a client may reuse.',
  category: 'Networking & Web Platform',
  description: 'A senior-level deep dive into HTTP cache keys, freshness calculations, ETags, 304 responses, Vary, stale serving, invalidation, stampedes and production debugging.',
  date: '2026-10-20',
  readingTime: 17,
  tags: ['HTTP', 'Networking', 'Browsers', 'CDNs', 'Caching', 'Performance', 'Web Security'],
};

export function HttpCachingStateMachineArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        A page can return the right response from the wrong place. A browser
        may reuse bytes from disk, a service worker may answer from Cache
        Storage, a CDN may serve an edge copy, and a reverse proxy may sit
        between the CDN and the origin. Every layer can follow its own rules
        while the user still sees stale data.
      </p>

      <p>
        HTTP caching is often reduced to a few headers: <code>max-age</code>,
        <code> ETag</code> and <code>Cache-Control</code>. The interesting
        work is the decision process around them. A cache must select a
        matching representation, calculate its age, decide whether it can
        reuse or validate it, and enforce rules about storage and sharing.
      </p>

      <div className="article__callout">
        <strong>Mental model:</strong> an HTTP cache is a distributed state
        machine. It stores bytes plus metadata, chooses a candidate for each
        request, then reuses, validates, replaces or refuses that response.
      </div>

      <h2>1. There is rarely just one cache</h2>

      <div className="diagram">
        <div><strong>Browser</strong><small>Memory and disk HTTP cache</small></div>
        <div><strong>Edge</strong><small>CDN or shared proxy</small></div>
        <div><strong>Origin</strong><small>Application and data sources</small></div>
      </div>

      <p>
        These layers do not share a single store or necessarily share
        configuration. A browser hit says nothing about whether the CDN hit.
        A CDN can revalidate with the origin and still return bytes from its
        own store. A service worker can apply a separate policy that bypasses
        or wraps the browser's normal HTTP cache.
      </p>

      <p>
        This is why “the server has the new file” is weak evidence. It may
        mean only that the origin does. Diagnose the layer that answered,
        not merely the layer you can see in application logs.
      </p>

      <h2>2. Selection comes before freshness</h2>

      <p>
        A cache cannot ask whether a response is fresh until it decides
        whether that response matches the current request. The primary key
        is generally based on method and target URI. The stored response's
        <code> Vary</code> field can add request headers to representation
        selection.
      </p>

      <p>
        For example, the same URL may return compressed or uncompressed
        content according to <code>Accept-Encoding</code>. The origin can
        send <code>Vary: Accept-Encoding</code> so those variants are not
        treated as interchangeable.
      </p>

      <pre><code>{["Request A: GET /app.js", "Accept-Encoding: br, gzip", "", "Request B: GET /app.js", "Accept-Encoding: identity", "", "Response: Vary: Accept-Encoding"].join('\n')}</code></pre>

      <p>
        Without the variation rule, a cache can serve a representation
        selected for a different language, media type or content coding.
        <code>Vary: *</code> cannot match through ordinary request-header
        selection. A URL match with no matching variant is a variation miss,
        not a cache hit.
      </p>

      <h2>3. Freshness carries across hops</h2>

      <p>
        A response is fresh when its current age is below its freshness
        lifetime. That lifetime may come from <code>Cache-Control:
        max-age=N</code>, <code>Expires</code>, or a heuristic when explicit
        freshness is absent.
      </p>

      <p>
        A response may already have spent time travelling or sitting in an
        upstream cache. A downstream cache must not restart the timer at
        zero. HTTP's age calculation accounts for the apparent age derived
        from <code>Date</code>, a received <code>Age</code> value, request
        and response delay, and time resident in the current cache.
      </p>

      <pre><code>{["freshness_lifetime = explicit lifetime or permitted heuristic", "current_age = corrected age on receipt + resident time", "", "Reusable without validation when:", "current_age < freshness_lifetime"].join('\n')}</code></pre>

      <p>
        This is a mental model, not the full normative algorithm. If a
        response has <code>Age: 240</code> and <code>max-age=300</code>,
        it has roughly sixty seconds of freshness left, not five fresh
        minutes. <code>Age</code> is useful evidence about a cache chain,
        but it does not identify which cache stored the response.
      </p>

      <h2>4. Directives that sound alike are not alike</h2>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Directive</th><th>Meaning</th><th>Sharp edge</th></tr></thead>
          <tbody>
            <tr><td><code>max-age=300</code></td><td>Fresh for up to 300 seconds, subject to age.</td><td>Each hop does not get a new 300 seconds.</td></tr>
            <tr><td><code>no-cache</code></td><td>Storage is allowed; validate before reuse.</td><td>It does not mean “do not store”.</td></tr>
            <tr><td><code>no-store</code></td><td>Do not store this request or response in a cache.</td><td>It is not a general data-security boundary.</td></tr>
            <tr><td><code>private</code></td><td>A shared cache must not store the response.</td><td>It does not mean encrypted or safe to log.</td></tr>
            <tr><td><code>public</code></td><td>Explicitly permits shared storage where otherwise restricted.</td><td>Do not apply casually to personalised data.</td></tr>
            <tr><td><code>s-maxage=60</code></td><td>Overrides max-age for shared caches and requires revalidation when stale.</td><td>Browser and CDN policies can differ.</td></tr>
            <tr><td><code>must-revalidate</code></td><td>Do not reuse a stale response without successful validation.</td><td>Origin failure does not automatically permit stale fallback.</td></tr>
          </tbody>
        </table>
      </div>

      <p>
        <code>no-cache</code> is useful when bytes can be kept locally but
        freshness must be checked before reuse. <code>no-store</code>
        prohibits caching. Neither directive prevents an application from
        writing the same value to logs or another storage system.
      </p>

      <p>
        “Private” describes the cache class: a browser is private, a CDN is
        shared. It is not a cryptographic guarantee. Treat policy for
        personalised responses as a security decision, not just a tuning
        knob.
      </p>

