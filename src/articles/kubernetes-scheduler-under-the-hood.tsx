import { ArticleLayout } from '../components/ArticleLayout';

export const meta = { slug: 'kubernetes-scheduler-under-the-hood', title: 'Kubernetes Scheduler Under the Hood: From Pending Pod to Binding', subtitle: 'How Kubernetes turns placement constraints into scheduling decisions.', category: 'Kubernetes Internals', description: 'A senior-level deep dive into the Kubernetes scheduler and scheduling framework.', date: '2026-10-03', readingTime: 24, tags: ['Kubernetes', 'Scheduling', 'Control Plane', 'Distributed Systems', 'Go'] };

export function KubernetesSchedulerUnderTheHoodArticle() {
  return <ArticleLayout meta={meta}><p>Draft.</p></ArticleLayout>;
}
