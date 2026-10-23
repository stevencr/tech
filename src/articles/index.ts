import { MvccSnapshotIsolationArticle } from './mvcc-snapshot-isolation';
import { meta as mvccSnapshotIsolationMeta } from './mvcc-snapshot-isolation';

export const articles = [
  { ...mvccSnapshotIsolationMeta, component: MvccSnapshotIsolationArticle },
];
