import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'linux-page-cache',
  title: 'The Linux Page Cache: Why “Disk I/O” Is Often a Memory Problem',
  subtitle: 'How Linux turns files into cached pages, when writes really hit storage, and why the same application can be fast, slow, or mysteriously spiky.',
  category: 'Linux Internals',
  description: 'A deep dive into the Linux page cache, readahead, dirty pages, writeback, mmap, and the performance traps that make file I/O hard to reason about.',
  date: '2026-09-28',
  readingTime: 24,
  tags: ['Linux', 'Operating Systems', 'Filesystems', 'Performance', 'I/O'],
};

export function LinuxPageCacheArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        When a program reads a file on Linux, it usually does not read from the
        storage device. When it writes a file, it usually does not wait for the
        bytes to reach durable media. The kernel quietly inserts a large,
        shared, memory-backed layer between the process and the filesystem:
        the <strong>page cache</strong>.
      </p>

      <p>
        This is one of the most useful performance ideas in Unix systems, but
        it also creates a dangerous illusion. A benchmark can appear to measure
        a fast NVMe drive while measuring RAM. A write can return in microseconds
        and still be vulnerable to power loss. A process can slow down even
        though its own CPU profile looks healthy because another process is
        forcing global writeback.
      </p>

      <p>
        The page cache is not merely an optimisation. It is part of the
        operating system's I/O architecture: it mediates between a byte-oriented
        API, a block-oriented device, and a virtual-memory system that already
        knows how to track pages, permissions, faults, and memory pressure.
      </p>

      <h2>The mental model: files become pages</h2>

      <p>
        User space sees a file as a sequence of bytes. The kernel normally
        manages file contents in fixed-size chunks called <strong>pages</strong>
        (commonly 4 KiB on x86-64, though the exact page size is architecture
        dependent). The page cache stores those file-backed pages in memory and
        associates them with a file plus a file offset.
      </p>

      <div className="diagram">
        <div><strong>read()</strong><small>Process asks for bytes</small></div>
        <div><strong>page cache</strong><small>Kernel checks cached pages</small></div>
        <div><strong>storage</strong><small>Only misses reach the device</small></div>
      </div>

      <p>
        Conceptually, a read looks like this:
      </p>

      <pre><code>read(fd, buffer, 4096)

1. Resolve fd -&gt; file -&gt; inode/address space
2. Look for the file page at the requested offset
3. If present:
   - copy bytes from the cached page to user memory
4. If absent:
   - submit I/O to storage
   - sleep until the page arrives
   - install it in the page cache
   - copy bytes to user memory</code></pre>

      <p>
        The cache key is effectively “this file, at this offset”, not “this
        process”. Two unrelated processes reading the same file can share the
        same cached page. That is why starting a second worker often makes it
        look as though the filesystem suddenly became faster: the first worker
        warmed a cache that the second worker inherits.
      </p>

      <h2>Why the page cache belongs beside virtual memory</h2>

      <p>
        Linux already has machinery for mapping virtual addresses to physical
        pages. Rather than inventing a completely separate cache with its own
        eviction and memory-pressure rules, the kernel represents file-backed
        data as pages in the same broad memory-management world as anonymous
        process memory.
      </p>

      <p>
        The important distinction is <strong>what the page is backed by</strong>:
        anonymous memory is backed by swap or RAM, while a page-cache page can be
        reconstructed from a file on disk. Under memory pressure, clean file
        pages are attractive eviction candidates because the kernel can simply
        discard them and reload them later.
      </p>

      <div className="article__callout">
        <strong>Key idea:</strong> “Cached” does not mean pinned forever. A clean
        page-cache page is disposable. A dirty page must be written back before
        it can be reclaimed safely.
      </div>

      <h2>Cold reads, warm reads, and the benchmark trap</h2>

      <p>
        A cold read misses the cache and pays the latency of the storage stack:
        filesystem lookup, block mapping, request submission, queueing, device
        service time, and completion. A warm read may only pay for a kernel-to-
        user copy, plus the cost of finding the page in the cache.
      </p>

      <p>
        That difference can be several orders of magnitude. It is common for a
        benchmark to report astonishing throughput on a second run because the
        test data is already resident in RAM.
      </p>

      <pre><code># Observe memory before and after a read-heavy workload
free -h
cat /proc/meminfo | egrep 'Cached|Buffers|Dirty|Writeback'

# A simple cold/warm comparison (run with care on real systems)
time dd if=large-file.bin of=/dev/null bs=1M status=progress
time dd if=large-file.bin of=/dev/null bs=1M status=progress</code></pre>

      <p>
        The second command is not necessarily measuring your disk. It may be
        measuring the page cache. For a controlled experiment, isolate the
        machine, understand the consequences of cache-dropping, and prefer
        application-level benchmarks that explicitly report cold and warm
        behaviour instead of pretending they are the same workload.
      </p>

      <h2>Readahead: the kernel guesses what you will need next</h2>

      <p>
        Storage devices are good at sequential work, but applications often
        request one page at a time. If the kernel notices a sequential access
        pattern, it can issue <strong>readahead</strong>: fetch pages beyond the
        exact request so that future reads are already warm.
      </p>

      <p>
        Readahead is a prediction system. It helps a log scanner, hurts a random
        key-value lookup, and becomes awkward when an application alternates
        between multiple streams. The kernel tries to adapt the window size
        based on observed access, but no heuristic can perfectly infer intent.
      </p>

      <p>
        This is one reason a file format that is “logically sequential” but
        physically scattered can perform badly. The user-level loop looks
        simple; the device sees small, unpredictable requests with little
        opportunity for read merging.
      </p>

      <h2>Buffered writes: fast now, expensive later</h2>

      <p>
        A normal write usually copies data from user space into page-cache pages
        and marks those pages <strong>dirty</strong>. The call can return before
        the device has persisted the data.
      </p>

      <pre><code>write(fd, data, length);

user memory
    | copy
    v
page-cache page -- dirty --&gt; writeback queue --&gt; block layer --&gt; device</code></pre>

      <p>
        Later, background kernel threads perform <strong>writeback</strong>:
        they submit dirty pages to the filesystem and device. The kernel also
        applies throttling when too much dirty memory accumulates, forcing the
        writers themselves to slow down.
      </p>

      <p>
        This creates a characteristic latency shape. Small writes look cheap,
        then a workload hits a dirty-memory threshold and suddenly experiences
        stalls. The application did not “randomly get slower”; it crossed from
        “copy into RAM” to “help the kernel drain accumulated debt”.
      </p>

      <h2>Durability is a separate contract</h2>

      <p>
        There are three different claims people often collapse into one:
      </p>

      <ol>
        <li>The process handed bytes to the kernel.</li>
        <li>The kernel handed dirty pages to the storage device.</li>
        <li>The device confirmed the bytes are durable across power loss.</li>
      </ol>

      <p>
        <code>write()</code> primarily establishes the first claim. Calls such
        as <code>fsync()</code> are used when the application needs a stronger
        durability boundary, although the exact guarantee depends on the
        filesystem, device cache, barriers, and failure mode.
      </p>

      <p>
        Database systems therefore build their own write-ahead logging and
        durability protocols on top of the kernel's buffering. “The write
        returned” is not a complete persistence story.
      </p>

      <div className="article__callout">
        <strong>Sharp edge:</strong> A fast benchmark that omits durability
        requirements can be perfectly valid for throughput and completely
        misleading for crash safety.
      </div>

      <h2>mmap: same cache, different fault path</h2>

      <p>
        Memory mapping does not bypass the page cache for ordinary file-backed
        mappings. Instead, it changes how the process reaches the cached page.
        With <code>read()</code>, the kernel copies bytes into a user buffer. With
        <code>mmap()</code>, the process accesses a virtual address and the
        first access to an absent page triggers a <strong>page fault</strong>.
      </p>

      <pre><code>mapped = mmap(...);

value = mapped[offset];
// If the page is absent:
//   1. CPU raises a page fault
//   2. kernel resolves file offset -&gt; page
//   3. storage I/O may be submitted
//   4. thread sleeps
//   5. page is installed in the process page tables
//   6. instruction restarts</code></pre>

      <p>
        The advantage is that the application can treat the file as memory and
        let the VM system handle paging. The cost is that latency can appear at
        ordinary loads, which makes profiling and tail-latency analysis less
        obvious. A line of code that looks like a cheap array access can block
        on storage.
      </p>

      <h2>Eviction and memory pressure</h2>

      <p>
        The cache competes with anonymous memory, kernel allocations, and other
        reclaimable structures. Linux uses recency and frequency signals to
        decide what is worth keeping, but there is no universal “keep the hottest
        files” rule.
      </p>

      <p>
        A process can therefore suffer from <strong>cache churn</strong>: it
        scans a large dataset once, evicts useful hot pages, and leaves the
        machine colder for unrelated workloads. The page cache is shared state,
        so one workload can alter another workload's latency without sharing
        any application objects.
      </p>

      <p>
        This matters in containers too. Containers share the host kernel and
        usually share the host page cache. A memory limit does not mean the
        container owns an isolated slice of file cache. The host may reclaim
        pages, and cgroup memory accounting can still make cache-heavy workloads
        compete with heap memory in surprising ways.
      </p>

      <h2>Why direct I/O exists</h2>

      <p>
        Some applications use <code>O_DIRECT</code> to reduce or bypass normal
        page-cache involvement. Databases are the classic example: they may
        already have a carefully managed buffer pool, eviction policy, and
        prefetch strategy.
      </p>

      <p>
        Direct I/O trades one set of problems for another:
      </p>

      <ul>
        <li>alignment requirements for buffers and offsets;</li>
        <li>more responsibility for readahead and caching;</li>
        <li>different semantics around durability and ordering;</li>
        <li>harder integration with ordinary filesystem behaviour.</li>
      </ul>

      <p>
        Bypassing the cache is not automatically faster. It is attractive when
        a second cache would create duplication or when predictable I/O matters
        more than general-purpose heuristics.
      </p>

      <h2>A useful production debugging checklist</h2>

      <p>
        When an I/O-heavy service behaves strangely, ask questions that separate
        cache effects from device effects:
      </p>

      <ol>
        <li>Is the workload cold, warm, or mixed?</li>
        <li>Are reads sequential, random, or multiple interleaved streams?</li>
        <li>Are writes buffered, synchronous, or explicitly durable?</li>
        <li>Is latency coming from page faults, queueing, or writeback throttling?</li>
        <li>Is another workload evicting the pages you care about?</li>
      </ol>

      <pre><code># A small observability toolkit
vmstat 1
iostat -xz 1
pidstat -d 1
cat /proc/meminfo
sar -B 1</code></pre>

      <p>
        Correlate these views. High device utilisation with low cache hits means
        something different from high dirty memory with low device utilisation.
        A service that looks CPU-idle may be blocked on page faults or waiting
        for writeback.
      </p>

      <h2>The bigger connection: the kernel is a prediction engine</h2>

      <p>
        The page cache reveals a recurring operating-system pattern: the kernel
        tries to turn an expensive, general interface into a fast common case by
        predicting future work.
      </p>

      <p>
        Readahead predicts future reads. Eviction predicts which pages you will
        stop using. Writeback decides when to convert cheap memory writes into
        expensive device work. None of these decisions are visible in the
        simple <code>read()</code> and <code>write()</code> API, yet they dominate
        real performance.
      </p>

      <p>
        Once you see the page cache as a prediction and debt-management system,
        several “mysterious” behaviours become ordinary:
      </p>

      <ul>
        <li>the first request is slow and the next thousand are fast;</li>
        <li>latency spikes arrive after a period of apparently cheap writes;</li>
        <li>one process changes another process's I/O performance;</li>
        <li>a memory-mapped load can block like a disk read;</li>
        <li>the same code behaves differently after a restart, deploy, or failover.</li>
      </ul>

      <h2>Takeaway</h2>

      <p>
        Linux file I/O is rarely “the application talks directly to the disk”.
        The normal path is a negotiation between user memory, the page cache,
        virtual memory, filesystem policy, writeback, the block layer, and the
        device.
      </p>

      <p>
        For senior-level performance work, the important question is not simply
        “how fast is this storage?” It is: <strong>which layer is currently
        absorbing the cost, and what prediction or debt mechanism moved that
        cost in time?</strong>
      </p>
    </ArticleLayout>
  );
}
