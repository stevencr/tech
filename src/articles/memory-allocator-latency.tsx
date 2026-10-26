import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'memory-allocator-latency',
  title: 'The Allocator Is Part of Your Latency Budget',
  subtitle: 'Why free() rarely means “give the RAM back”: arenas, thread caches, size classes, fragmentation, virtual memory, and the experiments that separate a leak from allocator retention.',
  category: 'Runtime and Memory Internals',
  description: 'A senior-level tour of native memory allocators on Linux: how malloc maps to pages, why thread caches and arenas trade memory for throughput, how fragmentation distorts RSS, and how to investigate memory growth without guessing.',
  date: '2026-10-27',
  readingTime: 24,
  tags: ['Linux', 'Performance', 'Memory', 'C', 'Concurrency', 'Observability', 'Runtime Internals'],
};

export function MemoryAllocatorLatencyArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        A service warms up, handles a burst of traffic, then goes quiet. Its live
        object count falls back to normal, but resident memory stays high. A
        second service with the same request rate has a lower RSS and worse
        throughput. A third process occasionally suffers latency spikes during
        allocation-heavy work, despite having plenty of free memory on the host.
      </p>

      <p>
        These symptoms can look like a leak, a garbage collector problem, or a
        kernel memory issue. Sometimes they are. But an often-missed participant
        is the <strong>memory allocator</strong>: the runtime component that
        turns requests such as <code>malloc(96)</code> into usable regions of
        memory and decides what to do with those regions after <code>free()</code>.
      </p>

      <p>
        An allocator is not a thin wrapper around the operating system. It is a
        concurrent data structure, a cache hierarchy, a fragmentation policy,
        and a virtual-memory client. Its choices affect tail latency, resident
        set size, cache locality, lock contention, and how gracefully a process
        behaves inside a container memory limit.
      </p>

      <div className="diagram">
        <div><strong>Application</strong><small>Requests and releases objects</small></div>
        <div><strong>Allocator</strong><small>Size classes, caches, arenas, metadata</small></div>
        <div><strong>Virtual memory</strong><small>mmap, brk, page mappings and faults</small></div>
        <div><strong>Physical memory</strong><small>Pages become resident as they are touched</small></div>
      </div>

      <h2>First, separate four different meanings of “memory”</h2>

      <p>
        Many memory investigations go wrong because several different quantities
        are treated as synonyms. They are not.
      </p>

      <ul>
        <li><strong>Live application data:</strong> objects or buffers the program still needs.</li>
        <li><strong>Allocator-managed free space:</strong> chunks the allocator can reuse without asking the kernel for more memory.</li>
        <li><strong>Virtual address space:</strong> ranges reserved or mapped into the process, whether or not every page is resident.</li>
        <li><strong>Resident memory:</strong> pages currently resident in physical RAM and charged to the process's RSS accounting.</li>
      </ul>

      <p>
        A program can have little live data, lots of allocator-managed free space,
        a large virtual address range, and a high RSS at the same time. That
        combination is not automatically a leak. It can be the allocator keeping
        memory available for the next burst, or it can be fragmentation that
        prevents otherwise-free chunks from being returned as whole pages.
      </p>

      <p>
        The distinction matters in containers. A cgroup memory limit is enforced
        against kernel-accounted memory, not against the number of live objects
        reported by a language runtime. A process can therefore be logically
        healthy and still approach its container limit because its allocator,
        stacks, mapped files, runtime metadata, and other native allocations
        all contribute to memory pressure.
      </p>

      <h2>malloc is not a system call</h2>

      <p>
        A call to <code>malloc()</code> normally does not cross into the kernel
        every time. The allocator tries to satisfy the request from memory it
        already manages. That is essential: system calls, page mapping changes,
        synchronisation and page faults are much more expensive than a handful
        of user-space pointer operations.
      </p>

      <p>
        Conceptually, a typical allocation path looks like this:
      </p>

      <pre><code>{`malloc(requested_size)
  -> round up for alignment and allocator metadata
  -> check a fast per-thread cache, if applicable
  -> find a suitable chunk in an arena or size-class structure
  -> split a larger free chunk if the allocator can do so
  -> otherwise obtain more virtual memory from the kernel
  -> return a pointer to the usable payload`}</code></pre>

      <p>
        The exact path depends on the allocator, request size, thread, current
        free lists and fragmentation state. The important point is that the
        allocator usually manages memory in units larger than the individual
        request. A request for 33 bytes may consume a chunk from a 48-byte or
        64-byte size class after alignment and metadata are accounted for.
        The extra space is internal fragmentation: the price of making allocation
        and reuse efficient.
      </p>

      <h3>Chunks, bins and size classes</h3>

      <p>
        General-purpose allocators need a way to find a reusable block quickly.
        One strategy is to group free chunks by size. Small allocations can be
        served from fixed size classes or bins, while larger allocations may use
        different structures or be mapped directly. When a request arrives, the
        allocator can often find a suitable block without scanning every free
        region in the process.
      </p>

      <p>
        Allocators also need metadata: enough information to know a chunk's
        size, whether it is in use, and how it can be coalesced or reused. Some
        metadata sits beside chunks; some lives in separate structures. This is
        why writing one byte past the end of a native buffer can corrupt
        something that appears unrelated. The overwritten byte might be
        allocator metadata rather than another application field.
      </p>

      <p>
        Freeing a chunk may let the allocator merge it with adjacent free chunks.
        But “adjacent” means adjacent in the relevant managed region, not merely
        two allocations that happened close together in source code. Allocations
        separated by a live object cannot generally be merged into one large
        free block. This is one root of external fragmentation.
      </p>

      <h2>Why allocators have arenas</h2>

      <p>
        Imagine every thread calling malloc and free through one global lock.
        Allocation metadata would be simple to protect, but under contention
        threads would spend time waiting for one another instead of doing useful
        work. A common response is to divide allocator state into multiple
        <strong> arenas</strong>. Threads can allocate from different arenas,
        reducing contention on shared data structures.
      </p>

      <p>
        In glibc's allocator, arenas are an important part of that design. They
        have their own allocation state and can manage multiple chunks of memory.
        The main arena has historically used the process heap, while additional
        arenas may obtain memory through mappings. The precise implementation
        and defaults depend on glibc version and platform.
      </p>

      <p>
        Arenas exchange one cost for another. More independent allocation
        domains can improve throughput when many threads allocate concurrently.
        But each arena has its own partially occupied regions and free chunks.
        A free chunk in one arena is not necessarily interchangeable with a
        chunk of the same size in another arena without allocator-specific
        coordination. More arenas can therefore increase the amount of memory
        retained by a process.
      </p>

      <div className="article__callout">
        <strong>Trade-off:</strong> contention and memory retention are connected.
        Reducing shared locks often means partitioning state. Partitioned state
        improves parallelism, but makes it harder to combine every unused byte
        into one globally reusable pool.
      </div>

      <h2>Thread caches: fast reuse with a hidden footprint</h2>

      <p>
        Arenas reduce contention, but even acquiring an arena lock for every
        tiny allocation can be expensive. Modern allocators often add a
        per-thread or per-CPU cache for common small sizes. A recently freed
        chunk can be placed into a local cache and reused by the same thread
        with very little coordination.
      </p>

      <p>
        glibc's tcache is a well-known example. It keeps a limited number of
        chunks for eligible size classes in thread-local state. A cache hit can
        avoid much of the arena allocation path. The upside is lower latency and
        less lock traffic. The downside is that cached chunks remain tied to
        that thread's cache until reused or returned through allocator-specific
        paths.
      </p>

      <p>
        This can be surprising in thread-heavy applications. A worker pool may
        create many threads, each of which briefly allocates a few small objects.
        The total retained cache capacity can scale with the number of threads
        and eligible size classes. Thread churn, long-lived worker threads and
        allocation patterns all affect the result. It is not correct to assume
        that every thread consumes the maximum theoretical cache footprint, but
        it is equally wrong to assume the footprint is always negligible.
      </p>

      <p>
        This is the same broad design pattern seen elsewhere in systems
        engineering: local caches reduce coordination but create distributed
        copies of capacity. CPU caches, connection pools, per-worker queues and
        sharded counters all make a similar trade. The performance question is
        not simply “is caching faster?” It is “how much state is replicated,
        how quickly is it reconciled, and what happens when demand changes?”
      </p>

      <h2>free() releases ownership, not necessarily pages</h2>

      <p>
        The C API promises that the program may reuse a freed allocation. It
        does not promise that the process's RSS immediately falls. The allocator
        may keep the chunk in a local cache, a bin, or a larger arena region.
        That is often the correct performance choice: if the next request needs
        a similarly sized block, reusing the chunk is cheaper than returning
        memory to the kernel and later asking for it again.
      </p>

      <p>
        Returning memory is easiest when an entire independently mapped region
        can be unmapped, or when a releasable region sits at the end of a heap
        that can shrink. It is harder when a page contains a mixture of live
        and free chunks. The allocator cannot hand the whole page back while
        even one live allocation still occupies part of it. A few long-lived
        objects can pin pages that otherwise contain mostly unused space.
      </p>

      <p>
        There are therefore at least three different events that people call
        “freeing memory”:
      </p>

      <ol>
        <li>The application no longer owns an object.</li>
        <li>The allocator marks its chunk reusable and may coalesce it with neighbours.</li>
        <li>The allocator and kernel arrange for pages or mappings to stop contributing to resident memory.</li>
      </ol>

      <p>
        These events can happen at different times, and the third might never
        happen for a particular page while the process remains alive. This is
        allocator retention, not necessarily a leak. It can still be an
        operational problem if the process is close to a memory limit.
      </p>

      <h2>brk, mmap and the page boundary</h2>

      <p>
        On Linux, allocators obtain address space through mechanisms including
        <code>brk</code> and <code>mmap</code>. Historically, the process heap
        could grow by moving the program break. Separately mapped regions can be
        created with mmap and later unmapped. In glibc, sufficiently large
        allocations have often been served by private anonymous mappings, while
        smaller requests are commonly carved out of larger managed regions.
        Thresholds and decisions can be adjusted; do not treat one size as a
        universal rule for every process or glibc version.
      </p>

      <p>
        Virtual memory introduces another important distinction: reserving or
        mapping address space is not the same as making every page resident.
        On systems with demand paging and optimistic overcommit, a successful
        allocation can return a pointer before the process has physically
        touched every page. Touching the pages later can trigger page faults and
        real memory pressure. A benchmark that measures only malloc calls may
        therefore miss the cost that appears when the program first writes to
        its allocations.
      </p>

      <pre><code>{`# Observe virtual size and resident size for a process
grep -E 'Vm(Size|RSS|Data|Swap)' /proc/$PID/status

# More detailed, summed mapping accounting
cat /proc/$PID/smaps_rollup

# Mapping layout (less detailed than smaps)
cat /proc/$PID/maps`}</code></pre>

      <p>
        RSS is useful but imperfect for questions such as “how much physical
        memory is this process uniquely responsible for?” Shared pages can be
        counted in each process's RSS. Proportional set size (PSS) apportions
        shared pages across mappings and is often a better comparison when
        several processes share libraries or memory. The kernel's
        <code>/proc/PID/smaps_rollup</code> provides aggregated fields such as
        RSS, PSS, anonymous memory and swap, though reading detailed accounting
        is more expensive than reading lightweight status counters.
      </p>

      <h2>Two kinds of fragmentation</h2>

      <p>
        <strong>Internal fragmentation</strong> is space inside an allocated
        chunk that the application did not request. Alignment, metadata and
        size-class rounding create it. It is often the cost of making allocation
        fast and predictable.
      </p>

      <p>
        <strong>External fragmentation</strong> is free space that exists but is
        split into regions that cannot satisfy a larger request. Suppose a
        managed region has 8 MB free in total, but it is scattered into many
        small gaps between live allocations. A request for one contiguous 4 MB
        block may still need a new mapping or a new region. Total free bytes
        alone do not describe whether the allocator can satisfy a request
        cheaply.
      </p>

      <p>
        Size-class allocators make this trade especially visible. They can reuse
        objects of a matching class efficiently, but a workload that alternates
        between object sizes and lifetimes may leave partially occupied spans.
        Some allocators are designed around spans or pages dedicated to one
        class, which makes allocation fast but can strand unused slots while
        any object in the span remains live. Others use different strategies
        to balance fragmentation, metadata cost and concurrency.
      </p>

      <h2>Run a controlled experiment</h2>

      <p>
        The best way to build intuition is to separate allocation, touching,
        freeing and process exit. The following small C program creates many
        same-sized allocations, touches each page so physical memory becomes
        observable, waits for inspection, frees the allocations, then waits
        again. It is intentionally simple; real workloads have more varied
        sizes and lifetimes.
      </p>

      <pre><code>{`#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

enum { COUNT = 200000, SIZE = 256 };

int main(void) {
    void **items = calloc(COUNT, sizeof(*items));
    if (!items) return 1;

    for (int i = 0; i < COUNT; ++i) {
        items[i] = malloc(SIZE);
        if (!items[i]) return 2;
        memset(items[i], 0xA5, SIZE);
    }

    puts("Allocated and touched. Inspect /proc/<pid>/smaps_rollup, then press Enter.");
    getchar();

    for (int i = 0; i < COUNT; ++i) {
        free(items[i]);
    }
    free(items);

    puts("Freed. Inspect memory again, then press Enter.");
    getchar();
    return 0;
}`}</code></pre>

      <pre><code>{`cc -O2 -Wall -Wextra allocator-demo.c -o allocator-demo
./allocator-demo

# In another terminal, replace PID with the process id:
grep -E 'Vm(Size|RSS|Data)' /proc/PID/status
cat /proc/PID/smaps_rollup`}</code></pre>

      <p>
        The expected lesson is not a specific RSS number. Results vary with
        architecture, libc version, allocator settings, page size and system
        state. Observe the shape of the change: memory rises after allocations
        are touched; after free, allocator-managed chunks may be reusable even
        if RSS remains elevated; after process exit, the kernel can reclaim the
        process's mappings. Repeat the experiment with different allocation
        sizes and counts, and compare the results rather than assuming one
        run proves a general rule.
      </p>

      <p>
        Be careful interpreting this demo: the pointer array itself remains live
        until after the loop, and the chosen allocation pattern may allow the
        allocator to reuse or release memory differently from a production
        workload. The point is to form a hypothesis and collect evidence, not
        to use a toy benchmark as a universal allocator ranking.
      </p>

      <h2>Try glibc's trim path—but treat it as an experiment</h2>

      <p>
        glibc exposes <code>malloc_trim()</code>, which attempts to release free
        heap memory back to the system. It is useful for understanding the
        allocator's release behaviour, but it is not a magic command that
        compacts arbitrary live allocations or guarantees that RSS will fall to
        the live heap size.
      </p>

      <p>
        You can add this after the free loop in the example, on a GNU/Linux
        system using glibc:
      </p>

      <pre><code>{`#include <malloc.h>

/* After freeing the allocations: */
int released = malloc_trim(0);
printf("malloc_trim reported: %d\\n", released);`}</code></pre>

      <p>
        Compare the process's memory before and after the call. A successful
        return indicates that some memory was released; a zero return does not
        mean the allocator has no free chunks. The API is glibc-specific, and
        other allocators expose different control or statistics interfaces.
        Do not add trimming to a hot request path without measuring it: system
        calls and memory reacquisition can turn lower steady-state RSS into
        worse latency.
      </p>

      <h2>Allocator tuning is a workload decision</h2>

      <p>
        glibc supports tunables through <code>GLIBC_TUNABLES</code>. For example,
        the arena limit can be adjusted with a setting such as
        <code>glibc.malloc.arena_max</code>, and tcache behaviour can be
        investigated with <code>glibc.malloc.tcache_count</code>. The exact
        defaults and available tunables are version-dependent; consult the
        documentation for the libc actually deployed.
      </p>

      <pre><code>{`# Example experiment: cap the number of glibc arenas
GLIBC_TUNABLES=glibc.malloc.arena_max=2 ./your-service

# Example experiment: disable glibc's per-thread tcache
GLIBC_TUNABLES=glibc.malloc.tcache_count=0 ./your-service`}</code></pre>

      <p>
        These are diagnostic experiments, not recommended production defaults.
        Fewer arenas may reduce retained memory but increase lock contention.
        Disabling a thread cache may make memory easier to return through some
        paths while increasing allocation overhead. A setting that improves
        one benchmark can hurt a service with a different thread count, object
        lifetime distribution or traffic shape.
      </p>

      <p>
        Measure at least throughput, p50/p95/p99 latency, RSS or PSS, allocation
        rate, CPU consumption and behaviour under a burst followed by an idle
        period. Repeat under realistic concurrency. A single-thread microbenchmark
        can miss exactly the contention that arenas and caches were designed
        to reduce.
      </p>

      <h2>Different allocators make different bets</h2>

      <p>
        glibc's allocator is only one design. jemalloc exposes arenas and
        thread-specific caches, along with extensive statistics and control
        interfaces. TCMalloc has historically emphasised thread or CPU-local
        caches and central free lists. mimalloc uses page-oriented structures
        and local free lists to keep common paths small. These descriptions are
        broad design tendencies, not a substitute for reading the implementation
        and configuration of a particular release.
      </p>

      <p>
        The important comparison is not “which allocator is fastest?” It is
        which allocator's policies fit the workload and operational constraints.
        An allocation-heavy service with many short-lived objects may value
        cheap local reuse. A memory-constrained worker with many threads may
        care more about retained capacity. A latency-sensitive service may care
        about tail behaviour and bounded slow paths. A server with mixed native
        libraries may not be free to replace its allocator safely or completely.
      </p>

      <p>
        Swapping allocators is also an ABI and deployment decision. Every
        component that allocates memory and another component that frees it
        must agree on ownership and allocator boundaries. Replacing malloc
        can expose assumptions in native libraries, plugins and language
        runtimes. Validate correctness, diagnostics, symbol interposition,
        platform support and rollback before treating an allocator swap as a
        configuration-only change.
      </p>

      <h2>Managed runtimes do not make this disappear</h2>

      <p>
        A JavaScript or Java application may expose a heap metric that looks
        healthy while process RSS grows. The runtime's garbage collector tracks
        managed objects, but the process also has code pages, thread stacks,
        JIT-generated code, native libraries, direct byte buffers, allocator
        metadata and memory obtained outside the managed heap. A drop in live
        objects is therefore not a promise that the operating system will see
        an equal drop in resident memory.
      </p>

      <p>
        Node.js is a particularly useful example because an application can
        combine V8-managed objects with native allocations from buffers,
        dependencies and bindings. V8 heap statistics alone are not a complete
        process memory budget. Conversely, high RSS alone does not prove a V8
        leak. Compare runtime heap metrics with process-level accounting and
        native allocation evidence, and look for which category is actually
        growing.
      </p>

      <p>
        The same principle applies to garbage-collected runtimes generally:
        garbage collection answers whether objects are reachable according to
        that runtime's rules. It does not necessarily decide when pages are
        returned to the operating system. Heap growth policies, free lists,
        fragmentation, thread-local caches and the native allocator beneath
        the runtime all affect the gap between live data and RSS.
      </p>

      <h2>A production investigation that avoids guesswork</h2>

      <ol>
        <li><strong>Establish the metric.</strong> Distinguish runtime live heap, allocated heap capacity, RSS, PSS, virtual size and cgroup memory. They answer different questions.</li>
        <li><strong>Look at time and shape.</strong> Does memory rise with traffic and plateau, grow monotonically, or stay high after a burst? Correlate it with thread count and allocation rate.</li>
        <li><strong>Separate managed from native memory.</strong> Use runtime diagnostics, native allocation profiling where available, and <code>smaps_rollup</code> to identify anonymous, file-backed and shared contributions.</li>
        <li><strong>Test reuse versus release.</strong> In a safe reproduction, free the same workload, wait, inspect again, and compare behaviour after process exit. A high post-free RSS is evidence, not a diagnosis.</li>
        <li><strong>Measure under realistic concurrency.</strong> Arena and cache policies can trade memory footprint against contention. Single-thread tests do not reveal that balance.</li>
        <li><strong>Change one variable at a time.</strong> Compare the baseline and tuned run with the same workload, warm-up, limits and measurement window. Keep the change only if the operational objective improves.</li>
      </ol>

      <p>
        If the process is inside a container, inspect cgroup accounting too.
        The process's RSS is not the whole cgroup's memory bill: other processes,
        page cache and kernel-accounted memory can matter. A service can have
        stable RSS while the cgroup approaches its limit for another reason.
        Pair allocator evidence with the resource-pressure counters rather than
        blaming malloc for every memory event.
      </p>

      <h2>Misconceptions worth retiring</h2>

      <ul>
        <li><strong>“free means RAM was returned.”</strong> It means the allocation is no longer owned by the caller and may be reused.</li>
        <li><strong>“RSS equals the live heap.”</strong> RSS is resident process memory, including much more than live application objects.</li>
        <li><strong>“High RSS proves a leak.”</strong> It can indicate retention, fragmentation, caches, mappings or a real leak. You need evidence to distinguish them.</li>
        <li><strong>“More arenas are always better.”</strong> They can reduce contention while increasing retained memory.</li>
        <li><strong>“One allocator wins every benchmark.”</strong> Allocation size, object lifetime, thread count, locality and memory constraints change the result.</li>
        <li><strong>“A successful malloc means physical RAM is already available.”</strong> Virtual allocation and page residency are distinct; first-touch faults and system overcommit can change the later outcome.</li>
      </ul>

      <h2>Further reading</h2>

      <ul>
        <li><a href="https://man7.org/linux/man-pages/man3/malloc.3.html" target="_blank" rel="noreferrer">Linux malloc(3) manual</a> — allocator API, mappings, overcommit and portability notes.</li>
        <li><a href="https://sourceware.org/glibc/manual/latest/html_node/Memory-Allocation-Tunables.html" target="_blank" rel="noreferrer">glibc memory allocation tunables</a> — arenas, tcache and trimming controls.</li>
        <li><a href="https://www.kernel.org/doc/html/latest/filesystems/proc.html" target="_blank" rel="noreferrer">Linux /proc documentation</a> — process mappings and memory-accounting fields.</li>
        <li><a href="https://jemalloc.net/jemalloc.3.html" target="_blank" rel="noreferrer">jemalloc manual</a> — allocator statistics, arenas, caches and control interfaces.</li>
        <li><a href="https://github.com/google/tcmalloc" target="_blank" rel="noreferrer">Google TCMalloc</a> — implementation and design documentation for another allocator family.</li>
      </ul>

      <div className="article__callout">
        <strong>Takeaway:</strong> Memory allocation is a policy layer between
        application lifetimes and the kernel's page machinery. The allocator
        optimises reuse, contention and fragmentation—not the immediate
        reduction of RSS after every free. When memory or latency looks wrong,
        measure live data, allocator behaviour and resident pages separately
        before changing the allocator or declaring a leak.
      </div>
    </ArticleLayout>
  );
}
