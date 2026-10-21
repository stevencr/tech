import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'browser-rendering-pipeline',
  title: 'The Browser Rendering Pipeline Is a Dependency Graph, Not a Paint Loop',
  subtitle: 'Follow a style change through invalidation, layout, paint recording, rasterisation and compositing—and learn why tiny DOM writes can trigger expensive work while some animations bypass the main thread.',
  category: 'Browser & Web Platform Internals',
  description: 'A senior-level deep dive into browser rendering: style invalidation, layout dependencies, paint records, raster tiles, compositor threads, forced synchronous layout, containment, animation trade-offs and practical performance investigations.',
  date: '2026-10-22',
  readingTime: 23,
  tags: ['Browsers', 'Rendering', 'CSS', 'JavaScript', 'Performance', 'Compositing', 'Web Platform'],
};

export function BrowserRenderingPipelineArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        A common performance story goes like this: JavaScript changes the DOM,
        the browser recalculates styles, lays out the page, paints pixels, and
        finally displays the frame. That sequence is a useful first sketch, but
        it leads to a misleading optimisation strategy: treating rendering as
        one expensive loop that runs from top to bottom after every change.
      </p>

      <p>
        Modern rendering engines are closer to <strong>a dependency graph with
        invalidation, cached intermediate representations and multiple worker
        threads</strong>. A mutation marks some derived information as stale.
        The engine decides which dependencies must be recomputed. Paint work
        can be recorded separately from rasterising it into pixels, and the
        compositor can sometimes produce a new frame without asking the main
        thread to run JavaScript or layout at all.
      </p>

      <div className="article__callout">
        <strong>Core model:</strong> a DOM mutation does not mean “redraw the
        page”. It means “some facts derived from the DOM may no longer be
        valid”. Performance depends on which facts became dirty, how far that
        invalidation propagates, and which cached work can still be reused.
      </div>

      <h2>1. The pipeline is a set of dependencies</h2>
      <p>
        A simplified rendering path has several distinct stages. The names and
        implementation details vary between engines, but the conceptual
        boundaries are useful across Chromium, WebKit and Gecko.
      </p>

      <div className="diagram">
        <div><strong>DOM + CSS</strong><small>Structure and rules</small></div>
        <div><strong>Style + Layout</strong><small>Computed values and geometry</small></div>
        <div><strong>Paint</strong><small>Display instructions</small></div>
        <div><strong>Raster</strong><small>Instructions become pixels</small></div>
        <div><strong>Composite</strong><small>Surfaces become a frame</small></div>
        <div><strong>Display</strong><small>Frame reaches the screen</small></div>
      </div>

      <p>
        The diagram is not a promise that every frame executes every stage.
        Changing a width may invalidate geometry and require new paint output.
        Changing a background colour often leaves geometry intact but changes
        paint output. Updating a transform on an already composited element may
        only change how an existing surface is placed. Scrolling can sometimes
        be handled by the compositor using already-rasterised tiles.
      </p>

      <p>
        The browser therefore tries to preserve work. It caches computed style,
        layout information, display items, raster tiles and compositor state.
        The optimisation problem is not merely making each stage fast; it is
        avoiding unnecessary invalidation and keeping the dependency graph
        small enough that a local change remains local.
      </p>

      <h2>2. Style recalculation: selectors are only half the story</h2>
      <p>
        The browser computes the styles that apply to each element by combining
        author rules, user-agent rules, inheritance, cascade layers, specificity,
        custom properties and other inputs. Engines use selector matching
        structures and caches to avoid naively testing every selector against
        every node on every frame.
      </p>

      <p>
        The harder question is <em>which elements need their style recomputed
        after a mutation?</em> Changing a class on one element can affect that
        element, descendants that inherit values, siblings matched by relational
        selectors, or other nodes whose selector dependencies have changed.
        Selectors such as <code>:has()</code>, sibling combinators and broad
        ancestor-dependent rules can make the affected set less obvious than
        the element whose class changed.
      </p>

      <p>
        Engines track invalidation hints and try to narrow the work, but they
        cannot always prove that only one node is affected. Inheritance, custom
        properties and selector relationships create dependencies across parts
        of the tree. This is why “I changed one class” is not a reliable measure
        of rendering cost.
      </p>

      <h3>Component boundaries are not automatically rendering boundaries</h3>
      <p>
        A React component boundary is an application abstraction. It does not
        guarantee that the browser can isolate style or layout work to that
        component. A component can render independently in React while its
        CSS changes affect the geometry of a large surrounding layout. Conversely,
        many DOM nodes are not necessarily slow if their style and layout
        dependencies are well behaved and updates are infrequent.
      </p>

      <p>
        When style recalculation is expensive, inspect the affected-node count
        and selector patterns before deleting DOM nodes indiscriminately.
        Simplifying a selector dependency or isolating a region can be more
        effective than reducing the raw number of elements.
      </p>

      <h2>3. Layout is constraint solving, not assigning coordinates</h2>
      <p>
        Layout converts computed styles and content into geometry: box sizes,
        positions, line breaks, baselines, scrollable overflow and relationships
        between formatting contexts. A child’s size can affect a parent; a
        sibling’s size can shift later siblings; text wrapping can change an
        element’s height; intrinsic sizing can propagate constraints across a
        grid or flex container.
      </p>

      <p>
        That makes layout a dependency problem. If a container becomes narrower,
        text may wrap. The wrapped text changes the height of a card. That
        changes the position of every item below it. A change that looks local
        in the DOM can therefore have a broad geometric footprint.
      </p>

      <p>
        Layout engines have incremental algorithms and can often relayout a
        subtree. But dependencies such as intrinsic sizes, percentage sizing,
        grid track calculations, fragmentation and out-of-flow positioning can
        enlarge the affected region. The exact scope is an engine implementation
        detail, not a contract developers can assume from DOM ancestry alone.
      </p>

      <h3>Why reading layout can cause work</h3>
      <p>
        DOM writes are often deferred so the browser can batch them before the
        next rendering opportunity. A geometry read such as
        <code>offsetWidth</code>, <code>offsetHeight</code>,
        <code>getBoundingClientRect()</code> or some computed-style queries may
        require up-to-date style or layout. If the document is dirty, the read
        can force the browser to synchronously bring those derived values up to
        date before returning.
      </p>

      <p>
        Consider a loop that changes a width, reads the resulting height, then
        changes another width and reads again. Each read can force the pending
        layout to complete. This pattern is commonly called layout thrashing.
      </p>

      <pre><code>for (const card of cards) {'{'}
  card.style.width = "320px";
  console.log(card.getBoundingClientRect().height);
{'}'}</code></pre>

      <p>
        The problem is not that <code>getBoundingClientRect()</code> is inherently
        slow. It is that the read creates a synchronisation point between
        JavaScript writes and browser-maintained geometry. Repeating that
        synchronisation can prevent the engine from batching work.
      </p>

      <p>A better pattern is to separate measurement from mutation:</p>

      <pre><code>const heights = cards.map((card) =&gt;
  card.getBoundingClientRect().height
);

for (const card of cards) {'{'}
  card.style.width = "320px";
{'}'}</code></pre>

      <p>
        This is not a universal drop-in replacement: if the new width must
        determine the measured height, the measurement logically belongs after
        the width change. In that case, consider whether the browser can express
        the relationship declaratively with CSS, whether a single layout pass
        is sufficient, or whether the UI can tolerate measuring in one frame
        and applying changes in the next.
      </p>

      <h2>4. Paint is not the same as rasterisation</h2>
      <p>
        “Paint” is overloaded terminology. In Chromium’s architecture, the
        main thread records drawing instructions and associated properties;
        raster workers turn relevant display-list content into pixel tiles.
        The compositor then combines those rasterised surfaces into a frame.
        Other engines use different internal names and structures, but the
        separation between describing what should be drawn and producing pixels
        is an important mental model.
      </p>

      <p>
        Imagine a card with text, a gradient, a shadow and a border. The engine
        may record the commands needed to draw those things. If the card moves
        through a transform, the same rasterised content may be reused at a new
        position. If the text changes, the display instructions and raster
        content may need updating. If the card’s dimensions change, both its
        geometry and the regions affected by painting may change.
      </p>

      <p>
        Rasterisation is also spatially incremental. Large content is divided
        into tiles so the browser does not need to rasterise every pixel of a
        huge page before displaying the viewport. Tiles near the visible area
        can receive priority; zooming or scrolling may require different tiles
        or raster scales. A page can therefore be smooth in one region and
        briefly show checkerboarding when new content has not been rasterised
        quickly enough.
      </p>

      <p>
        The practical lesson is to distinguish the CPU cost of recording paint
        from raster work and from the cost of compositing. A performance trace
        showing a long paint-related task is a different diagnosis from missing
        raster tiles or expensive compositing. “The GPU is doing it” does not
        mean the work is free, and it does not mean the main thread is irrelevant.
      </p>

      <h2>5. The compositor is a separate scheduling opportunity</h2>
      <p>
        In Chromium, the main thread maintains the DOM and performs JavaScript,
        style calculation, layout and much of paint recording. Work is committed
        to compositor-side structures. The compositor can coordinate raster
        workers and produce frames from existing surfaces. Some scrolling and
        animations can proceed without waiting for the main thread, which is
        why a busy JavaScript task does not always freeze every visual movement.
      </p>

      <p>
        This is a conditional escape hatch, not a second browser that can do
        anything. The compositor needs suitable existing content and properties.
        A transform or opacity animation can often be applied to a composited
        surface without recalculating layout or repainting its contents. An
        animation that changes width, font metrics, shadows or other paint
        inputs may still need main-thread work.
      </p>

      <div className="article__callout">
        <strong>Important distinction:</strong> compositor-friendly does not
        mean “all work happens on the GPU”. It means the browser may update the
        placement or blending of already prepared content without running the
        full main-thread rendering path. Rasterisation, memory movement,
        synchronisation and frame submission still cost time.
      </div>

      <h3>Why transform and opacity are usually good animation properties</h3>
      <p>
        Compare animating <code>left</code> with animating
        <code> transform</code>. A positional layout property may alter geometry
        and trigger layout and paint. A transform changes the mapping from an
        element’s local coordinate space to the screen; when the element is
        already composited, the compositor may be able to apply that change
        directly. Opacity can often be handled similarly.
      </p>

      <pre><code>/* Usually asks layout to reconsider geometry */
.panel {'{'}
  transition: left 200ms ease;
{'}'}

/* Often allows compositor-only updates */
.panel {'{'}
  transition: transform 200ms ease, opacity 200ms ease;
{'}'}</code></pre>

      <p>
        “Often” matters. A transform can affect overflow, hit testing, stacking
        and raster scale. The browser may decide that promoting an element is
        not worthwhile, or may need to rasterise it again as its scale changes.
        A transformed element can also create a stacking context and change
        containing-block behaviour for positioned descendants.
      </p>

      <h2>6. More layers can make performance worse</h2>
      <p>
        A tempting optimisation is to add <code>will-change: transform</code>
        to every animated element, hoping to force compositing. This can improve
        a measured bottleneck, but it is not a free “use the GPU” switch.
        Composited content needs memory for rasterised surfaces and tiles.
        Extra layers add bookkeeping, resource pressure and compositing work.
        Large or high-resolution layers can be particularly expensive on mobile
        devices and laptops with constrained graphics memory.
      </p>

      <p>
        Layerisation is an engine decision influenced by several properties and
        relationships. A CSS declaration does not guarantee a dedicated layer,
        and a layer is not necessarily a separate GPU allocation with a simple
        one-element-to-one-texture mapping. Inspect the browser’s Layers panel
        and rendering diagnostics rather than assuming that a property created
        the layer you wanted.
      </p>

      <p>
        Use <code>will-change</code> as a measured hint for a known upcoming
        change, and remove it when the transition is over if keeping it has a
        resource cost. Do not apply it globally as a prophylactic. The right
        optimisation may be reducing invalidation, simplifying paint, shrinking
        a surface or avoiding an animation entirely.
      </p>

      <h2>7. Containment changes the dependency graph</h2>
      <p>
        CSS containment gives the engine information about how much one region
        can affect the rest of the page. For example, <code>contain: layout</code>
        establishes a layout containment boundary, while
        <code>contain: paint</code> constrains painting and clipping behaviour.
        <code>contain: content</code> combines layout, paint and style
        containment. These declarations can reduce the scope of work, but they
        also change layout and painting semantics.
      </p>

      <p>
        Containment is not merely a speed flag. Layout containment can affect
        containing blocks and formatting behaviour; paint containment clips
        descendants to the containment box; size containment means the element’s
        intrinsic size is not derived in the usual way from its contents. Add
        it only when those semantics fit the component and verify the result.
      </p>

      <p>
        For long documents, <code>content-visibility: auto</code> can let the
        browser skip much of the rendering work for off-screen subtrees. A
        corresponding <code>contain-intrinsic-size</code> can provide a
        placeholder size while the contents are skipped, reducing scroll jumps
        when the browser later renders them. This is useful for large feeds,
        long settings pages and documentation, but requires testing for focus,
        find-in-page, accessibility, scroll anchoring and dynamic content.
      </p>

      <pre><code>.article-section {'{'}
  content-visibility: auto;
  contain-intrinsic-size: auto 700px;
{'}'}</code></pre>

      <p>
        The value <code>700px</code> is only an estimate in this example, not a
        magic constant. If the estimate differs substantially from the actual
        content, the page may adjust as skipped content becomes rendered. Choose
        a realistic placeholder or use the browser’s remembered intrinsic size
        where appropriate, and test with real content rather than an empty demo.
      </p>

      <h2>8. requestAnimationFrame is a coordination point, not a performance spell</h2>
      <p>
        <code>requestAnimationFrame()</code> asks the browser to call a callback
        before a future repaint opportunity. It is useful for synchronising
        visual updates with the display rather than using arbitrary intervals.
        The callback is one-shot, usually follows the display refresh cadence,
        and is commonly paused in background tabs.
      </p>

      <p>
        It does not automatically move work off the main thread, and it does
        not guarantee that the browser will paint immediately after the callback.
        A long callback can miss the frame deadline. If the callback performs
        a costly DOM mutation followed by a geometry read, it can still force
        synchronous layout. If it schedules a large amount of JavaScript every
        frame, it can still starve input and other work.
      </p>

      <p>
        A useful pattern is to collect state changes and perform one visual
        update per frame. Keep reads and writes grouped, and do not use
        <code>requestAnimationFrame()</code> as a way to disguise expensive
        work that belongs in a worker or should be reduced altogether.
      </p>

      <pre><code>let framePending = false;
let latestX = 0;

function onPointerMove(event) {'{'}
  latestX = event.clientX;
  if (framePending) return;

  framePending = true;
  requestAnimationFrame(() =&gt; {'{'}
    framePending = false;
    marker.style.transform = "translateX(" + latestX + "px)";
  {'}'});
{'}'}</code></pre>

      <p>
        This coalesces many pointer events into one visual write per frame.
        It does not preserve every intermediate pointer coordinate, which is
        exactly the point for a marker whose only concern is its latest visual
        position. For drawing applications, gesture recognition or input
        processing, dropping intermediate samples may be incorrect; use the
        appropriate input APIs and preserve the data your semantics require.
      </p>

      <h2>9. Measure the bottleneck, not the folklore</h2>
      <p>
        A frame budget is the time available before the next display deadline.
        At 60 Hz a refresh interval is about 16.7 ms; at 120 Hz it is about
        8.3 ms. That interval is not a JavaScript budget. The browser also needs
        time for style, layout, paint, raster scheduling, compositing and frame
        submission, and other system activity can compete for CPU and GPU time.
        Some work can overlap across threads, but overlap does not make the
        deadline disappear.
      </p>

      <p>
        Start with a reproducible interaction and a performance recording. Look
        for long tasks, repeated style recalculation, forced layout nested under
        JavaScript, expensive paint, raster delays and compositor activity.
        Compare the trace before and after a change. The objective is to explain
        which dependency was expensive and why the optimisation removed or
        reduced it.
      </p>

      <h3>Experiment A: reveal forced layout</h3>
      <p>
        Create a page with a few hundred cards. In one version, alternate a
        style write with <code>getBoundingClientRect()</code> in a loop. In the
        other, gather all measurements first and then apply writes. Record both
        versions in DevTools. Look for forced-reflow warnings and repeated
        layout work, not just total JavaScript duration.
      </p>

      <h3>Experiment B: compare animation properties</h3>
      <p>
        Animate one element using <code>left</code>, then using
        <code>transform</code>. Keep the element, duration and workload the
        same. Record a trace and inspect the main-thread work, paint activity,
        dropped frames and layerisation. Repeat with a large shadow or a
        complex descendant tree; the result will help show why property names
        alone do not guarantee performance.
      </p>

      <h3>Experiment C: inspect off-screen content</h3>
      <p>
        Render a long list of complex cards, then compare the page with and
        without <code>content-visibility: auto</code>. Measure initial rendering,
        scroll responsiveness and memory, and verify that content remains
        usable with keyboard navigation and browser search. Performance wins
        should be evaluated against correctness and accessibility, not in
        isolation.
      </p>

      <h3>Instrument long animation frames</h3>
      <p>
        Where supported, the Long Animation Frames API can help identify
        rendering updates that take more than 50 ms and provide script timing
        information. Availability varies by browser, so treat this as an
        enhancement to profiling rather than the only diagnostic path.
      </p>

      <pre><code>if (PerformanceObserver.supportedEntryTypes?.includes("long-animation-frame")) {'{'}
  const observer = new PerformanceObserver((list) =&gt; {'{'}
    for (const entry of list.getEntries()) {'{'}
      console.log("Long frame:", entry.duration, entry);
    {'}'}
  {'}'});
  observer.observe({'{'} type: "long-animation-frame", buffered: true {'}'});
{'}'}</code></pre>

      <p>
        Pair this with the Performance panel and field metrics. A trace explains
        one execution; field data tells you whether the problem is common across
        devices and user journeys. Interaction to Next Paint (INP) is especially
        relevant because an interaction can feel slow due to input delay,
        processing time or presentation delay. Rendering is only one part of
        that chain.
      </p>

      <h2>10. Common misconceptions that waste engineering time</h2>
      <ul>
        <li>
          <strong>“Any DOM change repaints the whole page.”</strong> Engines
          invalidate and reuse work incrementally. The actual affected region
          depends on style, layout and paint dependencies.
        </li>
        <li>
          <strong>“A transform is always free.”</strong> It may avoid layout,
          but rasterisation, compositing, memory and large surfaces still cost
          resources.
        </li>
        <li>
          <strong>“The GPU is busy, so the main thread cannot matter.”</strong>
          The main thread may still be responsible for style, layout, paint
          recording, JavaScript and committing updated compositor state.
        </li>
        <li>
          <strong>“requestAnimationFrame makes code fast.”</strong> It aligns
          work with a rendering opportunity; it does not shorten the work or
          move it to another thread.
        </li>
        <li>
          <strong>“Fewer DOM nodes always means faster rendering.”</strong>
          Tree size matters, but invalidation scope, selector dependencies,
          intrinsic sizing, paint complexity and update frequency can dominate.
        </li>
        <li>
          <strong>“will-change should be added to animated elements by default.”</strong>
          Layer promotion has costs. Measure the real bottleneck and the memory
          trade-off.
        </li>
      </ul>

      <h2>11. A practical debugging sequence</h2>
      <ol>
        <li>
          Reproduce a specific slow interaction on a representative device and
          viewport. Avoid optimising a synthetic page that does not resemble
          production.
        </li>
        <li>
          Record a performance trace and identify whether the delay is input
          handling, JavaScript, style, layout, paint, rasterisation or
          compositing. Do not infer the stage from visual symptoms alone.
        </li>
        <li>
          If layout is expensive, inspect forced synchronous reads, layout
          invalidation scope, intrinsic sizing and repeated write/read cycles.
        </li>
        <li>
          If paint or raster is expensive, inspect shadows, filters, large
          surfaces, repeated invalidation and whether content can be simplified
          or rendered lazily.
        </li>
        <li>
          If the main thread is busy during animation, determine whether the
          visual change can be represented by transform or opacity, or whether
          the expensive work can be moved off the main thread.
        </li>
        <li>
          Test memory and correctness after adding containment or layer hints.
          Re-measure on more than one device class and retain the change only
          if the improvement is repeatable.
        </li>
      </ol>

      <h2>12. The broader systems lesson</h2>
      <p>
        Browser rendering has the same shape as many incremental systems:
        a source of truth, derived state, dependency tracking, invalidation,
        cached intermediate results and a scheduler that decides when to
        recompute. Build systems, spreadsheet engines, reactive frameworks and
        databases face similar questions. How do you know what became stale?
        How far does a change propagate? When is it safe to reuse a cached
        result? When does a read force pending work to become synchronous?
      </p>

      <p>
        Thinking in terms of invalidation explains why two visually similar
        implementations can have very different performance. One may alter a
        property that only changes compositor state; another may trigger a
        chain of style, geometry and paint dependencies. One may batch work;
        another may force the engine to stop and synchronise after every write.
        The difference is architectural, not a mysterious property of the GPU.
      </p>

      <div className="article__callout">
        <strong>Takeaway:</strong> optimise the dependency graph, not the slogan.
        Find what became invalid, how far the invalidation spread, and which
        stage actually missed the frame deadline. Then reduce that work, batch
        synchronisation points, or choose a representation the browser can
        update more cheaply.
      </div>

      <h2>Further reading</h2>
      <ul>
        <li><a href="https://www.chromium.org/developers/the-rendering-critical-path/">Chromium: The Rendering Critical Path</a> — how DOM/style changes propagate through Blink and the compositor.</li>
        <li><a href="https://developer.chrome.com/blog/inside-browser-part3">Chrome for Developers: Inside look at a modern browser, part 3</a> — raster tiles, compositor frames and off-main-thread work.</li>
        <li><a href="https://web.dev/articles/rendering-performance">web.dev: Rendering performance</a> — the rendering stages and the work different CSS properties trigger.</li>
        <li><a href="https://web.dev/articles/animations-overview">web.dev: Why are some animations slow?</a> — layout, paint and compositing trade-offs.</li>
        <li><a href="https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame">MDN: requestAnimationFrame()</a> — frame scheduling and callback timing.</li>
        <li><a href="https://developer.mozilla.org/en-US/docs/Web/API/PerformanceScriptTiming/forcedStyleAndLayoutDuration">MDN: forcedStyleAndLayoutDuration</a> — instrumentation for forced style/layout work where supported.</li>
      </ul>
    </ArticleLayout>
  );
}
