import { ArticleLayout } from '../components/ArticleLayout';
import { ArticleSection } from '../components/article/ArticleSection';
import { ArticleCallout } from '../components/article/ArticleCallout';
import { ArticleDiagram } from '../components/article/ArticleDiagram';

export const meta = {
  slug: 'raft-consensus',
  title: 'Raft: How Distributed Systems Agree',
  subtitle: 'Leader election, replicated logs and the machinery behind consistent state',
  category: 'Distributed Systems',
  description: 'How Raft turns unreliable machines and networks into a replicated state machine using terms, elections, logs and commit rules.',
  date: '2026-09-30',
  readingTime: 22,
  tags: ['Distributed Systems', 'Raft', 'Consensus', 'Replication', 'Architecture'],
};

export function RaftConsensusArticle() {
  return <ArticleLayout meta={meta}>
    <ArticleSection title="Consensus is not just replication">
      <p>Replicating data is easy when every machine is healthy and messages arrive in order. The difficult case is disagreement: machines can crash, networks can delay or duplicate messages, and different nodes can temporarily believe different things.</p>
      <ArticleCallout>Raft's central trick is to make replicated state look like a single ordered log. Once a command is safely committed, every healthy replica can apply it in the same order.</ArticleCallout>
    </ArticleSection>

    <ArticleSection title="The basic architecture">
      <ArticleDiagram items={[
        { title: 'Client', description: 'Submits a command' },
        { title: 'Leader', description: 'Appends the command to its log' },
        { title: 'Followers', description: 'Replicate the log entry' },
        { title: 'Majority', description: 'Acknowledges enough replicas' },
        { title: 'State machine', description: 'Applies committed commands' },
      ]} />
      <p>At any moment a Raft group has a leader, followers and possibly candidates during an election. Clients normally talk to the leader because the leader owns the ordering decision.</p>
    </ArticleSection>

    <ArticleSection title="Terms create logical time">
      <p>Raft divides leadership into terms. A term is a monotonically increasing logical era. Nodes include their current term in protocol messages, allowing a node that discovers a newer term to recognise that its own information is stale.</p>
      <p>This is not wall-clock time. It is a version number for authority. That makes it robust against clock skew and machine pauses.</p>
    </ArticleSection>

    <ArticleSection title="Leader election">
      <p>Followers expect periodic heartbeats. If a follower stops hearing from a leader, it becomes a candidate, increments its term and asks other nodes for votes. A leader needs a majority, so two different candidates cannot both obtain a majority in the same term.</p>
      <p>Randomised election timeouts reduce the probability that every follower starts an election simultaneously. Randomness here is not about correctness; it reduces contention while the majority rule provides the safety property.</p>
    </ArticleSection>

    <ArticleSection title="The replicated log">
      <p>The leader appends client commands to its log and replicates those entries. Each entry contains a term as well as the command. Followers reject inconsistent histories, allowing the leader to backtrack until the logs share a common prefix.</p>
      <p>The result is a powerful invariant: committed entries form a prefix that cannot be replaced by a different history.</p>
    </ArticleSection>

    <ArticleSection title="Why majority matters">
      <p>A three-node cluster can tolerate one failed node because two nodes form a majority. A five-node cluster can tolerate two. The key is quorum intersection: any two majorities overlap in at least one node.</p>
      <p>That overlap is the mathematical reason committed information cannot simply disappear when leadership changes.</p>
    </ArticleSection>

    <ArticleSection title="Commitment is subtle">
      <p>An entry being present on several nodes is not identical to the entry being committed. Raft uses rules involving the leader's current term and replicated indexes to determine when an entry is safely committed. This distinction prevents a leader from incorrectly treating an old, partially replicated history as authoritative.</p>
    </ArticleSection>

    <ArticleSection title="From log to state machine">
      <p>The replicated log is not usually the application's final data structure. Instead, each committed command is applied to a deterministic state machine. If every replica starts from the same state and applies the same commands in the same order, they converge to the same result.</p>
      <p>This separation is one reason consensus algorithms are reusable: the consensus layer orders commands while the application defines their meaning.</p>
    </ArticleSection>

    <ArticleSection title="Failures are part of the design">
      <p>A slow node is different from a dead node. A partition is different from packet loss. A restarted node may have durable log entries but be missing newer ones. Raft's protocol is designed around these partial failures rather than treating them as exceptional branches.</p>
      <ArticleCallout>Distributed-system correctness often comes from making stale information detectable rather than trying to prevent stale information from existing.</ArticleCallout>
    </ArticleSection>

    <ArticleSection title="Snapshots and log growth">
      <p>A log that grows forever is impractical. Systems using Raft periodically snapshot application state and discard log entries that are no longer needed for recovery. A new or far-behind replica can then receive a snapshot instead of replaying the entire history.</p>
    </ArticleSection>

    <ArticleSection title="What this changes in application design">
      <p>Consensus introduces latency because durable agreement requires communication. It also creates operational realities: leadership changes, quorum loss, membership changes, backpressure and recovery all become part of the system's behaviour.</p>
      <p>The practical lesson is to treat a consensus-backed service as a distributed state machine, not as a magical strongly consistent database endpoint.</p>
    </ArticleSection>
  </ArticleLayout>;
}
