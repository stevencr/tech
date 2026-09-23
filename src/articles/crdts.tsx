import { ArticleLayout } from '../components/ArticleLayout';

export const meta = {
  slug: 'crdts',
  title: 'CRDTs: Designing Data That Converges Without a Central Lock',
  subtitle: 'A practical deep dive into conflict-free replicated data types, causality, and the trade-offs behind collaborative software.',
  category: 'Distributed systems',
  description: 'Understand how CRDTs make eventually consistent collaboration predictable by encoding merge rules into the data structure itself.',
};

export function CrdtsArticle() {
  return (
    <ArticleLayout meta={meta}>
      <p>
        Collaborative editors, offline-first mobile apps, replicated caches, and multi-region services all run into the same problem:
        two replicas can accept writes while disconnected, and those writes may later collide. A traditional database solves this with
        a coordination point — a primary, a lock manager, a transaction protocol, or a conflict-resolution service. A CRDT takes a
        different route: it makes the data structure itself mergeable.
      </p>

      <p>
        The promise is strong: if every replica eventually receives the same set of updates, they converge to the same state,
        regardless of delivery order or duplication. The interesting part is not the acronym. It is the design discipline required to
        make convergence mathematically hard to break while still producing behaviour users find intuitive.
      </p>

      <h2>The core idea: merge is a first-class operation</h2>
      <p>
        A replicated data type needs a state space <code>S</code> and a merge function. For state-based CRDTs, the merge function is
        typically required to be associative, commutative, and idempotent:
      </p>

      <ul>
        <li><strong>Associative:</strong> <code>merge(a, merge(b, c)) = merge(merge(a, b), c)</code></li>
        <li><strong>Commutative:</strong> <code>merge(a, b) = merge(b, a)</code></li>
        <li><strong>Idempotent:</strong> <code>merge(a, a) = a</code></li>
      </ul>

      <p>
        Those three properties eliminate a large class of distributed-systems bugs. Messages can be delayed, duplicated, retried, or
        reordered without changing the final result. In practice, the implementation often forms a join-semilattice: each state moves
        monotonically upward in a partial order, and merge computes the least upper bound.
      </p>

      <h2>Two families of CRDT</h2>
      <h3>State-based (CvRDT)</h3>
      <p>
        Each replica periodically ships its full state, or a delta that is safe to merge. The receiver applies a pure merge function.
        This is simple and robust, but the payload can grow unless you add compaction or delta propagation.
      </p>

      <h3>Operation-based (CmRDT)</h3>
      <p>
        Replicas broadcast operations such as <code>add(id)</code> or <code>remove(id)</code>. Operations must be delivered reliably,
        or accompanied by enough causal metadata to make them safe. Payloads are smaller, but the transport and replay contract is
        stricter.
      </p>

      <h2>A grow-only set, then a real set</h2>
      <p>
        The easiest CRDT is a grow-only set. Each replica stores a set of unique identifiers; merge is set union. It converges perfectly,
        but it cannot delete anything.
      </p>

      <pre>
        <code>{`type GSet = Set<string>;

function mergeGSet(a: GSet, b: GSet): GSet {
  return new Set([...a, ...b]);
}`}</code>
      </pre>

      <p>
        Deletion requires remembering more than the current value. An observed-remove set (OR-Set) gives every add a unique tag. A remove
        records which add-tags it observed. The element is visible when at least one add-tag survives.
      </p>

      <pre>
        <code>{`type Tag = string;

type ORSet = {
  adds: Map<string, Set<Tag>>;
  removes: Set<Tag>;
};

function values(state: ORSet): string[] {
  return [...state.adds.entries()]
    .filter(([, tags]) => [...tags].some((tag) => !state.removes.has(tag)))
    .map(([value]) => value);
}`}</code>
      </pre>

      <p>
        The subtle point is that “remove” does not mean “delete the value everywhere”. It means “remove the add operations I have seen”.
        If another replica concurrently adds the same logical item with a new tag, that add remains visible. This is usually the least
        surprising behaviour for offline collaboration.
      </p>

      <h2>Ordering is harder than sets</h2>
      <p>
        Lists expose the part of distributed systems that CRDT marketing often hides: users care about order, not just membership. A
        replicated sequence needs stable element identities, insertion positions, and a deterministic tie-break rule for concurrent inserts.
        Modern sequence CRDTs typically represent a list as a tree or a linked structure of immutable element IDs rather than a plain
        array index.
      </p>

      <p>
        Consider two users inserting after the same character. Both inserts need to survive, and every replica needs to choose the same
        order without a round trip. A common strategy is to compare a path plus a replica ID, producing a total order for concurrent
        siblings. The price is metadata: a single character can carry more identity and causal information than its visible payload.
      </p>

      <h2>Causality: why timestamps are not enough</h2>
      <p>
        Wall-clock timestamps answer “what time did a machine think it was?” They do not reliably answer “did operation B observe
        operation A?” CRDTs that need causal reasoning use logical clocks, such as Lamport clocks or version vectors.
      </p>

      <pre>
        <code>{`type VersionVector = Record<string, number>;

function happenedBefore(a: VersionVector, b: VersionVector): boolean {
  const actors = new Set([...Object.keys(a), ...Object.keys(b)]);
  let strictlyLess = false;

  for (const actor of actors) {
    const left = a[actor] ?? 0;
    const right = b[actor] ?? 0;
    if (left > right) return false;
    if (left < right) strictlyLess = true;
  }

  return strictlyLess;
}`}</code>
      </pre>

      <p>
        Version vectors let you distinguish “B follows A” from “A and B are concurrent”. That distinction drives policies such as
        last-write-wins, multi-value registers, or explicit conflict markers.
      </p>

      <h2>Where CRDTs fit in an architecture</h2>
      <p>
        A CRDT is not a replacement for every database. It is a useful boundary for state that must accept writes independently. A common
        architecture looks like this:
      </p>

      <ol>
        <li>The UI updates a local CRDT immediately, so the interface stays responsive offline.</li>
        <li>Changes are persisted to an append-only local log or durable outbox.</li>
        <li>A sync layer exchanges operations or state summaries with peers or a server.</li>
        <li>The server stores a canonical merged representation and forwards missing changes.</li>
        <li>Compaction periodically removes tombstones and old causal metadata once safe.</li>
      </ol>

      <p>
        The server can still enforce authorization, quotas, and business invariants. CRDT convergence does not magically make a payment,
        inventory decrement, or permission change safe. Those domains usually need a coordinating transaction or a server-side escrow rule.
      </p>

      <h2>Common misconceptions and sharp edges</h2>
      <ul>
        <li><strong>“Eventually consistent” means “eventually correct”.</strong> A converged state can still encode a bad business decision.</li>
        <li><strong>CRDTs are metadata-free.</strong> Causality, tombstones, and stable IDs are the cost of decentralised writes.</li>
        <li><strong>Last-write-wins is a CRDT strategy.</strong> It is a merge policy, but it can silently discard user intent.</li>
        <li><strong>Deletes are free.</strong> Most delete semantics require tombstones or observed-remove metadata until all replicas catch up.</li>
        <li><strong>Any operation sequence is safe.</strong> If you break associativity, commutativity, or idempotence, retries and reordering become bugs.</li>
      </ul>

      <h2>A small experiment</h2>
      <p>
        Build two replicas of an OR-Set in a test. Generate random add/remove operations on both replicas, shuffle and duplicate the
        message stream, then merge until quiescence. Assert that both replicas produce the same visible values. This is a powerful form
        of property-based testing because it explores the schedules humans rarely write by hand.
      </p>

      <pre>
        <code>{`// Pseudocode for a convergence property
for (const seed of seeds) {
  const left = runReplica(seed, 'A');
  const right = runReplica(seed, 'B');
  const messages = shuffle([...left.outbox, ...right.outbox]);

  deliverWithDuplicates(left, messages);
  deliverWithDuplicates(right, messages);

  expect(snapshot(left.state)).toEqual(snapshot(right.state));
}`}</code>
      </pre>

      <div className="article__callout">
        <strong>Takeaway:</strong> CRDTs work by moving conflict resolution into the data model. The real engineering challenge is choosing
        semantics users can understand, containing metadata growth, and keeping business invariants outside the part of the system that is
        intentionally allowed to merge without coordination.
      </div>
    </ArticleLayout>
  );
}
