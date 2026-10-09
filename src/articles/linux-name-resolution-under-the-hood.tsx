import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'linux-name-resolution-under-the-hood',
  title: 'DNS Is Not the Resolver: Linux Name Resolution Under the Hood',
  subtitle: 'Follow a hostname from getaddrinfo through NSS, local caches, split DNS, search domains and the wire.',
  category: 'Networking & Linux Internals',
  description: 'A senior-level deep dive into Linux hostname resolution, NSS, systemd-resolved, DNS caching, Node.js and Kubernetes.',
  date: '2026-10-10',
  readingTime: 23,
  tags: ['DNS', 'Linux', 'Networking', 'glibc', 'Node.js', 'Kubernetes', 'Debugging'],
};

export function LinuxNameResolutionUnderTheHoodArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>Hostname resolution is not simply a DNS query. It is a policy-driven operating-system pipeline, and DNS is only one possible source of name information.</p>
      <h2>The resolution pipeline</h2>
      <p>The complete article follows in the next update.</p>
    </ArticleLayout>
  );
}
