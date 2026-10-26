import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'cancellation-is-a-protocol',
  title: 'Cancellation Is a Protocol, Not a Boolean',
  subtitle: 'What actually happens when async work is cancelled: AbortSignal propagation, resource cleanup, stale results, structured concurrency, and the races hidden behind a simple cancel button.',
  category: 'JavaScript and Architecture',
  description: 'A senior-level deep dive into cancellation in JavaScript and Node.js: AbortController, cooperative cancellation, cleanup, deadlines, race conditions, API design and structured concurrency.',
  date: '2026-10-26',
  readingTime: 21,
  tags: ['JavaScript', 'TypeScript', 'Node.js', 'Concurrency', 'Async', 'Architecture', 'AbortController'],
};

export function CancellationIsAProtocolArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        A user changes a search query while the previous request is still in
        flight. The UI starts a second request and aborts the first. The network
        request appears to stop, but an old response still updates the screen.
        Somewhere else, a timed-out HTTP handler leaves a database query running.
        In a third place, a cancelled task rejects with an error that gets logged
        as an outage. All three systems have a cancellation mechanism; none has
        a complete cancellation design.
      </p>

      <p>
        Cancellation is often modelled as a boolean: a task is either cancelled
        or it is not. That is too small a model for asynchronous systems.
        Cancellation is a <strong>protocol between the party requesting that
        work stop and every layer responsible for doing that work</strong>. The
        request must propagate, operations must cooperate, resources must be
        cleaned up, and callers must know whether the work actually stopped or
        merely became irrelevant.
      </p>

      <p>
        JavaScript makes this especially interesting. Promises have no built-in
        cancellation operation. An AbortSignal can communicate intent, but it
        cannot forcibly unwind arbitrary JavaScript, kill every underlying
        operation, or undo a side effect that has already happened. Understanding
        that boundary helps you design safer React effects, Node.js services,
        client libraries, queues and multi-step workflows.
      </p>

      <div className="diagram">
        <div><strong>Request stop</strong><small>A caller, deadline or parent task signals cancellation</small></div>
        <div><strong>Propagate</strong><small>The signal reaches child operations and adapters</small></div>
        <div><strong>Cooperate</strong><small>Each operation stops at a safe point</small></div>
        <div><strong>Reconcile</strong><small>Cleanup, result handling and side effects are settled</small></div>
      </div>

      <h2>Promises represent eventual outcomes, not running computations</h2>

      <p>
        A Promise is an object representing a result that may become available
        later. It does not own the computation that will produce that result.
        The executor passed to <code>new Promise</code> runs immediately, and the
        Promise API offers no standard way to tell its executor to stop. Calling
        <code> reject()</code> settles the Promise; it does not terminate a
        timer, socket, worker or database query started by the executor.
      </p>

      <pre><code>{`function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const pending = wait(60_000);
// There is no pending.cancel() method.
// Losing interest in the Promise does not clear its timer.`}</code></pre>

      <p>
        This distinction separates three events that application code often
        conflates:
      </p>

      <ul>
        <li><strong>Cancellation requested:</strong> someone no longer wants the work to continue.</li>
        <li><strong>Operation stopped:</strong> the underlying activity observed the request and stopped.</li>
        <li><strong>Result ignored:</strong> the work may continue, but its outcome is no longer allowed to affect the caller.</li>
      </ul>

      <p>
        Those events are not equivalent. A UI can safely ignore a stale result
        even when it cannot stop the server. Conversely, aborting a fetch can
        release client-side resources without proving that a server which already
        received the request did not perform a write. Good APIs make the
        distinction explicit.
      </p>

      <h2>AbortController is a cancellation signal, not a kill switch</h2>

      <p>
        The platform's standard mechanism is <code>AbortController</code> and
        <code> AbortSignal</code>. The controller is held by the party that can
        decide to cancel; the signal is passed down to operations that should
        respond. The signal is one-way: once aborted, it stays aborted. That
        monotonic state is useful because a child operation cannot accidentally
        reset its parent's decision.
      </p>

      <pre><code>{`const controller = new AbortController();

const response = await fetch('/api/search?q=compiler', {
  signal: controller.signal,
});

// Later, perhaps because the query changed:
controller.abort(new DOMException('Superseded', 'AbortError'));`}</code></pre>

      <p>
        A compliant operation can observe <code>signal.aborted</code>, inspect
        <code> signal.reason</code>, or register an abort listener. Fetch,
        response-body consumption and many modern Node.js APIs support signals.
        Passing a signal only works when the receiving API actually honours it;
        adding a <code>signal</code> property to an arbitrary function does not
        magically make that function cancellable.
      </p>

      <p>
        The signal is best thought of as a broadcast of intent. Each layer must
        translate that intent into a meaningful local action: clear a timer,
        close a stream, stop retrying, reject a pending wait, release a lock, or
        decline to publish a result. Some operations can stop promptly; others
        can only stop at a checkpoint; still others cannot be safely interrupted
        once a side effect has crossed a boundary.
      </p>

      <h2>Build cancellation into the operation</h2>

      <p>
        A cancellable delay must both check for an already-aborted signal and
        remove its event listener when it settles. The first check matters
        because abort events are not replayed to listeners registered after the
        signal has already been aborted. Cleanup matters because long-lived
        signals and abandoned listeners can retain closures and objects.
      </p>

      <pre><code>{`function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }

    const timer = setTimeout(done, ms);

    function cleanup() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }

    function done() {
      cleanup();
      resolve();
    }

    function onAbort() {
      cleanup();
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    }

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}`}</code></pre>

      <p>
        The example demonstrates the protocol, but production utilities should
        also define their error contract and test edge cases. In particular,
        cleanup must be idempotent if several completion paths can race. A
        rejected delay does not cancel whatever the caller was doing before or
        after awaiting it; it only stops this timer-backed operation.
      </p>

      <h3>Cancellation is cooperative</h3>

      <p>
        JavaScript on a single event loop cannot process an abort event while
        synchronous code is monopolising that same thread. This loop cannot be
        interrupted by a controller from another callback on the same thread:
      </p>

      <pre><code>{`while (expensiveCondition()) {
  doMoreSynchronousWork();
  // An abort callback cannot run until this code yields.
}`}</code></pre>

      <p>
        CPU-heavy work needs explicit checkpoints, chunking that yields to the
        event loop, or a Worker that can be terminated. Even then, abrupt Worker
        termination is different from graceful cancellation: cleanup code inside
        the worker may not run. If an operation owns external resources, a
        cooperative shutdown protocol is often safer than simply terminating
        execution.
      </p>

      <h2>Propagate cancellation through the call graph</h2>

      <p>
        Cancellation becomes useful when one signal can reach the whole chain of
        work. Imagine an incoming HTTP request that calls a service, which calls
        a retrying API client, which waits between attempts. If the client only
        passes a signal to the final fetch, it may still spend seconds sleeping
        through retries after the caller has disconnected.
      </p>

      <pre><code>{`async function loadProfile(
  userId: string,
  signal: AbortSignal,
) {
  const response = await fetch(`/api/users/\${userId}`, { signal });
  if (!response.ok) throw new Error(`HTTP \${response.status}`);
  return response.json();
}

async function loadWithRetry(
  userId: string,
  signal: AbortSignal,
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    signal.throwIfAborted();

    try {
      return await loadProfile(userId, signal);
    } catch (error) {
      if (signal.aborted) throw signal.reason;
      if (attempt === 2) throw error;
      await delay(200 * (attempt + 1), signal);
    }
  }
  throw new Error('Unreachable');
}`}</code></pre>

      <p>
        Notice that the retry loop checks the signal before each attempt and
        passes it into both the request and the backoff delay. Cancellation is
        not just a parameter on the deepest API call; it is a rule governing
        the whole workflow. Also notice the catch block: an abort should not
        accidentally be interpreted as a transient network failure and trigger
        another attempt.
      </p>

      <p>
        For operations that combine several child tasks, newer platform helpers
        such as <code>AbortSignal.any()</code> can combine cancellation sources.
        A common design is to stop when either the caller aborts or a deadline
        expires. Keep the original signal reasons where possible: they help
        distinguish user navigation, request disconnect, shutdown and timeout
        in logs and metrics.
      </p>

      <pre><code>{`const deadline = AbortSignal.timeout(2_000);
const signal = AbortSignal.any([requestSignal, deadline]);

await loadWithRetry('42', signal);`}</code></pre>

      <p>
        Check runtime and browser support for the exact APIs you target. A
        timeout signal expresses a deadline, but it does not guarantee that all
        child work is stopped at precisely two seconds. The deadline requests
        cancellation; each operation still needs to cooperate.
      </p>

      <h2>Deadlines are better than unrelated local timeouts</h2>

      <p>
        Suppose an endpoint has a total budget of two seconds. It performs
        authentication, calls a service, retries a dependency, and serialises
        the response. If each layer independently starts a two-second timeout,
        the total request can take far longer than two seconds. Nested timeouts
        also obscure which layer owns the remaining budget.
      </p>

      <p>
        A deadline is an end time shared by the call graph. Each operation can
        calculate how much budget remains, and cancellation communicates that
        the budget has expired. This is the same principle used in many RPC
        systems: propagate the caller's deadline instead of inventing a fresh
        full-duration timeout at every hop.
      </p>

      <p>
        A timeout is not the same as a retry policy. If the deadline expires,
        retrying the same operation with the same expired signal is pointless.
        If a remote write timed out, retrying may duplicate a side effect unless
        the operation is idempotent or protected by an idempotency key. Cancellation
        controls local effort; it does not roll back distributed history.
      </p>

      <h2>The stale-result race in user interfaces</h2>

      <p>
        Search-as-you-type is the classic demonstration. Query A starts, then
        query B starts. If B finishes first and A finishes later, A can overwrite
        the newer results. Aborting A is helpful, but cancellation alone should
        not be the only correctness rule: the operation may already have
        completed, an adapter may ignore the signal, or a cached result may
        settle immediately.
      </p>

      <pre><code>{`let generation = 0;

async function search(query: string) {
  const myGeneration = ++generation;
  const controller = new AbortController();

  try {
    const response = await fetch(
      `/api/search?q=\${encodeURIComponent(query)}`,
      { signal: controller.signal },
    );
    const results = await response.json();

    if (myGeneration !== generation) return;
    renderResults(results);
  } catch (error) {
    if (controller.signal.aborted) return;
    throw error;
  }

  return () => controller.abort();
}`}</code></pre>

      <p>
        This sketch illustrates a generation check, not a complete UI hook: the
        caller must retain and abort the previous controller, and cleanup must
        be tied to the component or request lifecycle. The generation check is
        a separate guard that prevents obsolete work from publishing a result.
        In React, an effect cleanup can abort the request, while state updates
        still need to follow the component's current lifecycle.
      </p>

      <p>
        The general rule is powerful: <strong>cancellation reduces wasted work;
        ownership checks protect correctness.</strong> Use both when stale work
        could publish visible state or overwrite a newer value.
      </p>

      <h2>Cancellation and side effects: what can actually be undone?</h2>

      <p>
        Consider a workflow that reserves stock, charges a payment method and
        sends an email. Aborting the client request after the stock reservation
        does not reverse that reservation. Aborting while the payment request is
        in flight may leave the caller uncertain whether the payment provider
        committed the charge. A cancelled Promise tells you about the local
        control flow, not the final state of a remote system.
      </p>

      <p>
        There are three distinct design strategies:
      </p>

      <ul>
        <li><strong>Stop before commit:</strong> check cancellation before beginning an irreversible operation.</li>
        <li><strong>Make repetition safe:</strong> use idempotency keys or deduplication so retries do not repeat a logical action.</li>
        <li><strong>Compensate explicitly:</strong> if a multi-step workflow has already changed state, run a domain-level compensating action rather than pretending cancellation rewinds time.</li>
      </ul>

      <p>
        This is why cancellation cannot replace transactions, idempotency or
        sagas. It is a local control-flow protocol that interacts with those
        correctness mechanisms. The moment work crosses a process or network
        boundary, the outcome may be unknown even when the local wait has been
        cancelled.
      </p>

      <h2>Structured concurrency: cancellation follows ownership</h2>

      <p>
        Many async bugs are really lifetime bugs. A request starts three child
        operations, returns early, and accidentally leaves two of them running.
        A component unmounts but a callback continues holding its state and
        dependencies. A server begins shutdown while background tasks keep
        creating more work.
      </p>

      <p>
        Structured concurrency is the idea that child tasks should have a clear
        parent and a bounded lifetime. When a scope ends, its children should
        either have completed or be cancelled and joined. JavaScript does not
        yet provide one universal built-in task-scope abstraction, but you can
        still design around the principle: create a controller at the ownership
        boundary, pass its signal to children, stop spawning work after abort,
        and wait for cleanup where correctness requires it.
      </p>

      <pre><code>{`async function handleJob(signal: AbortSignal) {
  signal.throwIfAborted();

  const results = await Promise.all([
    fetchSummary(signal),
    fetchPermissions(signal),
    fetchPreferences(signal),
  ]);

  signal.throwIfAborted();
  return combine(results);
}`}</code></pre>

      <p>
        <code>Promise.all</code> rejects when one input rejects, but it does
        not automatically cancel the other inputs. If one child fails, a
        parent-owned controller can abort sibling work; the parent may then need
        to await all children settling so their cleanup completes. The exact
        policy depends on whether partial results are useful and whether each
        child supports cancellation.
      </p>

      <p>
        A useful implementation pattern is to treat the controller as a scope
        resource. The parent owns it; children borrow the signal. A child should
        not abort a shared parent signal just because its own local operation
        failed unless that is the intended failure policy. For independent
        children, separate controllers or a deliberate aggregation layer may be
        appropriate.
      </p>

      <h2>Node.js server lifetimes and disconnects</h2>

      <p>
        On a server, cancellation can originate from several places: the client
        disconnects, the HTTP framework signals that the request is no longer
        useful, a service deadline expires, or the process is shutting down.
        These events are related but not interchangeable. A disconnected client
        may not mean the business operation should stop—for example, an order
        submission may need to finish and be reconciled even if the browser
        closes.
      </p>

      <p>
        Avoid wiring every socket-close event directly to every downstream
        operation without considering the domain. For read-only searches, stop
        expensive work when the caller disappears. For durable commands, you may
        instead acknowledge acceptance, enqueue the command, and let it finish
        independently of the connection. The lifetime of the transport request
        is not always the lifetime of the business operation.
      </p>

      <p>
        During graceful shutdown, stop accepting new work, signal active
        request scopes, allow a bounded period for cleanup, and then force
        termination if the deadline is reached. Log why cancellation was
        requested and whether the operation acknowledged it. A service that
        reports “shutdown complete” while detached tasks continue writing to
        external systems has not really defined its task lifetimes.
      </p>

      <h2>Error handling: abort is expected, but not invisible</h2>

      <p>
        Abort-related failures often arrive as exceptions. Treating every abort
        as an application error creates noisy telemetry; swallowing every
        exception named <code>AbortError</code> can hide genuine failures.
        Prefer checking the signal you own or the documented error contract of
        the operation. The reason can distinguish an expected superseded search
        from an expired deadline or administrative shutdown.
      </p>

      <p>
        Observability should answer four questions: who requested cancellation,
        why, how long the operation took to acknowledge it, and whether cleanup
        completed. Measure cancellation latency for operations that are expected
        to stop promptly. A rising number of cancellations can be normal in a
        typeahead UI, but it can also expose a retry storm, aggressive deadlines
        or clients disconnecting because requests are too slow.
      </p>

      <h2>A review checklist for cancellable APIs</h2>

      <ul>
        <li>Does the API accept an optional <code>AbortSignal</code> where useful?</li>
        <li>Does it reject promptly if the signal is already aborted?</li>
        <li>Does cancellation reach waits, retries, streams and nested calls?</li>
        <li>Are event listeners, timers, sockets and temporary resources cleaned up?</li>
        <li>Can a late result still mutate state after it becomes obsolete?</li>
        <li>Are aborts distinguished from timeouts, ordinary failures and successful completion?</li>
        <li>Could a remote side effect have succeeded even though the local call was aborted?</li>
        <li>Who owns the task lifetime, and does that owner wait for child cleanup?</li>
      </ul>

      <h2>The bigger connection</h2>

      <p>
        Cancellation sits at the intersection of resource management,
        concurrency and distributed systems. In a local timer, stopping work may
        mean clearing one handle. In a stream, it may mean closing a pipeline and
        propagating backpressure. In a worker, it may require cooperative
        checkpoints. In a remote command, it may mean marking the outcome
        uncertain and reconciling it later.
      </p>

      <p>
        The common thread is ownership and acknowledgement. Someone owns the
        work, someone requests that it stop, and the work must define what
        “stopped” means. A boolean can express the request; only a protocol can
        make the behaviour reliable.
      </p>

      <div className="article__callout">
        <strong>Takeaway:</strong> Pass cancellation intent through the entire
        async call graph, make each operation cooperate and clean up, and keep
        correctness guards for stale results and external side effects. An
        aborted Promise is not proof that the underlying work—or the world it
        touched—has been undone.
      </div>
    </ArticleLayout>
  );
}
