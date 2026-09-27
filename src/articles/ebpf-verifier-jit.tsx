import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = {
  slug: 'ebpf-verifier-jit',
  title: 'eBPF: From Tiny Programs to Kernel-Safe JIT Code',
  subtitle: 'How Linux safely runs user-supplied programs inside the kernel',
  category: 'Linux',
  description: 'A deep look at eBPF bytecode, verifier analysis, maps, helper calls and JIT compilation, and why the verifier is the real security boundary.',
  date: '2026-09-29',
  readingTime: 20,
  tags: ['Linux', 'eBPF', 'Kernels', 'JIT', 'Security'],
};

export function EbpfVerifierJitArticle() {
  return <ArticleLayout meta={meta}>
    <ArticleSection title="The unusual promise of eBPF">
      <p>eBPF lets ordinary software install small programs into parts of the Linux kernel that traditionally required kernel modules or tracing-specific machinery. The surprising part is not that the kernel can execute bytecode. It is that untrusted processes can submit programs without being allowed to turn that ability into arbitrary kernel execution.</p>
      <ArticleCallout>The verifier is the centre of eBPF's security model. The JIT makes accepted programs fast, but the verifier decides what programs are allowed to mean.</ArticleCallout>
    </ArticleSection>

    <ArticleSection title="The execution pipeline">
      <ArticleDiagram items={[
        { title: 'User process', description: 'Builds eBPF bytecode and calls the bpf syscall' },
        { title: 'Verifier', description: 'Proves safety and tracks program state' },
        { title: 'Kernel', description: 'Attaches the accepted program to a hook' },
        { title: 'JIT', description: 'Optionally turns bytecode into native instructions' },
        { title: 'Hook', description: 'Program executes in the relevant kernel path' },
      ]} />
      <p>The program is not simply copied into kernel memory and executed. Loading is a negotiation: the kernel inspects instructions, control flow, memory access and helper usage before the program becomes executable.</p>
    </ArticleSection>

    <ArticleSection title="Why a verifier is necessary">
      <p>A kernel program has privileges that a normal process does not. A single unchecked pointer could allow memory corruption, while an unbounded loop could make a latency-sensitive kernel path unusable. eBPF therefore restricts programs to an instruction model that the verifier can reason about.</p>
      <p>The verifier symbolically explores program paths. It tracks facts such as whether a register contains a scalar or pointer, what ranges a scalar may have, and which memory accesses have been established as safe.</p>
    </ArticleSection>

    <ArticleSection title="Registers and types">
      <p>eBPF exposes a small register machine. Registers do not merely contain numbers in the verifier's model: a register can carry a type and associated range information. That distinction is what lets an instruction such as a pointer offset be accepted only when the verifier can establish that the resulting access remains valid.</p>
      <p>This is a useful general systems idea: static analysis can turn a dynamic safety problem into a load-time proof obligation. The program pays the analysis cost once, rather than paying for a full safety check on every instruction execution.</p>
    </ArticleSection>

    <ArticleSection title="Helpers are capabilities">
      <p>An eBPF program cannot call arbitrary kernel functions. Instead it calls a deliberately exposed set of helpers. A helper can read metadata, access a map, emit tracing data or perform another controlled operation.</p>
      <p>This resembles capability-based design. The program is powerful because the kernel gives it carefully shaped capabilities, not because it can discover and invoke arbitrary kernel addresses.</p>
    </ArticleSection>

    <ArticleSection title="Maps separate code from state">
      <p>eBPF maps provide structured storage shared between eBPF programs and user space. Hash maps, arrays, per-CPU structures and other map types let a tiny program accumulate state without embedding a large mutable data structure into its instructions.</p>
      <p>This separation is important architecturally. Code can remain small and safely constrained while state lives in kernel-managed objects with their own synchronization and lifetime rules.</p>
    </ArticleSection>

    <ArticleSection title="The JIT is an optimisation, not the safety boundary">
      <p>Interpreting bytecode instruction by instruction would impose overhead on a program that may execute on extremely hot paths. Linux can therefore JIT compile accepted eBPF instructions into native machine code.</p>
      <p>The important ordering is verifier first, JIT second. Native execution does not weaken the original proof. The generated machine code is an implementation of a program that has already passed the kernel's safety checks.</p>
    </ArticleSection>

    <ArticleSection title="Why eBPF matters to application developers">
      <p>Modern observability tools use eBPF to observe networking, scheduling, system calls and application behaviour with considerably less intrusion than traditional instrumentation. This changes debugging from “add logging and redeploy” toward “attach a carefully constrained observation program to the running system”.</p>
      <p>The broader lesson is valuable beyond Linux: a constrained programmable interface can expose enormous extensibility when the host can cheaply prove the constraints that matter.</p>
    </ArticleSection>

    <ArticleSection title="Sharp edges">
      <p>Verifier complexity can make seemingly obvious programs fail to load. Kernel versions also expose different helpers and features, and program behaviour depends heavily on the hook where it runs. A program that is safe at one attachment point may not have the same available context elsewhere.</p>
      <ArticleCallout>When debugging eBPF, separate three questions: “is the program logically correct?”, “will the verifier accept it?”, and “does it perform acceptably at this hook?” They are different problems.</ArticleCallout>
    </ArticleSection>

    <ArticleSection title="A useful experiment">
      <p>Write a tiny tracing program that records a counter in a map. Then deliberately add an operation whose safety cannot be established from the verifier's available bounds. Compare the rejected program with a version that proves the bound first. The interesting part is watching a security property become a compile-like constraint at program load time.</p>
    </ArticleSection>

    <ArticleSection title="The deeper connection">
      <p>eBPF sits at an interesting intersection of operating systems, compilers, security and observability. It demonstrates a recurring systems pattern: make a restricted intermediate language expressive enough to be useful, then build a strong static proof boundary around it, and finally optimise the proven representation aggressively.</p>
    </ArticleSection>
  </ArticleLayout>;
}
