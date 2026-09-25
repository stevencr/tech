import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCode } from '../components/article/ArticleCode';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = {
  slug: 'ebpf',
  title: 'eBPF: The Programmable Kernel',
  subtitle: 'How tiny verified programs safely reshape operating-system behaviour',
  category: 'Operating Systems',
  description:
    'A deep dive into eBPF bytecode, verification, hooks, maps, JIT compilation and why the Linux kernel became programmable without loading arbitrary kernel modules.',
  date: '2026-09-25',
  readingTime: 15,
  tags: ['Linux', 'eBPF', 'Kernel', 'Networking', 'Observability'],
};

export function EbpfArticle() {
  return (
    <ArticleLayout meta={meta}>
      <ArticleSection title="The unusual idea">
        <p>
          The Linux kernel is deliberately difficult to extend. Kernel code runs with enormous privilege, so loading an arbitrary native module is fundamentally different from loading an ordinary application. Yet modern infrastructure constantly needs new behaviour inside the kernel: packet filtering, tracing, security policy, performance instrumentation and custom networking logic.
        </p>
        <p>
          eBPF provides a compromise. User-space programs can submit small programs to the kernel, but the kernel first proves that those programs are safe to execute. The result is a programmable kernel with a much smaller trust boundary than arbitrary native kernel code.
        </p>
        <ArticleCallout>
          eBPF is not simply “JavaScript for Linux”. It is a restricted virtual machine, a verifier, a set of kernel attachment points and shared data structures that together form a programmable execution framework.
        </ArticleCallout>
      </ArticleSection>

      <ArticleSection title="Where the program runs">
        <ArticleDiagram
          items={[
            { title: 'User space', description: 'A loader creates maps, loads bytecode and attaches programs to kernel hooks.' },
            { title: 'Verifier', description: 'The kernel performs static analysis before the program can execute.' },
            { title: 'eBPF VM / JIT', description: 'Verified bytecode is interpreted or compiled to native machine instructions.' },
            { title: 'Kernel hook', description: 'The program runs at a specific event such as a syscall, tracepoint, socket or packet path.' },
          ]}
        />
        <p>
          The important architectural boundary is between loading and execution. The application does not simply hand the kernel a function pointer. It submits a program expressed in the eBPF instruction set and asks the kernel to attach it to a supported hook.
        </p>
      </ArticleSection>

      <ArticleSection title="The instruction set is deliberately constrained">
        <p>
          eBPF has registers, arithmetic, jumps, memory access and helper calls, but it does not behave like unrestricted native code. The instruction set and execution model are designed so that the verifier can reason about what the program might do.
        </p>
        <ArticleCode>{`// Conceptual eBPF-style logic
if (packet_protocol == TCP) {
  increment_counter();
  return ALLOW;
}

return DROP;`}</ArticleCode>
        <p>
          Real programs are normally written in C, Rust or another language and compiled into eBPF bytecode. The source language is not the security boundary; the verifier analyses the resulting program.
        </p>
      </ArticleSection>

      <ArticleSection title="The verifier is the fascinating part">
        <p>
          Before execution, the kernel verifier explores program paths and tracks facts about registers and memory. It reasons about whether pointers are valid, whether memory accesses stay within known bounds, whether helper calls receive acceptable arguments and whether execution can terminate.
        </p>
        <p>
          Conceptually, it is performing a form of abstract interpretation. Instead of executing one concrete packet through the program, it reasons about many possible states. A register might be known to contain a pointer to packet data with a particular range of valid offsets.
        </p>
        <ArticleDiagram
          items={[
            { title: 'Instruction', description: 'Load, arithmetic, branch or helper call.' },
            { title: 'Abstract state', description: 'What the verifier knows about registers, pointers and ranges.' },
            { title: 'Branch', description: 'The verifier considers possible paths and refines its knowledge.' },
            { title: 'Safe program', description: 'Only a program satisfying the verifier is accepted.' },
          ]}
        />
        <ArticleCallout>
          The verifier is what turns a dangerous capability into a constrained one. eBPF's security model depends heavily on what the kernel can prove, not merely on what the programmer intended.
        </ArticleCallout>
      </ArticleSection>

      <ArticleSection title="Helpers instead of arbitrary kernel calls">
        <p>
          An eBPF program cannot simply call any kernel function. Instead, it uses a controlled set of helper functions exposed by the kernel. Helpers provide capabilities such as reading packet metadata, accessing maps, getting timestamps or emitting tracing information.
        </p>
        <ArticleCode>{`SEC("tracepoint/syscalls/sys_enter_openat")
int trace_openat(struct trace_event_raw_sys_enter *ctx)
{
    const char *filename = (const char *)ctx->args[1];

    bpf_printk("openat: %s", filename);
    return 0;
}`}</ArticleCode>
        <p>
          The exact available helpers and rules depend on the hook and kernel version. That is another important lesson: eBPF is a platform with capability-specific execution contexts, not one completely uniform API.
        </p>
      </ArticleSection>

      <ArticleSection title="Maps: how eBPF talks to user space">
        <p>
          Programs often need state. An observability program might count requests by process ID; a networking program might maintain routing information. eBPF maps provide kernel-managed storage that both eBPF programs and user-space applications can access through file-descriptor-based APIs.
        </p>
        <ArticleDiagram
          items={[
            { title: 'eBPF program', description: 'Updates counters or looks up configuration while handling an event.' },
            { title: 'Map', description: 'Kernel-managed key/value or specialised storage structure.' },
            { title: 'User-space agent', description: 'Reads telemetry or writes configuration through the eBPF API.' },
          ]}
        />
        <p>
          This separation is powerful. The fast path can stay in the kernel while a normal application periodically consumes the resulting data. It is one reason tools such as modern observability agents can collect detailed kernel-level information without shipping a custom kernel module.
        </p>
      </ArticleSection>

      <ArticleSection title="JIT compilation changes the performance story">
        <p>
          The kernel can interpret eBPF instructions, but production systems commonly use a just-in-time compiler to translate verified eBPF bytecode into native instructions for the target CPU.
        </p>
        <p>
          That creates an unusual pipeline: source language to eBPF bytecode, static verification, then native machine code. The verifier still checks the portable eBPF representation before JIT compilation. Native execution therefore does not bypass the safety analysis.
        </p>
        <ArticleCallout>
          This is a recurring systems pattern: validate a restricted intermediate representation first, then optimise it aggressively. The optimisation stage does not need to be the thing that establishes safety.
        </ArticleCallout>
      </ArticleSection>

      <ArticleSection title="Hooks are the real superpower">
        <p>
          eBPF becomes broadly useful because programs can attach to many different points in the system. Examples include tracepoints, kprobes, uprobes, networking paths, sockets, security hooks and performance-monitoring events.
        </p>
        <p>
          The same underlying execution model can therefore support very different products: packet filtering, service-mesh networking, syscall auditing, profiling, latency analysis and security detection. The hook determines what context the program receives and what operations it is permitted to perform.
        </p>
      </ArticleSection>

      <ArticleSection title="A practical experiment">
        <p>
          On a Linux machine, install a recent eBPF tool such as bpftrace. Start with a one-line program that counts filesystem or process events. Then attach a second probe and correlate the results with a normal application workload.
        </p>
        <ArticleCode>{`# Example bpftrace-style experiment
tracepoint:syscalls:sys_enter_openat
{
  @[comm] = count();
}`}</ArticleCode>
        <p>
          The interesting part is not the syntax. Ask what actually happens between the command and the result: how the probe is compiled, how it reaches the kernel, what hook receives the event, where the aggregation state lives and how user space reads the resulting map.
        </p>
      </ArticleSection>

      <ArticleSection title="Sharp edges and trade-offs">
        <ul>
          <li>Verifier constraints can make seemingly reasonable algorithms difficult to express.</li>
          <li>Kernel APIs and available hooks evolve, so portability depends on kernel capabilities.</li>
          <li>Running code in the kernel has consequences: bugs can affect the whole machine even though the verifier reduces the attack surface.</li>
          <li>High-frequency hooks can create significant overhead if programs do too much work or move too much data.</li>
          <li>Debugging crosses the user/kernel boundary and often requires specialised tooling.</li>
        </ul>
        <p>
          eBPF is therefore not “free observability” or “free networking”. It moves some work closer to the event source, which can be extremely valuable, but the placement itself must be designed carefully.
        </p>
      </ArticleSection>

      <ArticleSection title="The bigger software-engineering idea">
        <p>
          eBPF demonstrates a powerful architecture for extensibility: define a constrained intermediate language, prove safety before execution, provide explicit capabilities through helpers, and expose stable attachment points where extensions can run.
        </p>
        <p>
          That pattern extends well beyond Linux. It is relevant whenever you want third parties or dynamically changing systems to provide executable behaviour without granting unrestricted access. The interesting question is no longer “can we load code?” but “what is the smallest execution model that gives us useful programmability while keeping the trust boundary manageable?”
        </p>
      </ArticleSection>
    </ArticleLayout>
  );
}
