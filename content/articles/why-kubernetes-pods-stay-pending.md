---
title: "Why Kubernetes Has Free CPU but Still Won't Schedule Your Pod"
slug: "why-kubernetes-pods-stay-pending"
subtitle: "The scheduler is not looking for an idle machine. It is solving a constrained placement problem against requests, topology, storage and a changing cluster snapshot."
category: "Kubernetes Internals"
description: "A senior-level tour of kube-scheduler: resource accounting, filter and score plugins, topology constraints, scheduling queues, optimistic cache assumptions, preemption and production diagnostics."
date: "2026-11-04"
readingTime: 23
tags: [kubernetes, scheduler, control-plane, resource-management, scheduling]
---

A cluster can have apparently idle nodes, plenty of free CPU according to `kubectl top`, and a Pod that has been stuck in `Pending` for twenty minutes.

The instinctive diagnosis is often that Kubernetes has failed to notice spare capacity. Usually it has noticed the capacity perfectly well. It has rejected the placement because **the scheduler is not asking whether a node looks idle; it is asking whether that node is a valid place for this particular Pod under the cluster's scheduling rules**.

That distinction explains a surprising number of production incidents: a GPU workload that cannot use spare CPU, a replica that refuses to enter a third zone, a Pod whose PVC pins it to the wrong topology, or a deployment that remains pending even though the cluster's aggregate free resources exceed the request.

The scheduler is best understood as a constraint solver with a priority queue attached. It builds a set of feasible nodes, ranks that set, makes an optimistic local reservation, and then binds the Pod through the API. It does not globally rearrange every workload to find a mathematically optimal packing.

Let's follow that machinery.

## First, separate capacity, allocatable and usage

Three numbers are routinely treated as though they mean the same thing:

1. **Capacity** is what the node reports it has.
2. **Allocatable** is the amount Kubernetes makes available for Pods after configured reservations.
3. **Usage** is what workloads are consuming right now.

The scheduler primarily reasons about allocatable resources and Pod requests. It does not simply inspect live CPU utilisation and place work wherever a graph looks quiet.

A node with 16 CPUs might report 15 CPUs allocatable after reservations. If already scheduled Pods have requests totalling 14 CPUs, the scheduler has only about 1 CPU of request headroom, even if those Pods are currently consuming 2 CPUs between them.

Why reserve capacity that is not being used? A request is a scheduling contract: the workload is declaring the amount of resource it expects to need. CPU usage is bursty. A service that is quiet at 03:00 may need its full request during a traffic peak at 09:00. Scheduling against requests makes placement less dependent on a momentary sample.

### Allocatable is not the same as raw hardware

The kubelet exposes Node Allocatable in the Node API. Operators can reserve capacity for the operating system and Kubernetes daemons using `systemReserved` and `kubeReserved`, and can account for hard eviction thresholds. In simplified form:

```text
allocatable
  = capacity
  - system reservations
  - Kubernetes reservations
  - resources held back for eviction
```

The exact configuration matters. A cluster with generous reservations can have a substantial gap between `capacity` and `allocatable`. The scheduler treats allocatable as the Pod-facing capacity; it does not assume that every advertised CPU or byte of memory belongs to application containers.

This is also why a node's `Capacity` and `Allocatable` fields are more useful than a cloud provider's VM size when diagnosing placement.

### Requests are accounting, not a physical reservation

A CPU request does not pin a core to a container. A memory request does not pre-allocate a slab of RAM. Requests are inputs to scheduling and, on Linux, to resource-management decisions made by the kubelet and container runtime.

Broadly:

- CPU requests influence relative CPU weight under contention; CPU limits can impose a quota that causes throttling.
- Memory requests inform scheduling and eviction decisions; memory limits are enforced as a cgroup limit and can lead to an OOM kill.
- Ephemeral-storage requests participate in placement accounting; actual disk pressure is handled separately by kubelet eviction logic.

So two things can be true at once: the scheduler can reject a Pod because its requests do not fit, while the node is visibly under-utilised; and a Pod can later consume more than its request, contributing to node pressure even though the scheduler's accounting was valid.

The official [resource-management documentation](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/) explains the distinction between requests, limits, scheduling and runtime enforcement. [Node Allocatable](https://kubernetes.io/docs/tasks/administer-cluster/reserve-compute-resources/) explains the reservations behind the number the scheduler uses.

## The request the scheduler sees may not be the request you think you wrote

For a simple Pod with two long-running containers requesting 500m and 1 CPU, the steady application request is 1.5 CPUs. But the effective Pod request is not always the sum of the `containers` array you happen to be looking at.

Regular init containers run sequentially before the application containers. They can therefore require a larger temporary footprint than the steady-state application. The effective request must account for that peak. Pod overhead can add another amount. Restartable init sidecars complicate the calculation further because they remain running alongside later init containers and application containers.

For ordinary init containers, a useful simplified model for one resource is:

```text
effective request
  = pod overhead
  + max(sum of application-container requests,
        largest regular init-container request)
```

Do not apply that simplified formula blindly to restartable init sidecars; Kubernetes has specific accounting rules for them. The important operational point is that scheduling uses the **effective Pod request**, not a casual sum of only the main application containers.

For example, imagine an API Pod whose two application containers together request 1 CPU, but whose migration init container requests 6 CPUs. The Pod may need 6 CPUs to be schedulable even though it will use far less once it is running. If no eligible node has 6 CPUs of request headroom, it can remain pending.

This can surprise teams that add a large one-off init step to an otherwise small service. The init container is not free just because it exits.

See [Init Containers](https://kubernetes.io/docs/concepts/workloads/pods/init-containers/) and [Sidecar Containers](https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/) for the detailed resource-sharing rules.

## Scheduling is a pipeline, not one capacity check

The scheduler's default implementation is extensible. Most placement behaviour is implemented by plugins that participate at defined extension points in the [Scheduling Framework](https://kubernetes.io/docs/concepts/scheduling-eviction/scheduling-framework/).

A simplified view is:

```text
Pod becomes eligible
       |
       v
Scheduling queue
       |
       v
QueueSort / PreFilter
       |
       v
Filter: which nodes are feasible?
       |
       +---- no nodes ----> PostFilter (for example, preemption)
       |
       v
PreScore / Score / NormalizeScore
       |
       v
Choose one feasible node
       |
       v
Reserve / Permit
       |
       v
PreBind / Bind / PostBind
```

Not every plugin implements every extension point. Some are informational; others can reject a Pod, influence ranking or perform work around binding.

### Filter creates the feasible set

Filtering is the decisive stage. Each candidate node is checked against hard requirements. A node must survive every applicable filter to enter the feasible set.

Common filters include:

- `NodeResourcesFit`: does the node have enough allocatable resource headroom for the Pod's effective requests?
- `NodeAffinity`: does the node satisfy required node selectors and affinity?
- `TaintToleration`: does the Pod tolerate the node's blocking taints?
- `PodTopologySpread`: would placing the Pod violate a hard spread constraint?
- `InterPodAffinity`: do required relationships with other Pods hold?
- `VolumeBinding` and volume-related plugins: can the Pod's storage be used from this node?
- `NodePorts`: can the requested host ports be allocated on this node?

A node rejected by one hard filter is out. It does not matter that it has twice the CPU of every other node. It does not proceed to scoring.

The [scheduler configuration reference](https://kubernetes.io/docs/reference/scheduling/config/) lists the built-in plugins and the extension points they implement. Reading that list is a useful way to translate a YAML field into the part of the scheduler that evaluates it.

### Score ranks only the survivors

Once filtering has produced one or more feasible nodes, scoring decides which one is preferable.

Each enabled scoring plugin assigns scores to feasible nodes. The scheduler normalises scores where required, applies plugin weights, and combines the results. The highest total wins; ties can be resolved by choosing among equally ranked nodes.

For example, `NodeResourcesFit` can use strategies such as:

- `LeastAllocated`: favour nodes with more requested-resource headroom.
- `MostAllocated`: favour packing work onto already-used nodes.
- `RequestedToCapacityRatio`: score resource utilisation using a configurable shape.

The default strategy and enabled plugins depend on the scheduler configuration and Kubernetes version; do not assume every cluster uses the same scoring policy.

The key invariant is simple:

> Scoring cannot make an infeasible node feasible.

A custom score plugin that gives a node 100 points cannot override a required node-affinity rule or conjure 4 GiB of missing allocatable memory. If the filter set is empty, scoring never gets a candidate to rank.

This is the first major debugging rule: **find out which filter rejected the node before trying to tune scoring**.

## Why aggregate free CPU is a misleading number

Consider three nodes, each with 8 allocatable CPUs:

| Node | Existing CPU requests | Request headroom |
| --- | ---: | ---: |
| node-a | 6.5 | 1.5 |
| node-b | 6.0 | 2.0 |
| node-c | 5.5 | 2.5 |

The cluster has 6 CPUs of aggregate request headroom. A new Pod asks for 3 CPUs.

There is enough aggregate capacity, but there is no node with 3 CPUs of headroom. The Pod cannot be split across nodes. The scheduler correctly rejects all three.

This is resource fragmentation. It is the same shape of problem seen in memory allocators and bin-packing systems: total free space is not sufficient if the request has to fit into one compatible region.

Now add constraints. Suppose node-c is in the wrong zone, and the Pod requires a volume whose persistent volume node affinity points to node-a. The candidate set becomes smaller still. The Pod is not asking for three arbitrary CPUs anywhere in the cluster. It is asking for three CPUs on a node that also satisfies its storage and placement constraints.

That is why adding more nodes to a cluster does not necessarily solve a pending Pod. The new nodes must be of a type and topology that satisfy the Pod's constraints.

## Placement rules are geometry, not decoration

Many scheduling incidents are caused by rules that are individually reasonable but collectively leave no intersection.

### Required and preferred affinity are different kinds of rule

A required node-affinity expression is a filter: a node that does not match is not a candidate.

A preferred expression contributes to ranking. The scheduler can choose a node that does not match if it is otherwise feasible and the scoring result favours it.

This distinction matters when a team copies a preference into a required rule. The latter can turn a workload that should degrade gracefully into one that remains pending whenever a preferred node pool is unavailable.

The suffix `IgnoredDuringExecution` is also worth reading literally. These rules are considered during scheduling; they do not automatically evict an already-running Pod merely because node labels later change.

### A toleration is permission, not attraction

A taint marks a node so that Pods without a matching toleration are filtered out or otherwise discouraged, depending on the taint effect.

A toleration allows a Pod to remain eligible for that tainted node. It does not tell the scheduler to prefer that node. If you want to attract a workload to a specialised pool, combine tolerations with node affinity or another positive placement rule.

This is a frequent source of mistaken assumptions: adding a GPU-pool toleration does not guarantee that the Pod will land on a GPU node.

### Topology spread can make an apparently valid node invalid

Topology spread constraints express how matching Pods should be distributed across domains such as zones or hosts.

With `whenUnsatisfiable: DoNotSchedule`, the constraint is a hard filter. `maxSkew` limits how uneven the distribution may become relative to the global minimum. Multiple constraints are combined, so a node must satisfy all of them.

A simplified example:

```yaml
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: topology.kubernetes.io/zone
    whenUnsatisfiable: DoNotSchedule
    labelSelector:
      matchLabels:
        app: payments
```

If matching Pods are already distributed 4, 3 and 1 across three eligible zones, a new Pod cannot necessarily go into the busiest zone. With a skew limit of 1, the scheduler must preserve the permitted difference.

The subtle word is **eligible**. The scheduler derives topology domains from the Nodes it knows about and from the applicable node-affinity and taint policies. If an autoscaled zone has no registered Node at all, it may not be represented as a domain in the way an operator imagines. The `minDomains` field can make the minimum-domain expectation explicit; when fewer eligible domains exist than `minDomains`, the global minimum is treated as zero for the skew calculation.

There is another sharp edge: the `labelSelector` determines which existing Pods count. If a workload's Pods do not match the selector you intended, the spread calculation can be surprising. Check the labels on the actual Pod template, not just the Deployment's metadata.

`ScheduleAnyway` changes the semantics: it permits placement and uses scoring to prefer better balance. It is a preference, not a hard guarantee.

The [topology spread documentation](https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/) is unusually valuable reading because it explains eligible domains, `minDomains`, selector matching and the interaction of multiple constraints.

### Storage is part of placement

A Pod that uses a PersistentVolume is not necessarily free to run on any node with enough CPU and memory.

A statically provisioned volume can have node affinity that restricts it to a zone or node. A delayed-binding StorageClass can let volume provisioning take the chosen node's topology into account, but that still involves the scheduler's volume-binding plugin and a later binding/provisioning phase.

CSI drivers can also impose per-node volume attachment limits. A node can have abundant CPU and memory yet fail a volume filter because it has no remaining attachment slots.

When a Pod is Pending, inspect its PVCs and PVs as carefully as its CPU request. Storage topology is a scheduling constraint.

## The scheduler's queue is part of the control plane

A Pod that cannot be scheduled is not necessarily retried continuously.

The scheduling queue has several logical areas:

- **Active queue**: Pods ready for a scheduling attempt, ordered by the configured queue-sort plugin. The default queue sort uses priority.
- **Backoff queue**: Pods eligible for retry after a delay, preventing repeated failures from becoming a hot loop.
- **Unschedulable pool**: Pods that have been tried and failed, and for which no relevant cluster change has yet justified another attempt.

This is not just an implementation detail. A scheduler that re-ran every impossible Pod on every loop would waste CPU and make large clusters less responsive.

The queue is event-driven. If a Pod failed because no node had enough memory, adding a matching node may make it worth retrying. If it failed because of a required label, a relevant node-label update may matter. An unrelated ConfigMap update should not cause the scheduler to repeat every expensive filter calculation.

Kubernetes has evolved this mechanism through plugin-provided queueing hints. A plugin can indicate whether a particular cluster event might make a Pod schedulable. QueueingHint became stable in Kubernetes v1.34. The scheduler can use that information to move affected Pods back to the active or backoff queue instead of blindly retrying everything.

There is also a pre-enqueue stage. Scheduling gates and PreEnqueue plugins can prevent a Pod from entering the active queue at all. Such a Pod may be waiting intentionally for an external controller to remove a gate. It has not necessarily failed a node-fit check.

This explains a subtle diagnostic trap: a Pod can be pending without having a fresh `FailedScheduling` event. It might be gated, sitting in backoff, or waiting in the unschedulable pool for a relevant event.

The [scheduler queueing-hint design article](https://kubernetes.io/blog/2024/12/12/scheduler-queueinghint/) gives useful background on why the queue is split and how event-aware retries reduce unnecessary work.

## Scheduling and binding are separate phases

One of the more interesting scheduler design choices is that **scheduling cycles run serially, while binding cycles may run concurrently**.

A scheduling cycle decides which node should receive a Pod. A binding cycle applies that decision to the cluster through the API and any required pre-bind work.

Why separate them?

Binding can involve operations that are slower than choosing a node: API calls, volume preparation, permit plugins or other integration work. If the scheduler waited for every binding operation to finish before considering the next Pod, a slow bind could unnecessarily stall unrelated placement decisions.

But concurrency creates a race.

Imagine two Pods, each requesting 4 CPUs. A node has exactly 4 CPUs of request headroom. If the scheduler selected a node for the first Pod, started an asynchronous bind, and immediately evaluated the second Pod against a cache that still showed the original free capacity, both Pods might be selected for the same 4 CPUs.

The scheduler therefore uses an optimistic local assumption: after choosing a node, it records the Pod in its scheduling cache as though the placement has happened. The next scheduling cycle sees that assumed allocation and accounts for it. The actual API binding can continue in the background.

If a later phase fails, the scheduler must undo the assumption and release any state reserved by plugins. This is why the framework has Reserve and Unreserve extension points. Unreserve is a rollback path, and plugin implementations are required to make it idempotent.

A useful mental model is:

1. Read the scheduler's current cluster snapshot.
2. Find a feasible node and score it.
3. Assume the Pod into the scheduler's local cache so subsequent cycles account for it.
4. Run reservation and permit hooks.
5. Perform pre-bind work and bind through the API.
6. Confirm the real cluster state through the normal watch/cache flow, or roll back on failure.

This is not a distributed transaction across every scheduler, controller and kubelet. It is a way for the scheduler process to avoid contradicting its own in-flight decisions while API operations are pending.

It also explains why a scheduling decision is not the same thing as a running container. Binding assigns a Pod to a Node. The kubelet still has to pull images, prepare volumes, create the sandbox and start containers.

The [framework documentation](https://kubernetes.io/docs/concepts/scheduling-eviction/scheduling-framework/) describes the scheduling and binding cycles, and the Reserve, Permit, PreBind and Bind extension points.

## Preemption is a last-resort feasibility operation

When filtering finds no feasible node, the scheduler can invoke PostFilter plugins. The default preemption plugin may try to make a node feasible by removing lower-priority Pods.

It does not simply kill every low-priority Pod until the new one fits.

For each candidate node, preemption evaluates whether removing one or more lower-priority Pods could make the pending Pod schedulable. It attempts to minimise disruption and considers constraints such as Pod affinity and disruption budgets. If a suitable candidate is found, the pending Pod's `nominatedNodeName` may identify that node.

Nominated does not mean bound. Victims may need time to terminate, and the scheduler still performs a normal scheduling attempt. The nominated node is a hint and priority signal, not a permanent reservation.

Preemption also cannot solve every kind of unschedulability. It can free CPU or memory, but it cannot create a missing node label, change a volume's zone affinity, make an untolerated taint disappear, or conjure a topology domain that does not exist. Some inter-Pod affinity relationships also prevent a node from becoming feasible simply by evicting lower-priority Pods.

So if a Pod is pending because its constraints have no valid intersection, increasing its priority may add disruption without creating a valid placement.

See [Pod Priority and Preemption](https://kubernetes.io/docs/concepts/scheduling-eviction/pod-priority-preemption/) for the victim-selection behaviour and the limitations around nominated nodes and cross-node dependencies.

## A practical investigation, from symptom to rejected constraint

Start by separating "not yet assigned" from "assigned but not running".

```bash
kubectl get pod -n payments checkout-7d9c9f8b7f-abcde -o wide
kubectl get pod -n payments checkout-7d9c9f8b7f-abcde -o yaml
```

If `spec.nodeName` is empty and the `PodScheduled` condition is false, scheduling is still the likely problem. If a node is already assigned, investigate kubelet events, image pulls, volume mounts and container startup instead. The Pod phase `Pending` covers more than scheduler rejection.

### 1. Read the scheduler's explanation

```bash
kubectl describe pod -n payments checkout-7d9c9f8b7f-abcde
kubectl get events -n payments --sort-by=.lastTimestamp
```

Look for `FailedScheduling` events. Messages such as `Insufficient cpu`, `Insufficient memory`, untolerated taints, affinity conflicts or volume binding failures are clues about the filter that rejected candidate nodes.

Treat the event as a summary, not a complete execution trace. It can aggregate counts across nodes, and the cluster may have changed since the event was recorded.

### 2. Compare requests with allocatable, not with top

```bash
kubectl describe node worker-a
kubectl get nodes -o custom-columns=NAME:.metadata.name,CPU:.status.capacity.cpu,ALLOCATABLE_CPU:.status.allocatable.cpu,MEMORY:.status.capacity.memory,ALLOCATABLE_MEMORY:.status.allocatable.memory
kubectl top nodes
```

In `kubectl describe node`, inspect the Allocated resources section. It reports requested and limited resources for Pods scheduled on that node. Compare the pending Pod's effective request against the remaining allocatable headroom.

Use `kubectl top` to understand current consumption and pressure, not to predict whether a request-based filter will pass.

### 3. Inspect every hard placement rule

```bash
kubectl get nodes --show-labels
kubectl get nodes -L topology.kubernetes.io/zone,kubernetes.io/hostname
kubectl get pvc,pv -n payments -o wide
```

Then inspect the Pod's:

- `nodeSelector` and required node affinity;
- tolerations and the taints on candidate nodes;
- required Pod affinity and anti-affinity;
- topology spread constraints and their label selectors;
- `hostPort` requests;
- PVCs, StorageClass binding mode and PV node affinity;
- `schedulerName` and any scheduling gates.

For a Pod with a custom `schedulerName`, verify that a scheduler profile or scheduler process is actually configured to handle it. A valid Pod assigned to a scheduler that is not running can wait indefinitely without the default scheduler taking ownership.

### 4. Look at scheduler metrics

The scheduler exposes useful metrics on its metrics endpoint. Depending on the Kubernetes version and metric stability in that release, useful signals include:

- `scheduler_pending_pods`: pending Pods by queue, including active, backoff, unschedulable and gated categories.
- `scheduler_schedule_attempts_total`: attempts by result, separating unschedulable outcomes from internal errors.
- `scheduler_scheduling_attempt_duration_seconds`: scheduling-attempt latency.
- `scheduler_framework_extension_point_duration_seconds`: time spent in framework extension points.
- `scheduler_preemption_attempts_total`: preemption activity.

These help distinguish a cluster with many impossible Pods from one where the scheduler itself is spending too long evaluating candidates. A growing unschedulable queue with low scheduling latency points to a different problem from a scheduler whose Filter or Score extension points have become expensive.

The [Kubernetes metrics reference](https://kubernetes.io/docs/reference/instrumentation/metrics/) documents these metrics and their stability levels. Check the version running in your cluster before building dashboards around a metric or label set.

## The scheduler is not a global optimiser

A final misconception is that the scheduler continuously rearranges workloads until the cluster is perfectly packed.

For ordinary standalone Pods, the scheduler makes placement decisions one Pod at a time. Newer workload and PodGroup scheduling capabilities can evaluate a group as a unit, but neither path turns the scheduler into a cluster-wide optimiser that continually rearranges existing workloads. Scoring plugins are heuristics for choosing among currently feasible placements, not a guarantee that a sequence of locally sensible decisions will produce the globally optimal packing.

That has practical consequences:

- A workload with a large request can be stranded by fragmentation even when aggregate free resources look sufficient.
- A strict topology policy can preserve availability while leaving capacity unused.
- A scoring strategy that packs workloads can improve utilisation but concentrate failure impact.
- A preference that spreads Pods can improve resilience but increase the number of nodes needed.
- A node pool that looks attractive to a human may be infeasible because of storage, labels, taints or extended resources.

The right objective is not "use every CPU". It is to make the trade-off explicit: availability, cost, latency, resource efficiency, isolation and the ability to scale.

## Design for schedulability, not just for deployment

A few habits make scheduling behaviour easier to reason about:

1. **Right-size requests from observed workloads.** Requests that are dramatically larger than realistic peaks waste schedulable capacity; requests that are too small create contention and eviction risk.
2. **Treat init containers as real capacity consumers.** A short-lived migration or data-copy step can determine whether the whole Pod is placeable.
3. **Prefer soft placement rules when they are genuinely preferences.** Use required affinity and `DoNotSchedule` only when violating the rule is worse than leaving the Pod pending.
4. **Make topology labels reliable.** A missing or inconsistent zone label can change which domains participate in spread calculations.
5. **Understand storage topology before choosing node pools.** A volume can be the constraint even when CPU and memory are abundant.
6. **Monitor queue state and scheduling outcomes.** Pending count alone does not tell you whether Pods are gated, backing off or repeatedly rejected.
7. **Test the intersection of constraints.** A manifest can be valid YAML and still describe an impossible placement.

For a particularly constrained workload, write down the hard requirements as a set:

```text
eligible nodes
  = resource-fit nodes
  ∩ affinity-compatible nodes
  ∩ taint-tolerant nodes
  ∩ topology-valid nodes
  ∩ storage-compatible nodes
  ∩ port-compatible nodes
```

If that intersection is empty, more scoring weight will not help. You need to change a hard constraint, add capacity that satisfies it, or accept a different placement policy.

## The takeaway

Kubernetes does not schedule a Pod onto the node with the lowest CPU graph. It evaluates a candidate set using resource requests and a collection of hard placement constraints, scores the survivors, then coordinates reservation and binding while keeping its own scheduling decisions consistent.

When a Pod is Pending, stop asking only "where is there free CPU?" Ask:

- What effective request is the scheduler accounting for?
- Which filter rejected each candidate?
- Do the Pod's topology, affinity, taints and storage rules have a non-empty intersection?
- Is the Pod actually in the active scheduling queue?
- Has the scheduler selected a node, or is binding/startup still in progress?

That mental model turns "Kubernetes is ignoring free capacity" into a much more precise engineering problem—and usually points directly at the fix.

## Further reading

- [Scheduling Framework](https://kubernetes.io/docs/concepts/scheduling-eviction/scheduling-framework/) — scheduling versus binding cycles and plugin extension points.
- [Scheduler Configuration](https://kubernetes.io/docs/reference/scheduling/config/) — built-in plugins, profiles, filter and score configuration.
- [Resource Management for Pods and Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/) — requests, limits and effective scheduling inputs.
- [Reserve Compute Resources for System Daemons](https://kubernetes.io/docs/tasks/administer-cluster/reserve-compute-resources/) — Node Allocatable and system reservations.
- [Pod Topology Spread Constraints](https://kubernetes.io/docs/concepts/scheduling-eviction/topology-spread-constraints/) — eligible domains, skew and hard versus soft spread.
- [Pod Priority and Preemption](https://kubernetes.io/docs/concepts/scheduling-eviction/pod-priority-preemption/) — victim selection and nominated nodes.
- [Sidecar Containers](https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers/) — effective resource accounting with restartable init sidecars.
- [Kubernetes Metrics Reference](https://kubernetes.io/docs/reference/instrumentation/metrics/) — scheduler queue and scheduling metrics.
- [QueueingHint in Kubernetes v1.32](https://kubernetes.io/blog/2024/12/12/scheduler-queueinghint/) — why unschedulable Pods are requeued selectively.
