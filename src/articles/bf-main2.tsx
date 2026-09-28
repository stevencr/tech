import { ArticleLayout } from '../components/ArticleLayout';
import { BfMath } from './bf-math';
export const meta = { slug: 'bloom-filters-deep-dive-2', title: 'Bloom Filters: Trading a Little Uncertainty for a Lot of Speed', subtitle: 'A deep dive into probabilistic membership tests.', category: 'Algorithms', description: 'Probabilistic membership tests.', date: '2026-09-29', readingTime: 20, tags: ['Algorithms'] };
export function BfMain2() { return <ArticleLayout meta={meta}><BfMath /></ArticleLayout>; }
