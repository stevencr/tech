import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'cgroup-v2-resource-pressure',
  title: 'Your Container Isn’t Slow; It’s Being Throttled',
  subtitle: 'A practical tour of cgroup v2: CPU quotas, memory reclaim, pressure stall information, and the kernel counters that explain why a healthy-looking container can have terrible latency.',
  category: 'Linux and Containers',
  description: 'Understand Linux cgroup v2 resource control beneath Docker and Kubernetes, including CPU bandwidth throttling, memory.high versus memory.max, PSI, and production diagnostics.',
  date: '2026-10-24',
  readingTime: 22,
  tags: ['Linux', 'Containers', 'Docker', 'Kubernetes', 'Performance', 'Observability', 'cgroups'],
};

const examples = {
  locate: [
    'cat /proc/self/cgroup',
    'mount | grep cgroup2',
    'cat /sys/fs/cgroup/cgroup.controllers',
    'cat /sys/fs/cgroup/cpu.max',
    'cat /sys/fs/cgroup/cpu.stat',
    'cat /sys/fs/cgroup/memory.current',
    'cat /sys/fs/cgroup/memory.events',
  ].join('\n'),
  cpu: [
    '# cpu.max: quota in microseconds, then period in microseconds',
    'cat /sys/fs/cgroup/cpu.max',
    '50000 100000',
    '',
    '# Counters accumulate while the cgroup runs',
    'cat /sys/fs/cgroup/cpu.stat',
    'usage_usec 18340021',
    'user_usec 14210000',
    'system_usec 4130021',
    'nr_periods 2400',
    'nr_throttled 1170',
    'throttled_usec 82900000',
  ].join('\n'),
  pressure: [
    'cat /sys/fs/cgroup/cpu.pressure',
    'some avg10=18.20 avg60=11.40 avg300=5.90 total=8300400',
    '',
    'cat /sys/fs/cgroup/memory.pressure',
    'some avg10=7.10 avg60=3.20 avg300=1.00 total=1200440',
    'full avg10=0.80 avg60=0.30 avg300=0.10 total=101200',
  ].join('\n'),
  memory: [
    'cat /sys/fs/cgroup/memory.current',
    'cat /sys/fs/cgroup/memory.high',
    'cat /sys/fs/cgroup/memory.max',
    'cat /sys/fs/cgroup/memory.events',
    '',
    'cat /sys/fs/cgroup/memory.stat | grep -E "^(anon|file|kernel|sock|slab) "',
    'cat /sys/fs/cgroup/memory.pressure',
  ].join('\n'),
  docker: [
    'docker run --rm --cpus=0.5 --memory=512m alpine:3.20 sh',
    '',
    '# From inside the container, if cgroup v2 is mounted at the usual path:',
    'cat /sys/fs/cgroup/cpu.max',
    'cat /sys/fs/cgroup/cpu.stat',
    'cat /sys/fs/cgroup/memory.current',
    'cat /sys/fs/cgroup/memory.max',
    'cat /sys/fs/cgroup/memory.events',
  ].join('\n'),
};

export function CgroupV2ResourcePressureArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        A service is reporting 40% CPU utilisation, its container has not been
        killed, and the host still has spare capacity. Yet p99 latency has
        doubled. The obvious dashboards say the machine is healthy. The kernel
        says something more precise: the workload is repeatedly being denied
        resources it is allowed to request, or spending time reclaiming memory
        to stay inside a boundary.
      </p>

      <p>
        This is one of the most useful things to understand about Linux
        containers: a resource limit is not just a number that gets checked at
        startup. It changes how the kernel schedules tasks, reclaims pages,
        accounts memory, and sometimes decides which process should die. Those
        mechanisms can create latency long before they create a clean failure.
      </p>

      <p>
        The interface behind much of this behaviour is <strong>control groups
        (cgroups)</strong>. Docker, container runtimes and Kubernetes configure
        cgroups; the Linux kernel enforces them. On modern systems, cgroup v2
        exposes a particularly useful set of files for understanding what the
        workload is experiencing, not merely how much CPU or memory it has used.
      </p>

      <div className="diagram">
        <div><strong>Policy</strong><small>Docker or Kubernetes sets requests and limits</small></div>
        <div><strong>cgroup v2</strong><small>Kernel controllers account and constrain resources</small></div>
        <div><strong>Pressure</strong><small>Tasks wait, throttle, or reclaim memory</small></div>
        <div><strong>Evidence</strong><small>cpu.stat, memory.events and PSI expose the cost</small></div>
      </div>

      <h2>A container is not a small virtual machine</h2>

      <p>
        Namespaces change what a process can see: process IDs, mounts, network
        interfaces and other views of the system. Cgroups answer a different
        question: which tasks belong to a resource-accounting group, and what
        limits or priorities apply to that group? They are complementary
        mechanisms, not two names for the same isolation feature.
      </p>

      <p>
        A cgroup is a node in a hierarchy. Controllers can account or regulate
        CPU, memory, I/O and other resources at different levels. A child is
        constrained by its own settings and by relevant ancestor constraints.
        This matters in production because the container may not be the only
        boundary: a pod, a service slice, a systemd unit, or the parent of a
        whole workload can impose a tighter limit.
      </p>

      <p>
        With cgroup v2, controllers are generally exposed as files in a unified
        cgroup filesystem. These are not ordinary configuration files backed
        by a daemon that periodically polls them. Reading a file gives a kernel
        view of accounting or policy; writing a supported control file changes
        the policy enforced by the kernel. Permissions and delegation rules
        determine who is allowed to make those changes.
      </p>

      <h2>CPU: a quota is a budget, not a dedicated core</h2>

      <p>
        The CPU controller exposes two controls that are easy to confuse:
        <code>cpu.weight</code> and <code>cpu.max</code>. Weight is a relative
        preference when sibling cgroups compete for CPU time. A higher weight
        means a larger share of the available time under contention; it does
        not reserve that share when nobody else needs it. Quota is a bandwidth
        ceiling. It can throttle a group even when the host has idle CPU capacity.
      </p>

      <p>
        The v2 <code>cpu.max</code> file contains a quota and a period, both in
        microseconds. For example, <code>50000 100000</code> allows the group to
        consume 50,000 microseconds of aggregate CPU time in each 100,000
        microsecond period. That is half a CPU worth of time on average. It is
        not a promise that one particular core will be available for half of
        every millisecond, nor does it reserve a physical core for the group.
      </p>

      <pre><code>{examples.cpu}</code></pre>

      <p>
        Now consider a multithreaded service with four runnable workers. If they
        run in parallel on four cores, they can spend the 50 ms aggregate budget
        in about 12.5 ms of wall-clock time. Once the quota is exhausted, the
        scheduler throttles the cgroup until its bandwidth becomes available
        again. The machine can have plenty of idle capacity during that pause:
        this group has exhausted its budget, not the host's physical CPU supply.
      </p>

      <p>
        That is why a CPU limit can turn a bursty request into a sawtooth of
        progress and waiting. A short burst of parsing, garbage collection,
        compression or cryptography can use the budget early in the period.
        Requests arriving just after the group is throttled wait for the next
        replenishment even if the host looks under-utilised. The exact latency
        pattern depends on period, concurrency, runtime scheduling and the
        shape of the work, but the basic failure mode is deterministic.
      </p>

      <h3>Read the counters, not just the percentage</h3>

      <p>
        The <code>cpu.stat</code> file includes cumulative usage and bandwidth
        counters. In particular, <code>nr_periods</code> counts enforcement
        periods, <code>nr_throttled</code> counts periods in which the group was
        throttled, and <code>throttled_usec</code> reports throttling time. These
        are counters, so compare samples over a time interval rather than
        interpreting a single lifetime total as a rate.
      </p>

      <p>
        A rising throttled-period ratio alongside a p99 latency regression is a
        strong clue, not proof by itself. Check whether the limit is intentional,
        whether the workload has many runnable threads, and whether a parent
        cgroup is also limiting it. Do not conclude that a service needs more
        CPU solely because its average utilisation is high—or that it does not
        need more CPU because the host has idle cores.
      </p>

      <h2>Memory: crossing the limit can hurt before it kills</h2>

      <p>
        Memory control is more subtle because memory is reclaimable and stateful.
        The cgroup's <code>memory.current</code> is not simply the sum of the
        RSS numbers shown by a process monitor. Cgroup accounting includes
        anonymous memory and page cache, as well as relevant kernel memory such
        as socket buffers and filesystem metadata. Shared pages also make
        per-process accounting and cgroup accounting answer different questions.
      </p>

      <p>
        The important v2 distinction is between <code>memory.high</code> and
        <code>memory.max</code>. Treating them as interchangeable misses a
        useful control loop.
      </p>

      <ul>
        <li><strong><code>memory.high</code></strong> is a pressure boundary. When usage exceeds it, tasks are throttled and pushed into heavy reclaim work. It is the mechanism intended to make excess memory use expensive before the system reaches an OOM event.</li>
        <li><strong><code>memory.max</code></strong> is the hard backstop. If usage cannot be reclaimed enough to satisfy it, allocation can enter the cgroup out-of-memory path and a process may be killed. Some usage can temporarily exceed the configured value under specific conditions.</li>
      </ul>

      <pre><code>{examples.memory}</code></pre>

      <p>
        Reclaim is work. The kernel may discard clean file-backed cache and
        fetch it again later, write dirty pages, or move reclaimable pages out
        of active use. If the allocating task must perform reclaim itself, the
        allocation path can stall directly. If the working set is genuinely
        larger than the available budget, the system can repeatedly evict
        pages that the workload immediately needs again. The result is a
        feedback loop: memory pressure causes latency, latency increases work
        in flight, and more in-flight work can retain still more memory.
      </p>

      <p>
        This is why a container can look alive and remain below its hard memory
        limit while requests become slow. Crossing <code>memory.high</code> is
        not necessarily an OOM event. It is a signal that the kernel is trying
        to keep the workload within its budget by making memory expensive to
        use. Raising <code>memory.max</code> alone may postpone a kill without
        addressing the reclaim churn that is already damaging latency.
      </p>

      <h3>Memory events tell you what kind of boundary was hit</h3>

      <p>
        The <code>memory.events</code> file reports counters such as
        <code>high</code>, <code>max</code>, <code>oom</code> and
        <code>oom_kill</code>. A rising <code>high</code> counter indicates
        throttling and direct reclaim associated with the high boundary. Rising
        <code>max</code> events indicate that usage was about to exceed the hard
        limit. OOM counters help distinguish pressure from an actual kill path.
        The exact set of fields depends on kernel support, so inspect the files
        available on the host you are diagnosing.
      </p>

      <p>
        Pair those counters with <code>memory.stat</code> rather than guessing
        from one number. A large <code>anon</code> value suggests a different
        investigation from a large <code>file</code> value; <code>sock</code>
        can reveal network-buffer contributions. The answer may be a heap leak,
        excessive buffering, a cache with poor eviction, too much concurrency,
        or simply a limit set below the application's real working set.
      </p>

      <h2>PSI: measure lost progress, not just resource consumption</h2>

      <p>
        CPU usage, memory usage and I/O throughput describe what resources are
        consumed. They do not directly tell you how much useful work was delayed
        because resources were unavailable. Linux <strong>Pressure Stall
        Information (PSI)</strong> attempts to measure that impact. The kernel
        exports system-wide files under <code>/proc/pressure</code> and, when
        enabled, per-cgroup files such as <code>cpu.pressure</code>,
        <code>memory.pressure</code> and <code>io.pressure</code>.
      </p>

      <p>
        PSI lines include rolling averages over 10, 60 and 300 seconds, plus a
        cumulative stall-time counter. The <code>some</code> line represents
        time when at least some non-idle tasks are stalled on that resource.
        <code>full</code> captures periods when all non-idle tasks are stalled
        simultaneously; sustained full pressure is especially useful evidence
        of severe memory or I/O thrashing. CPU full-pressure semantics have
        kernel-version and scope caveats, so do not treat that field as a
        universal CPU-saturation metric.
      </p>

      <pre><code>{examples.pressure}</code></pre>

      <p>
        PSI is useful because it connects resource scarcity to user-visible
        consequences. High CPU usage with little CPU pressure can mean the work
        is running efficiently. Moderate usage with rising CPU pressure can
        mean runnable tasks are waiting for scheduling time. Memory pressure
        can rise while the process is still alive and its RSS looks stable.
        I/O pressure can explain why threads are not making progress even when
        CPU utilisation is low.
      </p>

      <p>
        For alerting, trend PSI alongside latency and throughput rather than
        creating an alert on a single lifetime counter. The averages are useful
        for sustained pressure; the cumulative <code>total</code> value lets you
        calculate stall-time deltas for a short incident window. On kernels that
        support PSI triggers, userspace can also register thresholds and wait
        on a file descriptor, enabling a controller to react to pressure rather
        than polling resource usage alone.
      </p>

      <h2>A small investigation you can run today</h2>

      <p>
        First establish that the host uses cgroup v2 and find the process's
        cgroup membership. The exact path and permissions depend on whether
        the container runtime uses a private cgroup namespace and how the
        hierarchy is mounted. On a common setup, the following commands work
        inside the container; on the host, inspect the corresponding cgroup
        directory if those files are not visible.
      </p>

      <pre><code>{examples.locate}</code></pre>

      <p>
        The values shown in the earlier CPU example are illustrative, not
        output to expect from every machine. Take two samples of
        <code>cpu.stat</code> several seconds apart while the service is slow.
        If <code>nr_throttled</code> and <code>throttled_usec</code> climb
        quickly, investigate CPU bandwidth and parent limits. If the CPU
        pressure file is also rising, you have evidence that the limit is
        affecting runnable work rather than merely existing in configuration.
      </p>

      <pre><code>{examples.docker}</code></pre>

      <p>
        That container starts an interactive shell with a half-CPU quota and a
        512 MiB memory limit. It is a safe place to inspect the exposed cgroup
        files, but it does not by itself create a representative load test.
        For a controlled experiment, run a repeatable CPU-bound workload with
        several workers, compare latency with and without the quota, and sample
        the counters before and after. Keep the host, concurrency and workload
        constant; otherwise the experiment changes too many variables at once.
      </p>

      <p>
        For memory, compare <code>memory.current</code>,
        <code>memory.events</code>, <code>memory.stat</code> and
        <code>memory.pressure</code> during the same interval. A rising
        <code>high</code> counter with memory pressure points toward reclaim
        around the high boundary. A rising OOM-kill counter is a different
        failure. If memory use is dominated by file cache, test whether the
        workload can tolerate a smaller cache; if anonymous memory dominates,
        inspect heap growth and in-flight request counts.
      </p>

      <h2>What Kubernetes changes—and what it does not</h2>

      <p>
        Kubernetes adds scheduling policy and an API on top of the kernel's
        enforcement. A CPU request is primarily an input to placement and
        resource-sharing decisions; a CPU limit is commonly enforced through
        cgroup CPU bandwidth control. A memory request influences scheduling,
        while a memory limit configures the boundary that can lead to a cgroup
        OOM event. Exact behaviour depends on the node's kernel, cgroup version,
        kubelet configuration, runtime and Kubernetes release.
      </p>

      <p>
        This distinction explains a familiar surprise: a pod may be scheduled
        onto a node with enough requested capacity, yet its process can still
        be throttled at runtime by its CPU limit. Conversely, a pod without a
        CPU limit can use spare CPU capacity but compete with other workloads.
        Neither policy is universally right. Limits improve isolation and
        predictability, but tight quotas can harm bursty latency-sensitive
        services; no limits can let one workload dominate a noisy node.
      </p>

      <p>
        For latency-sensitive services, measure before changing policy. Compare
        throttling counters with request latency, and test realistic bursts and
        concurrency rather than only a steady-state average. For memory, a
        limit should account for the actual working set and a deliberate safety
        margin, not just the average heap. Kubernetes restarts and OOM status
        tell you that a failure occurred; cgroup counters and PSI can help show
        the pressure that preceded it.
      </p>

      <h2>Common misconceptions worth deleting from the runbook</h2>

      <ul>
        <li><strong>“The host has spare CPU, so CPU cannot be the bottleneck.”</strong> A cgroup can exhaust its own quota while the host remains idle.</li>
        <li><strong>“CPU weight is a reservation.”</strong> It is a relative share under contention, not a guaranteed number of cores.</li>
        <li><strong>“Memory usage is just process RSS.”</strong> Cgroup accounting includes other charged memory categories, and shared pages complicate comparisons.</li>
        <li><strong>“Memory limits only matter when the process is killed.”</strong> Reclaim and throttling can degrade latency well before OOM.</li>
        <li><strong>“A high resource percentage proves pressure.”</strong> Consumption and stalled progress are different signals; correlate usage with PSI and application latency.</li>
        <li><strong>“The container is the only relevant boundary.”</strong> Ancestor cgroups and node-level contention can shape the effective behaviour.</li>
      </ul>

      <h2>A practical production checklist</h2>

      <ol>
        <li>Confirm cgroup version and inspect the effective cgroup path instead of assuming every runtime mounts it identically.</li>
        <li>For CPU, sample <code>cpu.max</code>, <code>cpu.weight</code>, <code>cpu.stat</code> and <code>cpu.pressure</code>; inspect ancestors if throttling does not match the container's own limit.</li>
        <li>For memory, sample <code>memory.current</code>, <code>memory.high</code>, <code>memory.max</code>, <code>memory.events</code>, <code>memory.stat</code> and <code>memory.pressure</code>.</li>
        <li>Compare counter deltas with p95/p99 latency, throughput, concurrency and restart/OOM events over the same time window.</li>
        <li>Change one policy at a time and rerun the same workload. A higher limit can hide the symptom while moving contention to a parent cgroup or the host.</li>
      </ol>

      <p>
        The useful mental shift is to stop treating a container limit as a
        static ceiling and start treating it as a kernel policy with observable
        side effects. CPU quotas control how much runnable work can execute over
        time. Memory boundaries influence when reclaim becomes expensive and
        when allocations can fail. PSI reports part of the resulting loss of
        progress. Those three views—policy, accounting and pressure—often tell a
        much more accurate story than a dashboard full of percentages.
      </p>

      <div className="article__callout">
        <strong>Takeaway:</strong> When a container is slow but not obviously
        saturated, inspect the cgroup. The kernel may be enforcing a local
        budget, reclaiming pages, or making tasks wait. Read the counters as
        time-series, correlate them with application latency, and tune the
        boundary that is actually causing lost progress.
      </div>

      <h2>Further reading</h2>

      <ul>
        <li><a href="https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html">Linux kernel documentation: Control Group v2</a> — the authoritative reference for controller files and their semantics.</li>
        <li><a href="https://docs.docker.com/engine/containers/resource_constraints/">Docker documentation: Resource constraints</a> — how Docker flags map to CPU and memory controls.</li>
        <li><a href="https://docs.docker.com/engine/containers/run/">Docker documentation: Running containers</a> — examples for CPU period, quota and cpuset constraints.</li>
        <li><a href="https://www.kernel.org/doc/html/latest/accounting/psi.html">Linux kernel documentation: Pressure Stall Information</a> — PSI fields, interpretation and trigger interfaces.</li>
      </ul>
    </ArticleLayout>
  );
}
