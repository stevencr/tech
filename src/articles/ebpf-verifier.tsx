import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'ebpf-verifier',
  title: 'The eBPF Verifier: A Tiny Proof System Inside the Linux Kernel',
  subtitle: 'How Linux decides whether untrusted bytecode is safe to run in kernel context — and why the verifier behaves more like a static analyser than a conventional validator.',
  category: 'Linux Internals',
  description: 'A deep dive into eBPF verification: abstract interpretation, register and stack state, helper contracts, bounded loops, pointer types, maps, and the engineering trade-offs behind safe programmable kernel execution.',
  date: '2026-09-29',
  readingTime: 26,
  tags: ['Linux', 'eBPF', 'Kernel', 'Static Analysis', 'Security', 'Observability'],
};

export function EbpfVerifierArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        eBPF is often introduced as “a way to run small programs in the Linux
        kernel”. That description is useful, but it hides the difficult part:
        <strong> why is Linux willing to run code supplied by an ordinary
        process inside privileged kernel context at all?</strong>
      </p>

      <p>
        The answer is not that eBPF programs are trusted. They are not. Before
        a program is accepted, the kernel's verifier performs a form of
        <strong> abstract interpretation</strong>. It explores what the program
        could do, tracks the possible type and value of registers and stack
        locations, checks pointer arithmetic, follows branches, validates helper
        calls, and rejects programs whose safety cannot be proven.
      </p>

      <p>
        That makes the verifier one of the most interesting pieces of systems
        engineering in Linux. It is simultaneously a security boundary, a
        compiler-like analysis engine, a type system, and a practical
        compromise between mathematical conservatism and the need to run useful
        programs at kernel speed.
      </p>

      <h2>The mental model: eBPF is not “kernel JavaScript”</h2>

      <p>
        An eBPF program is bytecode for a small virtual instruction set. A
        userspace process can construct or load a program, but loading it is a
        privileged operation subject to Linux's security policy. The verifier
        then analyses the program before the kernel will attach it to a hook.
      </p>

      <pre><code>userspace program
      |
      | bpf(BPF_PROG_LOAD, ...)
      v
+----------------------+
| eBPF verifier         |
|                      |
| control-flow analysis |
| register state        |
| pointer/type tracking |
| bounds analysis       |
| helper contracts      |
+----------------------+
      |
      | accepted
      v
JIT compiler / interpreter
      |
      v
kernel execution context</code></pre>

      <p>
        The critical ordering is important. The JIT compiler is not the security
        mechanism. The verifier establishes the safety properties first; only
        then can the program be interpreted or compiled to native machine code.
      </p>

      <p>
        This separation is a powerful design choice. Native code generation can
        concentrate on performance because it does not need to rediscover all of
        the semantic safety arguments made by the verifier.
      </p>

      <h2>Why ordinary memory safety rules are not enough</h2>

      <p>
        A kernel extension can do much more damage than a normal userspace
        program. An invalid pointer dereference is not merely a process crash.
        It can corrupt kernel state, expose information, or compromise the
        machine.
      </p>

      <p>
        eBPF therefore has to answer questions such as:
      </p>

      <ul>
        <li>Can this instruction dereference memory?</li>
        <li>If so, what kind of pointer is it?</li>
        <li>What memory region does the pointer refer to?</li>
        <li>Is the access within the region's known bounds?</li>
        <li>Could an arithmetic operation turn a safe pointer into an arbitrary one?</li>
        <li>Can this loop execute forever?</li>
        <li>Can this helper receive an invalid argument?</li>
        <li>Can execution reach an instruction with an impossible or unsafe state?</li>
      </ul>

      <p>
        Notice that many of these are not simple syntactic properties. Whether
        an access is safe can depend on values calculated several instructions
        earlier and on which branch reached the access.
      </p>

      <h2>The verifier's trick: track knowledge instead of concrete values</h2>

      <p>
        Suppose an eBPF program contains:
      </p>

      <pre><code>r1 = packet_length
if r1 &gt; 100
    goto safe
...
safe:
    read packet[r1]</code></pre>

      <p>
        The verifier cannot execute the program once with one packet. There are
        infinitely many possible packets and input values. Instead, it tracks an
        abstract description of what can be known about each register.
      </p>

      <p>
        Conceptually, a register might have a state resembling:
      </p>

      <pre><code>R1:
  kind: scalar
  known minimum: 0
  known maximum: 150
  known bits: ...
  unknown bits: ...
</code></pre>

      <p>
        This is the central idea behind abstract interpretation: instead of
        calculating one exact runtime state, the analyser calculates a
        conservative set of possible states.
      </p>

      <p>
        If the analyser can prove that every possible state is safe, the program
        passes. If it cannot prove safety, the program is rejected even if a
        human can see that the particular program “obviously” behaves correctly.
      </p>

      <div className="article__callout">
        <strong>The crucial asymmetry:</strong> false rejection is annoying;
        false acceptance can be a kernel security vulnerability. The verifier is
        therefore deliberately conservative.
      </div>

      <h2>Registers are more than 64-bit integers</h2>

      <p>
        At first glance, an eBPF register looks like a 64-bit value. The
        verifier's model is richer. A register can carry information about its
        semantic origin.
      </p>

      <p>
        A value may be treated as an ordinary scalar, while another value may
        represent a pointer into packet data, a map value, the eBPF stack, or
        another kernel-managed object. These categories matter because pointer
        arithmetic and dereference rules differ between them.
      </p>

      <pre><code>scalar:
    arithmetic is broadly allowed

packet pointer:
    arithmetic is restricted
    access must remain inside proven packet bounds

stack pointer:
    access is restricted to the eBPF stack

map-value pointer:
    access must stay inside the map value's known region</code></pre>

      <p>
        This is effectively a lightweight type system whose types are tracked
        dynamically through the program's control flow. The verifier is not just
        asking “is this a number?” It is asking “what does this number mean?”
      </p>

      <h2>Pointer arithmetic is where the interesting problems start</h2>

      <p>
        Consider a packet parser. The program wants to read a field at an offset
        calculated from packet contents.
      </p>

      <pre><code>offset = header_length * 4
value = packet + offset
read(value)</code></pre>

      <p>
        A human might reason about the protocol and conclude that
        <code>header_length</code> is limited. The verifier needs an explicit
        chain of evidence.
      </p>

      <p>
        If the value came from untrusted packet bytes, the verifier initially
        knows relatively little about it. Arithmetic can refine that knowledge.
        A bounds check can refine it further.
      </p>

      <pre><code>if header_length &lt;= 15
    offset = header_length * 4

    if packet + offset + 4 &lt;= data_end
        read 4 bytes
</code></pre>

      <p>
        The checks are not merely defensive programming for runtime behaviour.
        They communicate facts to the verifier. After a successful bounds check,
        the verifier can carry that fact into the branch where the access occurs.
      </p>

      <h2>Control flow becomes a graph of possible states</h2>

      <p>
        This is where the verifier starts looking like a compiler. It does not
        simply scan instructions from top to bottom. Branches create multiple
        possible execution paths.
      </p>

      <pre><code>             +-------------+
             |  start      |
             +------+------+
                    |
              condition
               /       \
              /         \
       +-----v---+   +---v------+
       | checked |   | unchecked|
       +-----+---+   +---+------+
             |           |
             +-----+-----+
                   |
                 access</code></pre>

      <p>
        On one branch, the verifier may know that a scalar is non-negative and
        below a limit. On the other, it may know nothing useful. An operation
        that is safe on the first branch can therefore be rejected on the
        second.
      </p>

      <p>
        This explains a common eBPF experience: adding a seemingly redundant
        bounds check suddenly makes an otherwise identical program load
        successfully. The check is not redundant from the verifier's point of
        view; it changes the abstract state available at the next instruction.
      </p>

      <h2>Why loops were historically difficult</h2>

      <p>
        Unbounded loops are a problem for a verifier. If the analyser has to
        consider an arbitrary number of iterations, both termination and state
        exploration become difficult.
      </p>

      <p>
        Early eBPF deliberately restricted control flow heavily, including
        prohibiting general loops. This made verification tractable and gave
        the kernel a strong guarantee that a program could not simply run
        forever.
      </p>

      <p>
        Modern eBPF supports bounded loops. The key word is
        <strong>bounded</strong>. The verifier needs enough information to
        establish that the loop will terminate within an acceptable amount of
        work.
      </p>

      <pre><code>for (i = 0; i &lt; 16; i++) {
    inspect(packet[i]);
}</code></pre>

      <p>
        A small fixed upper bound is easy to reason about. A bound that depends
        on complicated arithmetic, unknown input, or changing state may make the
        proof substantially harder.
      </p>

      <p>
        This is a recurring systems lesson: a restriction that looks arbitrary
        at the language level often exists because it gives the implementation a
        tractable proof obligation.
      </p>

      <h2>Loops turn verification into a termination problem</h2>

      <p>
        Imagine a loop whose condition depends on a value modified inside the
        loop. The verifier must reason about whether the value moves toward the
        exit condition.
      </p>

      <pre><code>i = input_value

while (i != 0) {
    i = transform(i)
}</code></pre>

      <p>
        The program may terminate for every value the developer has tested and
        still fail to provide a proof that it always terminates. The verifier
        does not get to rely on empirical testing.
      </p>

      <p>
        This is one reason verifier-friendly code often looks more explicit than
        equivalent ordinary application code. Predictability is a feature.
      </p>

      <h2>Helpers are capability boundaries</h2>

      <p>
        eBPF does not expose arbitrary kernel functions. Instead, programs call
        a defined set of <strong>helpers</strong>.
      </p>

      <pre><code>result = bpf_map_lookup_elem(&amp;map, &amp;key)
bpf_get_current_pid_tgid()
bpf_probe_read_kernel(...)
bpf_ringbuf_output(...)</code></pre>

      <p>
        A helper is more than an API function. It is a capability exposed to the
        eBPF execution environment. The verifier knows the helper's expected
        argument types, allowed contexts, and return-value semantics.
      </p>

      <p>
        This gives the kernel a controlled interface between untrusted bytecode
        and complex internal operations. Instead of allowing arbitrary calls
        through arbitrary kernel addresses, the program operates through a
        deliberately designed vocabulary.
      </p>

      <p>
        That architecture has an important maintenance advantage. Kernel
        developers can reason about the safety contract of each exposed helper
        independently rather than treating the entire kernel as an API surface
        available to eBPF.
      </p>

      <h2>Maps are another important boundary</h2>

      <p>
        eBPF programs often need state. A tracing program might count events,
        store timestamps, or maintain per-process information. Maps provide
        kernel-managed storage with defined access semantics.
      </p>

      <pre><code>userspace                 kernel
   |                         |
   | update map              |
   +-------------------------&gt;|
   |                         |
   |                  +------+------+
   |                  | eBPF map    |
   |                  +------+------+
   |                         ^
   |                         |
   |                 eBPF program
</code></pre>

      <p>
        Because the verifier understands map pointers and helper contracts, it
        can reason about accesses to map values much more precisely than it
        could reason about an arbitrary kernel pointer.
      </p>

      <h2>The verifier is a security type system with dataflow analysis</h2>

      <p>
        At this point the pieces fit together. The verifier combines several
        ideas familiar from compiler construction:
      </p>

      <ul>
        <li><strong>Control-flow analysis</strong> — which instructions can follow which?</li>
        <li><strong>Dataflow analysis</strong> — what facts are known at each instruction?</li>
        <li><strong>Abstract interpretation</strong> — represent ranges and types rather than concrete runtime values.</li>
        <li><strong>Type checking</strong> — pointer kinds constrain legal operations.</li>
        <li><strong>Termination reasoning</strong> — execution must remain bounded.</li>
        <li><strong>Effect checking</strong> — helpers define what privileged operations are available.</li>
      </ul>

      <p>
        This is why eBPF is such an interesting case study for language and
        systems developers. The “language” is intentionally small, but the
        machinery needed to prove programs safe is not.
      </p>

      <h2>Why accepted programs can still be expensive</h2>

      <p>
        Verification proves safety properties. It does not prove that a program
        is fast, cache-friendly, or a good idea.
      </p>

      <p>
        A program can be perfectly safe and still run on an extremely hot
        kernel path, perform too much work per packet, generate excessive
        tracing events, or create contention on shared state.
      </p>

      <p>
        This distinction matters operationally:
      </p>

      <pre><code>verifier:
    “This program is safe to execute.”

performance engineering:
    “This program is cheap enough to execute here.”

observability engineering:
    “The information produced is worth its cost.”</code></pre>

      <p>
        Treating verifier acceptance as a quality signal is a category error.
        It establishes a safety floor, not a performance ceiling.
      </p>

      <h2>JIT compilation: the verifier and CPU are separate stories</h2>

      <p>
        Interpreting every eBPF instruction would impose substantial overhead.
        Linux can therefore JIT-compile eBPF into native machine instructions.
      </p>

      <p>
        The important architectural point is that native execution does not
        weaken the verifier's proof. The native code generator translates an
        already-accepted instruction sequence.
      </p>

      <pre><code>eBPF bytecode
      |
      v
 verifier  ---- safety proof ----&gt; accepted
      |
      v
 architecture-specific JIT
      |
      v
 native machine code</code></pre>

      <p>
        This resembles a useful compiler-security pattern: perform expensive
        semantic validation once, then execute a faster representation of the
        validated program.
      </p>

      <h2>Why verifier errors can feel cryptic</h2>

      <p>
        When an eBPF program is rejected, the diagnostic often describes a
        register state or pointer constraint rather than the developer's
        high-level intent.
      </p>

      <pre><code>invalid mem access 'scalar'
R2 type=scalar expected=ptr_to_ctx

R3 min value is negative, either use unsigned comparison
or prove the value is non-negative</code></pre>

      <p>
        These messages make more sense once you stop thinking of the verifier as
        a linter. It is reporting a failed proof obligation.
      </p>

      <p>
        A useful debugging technique is therefore to ask:
        <strong>“What fact does the verifier not know here?”</strong>
        rather than “Why doesn't it understand my code?”
      </p>

      <p>
        Often the fix is to restructure control flow so a fact becomes obvious:
        perform a bounds check earlier, narrow a value before pointer
        arithmetic, keep a pointer relationship intact, or avoid an operation
        that destroys information the verifier was tracking.
      </p>

      <h2>A practical experiment: make the proof visible</h2>

      <p>
        One of the best ways to understand the verifier is to deliberately write
        a program that is almost safe and observe what changes when a proof is
        added.
      </p>

      <pre><code>// Conceptual packet parsing pattern

void *data = (void *)(long)ctx-&gt;data;
void *data_end = (void *)(long)ctx-&gt;data_end;

struct header *h = data;

if ((void *)(h + 1) &gt; data_end)
    return 0;

return h-&gt;field;</code></pre>

      <p>
        The comparison establishes a relationship between the proposed memory
        access and the kernel-provided packet boundary. Remove the check and the
        verifier no longer has the proof it needs.
      </p>

      <p>
        Compile a small tracing or networking program, load it with a modern
        eBPF toolchain, and inspect the verifier log. Then change one condition
        at a time. Watching the register states change is effectively a live
        lesson in abstract interpretation.
      </p>

      <h2>Verifier complexity is itself an engineering constraint</h2>

      <p>
        There is a subtle trade-off here. A more powerful analyser can accept
        more useful programs, but the verifier itself runs in kernel context
        while a userspace process is asking the kernel to load code.
      </p>

      <p>
        Verification therefore has to be powerful enough to prove interesting
        programs safe without becoming an easy denial-of-service target.
      </p>

      <p>
        This produces a fascinating tension:
      </p>

      <pre><code>more expressive language
        |
        +----&gt; more useful programs
        |
        +----&gt; harder proofs
        |
        +----&gt; more verifier CPU / memory
        |
        +----&gt; larger kernel attack surface</code></pre>

      <p>
        The design of eBPF is consequently not just about making a pleasant
        bytecode language. It is about choosing an instruction set and execution
        model that make useful proofs computationally manageable.
      </p>

      <h2>The verifier is conservative by design</h2>

      <p>
        Suppose a human can prove that a particular path is safe using knowledge
        about an application protocol. If that fact is not represented in the
        verifier's model, the program may still be rejected.
      </p>

      <p>
        This is not necessarily a verifier bug. It is a consequence of the
        trust boundary. The kernel cannot generally accept “the developer knows
        this field is always 12” as evidence. It needs a property that follows
        from the bytecode and the environment it controls.
      </p>

      <p>
        This is the same basic reason static type systems reject some programs
        that a human can reason about informally. The analyser has to use a
        mechanically checkable approximation of reality.
      </p>

      <h2>The surprising connection to smart contracts and safe plugins</h2>

      <p>
        The eBPF architecture belongs to a broader family of systems that want
        to execute code supplied by someone who should not receive arbitrary
        authority.
      </p>

      <p>
        WebAssembly, smart-contract VMs, database extension systems, and some
        plugin architectures face a similar problem:
      </p>

      <ol>
        <li>Provide a constrained execution model.</li>
        <li>Define a small set of capabilities.</li>
        <li>Prove or enforce safety before execution.</li>
        <li>Optimise execution only after those constraints are established.</li>
      </ol>

      <p>
        The interesting lesson is that sandboxing is not always one mechanism.
        eBPF combines a restricted instruction set, verifier analysis, helper
        capabilities, runtime context, and optional JIT compilation. Security
        comes from the composition.
      </p>

      <h2>What this means for application developers</h2>

      <p>
        You do not need to write eBPF programs every day to benefit from
        understanding the verifier. It teaches several habits that transfer
        directly to ordinary systems programming.
      </p>

      <ul>
        <li>Make invariants explicit rather than relying on comments.</li>
        <li>Keep validation close to the operation it makes safe.</li>
        <li>Understand how control flow changes what a static analyser can prove.</li>
        <li>Separate “safe” from “fast”.</li>
        <li>Prefer narrow capabilities over arbitrary privileged access.</li>
        <li>Design APIs so important invariants are mechanically checkable.</li>
      </ul>

      <p>
        These principles show up everywhere from TypeScript control-flow
        narrowing to database query planners and compiler optimisation passes.
        eBPF simply makes the consequences unusually concrete because the proof
        stands between an ordinary process and kernel execution.
      </p>

      <h2>Sharp edges to remember</h2>

      <ul>
        <li>
          <strong>Verifier acceptance is not a performance guarantee.</strong>
          Safe code can still be catastrophically expensive on a hot path.
        </li>
        <li>
          <strong>Bounds checks are information.</strong> They do not merely
          protect runtime memory; they establish facts the verifier can carry
          forward.
        </li>
        <li>
          <strong>Pointer provenance matters.</strong> Two 64-bit values can
          have radically different legal operations because the verifier knows
          where they came from.
        </li>
        <li>
          <strong>Loop bounds are part of the language contract.</strong> They
          exist because termination and verification cost matter inside the
          kernel.
        </li>
        <li>
          <strong>Helpers are capabilities.</strong> The helper set is part of
          the security architecture, not merely a convenience API.
        </li>
      </ul>

      <h2>Bigger connection: programming as proof engineering</h2>

      <p>
        The deepest lesson of the eBPF verifier is that programming can be viewed
        as constructing evidence.
      </p>

      <p>
        Ordinary application code often asks: “What should happen if this value
        has property X?” Verifier-oriented programming asks an additional
        question: <strong>“How can the machine prove that X is true at the exact
        point where I need it?”</strong>
      </p>

      <p>
        That shift in perspective is useful far beyond eBPF. It is the same
        mental move behind type refinement, ownership systems, compiler dataflow
        analysis, database constraint checking, and formal verification.
      </p>

      <p>
        eBPF happens to put the proof directly on the critical boundary between
        untrusted userspace and privileged kernel execution. That makes the
        architecture unusually easy to appreciate: before the CPU gets a chance
        to execute the program, another program — the verifier — has already
        tried to establish that the execution is safe.
      </p>

      <div className="article__callout">
        <strong>Takeaway:</strong> The eBPF verifier is best understood as a
        small proof system embedded in the Linux kernel. It does not predict
        exactly what your program will do. It tracks conservative facts about
        everything the program could do, and only permits execution when those
        facts are sufficient to prove the relevant safety properties.
      </div>
    </ArticleLayout>
  );
}
