import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'file-watchers-are-not-event-logs',
  title: 'File Watchers Are Not Event Logs',
  subtitle: 'How inotify, atomic saves, queue overflow and cross-platform abstractions turn filesystem notifications into an eventual-consistency problem.',
  category: 'Filesystem Internals',
  description: 'A senior-level deep dive into filesystem notification semantics, inode versus path identity, rename-based saves, inotify queue overflow, recursive-watch races and the reconciliation architecture behind reliable build systems and indexers.',
  date: '2026-10-17',
  readingTime: 22,
  tags: ['Linux', 'Filesystems', 'inotify', 'Node.js', 'Build Systems', 'Concurrency', 'Event-Driven Systems'],
};

export function FileWatchersAreNotEventLogsArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        A file watcher looks like a simple event source: subscribe to a directory,
        receive a notification when something changes, then rebuild, reload or
        re-index the affected file. That model works beautifully in a demo. It
        becomes much less convincing when an editor saves atomically, a directory
        is renamed, a build takes longer than the next burst of edits, or the
        kernel runs out of room to queue notifications.
      </p>

      <p>
        The important distinction is that a filesystem watcher is usually an
        invalidation mechanism, not a durable change log. It tells an application
        that its view of the filesystem may now be stale. It does not promise a
        complete, ordered, replayable account of every operation that happened.
      </p>

      <div className="article__callout">
        <strong>Core model:</strong> notifications are hints about state changes;
        the filesystem itself is the source of truth. Reliable watchers combine
        notifications with reconciliation.
      </div>

      <h2>1. The seductive but incorrect mental model</h2>

      <p>
        It is natural to imagine a watcher as a stream of facts: file A was
        created, file A was modified, file A was closed, file A was renamed, and
        so on. If the consumer processes every event, it should know the current
        state. That assumption quietly imports the guarantees of a message log
        into an API that generally does not provide them.
      </p>

      <p>
        A save may produce several notifications. A single notification may stand
        for multiple writes. A rename can appear as two related events, or as only
        one event from the watched tree's point of view. If the consumer falls
        behind, the kernel may discard queued notifications and report overflow.
        Meanwhile, the file may change again before the consumer opens it.
      </p>

      <p>
        The right question is not “what exact sequence of operations occurred?”
        It is “which parts of my derived state might now be wrong, and how do I
        make them correct again?”
      </p>

      <h2>2. Paths are names; inotify watches kernel objects</h2>

      <p>
        Linux inotify is a useful place to understand the underlying semantics.
        A path such as <code>src/config.json</code> is a lookup expression through
        a directory hierarchy. It is not the identity of the file forever.
        Directory entries map names to filesystem objects, commonly represented
        by inodes. Rename and replacement operations can change that mapping
        without changing the spelling of the path your application uses.
      </p>

      <p>
        An inotify watch added for a regular file is associated with the object
        reached when the watch is installed. If an editor saves by writing a
        temporary file and renaming it over the destination, the path can now
        refer to a new inode while the watch still refers to the old object.
        Watching the file and watching its parent directory are different
        strategies.
      </p>

      <div className="diagram">
        <div><strong>Path</strong><small>src/config.json</small></div>
        <div><strong>Directory entry</strong><small>Name → object</small></div>
        <div><strong>Inode</strong><small>File identity</small></div>
      </div>

      <p>
        A watch on the parent directory lets the application observe changes to
        directory entries, including creation, deletion and moves. A watch on the
        file can be useful for content-related events, but it may need to be
        re-established when the path is rebound to a replacement object.
        Applications that care about a path over time often need both concepts:
        watch the containing directory for identity changes, then open and inspect
        the object currently named by the path.
      </p>

      <h2>3. Why editors often save by renaming</h2>

      <p>
        Many editors and configuration writers avoid modifying the destination
        file in place. They create a temporary file in the same directory, write
        the complete new contents, and rename the temporary file over the target.
        On a typical local filesystem, a rename within the same filesystem gives
        readers an atomic namespace transition: a lookup sees the old name
        binding or the new one, rather than a half-written destination file.
      </p>

      <p>
        This is excellent for readers, but it surprises file watchers. The
        destination's path remains textually identical while the object behind it
        changes. A watcher attached only to the old file can report deletion or
        self-movement and then stop observing the replacement. A watcher on the
        directory sees the namespace operation and can reopen the path.
      </p>

      <pre><code>mkdir watcher-lab
cd watcher-lab
printf 'old version\n' > settings.json

# In another terminal, watch this directory with inotifywait.
# Then simulate an atomic-save style replacement:
printf 'new version\n' > settings.json.tmp
mv settings.json.tmp settings.json
cat settings.json</code></pre>

      <p>
        Install <code>inotify-tools</code> if <code>inotifywait</code> is not
        available. Watch the directory for create, move, close-write and delete
        events, then repeat while watching the file itself. The exact event
        sequence depends on the operations and tool options; the point is to
        observe the distinction between the old file object and the new path
        binding.
      </p>

      <p>
        Atomic rename is not the same as crash durability. If a writer needs an
        update to survive sudden power loss, it may also need to flush file
        contents and the containing directory according to the filesystem and
        application contract. Watcher notifications do not certify that an
        update is durable, valid or ready for use.
      </p>

      <h2>4. Event names are not transactions</h2>

      <p>
        Linux exposes events such as <code>IN_CREATE</code>,
        <code>IN_DELETE</code>, <code>IN_MODIFY</code>,
        <code>IN_CLOSE_WRITE</code>, <code>IN_MOVED_FROM</code>,
        <code>IN_MOVED_TO</code> and <code>IN_ATTRIB</code>. These are useful
        observations, but they are not application-level transactions.
      </p>

      <ul>
        <li><code>IN_MODIFY</code> can occur repeatedly while a file is being written.</li>
        <li><code>IN_CLOSE_WRITE</code> says a writable file descriptor was closed; it does not prove the contents are valid or that no later writer will change them.</li>
        <li><code>IN_ATTRIB</code> covers metadata changes, not just content changes.</li>
        <li><code>IN_DELETE_SELF</code> and <code>IN_MOVE_SELF</code> concern the watched object, not necessarily the path your application will resolve next.</li>
      </ul>

      <p>
        There is no universal “file is now finished forever” event. A writer may
        close and reopen a file, another process may update it, or the
        application may read the path after a subsequent replacement. A debounce
        window can reduce duplicate work, but it is a scheduling heuristic rather
        than a correctness guarantee.
      </p>

      <h2>5. Coalescing means event counts are not operation counts</h2>

      <p>
        The inotify queue may coalesce successive identical events when an older
        matching event has not yet been read. That is an optimisation, and the
        manual warns that applications cannot infer the number of filesystem
        operations from the number of events delivered. Several writes can
        collapse into fewer notifications; the reverse is also common when one
        logical save produces multiple different event types.
      </p>

      <p>
        This is not a defect. The kernel is communicating useful changes without
        promising to preserve every low-level operation as a record. If your
        indexer increments a counter once per notification, or your incremental
        compiler assumes one event equals one changed source file, the design is
        depending on a guarantee that does not exist.
      </p>

      <h2>6. Queue overflow is a loss of knowledge</h2>

      <p>
        Each inotify instance has a queue limit. If events arrive faster than the
        application drains them, the queue can overflow. The kernel emits
        <code>IN_Q_OVERFLOW</code>, with a watch descriptor of -1, to signal that
        events have been lost.
      </p>

      <p>
        Treat overflow as a correctness boundary. After it, replaying the events
        that remain in the queue cannot reconstruct the full sequence of changes.
        The consumer no longer knows exactly which paths changed. The safe
        response is to mark the affected watched scope dirty and rebuild its
        derived state from a fresh filesystem scan.
      </p>

      <p>
        This resembles a cache invalidation signal or a database change stream
        whose resume position is no longer available. The system should not guess
        which missed changes were harmless. It should discard assumptions that
        depended on a complete event history and reconcile from authoritative
        state.
      </p>

      <pre><code>// Conceptual handler for a low-level inotify consumer.
if (event.mask &amp; IN_Q_OVERFLOW) &#123;
  markEntireWatchedRootDirty();
  scheduleFullReconciliation();
&#125; else &#123;
  markRelevantPathDirty(event);
&#125;</code></pre>

      <p>
        Higher-level APIs may hide the native overflow event or surface it
        differently. Read the contract of the runtime and watcher library you
        use. If the abstraction cannot tell you that events were lost, periodic
        reconciliation becomes even more important.
      </p>

      <h2>7. Rename is a protocol, not a single event</h2>

      <p>
        Inotify represents a rename within watched areas using
        <code>IN_MOVED_FROM</code> and <code>IN_MOVED_TO</code>. The records share
        a cookie that can help correlate the two sides. But consumers must not
        assume every rename arrives as a neat adjacent pair.
      </p>

      <p>
        The source and destination may be in different directories, only one
        directory may be watched, or a move may cross the boundary of the watched
        tree. In those cases the consumer can observe only one side. Other events
        may be interleaved, and the destination may be modified again before the
        consumer acts on it.
      </p>

      <p>
        Use the cookie to improve rename detection where available, not as the
        foundation of correctness. If the destination is relevant, inspect what
        currently exists there. If the source disappeared from a watched scope,
        remove or invalidate its derived state. Rename detection is an
        optimisation opportunity for an indexer; it is not permission to skip
        checking the resulting filesystem state.
      </p>

      <h2>8. Recursive watching has a creation race</h2>

      <p>
        The inotify API does not provide one magical recursive watch for an
        arbitrary tree. A program typically watches each directory separately.
        When a new directory appears, it must install another watch for that
        directory and discover its children.
      </p>

      <p>
        That creates a race: a new directory can be created and populated before
        the watcher has installed its watch. A correct implementation scans the
        newly discovered subtree after attaching the watch. Events inside the
        subtree may have already happened, but the scan establishes its current
        contents.
      </p>

      <p>
        The same issue appears during initial startup. If you scan first and add
        watches afterwards, changes between those operations can be missed. A
        stronger pattern is to establish the relevant watches, scan, then drain
        and process queued invalidations. Events that arrive during the scan
        cause another reconciliation pass. This does not create an atomic
        filesystem snapshot, but it closes a common gap and converges when the
        tree becomes quiet.
      </p>

      <h2>9. Build systems should model dirty state, not event history</h2>

      <p>
        A build system, IDE indexer or configuration reloader maintains derived
        state: dependency graphs, parsed syntax trees, search indexes, cached
        configuration or generated output. The watcher should tell that system
        what might be stale. It should not be the only place where truth about
        the input tree lives.
      </p>

      <p>
        Maintain a dirty set. Events mark paths or directories dirty; a short
        scheduler batches work; a scanner reads current state; and the derived
        model is updated from what exists now. If the event stream becomes
        ambiguous, broaden the dirty scope. The cost is occasional extra
        scanning. The benefit is that correctness no longer depends on preserving
        every notification.
      </p>

      <pre><code>// Pseudocode: notifications schedule reconciliation; they do not describe
// the final state to apply directly.
let dirty = true;
let reconciling = false;

function onFilesystemNotification(path) &#123;
  markDirty(path);
  dirty = true;
  scheduleReconcile();
&#125;

async function reconcile() &#123;
  if (reconciling) return;
  reconciling = true;

  try &#123;
    while (dirty) &#123;
      dirty = false;
      const snapshot = await scanCurrentFilesystemState();
      await updateDerivedModel(snapshot);
    &#125;
  &#125; finally &#123;
    reconciling = false;
    if (dirty) scheduleReconcile();
  &#125;
&#125;</code></pre>

      <p>
        This is schematic: production code needs cancellation, back-pressure,
        error handling and a strategy for large trees. The important property is
        the loop. If another event arrives while scanning or applying a snapshot,
        it sets the dirty flag again and causes another pass. Overflow should
        dirty the whole relevant scope, and periodic reconciliation should run
        even when no event was reported.
      </p>

      <h2>10. A scan is not an atomic snapshot</h2>

      <p>
        Scanning the tree is not magically atomic. While traversal is in progress,
        another process can add, remove or rename entries. Reading a file can race
        with a writer replacing its path. Metadata obtained from
        <code>stat</code> and bytes obtained from a later <code>open</code> may
        describe different objects if the path changes between the calls.
      </p>

      <p>
        Most development tools can tolerate this because the next invalidation
        triggers another pass. More sensitive systems may need to open the file
        and inspect the opened descriptor, compare identity and metadata before
        and after reading, validate the content, or retry when the object changes
        during processing. There is no general-purpose watcher API that turns a
        mutable tree into a transactionally consistent snapshot.
      </p>

      <p>
        A compiler can usually retry a file that changed mid-read. A deployment
        controller might instead validate a complete versioned directory and
        switch a pointer only after the configuration set passes validation. A
        security scanner may need stronger identity and time-of-check/time-of-use
        controls than a development server. The required consistency level is an
        application decision, not something the watcher chooses for you.
      </p>

      <h2>11. Cross-platform APIs smooth syntax, not semantics</h2>

      <p>
        Node.js <code>fs.watch</code> and libraries such as chokidar make common
        watcher tasks easier, but they cannot make every operating system expose
        identical events. Linux inotify, macOS FSEvents, Windows directory-change
        notifications and polling-based fallbacks have different granularity,
        buffering, rename behaviour and failure modes.
      </p>

      <p>
        Some platforms report that a directory changed without identifying every
        child path. Some backends can return an absent filename. Recursive
        support varies by runtime and platform. A library may infer a rename from
        a disappearance followed by an appearance, which is useful but not
        equivalent to a kernel-guaranteed rename transaction.
      </p>

      <p>
        Treat a cross-platform callback as a portable invalidation signal. If it
        names a path, use that as a hint to narrow the scan. If it does not, mark
        the containing scope dirty. If the watcher errors or is recreated,
        reconcile. The application-level correctness strategy should survive a
        backend that reports less detail than expected.
      </p>

      <h2>12. Containers and network filesystems change the picture</h2>

      <p>
        Notifications are produced by a particular filesystem and operating
        system path. A local Linux directory can behave differently from a remote
        filesystem, a userspace filesystem, or a host directory shared into a
        Linux virtual machine by desktop container tooling.
      </p>

      <p>
        A change made on a remote server may not generate a local inotify event
        for a client-side mount. A file-sharing layer may translate operations
        imperfectly or deliver them with different latency. A container can see
        the same mounted files as the host while the notification path crosses
        an implementation boundary that changes practical behaviour.
      </p>

      <p>
        This explains why a watcher that works on a laptop can appear to miss
        changes inside a container or on a network workspace. Establish where the
        mutation occurs, which kernel or filesystem observes it, and whether that
        backend promises to notify this consumer. Polling or an explicit change
        protocol may be the more reliable choice at that boundary.
      </p>

      <h2>13. Resource limits are part of the design</h2>

      <p>
        On Linux, each watch consumes kernel resources, and inotify has limits
        for instances, watches and queued events. Large monorepos, editor fleets,
        test runners and concurrent containers can encounter these limits even
        when each individual watcher looks modest.
      </p>

      <p>
        The open-file descriptor limit and inotify limits are different
        constraints. Increasing one does not necessarily solve the other. A
        recursive watcher that installs a watch on every directory can have a
        large footprint, and blindly raising system-wide limits can hide an
        architectural problem. Prefer sharing watchers where sensible, watching
        the narrowest useful scope, cleaning up obsolete watches, and providing
        a fallback when resources are exhausted.
      </p>

      <h2>14. Debouncing is for efficiency, not correctness</h2>

      <p>
        Debouncing a burst of events is useful because a save may generate several
        notifications and a single rebuild can be expensive. But a timer that
        waits for a period of silence does not prove that the writer has finished.
        A slow writer may pause longer than the window, and a second writer may
        start immediately afterwards.
      </p>

      <p>
        Separate scheduling from validation. When the timer fires, read the
        current path, parse or validate the contents, and publish the new state
        only if it is valid. If the file changes during that process, the next
        invalidation causes another pass. For related configuration files,
        validate a versioned snapshot rather than independently reloading
        arbitrary files as each event arrives.
      </p>

      <h2>15. Test the failure modes deliberately</h2>

      <p>
        A useful watcher test suite should not only edit a file and assert that a
        callback ran. Exercise the filesystem patterns that break simplistic
        assumptions: write in place, replace by rename, rename across watched
        directories, delete a watched directory, create and rapidly populate a
        new subtree, and generate bursts while the consumer is deliberately
        slowed down.
      </p>

      <p>
        Test startup and restart too. Start the watcher while files are changing,
        stop it briefly, then restart it and verify that reconciliation repairs
        the model. Where the native API exposes queue overflow, test the recovery
        path. On platforms where overflow is hidden by an abstraction, test the
        fallback and periodic scan strategy instead.
      </p>

      <p>
        The success criterion is not that every low-level notification appears
        exactly once. It is that, after changes stop and reconciliation completes,
        the application's derived state matches the filesystem state within the
        consistency guarantees the product promises.
      </p>

      <h2>16. The broader systems connection</h2>

      <p>
        File watching is one instance of a recurring distributed-systems problem:
        a consumer maintains a local model of a changing authority and receives
        imperfect signals that the model may be stale. Cache invalidation,
        database change streams, Kubernetes controllers, cloud object events and
        webhook delivery all present versions of the same challenge.
      </p>

      <p>
        A robust controller does not assume a notification is the complete truth.
        It uses the notification to trigger a read of current state, compares that
        state with its desired or derived model, applies an idempotent correction,
        and retries after failures. Notifications make convergence faster;
        reconciliation makes convergence dependable.
      </p>

      <div className="article__callout">
        <strong>Takeaway:</strong> design a watcher as a cache-invalidation channel,
        not as an audit log. Let events reduce the time to notice change, let
        scans establish what is true now, and make overflow, restart and ambiguity
        ordinary reasons to reconcile rather than exceptional cases to guess around.
      </div>
    </ArticleLayout>
  );
}
