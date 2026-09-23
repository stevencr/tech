import source from '../../articles/advanced-typescript.html?raw';
import { ArticleLayout } from '../components/ArticleLayout';
import { LegacyArticle } from '../components/LegacyArticle';

export const meta = {
  slug: 'advanced-typescript',
  title: 'Advanced TypeScript',
  subtitle: 'The type system under the hood',
  category: 'TypeScript',
  description:
    'Conditional types, infer, distributive unions, mapped types, variance, branded types and type-level programming.',
};

export function AdvancedTypeScriptArticle() {
  return (
    <ArticleLayout meta={meta}>
      <LegacyArticle source={source} />
    </ArticleLayout>
  );
}
