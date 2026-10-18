export function AbaMechanismsSection() {
  return (
    <div>
      <h2>A Treiber stack, and a stale assumption</h2>
      <p>A classic Treiber stack has one atomic head reference. Every node points to the next node. A push tries to install a prepared node as the head; a pop reads the head and its successor, then tries to advance the head.</p>
      <p>Suppose the stack begins with A at the head and B next. Thread 1 reads A and saves B, then gets descheduled. Thread 2 removes A and B, then puts A back with a different successor. The head is A again, but the structure is not the one Thread 1 observed. Its stale update from A to saved B can now install an obsolete link.</p>
      <p>ABA does not require releasing storage: removing and reinserting the same node can be enough. Reusing the address of an old node adds a lifetime hazard. Pointer equality is not proof that nothing relevant happened in between.</p>
      <h2>CAS sees a snapshot, not a history</h2>
      <p>Compare-and-swap compares the current representation with the expected representation. It does not remember intermediate values. If a location moves from A to C and then back to A, a later comparison against A can succeed. It proves only that the shared location had the expected value at that instant—not that the node's fields stayed stable or that the object is still safe to access.</p>
      <h2>Unlinking is not reclamation</h2>
      <ul><li><strong>Logical removal:</strong> the node is no longer reachable through public links.</li><li><strong>Physical reclamation:</strong> the object can be destroyed and its storage reused because no thread can still access it.</li></ul>
      <p>A pop can remove a node while another thread still holds a reference obtained earlier. Releasing storage immediately is unsafe unless a separate lifetime protocol proves no reader can still use the object.</p>
      <div className="article__callout"><strong>Two proofs are needed:</strong> state validation prevents stale updates from corrupting the structure; lifetime safety prevents access to reclaimed memory. Solving ABA alone does not solve both problems.</div>
    </div>
  );
}
