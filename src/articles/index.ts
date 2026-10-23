import { MvccSnapshotIsolationArticle } from './mvcc-snapshot-isolation';
import { meta as mvccSnapshotIsolationMeta } from './mvcc-snapshot-isolation';
import { CgroupV2ResourcePressureArticle } from './cgroup-v2-resource-pressure';
import { meta as cgroupV2ResourcePressureMeta } from './cgroup-v2-resource-pressure';

export const articles = [
  { ...cgroupV2ResourcePressureMeta, component: CgroupV2ResourcePressureArticle },
  { ...mvccSnapshotIsolationMeta, component: MvccSnapshotIsolationArticle },
];
