import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'node-event-loop-queues-and-libuv',
  title: 'Node.js Event Loop: The Queue Is Not the Scheduler',
  subtitle: 'How libuv, kernel readiness, the worker pool, timers and JavaScript microtasks cooperate—and why “async” code can still block every request.',
  category: 'JavaScript Runtime Internals',
  description: 'A senior-level investigation of Node.js scheduling: libuv phases, poll semantics, microtask checkpoints, nextTick starvation, the worker pool, timer drift, backpressure and practical diagnostics.',
  date: '2026-10-21',
  readingTime: 23,
  tags: ['Node.js', 'JavaScript', 'libuv', 'Concurrency', 'Performance', 'Runtime Internals'],
};

export function NodeEventLoopQueuesAndLibuvArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        “Node.js is single-threaded” is one of those statements that is useful
        until it starts explaining the wrong thing. JavaScript callbacks usually
        run on one main thread, but socket readiness is reported by the operating
        system, many file operations use a native worker pool, garbage collection
        has its own runtime machinery, and worker threads can execute JavaScript
        on additional threads.
      </p>
      <p>
        The event loop is not one queue from which callbacks are simply popped.
        It is a scheduling protocol between Node.js, V8, libuv and the operating
        system. Each layer has different responsibilities, and callback ordering
        emerges from the boundaries between them.
      </p>
      <div className="article__callout">
        <strong>Mental model:</strong> JavaScript runs to completion on its
        current thread. The event loop decides when that thread may run the
        next callback; the kernel and libuv make asynchronous work observable;
        microtask queues can run between callbacks and postpone the next I/O
        opportunity if you keep feeding them.
      </div>

      <h2>1. The layers behind one callback</h2>
      <p>
        Start with a typical network request. JavaScript asks to read from a
        socket. Node delegates the operation to native code and the operating
        system. The main JavaScript thread does not sit in a loop checking the
        socket every microsecond. Instead, libuv waits for readiness events
        through a platform mechanism such as epoll on Linux, kqueue on BSD-like
        systems, or IOCP on Windows.
      </p>
      <p>
        When the operating system reports that a socket can make progress,
        libuv turns that event into work for Node. Node enters the relevant
        callback, JavaScript runs synchronously until it returns or yields
        through an asynchronous boundary, and Node performs its microtask
        checkpoints before moving on.
      </p>
      <pre><code>JavaScript calls an async API
          |
          v
Node native bindings
          |
          v
libuv + operating-system mechanism
          |
          v
completion or readiness event
          |
          v
Node schedules a callback
          |
          v
JavaScript callback + microtask checkpoint</code></pre>
      <p>
        This distinction matters because “waiting for I/O” and “running the
        callback” consume different resources. A socket can wait in the kernel
        while the JavaScript thread serves other work. Once the callback starts,
        however, CPU-heavy JavaScript occupies that thread and delays every
        other callback that needs it.
      </p>

      <h2>2. The libuv phases are scheduling boundaries</h2>
      <p>
        The familiar event-loop diagram describes phases, not a single global
        FIFO queue. The important phases are timers, pending callbacks, poll,
        check and close callbacks. Internal idle and prepare phases also exist.
        Each phase has its own purpose and rules about which callbacks it runs.
      </p>
      <div className="diagram">
        <div><strong>timers</strong><small>Eligible timeout callbacks</small></div>
        <div><strong>poll</strong><small>Wait for and process I/O</small></div>
        <div><strong>check</strong><small>setImmediate callbacks</small></div>
      </div>
      <ul>
        <li><strong>Timers:</strong> runs callbacks whose timer thresholds have become eligible.</li>
        <li><strong>Pending callbacks:</strong> handles certain deferred system-operation callbacks.</li>
        <li><strong>Poll:</strong> retrieves I/O events and runs most I/O-related callbacks. When appropriate, it can wait for more events.</li>
        <li><strong>Check:</strong> runs callbacks registered with <code>setImmediate()</code>.</li>
        <li><strong>Close callbacks:</strong> handles some close events, such as abrupt socket closure.</li>
      </ul>
      <p>
        Poll is not merely another queue. It is where the loop decides whether
        to process available I/O, move on to check callbacks, or wait for the
        next event. If JavaScript callbacks keep arriving or take a long time,
        the loop's ability to return to polling is delayed.
      </p>
      <p>
        There is also a version-sensitive detail. Since libuv 1.45.0, included
        in Node.js 20, timers run after the poll phase on each loop iteration
        rather than using the older before-and-after arrangement. This can
        change the observed ordering between timers and <code>setImmediate()</code>
        in edge cases. If an ordering experiment matters, record the Node
        version rather than treating one observed trace as a language guarantee.
      </p>

      <h2>3. A timer is a threshold, not a deadline</h2>
      <p>
        <code>setTimeout(fn, 50)</code> does not promise that <code>fn</code>
        starts exactly 50 milliseconds later. It makes the callback eligible
        after a threshold. The callback still has to wait for the current
        JavaScript stack to finish, microtasks to drain, and the loop to reach
        a point where timers can run.
      </p>
      <pre><code>const started = performance.now();

setTimeout(() =&gt; &#123;
  console.log('timer became eligible', performance.now() - started);
&#125;, 20);

// A synchronous CPU-bound callback delays this timer until it returns.</code></pre>
      <p>
        The timer becomes eligible while the loop is blocked, but it cannot
        interrupt the synchronous loop. The output will be substantially later
        than 20 milliseconds. This is why a timer is unsuitable as a real-time
        deadline or a substitute for a timeout enforced by another component.
      </p>
      <p>
        For latency-sensitive systems, distinguish at least three times:
        when work was scheduled, when it became eligible, and when the callback
        actually began. Event-loop delay is the gap between eligibility and
        execution, and it can be large even when the underlying I/O completed
        promptly.
      </p>

      <h2>4. setImmediate versus setTimeout</h2>
      <p>
        These APIs express different scheduling intentions. A timeout asks to
        run after a minimum threshold; <code>setImmediate()</code> schedules
        work for the check phase after poll has processed its current batch.
        From top-level code, their relative order can vary with timing and
        runtime conditions.
      </p>
      <pre><code>setTimeout(() =&gt; console.log('timeout'), 0);
setImmediate(() =&gt; console.log('immediate'));</code></pre>
      <p>
        Do not write correctness logic that depends on which line wins in this
        top-level experiment. Now compare scheduling both inside an I/O
        callback:
      </p>
      <pre><code>import &#123; readFile &#125; from 'node:fs';

readFile(import.meta.filename, () =&gt; &#123;
  setTimeout(() =&gt; console.log('timeout'), 0);
  setImmediate(() =&gt; console.log('immediate'));
&#125;);</code></pre>
      <p>
        In this context, the immediate callback is run in the check phase after
        the poll callback, before the next eligible timer callback in the usual
        documented ordering. The point is not to memorise a list of magic
        outputs; it is to reason from the phase in which work is scheduled.
      </p>

      <h2>5. Microtasks are outside the phase diagram</h2>
      <p>
        Promises add another scheduling layer. A Promise reaction is a
        JavaScript microtask, not a libuv poll callback. Node also has the
        <code>process.nextTick()</code> queue, which is a Node-specific mechanism
        and is not itself a libuv phase.
      </p>
      <p>
        At Node callback boundaries, Node processes queued next-tick callbacks
        and Promise microtasks before the event loop proceeds. The exact
        checkpoint details depend on the execution context, and CommonJS and
        ECMAScript module evaluation can produce different observations. But
        the crucial operational fact is stable: a callback can enqueue more
        microtasks, and those microtasks can run before the loop gets another
        chance to poll for I/O.
      </p>
      <pre><code>console.log('start');

setTimeout(() =&gt; console.log('timer'), 0);

Promise.resolve().then(() =&gt; console.log('promise'));
process.nextTick(() =&gt; console.log('nextTick'));

console.log('end');</code></pre>
      <p>
        The synchronous lines run first. In a typical CommonJS script, the
        next-tick callback runs before the Promise reaction, and both run before
        the timer. Avoid turning this into a universal ordering table without
        specifying the module system and scheduling context.
      </p>
      <p>
        The sharp edge is starvation. Recursive <code>process.nextTick()</code>
        calls or a Promise chain that continually schedules another microtask
        can prevent the loop from returning to I/O for an extended period.
        No individual callback needs to be expensive; the problem is that the
        system never reaches a scheduling boundary where other work can run.
      </p>
      <pre><code>// Repeatedly enqueueing next-tick work can starve I/O.
// Keep starvation experiments isolated in a disposable process.</code></pre>
      <p>
        This intentionally pathological example can starve I/O. In application
        code, use next-tick scheduling only when the semantic requirement is
        “after the current operation unwinds, before the loop continues”.
        For cooperative yielding, chunk the work and schedule a later turn
        instead of continually refilling a higher-priority queue.
      </p>

      <h2>6. Async does not mean everything uses the same mechanism</h2>
      <p>
        One of the most important Node.js performance distinctions is the
        difference between kernel-driven I/O and work delegated to libuv's
        thread pool. TCP sockets are typically driven by readiness or completion
        notifications from the platform. Some operations, including many
        filesystem operations, use a worker pool because their underlying
        system calls are blocking or lack a suitable portable asynchronous
        interface.
      </p>
      <p>
        The pool is also used by certain cryptographic and compression
        operations. On Unix-like systems, <code>dns.lookup()</code> commonly
        relies on the system resolver through a thread-pool operation, whereas
        APIs such as <code>dns.resolve()</code> perform DNS protocol queries
        through a different path. Similar-looking APIs can therefore compete
        for very different resources.
      </p>
      <pre><code>HTTP socket readiness  -&gt; operating-system event mechanism
readFile()             -&gt; libuv worker pool
some crypto operations -&gt; libuv worker pool
dns.lookup()           -&gt; system resolver / worker pool
dns.resolve()          -&gt; DNS query implementation</code></pre>
      <p>
        The default libuv worker-pool size is four. Increasing
        <code>UV_THREADPOOL_SIZE</code> can help a workload with many concurrent
        pool-backed operations, but it is not a generic “make Node faster”
        switch. The pool is shared by operations that use it. A burst of
        expensive cryptographic work can delay unrelated filesystem tasks, and
        a larger pool can increase memory use and CPU contention.
      </p>
      <p>
        This is a resource-isolation issue. A service may have an idle main
        thread but still queue work behind a saturated native pool. Conversely,
        a healthy worker pool does not help if one synchronous JavaScript
        callback monopolises the event-loop thread.
      </p>

      <h2>7. The event loop is not a CPU parallelism engine</h2>
      <p>
        Non-blocking I/O improves concurrency because the application can
        overlap waiting with useful work. It does not make CPU-heavy JavaScript
        parallel. A large JSON transformation, compression loop implemented in
        JavaScript, or pathological regular expression can delay timers,
        socket callbacks and health checks on the same loop.
      </p>
      <p>
        The remedy depends on the work. Use native asynchronous APIs for I/O;
        split cooperative CPU work into bounded chunks when possible; use
        <code>worker_threads</code> for CPU-heavy JavaScript that benefits from
        parallel execution; or move the work to a separate process or service
        when isolation and failure boundaries matter more than shared memory.
      </p>
      <p>
        Worker threads do not make shared mutable state free. They introduce
        message passing, structured cloning or transferable objects, memory
        ownership decisions, and synchronisation if shared memory is used.
        Measure the cost of moving data as well as the cost of the computation.
      </p>

      <h2>8. Backpressure is a scheduling concern</h2>
      <p>
        A fast producer can overwhelm a slower consumer even when every API is
        asynchronous. If a service reads data from a socket, transforms it, and
        writes it to another stream without respecting the writable side's
        capacity, it can accumulate unbounded buffers. Eventually memory
        pressure and garbage collection create latency spikes that look like
        event-loop problems.
      </p>
      <p>
        Node streams expose backpressure signals for this reason. When
        <code>writable.write(chunk)</code> returns false, the producer should
        stop producing until the writable stream emits <code>drain</code>.
        Ignoring that signal turns a flow-control problem into a memory problem.
      </p>
      <pre><code>import &#123; once &#125; from 'node:events';

async function copy(source, destination) &#123;
  for await (const chunk of source) &#123;
    if (!destination.write(chunk)) &#123;
      await once(destination, 'drain');
    &#125;
  &#125;

  destination.end();
&#125;</code></pre>
      <p>
        This is the same principle used in TCP flow control, bounded queues,
        message brokers and reactive systems: a producer needs feedback from
        the consumer. Asynchrony without backpressure can simply postpone the
        overload until the buffers become large.
      </p>

      <h2>9. Diagnose the scheduler, not just the CPU</h2>
      <p>
        A low CPU percentage does not prove that a Node service is healthy.
        The process might be waiting for a saturated worker pool, blocked on
        external I/O, spending time in garbage collection, or suffering from
        a long-tail callback that periodically monopolises the event loop.
        Conversely, high CPU can come from useful application work rather than
        scheduler overhead.
      </p>
      <p>
        Start with measurements that separate these possibilities. Monitor
        event-loop delay and utilisation, request latency percentiles, worker
        pool saturation where observable, garbage-collection pauses, and queue
        depths at stream or application boundaries. Correlate them over the
        same time window.
      </p>
      <pre><code>import &#123; monitorEventLoopDelay, performance &#125; from 'node:perf_hooks';

const delay = monitorEventLoopDelay(&#123; resolution: 20 &#125;);
delay.enable();

const start = performance.now();

setInterval(() =&gt; &#123;
  console.log(&#123;
    uptimeMs: Math.round(performance.now() - start),
    meanDelayMs: Number(delay.mean / 1e6).toFixed(2),
    maxDelayMs: Number(delay.max / 1e6).toFixed(2),
  &#125;);

  delay.reset();
&#125;, 5000).unref();</code></pre>
      <p>
        Event-loop delay is a symptom, not a root-cause label. A spike can be
        caused by synchronous code, garbage collection, OS scheduling,
        overloaded callbacks or a large burst of queued work. Pair the metric
        with CPU profiles, traces and application-level queue measurements.
        If event-loop delay is low while latency is high, investigate the
        worker pool and downstream dependencies instead of assuming the loop
        is the bottleneck.
      </p>

      <h2>10. A compact set of experiments</h2>
      <ol>
        <li>Run the timeout-versus-immediate examples both at top level and inside an I/O callback.</li>
        <li>Add a synchronous busy loop and observe timer drift and request latency.</li>
        <li>Replace the busy loop with bounded chunks scheduled across turns and compare tail latency.</li>
        <li>Run many filesystem and crypto operations together, then vary pool size before Node starts.</li>
        <li>Create a recursive next-tick or microtask loop in a disposable process and observe how I/O stops progressing.</li>
        <li>Stream a large input to a deliberately slow writable destination, first respecting backpressure and then ignoring it.</li>
      </ol>
      <p>
        Change one variable at a time. Record the Node version, operating
        system, workload, warm-up behaviour and latency percentiles. Event-loop
        microbenchmarks are especially easy to misread because scheduling,
        JIT compilation and operating-system load can change the result.
      </p>

      <h2>Sharp edges worth remembering</h2>
      <ul>
        <li><strong>One JavaScript thread is not one thread in the whole runtime.</strong> libuv, native libraries and worker threads have their own execution resources.</li>
        <li><strong>Async I/O does not make callbacks asynchronous internally.</strong> Once invoked, a JavaScript callback runs synchronously until it returns.</li>
        <li><strong>Timers specify thresholds.</strong> They do not pre-empt running JavaScript or guarantee exact deadlines.</li>
        <li><strong>Microtasks can postpone I/O.</strong> Continuously replenishing high-priority queues prevents the loop from reaching poll.</li>
        <li><strong>Not all async APIs use the same backend.</strong> Socket I/O, filesystem operations and DNS APIs can compete for different resources.</li>
        <li><strong>Backpressure is correctness under load.</strong> Without it, asynchronous producers can build unbounded queues.</li>
      </ul>

      <h2>Primary sources</h2>
      <ul>
        <li><a href="https://nodejs.org/learn/asynchronous-work/event-loop-timers-and-nexttick" target="_blank" rel="noreferrer">Node.js: The Event Loop, Timers, and nextTick</a> — phases, timer semantics and microtask behaviour.</li>
        <li><a href="https://docs.libuv.org/en/v1.x/loop.html" target="_blank" rel="noreferrer">libuv event-loop API</a> — loop lifecycle and polling behaviour.</li>
        <li><a href="https://docs.libuv.org/en/v1.x/guide/threads.html" target="_blank" rel="noreferrer">libuv threads guide</a> — why the runtime uses threads for some asynchronous operations.</li>
        <li><a href="https://nodejs.org/api/perf_hooks.html" target="_blank" rel="noreferrer">Node.js performance hooks</a> — event-loop delay and utilisation instrumentation.</li>
      </ul>

      <h2>Takeaway</h2>
      <p>
        The Node.js event loop is a scheduling protocol, not a magic concurrency
        engine. libuv coordinates platform I/O and native work; Node decides
        when callbacks run; V8 executes JavaScript and drains microtasks at
        runtime-defined boundaries. Timers become eligible rather than exact,
        worker-pool operations can queue behind one another, and microtasks can
        starve the loop just as effectively as a long synchronous function.
      </p>
      <p>
        When a service stalls, ask three separate questions: <strong>is the
        JavaScript thread busy, is the event loop waiting for an event, or is
        work queued behind another execution resource?</strong> Those are
        different failure modes and need different measurements and remedies.
      </p>
    </ArticleLayout>
  );
}
