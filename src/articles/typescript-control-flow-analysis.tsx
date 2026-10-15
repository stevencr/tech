import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'typescript-control-flow-analysis',
  title: "TypeScript's Control-Flow Engine: Why Narrowing Appears, Disappears, and Lies by Omission",
  subtitle: 'How the compiler tracks possible values through branches, assignments, aliases, closures and discriminated unions — and where its model necessarily stops.',
  category: 'Compiler & Type-System Internals',
  description: 'A senior-level exploration of TypeScript control-flow analysis, flow-sensitive narrowing, discriminated unions, closure boundaries, generic types, exhaustiveness and the limits of static reasoning.',
  date: '2026-10-16',
  readingTime: 24,
  tags: ['TypeScript', 'Compilers', 'Type Systems', 'Static Analysis', 'Control Flow', 'JavaScript'],
};

export function TypeScriptControlFlowAnalysisArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>TypeScript can tell that a value is a string inside one branch, a number after another assignment, and possibly undefined at a later call site — all without changing JavaScript's runtime behaviour. That is not just a collection of convenient syntax rules. It is a form of flow-sensitive static analysis.</p>
      <p>The compiler reasons about which values can reach a particular point in a program. Conditions remove possibilities, assignments introduce new ones, and control-flow paths merge. The result is powerful, but deliberately incomplete: TypeScript does not execute your program, prove arbitrary functions correct, or model every mutation that can happen through aliases and callbacks.</p>
      <p>Understanding that boundary is the difference between using narrowing as a reliable design tool and treating it as an oracle.</p>

      <div className="diagram">
        <div><strong>Declared type</strong><small>All permitted values</small></div>
        <div><strong>Control flow</strong><small>Branches and assignments</small></div>
        <div><strong>Flow type</strong><small>What can reach here</small></div>
        <div><strong>Type check</strong><small>Operation must be safe</small></div>
      </div>

      <h2>1. A variable has more than one useful type</h2>
      <p>Consider a variable declared as <code>string | number</code>. Its declared type describes the set of values the program is allowed to assign to it. At a particular line, however, the compiler may know more.</p>
      <pre><code>function format(value: string | number) &#123;
  if (typeof value === 'string') &#123;
    return value.toUpperCase();
  &#125;

  return value.toFixed(2);
&#125;</code></pre>
      <p>Inside the first branch, the value is treated as a string. After that branch returns, the remaining path can only contain a number, so <code>toFixed</code> is accepted.</p>
      <p>The declared type did not change. The compiler derived a narrower type for a particular program point from the path conditions that lead there. This is often called a <em>flow type</em> or a narrowed type.</p>
      <p>That distinction explains a lot of TypeScript behaviour. A variable's declared type is not simply replaced permanently whenever a condition narrows it. The compiler continually reasons about the value at each location in the control flow.</p>

      <h2>2. Think in terms of a control-flow graph</h2>
      <p>Compilers often model a program as a graph of basic blocks and edges. A condition creates alternative paths; a return removes a path from the rest of the function; a loop introduces a path back to an earlier point; and a join point combines paths that can reach the same statement.</p>
      <pre><code>             value: string | number
                       |
                 typeof value
                  /          \
             string          number
                |               |
          toUpperCase()      toFixed()
                |               |
              return          return</code></pre>
      <p>TypeScript's checker uses internal flow information to answer questions such as “what type can this reference have here?” The implementation has compiler-internal flow nodes and logic for following the effects of conditions, assignments and control-flow joins. Those structures are implementation details, not a public API, but the graph model is a useful way to reason about the behaviour.</p>
      <p>The checker does not need to permanently annotate every variable with a single new type after every statement. It can derive the relevant type at a use site by following the flow information that reaches it.</p>
      <p>That is why the same variable can have a union type at a join point, a narrower type inside one branch, and a different type after an assignment.</p>

      <h2>3. Narrowing is the removal of impossible alternatives</h2>
      <p>For a union such as <code>string | number | null</code>, a condition can eliminate alternatives. A <code>typeof</code> check is one source of evidence, but it is not the only one.</p>
      <pre><code>function describe(value: string | number | null) &#123;
  if (value === null) &#123;
    return 'missing';
  &#125;

  if (typeof value === 'number') &#123;
    return value.toFixed(1);
  &#125;

  return value.toUpperCase();
&#125;</code></pre>
      <p>The first branch removes <code>null</code> from the path that continues. The second branch selects the number alternative. The final path therefore contains a string.</p>
      <p>Other narrowing evidence includes equality checks, <code>in</code> checks, <code>instanceof</code>, discriminant properties, truthiness checks, assignments, and user-defined type predicates.</p>
      <p>These mechanisms are not interchangeable. Each supplies a different kind of evidence and has different edge cases. For example, <code>typeof value === 'object'</code> includes <code>null</code> in JavaScript, so it is not equivalent to “this is a non-null object”.</p>

      <h2>4. Assignments change the flow type again</h2>
      <p>Narrowing is not a one-way journey toward certainty. Assignments can widen the possibilities at a later program point, or replace them with a new type that is compatible with the variable's declared type.</p>
      <pre><code>function example(flag: boolean) &#123;
  let value: string | number = 'ready';

  if (flag) &#123;
    value = 42;
  &#125;

  // At this join point, value may be a string or a number.
  value;
&#125;</code></pre>
      <p>The compiler considers both reachable paths. On one path, the variable still contains a string. On the other, it contains a number. Their possibilities are combined at the join point.</p>
      <p>Now consider an assignment after a narrowing:</p>
      <pre><code>function update(value: string | number) &#123;
  if (typeof value === 'string') &#123;
    value.toUpperCase();
    value = 123;
    value.toFixed(1);
  &#125;
&#125;</code></pre>
      <p>The assignment establishes a new fact. The later call is checked against the number value, not against the earlier string narrowing. Narrowing is about the current flow state, not a permanent property of the variable.</p>

      <h2>5. Joins are where unions come back</h2>
      <p>Suppose two branches assign different types:</p>
      <pre><code>let result: string | number;

if (Math.random() &gt; 0.5) &#123;
  result = 'cached';
&#125; else &#123;
  result = 404;
&#125;

// Both assignments can reach this point.
result;</code></pre>
      <p>Neither branch is preferred at the join. The type must represent the values that can arrive from either predecessor. For ordinary unions, this means the possibilities are combined.</p>
      <p>This is related to a classic compiler-analysis problem: a fact is useful only when it remains true along every path that reaches the operation. A condition may prove that a value is a string on one path, but if another path reaches the same operation with a number, the merged fact cannot say “string” unconditionally.</p>
      <p>It is helpful to think of narrowing as a path-sensitive fact rather than a global declaration update.</p>

      <h2>6. Discriminated unions encode state machines</h2>
      <p>One of TypeScript's most effective patterns is a discriminated union: several object shapes share a property whose literal value identifies the variant.</p>
      <pre><code>type RequestState =
  | &#123; status: 'idle' &#125;
  | &#123; status: 'loading'; startedAt: number &#125;
  | &#123; status: 'success'; data: string[] &#125;
  | &#123; status: 'error'; message: string &#125;;

function render(state: RequestState) &#123;
  switch (state.status) &#123;
    case 'idle':
      return 'Ready';
    case 'loading':
      return String(state.startedAt);
    case 'success':
      return state.data.join(', ');
    case 'error':
      return state.message;
  &#125;
&#125;</code></pre>
      <p>The discriminant is more than a label. It correlates the tag with the available properties of each member. When the checker learns that <code>status</code> is <code>'success'</code>, it can select the corresponding object shape and permit access to <code>data</code>.</p>
      <p>This makes discriminated unions a lightweight way to model state machines. They prevent impossible combinations such as a request being marked successful while carrying only an error message, provided the value was constructed and validated in a way that respects the type.</p>
      <p>Use literal discriminants that describe the state, not a loosely related boolean when the domain has several meaningful variants. A union of explicit states usually produces clearer narrowing and better diagnostics.</p>

      <h2>7. Exhaustiveness is a proof obligation at a join</h2>
      <p>What happens when a new state is added to the union? A switch statement that does not handle it may continue compiling unless the function's return type or another check exposes the missing path.</p>
      <pre><code>function assertNever(value: never): never &#123;
  throw new Error('Unexpected state');
&#125;

function renderStrict(state: RequestState): string &#123;
  switch (state.status) &#123;
    case 'idle':
      return 'Ready';
    case 'loading':
      return String(state.startedAt);
    case 'success':
      return state.data.join(', ');
    case 'error':
      return state.message;
    default:
      return assertNever(state);
  &#125;
&#125;</code></pre>
      <p>At the default branch, the intended argument type is <code>never</code>: there should be no remaining member of the union. If someone adds a new variant without handling it, <code>state</code> is no longer <code>never</code> there and the compiler reports an error.</p>
      <p>This is a useful form of change detection. It turns the addition of a new domain state into a compile-time obligation to review code that assumes the state space is complete.</p>
      <p>Exhaustiveness does not validate untrusted JSON. It only reasons about the static type that the program claims the value has. Runtime data still needs validation before it can safely enter the typed domain.</p>

      <h2>8. Truthiness is evidence, but often the wrong evidence</h2>
      <p>Truthiness narrowing is concise:</p>
      <pre><code>function greeting(name: string | undefined) &#123;
  if (name) &#123;
    return 'Hello ' + name.toUpperCase();
  &#125;

  return 'Hello stranger';
&#125;</code></pre>
      <p>But the test does not mean “a name was supplied”. It means the value is truthy. An empty string is a valid string value but is falsy. The same issue appears with zero, false and <code>NaN</code> in domains where those values may be meaningful.</p>
      <p>If the domain distinction is presence versus absence, prefer a check that expresses that distinction:</p>
      <pre><code>function greetingExact(name: string | undefined) &#123;
  if (name !== undefined) &#123;
    return 'Hello ' + name.toUpperCase();
  &#125;

  return 'Hello stranger';
&#125;</code></pre>
      <p>The lesson is not to avoid truthiness. It is to choose a condition whose runtime semantics match the invariant you actually want to establish.</p>

      <h2>9. The in operator and optional properties</h2>
      <p>The <code>in</code> operator can distinguish object variants based on property presence. But property presence is not always the same as the property having a useful value.</p>
      <pre><code>type ById = &#123; id: string; name?: never &#125;;
type ByName = &#123; name: string; id?: never &#125;;

type Lookup = ById | ByName;

function label(item: Lookup) &#123;
  if ('id' in item) &#123;
    return item.id.toUpperCase();
  &#125;

  return item.name.toUpperCase();
&#125;</code></pre>
      <p>With optional properties, the compiler may need to consider members on either side of an <code>in</code> test, because a property can be optional or present with an undefined value. The exact narrowing depends on the declared union and compiler options.</p>
      <p>Do not use property presence as a substitute for validation unless the data model guarantees that the property is meaningful. When modelling exclusive variants, literal discriminants are often more direct than trying to infer state from optional-property combinations.</p>

      <h2>10. Aliasing makes local reasoning harder</h2>
      <p>A variable can be narrowed while the object it refers to remains mutable through another reference. Consider a property that can hold either a string or a number.</p>
      <pre><code>type Box = &#123; value: string | number &#125;;

function transform(box: Box) &#123;
  if (typeof box.value === 'string') &#123;
    box.value.toUpperCase();
    box.value = 42;
    box.value.toFixed(1);
  &#125;
&#125;</code></pre>
      <p>The compiler can see the direct assignment and update its reasoning. The harder case is mutation that happens through an alias, a callback, or a function whose implementation is not available for local analysis.</p>
      <pre><code>type Box = &#123; value: string | number &#125;;

function replace(box: Box) &#123;
  box.value = 100;
&#125;

function use(box: Box) &#123;
  if (typeof box.value === 'string') &#123;
    replace(box);
    box.value.toUpperCase();
  &#125;
&#125;</code></pre>
      <p>TypeScript does not perform arbitrary interprocedural effect analysis to prove what every called function may mutate. Its behaviour around a specific property and call depends on the flow construct involved, and a narrowing may remain available even when the function could mutate through an alias.</p>
      <p>This is an important boundary: a successful type check is not a proof that no code can mutate the underlying object. If the invariant matters, prefer immutable data, return a new value, or re-check the property after a potentially mutating call. A defensive local copy can also make the intended snapshot explicit.</p>

      <h2>11. Closures create a temporal reasoning problem</h2>
      <p>A narrowing inside a callback can be subtle because the callback may run later, after the surrounding variable has changed.</p>
      <pre><code>function schedule() &#123;
  let value: string | undefined = 'ready';

  if (value !== undefined) &#123;
    setTimeout(() =&gt; &#123;
      console.log(value.toUpperCase());
    &#125;, 0);
  &#125;

  value = undefined;
&#125;</code></pre>
      <p>In JavaScript, the callback closes over the variable binding, not a frozen copy of the value at the moment the callback is created. The callback can execute after the assignment to <code>undefined</code>.</p>
      <p>TypeScript's closure analysis has improved over time. For example, modern versions can preserve certain narrowings in non-hoisted closures when a variable is effectively stable after its last assignment. But the compiler does not model every possible callback schedule or arbitrary mutation of captured state.</p>
      <p>If a value must remain a string for the callback, make that invariant explicit by capturing a stable local value after the check:</p>
      <pre><code>function scheduleSafe() &#123;
  let value: string | undefined = 'ready';

  if (value !== undefined) &#123;
    const captured = value;

    setTimeout(() =&gt; &#123;
      console.log(captured.toUpperCase());
    &#125;, 0);
  &#125;

  value = undefined;
&#125;</code></pre>
      <p>The local <code>captured</code> is a string value for this path. It is not the same mutable binding as <code>value</code>. This pattern helps both the human reader and the type checker.</p>

      <h2>12. Narrowing a generic value does not rewrite the generic contract</h2>
      <p>Generics add another boundary. A type parameter represents a type chosen by the caller, subject to its constraint. Narrowing a value of a generic type does not necessarily mean the type parameter itself can be replaced with a concrete type.</p>
      <pre><code>function echo&lt;T extends string | number&gt;(value: T): T &#123;
  if (typeof value === 'string') &#123;
    // value is usable as a string on this path.
    value.toUpperCase();
  &#125;

  return value;
&#125;</code></pre>
      <p>The function promises to return the caller's type <code>T</code>, not merely some member of the constraint <code>string | number</code>. The checker can narrow the expression for an operation, while preserving the generic relationship in the function's contract.</p>
      <p>This distinction becomes more visible with conditional types and generic assignments. A runtime test can establish a fact about the current value, but it does not automatically prove every proposition involving the abstract type parameter.</p>
      <p>When a generic implementation becomes awkward, ask whether it truly needs to preserve the caller's exact type relationship. Sometimes the honest solution is to return a union or use overloads. Forcing the implementation to promise more than it can prove often leads to type assertions that merely silence the checker.</p>

      <h2>13. User-defined predicates are trusted claims</h2>
      <p>Type predicates let a function tell the compiler that a value has a particular type after the function returns true.</p>
      <pre><code>function isString(value: unknown): value is string &#123;
  return typeof value === 'string';
&#125;

function show(value: unknown) &#123;
  if (isString(value)) &#123;
    return value.toUpperCase();
  &#125;
&#125;</code></pre>
      <p>The compiler uses the predicate's declared claim. It does not generally prove that the implementation justifies it. A dishonest predicate can create an unsound program.</p>
      <pre><code>function isStringButWrong(value: unknown): value is string &#123;
  return true;
&#125;</code></pre>
      <p>This function compiles despite being incorrect. Once its result is trusted, downstream code is permitted to treat any value as a string.</p>
      <p>Type predicates should therefore be treated like a small verification boundary. Test them, keep them simple, and derive the check from the actual runtime representation. For external data, schema validation libraries can be useful because they combine runtime checks with a typed result.</p>

      <h2>14. Assertions change the checker, not the value</h2>
      <p>A type assertion such as <code>value as string</code> does not perform a conversion or runtime check. It tells the compiler to accept a type claim under TypeScript's assertion rules.</p>
      <pre><code>const raw: unknown = JSON.parse(text);
const user = raw as &#123; id: string; name: string &#125;;</code></pre>
      <p>The second line does not verify that the parsed value is an object or that its properties are strings. It merely changes the static view used by later checks.</p>
      <p>This is especially dangerous at trust boundaries: HTTP responses, local storage, message queues, environment variables and database values whose runtime representation can differ from the declaration.</p>
      <p>A safer pipeline is:</p>
      <pre><code>unknown input
     |
     v
runtime validation
     |
     v
typed domain value
     |
     v
business logic</code></pre>
      <p>Keep <code>unknown</code> at boundaries until evidence has been collected. It forces the code to narrow the value or validate it before using operations that assume a specific shape.</p>

      <h2>15. satisfies preserves useful inference</h2>
      <p>Type annotations can sometimes widen a value more than you want. The <code>satisfies</code> operator checks that an expression conforms to a target type while generally preserving the expression's more specific inferred type.</p>
      <pre><code>type Route = &#123;
  method: 'GET' | 'POST';
  auth: boolean;
&#125;;

const routes = &#123;
  health: &#123; method: 'GET', auth: false &#125;,
  save: &#123; method: 'POST', auth: true &#125;,
&#125; satisfies Record&lt;string, Route&gt;;</code></pre>
      <p>The object is checked against the route contract without simply declaring the entire variable to be a broad <code>Record&lt;string, Route&gt;</code>. That can preserve useful knowledge about the keys that actually exist.</p>
      <p>There is a nuance: contextual typing can influence inference inside the expression, so <code>satisfies</code> is not a universal promise that every literal will retain its narrowest possible type. Use it to validate configuration while keeping useful inference, and inspect the inferred type when the distinction matters.</p>
      <p>It is a compile-time check, not runtime validation. If the configuration comes from JSON or another untrusted source, it still needs runtime checking.</p>

      <h2>16. Compiler options change the evidence you get</h2>
      <p>Control-flow analysis does not operate in isolation. Compiler options determine which unsafe possibilities are represented in the type system and which diagnostics are produced.</p>
      <ul>
        <li><code>strictNullChecks</code> makes null and undefined distinct types that must be handled rather than silently accepted everywhere.</li>
        <li><code>noUncheckedIndexedAccess</code> makes indexed access reflect the possibility that an element is absent, depending on the expression and type.</li>
        <li><code>exactOptionalPropertyTypes</code> distinguishes an omitted optional property from a property explicitly assigned undefined in more situations.</li>
        <li><code>useUnknownInCatchVariables</code> prevents caught values from being assumed to be errors with known properties.</li>
      </ul>
      <p>These options do not make the compiler omniscient. They improve the model of uncertainty that the program must address. A codebase that disables strict null checking gives the checker less information and can hide precisely the cases where narrowing is most useful.</p>

      <h2>17. A practical experiment: ask the compiler</h2>
      <p>Create a small file and compile it with strict checking enabled:</p>
      <pre><code>npx tsc --strict --noEmit narrowing-lab.ts</code></pre>
      <p>Then make one change at a time:</p>
      <ol>
        <li>Add a union member and see which branches stop being exhaustive.</li>
        <li>Move an assignment before or after a condition.</li>
        <li>Replace an exact undefined check with a truthiness check.</li>
        <li>Move a narrowed value into a callback and mutate the captured variable afterwards.</li>
        <li>Replace a runtime guard with a type assertion and notice which guarantee has disappeared.</li>
      </ol>
      <p>The most useful question is not merely “does this compile?” It is “which fact did the checker learn, where did it learn it, and what later operation invalidated or preserved that fact?”</p>
      <p>For deeper exploration, inspect the TypeScript compiler source around flow-type lookup and control-flow node handling. Treat those internals as explanatory rather than stable APIs; the language's documented behaviour is the contract, while the implementation can evolve.</p>

      <h2>18. The design lesson: make invariants local and explicit</h2>
      <p>Flow-sensitive analysis is strongest when the relevant facts are local, the state representation is explicit, and mutation is easy to see.</p>
      <p>Discriminated unions make legal states explicit. Exhaustive switches make new states visible. Immutable values reduce the distance between a check and the operation that relies on it. Runtime validation turns uncertain external data into a domain value that the rest of the program can safely reason about.</p>
      <p>By contrast, broad mutable objects, aliases, callbacks with hidden effects and assertions create gaps between what the checker can establish and what the program actually does.</p>

      <h2>Sharp edges worth remembering</h2>
      <ul>
        <li><strong>Declared type is not flow type.</strong> A variable can be narrower at one line without changing its declared contract.</li>
        <li><strong>Joins combine reachable possibilities.</strong> If two paths reach a statement with different types, the result must represent both.</li>
        <li><strong>Assignments change the facts.</strong> A previous narrowing does not survive every later write.</li>
        <li><strong>Truthiness is not presence.</strong> Empty strings, zero and false can be valid domain values.</li>
        <li><strong>Aliasing hides mutation.</strong> The compiler does not prove arbitrary effects across every function call.</li>
        <li><strong>Closures capture bindings.</strong> A callback may observe a later value unless you capture a stable one.</li>
        <li><strong>Generic constraints are not exact types.</strong> Narrowing a value does not automatically replace the caller's type parameter.</li>
        <li><strong>Predicates and assertions are trust points.</strong> The checker can accept a claim without proving that runtime data satisfies it.</li>
        <li><strong>Compile-time types do not validate JSON.</strong> External values need runtime checks.</li>
      </ul>

      <div className="article__callout"><strong>Takeaway:</strong> TypeScript narrowing is a flow-sensitive analysis of the values that can reach a program point. Use it to encode explicit state transitions and make invariants local, but remember that the compiler reasons from the code and types it can see — not from every possible runtime mutation.</div>
    </ArticleLayout>
  );
}
