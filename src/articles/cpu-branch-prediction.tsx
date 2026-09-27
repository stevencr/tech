import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = {
  slug: 'cpu-branch-prediction',
  title: 'Branch Prediction: The CPU Guessing the Future',
  subtitle: 'Why a tiny if statement can interact with speculation, pipelines and performance',
  category: 'Computer Architecture',
  description: 'How modern CPUs predict branches, execute speculatively and recover from wrong guesses, and why data layout can matter more than source-level complexity.',
  date: '2026-10-01',
  readingTime: 18,
  tags: ['CPU', 'Performance', 'Computer Architecture', 'Branch Prediction', 'Systems'],
};

export function CpuBranchPredictionArticle() {
  return <ArticleLayout meta={meta}>
    <ArticleSection title="The CPU does not execute one instruction at a time">
      <p>A modern out-of-order CPU may have many instructions in flight simultaneously. It fetches future instructions, decodes them, waits for operands and executes independent work while earlier instructions are still completing.</p>
      <ArticleCallout>A branch creates uncertainty about which instructions should be fetched next. Branch prediction turns that uncertainty into a guess so the pipeline can keep moving.</ArticleCallout>
    </ArticleSection>

    <ArticleSection title="The pipeline problem">
      <ArticleDiagram items={[
        { title: 'Fetch', description: 'Predict the next instruction address' },
        { title: 'Decode', description: 'Turn instructions into internal operations' },
        { title: 'Schedule', description: 'Find operations whose inputs are ready' },
        { title: 'Execute', description: 'Use functional units' },
        { title: 'Retire', description: 'Commit results in architectural order' },
      ]} />
      <p>If a conditional branch cannot be resolved immediately, waiting would leave parts of the pipeline idle. Prediction allows the CPU to continue fetching along one path.</p>
    </ArticleSection>

    <ArticleSection title="What gets predicted">
      <p>The CPU needs to predict both whether a conditional branch is taken and, for many branches, where execution should continue. Hardware maintains small prediction structures recording patterns from recent execution.</p>
      <p>A predictor does not need to understand your source code. It learns correlations in branch behaviour at runtime.</p>
    </ArticleSection>

    <ArticleSection title="Speculative execution">
      <p>After predicting a branch, the CPU may execute instructions from the predicted path before the branch condition is fully known. If the prediction was correct, useful work has already happened. If it was wrong, speculative work is discarded and the machine redirects execution to the correct path.</p>
      <p>Retirement rules are crucial: speculative execution can happen internally without making incorrect architectural results visible to the program.</p>
    </ArticleSection>

    <ArticleSection title="Why predictable data is faster">
      <p>Consider a loop that processes millions of records. If a condition is almost always true, the predictor can become highly accurate. If the same condition behaves unpredictably, the CPU repeatedly pays the cost of recovering from wrong paths.</p>
      <p>This is why source-level code that looks equally simple can have different performance characteristics depending on the distribution of its data.</p>
    </ArticleSection>

    <ArticleSection title="Branchless is not automatically better">
      <p>It is tempting to conclude that branches should always be removed. That is too simplistic. A predictable branch can be extremely cheap, while replacing it with arithmetic or masking can introduce extra instructions, dependencies or memory operations.</p>
      <p>The correct question is not “does this code contain if statements?” but “what work does the generated machine code actually cause the processor to perform for this workload?”</p>
    </ArticleSection>

    <ArticleSection title="The security connection">
      <p>Speculation also created an important class of security research. Microarchitectural state can sometimes reveal information about operations that should have been architecturally discarded. Spectre demonstrated that a program can observe indirect consequences of speculative execution even when the CPU eventually rolls the architectural state back.</p>
      <p>This is a useful distinction between software semantics and hardware behaviour: “the CPU did not commit the result” does not necessarily mean “nothing observable happened internally”.</p>
    </ArticleSection>

    <ArticleSection title="Data layout often wins">
      <p>Branch behaviour interacts with memory locality. A loop over densely packed homogeneous data may be dramatically easier for the CPU than a loop following pointers through scattered objects. Cache misses can dominate the cost of the branch itself.</p>
      <ArticleCallout>Optimising a hot loop means thinking about the whole machine: branches, caches, dependencies, instruction throughput and memory latency are coupled.</ArticleCallout>
    </ArticleSection>

    <ArticleSection title="A practical experiment">
      <p>Generate a large array containing random boolean values and benchmark a loop that conditionally accumulates values. Then sort the booleans before running the same loop. The algorithm has not changed, but the branch history has.</p>
      <p>Use a profiler and multiple iterations rather than trusting one stopwatch measurement. Modern CPUs are dynamic systems, so warm-up, frequency scaling and cache state can all influence results.</p>
    </ArticleSection>

    <ArticleSection title="The senior-developer takeaway">
      <p>High-level performance reasoning becomes more accurate when you understand that the CPU is predicting, speculating and reordering work underneath your source code. You do not need to hand-write assembly to benefit from this knowledge. You need to know when a seemingly harmless abstraction creates unpredictable control flow, pointer chasing or unnecessary dependencies.</p>
    </ArticleSection>
  </ArticleLayout>;
}
