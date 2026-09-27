import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCode } from '../components/article/ArticleCode';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = {
  slug: 'lsm-trees-compaction',
  title: 'LSM Trees & Compaction',
  subtitle: 'The storage engine that turns random writes into an engineering trade-off',
  category: 'Databases',
  description: 'How log-structured merge trees use memory, sorted files, indexes and compaction to trade write amplification against read and space amplification.',
  date: '2026-09-28',
  readingTime: 22,
  tags: ['Databases', 'Storage Engines', 'LSM Trees', 'Compaction', 'Performance'],
};

export function LsmTreesCompactionArticle() {
  return (
    <ArticleLayout meta={meta}>
      <ArticleSection title="The surprising idea">
        <p>Many high-throughput databases do something that initially looks backwards: instead of finding a row on disk and updating it in place, they append new state, keep several sorted representations around, and periodically rewrite those representations into larger ones.</p>
        <p>This family of designs is usually called an <strong>LSM tree</strong>, for Log-Structured Merge tree. It sits underneath systems such as RocksDB, LevelDB and many distributed databases. The same ideas also appear in storage engines embedded inside larger systems.</p>
        <ArticleCallout>
          An LSM tree is best understood as a way of making the expensive operation cheap: turn many small, random writes into sequential or batched work, then pay the reorganisation cost later.
        </ArticleCallout>
        <p>The catch is that “later” is not free. The storage engine may write data multiple times, temporarily keep obsolete versions, and perform background work that competes with foreground reads and writes. Understanding those costs explains a surprising amount of database performance behaviour.</p>
      </ArticleSection>

      <ArticleSection title="Start with the write path">
        <p>Imagine a key-value store receiving this stream:</p>
        <ArticleCode>{`PUT user:42 = Alice
PUT user:17 = Bob
PUT user:42 = Alicia
DELETE user:17
PUT user:91 = Chen`}</ArticleCode>
        <p>An in-place B-tree design might locate the relevant pages, modify them, and eventually flush dirty pages. An LSM engine takes a different route. A simplified write path looks like this:</p>
        <ArticleDiagram items={[
          { title: 'WAL', description: 'Durable sequential record of the mutation.' },
          { title: 'Memtable', description: 'In-memory ordered structure receiving new versions.' },
          { title: 'Immutable memtable', description: 'Frozen while a new memtable accepts writes.' },
          { title: 'SSTable', description: 'Sorted, immutable file written to durable storage.' },
          { title: 'Compaction', description: 'Background merge that produces cleaner sorted files.' },
        ]} />
        <p>The write is first recorded in a write-ahead log when durability requires it. The mutation is then inserted into an in-memory ordered structure, commonly a skip list or another structure that supports ordered iteration. When the memtable reaches a threshold, it becomes immutable and is flushed as an SSTable: a <em>Sorted String Table</em>, an immutable file whose records are ordered by key.</p>
        <p>The important property is that the foreground write does not need to perform a random disk update for every mutation. A large amount of work can be buffered, sorted and written sequentially.</p>
      </ArticleSection>

      <ArticleSection title="Why sorted immutable files change everything">
        <p>An SSTable is not simply a giant text file sorted alphabetically. A practical SSTable normally has a data region plus indexing and metadata structures that let the engine avoid scanning the entire file.</p>
        <p>A simplified layout might contain data blocks, an index mapping key ranges to blocks, and a filter such as a Bloom filter. Blocks can also be compressed independently.</p>
        <ArticleCode>{`SSTable
+-------------------------------+
| data block: a...m             |
| data block: n...z             |
| ...                           |
+-------------------------------+
| block index                   |
+-------------------------------+
| Bloom filter                  |
+-------------------------------+
| footer / metadata             |
+-------------------------------+`}</ArticleCode>
        <p>Because keys are sorted, the engine can use the index to jump towards the relevant block. Because the file is immutable, its structure can be heavily optimised without worrying about concurrent page mutations.</p>
        <p>Immutability is a major design lever. Once an SSTable has been written, readers can safely use it while another thread or process works on completely different files.</p>
      </ArticleSection>

      <ArticleSection title="The read path is a search across history">
        <p>Now the trade-off appears. If a key exists in several SSTables, which value is current?</p>
        <p>Suppose <code>user:42</code> was written three times. The newest value may be in the memtable, while older values live in one or more SSTables. A read therefore searches the newest state first and works towards older state until it finds a visible record.</p>
        <ArticleCode>{`read(key):
  check mutable memtable
  check immutable memtables
  search newest SSTable structures
  search older SSTable structures
  return newest matching value
`}</ArticleCode>
        <p>Real implementations use sequence numbers, file metadata, levels and filters to make this considerably smarter. But the fundamental problem remains: more independent sorted runs can mean more work for a read.</p>
        <ArticleCallout>
          Compaction is therefore not merely “cleaning up old files”. It actively shapes the cost of future reads.
        </ArticleCallout>
      </ArticleSection>

      <ArticleSection title="Bloom filters: saying no cheaply">
        <p>A Bloom filter is a probabilistic data structure that answers a useful question: “Could this key be in this file?” It can produce false positives, but it cannot normally produce false negatives when configured and used correctly.</p>
        <p>That makes it ideal for SSTables. If the filter says a key is definitely absent, the engine can skip the data lookup. If it says the key might exist, the engine consults the index and data blocks.</p>
        <ArticleCode>{`if (!bloomFilter.mightContain(key)) {
  // Definitely absent from this SSTable.
  return NOT_FOUND;
}

// Could be present: pay for index/data lookup.
return searchSstable(key);
`}</ArticleCode>
        <p>There is a useful systems lesson here: probabilistic structures are powerful when a false positive is merely extra work, while a false negative would be incorrectness.</p>
      </ArticleSection>

      <ArticleSection title="Why compaction exists">
        <p>Without compaction, every flush would create another SSTable. The number of files would grow indefinitely. Reads would increasingly need to consult many structures, and obsolete versions would occupy storage forever.</p>
        <p>Compaction merges SSTables into new SSTables. Because the inputs are already sorted, the merge can be performed efficiently, much like the merge phase of merge sort.</p>
        <ArticleCode>{`A: 10, 20, 40, 70
B: 15, 20, 30, 70

merge:
10, 15, 20, 30, 40, 70
       ^ newest version wins
       ^ obsolete versions can disappear
`}</ArticleCode>
        <p>For a key with multiple versions, the compaction process can often discard versions that are no longer needed by any reader and can discard tombstones once the engine knows they cannot hide an older value that still matters.</p>
        <p>So compaction simultaneously performs three jobs: reducing the number of searchable runs, reclaiming obsolete state, and reorganising data into a shape that makes future reads more predictable.</p>
      </ArticleSection>

      <ArticleSection title="The real cost: amplification">
        <p>LSM tuning becomes much clearer if you stop thinking only in terms of “read speed” and “write speed”. There are several different forms of amplification.</p>
        <p><strong>Write amplification</strong> is the ratio between bytes written to the storage device and bytes logically written by the application. If an application writes 1 GB but compaction causes 8 GB of physical writes, the write amplification is roughly 8x, ignoring details such as metadata and WAL behaviour.</p>
        <p><strong>Read amplification</strong> describes how much work a read performs compared with the ideal lookup. Multiple levels, files, blocks and filter checks can all contribute.</p>
        <p><strong>Space amplification</strong> describes how much physical storage is occupied relative to the logically live dataset. During compaction, old and new files can coexist temporarily, and obsolete versions may remain until they are safely removed.</p>
        <ArticleDiagram items={[
          { title: 'Write amplification', description: 'One logical write can be rewritten during several compactions.' },
          { title: 'Read amplification', description: 'A lookup may need to consider several files or levels.' },
          { title: 'Space amplification', description: 'Old versions and overlapping files consume extra storage.' },
        ]} />
        <p>These costs compete. A configuration that reduces read amplification can increase write amplification. Aggressive compaction may improve read performance while consuming more I/O bandwidth and CPU.</p>
      </ArticleSection>

      <ArticleSection title="Leveled versus tiered compaction">
        <p>There is no single universal compaction strategy. Two useful extremes are <strong>leveled</strong> and <strong>tiered</strong> approaches.</p>
        <p>In a leveled design, files are organised into levels with increasingly larger size targets. Apart from the smallest level, files in a level generally cover mostly non-overlapping key ranges. This keeps the number of files a read must examine relatively controlled, but producing that organisation can require substantial rewriting.</p>
        <p>In a tiered or size-tiered design, multiple similarly sized files can accumulate and then be merged into a larger run. This can reduce immediate rewrite pressure and work well for write-heavy workloads, but reads may have to consider more overlapping files.</p>
        <ArticleCallout>
          Compaction policy is a workload decision. There is no setting that simultaneously minimises write amplification, read amplification and space amplification for every workload.
        </ArticleCallout>
        <p>Hybrid strategies exist because real workloads are rarely pure. The useful question is not “which strategy is better?” but “which cost matters most for this workload and hardware?”</p>
      </ArticleSection>

      <ArticleSection title="Compaction is a background control system">
        <p>One of the most important operational insights is that compaction is not a one-off maintenance task. It is a continuously running control loop.</p>
        <p>Writes create new files. Those files create pressure. Pressure triggers compaction. Compaction consumes CPU, memory bandwidth and storage I/O, while producing new files and eventually deleting old ones.</p>
        <ArticleCode>{`application writes
       |
       v
memtable flushes
       |
       v
more SSTables
       |
       v
compaction pressure
       |
       +------> CPU / I/O consumption
       |
       v
fewer, larger SSTables
       |
       v
lower read amplification
`}</ArticleCode>
        <p>This is why an LSM database can look healthy under a moderate workload and then develop severe latency spikes when the write rate crosses a threshold. The system has entered a state where background work cannot keep up with foreground mutation.</p>
      </ArticleSection>

      <ArticleSection title="Write stalls and backpressure">
        <p>Eventually the engine has to protect itself. If too many immutable memtables or files accumulate, allowing writes to continue indefinitely would make recovery work grow without bound.</p>
        <p>A storage engine may therefore slow or stall writes while it catches up. This is not necessarily a bug. It is backpressure: the producer is being forced to respect the capacity of the consumer.</p>
        <p>This matters when interpreting production latency. A sudden increase in write latency can be caused by a storage engine deliberately applying backpressure rather than by the application becoming slower.</p>
        <ArticleCallout>
          When investigating latency, correlate application request time with compaction pending work, flush latency, disk utilisation, write stalls and background-thread activity. A single p99 graph rarely tells the whole story.
        </ArticleCallout>
      </ArticleSection>

      <ArticleSection title="Tombstones are data too">
        <p>A delete in an LSM engine often becomes a tombstone rather than immediately erasing every older copy of the key.</p>
        <ArticleCode>{`PUT account:7 = active
DELETE account:7

// Conceptually:
account:7 -> TOMBSTONE
account:7 -> active   // older SSTable
`}</ArticleCode>
        <p>The tombstone must hide the older value. If an older SSTable could still be searched without seeing the tombstone, a deleted record could reappear.</p>
        <p>Only when compaction has enough knowledge to establish that the tombstone can safely eliminate older data can both the tombstone and the old value disappear. This is one reason deletes can create surprising storage behaviour in workloads with high churn.</p>
      </ArticleSection>

      <ArticleSection title="The hidden interaction with snapshots">
        <p>Version visibility becomes more complicated when readers can hold snapshots. A compaction cannot blindly discard every older version because an active reader may still be entitled to observe it.</p>
        <p>The storage engine therefore has to combine physical file layout with logical sequence information. A file can be old without every record inside it being disposable.</p>
        <p>This is another recurring systems pattern: <strong>physical cleanup is constrained by logical observers</strong>. PostgreSQL MVCC has a related idea with old tuple versions and long-running snapshots, but the storage mechanics are different.</p>
      </ArticleSection>

      <ArticleSection title="A useful experiment">
        <p>You can make LSM behaviour tangible without deploying a distributed database. Run an embedded LSM-based store with a small memtable and deliberately create many versions of the same keys.</p>
        <ArticleCode>{`for (let i = 0; i < 100_000; i++) {
  db.put(`user:${i % 1000}`, String(i));
}

for (let i = 0; i < 1000; i++) {
  db.get(`user:${i}`);
}`}</ArticleCode>
        <p>Then observe the storage directory while writes continue. Look for new SSTables, compaction activity and changes in file count. Repeat with a workload that writes unique keys rather than repeatedly updating the same keys.</p>
        <p>The second workload has little obsolete history. The first creates a great deal of overwritten state. Comparing them makes the purpose of compaction much easier to see.</p>
        <p>If your engine exposes statistics, measure bytes written, compaction time, pending compaction work, cache hit rate and read latency. Change the write rate until the system begins to accumulate background work. That threshold is often more interesting than the peak throughput number.</p>
      </ArticleSection>

      <ArticleSection title="Why SSDs do not make the trade-off disappear">
        <p>Modern SSDs are excellent at random I/O compared with spinning disks, but “SSDs are fast” does not eliminate storage-engine economics.</p>
        <p>Physical writes still consume bandwidth, controller resources and flash program/erase cycles. Compaction also competes with foreground reads for CPU and memory bandwidth. Cloud block storage can introduce additional limits and queueing behaviour.</p>
        <p>Sequential access can still be substantially easier for a storage system to manage than a large number of tiny random operations. More importantly, batching creates opportunities for compression, filtering, prefetching and efficient sequential scanning.</p>
      </ArticleSection>

      <ArticleSection title="The connection to immutable infrastructure">
        <p>There is a broader architectural pattern hiding here. LSM engines make immutable objects cheap to reason about and move complexity into the process that creates new immutable objects.</p>
        <p>The same idea appears in container images, content-addressed build caches, Git objects and many event-oriented systems. Rather than constantly mutating one canonical blob, systems accumulate immutable pieces and periodically derive better representations.</p>
        <p>The price is reconciliation. Somewhere there must be a process that understands how multiple immutable states relate and decides when old material can be discarded.</p>
        <ArticleCallout>
          Immutability often moves complexity rather than removing it: foreground mutation gets simpler, while merging, indexing, garbage collection and lifecycle management become first-class engineering problems.
        </ArticleCallout>
      </ArticleSection>

      <ArticleSection title="Sharp edges for application developers">
        <p>You do not need to implement an LSM tree to encounter its consequences.</p>
        <p><strong>Large batches can help.</strong> Batching mutations gives the storage engine more opportunity to amortise fixed costs.</p>
        <p><strong>Update-heavy workloads can behave differently from insert-heavy workloads.</strong> Repeatedly changing the same logical keys creates obsolete versions and therefore more compaction work.</p>
        <p><strong>Deletes are not instant physical erasure.</strong> High delete rates can produce tombstone pressure.</p>
        <p><strong>Latency is not only about the foreground operation.</strong> Background compaction can affect the resources available to reads and writes.</p>
        <p><strong>Storage capacity is not the same as logical dataset size.</strong> Temporary compaction space, old files and metadata can require headroom.</p>
        <p><strong>Benchmarking one operation in isolation is misleading.</strong> An LSM system may have excellent short-term write latency while silently accumulating compaction debt.</p>
      </ArticleSection>

      <ArticleSection title="A mental model for production incidents">
        <p>When an LSM-backed service develops storage or latency problems, walk the system from left to right:</p>
        <ArticleCode>{`logical writes
  -> WAL
  -> memtables
  -> flushes
  -> SSTable count / overlap
  -> compaction debt
  -> physical I/O
  -> cache behaviour
  -> foreground latency
`}</ArticleCode>
        <p>Ask where the queue is forming. Is the application producing mutations faster than the disk can absorb them? Are flushes producing too many small files? Is compaction falling behind? Is the workload generating huge amounts of obsolete data? Is the read path consulting too many files?</p>
        <p>This approach is more useful than treating “the database” as a black box. An LSM engine is a pipeline with queues and resource constraints, and each stage can become the bottleneck.</p>
      </ArticleSection>

      <ArticleSection title="The bigger connection: delayed work is still work">
        <p>LSM trees are an excellent example of a systems principle that appears everywhere: moving work out of the critical path does not eliminate it. It changes when the work happens, how much it can be batched, and which resources it competes for.</p>
        <p>The clever part of an LSM tree is not simply that it writes sequentially. It is that it turns many unpredictable small mutations into a set of immutable, ordered structures that can be merged efficiently.</p>
        <p>Once you see the system that way, compaction stops looking like mysterious database housekeeping. It becomes the mechanism that pays the deferred cost of the write optimisation.</p>
        <ArticleCallout>
          <strong>Takeaway:</strong> An LSM tree is a negotiated balance between three pressures: how cheaply you can accept writes, how cheaply you can find current data, and how much physical work and space you are willing to spend to keep those two costs under control.
        </ArticleCallout>
      </ArticleSection>
    </ArticleLayout>
  );
}
