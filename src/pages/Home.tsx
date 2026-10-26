import { NavLink } from 'react-router-dom';
import type { ArticleMeta } from '../types/ArticleMeta';
import { ArticleCard } from '../components/ArticleCard';

type HomeProps = {
  articles: ArticleMeta[];
  onDelete: (article: ArticleMeta) => void;
  onRestore: () => void;
};

export function Home({ articles, onDelete, onRestore }: HomeProps) {
  const latestArticle = articles[0];

  return (
    <section className="home">
      <div className="home__eyebrow"><span /> Developer journal · Markdown powered</div>
      <h1>How does<br /><em>software</em><br />work?</h1>
      <p className="home__intro">
        Tech Notes is a collection of practical deep dives into the systems, languages,
        protocols and ideas underneath modern software. Articles live as Markdown files,
        with metadata validated automatically during the build.
      </p>
      <div className="home__actions">
        {latestArticle && <NavLink className="home__button" to={'/articles/' + latestArticle.slug}>Read latest article →</NavLink>}
        <a className="home__button home__button--secondary" href="#library">Browse the library</a>
      </div>
      <div id="library" className="home__section-title">Article library</div>
      {articles.length ? (
        <div className="home__cards">
          {articles.map((article, index) => (
            <ArticleCard key={article.slug} article={article} index={index} onDelete={onDelete} />
          ))}
        </div>
      ) : (
        <div className="home__empty">
          <h2>Your library is empty</h2>
          <p>Articles hidden with Delete stay in the repository. Use Restore library to show them again.</p>
          <button className="home__button" type="button" onClick={onRestore}>Restore library</button>
        </div>
      )}
      <p className="home__note">Each article is a Markdown file in <code>content/articles/</code>.</p>
    </section>
  );
}
