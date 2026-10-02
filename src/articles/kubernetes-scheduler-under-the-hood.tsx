import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'kubernetes-scheduler-under-the-hood',
  title: 'Kubernetes Scheduler Under the Hood: From Pending Pod to Binding',
  subtitle: 'How Kubernetes turns a declarative placement request into a scheduling decision using queues, filtering, scoring, preemption and extensible scheduling plugins.',
  category: 'Kubernetes Internals',
  description: 'A senior-level deep dive into the Kubernetes scheduler, its scheduling framework, cache, placement pipeline, preemption and operational trade-offs.',
  date: '2026-10-03',
  readingTime: 24,
  tags: ['Kubernetes', 'Scheduling', 'Control Plane', 'Distributed Systems', 'Go'],
};

export function KubernetesSchedulerUnderTheHoodArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>A Kubernetes Pod specification can say surprisingly little about where it should run. The scheduler turns that declarative description into a concrete node assignment.</p>
      <p>It is tempting to imagine a loop that asks which node has enough CPU and picks the best one. The real scheduler is an extensible pipeline operating over a continuously changing cached view of cluster state, with explicit phases for queueing, feasibility, ranking, reservation, waiting, preemption and binding.</p>
      <div className="article__callout"><strong>Core idea:</strong> Kubernetes scheduling is not one algorithm. It is a scheduling framework whose plugins collectively implement policy over a working view of cluster state.</div>

      <h2>The API server does not choose the node</h2>
      <p>The API server persists the Pod and exposes it through the Kubernetes API. The scheduler watches for Pods without a node assignment, chooses a placement, and writes the binding back through the API. The kubelet then observes the assignment and makes the workload run.</p>
      <pre><code>{`client
  |
  v
API server ---> etcd
  |
  v
scheduler ---> choose node ---> binding
  |
  v
kubelet ---> container runtime`}</code></pre>

      <h2>Pending Pods become scheduling work</h2>
      <p>The scheduler cannot repeatedly scan every pending Pod against every node. Unscheduled Pods enter internal queues and become eligible for processing. A useful mental model is an active queue, a backoff queue for recently failed attempts, and unschedulable work that can be reconsidered when cluster state changes.</p>
      <p>Backoff is a distributed-systems technique as much as a performance optimisation. A permanently impossible workload should not consume control-plane CPU by immediately retrying after every unrelated event.</p>
      <div className="diagram"><div><strong>ActiveQ</strong><small>Ready for scheduling</small></div><div><strong>BackoffQ</strong><small>Delay repeated failures</small></div><div><strong>Unschedulable</strong><small>Waiting for useful change</small></div></div>

      <h2>The scheduler cache is a working view, not a transaction</h2>
      <p>The scheduler maintains cached representations of nodes, Pods and related state so placement decisions do not require an API request for every node evaluation. That cache is continuously refreshed, but it is not a frozen global truth.</p>
      <div className="article__callout"><strong>Distributed-systems connection:</strong> the scheduler makes decisions from a local view while controllers, kubelets and other scheduling activity change the cluster concurrently.</div>

      <h2>Filtering: can the Pod run here?</h2>
      <p>Filtering removes nodes that violate hard constraints: resource requests, node selectors, taints and tolerations, affinity, volumes, topology and other rules.</p>
      <pre><code>{`for each candidate node:
  reject if resources are insufficient
  reject if required affinity fails
  reject if taints are not tolerated
  reject if volume constraints fail
  reject if topology constraints fail
  otherwise keep the node`}</code></pre>
      <p>A node having spare CPU therefore tells you very little by itself. The feasible set is the intersection of many constraints.</p>

      <h2>Scoring: which legal node is better?</h2>
      <p>After filtering, several nodes may remain. Scoring plugins express preferences over those candidates. A policy might prefer spreading workloads, packing them, satisfying preferred affinity, or balancing resource utilisation.</p>
      <pre><code>{`feasible nodes
  A   B   C   D
  |   |   |   |
  5   8   6   8

highest combined score wins`}</code></pre>
      <p>Best is therefore not an intrinsic property of a node. It is the result of the active scheduling policy.</p>

      <h2>Requests are a planning model</h2>
      <p>Kubernetes schedules against declared resource requests and allocatable capacity, not simply against instantaneous process RSS. This lets the scheduler reason about future commitments without trying to predict every allocation a container might make next.</p>
      <pre><code>{`node allocatable
      |
      +-- existing Pod requests
      +-- new Pod request
      +-- system reservations
      |
      v
feasible?`}</code></pre>
      <p>This distinction explains why a node can appear to have unused memory and still reject a Pod whose requested capacity does not fit the scheduler resource model.</p>

      <h2>Pre-filtering moves invariant work out of the inner loop</h2>
      <p>Scheduling plugins can perform Pod-level preprocessing before evaluating individual nodes. This is the same optimisation you would make in application code: calculate facts that are invariant across candidates once rather than repeating them for every node.</p>
      <p>This matters because scheduler work grows with scheduling decisions, candidate nodes and plugin operations.</p>

      <h2>The scheduling framework is a pipeline</h2>
      <pre><code>{`queue
  |
pre-filter
  |
filter
  |
post-filter / preemption
  |
pre-score
  |
score
  |
reserve
  |
permit
  |
pre-bind
  |
bind
  |
post-bind`}</code></pre>
      <p>Not every plugin participates in every phase. The framework orchestrates the lifecycle while plugins implement particular policy decisions.</p>

      <h2>Reserve: the concurrency problem</h2>
      <p>Suppose two Pods both observe ten units of capacity and each requests seven. A naive implementation could let both conclude that the node is feasible. Scheduling needs a notion of the decisions already made during the current scheduling process so later work does not blindly reuse the same apparent capacity.</p>
      <pre><code>{`capacity = 10
Pod A requests 7
Pod B requests 7

independent observations -> 14
coordinated scheduling -> account for A before B`}</code></pre>
      <p>The broader lesson is that placement decisions are concurrent commitments, not independent reads of a static database.</p>

      <h2>Permit: sometimes choosing a node is not enough</h2>
      <p>The permit phase can allow, reject or hold a Pod after a node has been selected. This is useful for policies where several Pods need to reach a coordination point before any of them should proceed.</p>
      <div className="diagram"><div><strong>Select</strong><small>Choose feasible node</small></div><div><strong>Reserve</strong><small>Record scheduling intent</small></div><div><strong>Permit</strong><small>Allow, deny or wait</small></div><div><strong>Bind</strong><small>Write final assignment</small></div></div>

      <h2>Binding is not execution</h2>
      <p>A successful scheduling cycle does not mean the application is already running. The scheduler records the assignment, the kubelet observes it, the container runtime creates containers, and readiness and health are separate state transitions.</p>
      <pre><code>{`scheduler: node selected
       |
       v
API server: binding recorded
       |
       v
kubelet: observes assignment
       |
       v
runtime: creates containers`}</code></pre>

      <h2>When no node works</h2>
      <p>If every node fails filtering, the Pod can remain pending while the scheduler waits for a useful change in cluster state. Adding a larger node can make an oversized Pod schedulable; an unrelated status update should not necessarily trigger expensive repeated work.</p>
      <p>This is why queueing, backoff and event-driven re-evaluation are tightly connected. Efficient scheduling means knowing when <em>not</em> to try again.</p>

      <h2>Preemption changes the feasible set</h2>
      <p>When a high-priority Pod cannot fit, preemption can consider lower-priority Pods whose removal could make a node feasible. But eviction is not a magic override: the remaining workload still has to satisfy affinity, topology and other constraints, and termination takes time.</p>
      <pre><code>{`node-7
+------------------+
| low priority A   |
| low priority B   |
| free capacity    |
+------------------+

new high priority Pod
        |
        v
find victims -> re-check constraints`}</code></pre>
      <p>A high-priority Pod can still be impossible to place. Removing workloads only helps when their removal changes the constraint that blocked it.</p>

      <h2>Scheduling profiles make policy composable</h2>
      <p>The scheduling framework can be configured with different plugin combinations and profiles. This lets a cluster express different notions of good placement without implementing an entirely separate scheduler for every workload class.</p>
      <p>The trade-off is explainability. Once policy is assembled from plugins, a placement decision is no longer obvious from one function. Observability and documentation become part of the scheduling design.</p>

      <h2>The cache is deliberately not a distributed transaction</h2>
      <p>A node can disappear while a scheduling cycle is running. Another controller can change an object. Another scheduling decision can consume capacity. Kubernetes cannot freeze the cluster while it computes a placement.</p>
      <p>The architecture is therefore optimistic: make a decision from current information, record it through the API, and keep reconciling toward desired state. The scheduler is one transition in a larger control loop rather than a transaction spanning every node.</p>
      <div className="article__callout"><strong>Important mental model:</strong> scheduling is a decision made against changing state. Staleness is not an exceptional bug; it is part of the operating environment the design has to tolerate.</div>

      <h2>Debugging surprising placement</h2>
      <p>When a workload lands somewhere unexpected, ask which nodes were actually feasible, which filters rejected alternatives, which scoring plugins preferred the winner, and whether resource requests differ materially from actual usage.</p>
      <pre><code>{`kubectl get pod NAME -o yaml
kubectl describe pod NAME
kubectl get nodes
kubectl describe node NODE
kubectl get events --sort-by=.metadata.creationTimestamp`}</code></pre>
      <p>In a controlled environment, scheduler verbosity and metrics can expose more of the decision path. Diagnostic output changes between Kubernetes releases, so treat log formats as implementation details rather than an API.</p>

      <h2>A practical experiment</h2>
      <p>Create a small two-node cluster. Give one node a label and taint. Start with a Pod using a required node selector and then replace that with preferred affinity. Observe the difference: the required rule changes the feasible set, while the preferred rule changes ranking inside that set.</p>
      <p>Then add explicit CPU and memory requests and watch how scheduling changes when requested capacity exceeds what either node can satisfy. Finally, create a higher-priority workload and observe preemption in an isolated test cluster.</p>

      <h2>Scheduling is constrained optimisation, not global optimisation</h2>
      <p>Conceptually, the scheduler repeatedly solves:</p>
      <pre><code>{`all nodes
   |
   +-- remove hard-constraint failures
   |
   v
feasible set
   |
   +-- rank according to policy
   |
   v
placement decision`}</code></pre>
      <p>Kubernetes does not try to compute a globally optimal arrangement of every Pod after every change. That would be expensive and disruptive. It makes incremental decisions that are good enough under current policy and continues reconciling as state changes.</p>

      <h2>A useful connection to database query planning</h2>
      <p>A database optimiser also separates legality from preference. It first considers valid execution strategies, then uses statistics and cost models to rank them. Kubernetes similarly narrows the legal placement set before applying policy to the remaining candidates.</p>
      <p>The analogy is not exact, but it highlights a useful idea: best is contextual, based on the information and cost model available at decision time.</p>

      <h2>Sharp edges</h2>
      <ul>
        <li><strong>Free CPU is not the same as schedulable capacity.</strong> Requests, allocatable resources and constraints matter.</li>
        <li><strong>Scheduling is not execution.</strong> A binding does not mean the application is healthy.</li>
        <li><strong>Preferred rules are not required rules.</strong> They influence ranking rather than defining legality.</li>
        <li><strong>Preemption is not a universal escape hatch.</strong> Victim removal must still produce a feasible placement.</li>
        <li><strong>The scheduler cache is not a global transaction.</strong> The cluster can change while a decision is being made.</li>
        <li><strong>Custom plugins run in a control-plane hot path.</strong> Expensive policy can become a cluster-wide bottleneck.</li>
      </ul>

      <h2>Takeaway</h2>
      <p>The Kubernetes scheduler is best understood as an extensible control-plane pipeline, not a mysterious pick-a-node function.</p>
      <p>A Pod enters a queue. The scheduler maintains a working view of cluster state, filters nodes that cannot satisfy hard constraints, scores feasible candidates, and can coordinate reservation, waiting and binding. If nothing fits, preemption and later retries can change the situation.</p>
      <p>The broader lesson applies well beyond Kubernetes: when a distributed system makes decisions against changing state, separate <strong>feasibility</strong> from <strong>preference</strong>, make the decision pipeline explicit, and design for the fact that your view of the world becomes stale while you act on it.</p>
      <div className="article__callout"><strong>Remember:</strong> when a Pod lands somewhere surprising, ask which nodes were feasible, which rules eliminated the others, and which scoring policy made this node win. That turns scheduler behaviour from folklore into something you can inspect and reason about.</div>
    </ArticleLayout>
  );
}
