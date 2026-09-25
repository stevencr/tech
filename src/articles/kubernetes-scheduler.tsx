import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCode } from '../components/article/ArticleCode';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = {
  slug: 'kubernetes-scheduler',
  title: 'The Kubernetes Scheduler',
  subtitle: 'How Kubernetes decides where your Pod actually runs',
  category: 'Kubernetes',
  description: 'Scheduling cycles, filtering, scoring, affinities, taints and the control-plane mechanics behind Pod placement.',
  date: '2026-09-26',
  readingTime: 14,
  tags: ['Kubernetes', 'Scheduler', 'Pods', 'Control Plane'],
};

export function KubernetesSchedulerArticle() {
  return <ArticleLayout meta={meta}>
    <ArticleSection title="Scheduling is a control-loop problem">
      <p>A Pod does not arrive with a server name attached. When its spec has no nodeName, Kubernetes leaves it Pending and the scheduler repeatedly evaluates it against the current cluster state.</p>
      <ArticleCallout>The scheduler is not a central dispatcher handing out jobs. It is a reconciliation component continually trying to turn desired state into placement decisions.</ArticleCallout>
    </ArticleSection>
    <ArticleSection title="The scheduling cycle">
      <ArticleDiagram items={[
        { title: 'Watch', description: 'Observe unscheduled Pods and cluster state.' },
        { title: 'Filter', description: 'Remove nodes that cannot satisfy hard constraints.' },
        { title: 'Score', description: 'Rank the feasible nodes against preferences.' },
        { title: 'Bind', description: 'Record the selected node for the Pod.' },
      ]} />
      <p>Filtering might consider available resources, node selectors, affinity, taints and topology constraints. Scoring then evaluates softer preferences. The separation is important: a preference should not accidentally make every node infeasible.</p>
    </ArticleSection>
    <ArticleSection title="Resources are requests, not live measurements">
      <p>For CPU and memory, the scheduler primarily reasons from resource requests declared by workloads and the requests already assigned to nodes. It is making a placement calculation, not continuously packing Pods according to instantaneous CPU graphs.</p>
      <ArticleCode>{`resources:
  requests:
    cpu: "500m"
    memory: "256Mi"
  limits:
    cpu: "1"
    memory: "512Mi"`}</ArticleCode>
      <p>This distinction explains why a node can look idle in monitoring while the scheduler refuses another Pod: allocatable capacity and requested capacity are different concepts.</p>
    </ArticleSection>
    <ArticleSection title="Taints and tolerations">
      <p>Taints are node-side rules saying “do not place workloads here unless they tolerate this condition”. A Pod's toleration does not request the node; it merely makes the Pod eligible to survive that taint during filtering.</p>
    </ArticleSection>
    <ArticleSection title="Affinity turns placement into a constraint graph">
      <p>Node affinity relates Pods to node labels. Pod affinity and anti-affinity relate Pods to other Pods. Topology keys let the scheduler express relationships across zones, racks or other domains.</p>
      <ArticleCallout>Placement becomes interesting when constraints interact. A workload can be individually valid yet impossible to schedule once anti-affinity, zones and resource requests are considered together.</ArticleCallout>
    </ArticleSection>
    <ArticleSection title="Why Pending Pods are useful evidence">
      <p>A Pending Pod is not just a failed deployment. Its scheduling events describe which constraints prevented placement. Reading those events often reveals more than staring at node CPU graphs.</p>
      <ArticleCode>{`kubectl describe pod <pod>
kubectl get nodes --show-labels
kubectl describe node <node>`}</ArticleCode>
    </ArticleSection>
    <ArticleSection title="The bigger idea">
      <p>Kubernetes scheduling is a practical example of constrained optimisation under changing state. The cluster is never static: nodes disappear, resources are consumed and labels change. The scheduler therefore repeatedly computes a locally useful decision instead of solving the entire cluster once.</p>
    </ArticleSection>
  </ArticleLayout>;
}
