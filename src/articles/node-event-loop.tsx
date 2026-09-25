import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCode } from '../components/article/ArticleCode';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = {
  slug: 'node-event-loop',
  title: 'Node.js Event Loop',
  subtitle: 'What actually happens between two JavaScript callbacks',
  category: 'Node.js',
  description: 'libuv, event-loop phases, timers, I/O readiness, microtasks and the real meaning of asynchronous JavaScript.',
  date: '2026-09-28',
  readingTime: 15,
  tags: ['Node.js', 'JavaScript', 'libuv', 'Async'],
};

export function NodeEventLoopArticle() {
  return <ArticleLayout meta={meta}>
    <ArticleSection title="JavaScript is not secretly multi-threaded">
      <p>Node executes JavaScript on a main thread, but that does not mean the process can only do one useful thing at a time. I/O operations are coordinated by Node and libuv while the JavaScript thread runs callbacks when their work is ready.</p>
      <ArticleCallout>Asynchronous does not mean “JavaScript runs in parallel”. It means work can be started now and its continuation can run later.</ArticleCallout>
    </ArticleSection>
    <ArticleSection title="libuv is the machinery underneath">
      <ArticleDiagram items={[
        { title: 'JavaScript', description: 'Your code and callbacks execute on the V8 thread.' },
        { title: 'Node APIs', description: 'Translate JavaScript operations into native work.' },
        { title: 'libuv', description: 'Coordinates I/O, timers, polling and worker-pool tasks.' },
        { title: 'OS', description: 'Provides sockets, files, clocks and other primitives.' },
      ]} />
    </ArticleSection>
    <ArticleSection title="The event-loop phases">
      <p>The loop progresses through phases including timers, pending callbacks, poll, check and close callbacks. The exact details matter when callbacks compete for execution order.</p>
      <ArticleCode>{`setTimeout(() => console.log('timer'), 0);
setImmediate(() => console.log('immediate'));
Promise.resolve().then(() => console.log('microtask'));`}</ArticleCode>
      <p>The output is not explained by a single simple “queue”. Microtasks have their own scheduling semantics and Node also has process.nextTick, which has particularly strong priority.</p>
    </ArticleSection>
    <ArticleSection title="The worker pool is a separate story">
      <p>Some expensive native operations, such as certain filesystem, crypto and DNS tasks, can use libuv's worker pool. Increasing the pool is not a general solution for CPU-heavy JavaScript: JavaScript itself still executes on the main thread.</p>
    </ArticleSection>
    <ArticleSection title="Why one blocking function hurts everyone">
      <p>If JavaScript spends 500ms doing synchronous computation, no callback can run during that interval. A server handling thousands of connections can therefore suffer from one apparently small blocking operation.</p>
      <ArticleCallout>For Node services, latency is often constrained by event-loop responsiveness as much as by raw throughput.</ArticleCallout>
    </ArticleSection>
    <ArticleSection title="Measure the loop">
      <p>Node exposes APIs and diagnostics for observing event-loop delay. Combine those measurements with CPU profiling rather than assuming every latency problem is a database problem.</p>
      <ArticleCode>{`node --trace-event-categories node.perf app.js
node --prof app.js`}</ArticleCode>
    </ArticleSection>
    <ArticleSection title="The bigger idea">
      <p>Node's concurrency model is a carefully layered collaboration between V8, Node's native bindings, libuv and the operating system. Understanding those boundaries makes promises, streams, timers and performance behaviour much easier to reason about.</p>
    </ArticleSection>
  </ArticleLayout>;
}
