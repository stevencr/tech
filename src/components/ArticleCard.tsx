import { NavLink } from 'react-router-dom';
import type { ArticleMeta } from '../articles/types';

type ArticleCardProps = {
  article: ArticleMeta;
  index: number;
};

export function ArticleCard({ article, index }: ArticleCardProps) {
  return (
    <NavLink className="home__card" to={`/articles/${article.slug}`}>
      <span className="home__card-number">
        {String(index + 1).padStart(2, '0')} · {article.category.toUpperCase()}
      </span>
      <h2>{article.title}</h2>
      <p>{article.description}</p>
      <span className="home__card-arrow">Read deep dive →</span>
    </NavLink>
  );
}
