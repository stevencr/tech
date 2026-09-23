import { AdvancedTypeScriptArticle, meta as advancedTypescript } from './advanced-typescript';
import { UsbSerialArticle, meta as usbSerial } from './usb-serial';
import { IoUringArticle, meta as ioUring } from './io-uring';
import type { ArticleMeta } from './types';

export const articles: ArticleMeta[] = [
  { ...ioUring, component: IoUringArticle },
  { ...usbSerial, component: UsbSerialArticle },
  { ...advancedTypescript, component: AdvancedTypeScriptArticle },
];
