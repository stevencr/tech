import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'linux-futexes',
  title: 'Linux Futexes: How Threads Sleep Without Putting Locks in the Kernel',
  subtitle: 'The surprisingly small boundary between user-space atomics and kernel scheduling, and how mutexes, condition variables and priority inheritance are built on it.',
  category: 'Linux Internals',
  description: 'A senior-level deep dive into Linux futexes, the user-space fast path, atomic compare-and-block, kernel wait queues, memory ordering, wake-ups, priority inheritance and the production implications of contention.',
  date: '2026-10-01',
  readingTime: 22,
  tags: ['Linux', 'Concurrency', 'Futex', 'Threads', 'Performance', 'Operating Systems'],
};

export function LinuxFutexesArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        A mutex looks deceptively simple from application code. One thread enters
        a critical section, another tries to enter it, and the second thread
        waits until the first leaves. But “wait” is where operating systems get
        interesting.
      </p>

      <p>
        A thread cannot spin forever without burning a CPU, but putting every
        lock acquisition through the kernel would make the uncontended case
        unnecessarily expensive. Linux solves this with <strong>futexes</strong>:
        a tiny primitive that lets user space make almost all of the decisions
        and asks the kernel for help only when a thread actually needs to sleep
        or wake another thread.
      </p>

      <p>
        Futex is short for <em>fast user-space mutex</em>, although the primitive
        is more general than a mutex. It is a building block for mutexes,
        condition variables, semaphores, barriers and other synchronisation
        mechanisms.
      </p>

      <div className="diagram">
        <div><strong>atomic instruction</strong><small>Fast path in user space</small></div>
        <div><strong>futex word</strong><small>Shared state</small></div>
        <div><strong>syscall</strong><small>Only when blocking or waking</small></div>
        <div><strong>scheduler</strong><small>Thread actually sleeps</small></div>
      </div>

      <h2>The key idea: the kernel does not own the lock</h2>
      <p>
        A normal futex is not a kernel mutex object that your process acquires
        and releases. The application owns a small piece of memory,
        conventionally a 32-bit aligned integer. Threads manipulate that value
        with atomic instructions. The kernel only needs to know about the
        address when a thread must block or another thread needs to wake
        waiters.
      </p>
      <p>
        That distinction explains why an uncontended mutex acquisition can be
        extremely cheap. If the lock is free, the thread can perform an atomic
        compare-and-exchange and continue. There is no context switch, no
        syscall and no kernel data structure representing “the lock”.
      </p>
      <div className="article__callout">
        <strong>Core principle:</strong> synchronisation state lives in user
        memory; the kernel provides a mechanism for turning that state into a
        sleeping waiter when contention makes spinning wasteful.
      </div>

      <h2>A mutex is a protocol around a word</h2>
      <p>
        Imagine a lock represented by a single atomic integer:
      </p>
      <pre><code>0 = unlocked
1 = locked, probably no waiters
2 = locked, waiters may exist</code></pre>
      <p>
        The exact encoding is an implementation detail and real pthread
        implementations are more sophisticated, but the pattern is useful.
        The integer is not the mutex itself. It is the shared state from which
        the user-space protocol can infer what to do next.
      </p>
      <pre><code>atomic_compare_exchange(lock, 0, 1)

if it succeeds:
    enter critical section

otherwise:
    contention exists
    enter slow path</code></pre>
      <p>
        The failed compare-and-exchange does not necessarily mean “call the
        kernel”. A library can first decide whether a short spin is worthwhile,
        whether the state has changed, or whether the thread should sleep.
      </p>

      <h2>Why not just spin?</h2>
      <p>
        Spinning is not inherently bad. If the owner is running on another CPU
        and is about to release the lock, sleeping and waking may cost more
        than a handful of failed atomic operations.
      </p>
      <p>
        But if the owner is descheduled, or the critical section lasts longer
        than expected, the spinner can consume an entire CPU while making no
        useful progress.
      </p>
      <ul>
        <li><strong>Spin:</strong> low latency when ownership changes quickly, but consumes CPU.</li>
        <li><strong>Sleep:</strong> frees the CPU, but requires kernel work and a later wake-up.</li>
        <li><strong>Hybrid:</strong> spin briefly, then sleep if progress does not arrive.</li>
      </ul>
      <p>
        Production thread libraries can therefore have a fast path, adaptive
        spinning and a futex slow path. The futex is what makes a hybrid design
        possible.
      </p>

      <h2>The race that makes futexes interesting</h2>
      <p>
        Suppose thread A owns a lock and thread B wants it. B observes that the
        lock is busy and is about to sleep. Now imagine A releases the lock at
        exactly the wrong moment:
      </p>
      <pre><code>B: read lock = busy
B: decide to sleep
A: unlock
A: wake waiters
B: sleep</code></pre>
      <p>
        B could miss the wake-up completely. This is the classic lost-wakeup
        problem. A correct blocking primitive therefore needs more than “put
        this thread on a queue”.
      </p>
      <p>
        The crucial futex operation is effectively:
      </p>
      <pre><code>sleep only if the futex word still equals the expected value</code></pre>
      <p>
        Linux documents this as an atomic <strong>compare-and-block</strong>
        operation. The kernel checks the futex word against the expected value
        and, if it still matches, blocks the thread as one ordered operation.
        This closes the gap between observing “busy” and actually going to
        sleep.
      </p>

      <div className="diagram">
        <div><strong>load state</strong><small>Lock still appears busy</small></div>
        <div><strong>FUTEX_WAIT</strong><small>Expected value supplied</small></div>
        <div><strong>kernel checks</strong><small>Value must still match</small></div>
        <div><strong>sleep</strong><small>Only then does blocking occur</small></div>
      </div>

      <h2>The kernel does not permanently store every futex</h2>
      <p>
        Linux does not maintain a permanent kernel object for every futex word.
        If a mutex is never contended, the kernel may never see the futex at
        all. Even after contention, kernel-side bookkeeping is associated with
        waiting and waking rather than a permanent mutex object.
      </p>
      <pre><code>user memory

+-------------------+
| futex word        |
| lock state        |
+-------------------+
          |
          | FUTEX_WAIT
          v
kernel

+-------------------+
| waiter bookkeeping|
| scheduling state  |
+-------------------+

          |
          | FUTEX_WAKE
          v

user memory changes
and the waiter runs again</code></pre>
      <p>
        The kernel-side queue is therefore a temporary bridge between a
        user-space state machine and the scheduler.
      </p>

      <h2>What FUTEX_WAIT actually promises</h2>
      <p>
        At the syscall level, a waiter supplies an address and an expected
        value. If the value no longer matches, the wait does not happen. If it
        matches, the thread can block until a wake operation, signal or timeout
        ends the wait.
      </p>
      <p>
        That means user space must always re-check its condition after waking.
        A wake-up is not the same thing as “your lock is now available”.
      </p>
      <pre><code>while condition is false:
    futex_wait(word, observed_value)

continue only when condition is actually true</code></pre>
      <p>
        This is why condition variables are normally used in a loop rather than
        an <code>if</code>. A thread waking up means it should reconsider the
        predicate, not blindly proceed.
      </p>

      <h2>Wake-ups are hints, not ownership transfers</h2>
      <p>
        A futex wake does not magically transfer ownership of a mutex. It makes
        blocked threads runnable. They still compete to execute and then
        re-check the user-space state.
      </p>
      <p>
        A design that wakes many threads for one unit of work can create a
        <strong>thundering herd</strong>: multiple CPUs wake up, inspect the
        same state, and all but one discover that they lost the race.
      </p>
      <pre><code>one resource becomes available

        wake many
          / | \
         /  |  \
      T1   T2   T3
       |    |    |
       +----+----+
            |
       one succeeds
       others sleep again</code></pre>

      <h2>Futexes and memory ordering are different problems</h2>
      <p>
        A futex does not make ordinary loads and stores magically safe.
        Synchronisation has two related dimensions: atomicity and ordering.
        The futex syscall provides the blocking mechanism; the atomic operations
        and memory-ordering rules used by the lock implementation provide the
        visibility guarantees.
      </p>
      <pre><code>update protected state
release lock with appropriate memory ordering
wake a waiter if necessary</code></pre>
      <p>
        The ordering around the atomic release is what lets the next owner see
        the preceding critical section's writes. The wake operation is about
        scheduling progress, not about flushing arbitrary application state.
      </p>
      <div className="article__callout">
        <strong>Sharp edge:</strong> a futex is not a replacement for atomic
        memory-ordering semantics. It is the bridge from a user-space
        synchronisation protocol to kernel blocking.
      </div>

      <h2>How pthread mutexes fit on top</h2>
      <pre><code>pthread_mutex_lock()
        |
        +-- atomic fast path
        |
        +-- optional spinning
        |
        +-- futex wait
        |
        +-- scheduler

pthread_mutex_unlock()
        |
        +-- atomic release
        |
        +-- futex wake if contention exists</code></pre>
      <p>
        The exact implementation changes over time, but this architecture
        explains why a mutex can be cheap in a quiet application and expensive
        under contention. The first case mostly exercises atomic instructions
        and cache coherence. The second can involve cache-line bouncing, kernel
        entry, scheduling and wake-up latency.
      </p>

      <h2>Contention is often a cache-coherency problem first</h2>
      <p>
        Before the kernel becomes interesting, modern CPUs have already made
        your lock a distributed system of sorts. An atomic update to a shared
        lock word requires cache-coherence machinery to establish ownership of
        the relevant cache line. If many cores repeatedly modify the same word,
        that cache line can bounce between cores.
      </p>
      <pre><code>CPU 0              CPU 1              CPU 2

lock cache line
   |                   |                  |
   +-------------------+------------------+
                       |
                 coherence traffic
                       |
                 shared lock word</code></pre>
      <p>
        Once a thread is sleeping, it stops hammering that cache line and stops
        consuming CPU. A good mutex implementation therefore tries to avoid
        both pathological spinning and unnecessary kernel transitions.
      </p>

      <h2>A practical experiment: see the slow path</h2>
      <p>
        Create several threads that repeatedly take the same mutex and hold it
        for a short interval. Run the program once with a single worker and
        then with many workers. The logical operation is identical, but the
        synchronisation path changes dramatically.
      </p>
      <pre><code>shared counter = 0
shared mutex

worker:
    repeat many times:
        lock(mutex)
        counter = counter + 1
        short delay
        unlock(mutex)</code></pre>
      <p>
        On Linux, <code>strace -f</code> can expose futex-related system calls.
        You can also use <code>perf</code> to inspect scheduling and CPU
        behaviour.
      </p>
      <pre><code>strace -f -e trace=futex ./mutex-test

perf stat -e context-switches,cpu-migrations ./mutex-test</code></pre>
      <p>
        Do not interpret the number of futex syscalls as “the cost of locking”.
        An uncontended lock can perform no futex syscall at all. You are
        observing evidence that the workload crossed from the optimistic
        user-space path into the blocking path.
      </p>

      <h2>Priority inversion changes the problem</h2>
      <p>
        Imagine a high-priority thread waiting for a lock held by a low-priority
        thread while a medium-priority thread keeps consuming CPU. The low
        priority owner cannot run to release the lock, so the high-priority
        thread is indirectly delayed by the medium-priority workload.
      </p>
      <p>
        Linux supports priority-inheritance futex operations for real-time
        scheduling requirements. The fast path can remain in user space, while
        kernel priority-inheritance machinery appears when the contended
        slow path requires it.
      </p>
      <pre><code>high priority     H
medium priority   M
low priority      L

L owns lock
H needs lock and blocks
M keeps running
L cannot run to release it</code></pre>

      <h2>Robust futexes: what if the owner dies?</h2>
      <p>
        If a thread terminates while holding a lock, another waiter needs a way
        to discover that the owner disappeared. Linux has a robust-futex
        mechanism in which a thread can register a user-space list of locks it
        may be holding. At thread exit, the kernel can assist in marking
        relevant state so another waiter can detect owner death.
      </p>
      <p>
        Again, the kernel is not continuously tracking every lock acquisition.
        The application maintains useful information in user space, and the
        kernel provides a small amount of exit-time assistance.
      </p>

      <h2>Futexes are useful beyond mutexes</h2>
      <p>
        Once you have a shared atomic state word, a way to wait if that word
        still has an expected value, and a way to wake waiters after changing
        the state, you can construct many higher-level protocols.
      </p>
      <p>
        A condition variable can wait for an application predicate such as
        “queue not empty” or “shutdown requested”. Semaphores can represent
        available units of a resource. Barriers can represent a count of
        participants reaching a rendezvous.
      </p>
      <p>
        This is why the primitive is deliberately small: policy stays above the
        kernel boundary.
      </p>

      <h2>Waiting on multiple futexes</h2>
      <p>
        The original futex interface is centred on one futex word. Linux's
        newer futex2 work includes <code>futex_waitv()</code>, which accepts an
        array of wait descriptions so a thread can wait on multiple locations.
        The kernel documentation describes it as a follow-up interface intended
        to address limitations of the original futex API.
      </p>
      <p>
        There is also an interesting connection to <code>io_uring</code>:
        recent interfaces can prepare futex waits and wakes as asynchronous
        operations, allowing low-level synchronisation to participate in
        event-driven designs.
      </p>

      <h2>False sharing can manufacture contention</h2>
      <p>
        Two independent locks can sit next to each other in memory. Threads
        using them independently can still cause cache-line traffic if the
        locks share a cache line.
      </p>
      <pre><code>cache line
+---------------------------------------+
| lock A | counters | lock B | flags    |
+---------------------------------------+</code></pre>
      <p>
        This gives a useful three-layer performance model:
      </p>
      <ol>
        <li><strong>Memory hierarchy:</strong> is shared state causing cache-line traffic?</li>
        <li><strong>User-space synchronisation:</strong> are atomic operations contended?</li>
        <li><strong>Kernel scheduling:</strong> are threads actually sleeping and waking?</li>
      </ol>
      <p>
        Optimising only the third layer can miss the real bottleneck entirely.
      </p>

      <h2>Critical sections matter more than mutex brand</h2>
      <pre><code>lock
    update shared state
    format a string
    log to disk
    call another service
unlock</code></pre>
      <p>
        The mutex is now serialising operations that have little reason to be
        mutually exclusive. A better design may update shared state under the
        lock, copy the minimum information needed, unlock, and perform external
        work afterwards.
      </p>
      <p>
        The futex machinery is doing its job in both cases. The second design
        simply gives it a much easier workload.
      </p>

      <h2>Connection to distributed systems</h2>
      <p>
        Futexes are local, but the design principle scales surprisingly well.
        In both local and distributed coordination, it is useful to separate
        state from the mechanism used to wait for a state transition.
      </p>
      <pre><code>local:

shared word
    |
    +-- atomic transition
    |
    +-- sleep if unchanged

distributed:

shared service state
    |
    +-- conditional update
    |
    +-- wait for notification / retry</code></pre>
      <p>
        The durable truth is the state itself, not the notification. A wake-up
        can arrive when another consumer has already changed the state. This is
        the same reason robust condition-variable code waits in a loop.
      </p>

      <h2>Common misconceptions</h2>
      <ul>
        <li><strong>“A mutex is a kernel object.”</strong> Not necessarily; the uncontended path can remain entirely in user space.</li>
        <li><strong>“Every lock acquisition is a syscall.”</strong> The futex design exists largely to avoid that in the common case.</li>
        <li><strong>“FUTEX_WAKE gives the lock to a waiter.”</strong> It makes blocked threads runnable; ownership is decided by the higher-level protocol.</li>
        <li><strong>“A wake means the condition is true.”</strong> The condition must be checked again.</li>
        <li><strong>“More threads means more throughput.”</strong> A shared critical section can become the serial bottleneck.</li>
        <li><strong>“Futex contention means Linux is slow.”</strong> Often it means the application has created a highly contended shared state transition.</li>
      </ul>

      <h2>A practical debugging workflow</h2>
      <pre><code>1. Identify the shared resource.
2. Measure lock acquisition and wait time.
3. Find the hottest critical sections.
4. Check CPU utilisation and run-queue pressure.
5. Profile for futex wait/wake activity.
6. Inspect context switches and migrations.
7. Check for false sharing and cache contention.
8. Decide whether the lock, data structure, or workload is the problem.</code></pre>
      <p>
        Tools such as <code>perf</code>, thread-aware profilers and tracing
        systems can establish whether time is being spent executing, spinning,
        sleeping or being woken. That distinction is much more useful than
        simply seeing “mutex contention” in a profile.
      </p>

      <h2>The deeper design lesson</h2>
      <p>
        Futexes are a beautiful example of an operating-system interface that
        does very little — and therefore enables a lot. The kernel does not
        attempt to understand every application's locking protocol. It provides
        a general mechanism for testing shared state while deciding whether to
        block, associating blocked threads with a memory location, and waking
        them when progress is possible.
      </p>
      <p>
        Everything above that boundary can be specialised. A runtime can build
        mutexes. A standard library can build condition variables. A real-time
        system can add priority inheritance. A language runtime can choose its
        own state encoding and spinning policy.
      </p>
      <p>
        This is a recurring operating-system design pattern: make the kernel
        primitive sufficiently general that policy remains in user space.
      </p>

      <h2>Takeaway</h2>
      <p>
        A Linux mutex is not fundamentally a kernel lock. It is a user-space
        state machine with a kernel-assisted escape hatch for blocking.
      </p>
      <p>
        The uncontended path is shared memory and atomic instructions. When
        contention makes spinning wasteful, a futex lets a thread say “sleep
        only if the state I observed is still true”. Another thread changes the
        state and asks the kernel to wake waiters. The scheduler turns that
        state transition into actual CPU time.
      </p>
      <div className="article__callout">
        <strong>The mental model to keep:</strong> user space owns the
        synchronisation state; the kernel owns the sleeping threads. A futex is
        the narrow bridge between the two.
      </div>
    </ArticleLayout>
  );
}
