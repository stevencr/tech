import { Tls13HandshakeArticle } from './tls-13-handshake';
import { meta as tls13HandshakeMeta } from './tls-13-handshake';
import { LinuxPageCacheArticle } from './linux-page-cache';
import { UnixPipelinesArticle } from './unix-pipelines';
import { TcpListenBacklogArticle } from './tcp-listen-backlog';
import { meta as linuxPageCacheMeta } from './linux-page-cache';
import { meta as unixPipelinesMeta } from './unix-pipelines';
import { meta as tcpListenBacklogMeta } from './tcp-listen-backlog';
import { V8HiddenClassesInlineCachesArticle } from './v8-hidden-classes-inline-caches';
import { meta as v8HiddenClassesInlineCachesMeta } from './v8-hidden-classes-inline-caches';

export const articles = [
  { ...tcpListenBacklogMeta, component: TcpListenBacklogArticle },
  { ...tls13HandshakeMeta, component: Tls13HandshakeArticle },
  { ...unixPipelinesMeta, component: UnixPipelinesArticle },
  { ...linuxPageCacheMeta, component: LinuxPageCacheArticle },
  { ...v8HiddenClassesInlineCachesMeta, component: V8HiddenClassesInlineCachesArticle },
];
