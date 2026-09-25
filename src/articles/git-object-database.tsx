import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCode } from '../components/article/ArticleCode';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = {
  slug: 'git-object-database',
  title: 'Git’s Object Database',
  subtitle: 'Commits are pointers, trees are directories and history is content',
  category: 'Git',
  description: 'Blobs, trees, commits, refs, hashes, packfiles and the content-addressed model underneath everyday Git commands.',
  date: '2026-10-01',
  readingTime: 14,
  tags: ['Git', 'Git Internals', 'Version Control', 'Content Addressing'],
};

export function GitObjectDatabaseArticle() {
  return <ArticleLayout meta={meta}>
    <ArticleSection title="Git is a content-addressed database">
      <p>Git's core storage model is surprisingly small. It stores objects identified by hashes and connects them into a graph. Branches and tags are references pointing into that graph.</p>
      <ArticleCallout>A branch is not a container of files. It is a movable reference to a commit.</ArticleCallout>
    </ArticleSection>
    <ArticleSection title="Four object types">
      <ArticleDiagram items={[
        { title: 'Blob', description: 'Stores file content without the filename.' },
        { title: 'Tree', description: 'Maps names and modes to blobs or other trees.' },
        { title: 'Commit', description: 'Points to a tree and parent commit(s), with metadata.' },
        { title: 'Tag', description: 'Can annotate another object, commonly a commit.' },
      ]} />
    </ArticleSection>
    <ArticleSection title="Look inside a repository">
      <ArticleCode>{`git cat-file -t HEAD
git cat-file -p HEAD
git rev-parse HEAD
find .git/objects -type f | head`}</ArticleCode>
      <p>The commit points to a tree. The tree points to other trees and blobs. Filenames live in trees, not blobs. This separation lets identical file content be reused in different paths or commits.</p>
    </ArticleSection>
    <ArticleSection title="Refs make history convenient">
      <p>HEAD usually points to a branch reference, and that branch points to a commit. Updating a branch is therefore mostly updating a small piece of reference metadata rather than rewriting the entire repository.</p>
    </ArticleSection>
    <ArticleSection title="Why repositories pack objects">
      <p>Loose objects are simple but inefficient at scale. Git periodically packs objects, compressing related content and storing deltas where useful. Packfiles are why a repository can contain a huge logical history without one filesystem object per version of every file.</p>
    </ArticleSection>
    <ArticleSection title="Reset and rebase become less mysterious">
      <p>Once branches are understood as references, reset becomes “move this reference”, while rebase becomes “construct new commits with different parents”. The old commits do not instantly vanish; they become unreachable and can eventually be garbage-collected.</p>
      <ArticleCode>{`git reflog
git fsck --unreachable`}</ArticleCode>
    </ArticleSection>
    <ArticleSection title="The bigger idea">
      <p>Git's power comes from combining immutable-ish content-addressed objects with mutable human-friendly references. The user interface feels like a timeline; underneath it is a Merkle-style graph of content.</p>
    </ArticleSection>
  </ArticleLayout>;
}
