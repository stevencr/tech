import { NavLink } from 'react-router-dom';
import type { ArticleMeta } from '../articles/types';

type SiteNavigationProps = {
  articles: ArticleMeta[];
  open: boolean;
  onClose: () => void;
  onDelete: (article: ArticleMeta) => void;
};

export function SiteNavigation({ articles, open, onClose, onDelete }: SiteNavigationProps) {
  return (
    <>
      <nav className={'sidebar ' + (open ? 'is-open' : '')} aria-label="Article library">
        <div className="sidebar__heading">
          <span>Library</span>
          <span className="sidebar__count">{String(articles.length).padStart(2, '0')}</span>
        </div>
        {articles.length === 0 ? (
          <p className="sidebar__empty">No articles in this browser's library.</p>
        ) : (
          <ul className="sidebar__list">
            {articles.map((article, index) => (
              <li className="sidebar__item" key={article.slug}>
                <NavLink className="sidebar__link" to={'/articles/' + article.slug}>
                  <span className="sidebar__number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="sidebar__copy">
                    <strong>{article.title}</strong>
                    <small>{article.subtitle}</small>
                  </span>
                </NavLink>
                <button className="sidebar__delete" type="button"
                  onClick={() => onDelete(article)} aria-label={'Delete ' + article.title}
                  title="Remove article from this browser's library">×</button>
              </li>
            ))}
          </ul>
        )}
      </nav>
      {open && <button className="nav-backdrop" aria-label="Close article menu" onClick={onClose} />}
    </>
  );
}
