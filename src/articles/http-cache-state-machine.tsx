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

