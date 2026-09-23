import { NavLink } from 'react-router-dom';
import type { ArticleMeta } from '../articles/types';

type SiteNavigationProps = {
  articles: ArticleMeta[];
  open: boolean;
  onClose: () => void;
};

export function SiteNavigation({ articles, open, onClose }: SiteNavigationProps) {
  return (
    <>
      <nav className={`sidebar ${open ? 'is-open' : ''}`}>
        <div className="sidebar__heading">
          <span>Library</span>
          <span className="sidebar__count">{String(articles.length).padStart(2, '0')}</span>
        </div>

        <ul className="sidebar__list">
          {articles.map((article, index) => (
            <li key={article.slug}>
              <NavLink className="sidebar__link" to={`/articles/${article.slug}`}>
                <span className="sidebar__number">{String(index + 1).padStart(2, '0')}</span>
                <span className="sidebar__copy">
                  <strong>{article.title}</strong>
                  <small>{article.subtitle}</small>
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {open && (
        <button
          className="nav-backdrop"
          aria-label="Close article menu"
          onClick={onClose}
        />
      )}
    </>
  );
}
