import { KubernetesSchedulerArticle, meta as kubernetesScheduler } from './kubernetes-scheduler';
import { DockerBuildKitArticle, meta as dockerBuildKit } from './docker-buildkit';
import { NodeEventLoopArticle, meta as nodeEventLoop } from './node-event-loop';
import { V8HiddenClassesArticle, meta as v8HiddenClasses } from './v8-hidden-classes';
import { TerminalTtyPtyArticle, meta as terminalTtyPty } from './terminal-tty-pty';
import { GitObjectDatabaseArticle, meta as gitObjectDatabase } from './git-object-database';
import { Http3QuicArticle, meta as http3Quic } from './http3-quic';
import { PostgresMvccArticle, meta as postgresMvcc } from './postgres-mvcc';
import { TypescriptCompilerArticle, meta as typescriptCompiler } from './typescript-compiler';
import { BashExpansionArticle, meta as bashExpansion } from './bash-expansion';
import { DockerUnderTheHoodArticle, meta as dockerUnderTheHood } from './docker-under-the-hood';
import { AdvancedTypeScriptArticle, meta as advancedTypescript } from './advanced-typescript';
import { UsbSerialArticle, meta as usbSerial } from './usb-serial';
import { LinuxPageCacheArticle, meta as linuxPageCache } from './linux-page-cache';
import { PostgresWalArticle, meta as postgresWal } from './postgres-wal';
import { BrowserRenderingPipelineArticle, meta as browserRenderingPipeline } from './browser-rendering-pipeline';
import { JavascriptGarbageCollectionArticle, meta as javascriptGarbageCollection } from './javascript-garbage-collection';
import { RedisInternalsArticle, meta as redisInternals } from './redis-internals';
import { DnsResolutionArticle, meta as dnsResolution } from './dns-resolution';
import { ReactReconciliationArticle, meta as reactReconciliation } from './react-reconciliation';
import { ConsistentHashingArticle, meta as consistentHashing } from './consistent-hashing';
import { TlsHandshakeArticle, meta as tlsHandshake } from './tls-handshake';
import { WasiWebAssemblyArticle, meta as wasiWebAssembly } from './wasi-webassembly';
import type { ArticleMeta } from './types';

export const articles: ArticleMeta[] = [
  { ...kubernetesScheduler, component: KubernetesSchedulerArticle },
  { ...dockerBuildKit, component: DockerBuildKitArticle },
  { ...nodeEventLoop, component: NodeEventLoopArticle },
  { ...v8HiddenClasses, component: V8HiddenClassesArticle },
  { ...terminalTtyPty, component: TerminalTtyPtyArticle },
  { ...gitObjectDatabase, component: GitObjectDatabaseArticle },
  { ...http3Quic, component: Http3QuicArticle },
  { ...postgresMvcc, component: PostgresMvccArticle },
  { ...typescriptCompiler, component: TypescriptCompilerArticle },
  { ...bashExpansion, component: BashExpansionArticle },
  { ...dockerUnderTheHood, component: DockerUnderTheHoodArticle },
  { ...usbSerial, component: UsbSerialArticle },
  { ...advancedTypescript, component: AdvancedTypeScriptArticle },
  { ...linuxPageCache, component: LinuxPageCacheArticle },
  { ...postgresWal, component: PostgresWalArticle },
  { ...browserRenderingPipeline, component: BrowserRenderingPipelineArticle },
  { ...javascriptGarbageCollection, component: JavascriptGarbageCollectionArticle },
  { ...redisInternals, component: RedisInternalsArticle },
  { ...dnsResolution, component: DnsResolutionArticle },
  { ...reactReconciliation, component: ReactReconciliationArticle },
  { ...consistentHashing, component: ConsistentHashingArticle },
  { ...tlsHandshake, component: TlsHandshakeArticle },
  { ...wasiWebAssembly, component: WasiWebAssemblyArticle },
];