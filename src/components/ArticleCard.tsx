import { NavLink } from 'react-router-dom';
import type { ArticleMeta } from '../types/ArticleMeta';

type ArticleCardProps = {
  article: ArticleMeta;
  index: number;
  onDelete: (article: ArticleMeta) => void;
};

export function ArticleCard({ article, index, onDelete }: ArticleCardProps) {
  return (
    <article className="home__card">
      <NavLink className="home__card-link" to={'/articles/' + article.slug}>
        <span className="home__card-number">
          {String(index + 1).padStart(2, '0')} · {article.category.toUpperCase()}
        </span>
        <h2>{article.title}</h2>
        <p>{article.description}</p>
        <span className="home__card-arrow">Read deep dive →</span>
      </NavLink>
      <button className="delete-button delete-button--card" type="button"
        onClick={() => onDelete(article)} aria-label={'Delete ' + article.title}>
        Delete
      </button>
    </article>
  );
}
