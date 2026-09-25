import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCode } from '../components/article/ArticleCode';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = {
  slug: 'v8-hidden-classes',
  title: 'V8 Hidden Classes & Inline Caches',
  subtitle: 'Why JavaScript objects can behave like optimised structs',
  category: 'JavaScript',
  description: 'Hidden classes, property transitions, inline caches and the optimisation strategies behind fast dynamic JavaScript.',
  date: '2026-09-29',
  readingTime: 14,
  tags: ['JavaScript', 'V8', 'Performance', 'JIT'],
};

export function V8HiddenClassesArticle() {
  return <ArticleLayout meta={meta}>
    <ArticleSection title="Dynamic objects, static-like performance">
      <p>JavaScript lets objects change shape at runtime. Yet modern engines can optimise repeated property access by tracking the shapes objects tend to have. V8 calls these internal shapes hidden classes or Maps.</p>
      <ArticleCallout>The engine does not need to turn JavaScript into C++ structs. It can observe stable object layouts and specialise machine code around them.</ArticleCallout>
    </ArticleSection>
    <ArticleSection title="Shape transitions">
      <ArticleCode>{`const a = {};
a.x = 1;
a.y = 2;

const b = {};
b.x = 3;
b.y = 4;`}</ArticleCode>
      <p>Objects created and populated in the same order can share a compatible hidden class. Adding properties in different orders can create different shapes.</p>
      <ArticleDiagram items={[
        { title: 'Empty shape', description: 'Initial object layout.' },
        { title: '+ x', description: 'Transition after adding x.' },
        { title: '+ y', description: 'Transition after adding y.' },
      ]} />
    </ArticleSection>
    <ArticleSection title="Inline caches">
      <p>Suppose a function repeatedly evaluates obj.x. The engine can remember which object shape appeared at that access site and generate a fast path for it. If many unrelated shapes arrive, the cache becomes more complicated and may lose optimisation opportunities.</p>
    </ArticleSection>
    <ArticleSection title="Why object construction style matters">
      <p>Consistent property creation order, stable object shapes and avoiding unnecessary shape mutations can help hot code remain predictable. This is a performance consideration, not a reason to contort normal application code.</p>
    </ArticleSection>
    <ArticleSection title="JIT optimisation is speculative">
      <p>V8 can optimise based on observed behaviour and later deoptimise if its assumptions become false. That is why microbenchmarks can be misleading: the first iterations may execute very differently from warmed-up code.</p>
    </ArticleSection>
    <ArticleSection title="A useful experiment">
      <p>Compare a tight loop over consistently shaped objects with one that creates many different shapes. Use a CPU profile rather than relying only on elapsed wall-clock time.</p>
      <ArticleCode>{`function readX(o) {
  return o.x + 1;
}

for (const item of items) {
  total += readX(item);
}`}</ArticleCode>
    </ArticleSection>
    <ArticleSection title="The bigger idea">
      <p>Dynamic language performance is often about the runtime discovering hidden regularity. V8 turns patterns in ordinary JavaScript into opportunities for specialised machine code, then protects correctness with guards and deoptimisation.</p>
    </ArticleSection>
  </ArticleLayout>;
}
