import source from '../../articles/usb-serial-communications.html?raw';
import { ArticleLayout } from '../components/ArticleLayout';
import { LegacyArticle } from '../components/LegacyArticle';

export const meta = {
  slug: 'usb-serial',
  title: 'USB Protocols & Serial Communications',
  subtitle: 'Protocols under the cable',
  category: 'Systems',
  description:
    'Enumeration, endpoints, transfer types, CDC, UART, RS-232, RS-485 and the difference between a byte stream and a real protocol.',
};

export function UsbSerialArticle() {
  return (
    <ArticleLayout meta={meta}>
      <LegacyArticle source={source} />
    </ArticleLayout>
  );
}
