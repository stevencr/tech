import { MvccSnapshotIsolationArticle } from './mvcc-snapshot-isolation';
import { meta as mvccSnapshotIsolationMeta } from './mvcc-snapshot-isolation';
import { CgroupV2ResourcePressureArticle } from './cgroup-v2-resource-pressure';
import { meta as cgroupV2ResourcePressureMeta } from './cgroup-v2-resource-pressure';
import { CancellationIsAProtocolArticle } from './cancellation-is-a-protocol';
import { meta as cancellationIsAProtocolMeta } from './cancellation-is-a-protocol';

export const articles = [
  { ...cancellationIsAProtocolMeta, component: CancellationIsAProtocolArticle },
  { ...cgroupV2ResourcePressureMeta, component: CgroupV2ResourcePressureArticle },
  { ...mvccSnapshotIsolationMeta, component: MvccSnapshotIsolationArticle },
];
