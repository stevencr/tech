import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCode } from '../components/article/ArticleCode';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = {
  slug: 'typescript-compiler',
  title: 'Inside the TypeScript Compiler',
  subtitle: 'How .ts becomes types, symbols and JavaScript',
  category: 'TypeScript',
  description: 'Parsing, ASTs, binders, symbol tables, type checking, transformers and TypeScript’s relationship with JavaScript.',
  date: '2026-10-04',
  readingTime: 16,
  tags: ['TypeScript', 'Compiler', 'AST', 'Type System'],
};

export function TypescriptCompilerArticle() {
  return <ArticleLayout meta={meta}>
    <ArticleSection title="TypeScript is a compiler, not a runtime">
      <p>TypeScript analyses source code and emits JavaScript. The browser or Node does not execute TypeScript's static types. Most of the type system disappears before runtime.</p>
      <ArticleCallout>The compiler has two very different jobs: understanding the program for type analysis and producing executable JavaScript.</ArticleCallout>
    </ArticleSection>
    <ArticleSection title="The pipeline">
      <ArticleDiagram items={[
        { title: 'Scanner', description: 'Turns source text into tokens.' },
        { title: 'Parser', description: 'Builds an abstract syntax tree.' },
        { title: 'Binder', description: 'Creates symbols and connects declarations.' },
        { title: 'Checker', description: 'Performs semantic and type analysis.' },
        { title: 'Emitter', description: 'Produces JavaScript, declarations and source maps.' },
      ]} />
    </ArticleSection>
    <ArticleSection title="The AST is only the beginning">
      <p>The parser creates syntax nodes. Later phases add meaning through symbols and types. A declaration such as a function introduces a symbol that can be referenced elsewhere, while the checker resolves what those references mean.</p>
      <ArticleCode>{`const answer: number = 42;

function double(value: number) {
  return value * 2;
}`}</ArticleCode>
    </ArticleSection>
    <ArticleSection title="Structural typing happens in the checker">
      <p>TypeScript's compatibility model is largely structural: two object types can be compatible because their members satisfy the required shape, even when they were declared separately. This is a checker decision, not a JavaScript runtime feature.</p>
    </ArticleSection>
    <ArticleSection title="Why incremental builds can be fast">
      <p>Modern TypeScript builds can preserve information between compilations. Project references and build information let the compiler avoid redoing work whose relevant inputs have not changed.</p>
      <ArticleCode>{`tsc --build
tsc --build --watch`}</ArticleCode>
    </ArticleSection>
    <ArticleSection title="Compiler API experiments">
      <p>The compiler exposes APIs that let tools inspect source files and types. This is the foundation for linters, code generators, refactoring tools and editor features.</p>
      <ArticleCallout>Many “IDE magic” features are compiler-powered program analysis exposed through language tooling protocols and APIs.</ArticleCallout>
    </ArticleSection>
    <ArticleSection title="The bigger idea">
      <p>TypeScript is a useful case study in a gradual type system layered onto an existing language. It must preserve JavaScript's runtime model while building a substantial compile-time semantic model on top.</p>
    </ArticleSection>
  </ArticleLayout>;
}
