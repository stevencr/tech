import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'lsm-trees-compaction-debt',
  title: 'LSM Trees: The Write Path That Borrows From the Future',
  subtitle: 'How log-structured storage turns random writes into sequential work—and why compaction, tombstones and read amplification eventually send the bill.',
  category: 'Databases & Storage',
  description: 'A senior-level tour of LSM trees: WALs, memtables, immutable SSTables, Bloom filters, compaction strategies, write stalls and the hidden debt behind fast writes.',
  date: '2026-10-18',
  readingTime: 20,
  tags: ['Databases', 'Storage Engines', 'Algorithms', 'Performance', 'Distributed Systems'],
};

export function LsmTreesCompactionDebtArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        A key-value store can accept millions of updates without seeking to the
        same disk page over and over. It can turn a stream of small, apparently
        random writes into large sequential writes, keep old versions around
        without rewriting files in place, and recover after a crash. The trick is
        to stop treating the on-disk representation as a mutable map.
      </p>

      <p>
        A <strong>log-structured merge tree (LSM tree)</strong> makes writes cheap
        by appending new facts and reorganising them later. The foreground path
        is deliberately simple; background work merges sorted runs of data into
        a more useful shape. This design underpins storage engines such as
        RocksDB and LevelDB and influences systems built on top of them.
      </p>

      <p>
        The catch is that “later” is not free. Every write creates future work:
        old versions must be reconciled, obsolete keys must eventually disappear,
        and sorted files must be merged. If the system cannot do that work as
        quickly as new data arrives, the debt becomes read amplification, disk
        consumption, latency spikes or outright write stalls.
      </p>

      <div className="article__callout">
        <strong>Mental model:</strong> an LSM tree is a continuously running
        merge process that exchanges write cost now for read, space and
        background-I/O cost later.
      </div>

      <h2>Why mutable pages make random writes expensive</h2>

      <p>
        A B-tree-backed table locates the relevant leaf page for an update,
        modifies it, and arranges for the change to become durable. The tree is
        excellent at point lookups and ordered traversal, but random updates can
        touch scattered pages. The engine must manage dirty-page flushing,
        concurrent access and write ordering so the structure remains valid
        after a crash.
      </p>

      <p>
        An LSM engine takes another route. It appends a mutation to a
        write-ahead log (WAL) and applies it to an in-memory sorted structure.
        When that structure fills, it becomes immutable and is flushed as a
        sorted file. New writes continue into a fresh structure while background
        jobs merge existing sorted files.
      </p>

      <div className="diagram">
        <div><strong>Write path</strong><small>WAL + mutable memtable</small></div>
        <div><strong>Flush</strong><small>Immutable sorted table</small></div>
        <div><strong>Compaction</strong><small>Merge runs and reclaim old data</small></div>
      </div>

      <p>
        The optimisation is not that disks become good at random access. The
        engine changes the shape of the work: it records updates sequentially
        and later writes larger, sorted chunks.
      </p>

      <h2>The write path, stage by stage</h2>

      <h3>1. The WAL establishes recovery</h3>

      <p>
        Before an acknowledged write can be recovered after a crash, the engine
        needs a durable record of it. A WAL is typically an append-only sequence
        of mutation records. The durability contract depends on configuration:
        the engine may sync each write, group several writes into one sync, or
        permit asynchronous durability. The API's success response is only as
        strong as that policy and the storage stack beneath it.
      </p>

      <pre><code>{`sequence=1042  PUT account:7 balance=80
sequence=1043  PUT account:7 balance=65
sequence=1044  REMOVE session:abc`}</code></pre>

      <p>
        The log is a recovery format, not the final read-optimised format. After
        a crash, the engine can replay durable records that had not yet reached
        an on-disk sorted table. WAL design is therefore about ordering as well
        as throughput: data structures must not claim a write is durable before
        the configured durability boundary has been crossed.
      </p>

      <h3>2. The memtable absorbs mutations in memory</h3>

      <p>
        The engine applies each mutation to a <strong>memtable</strong>, often
        an ordered structure such as a skip list or balanced tree. Keeping keys
        ordered makes it possible to flush a sorted run efficiently. A point
        read checks the active memtable and any immutable memtables awaiting
        flush before consulting disk files.
      </p>

      <p>
        Once the active memtable reaches a threshold, the engine freezes it.
        It is no longer mutated, so a background worker can flush it while a
        new memtable accepts writes. This is a clean concurrency boundary:
        foreground mutation and background file creation can proceed together.
      </p>

      <h3>3. Flush creates an SSTable</h3>

      <p>
        The immutable memtable becomes a <strong>sorted string table</strong>
        (SSTable). Despite the name, this is usually a structured file containing
        sorted key/value records and metadata such as index blocks, checksums,
        sequence numbers and sometimes a Bloom filter. Once installed in the
        database's metadata, it becomes part of the read path.
      </p>

      <p>
        SSTables are immutable. Updating a key writes a newer version elsewhere
        instead of patching an old file. That makes checksums meaningful for
        stable blocks, lets readers use consistent file contents, and reduces
        the need to coordinate in-place file mutation with concurrent readers.
      </p>

      <h2>How does a read find the newest value?</h2>

      <p>
        One key may exist in the active memtable, an immutable memtable and
        multiple SSTables. Mutations carry ordering information, commonly a
        sequence number. The read must find the newest version visible under the
        engine's consistency and snapshot rules, not merely the first matching
        bytes it encounters.
      </p>

      <pre><code>{`GET account:7

1. Check the active memtable
2. Check immutable memtables, newest first
3. Find SSTables whose metadata says the key may be present
4. Resolve candidate versions using sequence / snapshot rules
5. Return the newest visible value, or not-found`}</code></pre>

      <p>
        In many designs, files in the newest on-disk level overlap in key range,
        so a read may need to consider several. Deeper levels are usually
        arranged so files within a level have non-overlapping key ranges. The
        engine can search metadata and select at most one candidate file per
        level. The lookup cost depends on how many possible sources remain after
        metadata rules candidates out.
      </p>

      <h3>Bloom filters: cheap negative answers</h3>

      <p>
        A Bloom filter is a probabilistic membership structure associated with a
        file or block. It can say a key is definitely absent or that it may be
        present. It can produce false positives, but a correctly constructed
        filter does not produce false negatives. A false positive wastes a probe;
        a false negative could make the database return an incorrect answer.
      </p>

      <p>
        Filters are especially valuable for workloads with many misses: “not
        found” no longer means probing every plausible SSTable. But filters
        consume memory or disk space, and their false-positive rate depends on
        bits allocated per key and the number of hash functions. They are a
        negative cache, not a source of truth.
      </p>

      <div className="article__callout">
        <strong>Subtle point:</strong> “maybe present” still requires checking
        the file. “Definitely absent” is the fast path Bloom filters provide.
      </div>

      <h2>Deletes are records too: tombstones</h2>

      <p>
        An immutable file cannot be edited to remove a key, so a deletion is
        normally represented by a <strong>tombstone</strong>: a newer record
        stating that the key is gone. If an older SSTable still contains a
        value, the tombstone must win during reads. Physically removing the
        older value immediately would require rewriting the file.
      </p>

      <p>
        Tombstones must survive until the engine can prove that no older value
        they mask can reappear in a read. That proof depends on compaction
        coverage and may also depend on snapshots, replicas or retention rules.
        Dropping a tombstone too early is a correctness bug: it can resurrect
        data that the application believes was deleted.
      </p>

      <p>
        Cleanup is therefore a correctness protocol, not just a space-saving
        optimisation. The engine must know which versions are obsolete, which
        remain visible to a snapshot, and whether all older copies have been
        considered before discarding deletion evidence.
      </p>

      <h2>Compaction: the merge that keeps the tree usable</h2>

      <p>
        If every flush created a permanent new file, reads would become
        progressively more expensive. Compaction selects sorted files, merges
        their key streams, resolves versions and writes new SSTables. Because
        the inputs are sorted, the merge resembles merge sort: advance through
        ordered inputs, select the next key and emit the version that should
        survive.
      </p>

      <pre><code>{`Input A:  a=1  c=old  f=9
Input B:  b=2  c=new  e=5
Input C:  c=gone d=4

Merge by key and version:
  a=1
  b=2
  c=gone  (subject to snapshot / retention rules)
  d=4
  e=5
  f=9

Write new sorted files, publish metadata, retire old inputs`}</code></pre>

      <p>
        The order of publication matters. The engine must not expose incomplete
        output files, nor forget old files before the replacement metadata is
        durable. A typical design writes outputs first, then installs them and
        retires their inputs through one logical metadata change. Recovery must
        distinguish completed outputs from abandoned temporary files.
      </p>

      <p>
        Compaction is also garbage collection for the key space: it collapses
        versions, removes obsolete values and eventually discards tombstones
        when safe. It cannot always remove every old version. Long-lived
        snapshots, backups or replication rules may require historical versions
        to remain available.
      </p>

      <h2>Compaction strategies are workload policies</h2>

      <p>
        “LSM tree” does not mean one universal compaction algorithm. The strategy
        determines how much data is rewritten, how many files a read may probe,
        how much temporary space is needed, and how predictable write latency
        will be.
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Strategy</th><th>Basic idea</th><th>Main trade-off</th></tr>
          </thead>
          <tbody>
            <tr><td>Size-tiered</td><td>Merge similarly sized runs when enough accumulate</td><td>Often less write amplification, but more overlapping files and temporary space</td></tr>
            <tr><td>Leveled</td><td>Keep bounded, non-overlapping key ranges in deeper levels</td><td>Predictable reads, but data may be rewritten repeatedly</td></tr>
            <tr><td>Tiered variants</td><td>Choose among runs based on size and policy constraints</td><td>Can reduce rewrite pressure, but read and space costs vary with run count</td></tr>
          </tbody>
        </table>
      </div>

      <p>
        A leveled design is attractive when point-read latency matters: deeper
        levels have controlled overlap, so the engine can avoid searching many
        files. The price is that a small update may be copied through several
        levels during its lifetime. A tiered design can reduce rewriting but may
        leave more sorted runs to consult and require more space while merging.
      </p>

      <p>
        No strategy minimises every cost simultaneously. The right choice depends
        on read/write ratio, key distribution, value size, delete rate, disk
        headroom, tail-latency requirements and whether the workload is dominated
        by misses or successful lookups.
      </p>

      <h2>The three amplifications</h2>

      <p>
        LSM tuning becomes easier when three costs are kept separate. They are
        related, but they are not interchangeable.
      </p>

      <ul>
        <li><strong>Write amplification:</strong> physical bytes written for
          each byte of logical user data. Rewriting records through several
          levels increases it.</li>
        <li><strong>Read amplification:</strong> files, blocks or candidate
          versions a read must inspect to answer one logical query. Bloom
          filters and non-overlapping levels can reduce wasted probes.</li>
        <li><strong>Space amplification:</strong> physical storage occupied
          relative to the live logical dataset. Old versions, tombstones and
          overlapping compaction inputs contribute.</li>
      </ul>

      <p>
        Improving one metric often worsens another. Aggressive compaction can
        lower read and space amplification while increasing write amplification
        and background I/O. Keeping more runs around defers rewriting but
        increases the work needed to find a key. Compression reduces physical
        bytes at the cost of CPU and sometimes read latency.
      </p>

      <p>
        A write-heavy ingestion pipeline that reads data once can tolerate a
        different balance from an online service doing millions of point lookups
        with a strict p99 objective.
      </p>

      <h2>Compaction debt: when the background falls behind</h2>

      <p>
        Each memtable flush creates sorted data that may eventually need merging.
        If compaction processes input bytes faster than new bytes arrive, the
        engine stays near equilibrium. If new data arrives faster than it can be
        merged for long enough, the backlog grows. That backlog is often called
        <strong>compaction debt</strong>.
      </p>

      <p>
        The failure mode resembles queueing debt in a service: work was accepted
        on the assumption that background capacity would catch up. As debt grows,
        more files accumulate, reads do more probes, compaction consumes I/O and
        CPU, and output files need temporary space while inputs still exist.
        Eventually the engine may slow writes or stop accepting them until work
        catches up.
      </p>

      <p>
        The latency cliff can be confusing. The write that triggers a stall may
        be tiny; the cause is a backlog of previously accepted work. This is the
        same shape seen in buffered filesystem writeback: cheap foreground
        operations accumulate obligations, and later the system has to make
        someone pay for them.
      </p>

      <div className="article__callout">
        <strong>Operational lesson:</strong> monitor whether compaction creates
        and retires work at a sustainable rate, not just the current database
        size. A growing backlog warns that today's throughput is borrowing
        capacity from tomorrow.
      </div>

      <h2>Debugging a production slowdown</h2>

      <p>
        Suppose write p99 rises sharply after several hours of ingestion. CPU is
        not saturated, disk utilisation is high, and the database directory has
        grown much faster than the live dataset. Do not start by assuming the
        write API became slower. Ask what work the engine has accumulated and
        what resources compaction is competing for.
      </p>

      <ul>
        <li>Compare logical bytes written with physical bytes written to estimate write amplification.</li>
        <li>Track pending compaction bytes, file counts and sizes per level, and immutable memtables waiting to flush.</li>
        <li>Inspect free disk space, including the headroom needed for compaction inputs and outputs to coexist.</li>
        <li>Separate foreground and background I/O; compaction can saturate the device while the application uses little CPU.</li>
        <li>Measure read latency for hits and misses as file counts rise.</li>
        <li>Check whether snapshots or retention settings prevent old versions and tombstones from being reclaimed.</li>
      </ul>

      <p>
        Metric names differ between engines, but the questions are portable. A
        database reporting low foreground write latency while its backlog grows
        is not necessarily healthy; it may simply be postponing the bill. High
        background write throughput can be useful maintenance, provided the
        backlog remains bounded and service objectives hold.
      </p>

      <h2>A small experiment: measure steady state, not the honeymoon</h2>

      <p>
        In a disposable RocksDB-based environment, compare a write-heavy workload
        with a mixed read/write workload. Keep key distribution and dataset size
        controlled, and record logical throughput alongside physical I/O. Change
        compaction settings only in an isolated benchmark: tuning knobs are
        coupled, and a change that helps one phase can hurt another.
      </p>

      <pre><code>{`# Correlate operating-system signals with engine metrics
iostat -xz 1
vmstat 1
pidstat -d 1

# Also record pending compaction work, level sizes, file counts,
# physical write bytes, read latency, and free disk space.`}</code></pre>

      <p>
        Watch the time series, not only the final throughput number. A benchmark
        that ends before compaction catches up measures a different system from
        one that runs long enough to reach steady state. Include a drain period
        after writes stop: how long does the engine need to finish reorganising
        data, and how much additional I/O does it perform?
      </p>

      <p>
        Test cold and warm reads, hits and misses, realistic key distributions,
        deletes, restart recovery and the tail of a sustained ingestion run. A
        strategy can win on average throughput while losing badly on p99 latency
        or disk-space headroom.
      </p>

      <h2>The wider pattern: immutable state needs reclamation</h2>

      <p>
        LSM trees expose a recurring systems trade-off: <strong>immutability
        simplifies concurrency, while reclamation becomes a separate protocol</strong>.
        New state is written elsewhere, readers continue using stable old state,
        and a metadata transition makes the replacement visible. Only when
        readers and recovery rules no longer need the old representation can it
        be reclaimed.
      </p>

      <p>
        The same pattern appears in copy-on-write filesystems, immutable
        deployment artifacts, MVCC databases, log-structured filesystems and
        garbage collectors. Moving an update out of the old object makes the
        fast path easier, but leaves cleanup to a process that must understand
        versions, reachability and safe reclamation.
      </p>

      <p>
        Compaction is not merely “merge some files”. It is storage-engine garbage
        collection, query optimisation and resource scheduling at once. It must
        decide what is obsolete, choose what to rewrite, compete for finite I/O
        capacity and preserve correctness across crashes and concurrent readers.
      </p>

      <h2>Takeaway</h2>

      <p>
        An LSM tree makes small random updates economical by turning them into
        logged mutations, in-memory changes and immutable sorted files.
        Compaction later merges those files, resolves versions and reclaims data
        that is no longer needed.
      </p>

      <p>
        The design balances three amplifications: writes performed, reads
        required and space occupied. Fast writes are sustainable only when the
        merge machinery has enough capacity to keep that balance under control.
      </p>

      <p>
        When diagnosing an LSM-backed system, ask two questions together:
        <strong>how much work does each logical operation cause, and how much
        deferred work is accumulating behind it?</strong> The first explains
        today's cost. The second often predicts tomorrow's incident.
      </p>
    </ArticleLayout>
  );
}
