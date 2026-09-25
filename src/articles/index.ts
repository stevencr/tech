import { DockerUnderTheHoodArticle, meta as dockerUnderTheHood } from './docker-under-the-hood';
import { AdvancedTypeScriptArticle, meta as advancedTypescript } from './advanced-typescript';
import { UsbSerialArticle, meta as usbSerial } from './usb-serial';
import type { ArticleMeta } from './types';

export const articles: ArticleMeta[] = [
  { ...dockerUnderTheHood, component: DockerUnderTheHoodArticle },
  { ...usbSerial, component: UsbSerialArticle },
  { ...advancedTypescript, component: AdvancedTypeScriptArticle },
];
