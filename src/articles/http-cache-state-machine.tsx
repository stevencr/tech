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

      <h2>5. Stale does not mean unusable</h2>

      <p>
        When freshness expires, a response becomes stale: it is no longer
        reusable under ordinary freshness rules without validation or another
        explicit permission. It is not necessarily corrupt or definitely old.
        The cache can revalidate it, replace it, discard it, or sometimes
        serve it stale under carefully defined conditions.
      </p>

      <p>
        <code>stale-while-revalidate</code> permits a cache to return a stale
        response while it attempts validation in the background.
        <code> stale-if-error</code> can permit stale content when the origin
        fails. These directives encode a product decision: how much staleness
        is acceptable in exchange for latency or availability?
      </p>

      <h2>6. Validation saves bandwidth, not the round trip</h2>

      <p>
        A stale response can carry an entity tag chosen by the origin. The
        cache sends that tag in a conditional request. If the selected current
        representation still matches, the server can return
        <code>304 Not Modified</code> without a representation body. The cache
        retains its stored bytes and updates the stored response using the
        applicable metadata from the validation response.
      </p>

      <pre><code>{["GET /app.js HTTP/1.1", "If-None-Match: \"build-42\"", "", "HTTP/1.1 304 Not Modified", "Cache-Control: public, max-age=300", "ETag: \"build-42\""].join('\n')}</code></pre>

      <p>
        A 304 is meaningful in the context of a conditional request and a
        reusable stored representation. It saves body transfer, but still
        costs a round trip and origin work. For a large asset that rarely
        changes, validation is useful. For a tiny API response on a high
        latency connection, a longer acceptable freshness lifetime may be
        more valuable.
      </p>

      <p>
        An ETag is an opaque validator, not necessarily a content hash. It
        may be derived from a hash, revision number or build identifier.
        A strong validator distinguishes changes to representation data that
        matter for strong comparison. A weak tag, prefixed with
        <code>W/</code>, means the origin considers versions equivalent for
        comparisons where weak validators are allowed, even if their bytes
        differ.
      </p>

      <pre><code>{["ETag: \"sha256-abc123\"       # illustrative strong tag", "ETag: W/\"catalog-v7\"       # illustrative weak tag"].join('\n')}</code></pre>

      <p>
        Weak validators are often suitable for cache validation but not for
        every range or lost-update operation. <code>Last-Modified</code> is
        a date-based alternative, but its precision can be too coarse when a
        resource changes multiple times within one timestamp interval. When
        both <code>If-None-Match</code> and <code>If-Modified-Since</code>
        apply, the entity-tag condition takes precedence for cache validation.
      </p>

      <h2>7. Vary and personalisation define who may share bytes</h2>

      <p>
        <code>Vary</code> is a correctness contract. If the application
        selects a response using a custom request header but the cache does
        not include that input in its selection strategy, requests for the
        same URI can incorrectly share one representation. Conversely,
        varying on a high-cardinality header can create near-unique entries
        and destroy cache reuse. Varying on an entire cookie header is often
        a warning that the response is personalised.
      </p>

      <p>
        Shared caches can serve one stored response to many users. Never
        assume <code>Set-Cookie</code> automatically prevents caching in
        every implementation or configuration. For user-specific responses,
        choose policy deliberately: <code>private</code> can allow browser
        caching while excluding shared caches; highly sensitive responses
        may require <code>no-store</code>.
      </p>

      <p>
        Requests containing <code>Authorization</code> have additional
        shared-cache restrictions, but directives such as <code>public</code>
        or <code>s-maxage</code> can change what is permitted. Treat these
        as security decisions. Cross-user response confusion can arise when
        the origin's routing or representation logic disagrees with the
        cache's key, normalisation or eligibility rules. Test personalised
        routes and unusual headers through the real CDN path, not only
        against a local development server.
      </p>

      <h2>8. Invalidation is not the same as freshness</h2>

      <p>
        A time-to-live policy answers how long a response may be reused
        without validation. It does not provide instantaneous global
        invalidation. If a price changes just after a response is cached for
        five minutes, a cache may still be allowed to serve the old value
        during that window.
      </p>

      <p>
        Short freshness lifetimes bound the unvalidated window. CDN purge
        APIs can invalidate stored entries, but propagation and failure
        handling matter. Versioned URLs avoid ambiguity for immutable assets:
        a new build emits a new URL, so new bytes are not confused with the
        old representation under the same name.
      </p>

      <pre><code>{["/assets/app.4c91e8.js   Cache-Control: public, max-age=31536000, immutable", "/index.html             Cache-Control: no-cache"].join('\n')}</code></pre>

      <p>
        This pairing lets a browser keep a fingerprinted bundle for a long
        time while checking the HTML document for a newer bundle reference.
        Deployment order matters: new HTML must not reference assets that
        have not been published yet, and old assets should remain available
        long enough for clients holding old HTML to request them.
      </p>

      <h2>9. Expiry creates load: the cache-stampede problem</h2>

      <p>
        A hot key can serve thousands of requests cheaply until it expires.
        If many clients notice the miss at once, they can all fetch the same
        object from the origin. The resulting burst can overload the very
        service the cache was meant to protect.
      </p>

      <p>
        Shared caches can collapse concurrent misses so one origin fetch
        satisfies many waiting clients. Other tools include jittering
        expiry times, prewarming known hot objects, stale-while-revalidate,
        and single-flight logic around expensive application fetches.
        Each has limits: jitter reduces synchronisation but does not guarantee
        one fetch; process-local single-flight does not coordinate across
        replicas; a distributed lock needs safe lease behaviour.
      </p>

      <p>
        Treat expiry as scheduled load, not just a timestamp. Entries
        populated by one deployment may share similar lifetimes and expire
        together. Track origin request rate, miss and revalidation rates,
        collapsed requests, backend latency and the distribution of cache
        ages to see whether a cache is smoothing load or merely postponing it.
      </p>

      <h2>10. Debug the entire path, not one status code</h2>

      <p>
        Start with the response headers received by the client. Compare
        <code>Age</code>, <code>Date</code>, <code>Cache-Control</code>,
        <code>ETag</code> and <code>Vary</code>, plus any cache-specific
        status fields. Then bypass one layer at a time where possible.
        A 304 proves a conditional validation succeeded; it does not prove
        the application has no caching bug. A 200 does not prove an origin
        miss; an intermediary may have fetched or revalidated the object.
      </p>

      <pre><code>{["# Inspect response headers without downloading the body", "curl -sS -D - -o /dev/null https://example.test/assets/app.js", "", "# Ask caches to validate before reusing a stored response", "curl -sS -H 'Cache-Control: no-cache' -D - -o /dev/null https://example.test/assets/app.js"].join('\n')}</code></pre>

      <p>
        A request's <code>Cache-Control: no-cache</code> asks caches to
        validate before reuse; it does not guarantee every intermediary is
        bypassed, and it does not mean the response cannot be stored.
        Developer-tools “disable cache” options often affect browser caching
        for that session but do not necessarily bypass a service worker, CDN
        or application cache. Know which layer your experiment changes.
      </p>

      <p>
        The <code>Cache-Status</code> response field, defined by RFC 9211,
        provides a standard way for participating caches to explain how they
        handled a request. A cache can report a hit, URI miss, variation miss,
        staleness or forwarding to the next hop. It is not guaranteed to be
        present, but where supported it is more useful than guessing from a
        generic vendor-specific header.
      </p>

      <h2>11. A practical experiment</h2>

      <p>
        Choose a non-sensitive static resource served through the real
        deployment path. Record headers on a cold request, a repeated request,
        and a request after its freshness lifetime. Repeat from a second
        browser profile or network location to distinguish local from shared
        cache behaviour.
      </p>

      <ol>
        <li>Observe whether a repeat request is local, returns a 304, or downloads a new body.</li>
        <li>Compare <code>Age</code> and <code>Date</code> across requests and edge locations.</li>
        <li>Change <code>Accept-Encoding</code> or language and check whether <code>Vary</code> matches the actual selection logic.</li>
        <li>In a test environment, shorten freshness and observe origin load as entries expire.</li>
        <li>Test a purge or versioned-URL deployment, including clients holding old HTML.</li>
        <li>For a personalised endpoint, test with two users and verify that their responses cannot be selected for each other.</li>
      </ol>

      <h2>12. Consistency with a budget</h2>

      <p>
        A cache trades origin work and latency for the possibility of serving
        an older representation. Freshness gives that trade a time budget.
        Validators let the cache cheaply ask whether a stored version remains
        acceptable. Variation rules decide which requests may share a
        representation. Directives govern storage and reuse; purges and
        versioned URLs provide different ways to change visible state.
      </p>

      <p>
        This is consistency design in miniature. If the domain permits a
        bounded stale window, caching can make reads faster and reduce load.
        If the domain requires stronger guarantees, the system must pay for
        them through validation, invalidation, version checks or a different
        data path. “Cache it” is incomplete until acceptable inconsistency
        has been defined.
      </p>

      <ul>
        <li><strong>Selection precedes freshness:</strong> a fresh response for the wrong variant is still wrong.</li>
        <li><strong>Age crosses cache boundaries:</strong> downstream caches must not reset the clock.</li>
        <li><strong>No-cache is not no-store:</strong> validation and storage are separate decisions.</li>
        <li><strong>A 304 needs stored bytes:</strong> it updates metadata around an existing representation.</li>
        <li><strong>ETags are opaque:</strong> weak validators do not promise byte-for-byte identity.</li>
        <li><strong>TTL is not instant invalidation:</strong> purges, versioned URLs and freshness solve different problems.</li>
        <li><strong>Expiry creates load:</strong> correlated misses can turn a healthy cache into an origin incident.</li>
      </ul>

      <div className="article__callout">
        <strong>Takeaway:</strong> HTTP caching is a protocol for controlled
        reuse of representations. Ask which requests are equivalent, what
        evidence makes a copy reusable, who may share it, and how much
        staleness the product can tolerate.
      </div>

      <h2>Further reading</h2>

      <ul>
        <li><a href="https://www.rfc-editor.org/rfc/rfc9111.html" target="_blank" rel="noreferrer">RFC 9111 — HTTP Caching</a>, the normative caching model and freshness algorithm.</li>
        <li><a href="https://www.rfc-editor.org/rfc/rfc9110.html" target="_blank" rel="noreferrer">RFC 9110 — HTTP Semantics</a>, including validators and conditional requests.</li>
        <li><a href="https://www.rfc-editor.org/rfc/rfc5861.html" target="_blank" rel="noreferrer">RFC 5861 — HTTP Cache-Control Extensions for Stale Content</a>.</li>
        <li><a href="https://www.rfc-editor.org/rfc/rfc9211.html" target="_blank" rel="noreferrer">RFC 9211 — The Cache-Status HTTP Response Header Field</a>.</li>
      </ul>
    </ArticleLayout>
  );
}
