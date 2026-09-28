import { EbpfVerifierArticle } from './ebpf-verifier';
import { LinuxPageCacheArticle } from './linux-page-cache';
import { meta as ebpfVerifierMeta } from './ebpf-verifier';
import { meta as linuxPageCacheMeta } from './linux-page-cache';

export const articles = [
  { ...ebpfVerifierMeta, component: EbpfVerifierArticle },
  { ...linuxPageCacheMeta, component: LinuxPageCacheArticle },
];
