import { EbpfArticle, meta as ebpf } from './ebpf';
import { AdvancedTypeScriptArticle, meta as advancedTypescript } from './advanced-typescript';
import { UsbSerialArticle, meta as usbSerial } from './usb-serial';
import type { ArticleMeta } from './types';

export const articles: ArticleMeta[] = [
  { ...ebpf, component: EbpfArticle },
  { ...usbSerial, component: UsbSerialArticle },
  { ...advancedTypescript, component: AdvancedTypeScriptArticle },
];
