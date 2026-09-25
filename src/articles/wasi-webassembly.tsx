import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = { slug: 'wasi-webassembly', title: 'WebAssembly Outside the Browser', subtitle: 'Why WASI treats WebAssembly like a portable systems runtime', category: 'Runtimes', description: 'WebAssembly modules, WASI capabilities and the runtime model that takes Wasm beyond web pages.', date: '2026-10-15', readingTime: 14, tags: ['WebAssembly', 'WASI', 'Runtimes', 'Sandboxing'] };

export function WasiWebAssemblyArticle() {
  return <ArticleLayout meta={meta}>
    <ArticleSection title="Wasm is not JavaScript"><p>WebAssembly is a compact binary instruction format and execution environment. It does not automatically provide a filesystem, network or operating-system API.</p><ArticleCallout>WASI exists because a portable instruction format still needs a disciplined way to interact with the outside world.</ArticleCallout></ArticleSection>
    <ArticleSection title="The runtime boundary"><ArticleDiagram items={[{title:'Wasm module',description:'Portable code and linear memory'},{title:'Wasm runtime',description:'Validate, instantiate and execute'},{title:'WASI imports',description:'Capability-oriented system interfaces'},{title:'Host',description:'OS, filesystem, network and process APIs'}]} /><p>The host controls which capabilities are exposed. A module cannot simply assume arbitrary paths or sockets exist.</p></ArticleSection>
    <ArticleSection title="Capability security"><p>WASI encourages explicit capabilities. A runtime can provide access to particular directories or services without giving a module unrestricted host access.</p></ArticleSection>
    <ArticleSection title="Why portability is interesting"><p>The same Wasm module can run inside different hosts: a browser, server runtime, edge platform or embedded application. The host supplies the environment while the module supplies portable computation.</p></ArticleSection>
    <ArticleSection title="The trade-offs"><p>Wasm is not automatically faster than native code. Boundary crossings, memory management and API availability still matter. The attraction is the combination of predictable execution, compact distribution and isolation.</p></ArticleSection>
    <ArticleSection title="Experiment"><p>Compile a small Rust, C or AssemblyScript program to Wasm, run it in a WASI-capable runtime, and inspect its imports. Then remove a capability and observe how explicitly the environment constrains the module.</p></ArticleSection>
  </ArticleLayout>;
}