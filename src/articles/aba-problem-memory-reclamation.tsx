import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'aba-problem-memory-reclamation',
  title: 'The ABA Problem: When Compare-and-Swap Lies by Omission',
  subtitle: 'Why pointer equality is not proof of unchanged state—and how tagged pointers, hazard pointers, epochs and RCU make concurrent code safe.',
  category: 'Algorithms & Concurrency',
  description: 'A senior-level deep dive into ABA, object lifetime, lock-free progress guarantees and safe memory reclamation.',
  date: '2026-10-19',
  readingTime: 18,
  tags: ['Concurrency', 'Algorithms', 'Memory Models', 'C++', 'Systems Programming'],
};

export function AbaProblemMemoryReclamationArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        Compare-and-swap sounds decisive: update this location only if it still
        contains the value I observed. That conditional operation is the basis
        of many lock-free data structures. But there is a gap between “the
        value is the same” and “the world is unchanged”.
      </p>
      <p>
        A thread reads a reference to node A, pauses, and later finds the same
        reference in the shared head. Other threads may have removed A, changed
        the structure, ended the object's lifetime or reused its address. The
        bits match. The history does not.
      </p>
      <div className="article__callout">
        <strong>Mental model:</strong> compare-and-swap validates a value at one
        instant. It does not validate the object's lifetime or prove that
        assumptions made from an earlier read are still true.
      </div>

      <h2>A Treiber stack, and a stale assumption</h2>
      <p>
        A classic Treiber stack has one atomic head reference. Every node points
        to the next node. A push tries to install a prepared node as the head;
        a pop reads the head and successor, then tries to advance the head.
      </p>
      <p>
        Suppose the stack begins with A at the head and B next. Thread 1 reads
        A and saves B, then gets descheduled. Thread 2 removes A, removes B,
        and puts A back with a different successor. The head is A again, but
        the structure is not the one Thread 1 observed. Its stale update from
        A to saved B can now install an obsolete link.
      </p>
      <div className="diagram">
        <div><strong>Thread 1</strong><small>Observes A → B, then pauses</small></div>
        <div><strong>Thread 2</strong><small>Removes nodes and reinserts A</small></div>
        <div><strong>Head = A</strong><small>Same address, different history</small></div>
      </div>
      <p>
        ABA does not require ending an object's lifetime: removing and
        reinserting the same node can be enough. Reusing the address of an old
        object adds a lifetime hazard. The common mistake is treating equality
        of a reference as proof that nothing relevant happened in between.
      </p>

      <h2>CAS sees a snapshot, not a history</h2>
      <p>
        Compare-and-swap compares the current representation with the expected
        representation. It does not remember intermediate values. If a location
        moves from A to C and then back to A, a later comparison against A can
        succeed. It proves only that the shared location had the expected value
        at that instant—not that the node's fields stayed stable or that the
        object is still safe to access.
      </p>
      <p>
        This is narrower than transaction validation. A transaction can track
        versions or validate a broader read set. A pointer CAS protects one
        atomic location, not every assumption derived from earlier reads.
        Concurrent algorithms must reason about the gaps between observations,
        not only the atomic instruction at the end.
      </p>

      <h2>Unlinking is not reclamation</h2>
      <ul>
        <li><strong>Logical removal:</strong> the node is no longer reachable through the data structure's public links.</li>
        <li><strong>Physical reclamation:</strong> the object can be destroyed and its storage reused because no thread can still legally access it.</li>
      </ul>
      <p>
        A pop can remove a node while another thread still holds a reference
        obtained earlier. Releasing storage immediately is unsafe unless a
        separate lifetime protocol proves that no reader can still use it.
        Even a version check that prevents a stale CAS does not protect a reader
        that accesses the node before reaching that check.
      </p>
      <div className="article__callout">
        <strong>Two proofs are needed:</strong> state validation prevents stale
        updates from corrupting the structure; lifetime safety prevents access
        to reclaimed memory. Solving ABA alone does not solve both problems.
      </div>

      <h2>Technique 1: tagged references</h2>
      <p>
        Pair the reference with a version counter that increments whenever the
        shared head changes. A thread might observe (A, 41). If the head leaves
        A and later returns, its state could be (A, 44), so the stale comparison
        fails even though the address is identical.
      </p>
      <p>
        The pair must change as one atomic state. Two independent atomics can
        expose a reference from one update and a version from another. Some
        systems pack a tag into spare reference bits; others need a wider
        atomic, which is not guaranteed to be lock-free on every architecture.
      </p>
      <p>
        Counters are finite and can wrap, so correctness depends on the width
        and on how long stale operations can remain outstanding. More
        importantly, a version tag does not keep an object alive. A reader can
        access an object whose lifetime has ended before it reaches the
        version-checked operation. Tagging detects stale state; reclamation
        still needs its own protocol.
      </p>

      <h2>Technique 2: hazard pointers</h2>
      <p>
        <strong>Hazard pointers</strong> let each thread publish the identity of
        an object it may access. A remover unlinks a node but places it on a
        retired list rather than releasing its storage. Reclamation scans
        published hazards and destroys only retired nodes no thread has
        announced.
      </p>
      <p>
        There is a race between reading a reference and publishing the hazard.
        Another thread could remove the candidate in that gap. Therefore the
        reader publishes the candidate and validates the source again. If the
        source changed, it clears the hazard and retries without inspecting the
        candidate. Only after validation may it access the node.
      </p>
      <p>
        This is a protocol, not a single API call: memory ordering, publication,
        scanning and failed-update behaviour must be specified precisely. The
        invariant is that a node cannot be reclaimed while a thread may still
        use it under a valid hazard announcement.
      </p>
      <p>
        Hazard pointers suit algorithms where each thread touches a small,
        identifiable set of objects. They permit prompt reclamation even if
        unrelated threads are paused. The costs are publication, validation
        retries and scanning retired nodes against hazard records. A forgotten
        hazard can retain memory indefinitely.
      </p>

      <h2>Technique 3: epochs and grace periods</h2>
      <p>
        Epoch-based reclamation groups readers rather than tracking every
        reference. Threads announce entry to a read-side critical section, and
        removed nodes are retired in an epoch. An object becomes reclaimable
        only after every relevant participant has passed a quiescent point or
        left the older epoch.
      </p>
      <div className="diagram">
        <div><strong>Reader active</strong><small>May still hold A</small></div>
        <div><strong>Retire A</strong><small>Unlink, defer release</small></div>
        <div><strong>Grace period</strong><small>Wait for old readers</small></div>
        <div><strong>Reclaim</strong><small>Storage can be reused</small></div>
      </div>
      <p>
        The advantage is low per-read overhead: one announcement can protect
        several object accesses. The sharp edge is retention. A participant
        that enters a read-side section and then blocks can prevent reclamation
        of many later retired objects. Pointer updates may remain lock-free
        while memory use grows.
      </p>
      <p>
        This couples scheduling to memory consumption. A debugger pause,
        blocking call or forgotten critical-section exit can become a
        memory-retention incident. Track active participants, retired bytes,
        the oldest unreclaimed object and backlog growth—not just operation
        latency.
      </p>
      <p>
        <strong>Read-copy-update (RCU)</strong> applies a related idea to
        read-mostly structures. A writer prepares and publishes replacement
        state, then waits for a grace period before reclaiming the old version.
        RCU can make read paths very cheap, but its rules depend on the
        implementation and read-side constraints; it is not a universal
        replacement for locks.
      </p>

      <h2>Reference counting has a bootstrap problem</h2>
      <p>
        Reference counting keeps an object alive while its count is non-zero,
        but acquiring a reference from a raw shared pointer is itself unsafe
        if another thread can release the object between the pointer load and
        counter increment. Safe acquisition needs an already-owned reference,
        a lock, a stable indirection or a specialised atomic shared-reference
        operation. Reference counting also adds atomic traffic and does not
        automatically solve cycles.
      </p>

      <h2>Memory ordering is necessary, not sufficient</h2>
      <p>
        Acquire and release operations establish visibility relationships. A
        release publication can make initialisation visible to a reader that
        observes it through a matching acquire. But ordering does not extend
        object lifetime: an acquire load does not pin an allocation, and
        sequential consistency does not stop another thread from ending it.
      </p>
      <p>
        The <strong>ordering proof</strong> explains which writes may be
        observed. The <strong>lifetime proof</strong> explains why every
        dereference happens while the object is alive. A design can satisfy
        one and fail the other.
      </p>

      <h2>Lock-free is not a speed guarantee</h2>
      <ul>
        <li><strong>Obstruction-free:</strong> an operation can complete if it eventually runs without interference.</li>
        <li><strong>Lock-free:</strong> system-wide progress is guaranteed; some operation completes even if another repeatedly retries.</li>
        <li><strong>Wait-free:</strong> each operation completes within a bounded number of its own steps.</li>
      </ul>
      <p>
        A lock-free stack can burn CPU in retry loops under contention. A mutex
        can let a waiting thread sleep, reduce cache-line ping-pong and deliver
        better tail latency. If allocation or reclamation blocks, the whole
        operation may lose the progress property suggested by its atomic core.
        Choose lock-free structures when their progress guarantees solve a real
        requirement, not because an atomic instruction looks cheaper.
      </p>

      <h2>Investigating reclamation bugs</h2>
      <ol>
        <li>Pause one thread after it reads the head and successor while another removes and reinserts nodes.</li>
        <li>Use a tiny node pool to increase address reuse; assert reachability, node uniqueness and absence of cycles.</li>
        <li>Run AddressSanitizer and ThreadSanitizer, remembering that neither proves a concurrent algorithm correct.</li>
        <li>Pause participants deliberately and watch whether retired memory keeps accumulating.</li>
      </ol>
      <p>
        Instrument reclamation as well as the data structure: retired and
        reclaimed node counts, peak retained bytes, oldest retirement age and
        per-thread hazard or epoch state. High throughput with a steadily
        growing retired backlog can mean the algorithm is making progress but
        failing to reclaim resources.
      </p>

      <h2>Choosing a strategy</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Technique</th><th>Good fit</th><th>Sharp edge</th></tr></thead>
          <tbody>
            <tr><td>Tagged reference</td><td>Detect stale state cheaply</td><td>Wraparound; no lifetime protection by itself</td></tr>
            <tr><td>Hazard pointers</td><td>A few individually protected objects</td><td>Publication and scanning overhead</td></tr>
            <tr><td>Epochs / RCU</td><td>Short read sections or read-mostly state</td><td>Stalled readers delay reclamation</td></tr>
            <tr><td>Reference counting</td><td>Explicit shared ownership</td><td>Safe acquisition, atomic traffic and cycles</td></tr>
            <tr><td>Mutex</td><td>Simple correctness and maintainability</td><td>Blocking and contention, often less costly than expected</td></tr>
          </tbody>
        </table>
      </div>

      <h2>The wider connection: reclamation is a protocol</h2>
      <p>
        A database may publish a new version while old transactions still read
        a previous snapshot. A copy-on-write filesystem may switch a root
        reference while old blocks remain reachable from snapshots. A deployment
        can activate a new artifact while existing requests still execute the
        old one. Publishing replacement state is only half the work.
      </p>
      <p>
        The system must establish when the old version is no longer observable,
        account for participants that may still depend on it, and only then
        reclaim resources. Reachability describes how new readers find an
        object; reclamation must also account for readers that found it earlier.
      </p>

      <h2>Takeaway</h2>
      <p>
        ABA happens because equality of a reference is weaker than equality of
        the state and lifetime a thread assumed when it read that reference.
        CAS validates the current atomic value, not the intervening history.
      </p>
      <p>
        Tagged references detect stale state transitions, but safe concurrent
        structures also need reclamation. Hazard pointers track individual
        objects; epochs and RCU wait for older readers to leave; reference
        counting works when safe ownership acquisition is established. Each
        shifts cost into a different place.
      </p>
      <p>
        The important question is not only “can I update this reference
        atomically?” It is also: <strong>what proves that every thread which
        might still hold the old reference has finished with the object before
        its storage is reused?</strong> If that proof is missing, the algorithm
        is not finished.
      </p>
    </ArticleLayout>
  );
}
