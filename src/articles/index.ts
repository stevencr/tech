import { AdvancedTypeScriptArticle, meta as advancedTypescript } from './advanced-typescript';
import { UsbSerialArticle, meta as usbSerial } from './usb-serial';
import { IoUringArticle, meta as ioUring } from './io-uring';
import { CrdtsArticle, meta as crdts } from './crdts';
import type { ArticleMeta } from './types';

export const articles: ArticleMeta[] = [
  { ...crdts, component: CrdtsArticle },
  { ...ioUring, component: IoUringArticle },
  { ...usbSerial, component: UsbSerialArticle },
  { ...advancedTypescript, component: AdvancedTypeScriptArticle },
];
