import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCode } from '../components/article/ArticleCode';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = {
  slug: 'wasm-component-model',
  title: 'The WebAssembly Component Model',
  subtitle: 'From portable bytecode to composable software components',
  category: 'WebAssembly',
  description:
    'How WebAssembly components use typed interfaces, canonical ABI lifting and lowering, and worlds to make independently built modules composable.',
  date: '2026-09-25',
  readingTime: 14,
  tags: ['WebAssembly', 'WASI', 'ABI', 'Runtimes', 'Architecture'],
};

export function WasmComponentModelArticle() {
  return (
    <ArticleLayout meta={meta}>
      <ArticleSection title="Why WebAssembly needed another layer">
        <p>
          WebAssembly solved a surprisingly narrow problem: execute a compact, portable instruction set safely inside a host. A Wasm module has linear memory, tables, globals, functions and imports/exports. That is excellent for sandboxed computation, but awkward for software composition.
        </p>
        <p>
          Suppose a Rust component exports a function that returns a list of records and a TypeScript application wants to consume it. Raw Wasm exports do not understand strings, records, lists or errors. They understand numbers, references and memories. Every integration therefore needs an ABI agreement about where bytes live, how strings are encoded, who owns memory and what a returned pointer means.
        </p>
        <ArticleCallout>
          The Component Model is essentially an interface and ABI layer above core WebAssembly. It lets a host and independently compiled components agree on rich types without agreeing on a language-specific calling convention.
        </ArticleCallout>
      </ArticleSection>

      <ArticleSection title="Core Wasm versus components">
        <ArticleDiagram
          items={[
            { title: 'Core Wasm', description: 'Instructions, memories, tables, globals and numeric function signatures.' },
            { title: 'Component Model', description: 'Typed interfaces, resources, composition and canonical ABI rules.' },
            { title: 'WASI', description: 'Standardised capabilities such as files, clocks, sockets and random data.' },
            { title: 'Host', description: 'A runtime embeds components and supplies the actual capabilities.' },
          ]}
        />
        <p>
          This separation is important. The Component Model does not replace the Wasm virtual machine. A component is a higher-level package whose internals can contain one or more core Wasm modules. A runtime such as Wasmtime can instantiate the component and connect its typed imports and exports.
        </p>
      </ArticleSection>

      <ArticleSection title="The type system changes the game">
        <p>
          Component interfaces describe values using language-neutral types: strings, lists, records, variants, tuples, options and results. Interfaces are commonly written using WIT, the WebAssembly Interface Type format.
        </p>
        <ArticleCode>{`package example:payments;

interface payment-service {
  record payment {
    id: string,
    amount: float64,
    currency: string,
  }

  get-payment: func(id: string) -> result<payment, string>;
}`}</ArticleCode>
        <p>
          A Rust implementation and a different-language consumer can both generate bindings from this interface. The application code sees native-looking values, while the generated bindings handle the conversion to and from the low-level representation.
        </p>
      </ArticleSection>

      <ArticleSection title="Lifting and lowering: the hidden machinery">
        <p>
          The key mechanism is the canonical ABI. When a component calls a function using a rich value, the runtime has to translate that value into something the underlying core Wasm module can consume. This is called lowering. Converting the result back into the component-level type is lifting.
        </p>
        <ArticleDiagram
          items={[
            { title: 'Component value', description: 'string, list, record, result, resource' },
            { title: 'Lower', description: 'Encode value into the canonical ABI representation' },
            { title: 'Core Wasm', description: 'Numeric parameters, pointers, lengths and memory' },
            { title: 'Lift', description: 'Decode and reconstruct the component value' },
          ]}
        />
        <p>
          For a string, this can mean passing a pointer and length into linear memory while generated glue code performs allocation, copying and ownership management. The component contract hides those details from the caller.
        </p>
        <ArticleCallout>
          This is one of the most important architectural ideas here: the interface is stable even when the implementation language, internal memory layout and generated glue change.
        </ArticleCallout>
      </ArticleSection>

      <ArticleSection title="Resources are more interesting than values">
        <p>
          Plain values are easy to copy. A file handle, database connection or open socket is not. The Component Model therefore has a resource abstraction representing an opaque host-managed handle with controlled lifetime and methods.
        </p>
        <ArticleCode>{`interface key-value-store {
  resource store;

  open: func(name: string) -> result<store, string>;
  get: func(s: borrow<store>, key: string) -> result<list<u8>, string>;
  close: func(s: store);
}`}</ArticleCode>
        <p>
          A component does not receive a raw operating-system pointer. It receives an opaque resource identity. The host runtime controls what that identity can do, which fits naturally with capability-based security.
        </p>
      </ArticleSection>

      <ArticleSection title="Worlds: describing an entire contract">
        <p>
          An interface describes a group of functions and types. A world describes the complete boundary of a component: what it imports and what it exports. This makes a world similar to a module contract or a dependency graph.
        </p>
        <ArticleCode>{`world image-processor {
  import wasi:filesystem/types@0.2.0;
  import wasi:clocks/wall-clock@0.2.0;

  export process-image: func(
    input: list<u8>
  ) -> result<list<u8>, string>;
}`}</ArticleCode>
        <p>
          The interesting consequence is composability. One component can satisfy an interface required by another without either component needing to know that the other was written in Rust, Go, C++, JavaScript or something else supported by the toolchain.
        </p>
      </ArticleSection>

      <ArticleSection title="Why this is useful outside the browser">
        <p>
          WebAssembly is often introduced as “JavaScript acceleration”, but the Component Model points in a different direction. It can act as a portable application-component boundary for servers, plugins, edge workloads and embedded systems.
        </p>
        <ul>
          <li>Plugin systems can execute third-party components inside a sandbox.</li>
          <li>Cloud platforms can move components between runtimes without shipping a whole operating-system image.</li>
          <li>Polyglot teams can expose stable contracts without designing a bespoke FFI.</li>
          <li>Security boundaries can be expressed as explicit imported capabilities.</li>
          <li>CLI tools can package portable functionality without requiring the consumer to install the original language runtime.</li>
        </ul>
      </ArticleSection>

      <ArticleSection title="The trade-offs">
        <p>
          This is not a universal replacement for shared libraries or containers. There is still a runtime cost, and crossing a component boundary may involve allocation, encoding and copying. Complex object graphs can become expensive if an API is designed without attention to ownership and data movement.
        </p>
        <p>
          Tooling is another consideration. The Component Model, WIT ecosystem and WASI standards are evolving, so versioning and runtime support matter. The promise of portability is strongest when interfaces are deliberately small and capability-oriented.
        </p>
        <ArticleCallout>
          A good component boundary should look boring: explicit inputs, explicit outputs, small capabilities and predictable ownership. The more implicit state leaks across the boundary, the less portable the component becomes.
        </ArticleCallout>
      </ArticleSection>

      <ArticleSection title="A useful experiment">
        <p>
          Install a WebAssembly runtime such as Wasmtime and generate bindings for a tiny WIT interface. Implement one function in Rust, compile it to a component, then consume it from a different host language. Inspect the generated bindings and look specifically for where strings and lists are allocated, copied and freed.
        </p>
        <p>
          The experiment becomes much more interesting if you deliberately pass a large list or return a large string. Measure the difference between doing computation inside the component and repeatedly crossing the component boundary. You will see why interface design and data locality remain important even with a standard ABI.
        </p>
      </ArticleSection>

      <ArticleSection title="The bigger idea">
        <p>
          The Component Model is an attempt to make software composition happen at a level above machine instructions but below application protocols. Instead of shipping an entire application as one inseparable unit, you can imagine a graph of small, typed, sandboxed components connected by explicit capabilities.
        </p>
        <p>
          That makes WebAssembly interesting even when a browser is nowhere in sight. The deeper idea is portable computation with a language-neutral ABI and a security boundary that is part of the architecture rather than an afterthought.
        </p>
      </ArticleSection>
    </ArticleLayout>
  );
}
