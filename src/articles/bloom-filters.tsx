import { ArticleLayout } from '../components/ArticleLayout';
import { BloomIntro } from './bloom-filters-intro';
import { BloomMath } from './bloom-filters-math';
import { BloomSystems } from './bloom-filters-systems';
import { BloomTradeoffs } from './bloom-filters-tradeoffs';

export const meta = { slug: 'bloom-filters', title: 'Bloom Filters: Trading a Little Uncertainty for a Lot of Speed', subtitle: 'How probabilistic membership tests turn a small amount of uncertainty into a large reduction in work.', category: 'Algorithms', description: 'A deep dive into Bloom filters, false positives, sizing, deletion and system design.', date: '2026-09-29', readingTime: 22, tags: ['Algorithms', 'Data Structures', 'Probabilistic', 'Performance'] };

export function BloomFiltersArticle() {
  return <ArticleLayout meta={meta}><BloomIntro /><BloomMath /><BloomSystems /><BloomTradeoffs /></ArticleLayout>;
}
