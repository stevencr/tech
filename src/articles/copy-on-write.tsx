import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = {
  slug: 'copy-on-write',
  title: 'Copy-on-Write: Paying for Copies Only When You Must',
  subtitle: 'One idea connecting processes, filesystems, databases and immutable data',
  category: 'Systems',
  description: 'How copy-on-write shares physical state until mutation, and why the same idea appears in fork, snapshots, filesystems, databases and application architecture.',
  date: '2026-10-02',
  readingTime: 19,
  tags: ['Operating Systems', 'Filesystems', 'Databases', 'Architecture', 'Performance'],
};

export function CopyOnWriteArticle() {
  return <ArticleLayout meta={meta}>
    <ArticleSection title="The deceptively simple idea">
      <p>Copying a large structure is expensive when most of the copied data will never change. Copy-on-write, or COW, starts by sharing the existing representation and makes a physical copy only when a writer actually needs to modify shared state.</p>
      <ArticleCallout>COW converts “copy everything now” into “share now, pay for divergence later”. The same trade-off appears at many layers of a modern system.</ArticleCallout>
    </ArticleSection>

    <ArticleSection title="The core mechanism">
      <ArticleDiagram items={[
        { title: 'Shared state', description: 'Two logical owners reference the same physical data' },
        { title: 'Read', description: 'Both continue using the shared representation' },
        { title: 'Write', description: 'A mutation is detected' },
        { title: 'Copy', description: 'Only the affected unit is duplicated' },
        { title: 'Diverge', description: 'Each owner now sees its own version' },
      ]} />
      <p>The unit of copying matters. An operating system may copy memory pages. A filesystem may copy blocks or metadata structures. A persistent data structure may copy only nodes along the modified path.</p>
    </ArticleSection>

    <ArticleSection title="fork and virtual memory">
      <p>When a Unix process calls fork, the child initially shares physical memory pages with the parent. Page-table entries can mark those pages read-only. A write triggers a page fault, and the kernel creates a private writable page for the process that needs it.</p>
      <p>This makes process creation much cheaper than eagerly copying an entire address space.</p>
    </ArticleSection>

    <ArticleSection title="Why page granularity matters">
      <p>If two processes share a four-kilobyte page and one process changes one byte, the kernel normally copies the page rather than a single byte. COW therefore has a granularity trade-off: larger units reduce bookkeeping but can amplify small writes.</p>
      <p>The same principle appears elsewhere. Choosing the wrong COW granularity can turn an elegant optimisation into surprising memory or write amplification.</p>
    </ArticleSection>

    <ArticleSection title="Filesystem snapshots">
      <p>Snapshot-capable filesystems can represent a snapshot by sharing existing blocks between versions. When a new version modifies a block, the new version writes a replacement elsewhere while the old snapshot retains the original.</p>
      <p>The logical effect is an instant snapshot without instantly duplicating the entire dataset. The physical cost arrives as the versions diverge.</p>
    </ArticleSection>

    <ArticleSection title="Persistent data structures">
      <p>Functional data structures exploit the same idea at the application level. Instead of mutating a tree in place, a new version shares untouched nodes with the old version and creates new nodes along the path that changed.</p>
      <p>This can make immutable application state surprisingly practical: versions become cheap to retain because most structure is shared.</p>
    </ArticleSection>

    <ArticleSection title="COW and databases">
      <p>Database storage engines use related techniques when they need snapshots, multi-version visibility or crash-safe updates. The exact implementation differs, but the design pressure is familiar: preserve an old view while creating a new physical representation without copying everything.</p>
      <p>Thinking in terms of versions and shared physical state can make database snapshot behaviour much easier to reason about.</p>
    </ArticleSection>

    <ArticleSection title="The hidden bill">
      <p>COW is not free. A workload that writes heavily to shared data eventually loses the sharing benefit. It can also create fragmentation, extra metadata, increased write amplification or sudden memory pressure.</p>
      <ArticleCallout>COW optimises the common case where many readers share state and relatively little data changes. If nearly everything changes, you may simply have implemented a delayed copy.</ArticleCallout>
    </ArticleSection>

    <ArticleSection title="Concurrency becomes interesting">
      <p>Sharing immutable state makes readers easier to reason about because they do not need to coordinate with writers modifying the same representation. The price is version management: references must remain valid, old versions must eventually become reclaimable, and writers need a consistent way to publish the new representation.</p>
    </ArticleSection>

    <ArticleSection title="A practical mental model">
      <p>Whenever you see snapshots, immutable versions, process cloning, persistent trees or storage that appears to create an instant duplicate, ask three questions: what is physically shared, what event causes a copy, and what is the granularity of that copy?</p>
      <p>Those questions expose the real performance characteristics far better than the phrase “copy-on-write” alone.</p>
    </ArticleSection>
  </ArticleLayout>;
}
