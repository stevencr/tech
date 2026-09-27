import { CopyOnWriteArticle, meta as copyOnWrite } from './copy-on-write';
import { CpuBranchPredictionArticle, meta as cpuBranchPrediction } from './cpu-branch-prediction';
import { EbpfVerifierJitArticle, meta as ebpfVerifierJit } from './ebpf-verifier-jit';
import { LsmTreesCompactionArticle, meta as lsmTreesCompaction } from './lsm-trees-compaction';
import { RaftConsensusArticle, meta as raftConsensus } from './raft-consensus';

export const articles = [
  { ...lsmTreesCompaction, component: LsmTreesCompactionArticle },
  { ...ebpfVerifierJit, component: EbpfVerifierJitArticle },
  { ...raftConsensus, component: RaftConsensusArticle },
  { ...cpuBranchPrediction, component: CpuBranchPredictionArticle },
  { ...copyOnWrite, component: CopyOnWriteArticle },
];
