import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = {
  slug: 'linux-page-cache',
  title: 'The Linux Page Cache',
  subtitle: 'Why disk I/O often is not disk I/O at all',
  category: 'Linux',
  description: 'How Linux turns filesystem reads and writes into memory operations, and when the page cache helps or hurts.',
  date: '2026-10-06',
  readingTime: 15,
  tags: ['Linux', 'Kernel', 'Memory', 'I/O'],
};

export function LinuxPageCacheArticle() {
  return <ArticleLayout meta={meta}>
    <ArticleSection title="The surprising bit">
      <p>When an application calls read(), it does not necessarily wait for a disk. Linux normally keeps recently used filesystem pages in RAM. A cache hit can therefore turn what looks like storage I/O into a memory access.</p>
      <ArticleCallout>“The file is on disk” describes persistence, not necessarily where the next read will come from.</ArticleCallout>
    </ArticleSection>
    <ArticleSection title="The path">
      <ArticleDiagram items={[
        { title: 'Application', description: 'read(), mmap(), write()' },
        { title: 'VFS', description: 'Filesystem abstraction' },
        { title: 'Page cache', description: 'Cached file-backed memory pages' },
        { title: 'Filesystem', description: 'ext4, XFS, etc.' },
        { title: 'Block layer', description: 'Requests become device I/O' },
        { title: 'Storage', description: 'SSD, NVMe, network device' },
      ]} />
      <p>On a read miss, the kernel schedules I/O and populates cache pages. Subsequent readers can use those pages without another device request.</p>
    </ArticleSection>
    <ArticleSection title="Writes are different">
      <p>A normal buffered write can update cached pages and mark them dirty. Persistence happens later through writeback. That is why a successful write() does not automatically mean the bytes have reached stable storage.</p>
      <p>fsync() changes the contract: the caller asks the kernel to push the relevant data and metadata far enough to provide the requested durability guarantee.</p>
    </ArticleSection>
    <ArticleSection title="Why mmap changes the mental model">
      <p>mmap() exposes file-backed pages through virtual memory. Page faults become the mechanism that brings data into RAM. The application can therefore interact with a file using ordinary loads and stores while the kernel handles page population.</p>
    </ArticleSection>
    <ArticleSection title="Pressure and eviction">
      <p>The cache competes with anonymous application memory. Under pressure, Linux can reclaim clean file-backed pages cheaply because they can simply be discarded and read again later. Dirty pages require writeback before reclamation.</p>
      <p>This is why a machine with apparently “free” memory can still perform well: reclaimable cache is useful memory, not wasted memory.</p>
    </ArticleSection>
    <ArticleSection title="Useful experiments">
      <p>Compare a first read of a large file with a second read. Inspect memory and I/O with tools such as free, vmstat, iostat and /proc/meminfo. Then repeat with direct I/O and observe how the caching story changes.</p>
    </ArticleSection>
  </ArticleLayout>;
}