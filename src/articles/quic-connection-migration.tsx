import { ArticleLayout } from '../components/ArticleLayout';

export const meta = { slug: 'quic-connection-migration', title: 'QUIC Connection Migration: How a Connection Survives Changing Networks', subtitle: 'How connection IDs and path validation let a live transport move between networks.', category: 'Networking', description: 'A deep dive into QUIC connection migration.', date: '2026-09-29', readingTime: 22, tags: ['Networking', 'QUIC', 'HTTP/3', 'UDP'] };

export function QuicConnectionMigrationArticle() { return <ArticleLayout meta={meta}><p>QUIC separates transport identity from network addressing.</p><h2>Under the hood</h2><p>Connection IDs allow an established connection to survive address changes.</p></ArticleLayout>; }
