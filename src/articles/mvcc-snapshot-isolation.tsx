import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'mvcc-snapshot-isolation',
  title: 'MVCC Is a Versioning Protocol, Not a Lock-Free Database',
  subtitle: 'How row versions, transaction snapshots, write skew and vacuum fit together—and why a database can give every reader a consistent view while still allowing a correctness bug.',
  category: 'Database Internals',
  description: 'A senior-level deep dive into multi-version concurrency control: PostgreSQL tuple visibility, snapshots, isolation anomalies, serializable snapshot isolation, vacuum horizons and practical production diagnostics.',
  date: '2026-10-23',
  readingTime: 22,
  tags: ['Databases', 'Concurrency', 'Transactions', 'PostgreSQL', 'MVCC', 'Distributed Systems'],
};

export function MvccSnapshotIsolationArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        Two requests arrive at almost the same time. Each reads a perfectly
        reasonable view of the database. Each makes a locally sensible decision.
        Both writes succeed. The resulting state violates a business invariant.
        No dirty read occurred, no row was corrupted, and every individual SQL
        statement behaved as documented.
      </p>

      <p>
        This is the kind of bug that makes transaction isolation worth
        understanding below the API level. Modern relational databases often
        use <strong>multi-version concurrency control (MVCC)</strong> so readers
        can observe a stable view while writers continue changing the data.
        But a stable view is not the same thing as a globally serial execution,
        and “readers do not block writers” is not a complete concurrency model.
      </p>

      <p>
        The useful mental model is that MVCC separates three concerns:
        <strong> which version of a row exists, which version a transaction may
        see, and when obsolete versions can be reclaimed.</strong> Isolation
        levels and conflict detection sit on top of that machinery.
      </p>

      <div className="diagram">
        <div><strong>Version creation</strong><small>Writers create new row states</small></div>
        <div><strong>Visibility</strong><small>Snapshots choose readable versions</small></div>
        <div><strong>Conflict rules</strong><small>Isolation constrains concurrent work</small></div>
        <div><strong>Reclamation</strong><small>Vacuum retires obsolete versions</small></div>
      </div>

      <h2>A row is a logical identity with a history</h2>

      <p>
        Application code tends to think of a row as one mutable object:
        account 42 has a balance, a user has an email address, an order has a
        status. Physically, an MVCC engine may keep several representations of
        that logical row alive at once.
      </p>

      <p>
        Imagine an account balance changing from 100 to 80 and then to 65. A
        transaction that began before either update may still need to read 100.
        A transaction that began between the updates may need to read 80. A
        new transaction should read 65. The database cannot simply overwrite
        100 with 80 and then 65 if older snapshots are still entitled to see
        the earlier values.
      </p>

      <pre><code>Logical row: account 42

Version A: balance = 100   visible to an older snapshot
Version B: balance = 80    visible to a later snapshot
Version C: balance = 65    visible to a new snapshot

The versions may coexist physically.
Each transaction resolves the version it is allowed to observe.</code></pre>

      <p>
        The database does not normally copy the entire database for each
        transaction. It stores version metadata with records and keeps enough
        history for active snapshots. Indexes, undo records, heap tuples and
        cleanup strategies differ by engine, but the conceptual contract is
        similar: concurrent transactions can have different valid views of
        the same logical data.
      </p>

      <h2>PostgreSQL makes the versioning visible</h2>

      <p>
        PostgreSQL is a useful implementation to study because its heap tuple
        headers expose transaction metadata. Simplifying slightly, a tuple has
        an <code>xmin</code> identifying the transaction that created that
        version and an <code>xmax</code> that can mark the transaction which
        deleted or superseded it. The exact interpretation includes special
        values and additional rules, so these fields are not a standalone
        visibility algorithm.
      </p>

      <pre><code>Old tuple:
  balance = 100
  xmin = transaction 410
  xmax = transaction 427

New tuple:
  balance = 80
  xmin = transaction 427
  xmax = not deleted yet</code></pre>

      <p>
        If transaction 427 commits, a suitable later snapshot can treat the
        old tuple as superseded and the new tuple as visible. A snapshot that
        predates transaction 427 may continue to see the old tuple. If 427
        aborts, the attempted new version does not become the committed state;
        visibility rules let readers continue to see the prior version.
      </p>

      <p>
        This is not simply a timestamp comparison. PostgreSQL uses transaction
        IDs and transaction status, along with the snapshot's active-transaction
        information, to determine visibility. Transaction IDs are not wall-clock
        timestamps, and allocation order is not commit order. Wraparound also
        means they cannot be treated as an indefinitely increasing global clock.
      </p>

      <h3>Updates create history, not just a new value</h3>

      <p>
        In PostgreSQL, an UPDATE usually creates a new heap tuple version and
        marks the old version as no longer current for transactions that can
        see the update. If indexed columns change, index maintenance may be
        required too. Under suitable conditions, a heap-only tuple (HOT) update
        can avoid adding new index entries when indexed values are unchanged and
        the new tuple fits on the same page.
      </p>

      <p>
        The implementation details matter for performance. A row update can
        mean heap writes, index work, WAL generation and future cleanup—not
        merely changing a few bytes in place. Repeated updates to a hot row can
        create substantial write and vacuum work even when the application
        payload is tiny.
      </p>

      <div className="article__callout">
        <strong>Important distinction:</strong> MVCC describes how versions are
        maintained and observed. It does not prescribe one universal physical
        layout. PostgreSQL keeps old heap tuples; InnoDB commonly uses undo
        records to reconstruct older row versions. Similar semantics can sit
        on top of different storage designs.
      </div>

      <h2>A snapshot is a visibility boundary</h2>

      <p>
        At a particular point, a transaction needs to know which other
        transactions had already completed and which were still in progress.
        A PostgreSQL snapshot includes boundaries commonly exposed as
        <code>xmin</code> and <code>xmax</code>, plus a set of transaction IDs
        that were active when the snapshot was taken.
      </p>

      <ul>
        <li><strong>Older than the lower boundary:</strong> a transaction is old enough to be a candidate for visibility, subject to commit status and tuple rules.</li>
        <li><strong>At or beyond the upper boundary:</strong> a transaction started too late to be visible in this snapshot.</li>
        <li><strong>Between the boundaries:</strong> the snapshot's active-ID set helps distinguish transactions that were still running from those that had already completed.</li>
      </ul>

      <p>
        This is a simplified model, not a recipe for reimplementing PostgreSQL's
        visibility code. Its important property is that the snapshot captures a
        boundary in transaction history. If another transaction commits after
        that boundary, its writes do not automatically appear in the existing
        snapshot.
      </p>

      <p>
        The distinction between a transaction's start, its writes and its commit
        is subtle. A transaction may obtain an ID, run for minutes, and commit
        after a newer transaction. Therefore, “larger transaction ID means
        newer committed data” is not a valid general rule. The snapshot and
        transaction-status machinery resolve the relevant history.
      </p>

      <h2>Isolation levels decide when the snapshot moves</h2>

      <p>
        MVCC alone does not determine what a transaction is promised to observe.
        Isolation rules define how snapshots are taken and what conflicts are
        permitted. PostgreSQL provides a particularly clear example of why the
        names of isolation levels should not be mistaken for a universal
        implementation specification.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>PostgreSQL level</th><th>Read view</th><th>What to remember</th></tr>
          </thead>
          <tbody>
            <tr><td>Read committed</td><td>A new snapshot for each statement</td><td>Two SELECT statements in one transaction can see different committed data.</td></tr>
            <tr><td>Repeatable read</td><td>One transaction-level snapshot</td><td>Repeated reads remain stable, but write skew can still violate an invariant.</td></tr>
            <tr><td>Serializable</td><td>Snapshot plus conflict tracking</td><td>The database rejects executions that could not be equivalent to a serial order.</td></tr>
          </tbody>
        </table>
      </div>

      <p>
        Under <strong>read committed</strong>, each command sees rows committed
        before that command's snapshot was taken. If a transaction runs a SELECT,
        waits, and runs the same SELECT again, it can observe a newly committed
        change. This is often exactly what an interactive application wants,
        but it means a multi-statement decision does not necessarily use one
        consistent database view.
      </p>

      <p>
        Under PostgreSQL <strong>repeatable read</strong>, the transaction keeps
        the same snapshot for its reads. It will not suddenly see a row that
        another transaction committed halfway through its work. PostgreSQL's
        implementation is a form of snapshot isolation, stronger than the
        minimum behaviour many developers associate with the phrase “repeatable
        read”.
      </p>

      <p>
        Under <strong>serializable</strong>, PostgreSQL uses Serializable
        Snapshot Isolation (SSI). It tracks read/write dependencies and may
        abort a transaction when the concurrent execution could create a
        serialization anomaly. That is a different promise from merely giving
        each transaction a stable snapshot.
      </p>

      <h2>The surprising hole: write skew</h2>

      <p>
        Consider a small on-call rota. The business rule is that at least one
        doctor must remain on duty. Initially, Ada and Lin are both on duty.
        Each doctor may independently go off duty, provided someone else remains
        available.
      </p>

      <pre><code>CREATE TABLE on_call (
  doctor text PRIMARY KEY,
  on_duty boolean NOT NULL
);

INSERT INTO on_call VALUES
  ('Ada', true),
  ('Lin', true);</code></pre>

      <p>
        Two application requests arrive concurrently. Each checks that two
        doctors are on duty, then switches a different doctor off. Because they
        update different rows, neither update necessarily has to wait for the
        other's row lock.
      </p>

      <p><strong>Session A:</strong></p>

      <pre><code>BEGIN ISOLATION LEVEL REPEATABLE READ;

SELECT count(*)
FROM on_call
WHERE on_duty;
-- Returns 2

UPDATE on_call
SET on_duty = false
WHERE doctor = 'Ada';

-- Leave this transaction open for the interleaving.</code></pre>

      <p><strong>Session B, before A commits:</strong></p>

      <pre><code>BEGIN ISOLATION LEVEL REPEATABLE READ;

SELECT count(*)
FROM on_call
WHERE on_duty;
-- Also returns 2

UPDATE on_call
SET on_duty = false
WHERE doctor = 'Lin';

COMMIT;</code></pre>

      <p>
        Now commit session A. Under PostgreSQL repeatable read, this pattern
        can allow both transactions to commit: each read a snapshot containing
        both doctors, and each wrote a different row. The final table contains
        zero doctors on duty. Each transaction's snapshot was internally
        consistent; the combined result violated the cross-row business rule.
      </p>

      <div className="article__callout">
        <strong>Write skew:</strong> concurrent transactions read overlapping
        facts, make decisions from those facts, then write different records.
        Row-level write conflicts alone cannot detect every violation of a
        rule that spans multiple rows.
      </div>

      <p>
        This is why “repeatable read” and “serializable” are not interchangeable.
        A transaction-level snapshot prevents certain read anomalies, but it
        does not necessarily make the entire execution equivalent to running
        each transaction one after another.
      </p>

      <h2>Serializable Snapshot Isolation: detect the dangerous shape</h2>

      <p>
        One blunt way to enforce the rota rule would be to lock a shared row
        before making a decision. That can work if every writer follows the
        protocol, but it introduces a coordination point and is easy to omit
        in a new code path.
      </p>

      <p>
        PostgreSQL's SSI approach allows transactions to read from snapshots
        while tracking dependencies between reads and writes. If transaction A
        reads data that transaction B later changes, there is a read/write
        dependency from A to B. A cycle of such dependencies can mean that no
        serial ordering explains the observed result.
      </p>

      <p>
        The database looks for dangerous dependency patterns and aborts a
        transaction when necessary to preserve serializability. PostgreSQL uses
        predicate-style SIREAD locks as tracking markers for this purpose. They
        are not ordinary blocking locks that force every writer to wait for a
        reader; they help record which data a transaction observed.
      </p>

      <p>
        Run the same two-session experiment using
        <code>ISOLATION LEVEL SERIALIZABLE</code>. With both transactions
        reading the rota before either finishes its update, PostgreSQL can
        detect the conflict and return a serialization failure for one of
        them. The application must treat that failure as a request to retry
        the whole transaction, not merely repeat the last UPDATE.
      </p>

      <p>
        Serializable does not mean “nothing ever aborts”. It means successful
        transactions behave as though they ran in a serial order. When the
        database cannot safely permit the observed overlap, aborting is part of
        the correctness contract.
      </p>

      <h2>MVCC does not mean lock-free</h2>

      <p>
        MVCC reduces interference between readers and writers, but databases
        still use locks. An UPDATE must coordinate concurrent updates to the
        same row. Explicit locking reads such as <code>SELECT FOR UPDATE</code>
        acquire row-level locks. DDL and other operations take table-level
        locks, and those locks can conflict with ordinary queries.
      </p>

      <p>
        The useful distinction is narrower: an ordinary PostgreSQL SELECT
        usually does not take row locks that block a concurrent UPDATE of the
        same row. It still takes a table-level AccessShare lock, and a stronger
        table lock requested by another operation can block it. A long-running
        read can therefore be cheap for writers in one sense while still
        holding a snapshot that has consequences elsewhere.
      </p>

      <p>
        Locking and version visibility solve different problems. MVCC answers
        “which committed version can I see?” Locks coordinate operations that
        must not proceed concurrently, while isolation and conflict detection
        determine whether the combined transaction history is acceptable.
      </p>

      <h2>Version history creates a garbage-collection problem</h2>

      <p>
        If every update creates a new version, who removes the old ones? A
        version cannot be reclaimed merely because a newer value exists. An
        older transaction may still hold a snapshot that needs the prior
        version to answer a query correctly.
      </p>

      <p>
        PostgreSQL's VACUUM machinery identifies dead tuples that are no longer
        needed by any relevant snapshot and makes their space reusable. Ordinary
        vacuum usually makes space available for reuse within the relation;
        it does not generally shrink the operating-system file immediately.
        Rewriting or compacting a table to return space to the filesystem is a
        different operation with different locking and operational costs.
      </p>

      <p>
        This makes long-lived transactions surprisingly expensive even when
        they issue very few queries. An idle transaction that opened a snapshot
        and then waits for a user, an external API or a message can hold back
        cleanup. Dead tuples accumulate, indexes can retain extra entries,
        cache efficiency declines and autovacuum has more work to do.
      </p>

      <p>
        Replication slots can also retain an old transaction horizon. A logical
        replication consumer that falls behind, or a slot that is abandoned
        without being removed, can prevent cleanup of row versions or catalog
        state that the consumer may still need. This is one reason a database
        can develop storage pressure even when application traffic looks normal.
      </p>

      <div className="diagram">
        <div><strong>Long snapshot</strong><small>Old versions remain potentially visible</small></div>
        <div><strong>Vacuum horizon</strong><small>Cleanup cannot pass the oldest requirement</small></div>
        <div><strong>Dead tuples grow</strong><small>More storage and maintenance work</small></div>
        <div><strong>Latency risk</strong><small>Cache and I/O costs rise</small></div>
      </div>

      <p>
        The deeper connection is that MVCC shifts work rather than eliminating
        it. It can keep foreground reads and writes moving with less blocking,
        but it creates a version-reclamation obligation. A database must track
        which history is still observable, then reclaim only what is safe.
      </p>

      <h2>A practical production investigation</h2>

      <p>
        When a PostgreSQL database grows unexpectedly or vacuum appears unable
        to catch up, look for old transaction horizons before blindly increasing
        maintenance settings. These queries provide starting points; interpret
        them alongside the database version, workload and monitoring history.
      </p>

      <h3>Find long-running transactions</h3>

      <pre><code>SELECT
  pid,
  usename,
  state,
  now() - xact_start AS transaction_age,
  wait_event_type,
  wait_event,
  query
FROM pg_stat_activity
WHERE xact_start IS NOT NULL
ORDER BY xact_start;</code></pre>

      <p>
        Pay particular attention to sessions that are idle in transaction.
        The query text may be harmless; the transaction's age and retained
        snapshot can be the important part. An application that opens a
        transaction before waiting on an HTTP call or user interaction can
        accidentally pin database history for far longer than intended.
      </p>

      <h3>Look for relations accumulating dead tuples</h3>

      <pre><code>SELECT
  relname,
  n_live_tup,
  n_dead_tup,
  last_autovacuum
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 10;</code></pre>

      <p>
        These are statistics, not an exact real-time count of reclaimable
        tuples. A high dead-tuple estimate is a signal to investigate, not proof
        that vacuum is broken. Check whether autovacuum is running, whether
        cleanup is being held back by old snapshots, and whether write volume
        is simply producing dead tuples faster than maintenance can process them.
      </p>

      <h3>Inspect replication slots and transaction-ID age</h3>

      <pre><code>SELECT slot_name, active, xmin, catalog_xmin
FROM pg_replication_slots;

SELECT datname, age(datfrozenxid) AS xid_age
FROM pg_database
ORDER BY xid_age DESC;</code></pre>

      <p>
        A non-null slot horizon deserves attention when storage is growing or
        vacuum is constrained. Transaction-ID age is a separate concern:
        PostgreSQL must freeze old tuple metadata before transaction IDs wrap
        around and old IDs could be confused with new ones. Vacuum is therefore
        not optional housekeeping; it is part of preserving both space
        efficiency and correctness over the database's lifetime.
      </p>

      <h2>Application design: transactions are not just a wrapper</h2>

      <p>
        Understanding snapshots changes how application code should be
        structured. Keep transactions focused on database decisions and writes.
        Do not open a transaction, read a row, call a slow remote service, wait
        for a user, and only then commit unless the design has a specific reason
        to hold that transaction open.
      </p>

      <p>
        If a business invariant spans multiple rows, identify how it is
        enforced. Possible approaches include a database constraint, a shared
        row that all competing operations must lock, a carefully designed
        atomic update, or serializable isolation with whole-transaction retries.
        The right choice depends on the invariant and throughput requirements;
        simply raising the isolation level without handling aborts is not enough.
      </p>

      <p>
        Retry logic also has a boundary. A serialization failure means the
        transaction did not successfully commit, so the database work can be
        rerun from the beginning. But external side effects are not rolled back
        with the database. If a transaction sends an email or charges a payment
        provider before it commits, retrying can duplicate the side effect.
        Use an idempotency key or a transactional outbox so the database change
        and the intent to perform the side effect remain coordinated.
      </p>

      <p>
        Finally, test concurrency with multiple real sessions. A unit test that
        runs each transaction sequentially cannot reveal write skew. Tests
        should deliberately overlap the reads and writes that make a business
        invariant vulnerable, and should assert the final invariant—not just
        that each SQL command returned successfully.
      </p>

      <h2>The trade-off in one sentence</h2>

      <p>
        MVCC makes concurrent access more flexible by allowing multiple valid
        versions of data to coexist. That flexibility costs storage, visibility
        bookkeeping and cleanup, and it does not by itself guarantee that
        independent transactions preserve every cross-row rule.
      </p>

      <p>
        PostgreSQL's implementation makes the full lifecycle visible: tuple
        metadata describes versions, snapshots define visibility, isolation
        levels constrain concurrent histories, SSI detects dangerous dependency
        patterns, and vacuum reclaims versions when history is no longer needed.
        These pieces are one design, not separate features.
      </p>

      <div className="article__callout">
        <strong>Takeaway:</strong> When a database bug involves concurrent
        requests, ask three questions in order: what snapshot did each
        transaction see, what rows or predicates did each transaction change,
        and what rule prevents their combined result from violating the
        invariant? When storage or latency degrades, add a fourth: what old
        snapshot is preventing obsolete versions from being reclaimed?
      </div>
    </ArticleLayout>
  );
}
