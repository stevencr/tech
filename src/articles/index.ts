import { Tls13HandshakeArticle } from './tls-13-handshake';
import { meta as tls13HandshakeMeta } from './tls-13-handshake';
import { LinuxFutexesArticle } from './linux-futexes';
import { meta as linuxFutexesMeta } from './linux-futexes';
import { LinuxPidfdsArticle } from './linux-pidfds';
import { meta as linuxPidfdsMeta } from './linux-pidfds';
import { LinuxPageCacheArticle } from './linux-page-cache';
import { UnixPipelinesArticle } from './unix-pipelines';
import { TcpListenBacklogArticle } from './tcp-listen-backlog';
import { meta as linuxPageCacheMeta } from './linux-page-cache';
import { meta as unixPipelinesMeta } from './unix-pipelines';
import { meta as tcpListenBacklogMeta } from './tcp-listen-backlog';
import { V8HiddenClassesInlineCachesArticle } from './v8-hidden-classes-inline-caches';
import { meta as v8HiddenClassesInlineCachesMeta } from './v8-hidden-classes-inline-caches';
import { KubernetesSchedulerUnderTheHoodArticle } from './kubernetes-scheduler-under-the-hood';
import { meta as kubernetesSchedulerUnderTheHoodMeta } from './kubernetes-scheduler-under-the-hood';
import { PtyTerminalsArticle } from './pty-terminals';
import { meta as ptyTerminalsMeta } from './pty-terminals';
import { ContainerStartupUnderTheHoodArticle } from './container-startup-under-the-hood';
import { meta as containerStartupUnderTheHoodMeta } from './container-startup-under-the-hood';

export const articles = [
  { ...linuxFutexesMeta, component: LinuxFutexesArticle },
  { ...linuxPidfdsMeta, component: LinuxPidfdsArticle },
  { ...kubernetesSchedulerUnderTheHoodMeta, component: KubernetesSchedulerUnderTheHoodArticle },
  { ...ptyTerminalsMeta, component: PtyTerminalsArticle },
  { ...tcpListenBacklogMeta, component: TcpListenBacklogArticle },
  { ...tls13HandshakeMeta, component: Tls13HandshakeArticle },
  { ...unixPipelinesMeta, component: UnixPipelinesArticle },
  { ...linuxPageCacheMeta, component: LinuxPageCacheArticle },
  { ...v8HiddenClassesInlineCachesMeta, component: V8HiddenClassesInlineCachesArticle },
  { ...containerStartupUnderTheHoodMeta, component: ContainerStartupUnderTheHoodArticle },
];