import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'v8-hidden-classes-inline-caches',
  title: 'V8 Under the Hood: Hidden Classes, Inline Caches and Deoptimisation',
  subtitle: 'How a dynamic language gets fast without abandoning dynamism — by turning recurring runtime shapes into guarded machine-code assumptions.',
  category: 'JavaScript Runtimes',
  description: 'A senior-level deep dive into V8 object shapes, Maps, inline caches, speculative optimisation, feedback and deoptimisation, with practical implications for JavaScript and Node.js performance.',
  date: '2026-10-02',
  readingTime: 23,
  tags: ['JavaScript', 'V8', 'JIT', 'Performance', 'Compilers', 'Node.js'],
};

export function V8HiddenClassesInlineCachesArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>JavaScript looks like an awkward language to optimise. Objects are dynamic, properties can appear at runtime, functions can be replaced, prototypes are observable, and values can change type without asking permission. Yet V8 can turn ordinary JavaScript into highly specialised machine code.</p>

      <p>The trick is not that V8 makes JavaScript static. It is that V8 <strong>learns what the running program normally does</strong>, specialises those common cases, and keeps a correct fallback for when reality changes.</p>

      <div className="article__callout"><strong>Core idea:</strong> optimised JavaScript is often machine code plus a set of guarded assumptions about the values and object shapes that code normally sees.</div>

      <h2>The property access problem</h2>

      <p>At source level, this looks trivial:</p>

      <pre><code>{`function total(order) {
  return order.price * order.quantity;
}`}</code></pre>

      <p>But <code>order.price</code> is not equivalent to reading a fixed field in a C struct. JavaScript property lookup has to respect the language's dynamic object model: own properties, prototypes, accessors, and other runtime behaviour all matter.</p>

      <p>A fully generic implementation could perform that lookup every time. It would be correct, but expensive. A static compiler could know the layout of <code>order</code> ahead of time. V8 takes a third route: it watches what actually happens and makes the common case cheap.</p>

      <h2>Objects have shapes even though JavaScript does not</h2>

      <p>Developers usually model an object as a mapping:</p>

      <pre><code>{`{
  price: 12.50,
  quantity: 4
}`}</code></pre>

      <p>Internally, V8 benefits from thinking about that object as having a <strong>shape</strong>. V8's internal structure is commonly called a <strong>Map</strong>; older explanations call these <em>hidden classes</em>.</p>

      <p>The important property of a Map is that it lets the engine associate a compact piece of identity with assumptions about the object's structure and representation. Objects constructed in the same way can often share a Map.</p>

      <pre><code>{`const a = {};
a.x = 10;
a.y = 20;

const b = {};
b.x = 30;
b.y = 40;`}</code></pre>

      <p>Conceptually:</p>

      <pre><code>{`empty
  |
  +-- x --> {x}
             |
             +-- y --> {x,y}

a ----------------> {x,y}
b ----------------> {x,y}`}</code></pre>

      <p>The real implementation has more detail, but this is the useful mental model: property additions can move an object through a graph of shape transitions.</p>

      <h2>Construction history can matter</h2>

      <p>Compare these:</p>

      <pre><code>{`function A(x, y) {
  this.x = x;
  this.y = y;
}

function B(x, y) {
  this.y = y;
  this.x = x;
}`}</code></pre>

      <p>The resulting objects have the same named properties, but their construction histories differ. That can lead to different Maps.</p>

      <div className="article__callout"><strong>Important nuance:</strong> “these objects have the same properties” does not necessarily mean “V8 sees the same shape”. Property insertion order and representation history can be relevant.</div>

      <p>This does not mean application code should obsess over property order. It means that the engine has a much richer runtime model than the JavaScript syntax exposes.</p>

      <h2>From dynamic lookup to guarded lookup</h2>

      <p>Once V8 knows that a particular operation normally receives objects with Map M, the operation can conceptually become:</p>

      <pre><code>{`if (value.map === M) {
  return value.slot;
}

generic_property_lookup(value, "x");`}</code></pre>

      <p>The actual generated code is more sophisticated, but the architectural transformation is the important part. A dynamic operation becomes <strong>a cheap guard followed by a specialised operation</strong>.</p>

      <p>The guard is what keeps the optimisation correct. V8 is not claiming that every JavaScript object has Map M. It is saying that this particular hot operation has observed M often enough to make that case the fast path.</p>

      <h2>Inline caches remember what a call site sees</h2>

      <p>This leads to one of the classic techniques used by dynamic language runtimes: the <strong>inline cache</strong>, or IC.</p>

      <p>An inline cache records information about a dynamic operation at a particular location in the program. For property access, it can remember which receiver Maps have appeared there and what those Maps imply for the lookup.</p>

      <pre><code>{`function getX(value) {
  return value.x;
}

getX({ x: 1 });
getX({ x: 2 });
getX({ x: 3 });`}</code></pre>

      <p>If the objects arriving at the access site consistently have a compatible Map, the engine has strong evidence for a specialised path.</p>

      <p>The phrase <strong>at that location</strong> matters. Two property accesses that look identical in source code can have very different feedback because they observe different populations of runtime objects.</p>

      <h2>Monomorphic, polymorphic and megamorphic</h2>

      <p>Inline-cache behaviour is often described using three useful categories:</p>

      <div className="table-wrap">
        <table>
          <thead><tr><th>State</th><th>Observed behaviour</th><th>Typical consequence</th></tr></thead>
          <tbody>
            <tr><td>Monomorphic</td><td>One dominant receiver shape</td><td>Very cheap specialised path</td></tr>
            <tr><td>Polymorphic</td><td>A small number of shapes</td><td>Several guarded fast paths</td></tr>
            <tr><td>Megamorphic</td><td>Many unrelated shapes</td><td>More generic lookup machinery</td></tr>
          </tbody>
        </table>
      </div>

      <p>These are not simply good, acceptable and bad. A small polymorphic site can be efficient. The interesting problem is uncontrolled diversity at a hot operation, because the engine has less useful regularity to exploit.</p>

      <h2>Where the JIT enters</h2>

      <p>Inline caches can accelerate individual dynamic operations. V8 also uses runtime feedback to decide when a larger unit of code is worth optimising.</p>

      <pre><code>{`JavaScript
   |
   v
initial execution
   |
   +---- collect feedback
   |
   v
hot code?
   |
  yes
   |
   v
optimising compiler
   |
   v
specialised machine code
   |
   +---- assumption breaks ----> deoptimise`}</code></pre>

      <p>V8's exact tiering pipeline evolves between releases, so memorising individual internal component names is less useful than understanding this architecture. Code executes, feedback accumulates, hot code is compiled using that evidence, and the resulting machine code contains assumptions about the values it expects.</p>

      <h2>Speculative optimisation</h2>

      <p>Imagine a hot function:</p>

      <pre><code>{`function lineTotal(order) {
  return order.price * order.quantity;
}`}</code></pre>

      <p>Suppose V8 repeatedly observes the same object Map and compatible numeric representations for the two properties. An optimising compiler can generate code that assumes those facts, with guards protecting the assumptions.</p>

      <p>This is <strong>speculative optimisation</strong>. The compiler is not proving that every possible call has those properties. It is betting that the observed pattern is stable enough to make the fast path worthwhile.</p>

      <div className="article__callout"><strong>JIT mental model:</strong> “I have evidence this is what normally happens, so I will compile for that case and retain a cheap way to recognise when I was wrong.”</div>

      <h2>Deoptimisation is part of the design</h2>

      <p>Consider:</p>

      <pre><code>{`function add(a, b) {
  return a + b;
}

add(10, 20);
add(30, 40);
// ...many numeric calls...

add("hello", "world");`}</code></pre>

      <p>JavaScript's <code>+</code> operator has behaviour that depends on runtime values. If the function became optimised around the observed numeric case, a string input can invalidate the assumptions behind that machine code.</p>

      <p>V8 can then <strong>deoptimise</strong>: leave the specialised code and continue through a less specialised representation that can handle the newly observed case.</p>

      <p>That is not a correctness failure. It is the mechanism that makes speculation possible in the first place.</p>

      <pre><code>{`observe
  |
  v
specialise
  |
  v
fast machine code
  |
  +-- assumption fails --> recover
                             |
                             v
                       new feedback
                             |
                             v
                        reoptimise?`}</code></pre>

      <p>The same architectural idea appears outside language runtimes: caches assume locality and handle misses; databases choose plans from statistics; optimistic concurrency assumes no conflict and retries when there is one. Speculation becomes useful when recovery is cheaper than refusing to speculate.</p>

      <h2>Feedback is runtime state</h2>

      <p>A running JavaScript program has more interesting state than heap objects and call stacks. Execution also produces evidence about behaviour.</p>

      <ul>
        <li>which Maps appear at property access sites;</li>
        <li>which value representations operations commonly see;</li>
        <li>which functions are called repeatedly;</li>
        <li>which paths become hot;</li>
        <li>which assumptions later fail.</li>
      </ul>

      <p>That feedback influences future compilation decisions. The runtime is, in a literal sense, learning about the workload it is executing.</p>

      <h2>Why TypeScript does not make this static</h2>

      <p>Consider:</p>

      <pre><code>{`type Order = {
  price: number;
  quantity: number;
};`}</code></pre>

      <p>This gives the TypeScript compiler and the developer useful information. But ordinary TypeScript compilation erases the annotation before V8 executes the JavaScript.</p>

      <p>V8 does not receive a runtime declaration saying “this object is an Order”. It sees actual objects, actual values and actual execution history.</p>

      <p>TypeScript can still help indirectly. Strong domain models often encourage consistent construction and reduce accidental mixtures of unrelated runtime states. But static types and runtime Maps are different systems.</p>

      <h2>Structural mutation can disrupt predictability</h2>

      <p>JavaScript permits objects to change structure:</p>

      <pre><code>{`const user = {
  id: 42,
  name: "Ada",
};

delete user.name;`}</code></pre>

      <p>V8 has sophisticated representations for dynamic objects, but repeated structural mutation can make a hot data path less predictable than a stable record-like shape.</p>

      <p>In performance-sensitive code, representing absence as a stable value can sometimes be friendlier to the runtime:</p>

      <pre><code>{`{
  id: 42,
  name: undefined
}`}</code></pre>

      <p>This is not a universal rule. If the object is cold, the memory trade-off may matter more. The correct engineering approach is to profile before turning an implementation detail into an architectural constraint.</p>

      <h2>Arrays have another optimisation story</h2>

      <p>Arrays are not simply objects whose properties happen to be numbers. V8 tracks specialised element representations, often described in terms of <strong>elements kinds</strong>.</p>

      <pre><code>{`const values = [1, 2, 3];
values.push(4);`}</code></pre>

      <p>A dense array of predictable values is an extremely common workload, so engines can give it compact storage and fast indexed access.</p>

      <p>Now introduce a hole:</p>

      <pre><code>{`const values = [1, 2, 3];
delete values[1];`}</code></pre>

      <p>The array now has different semantics and potentially a different internal representation. Again, the lesson is not “never delete an array element”; it is that tiny source-level changes can alter the runtime assumptions available to a JIT.</p>

      <h2>Why “make everything monomorphic” is bad advice</h2>

      <p>Performance folklore often turns a real implementation technique into an absolute rule. “Monomorphic is fast” becomes “your application should have one shape for everything”. That is not a useful target.</p>

      <p>Real systems contain heterogeneous data. Small polymorphic sites can be efficient. A domain model may genuinely require several shapes. And an object access that consumes 1% of total runtime is not worth redesigning your application around.</p>

      <p>The useful question is:</p>

      <p><strong>Is this code hot, and does profiling show runtime representation instability contributing to its cost?</strong></p>

      <h2>A practical experiment</h2>

      <p>You can build a small experiment that changes object construction history while keeping the business operation identical:</p>

      <pre><code>{`function readX(value) {
  return value.x;
}

function sameShape(i) {
  return { x: i, y: i + 1 };
}

function alternateShape(i) {
  if (i % 2 === 0) {
    return { x: i, y: i + 1 };
  }

  return { y: i + 1, x: i };
}

for (let i = 0; i < 10_000_000; i++) {
  readX(sameShape(i));
}`}</code></pre>

      <p>Compare that with the alternate construction pattern on the same Node/V8 version. Do not expect a universal slowdown factor. CPU architecture, Node version, allocation behaviour, optimisation heuristics and whether objects escape can all change the result.</p>

      <p>The valuable experiment is methodological: <strong>change one runtime property, measure, inspect, then form a hypothesis</strong>.</p>

      <h2>Why microbenchmarks lie so easily</h2>

      <p>JIT systems make timing unusually deceptive. A function can begin unoptimised, collect feedback, become optimised, encounter a new case, deoptimise and potentially reoptimise.</p>

      <p>A benchmark that runs a function only a handful of times may mostly measure startup and compilation. A long-running benchmark may measure a steady-state that a short-lived CLI process never reaches.</p>

      <p>For Node.js services, ask whether you are optimising startup latency, request latency, throughput or tail latency. They are different objectives, and JIT work has a cost that must be amortised.</p>

      <h2>The connection to garbage collection</h2>

      <p>Shape stability is only one part of the runtime. V8 also spends substantial effort managing allocations and garbage collection.</p>

      <p>A program can have beautifully predictable Maps and still be slow because it creates huge numbers of short-lived objects. Conversely, reducing allocations may matter far more than making one property access slightly easier to optimise.</p>

      <pre><code>{`JavaScript
   |
   +--> allocation
   |
   +--> object shapes
   |
   +--> inline caches
   |
   +--> optimisation feedback
   |
   +--> machine code
   |
   +--> deoptimisation
   |
   +--> garbage collection
   |
   +--> CPU cache / memory hierarchy`}</code></pre>

      <p>These mechanisms interact. Optimising one node in isolation is a common way to improve a benchmark without materially improving the application.</p>

      <h2>What this means for application architecture</h2>

      <ul>
        <li><strong>Keep hot record construction reasonably consistent</strong> when profiling shows shape instability.</li>
        <li><strong>Avoid accidental runtime heterogeneity</strong> in hot functions when one path produces fundamentally different value kinds.</li>
        <li><strong>Do not optimise cold code</strong> because an engine implementation detail sounds interesting.</li>
        <li><strong>Measure against the Node/V8 version you actually deploy.</strong> JIT heuristics evolve.</li>
        <li><strong>Optimise the data model first.</strong> A clean representation that avoids excessive allocation often matters more than a micro-optimised property lookup.</li>
      </ul>

      <h2>The bigger compiler idea: runtime partial evaluation</h2>

      <p>Ahead-of-time compilation tries to determine as much as possible before execution. A JIT has another source of information: <strong>the actual behaviour of the running program</strong>.</p>

      <p>If the runtime discovers that a receiver shape, branch or value representation is highly predictable, it can specialise the program around that observed fact.</p>

      <pre><code>{`general program
      |
      | observe runtime facts
      v
program + assumptions
      |
      v
specialised code
      |
      +-- assumptions hold --> fast
      |
      +-- assumptions fail --> recover`}</code></pre>

      <p>This is one reason dynamic languages can perform far better than their syntax might suggest. The runtime is compiling with information that a conventional ahead-of-time compiler does not have.</p>

      <h2>Sharp edges</h2>

      <ul>
        <li><strong>JavaScript objects are not simply hash maps.</strong> That is a useful language abstraction, not a complete model of V8's common representations.</li>
        <li><strong>Hidden classes do not make JavaScript statically typed.</strong> They are runtime shape information used for optimisation.</li>
        <li><strong>Deoptimisation is not a JIT failure.</strong> It is a correctness mechanism for speculative code.</li>
        <li><strong>TypeScript types do not directly describe V8 object layout.</strong> Normal annotations disappear before runtime.</li>
        <li><strong>Polymorphism is not automatically slow.</strong> A small, stable set of shapes can still be efficiently specialised.</li>
        <li><strong>Benchmark results are version-specific.</strong> V8 is a moving implementation, not a fixed specification.</li>
      </ul>

      <h2>Takeaway</h2>

      <p>V8 does not make JavaScript fast by pretending the language is static. It makes common dynamic behaviour <strong>predictable enough to specialise</strong>.</p>

      <p>Maps give objects useful shape identity. Inline caches remember what dynamic operations have observed. Runtime feedback tells the optimiser where specialisation is worthwhile. Guards protect speculative assumptions, and deoptimisation provides the escape hatch when those assumptions stop being true.</p>

      <p>The broader lesson is useful far beyond JavaScript: <strong>runtime performance can come from turning observed regularity into temporary certainty</strong>. A system does not need a universal proof that the fast case is always true. It needs a cheap way to recognise the fast case, exploit it aggressively, and recover when the assumption changes.</p>

      <div className="article__callout"><strong>Remember:</strong> when a JavaScript performance problem looks mysterious, think in terms of <em>shapes, feedback, speculation and recovery</em>. The source code tells you what the program can do; the runtime profile tells you what V8 has enough evidence to optimise.</div>
    </ArticleLayout>
  );
}
