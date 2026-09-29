import { Tls13HandshakeArticle } from './tls-13-handshake';
import { meta as tls13HandshakeMeta } from './tls-13-handshake';
import { EbpfVerifierArticle } from './ebpf-verifier';
import { LinuxPageCacheArticle } from './linux-page-cache';
import { UnixPipelinesArticle } from './unix-pipelines';
import { TcpListenBacklogArticle } from './tcp-listen-backlog';
import { meta as ebpfVerifierMeta } from './ebpf-verifier';
import { meta as linuxPageCacheMeta } from './linux-page-cache';
import { meta as unixPipelinesMeta } from './unix-pipelines';
import { meta as tcpListenBacklogMeta } from './tcp-listen-backlog';

export const articles = [
  { ...tcpListenBacklogMeta, component: TcpListenBacklogArticle },
  { ...tls13HandshakeMeta, component: Tls13HandshakeArticle },
  { ...unixPipelinesMeta, component: UnixPipelinesArticle },
  { ...ebpfVerifierMeta, component: EbpfVerifierArticle },
  { ...linuxPageCacheMeta, component: LinuxPageCacheArticle },
];
