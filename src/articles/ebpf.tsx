import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'ebpf',
  title: 'eBPF: A Tiny Virtual Machine Inside the Kernel',
  subtitle: 'How safe, event-driven kernel programs changed observability, networking and security.',
  category: 'Operating Systems / Observability',
  description: 'A deep dive into eBPF: bytecode verification, hooks, maps, tail calls, performance trade-offs and practical developer use cases.',
};

export function EbpfArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        eBPF is often described as “JavaScript for the kernel”. That is catchy, but misleading. It is closer to a constrained, verified virtual machine whose programs can be attached to carefully chosen kernel and user-space events. The result is a new design point between static instrumentation and heavyweight kernel modules: you can add behaviour at runtime without rebuilding the kernel or shipping a bespoke agent everywhere.
      </p>

      <h2>Why this is unusual</h2>
      <p>
        Traditional kernel extensions are powerful but dangerous: a bug can crash the host, corrupt memory or create a security boundary failure. User-space tracing is safer but often too late. eBPF sits in the middle. Programs are loaded dynamically, passed through a verifier, and executed in a sandboxed environment. They can inspect event context, maintain state in maps, emit records to user space and, in selected hook types, influence what the kernel does next.
      </p>

      <h2>The execution model</h2>
      <p>
        An eBPF toolchain usually has three layers: a compiler that emits BPF bytecode, the kernel verifier that proves the program is safe, and a runtime path that attaches the program to a hook. Modern deployments commonly compile C, Rust or a higher-level language into BPF, then use a loader to call the bpf() system call.
      </p>

      <ol>
        <li><strong>Compile:</strong> source code becomes a small instruction set with explicit registers and bounded control flow.</li>
        <li><strong>Verify:</strong> the kernel tracks possible register values, pointer types, stack bounds and loop behaviour.</li>
        <li><strong>Attach:</strong> the program is connected to a tracepoint, kprobe, fentry hook, socket hook, XDP path, cgroup hook or another supported event.</li>
        <li><strong>Run:</strong> on each event, the kernel executes the program and updates maps or emits data.</li>
      </ol>

      <h2>What the verifier is really doing</h2>
      <p>
        The verifier is not a conventional unit-test runner. It performs a form of abstract interpretation: instead of executing one concrete input, it explores the states the program could reach. It asks questions such as: can this pointer ever be invalid, can this loop run forever, can a helper receive an untrusted length, and can a stack slot be read before it is initialised?
      </p>
      <p>
        This explains two common surprises. First, a program can be logically correct yet rejected because the verifier cannot prove its safety. Second, “small” source changes can dramatically change verifier complexity because they create more possible states. In practice, eBPF development is partly programming and partly writing code that is easy for a static proof engine to understand.
      </p>

      <h2>Hooks: where the program runs matters</h2>
      <p>
        The same idea behaves very differently depending on its attachment point. A tracepoint is relatively stable and gives you a predefined event structure. A kprobe can observe a kernel function but is more coupled to implementation details. fentry/fexit hooks are generally faster and more type-aware where available. XDP runs very early in packet processing, often before the normal network stack, which is why it is attractive for DDoS filtering and high-rate packet processing.
      </p>
      <p>
        A useful mental model is to treat hook choice as part of your performance budget. Early hooks see more traffic and have less context. Later hooks see richer state but cost more CPU and may arrive after the expensive work has already happened.
      </p>

      <h2>Maps: the shared memory of eBPF</h2>
      <p>
        eBPF programs are intentionally small and short-lived. Persistent state lives in maps: kernel-managed data structures that can be accessed by BPF programs and user-space processes. Common varieties include hash maps, per-CPU maps, ring buffers, LRU maps and longest-prefix-match tries.
      </p>
      <pre>
        <code>{`// Pseudocode: count failed opens by process ID
on_sys_enter_openat(ctx) {
  if (ctx.flags & O_WRONLY) {
    key = current_pid();
    counts[key] = counts.lookup_or_init(key, 0) + 1;
  }
}`}</code>
      </pre>
      <p>
        Per-CPU maps are an important optimisation. Instead of contending on one shared counter, each CPU updates its own slot and user space aggregates the results later. This is a recurring systems pattern: accept slightly more complicated reads to avoid synchronisation in the hottest write path.
      </p>

      <h2>Helpers, tail calls and bounded composition</h2>
      <p>
        eBPF programs cannot call arbitrary kernel functions. They use a curated set of helper functions, such as reading process metadata, looking up map values, redirecting packets or emitting events. The helper boundary is a security boundary and an API compatibility boundary.
      </p>
      <p>
        Tail calls provide a form of dynamic dispatch: one BPF program can jump to another program from a program array without returning. This lets you split logic into modules while avoiding a huge monolithic program. It is useful for policy engines and protocol parsers, but it also creates operational sharp edges: the program graph is now part of your runtime configuration, and a missing or stale slot can change behaviour without any source code changing.
      </p>

      <h2>A practical experiment</h2>
      <p>
        A good first experiment is to observe process execution and compare event rates with and without filtering in the kernel. The important lesson is not the command itself; it is where the filtering happens.
      </p>
      <pre>
        <code>{`// Conceptual flow
kernel hook -> filter only /usr/bin/node -> ring buffer -> user-space formatter

// Less efficient alternative
kernel hook -> send every exec event -> user space filters -> formatter`}</code>
      </pre>
      <p>
        If a host launches thousands of short-lived processes, pushing every event across the kernel/user boundary can dominate the cost of the actual observation. eBPF lets you move the cheap predicate closer to the source and reserve user space for aggregation, enrichment and presentation.
      </p>

      <h2>Why observability systems care</h2>
      <p>
        eBPF enables low-overhead signals that are difficult to obtain from application code alone: scheduler latency, file I/O, TCP retransmits, run-queue pressure, syscall patterns and container boundary behaviour. That makes it useful for finding “unknown unknowns” where the application team did not add the right metric in advance.
      </p>
      <p>
        The trade-off is that kernel-level visibility can tempt teams to collect everything. High-cardinality labels, stack traces and per-request events can create their own incident through CPU, memory or telemetry volume. Good eBPF design looks like good distributed tracing design: define the question first, then choose the smallest signal that answers it.
      </p>

      <h2>Security implications</h2>
      <p>
        eBPF expands the kernel's programmable surface, so production policy matters. Restrict who can load programs, audit capabilities, understand which hooks are enabled, and treat BPF objects as deployable code rather than harmless diagnostics. The verifier reduces memory-safety risk, but it does not make every program semantically safe. A program can be perfectly verified and still create a denial of service, leak sensitive metadata or enforce the wrong policy.
      </p>

      <h2>Sharp edges and misconceptions</h2>
      <ul>
        <li><strong>“eBPF is always faster”:</strong> not necessarily. A badly designed program, excessive map lookups or heavy event export can be slower than a targeted user-space probe.</li>
        <li><strong>“The kernel ABI is stable everywhere”:</strong> hook availability, helper sets and type information vary by kernel version and distribution.</li>
        <li><strong>“The verifier proves business correctness”:</strong> it proves a limited safety model, not that your counters, policies or aggregation logic are correct.</li>
        <li><strong>“One program can do everything”:</strong> large programs become difficult to verify, debug and operate. Composition, sampling and aggregation are usually better.</li>
      </ul>

      <h2>Connections to everyday software architecture</h2>
      <p>
        eBPF is a compact lesson in several broader ideas: capability-based APIs, proof-carrying code, data-plane versus control-plane separation, per-CPU sharding, and moving computation to where the data is produced. The same trade-offs appear in database triggers, stream processors, service meshes and edge functions.
      </p>

      <div className="article__callout">
        <strong>Takeaway:</strong> eBPF is powerful because it lets you add narrowly scoped, dynamically loaded behaviour close to the kernel’s event sources while retaining a strong safety boundary. The engineering challenge is not just writing the program; it is choosing the right hook, limiting the signal, and designing the user-space control plane around the cost model.
      </div>
    </ArticleLayout>
  );
}
