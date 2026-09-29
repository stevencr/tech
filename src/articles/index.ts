import { EbpfVerifierArticle } from './ebpf-verifier';
import { LinuxPageCacheArticle } from './linux-page-cache';
import { UnixPipelinesArticle } from './unix-pipelines';
import { meta as ebpfVerifierMeta } from './ebpf-verifier';
import { meta as linuxPageCacheMeta } from './linux-page-cache';
import { meta as unixPipelinesMeta } from './unix-pipelines';

export const articles = [
  { ...unixPipelinesMeta, component: UnixPipelinesArticle },
  { ...ebpfVerifierMeta, component: EbpfVerifierArticle },
  { ...linuxPageCacheMeta, component: LinuxPageCacheArticle },
];
